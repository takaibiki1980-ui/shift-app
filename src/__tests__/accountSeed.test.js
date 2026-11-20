/**
 * src/lib/accountSeed.js のテスト（純粋）。
 */
import { describe, test, expect } from 'vitest';
import { chooseSeed, isExistingAccount } from '../lib/accountSeed.js';

describe('chooseSeed', () => {
  test('サーバー値があればそれをそのまま返す（既存アカウント）', () => {
    const server = [{ id: 'kaigo1' }];
    expect(chooseSeed(server, [{ id: 'DEF' }])).toBe(server);
  });
  test('サーバー値が無ければ既定のクローンを返す（新規アカウント）', () => {
    const def = [{ id: 'DEF', nested: { a: 1 } }];
    const got = chooseSeed(null, def);
    expect(got).toEqual(def);
    expect(got).not.toBe(def);            // 別オブジェクト（クローン）
    got[0].nested.a = 999;                // クローンを変更しても
    expect(def[0].nested.a).toBe(1);      // 既定定数は壊れない
  });
  test('undefined も新規扱い', () => {
    expect(chooseSeed(undefined, [{ id: 'DEF' }])).toEqual([{ id: 'DEF' }]);
  });
  test('空配列・空オブジェクトは「値あり」として尊重（null/undefined だけが新規）', () => {
    const empty = [];
    expect(chooseSeed(empty, [{ id: 'DEF' }])).toBe(empty);
  });
});

describe('isExistingAccount', () => {
  test('depts か staffList があれば既存', () => {
    expect(isExistingAccount({ depts: [{}] })).toBe(true);
    expect(isExistingAccount({ staffList: [{}] })).toBe(true);
    expect(isExistingAccount({ depts: [{}], staffList: [{}] })).toBe(true);
  });
  test('どちらも無ければ新規', () => {
    expect(isExistingAccount({})).toBe(false);
    expect(isExistingAccount({ events_data: {} })).toBe(false);
    expect(isExistingAccount(null)).toBe(false);
  });
});
