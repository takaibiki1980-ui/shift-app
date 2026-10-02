import { describe, test, expect } from 'vitest';
import { forcedShiftFor, sanitizeForces, forceLabel } from '../lib/transitionForces.js';

describe('forcedShiftFor', () => {
  const forces = [{ from: '休み', to: '遅番' }, { from: '夜勤', to: '明け' }];
  test('前日が from なら強制先 to を返す', () => {
    expect(forcedShiftFor('休み', '日勤', forces)).toBe('遅番');
    expect(forcedShiftFor('休み', '早番', forces)).toBe('遅番');
  });
  test('既に to と同じなら null（変更不要）', () => {
    expect(forcedShiftFor('休み', '遅番', forces)).toBeNull();
  });
  test('from に該当しなければ null', () => {
    expect(forcedShiftFor('日勤', '早番', forces)).toBeNull();
    expect(forcedShiftFor('遅番', '休み', forces)).toBeNull();
  });
  test('prev欠落・空forcesは null', () => {
    expect(forcedShiftFor('', '日勤', forces)).toBeNull();
    expect(forcedShiftFor(null, '日勤', forces)).toBeNull();
    expect(forcedShiftFor('休み', '日勤', [])).toBeNull();
    expect(forcedShiftFor('休み', '日勤', null)).toBeNull();
  });
  test('curr が空でも from 一致なら to を返す（翌日未定を強制）', () => {
    expect(forcedShiftFor('休み', '', forces)).toBe('遅番');
  });
  test('不正要素(null)が混ざっても安全・先勝ち', () => {
    expect(forcedShiftFor('休み', '日勤', [null, { from: '休み', to: '遅番' }])).toBe('遅番');
  });
});

describe('sanitizeForces', () => {
  test('空・自己遷移・欠落を除去', () => {
    expect(sanitizeForces([
      { from: '休み', to: '遅番' },
      { from: '', to: '遅番' },
      { from: '日勤', to: '' },
      { from: '早番', to: '早番' },
      null,
    ])).toEqual([{ from: '休み', to: '遅番' }]);
  });
  test('前後空白を除去', () => {
    expect(sanitizeForces([{ from: ' 休み ', to: ' 遅番 ' }])).toEqual([{ from: '休み', to: '遅番' }]);
  });
  test('同一 from は先勝ちで一意化（1 from → 1 to）', () => {
    expect(sanitizeForces([
      { from: '休み', to: '遅番' },
      { from: '休み', to: '早番' },
      { from: '夜勤', to: '明け' },
    ])).toEqual([{ from: '休み', to: '遅番' }, { from: '夜勤', to: '明け' }]);
  });
  test('空/null安全・非破壊', () => {
    expect(sanitizeForces([])).toEqual([]);
    expect(sanitizeForces(null)).toEqual([]);
    const input = [{ from: '休み', to: '遅番' }];
    sanitizeForces(input);
    expect(input).toEqual([{ from: '休み', to: '遅番' }]);
  });
});

describe('forceLabel', () => {
  test('矢印ラベル', () => {
    expect(forceLabel({ from: '休み', to: '遅番' })).toBe('休み → 遅番');
  });
});
