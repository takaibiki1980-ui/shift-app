/**
 * PassA均等化の効果検証シミュレーション
 * 現行（ランダム）vs 均等化（±2揺らぎ + maxConsec制約）を比較
 *
 * 公休8日 / 公休9日 それぞれで
 *  PassC追加休み数 / 最終公休日数 / 連続勤務違反数 を計測
 */

const DAYS     = 31;
const N_STAFF  = 10;
const MAX_CONS = 5;
const N_RUNS   = 1000;

// ── weightedSampleN (App.jsx と同一) ──
function weightedSampleN(items, weights, n) {
  const pool = items.map((item, i) => ({ item, w: weights[i] ?? 1 }));
  const result = [];
  while (result.length < n && pool.length) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    if (total <= 0) { result.push(...pool.slice(0, n - result.length).map(x => x.item)); break; }
    let r = Math.random() * total;
    const idx = pool.findIndex(x => { r -= x.w; return r <= 0; });
    result.push(pool[idx >= 0 ? idx : pool.length - 1].item);
    pool.splice(idx >= 0 ? idx : pool.length - 1, 1);
  }
  return result;
}

// ── PassA: ランダム (現行) ──
function passARandom(days, kyuko) {
  const available = Array.from({ length: days }, (_, i) => i + 1);
  const picked = weightedSampleN(available, available.map(() => 1), kyuko);
  const sch = {};
  for (let d = 1; d <= days; d++) sch[d] = 'W';
  picked.forEach(d => { sch[d] = 'R'; });
  return sch;
}

// ── PassA: 均等化（±2揺らぎ + maxConsec制約）[今回実装するもの] ──
function passAUniform(days, kyuko, maxConsec) {
  const available = Array.from({ length: days }, (_, i) => i + 1);
  const N = available.length;
  const step = N / (kyuko + 1);
  const usedSet = new Set();
  let prevDay = 0;
  const sch = {};
  for (let d = 1; d <= days; d++) sch[d] = 'W';

  for (let i = 1; i <= kyuko; i++) {
    const isLast = (i === kyuko);

    // 前休みからの制約
    const minDay = prevDay + 1;
    const maxDay = Math.min(days, prevDay + maxConsec + 1);

    // 末尾制約: 最後の休みは days-maxConsec 以降に
    const minDayFinal = isLast ? Math.max(minDay, days - maxConsec) : minDay;

    // 理想位置 ± 揺らぎ
    const idealIdx = Math.min(Math.max(0, Math.round(i * step) - 1), N - 1);
    const idealDay = available[idealIdx];
    const jitter   = Math.round((Math.random() - 0.5) * 4); // -2〜+2
    const target   = idealDay + jitter;

    // 有効候補: [minDayFinal, maxDay] ∩ available ∩ 未使用
    const cands = available.filter(d => d >= minDayFinal && d <= maxDay && !usedSet.has(d));
    if (!cands.length) break;

    const best = cands.reduce((a, b) =>
      Math.abs(a - target) < Math.abs(b - target) ? a : b
    );

    usedSet.add(best);
    sch[best] = 'R';
    prevDay = best;
  }
  return sch;
}

// ── PassC: 連続違反を休みで修正（実際のPassCに相当） ──
function simulatePassC(sch, maxConsec) {
  let added = 0, changed = true;
  while (changed) {
    changed = false;
    for (let d = 1; d <= DAYS; d++) {
      if (sch[d] !== 'W') continue;
      let streak = 0;
      for (let i = d; i >= 1 && sch[i] === 'W'; i--) streak++;
      if (streak > maxConsec) { sch[d] = 'R'; added++; changed = true; break; }
    }
  }
  return added;
}

// ── 公休過多補正（App.jsx の公休数調整と同等の簡略版） ──
function adjustExcess(sch, target, maxConsec) {
  const restDays = Object.keys(sch).map(Number).filter(d => sch[d] === 'R').sort((a,b)=>a-b);
  let excess = restDays.length - target;
  let removed = 0;
  for (const d of restDays) {
    if (excess <= 0) break;
    // 前後の連続勤務数チェック
    let before = 0; for (let i = d-1; i >= 1 && sch[i] === 'W'; i--) before++;
    let after  = 0; for (let i = d+1; i <= DAYS && sch[i] === 'W'; i++) after++;
    if (before + 1 + after > maxConsec) continue; // 削除不可
    sch[d] = 'W'; excess--; removed++;
  }
  return removed;
}

// ── 最終状態チェック ──
function finalStats(sch, target, maxConsec) {
  const restCount = Object.values(sch).filter(v => v === 'R').length;
  let maxStreak = 0, streak = 0, violations = 0;
  for (let d = 1; d <= DAYS; d++) {
    if (sch[d] !== 'W') { streak = 0; }
    else { streak++; if (streak > maxConsec) violations++; }
    maxStreak = Math.max(maxStreak, streak);
  }
  return { restCount, excess: restCount - target, maxStreak, violations };
}

// ── 1回ラン ──
function oneRun(kyuko, mode) {
  let totalPassC = 0, totalExcess = 0, totalViolations = 0;
  let exactCount = 0; // 最終公休=targetのスタッフ数

  for (let si = 0; si < N_STAFF; si++) {
    const sch = mode === 'random'
      ? passARandom(DAYS, kyuko)
      : passAUniform(DAYS, kyuko, MAX_CONS);

    const passCAdded = simulatePassC(sch, MAX_CONS);
    const removed    = adjustExcess(sch, kyuko, MAX_CONS);
    const { restCount, excess, violations } = finalStats(sch, kyuko, MAX_CONS);

    totalPassC     += passCAdded;
    totalExcess    += excess;
    totalViolations+= violations;
    if (restCount === kyuko) exactCount++;
  }
  return { totalPassC, totalExcess, totalViolations, exactCount };
}

// ── メイン計測 ──
for (const kyuko of [8, 9]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`公休目標 ${kyuko}日 / maxConsec=${MAX_CONS} / ${N_RUNS}ラン / ${N_STAFF}名`);
  console.log('='.repeat(60));

  for (const mode of ['random', 'uniform']) {
    let sumPassC = 0, sumExcess = 0, sumViol = 0, sumExact = 0;
    let runsWithExcess = 0;

    for (let r = 0; r < N_RUNS; r++) {
      const res = oneRun(kyuko, mode);
      sumPassC  += res.totalPassC;
      sumExcess += res.totalExcess;
      sumViol   += res.totalViolations;
      sumExact  += res.exactCount;
      if (res.totalExcess > 0) runsWithExcess++;
    }

    const label = mode === 'random' ? '【現行:ランダム】' : '【改善:均等化 ±2揺らぎ】';
    console.log(`\n${label}`);
    console.log(`  PassC追加休み   平均: ${(sumPassC /N_RUNS).toFixed(2)}日/ラン`);
    console.log(`  最終公休超過    平均: ${(sumExcess/N_RUNS).toFixed(2)}名×日/ラン`);
    console.log(`  公休=target の割合: ${(sumExact/(N_RUNS*N_STAFF)*100).toFixed(1)}% `);
    console.log(`  連続違反 残存  平均: ${(sumViol /N_RUNS).toFixed(2)}日/ラン`);
    console.log(`  超過ランの割合:      ${(runsWithExcess/N_RUNS*100).toFixed(1)}%`);
  }
}
console.log('');
