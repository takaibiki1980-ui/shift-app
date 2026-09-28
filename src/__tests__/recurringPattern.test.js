import { describe, test, expect } from 'vitest';
import {
  patternDays, expandPatternsForMonth, applyPatternsToStaff, NON_WORK_SHIFTS,
} from '../lib/recurringPattern.js';

// 2026年9月(month=8): 火(dow2)=1,8,15,22,29 / 日(dow0)=6,13,20,27
const Y = 2026, M = 8, MK = '2026-9';

describe('patternDays（第◯曜/毎週の日付計算）', () => {
  test('毎週 日曜', () => {
    expect(patternDays(Y, M, { kind: 'weekly', dow: 0 })).toEqual([6, 13, 20, 27]);
  });
  test('毎週 火曜', () => {
    expect(patternDays(Y, M, { kind: 'weekly', dow: 2 })).toEqual([1, 8, 15, 22, 29]);
  });
  test('第2 火曜 = 8', () => {
    expect(patternDays(Y, M, { kind: 'nth', nth: 2, dow: 2 })).toEqual([8]);
  });
  test('第5 火曜 = 29（存在する月）', () => {
    expect(patternDays(Y, M, { kind: 'nth', nth: 5, dow: 2 })).toEqual([29]);
  });
  test('第5 火曜が無い月は空（2026-2 火=3,10,17,24）', () => {
    expect(patternDays(2026, 1, { kind: 'nth', nth: 5, dow: 2 })).toEqual([]);
  });
  test('うるう年 2月(2024-2) 第4 日曜 = 25', () => {
    expect(patternDays(2024, 1, { kind: 'nth', nth: 4, dow: 0 })).toEqual([25]);
  });
  test('不正入力は空', () => {
    expect(patternDays(Y, M, null)).toEqual([]);
    expect(patternDays(Y, M, {})).toEqual([]);
  });
});

describe('expandPatternsForMonth（展開・個別優先・冪等）', () => {
  test('毎週日曜=休み を展開', () => {
    const r = expandPatternsForMonth({ year: Y, month: M, patterns: [{ kind: 'weekly', dow: 0, shift: '休み' }], sr: {}, applied: {}, overrides: {} });
    expect(r.sr).toEqual({ 6: '休み', 13: '休み', 20: '休み', 27: '休み' });
    expect(r.applied).toEqual({ 6: '休み', 13: '休み', 20: '休み', 27: '休み' });
  });

  test('複数パターン同時（毎週日=休み＋第2火=遅番）', () => {
    const r = expandPatternsForMonth({ year: Y, month: M, patterns: [
      { kind: 'weekly', dow: 0, shift: '休み' },
      { kind: 'nth', nth: 2, dow: 2, shift: '遅番' },
    ] });
    expect(r.sr).toEqual({ 6: '休み', 13: '休み', 20: '休み', 27: '休み', 8: '遅番' });
  });

  test('冪等: 同じ入力を2回展開しても同結果', () => {
    const patterns = [{ kind: 'weekly', dow: 0, shift: '休み' }];
    const r1 = expandPatternsForMonth({ year: Y, month: M, patterns });
    const r2 = expandPatternsForMonth({ year: Y, month: M, patterns, sr: r1.sr, applied: r1.applied });
    expect(r2.sr).toEqual(r1.sr);
    expect(r2.applied).toEqual(r1.applied);
  });

  test('個別が勝つ①: overrides の日はパターンで上書きしない', () => {
    const r = expandPatternsForMonth({ year: Y, month: M,
      patterns: [{ kind: 'weekly', dow: 0, shift: '休み' }],
      sr: { 13: '早番' }, applied: {}, overrides: { 13: true } });
    expect(r.sr[13]).toBe('早番'); // 手動が残る
    expect(r.sr[6]).toBe('休み');
    expect(r.applied[13]).toBeUndefined(); // 自作扱いにしない
  });

  test('個別が勝つ②: 既存の手動希望(applied外)は上書きしない', () => {
    const r = expandPatternsForMonth({ year: Y, month: M,
      patterns: [{ kind: 'weekly', dow: 0, shift: '休み' }],
      sr: { 20: '日勤' }, applied: {}, overrides: {} });
    expect(r.sr[20]).toBe('日勤'); // 事前の手動希望を尊重
    expect(r.sr[6]).toBe('休み');
  });

  test('パターン解除: 前回自作分は撤去される（手動分は残る）', () => {
    // 前回 6,13,20,27 に休みを自作。今回パターン無し＋13は手動上書き済み
    const applied = { 6: '休み', 13: '休み', 20: '休み', 27: '休み' };
    const sr = { 6: '休み', 13: '早番', 20: '休み', 27: '休み' }; // 13は手動で早番に
    const r = expandPatternsForMonth({ year: Y, month: M, patterns: [], sr, applied, overrides: { 13: true } });
    expect(r.sr).toEqual({ 13: '早番' }); // 自作分は消え、手動分だけ残る
    expect(r.applied).toEqual({});
  });

  test('パターン変更: 曜日を変えると旧日は消え新日が入る', () => {
    const applied = { 6: '休み', 13: '休み', 20: '休み', 27: '休み' }; // 旧=毎週日
    const sr = { ...applied };
    const r = expandPatternsForMonth({ year: Y, month: M,
      patterns: [{ kind: 'nth', nth: 2, dow: 2, shift: '遅番' }], sr, applied });
    expect(r.sr).toEqual({ 8: '遅番' });
  });

  test('v1: 希望休/有休はスキップ（勤務種別のみ）', () => {
    const r = expandPatternsForMonth({ year: Y, month: M, patterns: [
      { kind: 'weekly', dow: 0, shift: '希望休' },
      { kind: 'nth', nth: 2, dow: 2, shift: '遅番' },
    ] });
    expect(r.sr).toEqual({ 8: '遅番' }); // 希望休は入らない
    expect(NON_WORK_SHIFTS.has('希望休')).toBe(true);
  });

  test('入力を破壊しない（純粋関数）', () => {
    const sr = { 6: '早番' }; const applied = {}; const overrides = {};
    expandPatternsForMonth({ year: Y, month: M, patterns: [{ kind: 'weekly', dow: 0, shift: '休み' }], sr, applied, overrides });
    expect(sr).toEqual({ 6: '早番' });
  });
});

describe('applyPatternsToStaff（staffラッパ・非破壊）', () => {
  const baseStaff = () => ({ id: 'a', dept: 'k1', recurringPatterns: [{ id: 'p1', kind: 'weekly', dow: 0, shift: '休み' }] });

  test('パターンを staff.shiftRequestsByMonth[mk] へ展開し、appliedを記録', () => {
    const out = applyPatternsToStaff(baseStaff(), Y, M);
    expect(out.shiftRequestsByMonth[MK]).toEqual({ 6: '休み', 13: '休み', 20: '休み', 27: '休み' });
    expect(out.patternAppliedByMonth[MK]).toEqual({ 6: '休み', 13: '休み', 20: '休み', 27: '休み' });
  });

  test('パターンも前回自作分も無ければ同一参照（形を変えない）', () => {
    const s = { id: 'b', dept: 'k1' };
    expect(applyPatternsToStaff(s, Y, M)).toBe(s);
  });

  test('冪等: 2回適用で同結果', () => {
    const o1 = applyPatternsToStaff(baseStaff(), Y, M);
    const o2 = applyPatternsToStaff(o1, Y, M);
    expect(o2.shiftRequestsByMonth[MK]).toEqual(o1.shiftRequestsByMonth[MK]);
  });

  test('個別override を保持（overridesの日はそのまま）', () => {
    const s = { ...baseStaff(),
      shiftRequestsByMonth: { [MK]: { 13: '早番' } },
      patternOverridesByMonth: { [MK]: { 13: true } } };
    const out = applyPatternsToStaff(s, Y, M);
    expect(out.shiftRequestsByMonth[MK][13]).toBe('早番');
    expect(out.shiftRequestsByMonth[MK][6]).toBe('休み');
  });

  test('他月(他mk)には影響しない', () => {
    const s = { ...baseStaff(), shiftRequestsByMonth: { '2026-8': { 5: '夜勤' } } };
    const out = applyPatternsToStaff(s, Y, M);
    expect(out.shiftRequestsByMonth['2026-8']).toEqual({ 5: '夜勤' });
    expect(out.shiftRequestsByMonth[MK]).toEqual({ 6: '休み', 13: '休み', 20: '休み', 27: '休み' });
  });

  test('null staff 安全', () => {
    expect(applyPatternsToStaff(null, Y, M)).toBe(null);
  });
});
