/**
 * 希望休ポータルの締切解決（resolvePortalDeadline）の検証。
 * env をスタブして App.jsx から純粋関数を import する。
 */
import { describe, test, expect, vi, beforeAll } from 'vitest';
let resolvePortalDeadline;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:9999');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
  ({ resolvePortalDeadline } = await import('../App.jsx'));
});

describe('resolvePortalDeadline', () => {
  test('ymあり: byMonth[ym] の締切を返す（前月リンクは前月の締切）', () => {
    const dept = {
      deadline: '2026-10-05', targetYear: 2026, targetMonth: 10, // 現在募集中=10月
      byMonth: { '2026-9': { deadline: '2026-09-05' }, '2026-10': { deadline: '2026-10-05' } },
    };
    // 9月リンク → 9月の締切（新月10月を募集しても復活しない）
    expect(resolvePortalDeadline(dept, '2026-9')).toBe('2026-09-05');
    // 10月リンク → 10月の締切
    expect(resolvePortalDeadline(dept, '2026-10')).toBe('2026-10-05');
  });

  test('ymあり・byMonth未整備だが ym が現在の対象月(flat)と一致 → flat deadline', () => {
    const dept = { deadline: '2026-10-05', targetYear: 2026, targetMonth: 10, byMonth: null };
    expect(resolvePortalDeadline(dept, '2026-10')).toBe('2026-10-05');
  });

  test('ymあり・過去月で byMonth に記録なし → 締切なし（現在の締切で誤判定しない）', () => {
    const dept = { deadline: '2026-10-05', targetYear: 2026, targetMonth: 10, byMonth: { '2026-10': { deadline: '2026-10-05' } } };
    // 9月リンクだが byMonth に9月なし → null（現在10月の締切を使わない＝バグ再発防止）
    expect(resolvePortalDeadline(dept, '2026-9')).toBe(null);
  });

  test('ymなしの旧リンク → 従来どおり flat deadline', () => {
    const dept = { deadline: '2026-10-05', targetYear: 2026, targetMonth: 10, byMonth: { '2026-9': { deadline: '2026-09-05' } } };
    expect(resolvePortalDeadline(dept, undefined)).toBe('2026-10-05');
  });

  test('byMonth[ym] の締切が null（その月は締切なし）→ null を返す', () => {
    const dept = { deadline: '2026-10-05', targetYear: 2026, targetMonth: 10, byMonth: { '2026-9': { deadline: null } } };
    expect(resolvePortalDeadline(dept, '2026-9')).toBe(null);
  });

  test('selDept が無ければ null', () => {
    expect(resolvePortalDeadline(null, '2026-9')).toBe(null);
    expect(resolvePortalDeadline(undefined, undefined)).toBe(null);
  });
});
