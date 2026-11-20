/**
 * src/lib/storageKeys.js のテスト。userId で名前空間化して別アカウントが混ざらないことを確認。
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { userKey, readUserKey, writeUserKey, removeUserKey } from '../lib/storageKeys.js';

// vitest は node 環境のため localStorage が無い。簡易モックを用意。
beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
  });
});

describe('userKey（キーの組み立て）', () => {
  test('userId と baseKey を名前空間化', () => {
    expect(userKey('u1', 'shiftNavi_depts')).toBe('u:u1:shiftNavi_depts');
    expect(userKey('abc-123', 'shiftNavi_shifts_2026_11')).toBe('u:abc-123:shiftNavi_shifts_2026_11');
  });
  test('userId が空なら null（空キー混入の防止）', () => {
    expect(userKey('', 'shiftNavi_depts')).toBeNull();
    expect(userKey(null, 'shiftNavi_depts')).toBeNull();
    expect(userKey(undefined, 'shiftNavi_depts')).toBeNull();
    expect(userKey('   ', 'shiftNavi_depts')).toBeNull();
  });
  test('baseKey が空なら null', () => {
    expect(userKey('u1', '')).toBeNull();
    expect(userKey('u1', null)).toBeNull();
  });
});

describe('read/write（userId 無しは何もしない）', () => {
  test('userId 無しの書き込みは false・読み取りは null（localStorage に触れない）', () => {
    expect(writeUserKey('', 'shiftNavi_depts', 'x')).toBe(false);
    expect(readUserKey('', 'shiftNavi_depts')).toBeNull();
    expect(localStorage.getItem('u::shiftNavi_depts')).toBeNull();
  });
});

describe('2人のユーザーで別の保存場所になる', () => {
  test('同じ baseKey でもユーザーが違えば混ざらない', () => {
    writeUserKey('u1', 'shiftNavi_staffList', JSON.stringify([{ name: 'A' }]));
    writeUserKey('u2', 'shiftNavi_staffList', JSON.stringify([{ name: 'B' }]));
    expect(readUserKey('u1', 'shiftNavi_staffList')).toBe('[{"name":"A"}]');
    expect(readUserKey('u2', 'shiftNavi_staffList')).toBe('[{"name":"B"}]');
    // 旧キー（userId なし）は書かれていない
    expect(localStorage.getItem('shiftNavi_staffList')).toBeNull();
  });
  test('removeUserKey は該当ユーザーの分だけ消す', () => {
    writeUserKey('u1', 'shiftNavi_depts', '1');
    writeUserKey('u2', 'shiftNavi_depts', '2');
    removeUserKey('u1', 'shiftNavi_depts');
    expect(readUserKey('u1', 'shiftNavi_depts')).toBeNull();
    expect(readUserKey('u2', 'shiftNavi_depts')).toBe('2');
  });
});
