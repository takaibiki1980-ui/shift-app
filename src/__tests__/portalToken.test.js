/**
 * src/lib/portalToken.js のテスト（純粋・配線なし）。
 * 仮の baseURL・仮トークンのみ。実名/実 id/実トークンは使わない。
 */
import { describe, test, expect } from 'vitest';
import {
  PORTAL_TOKEN_CHARS, genPortalToken, isValidTokenFormat, isLinkActive,
  monthEndExpiry, daysFromNowExpiry, buildPortalUrl, buildShareUrl, parseLinkParams,
} from '../lib/portalToken.js';

describe('genPortalToken（生成）', () => {
  test('既定 24 文字・すべて許可文字・128bit 以上', () => {
    const t = genPortalToken();
    expect(t).toHaveLength(24);
    for (const ch of t) expect(PORTAL_TOKEN_CHARS.includes(ch)).toBe(true);
    // 54^24 のエントロピー ≒ 138bit ≥ 128bit
    expect(24 * Math.log2(PORTAL_TOKEN_CHARS.length)).toBeGreaterThanOrEqual(128);
  });

  test('多数回生成して重複なし', () => {
    const set = new Set();
    for (let i = 0; i < 5000; i++) set.add(genPortalToken());
    expect(set.size).toBe(5000);
  });

  test('乱数源を固定すると決定的（バイト→文字の対応が一定）', () => {
    // 0,1,2 は 54 未満なので採用され A[0],A[1],A[2]。固定ソースで同じ出力。
    const src = () => new Uint8Array([0, 1, 2, 3, 4, 5]);
    const a = genPortalToken(6, src);
    const b = genPortalToken(6, src);
    expect(a).toBe(b);
    expect(a).toBe(PORTAL_TOKEN_CHARS.slice(0, 6));
  });

  test('棄却サンプリング: 216 以上のバイトは捨てて偏りを出さない', () => {
    // 220,221（棄却）を混ぜても、採用は 0,1,2,3 のみ → 'ABCD'
    const bytes = [220, 0, 221, 1, 2, 3];
    let i = 0;
    const src = (n) => {
      const out = [];
      for (let k = 0; k < n && i < bytes.length; k++) out.push(bytes[i++]);
      return new Uint8Array(out);
    };
    expect(genPortalToken(4, src)).toBe('ABCD');
  });

  test('分布に大きな偏りが出ない（全文字が出現し、最多/最少の比が緩い範囲）', () => {
    const counts = {};
    let total = 0;
    for (let i = 0; i < 2000; i++) for (const ch of genPortalToken()) { counts[ch] = (counts[ch] || 0) + 1; total++; }
    const vals = PORTAL_TOKEN_CHARS.split('').map((c) => counts[c] || 0);
    expect(Math.min(...vals)).toBeGreaterThan(0); // 全 54 文字が出現
    const expected = total / PORTAL_TOKEN_CHARS.length;
    expect(Math.max(...vals)).toBeLessThan(expected * 1.5);
    expect(Math.min(...vals)).toBeGreaterThan(expected * 0.5);
  });
});

describe('isValidTokenFormat（形式チェック）', () => {
  test('24 文字以上・許可文字のみ → true', () => {
    expect(isValidTokenFormat(genPortalToken())).toBe(true);
    expect(isValidTokenFormat('A'.repeat(24))).toBe(true);
  });
  test('短い / 不正文字 / 非文字列 → false', () => {
    expect(isValidTokenFormat('A'.repeat(23))).toBe(false);
    expect(isValidTokenFormat('A'.repeat(24) + '0')).toBe(false); // 0 は除外文字
    expect(isValidTokenFormat('A'.repeat(24) + '-')).toBe(false);
    expect(isValidTokenFormat(null)).toBe(false);
    expect(isValidTokenFormat(12345678)).toBe(false);
  });
  test('旧 8 文字共有トークンは新形式としては不正（併用判定に使える）', () => {
    expect(isValidTokenFormat('Ab2Cd3Ef')).toBe(false);
  });
});

describe('isLinkActive（期限・失効）', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  test('無期限（expires_at=null）・未失効 → 有効', () => {
    expect(isLinkActive({ expires_at: null, revoked_at: null }, now)).toBe(true);
    expect(isLinkActive({ expires_at: '', revoked_at: null }, now)).toBe(true);
  });
  test('失効済み（revoked_at あり）→ 無効', () => {
    expect(isLinkActive({ expires_at: null, revoked_at: '2026-10-01T00:00:00Z' }, now)).toBe(false);
  });
  test('期限の 1ms 前＝有効 / ちょうど＝失効 / 後＝失効', () => {
    const exp = '2026-10-24T00:00:00.000Z';
    expect(isLinkActive({ expires_at: exp, revoked_at: null }, new Date(Date.parse(exp) - 1))).toBe(true);
    expect(isLinkActive({ expires_at: exp, revoked_at: null }, new Date(Date.parse(exp)))).toBe(false);
    expect(isLinkActive({ expires_at: exp, revoked_at: null }, new Date(Date.parse(exp) + 1))).toBe(false);
  });
  test('壊れた期限は無効（fail-closed）・now 不正も無効・link なしも無効', () => {
    expect(isLinkActive({ expires_at: 'こわれた', revoked_at: null }, now)).toBe(false);
    expect(isLinkActive({ expires_at: null, revoked_at: null }, 'bad-date')).toBe(false);
    expect(isLinkActive(null, now)).toBe(false);
  });
});

describe('monthEndExpiry（提出月の月末 JST ＋猶予）', () => {
  // JST 月末 23:59:59.999 = UTC では当月末日の 14:59:59.999Z。
  test('通常月（10月31日 JST 月末）', () => {
    expect(monthEndExpiry('2026-10')).toBe('2026-10-31T14:59:59.999Z');
  });
  test('2月・平年は 28 日', () => {
    expect(monthEndExpiry('2026-02')).toBe('2026-02-28T14:59:59.999Z');
  });
  test('2月・うるう年は 29 日', () => {
    expect(monthEndExpiry('2024-02')).toBe('2024-02-29T14:59:59.999Z');
  });
  test('12月（年またぎ）＝12月31日 JST 月末', () => {
    expect(monthEndExpiry('2026-12')).toBe('2026-12-31T14:59:59.999Z');
  });
  test('猶予日数ぶん後ろ倒し（同じ壁時計で N 日後）', () => {
    expect(monthEndExpiry('2026-10', 3)).toBe('2026-11-03T14:59:59.999Z');
  });
  test("'YYYY-M' も許容 / 不正は null", () => {
    expect(monthEndExpiry('2026-2')).toBe('2026-02-28T14:59:59.999Z');
    expect(monthEndExpiry('2026-13')).toBeNull();
    expect(monthEndExpiry('bad')).toBeNull();
  });
});

describe('daysFromNowExpiry（発行から N 日後）', () => {
  test('N 日後の ISO を返す', () => {
    expect(daysFromNowExpiry('2026-10-24T00:00:00.000Z', 7)).toBe('2026-10-31T00:00:00.000Z');
  });
  test('now/days 不正は null', () => {
    expect(daysFromNowExpiry('bad', 7)).toBeNull();
    expect(daysFromNowExpiry('2026-10-24T00:00:00Z', NaN)).toBeNull();
    expect(daysFromNowExpiry('2026-10-24T00:00:00Z', 'x')).toBeNull();
  });
});

describe('URL 組み立て/解釈', () => {
  const base = 'https://www.example.test';
  test('ポータル/共有の生成→解釈が往復一致', () => {
    const tk = genPortalToken();
    const pUrl = buildPortalUrl(base + '/', tk); // 末尾スラッシュは除かれる
    expect(pUrl).toBe(`${base}/?p=${tk}`);
    const sUrl = buildShareUrl(base, tk);
    expect(sUrl).toBe(`${base}/?share=${tk}`);
    expect(parseLinkParams(new URL(pUrl).search)).toMatchObject({ kind: 'portal', token: tk });
    expect(parseLinkParams(new URL(sUrl).search)).toMatchObject({ kind: 'share', token: tk, legacy: false });
  });
  test('旧 ?staff= は legacy-staff（dept/cfg/ym も拾う・token なし）', () => {
    const r = parseLinkParams('?staff=AbC123&dept=d1&ym=2026-11&cfg=xxxx');
    expect(r).toEqual({ kind: 'legacy-staff', token: null, staff: 'AbC123', dept: 'd1', cfg: 'xxxx', ym: '2026-11' });
  });
  test('旧 8 文字共有は share かつ legacy:true', () => {
    expect(parseLinkParams('?share=Ab2Cd3Ef')).toMatchObject({ kind: 'share', token: 'Ab2Cd3Ef', legacy: true });
  });
  test('該当なし/不正入力でも例外を出さず kind:null', () => {
    expect(parseLinkParams('?foo=bar')).toEqual({ kind: null, token: null });
    expect(parseLinkParams('')).toEqual({ kind: null, token: null });
    expect(parseLinkParams(undefined)).toEqual({ kind: null, token: null });
    expect(parseLinkParams(12345)).toEqual({ kind: null, token: null });
  });
});
