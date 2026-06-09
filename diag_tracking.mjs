/**
 * top trend candidate 追跡診断
 * 学習1位候補が PassA / Step2.5 / PassB / PassC / TierIV
 * それぞれで採用されたか・棄却理由を実測集計する
 */

import { autoGenerate, enableDiag, getDiag } from './src/shiftEngine.js';

const YEAR = 2026, MONTH = 5;
const DAYS = new Date(YEAR, MONTH + 1, 0).getDate();
const N_RUNS = 200;

// ── スタッフ定義 ─────────────────────────────────────────────────────────────
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

// ── 学習トレンド ──────────────────────────────────────────────────────────────
const diagWorkTot = {
  '柳 瑛理子':          [11, 21, 19, 19, 17, 24, 19],
  '村山 潤哉':          [24, 24, 15, 16, 10, 13, 25],
  'ケイ・ミ・ソー':     [24, 26, 13, 19, 18, 23, 14],
  'ㇲミャッノーエイン': [32, 32, 21, 15, 16, 18,  3],
  '宇賀神 弓':          [28, 15, 30, 18, 20, 35, 24],
  'ケイシーサパナ':     [17, 37, 23, 20, 31,  6, 36],
  '山田 A':             [15, 15, 15, 15, 15, 15, 15],
  '田中 B':             [15, 15, 15, 15, 15, 15, 15],
};
const BASE_TOT = 35;

function buildShiftRate(wt) {
  const n = wt / 37;
  const niku = 0.4 + n * 0.4;
  const rem  = 1 - niku;
  return { 日勤: niku, 早番: rem * 0.35, 遅番: rem * 0.35, 夜勤: rem * 0.30 };
}
function buildRestRate(wt) {
  return Math.max(0.05, Math.min(0.70, 0.30 + (1 - wt / BASE_TOT) * 0.4));
}
function buildTrend(name) {
  const wt = diagWorkTot[name];
  const dowShiftRate = Array.from({ length: 7 }, (_, jsD) => {
    const diagI = ((jsD - 1) + 7) % 7;
    return buildShiftRate(wt[diagI]);
  });
  const dowRestRate = wt.map(buildRestRate);
  return { 日勤: 0.55, 早番: 0.16, 遅番: 0.16, 夜勤: 0.13, dowShiftRate, dowRestRate, transitionRate: {} };
}

const trend = {};
for (const s of staffList) trend[s.name] = buildTrend(s.name);

// ── 累積カウンタの初期化ヘルパー ─────────────────────────────────────────────
function deepZero(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) out[k] = [];
    else if (typeof v === 'object' && v !== null) out[k] = deepZero(v);
    else out[k] = 0;
  }
  return out;
}

function deepAdd(acc, src) {
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'number') acc[k] = (acc[k] ?? 0) + v;
    else if (Array.isArray(v)) { if (Array.isArray(acc[k])) acc[k].push(...v); }
    else if (typeof v === 'object' && v !== null && acc[k]) deepAdd(acc[k], v);
  }
}

// ── 実行 ──────────────────────────────────────────────────────────────────────
let acc = null;

for (let run = 0; run < N_RUNS; run++) {
  enableDiag();
  autoGenerate(staffList, dept, YEAR, MONTH, {}, trend);
  const d = getDiag();
  if (!d?.topTrend) continue;
  if (!acc) acc = deepZero(d.topTrend);
  deepAdd(acc, d.topTrend);
}

if (!acc) {
  console.error('topTrend データが取得できませんでした。enableDiag/topTrend の実装を確認してください。');
  process.exit(1);
}

// ── レポート出力 ──────────────────────────────────────────────────────────────
const pct = (num, den) => den > 0 ? `${(num / den * 100).toFixed(1)}%` : '--%';
const fmt = (n) => String(n).padStart(6);

console.log(`\n${'='.repeat(70)}`);
console.log(`top trend candidate 追跡診断 (${N_RUNS}run / kaigo1 2026年6月)`);
console.log('='.repeat(70));

// ─── PassA ───────────────────────────────────────────────────────────────────
{
  const a = acc.passA;
  const total = a.proposals + a.noTrend;
  console.log('\n【PassA: 休み日サンプリング】');
  console.log(`  学習提案数 (top rest day):   ${fmt(a.proposals)}`);
  console.log(`  採用:                        ${fmt(a.adopted)}  (${pct(a.adopted, a.proposals)})`);
  console.log(`  棄却 - 対象外日(明け翌日等): ${fmt(a.rejectedNotValid)}  (${pct(a.rejectedNotValid, a.proposals)})`);
  console.log(`  棄却 - サンプリング落ち:     ${fmt(a.rejectedBySampling)}  (${pct(a.rejectedBySampling, a.proposals)})`);
  console.log(`  トレンドなし(fallback):      ${fmt(a.noTrend)}`);
}

// ─── Step2.5 ─────────────────────────────────────────────────────────────────
{
  const s = acc.step25;
  const notElig = (s.rejectedLocked ?? 0) + (s.rejectedAlreadyAssigned ?? 0) + (s.rejectedBadTransition ?? 0);
  console.log('\n【Step2.5: 早番/遅番 slot-first】');
  console.log(`  学習提案数 (top person/slot): ${fmt(s.proposals)}`);
  console.log(`  採用:                         ${fmt(s.adopted)}  (${pct(s.adopted, s.proposals)})`);
  console.log(`  棄却 - 候補外 計:             ${fmt(notElig)}  (${pct(notElig, s.proposals)})`);
  console.log(`    └ lockedDays該当:           ${fmt(s.rejectedLocked ?? 0)}  (${pct(s.rejectedLocked ?? 0, s.proposals)})`);
  console.log(`    └ res[d]既入力 計:          ${fmt(s.rejectedAlreadyAssigned ?? 0)}  (${pct(s.rejectedAlreadyAssigned ?? 0, s.proposals)})`);
  console.log(`        └ '夜勤'配置済み:       ${fmt(s.rejectedAssigned_nightShift ?? 0)}`);
  console.log(`        └ '明け'配置済み:       ${fmt(s.rejectedAssigned_meake ?? 0)}`);
  console.log(`        └ '休み'配置済み:       ${fmt(s.rejectedAssigned_rest ?? 0)}`);
  console.log(`        └ 希望休/有休:          ${fmt(s.rejectedAssigned_kiboKyu ?? 0)}`);
  console.log(`        └ その他シフト:         ${fmt(s.rejectedAssigned_other ?? 0)}`);
  console.log(`    └ 遷移制約:                 ${fmt(s.rejectedBadTransition ?? 0)}  (${pct(s.rejectedBadTransition ?? 0, s.proposals)})`);
  console.log(`  棄却 - 公平性(カウント差):    ${fmt(s.rejectedByFairness)}  (${pct(s.rejectedByFairness, s.proposals)})`);
  console.log(`  棄却 - ランダム(差≤0.05):     ${fmt(s.rejectedByRandom)}  (${pct(s.rejectedByRandom, s.proposals)})`);
  console.log(`  同率(信号なし):               ${fmt(s.tieNoSignal)}`);
}

// ─── PassB ───────────────────────────────────────────────────────────────────
{
  const b = acc.passB;
  console.log('\n【PassB: シフト種別サンプリング】');
  console.log(`  学習提案数 (top shift/day):   ${fmt(b.proposals)}`);
  console.log(`  採用:                         ${fmt(b.adopted)}  (${pct(b.adopted, b.proposals)})`);
  console.log(`  棄却 - capacityZero:          ${fmt(b.rejectedByCapacity)}  (${pct(b.rejectedByCapacity, b.proposals)})`);
  console.log(`  棄却 - deficit乗算優先:       ${fmt(b.rejectedByDeficit)}  (${pct(b.rejectedByDeficit, b.proposals)})`);
  console.log(`  棄却 - サンプリング落ち:      ${fmt(b.rejectedBySampling)}  (${pct(b.rejectedBySampling, b.proposals)})`);
  console.log(`  トレンドなし:                 ${fmt(b.noTrend)}`);
}

// ─── PassC ───────────────────────────────────────────────────────────────────
{
  const c = acc.passC;
  console.log('\n【PassC: 連続勤務修正】');
  console.log(`  変更セル数(total):            ${fmt(c.changed)}`);
  console.log(`  うち学習採用済み→変更:        ${fmt(c.changedFromAdopted)}  (${pct(c.changedFromAdopted, c.changed)})`);
  console.log(`  学習採用ベースの変更率:       ${pct(c.changedFromAdopted, acc.passB.adopted + acc.step25.adopted + acc.passA.adopted)}`);
}

// ─── TierIV ──────────────────────────────────────────────────────────────────
{
  const t  = acc.tierIV;
  const t4 = acc.tier4;
  const adoptedTotal = acc.passB.adopted + acc.step25.adopted + acc.passA.adopted;
  console.log('\n【TierIV: 後処理(enforceMaxStaff/minStaff/公休数調整)】');
  console.log(`  変更セル数(total):            ${fmt(t.changed)}`);
  console.log(`  うち学習採用済み→変更:        ${fmt(t.changedFromAdopted)}  (${pct(t.changedFromAdopted, t.changed)})`);
  console.log(`  学習採用ベースの変更率:       ${pct(t.changedFromAdopted, adoptedTotal)}`);
  console.log('\n【TierIV内訳: サブフェーズ別】');
  const sub = [
    ['restAdjust  (公休数調整)',  t4.restAdjust],
    ['enforceMax  (最大人数)',    t4.enforceMax],
    ['transitionFix(遷移修正)',   t4.transitionFix],
    ['minStaff   (最小人数)',     t4.minStaff],
  ];
  console.log(`  ${'サブフェーズ'.padEnd(22)} ${'変更計'.padStart(7)}  ${'学習採用→変更'.padStart(10)}  採用比`);
  for (const [label, s] of sub) {
    console.log(`  ${label.padEnd(22)} ${fmt(s.changed)}  ${fmt(s.changedFromAdopted).padStart(10)}  (${pct(s.changedFromAdopted, adoptedTotal)})`);
  }
  const evts = t4.events.slice(0, 10);
  if (evts.length) {
    console.log('\n  [eventsサンプル (学習採用→変更 最初10件)]');
    for (const e of evts) {
      console.log(`    ${String(e.staff).padEnd(16)} day=${String(e.day).padStart(2)}  ${e.before}→${e.after}  (${e.reason})`);
    }
  } else {
    console.log('\n  [events: 学習採用→変更 なし]');
  }
}

// ─── 統合サマリー ─────────────────────────────────────────────────────────────
{
  const totalProposals  = acc.passA.proposals + acc.step25.proposals + acc.passB.proposals;
  const adoptedAtPhase  = acc.passA.adopted + acc.step25.adopted + acc.passB.adopted;
  const changedPassC    = acc.passC.changedFromAdopted;
  const changedTierIV   = (acc.tier4.restAdjust.changedFromAdopted ?? 0)
                        + (acc.tier4.enforceMax.changedFromAdopted ?? 0)
                        + (acc.tier4.transitionFix.changedFromAdopted ?? 0)
                        + (acc.tier4.minStaff.changedFromAdopted ?? 0);
  const finalAdopted    = adoptedAtPhase - changedPassC - changedTierIV;

  const rejLocked   = (acc.step25.rejectedLocked ?? 0) + acc.passA.rejectedNotValid;
  const rejPassA    = acc.step25.rejectedAlreadyAssigned ?? 0; // PassA既割当が大半
  const rejTrans    = acc.step25.rejectedBadTransition ?? 0;
  const rejFairness = acc.step25.rejectedByFairness;
  const rejCapacity = acc.passB.rejectedByCapacity;
  const rejRandom   = acc.step25.rejectedByRandom + acc.passB.rejectedBySampling + acc.passA.rejectedBySampling;

  console.log(`\n${'─'.repeat(70)}`);
  console.log('【統合サマリー (全フェーズ合計)】');
  console.log(`${'─'.repeat(70)}`);

  const rows = [
    ['学習提案数',                totalProposals,  null],
    ['最終採用数',                finalAdopted,    totalProposals],
    ['  ├ 採用→PassC修復で変更',  changedPassC,    adoptedAtPhase],
    ['  └ 採用→TierIV最適化で変更', changedTierIV, adoptedAtPhase],
    ['棄却: 希望休/夜勤ロック',   rejLocked,       totalProposals],
    ['棄却: 既割当(PassA競合)',   rejPassA,        totalProposals],
    ['棄却: 遷移制約',            rejTrans,        totalProposals],
    ['棄却: 公平性(カウント差)',   rejFairness,     totalProposals],
    ['棄却: capacityZero',       rejCapacity,     totalProposals],
    ['棄却: ランダム落ち',        rejRandom,       totalProposals],
  ];

  for (const [label, val, den] of rows) {
    const rate = den !== null ? `  (${pct(val, den)})` : '';
    console.log(`  ${label.padEnd(28)} ${String(val).padStart(7)}${rate}`);
  }

  console.log('\n  ※ 最終採用数 = 採用数 - PassC変更 - TierIV変更');
  console.log('  ※ 各棄却率の分母 = 学習提案数');
}

console.log('\n' + '='.repeat(70));
