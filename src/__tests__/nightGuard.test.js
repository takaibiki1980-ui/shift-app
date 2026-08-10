/**
 * 夜勤ソートの「翌日確定癖ガード」(NEXT_DAY_HABIT_GUARD) の統合テスト。
 * _nightCandSort は autoGenerate 内部クロージャのため、autoGenerate 経由で挙動を検証する。
 * 2026-08-01 は土曜(dow=6)。翌日 8/2 は日曜(dow=0)。
 * 「土曜に夜勤を渡すと翌日=日曜が明けで確定」→ 日曜に確定勤務癖があると潰れる、という構図。
 */
import { describe, test, expect } from 'vitest';
import { autoGenerate } from '../engine/core.js';

const dept = { id: 'k', shiftTypes: ['早番', '日勤', '遅番', '夜勤'],
  minStaff: { 日勤: 2, 夜勤: 1 }, maxStaff: { 早番: 1, 遅番: 1, 夜勤: 1 }, maxConsecutive: 5, roleShiftTypes: {} };

function mkTrendBase(names) {
  const t = { _monthCounts: {} };
  for (const n of names) {
    t[n] = { dowShiftObs: Array.from({ length: 7 }, () => ({})), dowWorkObs: [0,0,0,0,0,0,0],
      dowShiftRate: Array.from({ length: 7 }, () => ({})), dowRestRate: Array(7).fill(0.3) };
    t._monthCounts[n] = 4;
  }
  return t;
}
function mkStaff(specs) {
  return specs.map((sp, i) => ({ id: sp.id, name: sp.id, dept: 'k', role: 'x',
    nightOk: sp.nightOk, nightMax: 8, kyukoDays: 8, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} }));
}
// 日勤要員（夜勤不可）を4名足して日勤 minStaff を満たす
const fillers = Array.from({ length: 4 }, (_, i) => ({ id: 'f' + i, nightOk: false }));

describe('夜勤 翌日確定癖ガード', () => {
  test('翌日(日)に確定癖を持つ s0 は土曜夜勤を避け、癖なし s1 が取る（20回とも s0=0）', () => {
    const staff = mkStaff([{ id: 's0', nightOk: true }, { id: 's1', nightOk: true }, ...fillers]);
    const trend = mkTrendBase(['s0', 's1']);
    trend['s0'].dowShiftObs[0] = { 日勤: 8 }; trend['s0'].dowWorkObs[0] = 8; // 日曜=日勤 8/8 確定癖
    let s0d1 = 0;
    for (let r = 0; r < 20; r++) {
      const { shifts } = autoGenerate(staff, dept, 2026, 7, {}, trend, {});
      if (shifts['s0'][1] === '夜勤') s0d1++;
    }
    expect(s0d1).toBe(0); // ガードで s0 は土曜(1日)夜勤に入らない
  });

  test('must-fill: 夜勤可が s0 のみなら、翌日確定癖があっても s0 に夜勤が入る（プール不変）', () => {
    const staff = mkStaff([{ id: 's0', nightOk: true }, { id: 's1', nightOk: false }, ...fillers]);
    const trend = mkTrendBase(['s0', 's1']);
    trend['s0'].dowShiftObs[0] = { 日勤: 8 }; trend['s0'].dowWorkObs[0] = 8;
    const { shifts } = autoGenerate(staff, dept, 2026, 7, {}, trend, {});
    // 8/1(土)に夜勤が1枠必ず埋まり、担い手は s0 のみ
    expect(shifts['s0'][1]).toBe('夜勤');
  });

  test('⓪強い夜勤癖が優先: s0 が土曜に夜勤の確定癖を持つなら、翌日癖があってもガードに勝ち s0 が取る', () => {
    const staff = mkStaff([{ id: 's0', nightOk: true }, { id: 's1', nightOk: true }, ...fillers]);
    const trend = mkTrendBase(['s0', 's1']);
    trend['s0'].dowShiftObs[6] = { 夜勤: 8 }; trend['s0'].dowWorkObs[6] = 8; // 土曜=夜勤 確定癖(⓪)
    trend['s0'].dowShiftObs[0] = { 日勤: 8 }; trend['s0'].dowWorkObs[0] = 8; // 日曜=日勤 確定癖(翌日)
    let s0d1 = 0;
    for (let r = 0; r < 20; r++) {
      const { shifts } = autoGenerate(staff, dept, 2026, 7, {}, trend, {});
      if (shifts['s0'][1] === '夜勤') s0d1++;
    }
    expect(s0d1).toBe(20); // ⓪(強い夜勤癖)がガードより優先 → s0 が土曜夜勤を取る
  });
});
