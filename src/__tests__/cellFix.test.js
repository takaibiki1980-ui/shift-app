/**
 * セル固定機能テスト
 *  - 固定/解除の状態遷移（applyCellFix）
 *  - 固定セルが自動生成で変更されない（shiftRequestsByMonth ロック機構）
 *  - 固定解除で通常セルに戻る（生成が自由に埋める）
 *  - 有休固定時に有給残数が二重減算されない
 *  - 固定なしの生成が従来通り動く（非劣化）
 */
import { describe, test, expect } from 'vitest';
import { applyCellFix } from '../lib/cellFix.js';
import { computePaidLeaveConsumed } from '../lib/paidLeave.js';
import { autoGenerate, getDays, monthKey } from '../engine/core.js';

const YEAR = 2026, MONTH = 1; // 2月(28日)
const mk = monthKey(YEAR, MONTH);
const days = getDays(YEAR, MONTH);

function eiyoDept() {
  return {
    id: 'eiyo', shiftTypes: ['早番', '遅番', '日勤'],
    minStaff: { 早番: 1, 遅番: 1, 日勤: 1 }, maxStaff: { 早番: 1, 遅番: 1, 日勤: 99 },
    defaultKyukoDays: 9, maxConsec: 5, maxConsecutive: 5, customShiftDefs: [],
    roleShiftTypes: { '常勤': ['早番', '遅番', '日勤'] },
  };
}
function makeStaff(n = 4) {
  const b = { dept: 'eiyo', kyukoDays: 9, kyukoDaysByMonth: {}, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} };
  return Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'E' + i, role: '常勤', ...b }));
}

// ────────────────────────────────────────────────────────────────
describe('applyCellFix（固定/解除の状態遷移）', () => {
  test('固定: セル値を shiftRequestsByMonth に載せ fixedByMonth マーカーを立てる', () => {
    const s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {}, fixedByMonth: {} };
    const shifts = { e0: { 10: '早番' } };
    const r = applyCellFix(s, [['e0', 10]], true, shifts, YEAR, MONTH);
    expect(r.shiftRequestsByMonth[mk][10]).toBe('早番');
    expect(r.fixedByMonth[mk][10]).toBe(true);
  });

  test('空セルは固定しない', () => {
    const s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {}, fixedByMonth: {} };
    const r = applyCellFix(s, [['e0', 10]], true, { e0: {} }, YEAR, MONTH);
    expect(r.shiftRequestsByMonth[mk][10]).toBeUndefined();
    expect(r.fixedByMonth[mk][10]).toBeUndefined();
  });

  test('解除: shiftRequestsByMonth と fixedByMonth の両方から削除', () => {
    const s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: { [mk]: { 10: '早番' } }, fixedByMonth: { [mk]: { 10: true } } };
    const r = applyCellFix(s, [['e0', 10]], false, { e0: { 10: '早番' } }, YEAR, MONTH);
    expect(r.shiftRequestsByMonth[mk][10]).toBeUndefined();
    expect(r.fixedByMonth[mk][10]).toBeUndefined();
  });

  test('固定→解除で固定前の状態に戻る（希望勤務も残らない）', () => {
    let s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {}, fixedByMonth: {} };
    s = applyCellFix(s, [['e0', 5]], true, { e0: { 5: '遅番' } }, YEAR, MONTH);
    s = applyCellFix(s, [['e0', 5]], false, { e0: { 5: '遅番' } }, YEAR, MONTH);
    expect(s.shiftRequestsByMonth[mk][5]).toBeUndefined();
    expect(s.fixedByMonth[mk][5]).toBeUndefined();
  });

  test('対象外スタッフは変更しない（同一参照）', () => {
    const s = { id: 'e1', dept: 'eiyo', shiftRequestsByMonth: {}, fixedByMonth: {} };
    expect(applyCellFix(s, [['e0', 5]], true, { e0: { 5: '早番' } }, YEAR, MONTH)).toBe(s);
  });
});

// ────────────────────────────────────────────────────────────────
describe('固定セルが自動生成で変更されない（shiftRequestsByMonthロック）', () => {
  test('固定した勤務シフト（役職許可内）が生成後も保持される', () => {
    const staff = makeStaff();
    // e0 の d10 を「遅番」に固定
    staff[0] = applyCellFix(staff[0], [['e0', 10]], true, { e0: { 10: '遅番' } }, YEAR, MONTH);
    for (let i = 0; i < 15; i++) {
      const { shifts } = autoGenerate(staff, eiyoDept(), YEAR, MONTH, {}, {}, {});
      expect(shifts.e0[10]).toBe('遅番');
    }
  });

  test('固定した休み・有休も生成後に保持される', () => {
    const staff = makeStaff();
    staff[0] = applyCellFix(staff[0], [['e0', 8]], true, { e0: { 8: '休み' } }, YEAR, MONTH);
    staff[1] = applyCellFix(staff[1], [['e1', 12]], true, { e1: { 12: '有休' } }, YEAR, MONTH);
    for (let i = 0; i < 15; i++) {
      const { shifts } = autoGenerate(staff, eiyoDept(), YEAR, MONTH, {}, {}, {});
      expect(shifts.e0[8]).toBe('休み');
      expect(shifts.e1[12]).toBe('有休');
    }
  });

  test('固定を解除すると、その日は生成で他の値になり得る（ロックが外れる）', () => {
    // d10 を遅番固定 → 解除。固定なしなら生成が自由に埋める＝常に遅番とは限らない
    let base = makeStaff()[0];
    base = applyCellFix(base, [['e0', 10]], true, { e0: { 10: '遅番' } }, YEAR, MONTH);
    base = applyCellFix(base, [['e0', 10]], false, { e0: { 10: '遅番' } }, YEAR, MONTH);
    // shiftRequestが空＝ロックなし。生成結果のd10は固定されない（値の一貫性を保証しない）
    expect(base.shiftRequestsByMonth[mk][10]).toBeUndefined();
    let varied = false; let first = null;
    for (let i = 0; i < 30; i++) {
      const staff = makeStaff(); staff[0] = base;
      const { shifts } = autoGenerate(staff, eiyoDept(), YEAR, MONTH, {}, {}, {});
      if (first === null) first = shifts.e0[10];
      if (shifts.e0[10] !== first) { varied = true; break; }
    }
    expect(varied).toBe(true); // ロックが外れ、生成で変動する
  });
});

// ────────────────────────────────────────────────────────────────
describe('有休固定と有給残数の二重減算防止', () => {
  test('セル値"有休"と yukyuByMonth が同日に重複しても消費は1.0（二重にならない）', () => {
    const s = { id: 'e0', dept: 'eiyo', yukyuByMonth: { [mk]: [10] } };
    const shifts = { e0: { 10: '有休' } }; // 固定でセルが有休、かつyukyuByMonthにも10
    expect(computePaidLeaveConsumed(shifts, [s], 'eiyo', YEAR, MONTH)).toEqual({ e0: 1 });
  });

  test('固定した有休（shiftRequests経由でセルが有休）は消費1.0で計上される', () => {
    let s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {}, fixedByMonth: {}, yukyuByMonth: {} };
    s = applyCellFix(s, [['e0', 15]], true, { e0: { 15: '有休' } }, YEAR, MONTH);
    // 生成後のセルは有休（shiftRequestsで固定）
    const { shifts } = autoGenerate([s, ...makeStaff().slice(1)], eiyoDept(), YEAR, MONTH, {}, {}, {});
    expect(shifts.e0[15]).toBe('有休');
    expect(computePaidLeaveConsumed(shifts, [s], 'eiyo', YEAR, MONTH)).toEqual({ e0: 1 });
  });
});

// ────────────────────────────────────────────────────────────────
describe('非劣化: 固定なしの生成が従来通り動く', () => {
  test('固定なしで生成が完了し、maxStaff上限(早番/遅番<=1)を守る', () => {
    const dept = eiyoDept();
    for (let i = 0; i < 20; i++) {
      const { shifts } = autoGenerate(makeStaff(), dept, YEAR, MONTH, {}, {}, {});
      const ds = makeStaff();
      for (let d = 1; d <= days; d++) {
        for (const k of ['早番', '遅番']) {
          const cnt = ds.filter(s => shifts[s.id]?.[d] === k).length;
          expect(cnt).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
