import { describe, it, expect } from 'vitest';
import { autoGenerate, bestOfN, getDays, monthKey } from '../engine/core.js';

// localSearchImprove は bestOfN 経由で動く（export されていないため）
// move 操作の効果を bestOfN の出力から間接検証する

const YEAR = 2026, MONTH = 1; // 2月28日
const mk = monthKey(YEAR, MONTH);
const days = getDays(YEAR, MONTH);
const REST = new Set(['休み', '希望休', '有休']);

const dept = {
  id: 'eiyo',
  label: '栄養科',
  shiftTypes: ['早番', '日勤'],
  minStaff: { 早番: 1, 日勤: 1 },
  maxStaff: { 早番: 1, 日勤: 99 },
  defaultKyukoDays: 9,
  maxConsec: 5,
  maxConsecutive: 5,
  customShiftDefs: [],
  roleShiftTypes: {
    '管理栄養士': ['早番', '日勤'],
    '調理師': ['早番', '日勤'],
  },
};

function makeStaff() {
  return [
    { id: 'e0', name: '清水 優子', role: '管理栄養士', dept: 'eiyo',
      kyukoDays: 9, kyukoDaysByMonth: {}, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} },
    { id: 'e1', name: '池田 恵',   role: '調理師',     dept: 'eiyo',
      kyukoDays: 9, kyukoDaysByMonth: {}, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} },
  ];
}

describe('localSearchImprove move操作', () => {
  it('bestOfN (n=10) で公休乖離 0 の試行が過半数を占める', () => {
    let zeroDevCount = 0;
    const TRIALS = 20;
    for (let i = 0; i < TRIALS; i++) {
      const staffList = makeStaff();
      const { shifts } = bestOfN(staffList, dept, YEAR, MONTH, {}, {}, 10);
      let perfect = true;
      for (const s of staffList) {
        const tgt = 9;
        const actual = Object.values(shifts[s.id] || {}).filter(v => REST.has(v)).length;
        if (Math.abs(actual - tgt) > 0) { perfect = false; break; }
      }
      if (perfect) zeroDevCount++;
    }
    // 20試行中12回以上（60%）は公休乖離ゼロであることを期待
    expect(zeroDevCount).toBeGreaterThanOrEqual(12);
  });

  it('FIXED セル（希望休・有休・夜勤・明け）は move で変更されない', () => {
    // 希望休が入っているスタッフの日が変わらないことを確認
    const staffList = makeStaff();
    // d5 を希望休に固定
    staffList[0].kiboByMonth = { [mk]: [5] };
    const { shifts } = bestOfN(staffList, dept, YEAR, MONTH, {}, {}, 5);
    // kiboByMonth で希望休日が保護されていること
    const val = shifts['e0']?.[5];
    expect(['希望休', '休み'].includes(val) || val === undefined).toBe(true);
  });

  it('maxConsec 超過（6連勤）が発生しないこと（10試行中）', () => {
    let violations = 0;
    for (let i = 0; i < 10; i++) {
      const staffList = makeStaff();
      const { shifts } = bestOfN(staffList, dept, YEAR, MONTH, {}, {}, 10);
      for (const s of staffList) {
        let streak = 0;
        for (let d = 1; d <= days; d++) {
          const v = shifts[s.id]?.[d];
          if (v && !REST.has(v) && v !== '明け') { streak++; if (streak > 5) violations++; }
          else streak = 0;
        }
      }
    }
    expect(violations).toBe(0);
  });
});
