/**
 * 公休8日・maxConsec5・31日 の実現可能性調査
 * 1000回ランダム配置して「成功率 / PassC追加 / 公休超過」を計測
 *
 * 成功 = PassC追加ゼロ（PassAだけで連続違反なし）
 */

const DAYS         = 31;
const N_STAFF      = 10;
const TARGET_KYUKO = 8;
const MAX_CONSEC   = 5;
const N_RUNS       = 1000;
const REST         = '休み';
const WORK         = '日勤';

// weightedSampleN (App.jsx と同一)
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

// 1スタッフ分の最大連続勤務（休みでない日=勤務と仮定）
function maxStreakSingle(schedule) {
  let ms = 0, st = 0;
  for (let d = 1; d <= DAYS; d++) {
    if (schedule[d] === REST) { st = 0; } else { st++; ms = Math.max(ms, st); }
  }
  return ms;
}

// PassC シミュレーション: 違反日に休みを追加（最大連続を繰り返し修正）
function simulatePassC(schedules) {
  let added = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const sch of schedules) {
      for (let d = 1; d <= DAYS; d++) {
        if (sch[d] !== WORK) continue;
        let streak = 0;
        for (let i = d; i >= 1 && sch[i] === WORK; i--) streak++;
        if (streak > MAX_CONSEC) {
          sch[d] = REST;
          added++;
          changed = true;
          break; // 再走査
        }
      }
    }
  }
  return added;
}

// ---------- 統計変数 ----------
let successCount = 0;     // PassC追加=0 の回数
let totalPassCAdded = 0;
let totalFinalExcess = 0; // 最終公休 > TARGET_KYUKO のスタッフ数合計
let totalFinalExcessRuns = 0; // 少なくとも1名超過したラン数

const passCDist = {};     // PassC追加数の分布（ラン単位ではなくスタッフ単位）
const staffSuccessDist = {}; // 1スタッフ単位での「PassC追加=0」分布

console.log(`=== 実現可能性調査 (${N_RUNS}回) ===`);
console.log(`条件: 31日 / ${N_STAFF}名 / 公休目標${TARGET_KYUKO}日 / maxConsec=${MAX_CONSEC}\n`);

for (let run = 0; run < N_RUNS; run++) {
  // スタッフごとのスケジュール配列を生成
  const schedules = [];
  for (let si = 0; si < N_STAFF; si++) {
    const sch = {};
    const available = Array.from({ length: DAYS }, (_, i) => i + 1);
    const picked = weightedSampleN(available, available.map(() => 1), TARGET_KYUKO);
    picked.forEach(d => { sch[d] = REST; });
    for (let d = 1; d <= DAYS; d++) { if (!sch[d]) sch[d] = WORK; }
    schedules.push(sch);
  }

  // PassA+B終了時点での違反チェック（PassC前）
  const preMaxStreaks = schedules.map(sch => maxStreakSingle(sch));
  const runViolStaff = preMaxStreaks.filter(ms => ms > MAX_CONSEC).length;

  // PassCシミュレーション（schedules をインプレース変更）
  const passCAdded = simulatePassC(schedules);

  // PassC後の公休数チェック
  let runFinalExcess = 0;
  for (const sch of schedules) {
    const restCount = Object.values(sch).filter(v => v === REST).length;
    if (restCount > TARGET_KYUKO) runFinalExcess++;
  }

  if (passCAdded === 0) successCount++;
  totalPassCAdded += passCAdded;
  totalFinalExcess += runFinalExcess;
  if (runFinalExcess > 0) totalFinalExcessRuns++;

  // 分布記録
  passCDist[passCAdded] = (passCDist[passCAdded] || 0) + 1;
}

// ---------- 結果出力 ----------
const successRate = (successCount / N_RUNS * 100).toFixed(1);
const avgPassC    = (totalPassCAdded / N_RUNS).toFixed(2);
const avgFinalExcessStaff = (totalFinalExcess / N_RUNS).toFixed(2);
const runExcessRate = (totalFinalExcessRuns / N_RUNS * 100).toFixed(1);

console.log('──────────────────────────────────────────');
console.log(`成功率（PassC追加ゼロ）: ${successRate}%  (${successCount}/${N_RUNS}ラン)`);
console.log(`PassC追加休み数 平均:   ${avgPassC}日 / ラン`);
console.log(`公休超過スタッフ 平均:  ${avgFinalExcessStaff}名 / ラン`);
console.log(`公休超過が出たラン:     ${runExcessRate}%  (${totalFinalExcessRuns}/${N_RUNS}ラン)`);
console.log('──────────────────────────────────────────\n');

console.log('PassC追加数の分布（ラン単位）:');
const keys = Object.keys(passCDist).map(Number).sort((a, b) => a - b);
keys.forEach(k => {
  const pct = (passCDist[k] / N_RUNS * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(passCDist[k] / N_RUNS * 40));
  console.log(`  追加${String(k).padStart(2)}日: ${String(passCDist[k]).padStart(4)}回 (${String(pct).padStart(5)}%) ${bar}`);
});

console.log('\n【理論参考値】');
console.log(`  31日 / 公休8日 = 勤務23日`);
console.log(`  maxConsec=5 を守るのに最低必要な公休数: ${Math.ceil(23/5)-1}日`);
console.log(`  余裕日数: ${TARGET_KYUKO - (Math.ceil(23/5)-1)}日`);
console.log('');
console.log('  公休9日の場合（比較用）:');
const NINE = 9;
const work9 = 31 - NINE;
console.log(`  31日 / 公休${NINE}日 = 勤務${work9}日`);
console.log(`  maxConsec=5 最低必要公休: ${Math.ceil(work9/5)-1}日`);
console.log(`  余裕日数: ${NINE - (Math.ceil(work9/5)-1)}日`);
