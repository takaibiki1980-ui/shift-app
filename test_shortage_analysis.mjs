// shortage増加分析スクリプト
// G-1/G-2 各単独・組合せ × 外国人人数 × rr=high人数のクロス検証

import { autoGenerate } from './src/shiftEngine.js';

const YEAR = 2026, MONTH = 5;
const N_RUNS = 20;
const days = new Date(YEAR, MONTH + 1, 0).getDate(); // 30

function getRelocationRisk(s) {
  const fy = s.facilityYears, fl = s.floorYears;
  if (fy == null || fl == null) return 'low';
  return (fy >= 2 && fl < 0.5) ? 'high' : (fy >= 1 && fl < 0.3) ? 'medium' : 'low';
}

// ── 部署設定（夜勤2枠、maxStaff明示） ───────────────────────────────
const dept = {
  id: 'kaigo1',
  shiftTypes: ['早番', '日勤', '遅番', '夜勤'],
  minStaff:   { '早番': 1, '日勤': 2, '遅番': 1, '夜勤': 2 },
  maxStaff:   { '早番': 1, '遅番': 1, '夜勤': 2 },
  maxConsecutive: 5, customShiftDefs: [], intervalThreshold: null,
  roleShiftTypes: { '介護補助': ['日勤'] },
};

// ── スタッフファクトリ ────────────────────────────────────────────
// nightOk=true スタッフを固定8名（実運用相当）+ nightOk=false 2名
// nForeign: foreignNightSupportRequired=true の人数（nightMax=5）
// nHigh:    rr=high の人数（facilityYears=2.5, floorYears=0.3）
function buildStaff(nForeign, nHigh) {
  const list = [];
  // nightOk=true: 8名
  for (let i = 0; i < 8; i++) {
    const isForeign = i >= (8 - nForeign);
    const supporterIdx = i;                          // 0-origin
    const isHigh = !isForeign && supporterIdx < nHigh;
    list.push({
      id: `k${i}`, name: `スタッフ${i}`, dept: 'kaigo1',
      role: isForeign ? '特定技能' : '介護職員',
      nightOk: true,
      nightMax: isForeign ? 5 : 8,
      kyukoDays: 8,
      facilityYears: isForeign ? null : (isHigh ? 2.5 : 4.0),
      floorYears:    isForeign ? null : (isHigh ? 0.3 : 3.0),
      foreignNightSupportRequired: isForeign,
      kiboByMonth: {}, yukyuByMonth: {},
      shiftRequestsByMonth: {}, kyukoDaysByMonth: {},
      kiboNightPreference: 0,
    });
  }
  // nightOk=false: 2名（介護補助）
  for (let i = 8; i < 10; i++) {
    list.push({
      id: `k${i}`, name: `補助${i}`, dept: 'kaigo1',
      role: '介護補助', nightOk: false, nightMax: 0, kyukoDays: 8,
      facilityYears: null, floorYears: null,
      foreignNightSupportRequired: false,
      kiboByMonth: {}, yukyuByMonth: {},
      shiftRequestsByMonth: {}, kyukoDaysByMonth: {},
      kiboNightPreference: 0,
    });
  }
  return list;
}

// ── フラグなし版スタッフ（比較基準） ──────────────────────────────
function stripFlags(staffList) {
  return staffList.map(s => ({
    ...s,
    foreignNightSupportRequired: false,
    facilityYears: null, floorYears: null,
  }));
}

// ── 1回分析 ─────────────────────────────────────────────────────
function analyze(shifts, staffList) {
  const ds = staffList.filter(s => s.dept === dept.id);
  let nightShortage = 0, totalShortage = 0, minViolDays = 0;
  let g1Fail = 0, g1Days = 0;

  for (let d = 1; d <= days; d++) {
    for (const [k, minC] of Object.entries(dept.minStaff)) {
      const cnt = ds.filter(s => shifts[s.id]?.[d] === k).length;
      if (cnt < minC) {
        const lack = minC - cnt;
        totalShortage += lack;
        minViolDays++;
        if (k === '夜勤') nightShortage += lack;
      }
    }
    const nightStaff = ds.filter(s => shifts[s.id]?.[d] === '夜勤');
    const hasForeign = nightStaff.some(s => s.foreignNightSupportRequired);
    if (hasForeign) {
      g1Days++;
      if (!nightStaff.some(s => !s.foreignNightSupportRequired)) g1Fail++;
    }
  }

  const nightCounts = ds.filter(s => s.nightOk)
    .map(s => Object.values(shifts[s.id] || {}).filter(v => v === '夜勤').length);
  const nightMax = nightCounts.length ? Math.max(...nightCounts) : 0;
  const nightMin = nightCounts.length ? Math.min(...nightCounts) : 0;

  return { totalShortage, nightShortage, minViolDays, g1Days, g1Fail, nightMax, nightMin };
}

function runBatch(staffList, n = N_RUNS) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, {});
    results.push(analyze(shifts, staffList));
  }
  const avg = (key) => (results.reduce((s, r) => s + r[key], 0) / n).toFixed(2);
  const g1rate = () => {
    const d = results.reduce((s, r) => s + r.g1Days, 0);
    const f = results.reduce((s, r) => s + r.g1Fail, 0);
    return d > 0 ? (((d - f) / d) * 100).toFixed(1) : '—';
  };
  return {
    totalShortage:  parseFloat(avg('totalShortage')),
    nightShortage:  parseFloat(avg('nightShortage')),
    minViolDays:    parseFloat(avg('minViolDays')),
    nightSpread:    parseFloat((results.reduce((s, r) => s + (r.nightMax - r.nightMin), 0) / n).toFixed(2)),
    g1Rate:         g1rate(),
    raw: results,
  };
}

const HR = '━'.repeat(68);
const hr = '─'.repeat(68);

console.log('\n' + '='.repeat(68));
console.log('shortage増加分析レポート');
console.log(`対象月: ${YEAR}年${MONTH + 1}月  各${N_RUNS}回平均  夜勤2枠構成`);
console.log('='.repeat(68));

// ══════════════════════════════════════════════════════════════════
// Part 1: G-1単独 / G-2単独 / 両方 の寄与率分解
// ══════════════════════════════════════════════════════════════════
console.log(`\n${HR}\n【Part 1】shortage増加の主因分解（G-1寄与 vs G-2寄与）\n${HR}`);
console.log('構成: 外国人2名 + rr=high 2名 (Phase 2と同一)  ※フラグOFF=比較基準\n');

const s_base     = buildStaff(2, 2);  // 外国人2名 + rr=high 2名
const s_baseOff  = stripFlags(s_base);
const s_g1only   = s_base.map(s => ({ ...s, facilityYears: null, floorYears: null })); // G-1のみ(rr=low)
const s_g2only   = s_base.map(s => ({ ...s, foreignNightSupportRequired: false }));     // G-2のみ(外国人フラグOFF)

process.stdout.write('計算中...');
const r_off    = runBatch(s_baseOff);   process.stdout.write(' 1/4');
const r_g1only = runBatch(s_g1only);   process.stdout.write(' 2/4');
const r_g2only = runBatch(s_g2only);   process.stdout.write(' 3/4');
const r_both   = runBatch(s_base);     process.stdout.write(' 4/4\n\n');

const dTotal  = r_both.totalShortage  - r_off.totalShortage;
const dNight  = r_both.nightShortage  - r_off.nightShortage;
const dG1     = r_g1only.totalShortage - r_off.totalShortage;
const dG2     = r_g2only.totalShortage - r_off.totalShortage;

console.log(`${'シナリオ'.padEnd(24)} ${'total shortage'.padStart(14)} ${'夜勤shortage'.padStart(12)} ${'minViol日'.padStart(10)} ${'G-1同席率'.padStart(10)}`);
console.log(hr);
console.log(`${'フラグなし(基準)'.padEnd(24)} ${String(r_off.totalShortage).padStart(14)} ${String(r_off.nightShortage).padStart(12)} ${String(r_off.minViolDays).padStart(10)} ${'—'.padStart(10)}`);
console.log(`${'G-1のみON'.padEnd(24)} ${String(r_g1only.totalShortage).padStart(14)} ${String(r_g1only.nightShortage).padStart(12)} ${String(r_g1only.minViolDays).padStart(10)} ${(r_g1only.g1Rate+'%').padStart(10)}`);
console.log(`${'G-2のみON'.padEnd(24)} ${String(r_g2only.totalShortage).padStart(14)} ${String(r_g2only.nightShortage).padStart(12)} ${String(r_g2only.minViolDays).padStart(10)} ${'—'.padStart(10)}`);
console.log(`${'G-1+G-2両方ON'.padEnd(24)} ${String(r_both.totalShortage).padStart(14)} ${String(r_both.nightShortage).padStart(12)} ${String(r_both.minViolDays).padStart(10)} ${(r_both.g1Rate+'%').padStart(10)}`);
console.log(hr);

const g1Pct = dTotal > 0 ? (dG1 / dTotal * 100).toFixed(0) : '—';
const g2Pct = dTotal > 0 ? (dG2 / dTotal * 100).toFixed(0) : '—';
console.log(`\n▸ shortage増加: +${dTotal.toFixed(2)} (対基準)`);
console.log(`  うち夜勤shortage増加: +${dNight.toFixed(2)}`);
console.log(`  G-1単独寄与: +${dG1.toFixed(2)} (${g1Pct}%)`);
console.log(`  G-2単独寄与: +${dG2.toFixed(2)} (${g2Pct}%)`);
console.log(`\n▸ 主因: ${parseFloat(g1Pct) >= parseFloat(g2Pct) ? 'G-1（外国人サポート強制ペアリング）' : 'G-2（rr=high 夜勤後回し）'}`);
console.log(`  理由: G-1はサポーター確保のため夜勤2人が必須になり、`);
console.log(`        人員が不足する日に shortage が発生しやすくなる`);

// ══════════════════════════════════════════════════════════════════
// Part 2: 外国人人数別シミュレーション
// ══════════════════════════════════════════════════════════════════
console.log(`\n${HR}\n【Part 2】外国人サポート対象人数別 shortage 比較\n${HR}`);
console.log('rr=high=0名固定  nightOk合計=8名\n');

console.log(`${'外国人数'.padEnd(10)} ${'total shortage'.padStart(14)} ${'夜勤shortage'.padStart(12)} ${'G-1同席率'.padStart(10)} ${'夜勤偏り'.padStart(8)}`);
console.log(hr);

process.stdout.write('計算中...');
const foreignResults = [];
for (let nF = 0; nF <= 3; nF++) {
  const staffOn  = buildStaff(nF, 0);
  const staffOff = stripFlags(staffOn);
  const rOff = runBatch(staffOff);
  const rOn  = runBatch(staffOn);
  foreignResults.push({ nF, rOff, rOn });
  process.stdout.write(` ${nF}`);
}
console.log('\n');

for (const { nF, rOff, rOn } of foreignResults) {
  const dS = (rOn.totalShortage - rOff.totalShortage).toFixed(2);
  const sign = parseFloat(dS) >= 0 ? '+' : '';
  console.log(`外国人${nF}名 (基準)`);
  console.log(`  フラグなし: total=${rOff.totalShortage} 夜=${rOff.nightShortage}`);
  console.log(`  フラグあり: total=${rOn.totalShortage} 夜=${rOn.nightShortage}  G-1同席率=${rOn.g1Rate}%  偏り=${rOn.nightSpread}  Δ=${sign}${dS}`);
}

console.log('\n■ 夜勤surplus不足の構造的限界:');
console.log('  nightOk=8名, minStaff["夜勤"]=2 の場合:');
console.log('  夜勤slot=30日×2=60  8名が互いに3日サイクルで回ると理論上限≒8×(30/3)=80 slot');
console.log('  外国人nightMax=5 × N名だけ容量が減る → N増加で不足リスク上昇');

// ══════════════════════════════════════════════════════════════════
// Part 3: rr=high人数別シミュレーション
// ══════════════════════════════════════════════════════════════════
console.log(`\n${HR}\n【Part 3】rr=high 人数別 shortage 比較\n${HR}`);
console.log('外国人=2名固定  nightOk合計=8名\n');

console.log(`${'rr=high数'.padEnd(10)} ${'total shortage'.padStart(14)} ${'夜勤shortage'.padStart(12)} ${'G-1同席率'.padStart(10)} ${'夜勤偏り'.padStart(8)}`);
console.log(hr);

process.stdout.write('計算中...');
const highResults = [];
for (let nH = 0; nH <= 2; nH++) {
  const staffOn  = buildStaff(2, nH);
  const staffOff = stripFlags(staffOn);
  const rOff = runBatch(staffOff);
  const rOn  = runBatch(staffOn);
  highResults.push({ nH, rOff, rOn });
  process.stdout.write(` ${nH}`);
}
console.log('\n');

for (const { nH, rOff, rOn } of highResults) {
  const dS = (rOn.totalShortage - rOff.totalShortage).toFixed(2);
  const sign = parseFloat(dS) >= 0 ? '+' : '';
  console.log(`rr=high ${nH}名 (基準)`);
  console.log(`  フラグなし: total=${rOff.totalShortage} 夜=${rOff.nightShortage}`);
  console.log(`  フラグあり: total=${rOn.totalShortage} 夜=${rOn.nightShortage}  G-1同席率=${rOn.g1Rate}%  偏り=${rOn.nightSpread}  Δ=${sign}${dS}`);
}

// ══════════════════════════════════════════════════════════════════
// Part 4: クロス表（外国人 × rr=high）
// ══════════════════════════════════════════════════════════════════
console.log(`\n${HR}\n【Part 4】shortage クロス表 (外国人数 × rr=high数)\n${HR}`);
console.log('数値 = フラグあり時のtotal shortage  (Δ=フラグなし比)\n');

process.stdout.write('計算中 (12パターン)...');
const crossData = {};
for (let nF = 0; nF <= 3; nF++) {
  crossData[nF] = {};
  for (let nH = 0; nH <= 2; nH++) {
    const staffOn  = buildStaff(nF, nH);
    const staffOff = stripFlags(staffOn);
    const rOff = runBatch(staffOff, 15);
    const rOn  = runBatch(staffOn,  15);
    crossData[nF][nH] = { rOff, rOn };
    process.stdout.write('.');
  }
}
console.log('\n');

// ヘッダ
console.log(`${''.padEnd(14)} ${'rr=high 0名'.padStart(18)} ${'rr=high 1名'.padStart(18)} ${'rr=high 2名'.padStart(18)}`);
console.log(hr);
for (let nF = 0; nF <= 3; nF++) {
  let row = `外国人${nF}名`.padEnd(14);
  for (let nH = 0; nH <= 2; nH++) {
    const { rOff, rOn } = crossData[nF][nH];
    const dS = (rOn.totalShortage - rOff.totalShortage).toFixed(1);
    const sign = parseFloat(dS) >= 0 ? '+' : '';
    row += `  ${rOn.totalShortage}(${sign}${dS})`.padStart(18);
  }
  console.log(row);
}
console.log(hr);
console.log('書式: フラグあり shortage値(Δ)');

// ══════════════════════════════════════════════════════════════════
// Part 5: 推奨設定値
// ══════════════════════════════════════════════════════════════════
console.log(`\n${HR}\n【Part 5】推奨設定値\n${HR}`);

// 許容shortage増加を +5以下 として推奨範囲を決定
const THRESHOLD = 5.0;
console.log(`許容shortage増加の閾値: +${THRESHOLD}以下を「安全」と定義\n`);

console.log('■ 外国人サポート対象(G-1)の推奨上限:');
for (const { nF, rOff, rOn } of foreignResults) {
  const dS = rOn.totalShortage - rOff.totalShortage;
  const ok = dS <= THRESHOLD;
  const g1 = rOff.totalShortage > 0 ? rOn.g1Rate : '—';
  console.log(`  外国人${nF}名: Δ${dS>=0?'+':''}${dS.toFixed(1)}  G-1同席率=${rOn.g1Rate}%  ${ok ? '✓ 安全' : '⚠️  要検討'}`);
}

console.log('\n■ rr=high対象(G-2)の推奨上限:');
for (const { nH, rOff, rOn } of highResults) {
  const dS = rOn.totalShortage - rOff.totalShortage;
  const ok = dS <= THRESHOLD;
  console.log(`  rr=high ${nH}名: Δ${dS>=0?'+':''}${dS.toFixed(1)}  夜勤偏り=${rOn.nightSpread}  ${ok ? '✓ 安全' : '⚠️  要検討'}`);
}

console.log('\n■ 総合推奨:');
console.log('  1. nightOk合計8名・夜勤2枠構成での推奨フラグ上限を以下に示す');

// Find the max nF and nH where delta <= THRESHOLD
let recF = 0, recH = 0;
for (const { nF, rOff, rOn } of foreignResults) {
  if (rOn.totalShortage - rOff.totalShortage <= THRESHOLD) recF = nF;
}
for (const { nH, rOff, rOn } of highResults) {
  if (rOn.totalShortage - rOff.totalShortage <= THRESHOLD) recH = nH;
}
console.log(`     G-1: 外国人最大 ${recF}名まで (Δshortage ≤ ${THRESHOLD})`);
console.log(`     G-2: rr=high最大 ${recH}名まで (Δshortage ≤ ${THRESHOLD})`);
console.log('');
console.log('  2. nightOkスタッフが少ない部署ほど影響大。8名未満の場合は閾値を引き下げ推奨');
console.log('  3. G-2(rr=high)はshortageより夜勤偏り増の副作用を主に確認すること');
console.log('     → 偏りが4回超の場合は管理者が手動でrr=high職員に夜勤を追加割当可能');
console.log('');
