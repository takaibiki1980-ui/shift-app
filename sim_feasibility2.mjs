/**
 * 公休8日・maxConsec5・31日 の実現可能性 詳細調査
 *
 * ① DP で「理論上有効な配置の割合」を厳密計算（1スタッフ分）
 * ② 1000回ランダム配置で「成功率・PassC追加・公休超過率」を実測
 * ③ 公休9日との比較
 */

const DAYS     = 31;
const MAX_CONS = 5;

// ──────────────────────────────────────────
// ① DP: 有効配置数の厳密カウント
// state: (day, rest_placed, cur_work_streak)
// ──────────────────────────────────────────
function countValidArrangements(days, targetRest, maxConsec) {
  // dp[rest_placed][streak] = arrangements count
  let dp = Array.from({ length: targetRest + 1 }, () =>
    new Array(maxConsec + 1).fill(BigInt(0))
  );
  dp[0][0] = BigInt(1); // day 0, 0 rests placed, streak 0

  for (let d = 0; d < days; d++) {
    const ndp = Array.from({ length: targetRest + 1 }, () =>
      new Array(maxConsec + 1).fill(BigInt(0))
    );
    for (let r = 0; r <= targetRest; r++) {
      for (let st = 0; st <= maxConsec; st++) {
        if (dp[r][st] === BigInt(0)) continue;
        const cnt = dp[r][st];

        // 選択1: この日を休み（rest）にする
        if (r + 1 <= targetRest) {
          ndp[r + 1][0] += cnt;
        }
        // 選択2: この日を勤務にする（streak+1 <= maxConsec のとき有効）
        if (st + 1 <= maxConsec) {
          ndp[r][st + 1] += cnt;
        }
      }
    }
    dp = ndp;
  }

  // 最終日まで終えて、ちょうど targetRest 個の休みを使った状態を集計
  let valid = BigInt(0);
  for (let st = 0; st <= maxConsec; st++) {
    valid += dp[targetRest][st];
  }
  return valid;
}

function bigIntComb(n, k) {
  if (k > n - k) k = n - k;
  let result = BigInt(1);
  for (let i = 0; i < k; i++) {
    result = result * BigInt(n - i) / BigInt(i + 1);
  }
  return result;
}

console.log('=== ① 理論有効配置割合（DP厳密計算）===\n');
for (const kyuko of [7, 8, 9, 10]) {
  const valid = countValidArrangements(DAYS, kyuko, MAX_CONS);
  const total = bigIntComb(DAYS, kyuko);
  const pct   = (Number(valid) / Number(total) * 100).toFixed(2);
  console.log(`  公休${kyuko}日: 有効=${valid.toLocaleString()} / 全体=${total.toLocaleString()} → ${pct}%`);
}

// ──────────────────────────────────────────
// ② ランダム配置 1000回シミュレーション
// ──────────────────────────────────────────
function weightedSampleN(items, weights, n) {
  const pool = items.map((item, i) => ({ item, w: weights[i] ?? 1 }));
  const result = [];
  while (result.length < n && pool.length) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    if (total <= 0) { result.push(...pool.slice(0, n - result.length).map(x => x.item)); break; }
    let r = Math.random() * total;
    const idx = pool.findIndex(x => { r -= x.w; return r <= 0; });
    const picked = idx >= 0 ? idx : pool.length - 1;
    result.push(pool[picked].item);
    pool.splice(picked, 1);
  }
  return result;
}

function simulateRandom(days, kyuko, maxConsec, nStaff, nRuns) {
  let successRuns = 0, sumPassC = 0, excessRuns = 0;
  const passCDist = {};

  for (let run = 0; run < nRuns; run++) {
    const schedules = [];
    for (let si = 0; si < nStaff; si++) {
      const sch = new Array(days + 1).fill('W');
      const available = Array.from({ length: days }, (_, i) => i + 1);
      const picked = weightedSampleN(available, available.map(() => 1), kyuko);
      picked.forEach(d => { sch[d] = 'R'; });
      schedules.push(sch);
    }

    // PassC: 違反を繰り返し修正
    let passCAdded = 0, changed = true;
    while (changed) {
      changed = false;
      for (const sch of schedules) {
        for (let d = 1; d <= days; d++) {
          if (sch[d] !== 'W') continue;
          let st = 0;
          for (let i = d; i >= 1 && sch[i] === 'W'; i--) st++;
          if (st > maxConsec) { sch[d] = 'R'; passCAdded++; changed = true; break; }
        }
      }
    }

    // 公休超過チェック
    let anyExcess = false;
    for (const sch of schedules) {
      const restCount = sch.filter(v => v === 'R').length;
      if (restCount > kyuko) anyExcess = true;
    }

    if (passCAdded === 0) successRuns++;
    if (anyExcess) excessRuns++;
    sumPassC += passCAdded;
    passCDist[passCAdded] = (passCDist[passCAdded] || 0) + 1;
  }

  return { successRuns, sumPassC, excessRuns, passCDist };
}

const N_STAFF = 10;
const N_RUNS  = 1000;

console.log('\n=== ② ランダム配置シミュレーション（1000回）===\n');
for (const kyuko of [8, 9]) {
  const { successRuns, sumPassC, excessRuns, passCDist } =
    simulateRandom(DAYS, kyuko, MAX_CONS, N_STAFF, N_RUNS);

  console.log(`--- 公休${kyuko}日 ---`);
  console.log(`  成功率（PassC追加ゼロ）: ${(successRuns/N_RUNS*100).toFixed(1)}%  (${successRuns}/${N_RUNS}ラン)`);
  console.log(`  PassC追加休み 平均:      ${(sumPassC/N_RUNS).toFixed(2)}日 / ラン`);
  console.log(`  公休超過ランの割合:      ${(excessRuns/N_RUNS*100).toFixed(1)}%`);

  // 分布
  const keys = Object.keys(passCDist).map(Number).sort((a,b)=>a-b);
  console.log(`  PassC追加数の分布:`);
  keys.forEach(k => {
    const pct = (passCDist[k]/N_RUNS*100).toFixed(1);
    const bar = '█'.repeat(Math.round(passCDist[k]/N_RUNS*30));
    console.log(`    追加${String(k).padStart(2)}日: ${String(passCDist[k]).padStart(4)}回 (${String(pct).padStart(5)}%) ${bar}`);
  });
  console.log('');
}

console.log('=== まとめ ===');
console.log('  公休8日: 理論上有効配置は存在するが、ランダム配置では0%成功 → アルゴリズム問題');
console.log('  公休9日: 余裕が1日増えるだけでランダムでも成功率が大きく改善するか確認 ↑');
