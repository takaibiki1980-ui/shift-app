/**
 * 学習ON vs OFF 比較シミュレーション
 * 診断ログから得た実際のworkTot分布を使用
 * 検証項目:
 *   Q1. 生成シフトが学習パターンに合致するか（sync rate代替）
 *   Q2. 品質指標（不足/違反 → 手修正量の代替）
 *   Q3. 曜日固定化（特定職員の休み曜日エントロピー）
 */

import { autoGenerate } from './src/shiftEngine.js';

const YEAR = 2026, MONTH = 5; // 6月 (0始まり)
const DAYS = new Date(YEAR, MONTH + 1, 0).getDate();
const N_RUNS = 50;
const REST_SET = new Set(['休み', '希望休', '有休']);
const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

// ── スタッフ定義（実データに基づく8名）─────────────────────────
function makeS(id, name, role, nightOk, opts = {}) {
  return {
    id, name, dept: 'kaigo1', role, nightOk,
    nightMax: opts.nightMax ?? (nightOk ? 8 : 0),
    kyukoDays: 9,
    facilityYears: null, floorYears: null,
    foreignNightSupportRequired: opts.foreign ?? false,
    kiboByMonth: {}, yukyuByMonth: {},
    shiftRequestsByMonth: {}, kyukoDaysByMonth: {},
    kiboNightPreference: 0,
  };
}

const staffList = [
  makeS('s1', '柳 瑛理子',        '介護福祉士', true),
  makeS('s2', '村山 潤哉',        '介護福祉士', true),
  makeS('s3', 'ケイ・ミ・ソー',   '特定技能',   true,  { nightMax: 5, foreign: true }),
  makeS('s4', 'ㇲミャッノーエイン','特定技能',   true,  { nightMax: 5, foreign: true }),
  makeS('s5', '宇賀神 弓',        '介護福祉士', true),
  makeS('s6', 'ケイシーサパナ',   '特定技能',   true,  { nightMax: 5, foreign: true }),
  makeS('s7', '山田 A',           '介護職員',   false),
  makeS('s8', '田中 B',           '介護職員',   false),
];

const dept = {
  id: 'kaigo1',
  shiftTypes: ['早番', '日勤', '遅番', '夜勤'],
  minStaff: { 早番: 1, 日勤: 1, 遅番: 1, 夜勤: 1 },
  maxStaff: { 早番: 1, 遅番: 1, 夜勤: 1 },
  maxConsecutive: 5,
  customShiftDefs: [],
  intervalThreshold: null,
  roleShiftTypes: {},
};

// ── 学習トレンド構築 ──────────────────────────────────────────────
// 診断ログの workTot (diag順: 月=0,...,日=6)
const diagWorkTot = {
  '柳 瑛理子':          [11, 21, 19, 19, 17, 24, 19],
  '村山 潤哉':          [24, 24, 15, 16, 10, 13, 25],
  'ケイ・ミ・ソー':     [24, 26, 13, 19, 18, 23, 14],
  'ㇲミャッノーエイン': [32, 32, 21, 15, 16, 18,  3], // ★日曜workTot=3
  '宇賀神 弓':          [28, 15, 30, 18, 20, 35, 24],
  'ケイシーサパナ':     [17, 37, 23, 20, 31,  6, 36], // ★土曜workTot=6
  '山田 A':             [15, 15, 15, 15, 15, 15, 15],
  '田中 B':             [15, 15, 15, 15, 15, 15, 15],
};
const BASE_TOT = 35;

// dowShiftRate[jsDoW]: workTotから早番/日勤/遅番/夜勤の比率を推定
function buildShiftRate(workTotForDiag) {
  const n = workTotForDiag / 37;
  const niku = 0.4 + n * 0.4;
  const rem  = 1 - niku;
  return { 日勤: niku, 早番: rem * 0.35, 遅番: rem * 0.35, 夜勤: rem * 0.30 };
}

// dowRestRate[diagI]: workTotが少ない→休み率高め
function buildRestRate(workTotForDiag) {
  const restFrac = 1 - (workTotForDiag / BASE_TOT);
  return Math.max(0.05, Math.min(0.70, 0.30 + restFrac * 0.4));
}

function buildTrend(name) {
  const wt = diagWorkTot[name];
  // dowShiftRate: JS DOW (0=日...6=土) → diagI = (jsD - 1 + 7) % 7
  const dowShiftRate = Array.from({ length: 7 }, (_, jsD) => {
    const diagI = ((jsD - 1) + 7) % 7;
    return buildShiftRate(wt[diagI]);
  });
  // dowRestRate: diagI (月=0,...,日=6)
  const dowRestRate = wt.map(buildRestRate);
  return { 日勤: 0.55, 早番: 0.16, 遅番: 0.16, 夜勤: 0.13, dowShiftRate, dowRestRate, transitionRate: {} };
}

const learnedTrendON = {};
for (const s of staffList) learnedTrendON[s.name] = buildTrend(s.name);

// ── Q3補助: DOWエントロピー計算 ────────────────────────────────────
function entropy(arr) {
  const total = arr.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return -arr.reduce((sum, c) => {
    if (c === 0) return sum;
    const p = c / total;
    return sum + p * Math.log2(p);
  }, 0);
}

// ── 生成 & 集計バッチ ──────────────────────────────────────────────
function runBatch(trend, label) {
  // Q3: 各スタッフの各DOWに何回休んだか
  const dowRestCounts = {};
  for (const s of staffList) dowRestCounts[s.id] = Array(7).fill(0);

  // Q2集計
  let totalShortage = 0, totalKyukoViol = 0, totalConsecViol = 0;

  // Q1: trend ONのみ: 各日で最多予測シフトと一致したカウント
  let q1Match = 0, q1Total = 0;

  for (let run = 0; run < N_RUNS; run++) {
    const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, trend);

    for (const s of staffList) {
      const sch = shifts[s.id] || {};

      // Q3: 休み曜日集計
      for (let d = 1; d <= DAYS; d++) {
        const v = sch[d];
        if (v && REST_SET.has(v)) {
          const jsD = new Date(YEAR, MONTH, d).getDay();
          dowRestCounts[s.id][jsD]++;
        }
      }

      // Q2: 公休日数違反
      const actualRest = Object.values(sch).filter(v => v && REST_SET.has(v)).length;
      if (Math.abs(actualRest - s.kyukoDays) > 2) totalKyukoViol++;

      // Q2: 連続勤務違反
      let consec = 0, maxC = 0;
      for (let d = 1; d <= DAYS; d++) {
        const v = sch[d];
        if (!v || REST_SET.has(v)) { maxC = Math.max(maxC, consec); consec = 0; }
        else consec++;
      }
      if (Math.max(maxC, consec) > dept.maxConsecutive) totalConsecViol++;

      // Q1: シフト合致率 (trend ONのみ)
      if (Object.keys(trend).length > 0) {
        const tr = trend[s.name];
        if (tr?.dowShiftRate) {
          for (let d = 1; d <= DAYS; d++) {
            const v = sch[d];
            if (!v || REST_SET.has(v)) continue;
            const jsD = new Date(YEAR, MONTH, d).getDay();
            const rate = tr.dowShiftRate[jsD];
            if (!rate) continue;
            const predicted = Object.entries(rate).sort((a, b) => b[1] - a[1])[0]?.[0];
            if (predicted === v) q1Match++;
            q1Total++;
          }
        }
      }
    }

    // Q2: シフト不足
    for (let d = 1; d <= DAYS; d++) {
      for (const [k, minC] of Object.entries(dept.minStaff)) {
        const cnt = staffList.filter(s => shifts[s.id]?.[d] === k).length;
        if (cnt < minC) totalShortage += minC - cnt;
      }
    }
  }

  const avgShortage   = totalShortage / N_RUNS;
  const avgKyukoViol  = totalKyukoViol / N_RUNS;
  const avgConsecViol = totalConsecViol / N_RUNS;
  const q1Rate        = q1Total > 0 ? (q1Match / q1Total * 100).toFixed(1) : null;

  // Q3エントロピー & 最多曜日
  const entropyMap = {};
  for (const s of staffList) {
    const arr = dowRestCounts[s.id];
    const H = entropy(arr);
    const maxI = arr.indexOf(Math.max(...arr));
    const total = arr.reduce((a, b) => a + b, 0);
    const dom = total > 0 ? (arr[maxI] / total * 100).toFixed(1) : '0';
    entropyMap[s.id] = { H: H.toFixed(3), top: `${DOW_NAMES[maxI]}(${dom}%)`, arr };
  }

  return { label, avgShortage, avgKyukoViol, avgConsecViol, q1Rate, entropyMap };
}

// ── 実行 ────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(65)}`);
console.log(`学習ON vs OFF 比較シミュレーション (${N_RUNS}回/条件)`);
console.log(`対象: kaigo1 / 2026年6月 / 8名`);
console.log('='.repeat(65));

const resultON  = runBatch(learnedTrendON, '学習ON');
const resultOFF = runBatch({},             '学習OFF');

// Q1
console.log('\n【Q1. 学習パターン合致率 (trend ONのみ: 最頻シフトと一致した割合)】');
console.log(`  学習ON: ${resultON.q1Rate}%  (学習OFFでは計測不能)`);
console.log('  ※ 60%以上なら学習が生成を有意に誘導している');

// Q2
console.log('\n【Q2. 品質指標 (手修正量の代替)】');
console.log(`${'指標'.padEnd(20)} ${'学習ON'.padStart(8)} ${'学習OFF'.padStart(8)} ${'差(ON-OFF)'.padStart(10)}`);
console.log('-'.repeat(48));
for (const [name, on, off] of [
  ['シフト不足(日×人)', resultON.avgShortage,   resultOFF.avgShortage],
  ['公休違反人数/月',   resultON.avgKyukoViol,  resultOFF.avgKyukoViol],
  ['連続超過人数/月',   resultON.avgConsecViol, resultOFF.avgConsecViol],
]) {
  const diff = on - off, sign = diff > 0 ? '+' : '';
  console.log(`${name.padEnd(20)} ${on.toFixed(2).padStart(8)} ${off.toFixed(2).padStart(8)} ${(sign + diff.toFixed(2)).padStart(10)}`);
}

// Q3
console.log('\n【Q3. 曜日固定化（休み曜日エントロピー: 高いほど均一, max≈2.81)】');
const header = `${'職員名'.padEnd(22)} ${'ON H'.padStart(6)} ${'OFF H'.padStart(6)} ${'ON 最多'.padStart(9)} ${'OFF 最多'.padStart(9)} ${'固定化?'.padStart(6)}`;
console.log(header);
console.log('-'.repeat(62));
for (const s of staffList) {
  const on  = resultON.entropyMap[s.id];
  const off = resultOFF.entropyMap[s.id];
  const hDiff = parseFloat(on.H) - parseFloat(off.H);
  const fixed = hDiff < -0.3 ? '★固定化' : '';
  console.log(`${s.name.padEnd(22)} ${on.H.padStart(6)} ${off.H.padStart(6)} ${on.top.padStart(9)} ${off.top.padStart(9)} ${fixed.padStart(6)}`);
}

// DOW分布詳細（注目スタッフ）
console.log('\n【Q3詳細: ㇲミャッノーエイン & ケイシーサパナ の休み曜日分布】');
for (const sName of ['ㇲミャッノーエイン', 'ケイシーサパナ']) {
  const s = staffList.find(x => x.name === sName);
  if (!s) continue;
  const on  = resultON.entropyMap[s.id];
  const off = resultOFF.entropyMap[s.id];
  console.log(`  ${sName}:`);
  console.log(`    学習ON : ${DOW_NAMES.map((d, i) => `${d}:${on.arr[i]}`).join(' ')}`);
  console.log(`    学習OFF: ${DOW_NAMES.map((d, i) => `${d}:${off.arr[i]}`).join(' ')}`);
}

console.log('\n' + '='.repeat(65));
