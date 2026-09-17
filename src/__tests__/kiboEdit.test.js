import { describe, test, expect } from 'vitest';
import { toggleKiboDays } from '../lib/kiboEdit.js';

describe('toggleKiboDays（希望休/有給の右クリック編集ロジック）', () => {
  test('希望休を付与（空→追加・昇順）', () => {
    expect(toggleKiboDays([], [], [10], 'kibo')).toEqual({ days: [10], yukyu_days: [] });
    expect(toggleKiboDays([5], [], [2], 'kibo')).toEqual({ days: [2, 5], yukyu_days: [] });
  });
  test('希望休を解除（既存→削除）', () => {
    expect(toggleKiboDays([10], [], [10], 'kibo')).toEqual({ days: [], yukyu_days: [] });
  });
  test('有給を付与・解除', () => {
    expect(toggleKiboDays([], [], [8], 'yukyu')).toEqual({ days: [], yukyu_days: [8] });
    expect(toggleKiboDays([], [8], [8], 'yukyu')).toEqual({ days: [], yukyu_days: [] });
  });
  test('排他: 希望休付与で同日の有給を外す', () => {
    expect(toggleKiboDays([], [10], [10], 'kibo')).toEqual({ days: [10], yukyu_days: [] });
  });
  test('排他: 有給付与で同日の希望休を外す', () => {
    expect(toggleKiboDays([10], [], [10], 'yukyu')).toEqual({ days: [], yukyu_days: [10] });
  });
  test('一括: 複数日を混在状態からトグル（ある日は解除・ない日は付与）', () => {
    // 3は既存→解除、7は新規→付与
    expect(toggleKiboDays([3], [], [3, 7], 'kibo')).toEqual({ days: [7], yukyu_days: [] });
  });
  test('元の配列を破壊しない（純粋関数）', () => {
    const kibo = [1], yuk = [2];
    toggleKiboDays(kibo, yuk, [3], 'kibo');
    expect(kibo).toEqual([1]); expect(yuk).toEqual([2]);
  });
  test('文字列の日番号も数値として扱う', () => {
    expect(toggleKiboDays(['5'], [], ['5'], 'kibo')).toEqual({ days: [], yukyu_days: [] });
  });
});
