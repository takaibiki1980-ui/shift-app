/**
 * PassA / PassB / PassC 実測シミュレーション
 * autoGenerate の核心ロジックをそのまま抽出して Node.js で実行
 *
 * 設定: 1月(31日) / staff 10名 / kyukoDays=8 / maxConsec=5
 *      夜勤なし / trendなし (純ランダム) / lockedDays なし
 */

const DAYS        = 31;
const N_STAFF     = 10;
const TARGET_KYUKO = 8;
const MAX_CONSEC  = 5;
const REST        = '休み';
const WORK        = '日勤';
const N_RUNS      = 30;          // bestOfN と同じ試行回数

// ---------- weightedSampleN (App.jsx line 1662 と同一) ----------
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

// ---------- 連続勤務カウント (App.jsx の consecWork と同等) ----------
function consecWork(res, staffId, d) {
  let cnt = 0;
  for (let i = d; i >= 1; i--) {
    if (res[staffId][i] !== WORK) break;
    cnt++;
  }
  return cnt;
}

// ---------- PassA後の潜在違反チェック (未割当=勤務と仮定) ----------
function checkViolationsPassA(res, staffIds) {
  let totalStaff = 0, totalDays = 0, maxSeen = 0;
  const rows = [];
  for (const sid of staffIds) {
    let streak = 0, vc = 0, ms = 0;
    for (let d = 1; d <= DAYS; d++) {
      const v = res[sid][d];
      const isBreak = v === REST; // PassA後: REST か undefined(=潜在勤務)
      if (isBreak) { streak = 0; } else { streak++; if (streak > MAX_CONSEC) vc++; }
      ms = Math.max(ms, streak);
    }
    if (vc > 0) totalStaff++;
    totalDays += vc;
    maxSeen = Math.max(maxSeen, ms);
    rows.push({ staffId: sid, 最大連続: ms, 超過日数: vc });
  }
  return { totalStaff, totalDays, maxSeen, rows };
}

// ---------- PassB後の実違反チェック (勤務配置済み) ----------
function checkViolationsPassB(res, staffIds) {
  let totalStaff = 0, totalDays = 0, maxSeen = 0;
  const rows = [];
  for (const sid of staffIds) {
    let streak = 0, vc = 0, ms = 0;
    for (let d = 1; d <= DAYS; d++) {
      const v = res[sid][d];
      if (v !== WORK) { streak = 0; } else { streak++; if (streak > MAX_CONSEC) vc++; }
      ms = Math.max(ms, streak);
    }
    if (vc > 0) totalStaff++;
    totalDays += vc;
    maxSeen = Math.max(maxSeen, ms);
    rows.push({ staffId: sid, 最大連続: ms, 超過日数: vc });
  }
  return { totalStaff, totalDays, maxSeen, rows };
}

// ---------- PassC シミュレーション (違反日を休みに変換) ----------
function simulatePassC(res, staffIds) {
  let added = 0;
  for (const sid of staffIds) {
    for (let d = 1; d <= DAYS; d++) {
      if (res[sid][d] !== WORK) continue;
      if (consecWork(res, sid, d) <= MAX_CONSEC) continue;
      // 非slot想定: d を休みに変換
      res[sid][d] = REST;
      added++;
    }
  }
  return added;
}

// ---------- 1ラン実行 ----------
function oneRun(runIdx) {
  const staffIds = Array.from({ length: N_STAFF }, (_, i) => `s${i}`);

  // res 初期化 (全日 undefined)
  const res = {};
  for (const sid of staffIds) {
    res[sid] = {};
  }

  // ── Pass A: 8個の休みをランダム配置 ──
  for (const sid of staffIds) {
    const available = Array.from({ length: DAYS }, (_, i) => i + 1);
    const picked = weightedSampleN(available, available.map(() => 1), TARGET_KYUKO);
    picked.forEach(d => { res[sid][d] = REST; });
  }

  const statA = checkViolationsPassA(res, staffIds);

  // ── Pass B: 未割当日を全部 WORK に ──
  for (const sid of staffIds) {
    for (let d = 1; d <= DAYS; d++) {
      if (!res[sid][d]) res[sid][d] = WORK;
    }
  }

  const statB = checkViolationsPassB(res, staffIds);

  // ── Pass C: 違反を修正 ──
  const passCAdded = simulatePassC(res, staffIds);

  return { statA, statB, passCAdded };
}

// ---------- N_RUNS 回実行して集計 ----------
let sumA_staff = 0, sumA_days = 0, sumA_max = 0;
let sumB_staff = 0, sumB_days = 0, sumB_max = 0;
let sumPassC = 0;

console.log(`\n=== PassA/B/C 実測シミュレーション (${N_RUNS}ラン) ===`);
console.log(`設定: 31日 / ${N_STAFF}名 / 公休目標${TARGET_KYUKO}日 / maxConsec=${MAX_CONSEC}\n`);

for (let i = 0; i < N_RUNS; i++) {
  const { statA, statB, passCAdded } = oneRun(i);
  sumA_staff += statA.totalStaff;
  sumA_days  += statA.totalDays;
  sumA_max    = Math.max(sumA_max, statA.maxSeen);
  sumB_staff += statB.totalStaff;
  sumB_days  += statB.totalDays;
  sumB_max    = Math.max(sumB_max, statB.maxSeen);
  sumPassC   += passCAdded;
  if (i < 3) {
    // 最初の3ランは詳細表示
    console.log(`[Run ${i+1}]`);
    console.log(`  PassA後: 超過職員=${statA.totalStaff}/${N_STAFF} 超過日数=${statA.totalDays} 最大連続=${statA.maxSeen}`);
    if (statA.rows.some(r => r.超過日数 > 0)) {
      statA.rows.filter(r => r.超過日数 > 0).forEach(r =>
        console.log(`    ${r.staffId}: 最大連続${r.最大連続}日 超過${r.超過日数}日`));
    }
    console.log(`  PassB後: 超過職員=${statB.totalStaff}/${N_STAFF} 超過日数=${statB.totalDays} 最大連続=${statB.maxSeen}`);
    console.log(`  PassC追加休み: ${passCAdded}日`);
    console.log('');
  }
}

console.log('=== 30ラン平均 ===');
console.log(`PassA後 超過職員数:  平均 ${(sumA_staff/N_RUNS).toFixed(1)} / ${N_STAFF}名  (超過日数合計 平均 ${(sumA_days/N_RUNS).toFixed(1)})  最大連続(全ラン) ${sumA_max}日`);
console.log(`PassB後 超過職員数:  平均 ${(sumB_staff/N_RUNS).toFixed(1)} / ${N_STAFF}名  (超過日数合計 平均 ${(sumB_days/N_RUNS).toFixed(1)})  最大連続(全ラン) ${sumB_max}日`);
console.log(`PassC追加休み:      平均 ${(sumPassC/N_RUNS).toFixed(1)}日 / ラン`);
console.log('');
console.log('【判定基準】');
console.log('  PassA後から大量違反 → PassA均等化が根本対策');
console.log('  PassA後は少なく PassB後に急増 → PassB勤務配置ロジックが原因');
