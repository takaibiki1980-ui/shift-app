import { describe, test, expect } from 'vitest';
import { moveById, moveByIdDir } from '../lib/reorder.js';

const base = () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('moveById', () => {
  test('下へ移動', () => {
    expect(moveById(base(), 'a', 1).map(x => x.id)).toEqual(['b', 'a', 'c']);
  });
  test('上へ移動', () => {
    expect(moveById(base(), 'c', -1).map(x => x.id)).toEqual(['a', 'c', 'b']);
  });
  test('先頭を上へは不可（同一参照）', () => {
    const arr = base();
    expect(moveById(arr, 'a', -1)).toBe(arr);
  });
  test('末尾を下へは不可（同一参照）', () => {
    const arr = base();
    expect(moveById(arr, 'c', 1)).toBe(arr);
  });
  test('存在しないid・不正dir・要素1個以下は同一参照', () => {
    const arr = base();
    expect(moveById(arr, 'x', 1)).toBe(arr);
    expect(moveById(arr, 'a', 0)).toBe(arr);
    expect(moveById(arr, 'a', 2)).toBe(arr);
    const one = [{ id: 'a' }];
    expect(moveById(one, 'a', 1)).toBe(one);
    expect(moveById(null, 'a', 1)).toBe(null);
  });
  test('非破壊（元配列を変更しない）', () => {
    const arr = base();
    moveById(arr, 'a', 1);
    expect(arr.map(x => x.id)).toEqual(['a', 'b', 'c']);
  });
  test('他プロパティを保持', () => {
    const arr = [{ id: 'a', label: '1階' }, { id: 'b', label: '2階' }];
    expect(moveById(arr, 'b', -1)).toEqual([{ id: 'b', label: '2階' }, { id: 'a', label: '1階' }]);
  });
});

describe('moveByIdDir', () => {
  test("'up'/'down' ラッパ", () => {
    expect(moveByIdDir(base(), 'b', 'up').map(x => x.id)).toEqual(['b', 'a', 'c']);
    expect(moveByIdDir(base(), 'b', 'down').map(x => x.id)).toEqual(['a', 'c', 'b']);
  });
  test('不正な direction は同一参照', () => {
    const arr = base();
    expect(moveByIdDir(arr, 'b', 'x')).toBe(arr);
  });
});
