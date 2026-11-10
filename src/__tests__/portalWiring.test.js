/**
 * src/lib/portalWiring.js のテスト（純粋・配線の判断）。
 */
import { describe, test, expect } from 'vitest';
import { resolveDeadlineDate, findReusablePortalLink, portalIssuerState, portalDisplayTitle, portalHeaderTitle, sharedReadVia, PORTAL_INVALID_MESSAGE } from '../lib/portalWiring.js';

describe('resolveDeadlineDate（締切の解決）', () => {
  const dept = {
    deadline: '2026-11-20',            // flat
    targetYear: 2026, targetMonth: 11, // flatYm = '2026-11'
    byMonth: { '2026-12': { deadline: '2026-12-18' } },
  };
  test('ym が byMonth にあれば byMonth 優先', () => {
    expect(resolveDeadlineDate(dept, '2026-12')).toBe('2026-12-18');
  });
  test('ym が flatYm と一致すれば flat deadline', () => {
    expect(resolveDeadlineDate(dept, '2026-11')).toBe('2026-11-20');
  });
  test('ym が byMonth にも flatYm にも無ければ null（過去月で誤判定しない）', () => {
    expect(resolveDeadlineDate(dept, '2026-09')).toBeNull();
  });
  test('ym 無しは flat deadline', () => {
    expect(resolveDeadlineDate(dept, null)).toBe('2026-11-20');
  });
  test('締切未設定は null / dept 無しは null', () => {
    expect(resolveDeadlineDate({ targetYear: 2026, targetMonth: 11 }, '2026-11')).toBeNull();
    expect(resolveDeadlineDate(null, '2026-11')).toBeNull();
  });
  test('byMonth に ym キーはあるが deadline が null なら null', () => {
    expect(resolveDeadlineDate({ byMonth: { '2026-12': { deadline: null } } }, '2026-12')).toBeNull();
  });
});

describe('findReusablePortalLink（既存リンクの再利用判定）', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  const future = '2026-11-30T14:59:59.999Z';
  const past = '2026-10-01T00:00:00.000Z';
  const links = [
    { id: '1', dept_id: 'd1', target_month: '2026-11', token: 'T1', expires_at: future, revoked_at: null },
    { id: '2', dept_id: 'd1', target_month: '2026-11', token: 'T2', expires_at: past, revoked_at: null },   // 期限切れ
    { id: '3', dept_id: 'd1', target_month: '2026-11', token: 'T3', expires_at: future, revoked_at: '2026-10-20T00:00:00Z' }, // 失効
    { id: '4', dept_id: 'd2', target_month: '2026-11', token: 'T4', expires_at: future, revoked_at: null },  // 別部署
    { id: '5', dept_id: 'd1', target_month: '2026-12', token: 'T5', expires_at: future, revoked_at: null },  // 別月
  ];
  test('同部署・同月の有効リンクを返す（期限切れ/失効は飛ばす）', () => {
    expect(findReusablePortalLink(links, 'd1', '2026-11', now).id).toBe('1');
  });
  test('有効な該当が無ければ null（全部期限切れ/失効）', () => {
    const only = [links[1], links[2]];
    expect(findReusablePortalLink(only, 'd1', '2026-11', now)).toBeNull();
  });
  test('部署違い / 月違いは一致しない', () => {
    expect(findReusablePortalLink(links, 'd9', '2026-11', now)).toBeNull();
    expect(findReusablePortalLink(links, 'd1', '2026-09', now)).toBeNull();
  });
  test('target_month が null 同士は一致', () => {
    const l = [{ id: 'x', dept_id: 'd1', target_month: null, expires_at: null, revoked_at: null }];
    expect(findReusablePortalLink(l, 'd1', null, now).id).toBe('x');
  });
  test('配列でなければ null', () => {
    expect(findReusablePortalLink(null, 'd1', '2026-11', now)).toBeNull();
    expect(findReusablePortalLink(undefined, 'd1', '2026-11', now)).toBeNull();
  });
});

describe('PORTAL_INVALID_MESSAGE', () => {
  test('理由を区別しない共通文言（トークンを含まない）', () => {
    expect(PORTAL_INVALID_MESSAGE).toBe('このリンクは無効です。リーダーに新しいリンクをもらってください。');
  });
});

describe('portalIssuerState（確認と発行の分離）', () => {
  const NOW = new Date('2026-11-07T00:00:00Z');
  const future = '2026-12-31T14:59:59.999Z';
  const active = { id: 'a', dept_id: 'd1', target_month: '2026-12', token: 'TOK', expires_at: future, revoked_at: null };
  const revoked = { ...active, id: 'b', token: 'OLD', revoked_at: '2026-11-06T00:00:00Z' };

  test('有効リンクがあれば show（再利用 token を返す・発行しない）', () => {
    const st = portalIssuerState({ links: [active], deptId: 'd1', targetMonth: '2026-12', deadlineDate: '2026-12-18', now: NOW });
    expect(st).toEqual({ mode: 'show', token: 'TOK' });
  });
  test('止めたリンクだけなら show にならない（締切ありなら can-issue）', () => {
    const st = portalIssuerState({ links: [revoked], deptId: 'd1', targetMonth: '2026-12', deadlineDate: '2026-12-18', now: NOW });
    expect(st).toEqual({ mode: 'can-issue', token: null });
  });
  test('有効リンク無し・締切未設定なら needs-deadline（発行させない）', () => {
    const st = portalIssuerState({ links: [revoked], deptId: 'd1', targetMonth: '2026-12', deadlineDate: null, now: NOW });
    expect(st).toEqual({ mode: 'needs-deadline', token: null });
  });
  test('リンク0件・締切ありなら can-issue', () => {
    const st = portalIssuerState({ links: [], deptId: 'd1', targetMonth: '2026-12', deadlineDate: '2026-12-18', now: NOW });
    expect(st).toEqual({ mode: 'can-issue', token: null });
  });
  test('別部署の有効リンクは show にしない', () => {
    const st = portalIssuerState({ links: [{ ...active, dept_id: 'other' }], deptId: 'd1', targetMonth: '2026-12', deadlineDate: '2026-12-18', now: NOW });
    expect(st.mode).toBe('can-issue');
  });
});

describe('portalDisplayTitle（職員ヘッダにメールを出さない）', () => {
  test('メールらしき値は fallback に置換', () => {
    expect(portalDisplayTitle('taro@example.com')).toBe('YEIX');
    expect(portalDisplayTitle('taro@example.com', '施設')).toBe('施設');
  });
  test('通常の施設名はそのまま', () => {
    expect(portalDisplayTitle('さくら介護')).toBe('さくら介護');
  });
  test('空/NULL は fallback', () => {
    expect(portalDisplayTitle('')).toBe('YEIX');
    expect(portalDisplayTitle(null)).toBe('YEIX');
    expect(portalDisplayTitle('   ')).toBe('YEIX');
  });
});

describe('sharedReadVia（共有シフトの読み取り経路）', () => {
  test('token ON → rpc（rpc フラグに関わらず）', () => {
    expect(sharedReadVia(true, false)).toBe('rpc');
    expect(sharedReadVia(true, true)).toBe('rpc');
  });
  test('rpc ON → rpc', () => {
    expect(sharedReadVia(false, true)).toBe('rpc');
  });
  test('両方 OFF（旧方式）→ table（従来どおり）', () => {
    expect(sharedReadVia(false, false)).toBe('table');
  });
});

describe('portalHeaderTitle（職員画面ヘッダ ?p=/?staff= 共通の実コード）', () => {
  test('メールのような施設名なら YEIX', () => {
    expect(portalHeaderTitle({ facility_name: 'takaibiki1980@icloud.com' })).toBe('YEIX');
    expect(portalHeaderTitle({ facility_name: 'leader@example.co.jp', depts: [] })).toBe('YEIX');
  });
  test('通常の施設名ならそのまま', () => {
    expect(portalHeaderTitle({ facility_name: 'さくら介護施設' })).toBe('さくら介護施設');
  });
  test('未設定・config無しは YEIX', () => {
    expect(portalHeaderTitle({ facility_name: '' })).toBe('YEIX');
    expect(portalHeaderTitle({})).toBe('YEIX');
    expect(portalHeaderTitle(null)).toBe('YEIX');
  });
});
