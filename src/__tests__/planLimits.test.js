/**
 * プラン別の数制限 limitOf の検証（free/standard/full/is_admin）。
 */
import { describe, test, expect, vi, beforeAll } from 'vitest';
let limitOf;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:9999');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
  ({ limitOf } = await import('../App.jsx'));
});

describe('limitOf', () => {
  test('free: 1部署 / 10名', () => {
    expect(limitOf({ plan: 'free', is_admin: false })).toEqual({ depts: 1, staff: 10 });
  });
  test('standard: 2部署 / 30名', () => {
    expect(limitOf({ plan: 'standard', is_admin: false })).toEqual({ depts: 2, staff: 30 });
  });
  test('full: 無制限', () => {
    expect(limitOf({ plan: 'full', is_admin: false })).toEqual({ depts: Infinity, staff: Infinity });
  });
  test('is_admin(研究用): planに関係なく無制限', () => {
    expect(limitOf({ plan: 'free', is_admin: true })).toEqual({ depts: Infinity, staff: Infinity });
    expect(limitOf({ plan: 'standard', is_admin: true })).toEqual({ depts: Infinity, staff: Infinity });
  });
  test('未設定/不明planは free 扱い', () => {
    expect(limitOf(undefined)).toEqual({ depts: 1, staff: 10 });
    expect(limitOf({ plan: 'xxx' })).toEqual({ depts: 1, staff: 10 });
  });
});
