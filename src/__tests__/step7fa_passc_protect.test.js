/**
 * Phase5 Step7-FA: PassC 夜勤保護フラグ Before/After 実測
 *
 * debugProtectNight=false（Before）vs debugProtectNight=true（After）
 * 200試行 × kaigo1/kaigo2
 * 同一シード・同一条件
 */

import { describe, test, expect } from 'vitest';
import { autoGenerate, getDays, monthKey, enablePhaseSnaps, disablePhaseSnaps, getPhaseSnaps } from '../shiftEngine.js';

const SIMS  = 200;
const YEAR  = 2026, MONTH = 5;
const DAYS  = getDays(YEAR, MONTH);
const MK    = monthKey(YEAR, MONTH);

function makeDept(id) {
  return {
    id,
    shiftTypes:      ['早番','日勤','遅番','夜勤','明け','休み'],
    minStaff:        { '早番':1, '日勤':1, '遅番':1, '夜勤':1 },
    maxStaff:        { '早番':1, '日勤':99, '遅番':1, '夜勤':1 },
    maxConsecutive:  5,
    customShiftDefs: [],
    roleShiftTypes:  {},
    shiftTimes:      {},
  };
}

function makePRNG(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

function makeStaff(deptId, sim) {
  const rng = makePRNG(sim * 73 + (deptId === 'kaigo2' ? 50000 : 0));
  return Array.from({length:10}, (_,i) => {
    const idx = i+1;
    const nightOk = idx <= 6;
    const kyuko = Math.floor(rng()*3)+7;
    const kiboCount = rng()<0.4 ? (rng()<0.5?1:2) : 0;
    const kibo = [];
    for (let k=0; k<kiboCount; k++) {
      const d = Math.floor(rng()*28)+1;
      if (!kibo.includes(d)) kibo.push(d);
    }
    return {
      id:   `${deptId}_s${idx}`,
      name: `Staff${deptId}${idx}`,
      dept:  deptId,
      role:  'その他',
      nightOk,
      kyukoDays:        kyuko,
      kyukoDaysByMonth: {},
      kiboByMonth:      kibo.length ? {[MK]: kibo} : {},
      yukyuByMonth:     {},
      shiftRequestsByMonth: {},
      shiftRatio:       null,
      shiftRatioByMonth: null,
      facilityYears:    1 + rng()*4,
      floorYears:       1 + rng()*3,
      nightMax:         5,
      foreignNightSupportRequired: false,
      nightExcludeDays: new Set(),
      shiftRatioCorrection: {},
    };
  });
}

// 生成結果から指標を計算
function calcMetrics(shifts, staffList, dept) {
  const minStaff = dept.minStaff || {};
  let shortage = 0, nightShortage = 0, maxStaffViol = 0;
  let kyukoViolStaff = 0;
  const mk = MK;

  for (let d = 1; d <= DAYS; d++) {
    for (const [k, minC] of Object.entries(minStaff)) {
      const cnt = staffList.filter(s => shifts[s.id]?.[d] === k).length;
      if (cnt < minC) {
        shortage += minC - cnt;
        if (k === '夜勤') nightShortage += minC - cnt;
      }
    }
    for (const [k] of Object.entries(minStaff)) {
      const maxC = dept.maxStaff?.[k] ?? 99;
      const cnt = staffList.filter(s => shifts[s.id]?.[d] === k).length;
      if (cnt > maxC) maxStaffViol += cnt - maxC;
    }
  }

  for (const s of staffList) {
    const target = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const actual = Object.values(shifts[s.id] || {}).filter(v => v === '休み' || v === '希望休').length;
    if (actual !== target) kyukoViolStaff++;
  }

  return { shortage, nightShortage, maxStaffViol, kyukoViolStaff };
}

// PassCによる夜勤変更件数をカウント（phaseSnaps使用）
function countPassCNightChanges(snaps, staffList) {
  if (!snaps?.postStep2_night || !snaps?.postPassC) return 0;
  let count = 0;
  for (const s of staffList) {
    for (let d = 1; d <= DAYS; d++) {
      if (snaps.postStep2_night[s.id]?.[d] === '夜勤' && snaps.postPassC[s.id]?.[d] !== '夜勤') {
        count++;
      }
    }
  }
  return count;
}

describe('Step7-FA: PassC 夜勤保護 Before/After 実測', () => {
  test('200試行 × kaigo1/kaigo2 debugProtectNight=false vs true', () => {
    const deptIds = ['kaigo1', 'kaigo2'];

    const results = { before: {}, after: {} };
    for (const deptId of deptIds) {
      results.before[deptId] = { shortage: [], nightShortage: [], maxStaffViol: [], kyukoViol: [], score: [], time: [], passCNightChanges: [] };
      results.after[deptId]  = { shortage: [], nightShortage: [], maxStaffViol: [], kyukoViol: [], score: [], time: [], passCNightChanges: [] };
    }

    for (const deptId of deptIds) {
      const dept = makeDept(deptId);

      for (let sim = 0; sim < SIMS; sim++) {
        const staffList = makeStaff(deptId, sim);

        // Before: debugProtectNight=false
        {
          enablePhaseSnaps();
          const t0 = performance.now();
          const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, {}, { debugProtectNight: false }, {});
          const elapsed = performance.now() - t0;
          const snaps = getPhaseSnaps();
          disablePhaseSnaps();
          const m = calcMetrics(shifts, staffList, dept);
          const passCChanges = countPassCNightChanges(snaps, staffList);
          results.before[deptId].shortage.push(m.shortage);
          results.before[deptId].nightShortage.push(m.nightShortage);
          results.before[deptId].maxStaffViol.push(m.maxStaffViol);
          results.before[deptId].kyukoViol.push(m.kyukoViolStaff);
          results.before[deptId].time.push(elapsed);
          results.before[deptId].passCNightChanges.push(passCChanges);
        }

        // After: debugProtectNight=true
        {
          enablePhaseSnaps();
          const t0 = performance.now();
          const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, {}, { debugProtectNight: true }, {});
          const elapsed = performance.now() - t0;
          const snaps = getPhaseSnaps();
          disablePhaseSnaps();
          const m = calcMetrics(shifts, staffList, dept);
          const passCChanges = countPassCNightChanges(snaps, staffList);
          results.after[deptId].shortage.push(m.shortage);
          results.after[deptId].nightShortage.push(m.nightShortage);
          results.after[deptId].maxStaffViol.push(m.maxStaffViol);
          results.after[deptId].kyukoViol.push(m.kyukoViolStaff);
          results.after[deptId].time.push(elapsed);
          results.after[deptId].passCNightChanges.push(passCChanges);
        }
      }
    }

    // t値計算
    function tTest(a, b) {
      const n = a.length;
      const diffs = a.map((v, i) => v - b[i]);
      const mean = diffs.reduce((s, v) => s + v, 0) / n;
      const variance = diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
      const se = Math.sqrt(variance / n);
      return se === 0 ? 0 : mean / se;
    }

    function mu(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
    function sd(arr) {
      const m = mu(arr);
      return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
    }

    console.log('\n=== Step7-FA: PassC 夜勤保護 Before/After 実測結果 ===');
    console.log(`試行数: ${SIMS} × ${deptIds.length}部署`);

    for (const deptId of deptIds) {
      const B = results.before[deptId];
      const A = results.after[deptId];

      console.log(`\n── ${deptId} ──`);
      console.log('項目,Before(μ),After(μ),Δ,t値,判定');

      const rows = [
        { label: '①shortage/trial', bArr: B.shortage, aArr: A.shortage },
        { label: '②夜勤shortage', bArr: B.nightShortage, aArr: A.nightShortage },
        { label: '③公休違反スタッフ数', bArr: B.kyukoViol, aArr: A.kyukoViol },
        { label: '④maxStaff違反', bArr: B.maxStaffViol, aArr: A.maxStaffViol },
        { label: '⑥生成時間(ms)', bArr: B.time, aArr: A.time },
        { label: '⑦PassC夜勤変更件数', bArr: B.passCNightChanges, aArr: A.passCNightChanges },
      ];

      for (const { label, bArr, aArr } of rows) {
        const bMu = mu(bArr), aMu = mu(aArr);
        const delta = aMu - bMu;
        const t = tTest(bArr, aArr);
        const sig = Math.abs(t) > 1.96 ? (Math.abs(t) > 2.576 ? '★★' : '★') : '→有意差なし';
        console.log(`${label},${bMu.toFixed(3)},${aMu.toFixed(3)},${delta >= 0 ? '+' : ''}${delta.toFixed(3)},${t.toFixed(2)},${sig}`);
      }

      console.log(`\n  Before shortage 標準偏差: k=${sd(B.shortage).toFixed(3)}`);
      console.log(`  After  shortage 標準偏差: k=${sd(A.shortage).toFixed(3)}`);
      console.log(`  Before passCNightChanges μ=${mu(B.passCNightChanges).toFixed(2)}, After μ=${mu(A.passCNightChanges).toFixed(2)}`);
    }

    // 全体集計
    const allBShortage = [...results.before.kaigo1.shortage, ...results.before.kaigo2.shortage];
    const allAShortage = [...results.after.kaigo1.shortage,  ...results.after.kaigo2.shortage];
    const allBNight    = [...results.before.kaigo1.nightShortage, ...results.before.kaigo2.nightShortage];
    const allANight    = [...results.after.kaigo1.nightShortage,  ...results.after.kaigo2.nightShortage];

    console.log('\n── 全体（kaigo1+kaigo2 合計400試行） ──');
    console.log(`shortage Before μ=${mu(allBShortage).toFixed(3)}, After μ=${mu(allAShortage).toFixed(3)}, t=${tTest(allBShortage, allAShortage).toFixed(2)}`);
    console.log(`夜勤shortage Before μ=${mu(allBNight).toFixed(3)}, After μ=${mu(allANight).toFixed(3)}, t=${tTest(allBNight, allANight).toFixed(2)}`);

    expect(SIMS).toBe(200);
  }, 600000);
});
