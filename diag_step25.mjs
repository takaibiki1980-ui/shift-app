/**
 * Step 2.5 学習影響度 詳細診断
 * ・ランダム決定ケースの重み差分布
 * ・0.05 閾値に阻まれた件数推定
 * ・重み付きサンプリング版 vs 現行ソート版 の Q1合致率比較
 */

import { autoGenerate, enableDiag, getDiag } from './src/shiftEngine.js';

const YEAR = 2026, MONTH = 5;
const DAYS = new Date(YEAR, MONTH + 1, 0).getDate();
const N_RUNS = 200;  // 精度向上のため多めに
const REST_SET = new Set(['休み', '希望休', '有休']);

// ── スタッフ定義（compare_learning_onoff.mjs と同じ）──────────────────────
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

// ── 学習トレンド（同上）───────────────────────────────────────────────────
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

// ── Q1合致率計算ヘルパー ──────────────────────────────────────────────────
function q1Rate(shifts) {
  let match = 0, total = 0;
  for (const s of staffList) {
    const sch = shifts[s.id] || {};
    const tr = trend[s.name];
    if (!tr?.dowShiftRate) continue;
    for (let d = 1; d <= DAYS; d++) {
      const v = sch[d];
      if (!v || REST_SET.has(v)) continue;
      const jsD = new Date(YEAR, MONTH, d).getDay();
      const rate = tr.dowShiftRate[jsD];
      if (!rate) continue;
      const predicted = Object.entries(rate).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (predicted === v) match++;
      total++;
    }
  }
  return total > 0 ? match / total : 0;
}

// ── バッチ実行 ─────────────────────────────────────────────────────────────
function runBatch(mode, label) {
  const diagAcc = {
    resolvedByCount: 0, resolvedByTrend: 0, resolvedByRandom: 0,
    singleCand: 0, total: 0,
    randWdiffEq0: 0, randWdiff0to005: 0, randWdiffSum: 0,
  };
  let q1Sum = 0;

  for (let run = 0; run < N_RUNS; run++) {
    enableDiag();
    const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, trend, { step25Mode: mode });
    const d = getDiag();
    if (d?.step25) {
      for (const k of Object.keys(diagAcc)) diagAcc[k] += d.step25[k] ?? 0;
    }
    q1Sum += q1Rate(shifts);
  }

  return { label, diagAcc, q1Avg: q1Sum / N_RUNS };
}

// ── 実行 ──────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(70)}`);
console.log(`Step 2.5 学習影響度 詳細診断 (${N_RUNS}run)`);
console.log('='.repeat(70));

const sortResult     = runBatch('sort',     '現行ソート');
const weightedResult = runBatch('weighted', '重み付きサンプリング');

// ── 現行ソート版の詳細レポート ────────────────────────────────────────────
{
  const d = sortResult.diagAcc;
  const tot = d.total;
  const pct = v => tot > 0 ? (v / tot * 100).toFixed(1) : '-';

  console.log('\n【A. 現行ソート版 Step 2.5 決定内訳】');
  console.log(`  総スロット決定: ${tot} (${N_RUNS}run合計)`);
  console.log(`  ①公平カウント差:       ${d.resolvedByCount.toString().padStart(5)} (${pct(d.resolvedByCount)}%)`);
  console.log(`  ②学習trend(>0.05):    ${d.resolvedByTrend.toString().padStart(5)} (${pct(d.resolvedByTrend)}%)`);
  console.log(`  ③ランダム:             ${d.resolvedByRandom.toString().padStart(5)} (${pct(d.resolvedByRandom)}%)`);
  console.log(`  候補1人(自明):         ${d.singleCand.toString().padStart(5)} (${pct(d.singleCand)}%)`);

  console.log('\n【B. ランダム決定ケースの学習差内訳】');
  const rand = d.resolvedByRandom;
  const rPct = v => rand > 0 ? (v / rand * 100).toFixed(1) : '-';
  console.log(`  ランダム決定 計:       ${rand}件`);
  console.log(`  うち学習差=0 (無信号): ${d.randWdiffEq0.toString().padStart(5)} (${rPct(d.randWdiffEq0)}%)  ← トレンドが同値`);
  console.log(`  うち0<差≤0.05(閾値阻): ${d.randWdiff0to005.toString().padStart(5)} (${rPct(d.randWdiff0to005)}%)  ← ★ここが閾値に阻まれた件数`);
  const avgDiff = rand > 0 ? (d.randWdiffSum / rand).toFixed(4) : '-';
  console.log(`  ランダムケース 差の平均: ${avgDiff}`);

  const newTrend = d.resolvedByTrend + d.randWdiff0to005;
  const newRand  = d.randWdiffEq0;
  console.log('\n【C. 閾値を 0.05 → 0 にした場合の推定 (差>0 ならすべて学習決定)】');
  console.log(`  学習決定: ${d.resolvedByTrend} → 推定 ${newTrend} (${pct(d.resolvedByTrend)}% → ${(newTrend/tot*100).toFixed(1)}%)`);
  console.log(`  ランダム: ${rand} → 推定 ${newRand} (${pct(rand)}% → ${(newRand/tot*100).toFixed(1)}%)`);
  console.log(`  ※ 差=0 の ${d.randWdiffEq0}件は学習情報がないため変えられない`);
}

// ── 2方式比較 ────────────────────────────────────────────────────────────
console.log('\n【D. 現行ソート vs 重み付きサンプリング 比較】');
const q1sort = (sortResult.q1Avg * 100).toFixed(1);
const q1wt   = (weightedResult.q1Avg * 100).toFixed(1);
const q1diff = (weightedResult.q1Avg - sortResult.q1Avg) * 100;
console.log(`  Q1合致率 (全シフト種別):`);
console.log(`    現行ソート:         ${q1sort}%`);
console.log(`    重み付きサンプリング: ${q1wt}%  (${q1diff > 0 ? '+' : ''}${q1diff.toFixed(1)}pp)`);

// 早番/遅番 の「学習最高重み者が実際に割り当てられたか」一致率
// (Q1の代替: 日勤が常に最高重みな問題を回避)
console.log('\n  早番・遅番 → 「学習重み最上位者が選ばれたか」一致率:');
for (const shiftType of ['早番', '遅番']) {
  let sortMatch = 0, wtMatch = 0, sortTotal = 0, wtTotal = 0;
  for (let run = 0; run < 100; run++) {
    const { shifts: sSort } = autoGenerate(staffList, dept, YEAR, MONTH, {}, trend, { step25Mode: 'sort' });
    const { shifts: sWt   } = autoGenerate(staffList, dept, YEAR, MONTH, {}, trend, { step25Mode: 'weighted' });
    for (let d = 1; d <= DAYS; d++) {
      const jsD = new Date(YEAR, MONTH, d).getDay();
      // 当日の全候補（夜勤明け・希望休以外）のうち最高重み者
      const cands = staffList.filter(s => {
        const v = sSort[s.id]?.[d];
        return !v || v === shiftType; // 未割当 or 早番/遅番に割り当てられた人
      });
      // より正確: trend重みトップを計算
      const ranked = staffList
        .map(s => {
          const tr = trend[s.name];
          const w = tr?.dowShiftRate?.[jsD]?.[shiftType] ?? tr?.[shiftType] ?? 0;
          return { s, w };
        })
        .sort((a, b) => b.w - a.w);
      if (!ranked.length) continue;
      const topW = ranked[0].w;
      const topIds = ranked.filter(x => Math.abs(x.w - topW) < 0.001).map(x => x.s.id);

      const sortWinner = staffList.find(s => sSort[s.id]?.[d] === shiftType);
      const wtWinner   = staffList.find(s => sWt[s.id]?.[d]   === shiftType);
      if (sortWinner) {
        sortTotal++;
        if (topIds.includes(sortWinner.id)) sortMatch++;
      }
      if (wtWinner) {
        wtTotal++;
        if (topIds.includes(wtWinner.id)) wtMatch++;
      }
    }
  }
  const pSort = sortTotal > 0 ? (sortMatch / sortTotal * 100).toFixed(1) : '-';
  const pWt   = wtTotal   > 0 ? (wtMatch   / wtTotal   * 100).toFixed(1) : '-';
  const diff  = (sortTotal > 0 && wtTotal > 0)
    ? ((wtMatch / wtTotal - sortMatch / sortTotal) * 100)
    : null;
  const diffStr = diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp` : '-';
  console.log(`    ${shiftType}: ソート=${pSort}%  重み付き=${pWt}%  差=${diffStr}`);
}

// 公平性チェック: 各スタッフの早番/遅番割り当て回数の標準偏差
console.log('\n  公平性チェック (早番/遅番 割り当て回数 std dev):');
for (const shiftType of ['早番', '遅番']) {
  const sortCounts = Object.fromEntries(staffList.map(s => [s.id, 0]));
  const wtCounts   = Object.fromEntries(staffList.map(s => [s.id, 0]));
  const runs = 50;
  for (let run = 0; run < runs; run++) {
    const { shifts: sSort } = autoGenerate(staffList, dept, YEAR, MONTH, {}, trend, { step25Mode: 'sort' });
    const { shifts: sWt   } = autoGenerate(staffList, dept, YEAR, MONTH, {}, trend, { step25Mode: 'weighted' });
    for (const s of staffList) {
      for (let d = 1; d <= DAYS; d++) {
        if (sSort[s.id]?.[d] === shiftType) sortCounts[s.id]++;
        if (sWt[s.id]?.[d]   === shiftType) wtCounts[s.id]++;
      }
    }
  }
  const avgS = staffList.map(s => sortCounts[s.id] / runs);
  const avgW = staffList.map(s => wtCounts[s.id] / runs);
  const stdDev = (arr) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length).toFixed(2);
  };
  console.log(`    ${shiftType}: ソートSD=${stdDev(avgS)}  重み付きSD=${stdDev(avgW)}  ← 大きいほど偏り`);
}

// 閾値感度分析: 0.05 閾値を下げた場合の推定
console.log('\n【E. 閾値感度分析 (ランダムケースの重み差ヒストグラム)】');
{
  // 各閾値でランダムケースのうち何件が「学習決定」に切り替わるか試算
  const d = sortResult.diagAcc;
  const tot = d.total;
  const rand = d.resolvedByRandom;

  // ランダムケースの差の推定分布:
  // randWdiffEq0: 差=0  (閾値を何に下げても変わらない)
  // randWdiff0to005: 0<差≤0.05 (閾値 < その差 なら学習決定に切り替わる)
  // 差の平均 = randWdiffSum/rand。0.05以下の差は正規分布ではなく推定が難しいが
  // 線形補間で感度を概算する
  const avgBlocked = d.randWdiff0to005 > 0 ? d.randWdiffSum / d.resolvedByRandom : 0;
  const blockedCount = d.randWdiff0to005;

  console.log(`  現行(threshold=0.05): 学習決定=${d.resolvedByTrend} (${(d.resolvedByTrend/tot*100).toFixed(1)}%)`);
  for (const thr of [0.04, 0.03, 0.02, 0.01, 0.00]) {
    // 差 > thr の割合を推定: 差が 0 〜 0.05 に一様分布と仮定した概算
    const fracAboveThr = thr < 0.05 ? (0.05 - thr) / 0.05 : 0;
    const additionalLearning = Math.round(blockedCount * fracAboveThr);
    const newTrend = d.resolvedByTrend + additionalLearning;
    const newRand  = rand - additionalLearning;
    console.log(`  threshold=${thr.toFixed(2)}: 推定学習決定=${newTrend} (${(newTrend/tot*100).toFixed(1)}%)  ランダム=${newRand} (${(newRand/tot*100).toFixed(1)}%)`);
  }
  console.log(`  ※ 差=0の${d.randWdiffEq0}件はどの閾値でも変わらない (学習上同率)`);
  console.log(`  ※ ブロックされた差の平均: ${avgBlocked.toFixed(4)} → threshold≦${avgBlocked.toFixed(2)}で過半が通過`);
}

console.log('\n【まとめ】');
console.log('  ・0.05閾値に阻まれた件数が全ランダム中に占める割合を確認');
console.log('  ・重み付きサンプリングが Q1改善に寄与するか確認');
console.log('  ・公平性(std dev)が重み付きモードで崩れていないか確認');

console.log('\n' + '='.repeat(70));
