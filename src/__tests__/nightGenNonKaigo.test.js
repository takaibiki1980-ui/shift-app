/**
 * kaigo1/kaigo2 以外の部署における夜勤生成テスト
 *
 * 確認事項:
 *   a. 夜勤シフトが実際に生成されること（0件なら失敗）
 *   b. 夜勤の翌日に「明け」が入ること
 *   c. nightOk:false のスタッフが夜勤に入らないこと
 */
import { describe, test, expect } from 'vitest';
import { bestOfN, getDays } from '../engine/core.js';

const YEAR  = 2026;
const MONTH = 6; // 7月（0-indexed）

const dept = {
  id: 'test_night_dept',          // kaigo1/kaigo2 以外のID
  label: 'テスト夜勤部署',
  shiftTypes: ['日勤', '夜勤'],
  minStaff:  { 日勤: 1, 夜勤: 1 },
  maxStaff:  { 日勤: 99, 夜勤: 1 },
  defaultKyukoDays: 8,
  maxConsecutive: 5,
  roles: ['職員'],
  // roleShiftTypes 未設定 → 全員全シフト可
};

const staffList = [
  { id: 'tn_0', dept: 'test_night_dept', name: 'スタッフA', role: '職員', nightOk: true,  nightMax: 5, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
  { id: 'tn_1', dept: 'test_night_dept', name: 'スタッフB', role: '職員', nightOk: true,  nightMax: 5, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
  { id: 'tn_2', dept: 'test_night_dept', name: 'スタッフC', role: '職員', nightOk: false, nightMax: 0, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
  { id: 'tn_3', dept: 'test_night_dept', name: 'スタッフD', role: '職員', nightOk: false, nightMax: 0, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
];

describe('kaigo1/kaigo2以外の部署における夜勤生成', () => {
  let shifts;
  const days = getDays(YEAR, MONTH);

  // beforeAll 相当: bestOfN を1回だけ呼ぶ
  // vitest では describe 内のトップレベルで await は使えないため
  // 各テストで遅延初期化する
  const getShifts = (() => {
    let cache = null;
    return () => {
      if (!cache) {
        const result = bestOfN(staffList, dept, YEAR, MONTH, {}, {}, 10);
        cache = result.shifts;
      }
      return cache;
    };
  })();

  test('a. 夜勤シフトが1件以上生成されること', () => {
    const s = getShifts();
    let nightCount = 0;
    for (const st of staffList) {
      for (let d = 1; d <= days; d++) {
        if (s[st.id]?.[d] === '夜勤') nightCount++;
      }
    }
    expect(nightCount).toBeGreaterThan(0);
  });

  test('b. 夜勤の翌日に「明け」が入ること', () => {
    const s = getShifts();
    let nightDays = [];
    for (const st of staffList) {
      for (let d = 1; d <= days; d++) {
        if (s[st.id]?.[d] === '夜勤') nightDays.push({ id: st.id, d });
      }
    }
    // 夜勤が1件以上あることを前提とし、全夜勤の翌日を確認
    for (const { id, d } of nightDays) {
      if (d < days) {
        expect(s[id]?.[d + 1]).toBe('明け');
      }
    }
  });

  test('c. nightOk:false のスタッフが夜勤に入らないこと', () => {
    const s = getShifts();
    const nightNgStaffs = staffList.filter(st => !st.nightOk);
    for (const st of nightNgStaffs) {
      for (let d = 1; d <= days; d++) {
        expect(s[st.id]?.[d]).not.toBe('夜勤');
      }
    }
  });
});
