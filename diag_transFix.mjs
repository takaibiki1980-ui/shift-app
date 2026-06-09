/**
 * transitionFix 詳細診断
 * 学習採用セルが transitionFix で変更された全件を収集し
 *   - 前日シフト / before / after / 翌日シフト / 違反ルール
 *   - rule別件数集計
 * を出力する
 */

import { autoGenerate, enableDiag, getDiag } from './src/shiftEngine.js';

const YEAR = 2026, MONTH = 5;
const N_RUNS = 200;

// ── スタッフ定義（diag_tracking.mjs と同一）───────────────────────────────
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

// ── 収集 ──────────────────────────────────────────────────────────────────
const allEvents = [];

for (let run = 0; run < N_RUNS; run++) {
  enableDiag();
  autoGenerate(staffList, dept, YEAR, MONTH, {}, trend);
  const d = getDiag();
  if (!d?.topTrend?.tier4?.events) continue;
  for (const e of d.topTrend.tier4.events) {
    if (e.reason === 'transitionFix') allEvents.push(e);
  }
}

if (allEvents.length === 0) {
  console.error('transitionFix events が取得できませんでした。');
  process.exit(1);
}

// ── rule別集計 ────────────────────────────────────────────────────────────
const ruleCnt = {};
for (const e of allEvents) {
  ruleCnt[e.rule] = (ruleCnt[e.rule] ?? 0) + 1;
}

const total = allEvents.length;
const fmt6 = n => String(n).padStart(6);
const pct  = (n, d) => d > 0 ? `${(n / d * 100).toFixed(1)}%` : '--';

console.log(`\n${'='.repeat(72)}`);
console.log(`transitionFix 詳細診断 (${N_RUNS}run / kaigo1 2026年6月)`);
console.log(`学習採用→transitionFix変更 総件数: ${total}`);
console.log('='.repeat(72));

// ─── rule別集計 ──────────────────────────────────────────────────────────
console.log('\n【違反ルール別件数】');
const ruleOrder = ['遅番→早番禁止', '遅番→日勤禁止', '日勤→早番禁止', 'その他'];
console.log(`  ${'ルール名'.padEnd(18)} ${'件数'.padStart(7)}  割合`);
console.log(`  ${'─'.repeat(38)}`);
for (const r of ruleOrder) {
  const cnt = ruleCnt[r] ?? 0;
  console.log(`  ${r.padEnd(18)} ${fmt6(cnt)}  (${pct(cnt, total)})`);
}
// ruleOrderに含まれない未知ルールがあれば出力
for (const [r, cnt] of Object.entries(ruleCnt)) {
  if (!ruleOrder.includes(r)) {
    console.log(`  ${r.padEnd(18)} ${fmt6(cnt)}  (${pct(cnt, total)})  ※未定義ルール`);
  }
}
console.log(`  ${'─'.repeat(38)}`);
console.log(`  ${'合計'.padEnd(18)} ${fmt6(total)}`);

// ─── before/after パターン集計 ────────────────────────────────────────────
console.log('\n【before→after パターン別件数 (上位10)】');
const patCnt = {};
for (const e of allEvents) {
  const key = `${e.before}→${e.after}`;
  patCnt[key] = (patCnt[key] ?? 0) + 1;
}
const patSorted = Object.entries(patCnt).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`  ${'パターン'.padEnd(14)} ${'件数'.padStart(7)}  割合`);
for (const [pat, cnt] of patSorted) {
  console.log(`  ${pat.padEnd(14)} ${fmt6(cnt)}  (${pct(cnt, total)})`);
}

// ─── 前日シフト × before パターン集計 ──────────────────────────────────────
console.log('\n【前日シフト × before パターン別件数 (上位10)】');
const ctxCnt = {};
for (const e of allEvents) {
  const key = `${e.prevSnap ?? '?'}→${e.before}`;
  ctxCnt[key] = (ctxCnt[key] ?? 0) + 1;
}
const ctxSorted = Object.entries(ctxCnt).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`  ${'前日→当日(変更前)'.padEnd(16)} ${'件数'.padStart(7)}  割合`);
for (const [pat, cnt] of ctxSorted) {
  console.log(`  ${pat.padEnd(16)} ${fmt6(cnt)}  (${pct(cnt, total)})`);
}

// ─── 200件サンプル ────────────────────────────────────────────────────────
const sample = allEvents.slice(0, 200);
console.log(`\n${'─'.repeat(72)}`);
console.log(`【詳細サンプル (最初 ${sample.length} 件 / 全 ${total} 件)】`);
console.log('─'.repeat(72));
console.log(
  `${'スタッフ'.padEnd(18)} ${'日'.padStart(3)}  ` +
  `${'前日'.padEnd(6)} ${'変更前'.padEnd(6)} ${'変更後'.padEnd(6)} ${'翌日'.padEnd(6)}  ルール`
);
console.log('─'.repeat(72));

for (const e of sample) {
  const prev = String(e.prevSnap ?? '-').padEnd(6);
  const next = String(e.nextSnap ?? '-').padEnd(6);
  console.log(
    `${String(e.staff).padEnd(18)} ${String(e.day).padStart(3)}日  ` +
    `${prev} ${String(e.before).padEnd(6)} ${String(e.after).padEnd(6)} ${next}  ${e.rule}`
  );
}

console.log('\n' + '='.repeat(72));
