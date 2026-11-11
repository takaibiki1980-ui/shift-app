/**
 * src/lib/planGates.js のテスト（PR-3c ゲート・純ロジック）。
 */
import { describe, test, expect } from 'vitest';
import {
  canIssuePortalLink, effectiveFeatureFlags, canPasteStaff,
  canAddDept, canAddStaff, isDeptUsable, FULL_ONLY_NOTE,
} from '../lib/planGates.js';
import { effectivePlan } from '../lib/planV2.js';

const NOW = new Date('2026-11-11T00:00:00Z');
const trialEnds = (d) => new Date(NOW.getTime() + d * 86400000).toISOString();

describe('effectivePlan を入口にする（試用/無料/フル）', () => {
  test('試用中→full / 無料→free / フル→full / 運営者→full', () => {
    expect(effectivePlan({ plan: 'free', trial_ends_at: trialEnds(10) }, NOW)).toBe('full');
    expect(effectivePlan({ plan: 'free' }, NOW)).toBe('free');
    expect(effectivePlan({ plan: 'full' }, NOW)).toBe('full');
    expect(effectivePlan({ is_admin: true, plan: 'free' }, NOW)).toBe('full');
  });
});

describe('canIssuePortalLink（送信は有料）', () => {
  test('full は発行可・free は不可', () => {
    expect(canIssuePortalLink('full')).toBe(true);
    expect(canIssuePortalLink('free')).toBe(false);
  });
});

describe('effectiveFeatureFlags（7機能）', () => {
  test('full は全 true', () => {
    const f = effectiveFeatureFlags('full');
    expect(f).toEqual({ learning: true, pairSwap: true, transitionForce: true, recurringPattern: true, weeklyDays: true, nightLevel: true, yotei: true });
  });
  test('free は全 false', () => {
    const f = effectiveFeatureFlags('free');
    expect(Object.values(f).every((v) => v === false)).toBe(true);
  });
});

describe('数の上限（部署3・職員15）', () => {
  test('部署 3つ目は可・4つ目は不可（free）', () => {
    expect(canAddDept('free', 2)).toBe(true);  // 3つ目を追加
    expect(canAddDept('free', 3)).toBe(false); // 4つ目は不可
    expect(canAddDept('full', 99)).toBe(true);
  });
  test('職員 15人目は可・16人目は不可（free）', () => {
    expect(canAddStaff('free', 14)).toBe(true);  // 15人目
    expect(canAddStaff('free', 15)).toBe(false); // 16人目は不可
    expect(canAddStaff('full', 999)).toBe(true);
  });
  test('isDeptUsable: free は先頭3つ(index<3)のみ', () => {
    expect(isDeptUsable('free', 0)).toBe(true);
    expect(isDeptUsable('free', 2)).toBe(true);
    expect(isDeptUsable('free', 3)).toBe(false);
    expect(isDeptUsable('full', 9)).toBe(true);
  });
});

describe('canPasteStaff（貼り付けで16人以上は全体を止める）', () => {
  test('合計が上限内なら ok', () => {
    expect(canPasteStaff('free', 10, 5)).toEqual({ ok: true, limit: 15 });
    expect(canPasteStaff('free', 0, 15).ok).toBe(true);
  });
  test('合計が上限超なら全体不可＋理由', () => {
    const r = canPasteStaff('free', 12, 5); // 17
    expect(r.ok).toBe(false);
    expect(r.limit).toBe(15);
    expect(r.reason).toContain('15');
  });
  test('full は常に可', () => {
    expect(canPasteStaff('full', 100, 100).ok).toBe(true);
  });
});

describe('FULL_ONLY_NOTE（料金・購入文言を含まない）', () => {
  test('短い案内文', () => {
    expect(FULL_ONLY_NOTE).toBe('フルプランで使えます');
    expect(FULL_ONLY_NOTE).not.toMatch(/円|¥|購入|決済|Stripe/);
  });
});
