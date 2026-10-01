import { describe, test, expect } from 'vitest';
import { isBannedTransition, sanitizeBans, banLabel } from '../lib/transitionBans.js';

describe('isBannedTransition', () => {
  const bans = [{ from: '休み', to: '早番' }, { from: '遅番', to: '日勤' }];
  test('一致する遷移は禁止(true)', () => {
    expect(isBannedTransition('休み', '早番', bans)).toBe(true);
    expect(isBannedTransition('遅番', '日勤', bans)).toBe(true);
  });
  test('一致しない遷移は許可(false)', () => {
    expect(isBannedTransition('休み', '日勤', bans)).toBe(false);
    expect(isBannedTransition('早番', '休み', bans)).toBe(false); // 逆方向は別
    expect(isBannedTransition('日勤', '早番', bans)).toBe(false);
  });
  test('prev/curr 欠落・空bansは false', () => {
    expect(isBannedTransition('', '早番', bans)).toBe(false);
    expect(isBannedTransition('休み', '', bans)).toBe(false);
    expect(isBannedTransition(null, null, bans)).toBe(false);
    expect(isBannedTransition('休み', '早番', [])).toBe(false);
    expect(isBannedTransition('休み', '早番', null)).toBe(false);
    expect(isBannedTransition('休み', '早番', undefined)).toBe(false);
  });
  test('不正要素(null)が混ざっても安全', () => {
    expect(isBannedTransition('休み', '早番', [null, { from: '休み', to: '早番' }])).toBe(true);
  });
});

describe('sanitizeBans', () => {
  test('空・自己遷移・欠落を除去', () => {
    expect(sanitizeBans([
      { from: '休み', to: '早番' },
      { from: '', to: '早番' },      // from欠落
      { from: '日勤', to: '' },       // to欠落
      { from: '早番', to: '早番' },    // 自己遷移
      null,
    ])).toEqual([{ from: '休み', to: '早番' }]);
  });
  test('前後空白を除去', () => {
    expect(sanitizeBans([{ from: ' 休み ', to: ' 早番 ' }])).toEqual([{ from: '休み', to: '早番' }]);
  });
  test('重複は先勝ちで除去', () => {
    expect(sanitizeBans([
      { from: '休み', to: '早番' },
      { from: '休み', to: '早番' },
      { from: '遅番', to: '日勤' },
    ])).toEqual([{ from: '休み', to: '早番' }, { from: '遅番', to: '日勤' }]);
  });
  test('空/null安全', () => {
    expect(sanitizeBans([])).toEqual([]);
    expect(sanitizeBans(null)).toEqual([]);
  });
  test('非破壊', () => {
    const input = [{ from: '休み', to: '早番' }];
    sanitizeBans(input);
    expect(input).toEqual([{ from: '休み', to: '早番' }]);
  });
});

describe('banLabel', () => {
  test('矢印ラベル', () => {
    expect(banLabel({ from: '休み', to: '早番' })).toBe('休み → 早番');
  });
});
