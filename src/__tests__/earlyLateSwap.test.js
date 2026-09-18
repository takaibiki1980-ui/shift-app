import { describe, test, expect } from 'vitest';
import { SWAP_PAIR, isSwapShift, findSwapCandidates } from '../lib/earlyLateSwap.js';

const staff = [
  { id: 'a', dept: 'k1' }, { id: 'b', dept: 'k1' }, { id: 'c', dept: 'k1' },
  { id: 'x', dept: 'k2' },
];

describe('earlyLateSwap', () => {
  test('SWAP_PAIR は早番↔遅番', () => {
    expect(SWAP_PAIR['早番']).toBe('遅番');
    expect(SWAP_PAIR['遅番']).toBe('早番');
  });
  test('isSwapShift は早番/遅番のみtrue', () => {
    expect(isSwapShift('早番')).toBe(true);
    expect(isSwapShift('遅番')).toBe(true);
    expect(isSwapShift('日勤')).toBe(false);
    expect(isSwapShift('休み')).toBe(false);
    expect(isSwapShift('')).toBe(false);
  });
  test('相手0人: 候補なし', () => {
    const ds = { a: { 5: '日勤' } };
    expect(findSwapCandidates(ds, staff, 'k1', 'b', 5, '早番')).toEqual([]);
  });
  test('相手1人: その人を返す（本人は除外）', () => {
    const ds = { a: { 5: '早番' }, b: { 5: '遅番' } };
    expect(findSwapCandidates(ds, staff, 'k1', 'b', 5, '早番')).toEqual(['a']);
  });
  test('本人が既に早番でも本人は候補に入らない', () => {
    const ds = { a: { 5: '早番' }, b: { 5: '早番' } };
    expect(findSwapCandidates(ds, staff, 'k1', 'b', 5, '早番')).toEqual(['a']);
  });
  test('相手複数人: 全員返す', () => {
    const ds = { a: { 5: '遅番' }, b: { 5: '遅番' }, c: { 5: '日勤' } };
    expect(findSwapCandidates(ds, staff, 'k1', 'c', 5, '遅番')).toEqual(['a', 'b']);
  });
  test('別部署の同種別は候補に入らない', () => {
    const ds = { a: { 5: '早番' }, x: { 5: '早番' } };
    expect(findSwapCandidates(ds, staff, 'k1', 'b', 5, '早番')).toEqual(['a']);
  });
  test('別日の同種別は候補に入らない', () => {
    const ds = { a: { 6: '早番' } };
    expect(findSwapCandidates(ds, staff, 'k1', 'b', 5, '早番')).toEqual([]);
  });
  test('早番/遅番以外を選んだ場合は候補なし', () => {
    const ds = { a: { 5: '日勤' } };
    expect(findSwapCandidates(ds, staff, 'k1', 'b', 5, '日勤')).toEqual([]);
  });
});
