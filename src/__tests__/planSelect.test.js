/**
 * src/lib/planSelect.js のテスト（純粋・配線の判断）。
 */
import { describe, test, expect } from 'vitest';
import { effectivePlanValue, resolveFetchedProfile, PLAN_V2_CHOICES } from '../lib/planSelect.js';

const NOW = new Date('2026-10-26T03:00:00Z');
const trialEnds = (d) => new Date(NOW.getTime() + d * 86400000).toISOString();

describe('effectivePlanValue', () => {
  test('ON: 管理者→full / 有料(full)→full / 試用中→full / 無料→free / standard→free', () => {
    expect(effectivePlanValue({ is_admin: true, plan: 'free' }, NOW, true)).toBe('full');
    expect(effectivePlanValue({ plan: 'full' }, NOW, true)).toBe('full');
    expect(effectivePlanValue({ plan: 'free', trial_ends_at: trialEnds(10) }, NOW, true)).toBe('full');
    expect(effectivePlanValue({ plan: 'free' }, NOW, true)).toBe('free');
    expect(effectivePlanValue({ plan: 'standard' }, NOW, true)).toBe('free'); // 最小権限
  });
  test('ON: standard でも opts.isPaidActive=true ならフル（昇格は明示のときだけ）', () => {
    expect(effectivePlanValue({ plan: 'standard' }, NOW, true, { isPaidActive: true })).toBe('full');
  });
  test('OFF: 参考値。管理者→full、その他は保存プラン（既定 free）', () => {
    expect(effectivePlanValue({ is_admin: true, plan: 'free' }, NOW, false)).toBe('full');
    expect(effectivePlanValue({ plan: 'standard' }, NOW, false)).toBe('standard');
    expect(effectivePlanValue({ plan: 'full' }, NOW, false)).toBe('full');
    expect(effectivePlanValue(null, NOW, false)).toBe('free');
  });
});

describe('resolveFetchedProfile（読み込み失敗時の保持・ユーザー一致ガード）', () => {
  const UID = 'user-A';
  const prev = { id: UID, facility_name: 'A', plan: 'full', is_admin: false };
  const fresh = { id: UID, facility_name: 'A', plan: 'full', is_admin: false, trial_ends_at: null };

  test('同一ユーザーの読み込み失敗(read-error/exception/reread-error)は既存を保持', () => {
    for (const reason of ['read-error', 'exception', 'reread-error']) {
      expect(resolveFetchedProfile(prev, { profile: { id: UID, plan: 'free' }, reason }, UID)).toBe(prev);
    }
  });
  test('別ユーザーの読み込み失敗では前ユーザーの profile を保持しない（result.profile を使う）', () => {
    const other = { profile: { id: 'user-B', plan: 'free' }, reason: 'read-error' };
    expect(resolveFetchedProfile(prev, other, 'user-B')).toBe(other.profile); // A を保持しない
  });
  test('userId 未指定なら保持しない（安全側）', () => {
    expect(resolveFetchedProfile(prev, { profile: { plan: 'free' }, reason: 'read-error' }, undefined)).toEqual({ plan: 'free' });
  });
  test('prev に id が無い（既定フォールバック等）なら保持しない', () => {
    const noId = { facility_name: 'x', plan: 'full' };
    expect(resolveFetchedProfile(noId, { profile: { plan: 'free' }, reason: 'read-error' }, UID)).toEqual({ plan: 'free' });
  });
  test('読み込み失敗でも既存が無ければ result.profile（初回＝既定 free）', () => {
    expect(resolveFetchedProfile(null, { profile: { plan: 'free' }, reason: 'read-error' }, UID)).toEqual({ plan: 'free' });
  });
  test('成功系(exists/created/disabled)は常に新しい値', () => {
    for (const reason of ['exists', 'created', 'disabled', 'existed-23505']) {
      expect(resolveFetchedProfile(prev, { profile: fresh, reason }, UID)).toBe(fresh);
    }
  });
  test('result が無い/profile を持たないときは null', () => {
    expect(resolveFetchedProfile(prev, null, UID)).toBeNull();
    expect(resolveFetchedProfile(prev, {}, UID)).toBeNull();
  });
});

describe('PLAN_V2_CHOICES', () => {
  test('無料とフルの2択（standard を含まない）', () => {
    expect(PLAN_V2_CHOICES).toEqual(['free', 'full']);
  });
});
