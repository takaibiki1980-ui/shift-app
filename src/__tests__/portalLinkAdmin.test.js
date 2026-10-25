/**
 * src/lib/portalLinkAdmin.js のテスト（純粋・一覧表示の判断）。
 */
import { describe, test, expect } from 'vitest';
import {
  linkStatus, canRevokeLink, statusLabel, deptNameOf,
  formatPortalRows, formatSharedRows, sliceWithMore,
} from '../lib/portalLinkAdmin.js';

const now = new Date('2026-11-01T00:00:00Z');
const future = '2026-11-30T14:59:59.999Z';
const past = '2026-10-01T00:00:00.000Z';
const deptNames = { d1: '介護1階', d2: '介護2階' };

describe('linkStatus / canRevokeLink / statusLabel', () => {
  test('有効/期限切れ/止めた', () => {
    expect(linkStatus({ expires_at: future, revoked_at: null }, now)).toBe('active');
    expect(linkStatus({ expires_at: past, revoked_at: null }, now)).toBe('expired');
    expect(linkStatus({ expires_at: future, revoked_at: '2026-10-20T00:00:00Z' }, now)).toBe('revoked');
    expect(linkStatus({ expires_at: null, revoked_at: null }, now)).toBe('active'); // 無期限
    expect(linkStatus(null, now)).toBe('revoked');
  });
  test('止められるのは有効のときだけ', () => {
    expect(canRevokeLink({ expires_at: future, revoked_at: null }, now)).toBe(true);
    expect(canRevokeLink({ expires_at: past, revoked_at: null }, now)).toBe(false);
    expect(canRevokeLink({ expires_at: future, revoked_at: '2026-10-20T00:00:00Z' }, now)).toBe(false);
  });
  test('状態ラベル（日本語）', () => {
    expect(statusLabel('active')).toBe('有効');
    expect(statusLabel('expired')).toBe('期限切れ');
    expect(statusLabel('revoked')).toBe('止めた');
  });
});

describe('deptNameOf', () => {
  test('ID→名、無ければ ID', () => {
    expect(deptNameOf('d1', deptNames)).toBe('介護1階');
    expect(deptNameOf('dX', deptNames)).toBe('dX');
    expect(deptNameOf('d1', null)).toBe('d1');
  });
});

describe('formatPortalRows（整形＋並べ替え）', () => {
  const links = [
    { id: 'r', dept_id: 'd1', target_month: '2026-11', label: '11月', token: 'TR', expires_at: future, revoked_at: '2026-10-20T00:00:00Z', created_at: '2026-10-10T00:00:00Z' }, // 止めた
    { id: 'a1', dept_id: 'd1', target_month: '2026-11', label: '新', token: 'TA1', expires_at: future, revoked_at: null, created_at: '2026-10-25T00:00:00Z' }, // 有効・新
    { id: 'a2', dept_id: 'd2', target_month: '2026-11', label: '旧', token: 'TA2', expires_at: future, revoked_at: null, created_at: '2026-10-05T00:00:00Z' }, // 有効・古
    { id: 'e', dept_id: 'd1', target_month: '2026-10', label: '先月', token: 'TE', expires_at: past, revoked_at: null, created_at: '2026-09-20T00:00:00Z' }, // 期限切れ
  ];
  test('並び＝有効(新→古)→期限切れ→止めた、部署名変換、token は保持', () => {
    const rows = formatPortalRows(links, deptNames, now);
    expect(rows.map(r => r.id)).toEqual(['a1', 'a2', 'e', 'r']);
    expect(rows[0]).toMatchObject({ deptName: '介護1階', targetMonth: '2026-11', status: 'active', statusLabel: '有効', canRevoke: true, token: 'TA1' });
    expect(rows[2]).toMatchObject({ status: 'expired', canRevoke: false });
    expect(rows[3]).toMatchObject({ status: 'revoked', canRevoke: false });
  });
  test('非配列は空', () => {
    expect(formatPortalRows(null, deptNames, now)).toEqual([]);
  });
});

describe('formatSharedRows', () => {
  const shared = [
    { id: 's1', dept_ids: ['d1', 'd2'], year: 2026, month: 11, token: 'TS1', expires_at: future, revoked_at: null, created_at: '2026-10-20T00:00:00Z' },
    { id: 's2', dept_ids: ['d1'], year: 2026, month: 10, token: 'TS2', expires_at: past, revoked_at: null, created_at: '2026-09-20T00:00:00Z' },
  ];
  test('部署名配列・ym・状態', () => {
    const rows = formatSharedRows(shared, deptNames, now);
    expect(rows.map(r => r.id)).toEqual(['s1', 's2']); // active→expired
    expect(rows[0]).toMatchObject({ deptNames: ['介護1階', '介護2階'], ym: '2026-11', status: 'active', canRevoke: true, token: 'TS1' });
    expect(rows[1]).toMatchObject({ status: 'expired', canRevoke: false });
  });
});

describe('sliceWithMore（もっと見る）', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: i }));
  test('limit で絞り、残り件数を返す', () => {
    const r = sliceWithMore(rows, 5);
    expect(r.shown).toHaveLength(5);
    expect(r.hasMore).toBe(true);
    expect(r.remaining).toBe(2);
  });
  test('limit 以下なら hasMore=false', () => {
    const r = sliceWithMore(rows, 10);
    expect(r.shown).toHaveLength(7);
    expect(r.hasMore).toBe(false);
    expect(r.remaining).toBe(0);
  });
  test('非配列・無効 limit に強い', () => {
    expect(sliceWithMore(null, 5)).toEqual({ shown: [], hasMore: false, remaining: 0 });
    expect(sliceWithMore(rows, 0).shown).toHaveLength(7); // limit 無効→全件
  });
});
