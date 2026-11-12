/**
 * src/lib/announcements.js のテスト（N-1 お知らせ・純ロジック）。
 */
import { describe, test, expect } from 'vitest';
import {
  isVisible, sortAnnouncements, unreadCount, shouldShowBanner,
  validateAnnouncementInput, linkifyHttps, ANNOUNCEMENT_SEVERITIES, TITLE_MAX, BODY_MAX,
} from '../lib/announcements.js';

const NOW = new Date('2026-11-12T00:00:00Z');
const iso = (dMs) => new Date(NOW.getTime() + dMs).toISOString();
const row = (o) => ({ id: o.id || 'x', title: 't', body: 'b', severity: 'info', published: true, pinned: false, publish_at: iso(-1000), expire_at: null, ...o });

describe('isVisible（公開期間の境界）', () => {
  test('下書きは不可', () => expect(isVisible(row({ published: false }), NOW)).toBe(false));
  test('開始前は不可 / 開始ちょうどは可', () => {
    expect(isVisible(row({ publish_at: iso(1000) }), NOW)).toBe(false);
    expect(isVisible(row({ publish_at: NOW.toISOString() }), NOW)).toBe(true);
  });
  test('期限ちょうど(expire==now)は不可 / 期限後も不可 / 期限前は可', () => {
    expect(isVisible(row({ expire_at: NOW.toISOString() }), NOW)).toBe(false);
    expect(isVisible(row({ expire_at: iso(-1) }), NOW)).toBe(false);
    expect(isVisible(row({ expire_at: iso(1000) }), NOW)).toBe(true);
  });
  test('publish_at が null は公開済み扱い＝可（DB RLS と同じ）', () => {
    expect(isVisible(row({ publish_at: null }), NOW)).toBe(true);
    expect(isVisible(row({ publish_at: null, published: false }), NOW)).toBe(false); // 下書きは不可
    expect(isVisible(row({ publish_at: null, expire_at: iso(-1) }), NOW)).toBe(false); // 期限切れは不可
  });
});

describe('sortAnnouncements（固定→新しい順）', () => {
  test('pinned が先頭、各群は publish_at 新しい順', () => {
    const a = row({ id: 'a', publish_at: iso(-3000) });
    const b = row({ id: 'b', publish_at: iso(-1000) });
    const c = row({ id: 'c', publish_at: iso(-2000), pinned: true });
    const out = sortAnnouncements([a, b, c]).map((r) => r.id);
    expect(out[0]).toBe('c');          // pinned 先頭
    expect(out.slice(1)).toEqual(['b', 'a']); // 新しい順
  });
});

describe('unreadCount', () => {
  test('公開中かつ未読のみ数える', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c', published: false })];
    expect(unreadCount(rows, ['a'], NOW)).toBe(1); // b のみ（a=既読, c=下書き）
    expect(unreadCount(rows, [], NOW)).toBe(2);
  });
});

describe('shouldShowBanner（important/incident・未読・未dismiss）', () => {
  const imp = row({ id: 'i', severity: 'important' });
  const inc = row({ id: 'n', severity: 'incident' });
  const info = row({ id: 'f', severity: 'info' });
  test('重要度が対象・未読・未dismiss のものだけ（info は除外）', () => {
    const ids = shouldShowBanner([imp, inc, info], [], [], NOW).map((r) => r.id);
    expect(ids.sort()).toEqual(['i', 'n']);
  });
  test('既読は出さない / dismiss は出さない / info は対象外', () => {
    expect(shouldShowBanner([imp], ['i'], [], NOW)).toEqual([]);
    expect(shouldShowBanner([imp], [], ['i'], NOW)).toEqual([]);
    expect(shouldShowBanner([info], [], [], NOW)).toEqual([]);
    expect(shouldShowBanner([imp, inc], [], [], NOW).length).toBe(2);
  });
});

describe('validateAnnouncementInput', () => {
  const base = { title: 'タイトル', body: '本文', severity: 'info', publish_at: iso(0), expire_at: null };
  test('正常', () => expect(validateAnnouncementInput(base).ok).toBe(true));
  test('タイトル80字/81字', () => {
    expect(validateAnnouncementInput({ ...base, title: 'あ'.repeat(TITLE_MAX) }).ok).toBe(true);
    expect(validateAnnouncementInput({ ...base, title: 'あ'.repeat(TITLE_MAX + 1) }).ok).toBe(false);
  });
  test('本文2000字/2001字', () => {
    expect(validateAnnouncementInput({ ...base, body: 'あ'.repeat(BODY_MAX) }).ok).toBe(true);
    expect(validateAnnouncementInput({ ...base, body: 'あ'.repeat(BODY_MAX + 1) }).ok).toBe(false);
  });
  test('severity 不正 / 期間の前後', () => {
    expect(validateAnnouncementInput({ ...base, severity: 'xxx' }).ok).toBe(false);
    expect(validateAnnouncementInput({ ...base, publish_at: iso(1000), expire_at: iso(1000) }).ok).toBe(false); // end<=start
    expect(validateAnnouncementInput({ ...base, publish_at: iso(0), expire_at: iso(1000) }).ok).toBe(true);
  });
  test('severity の4種', () => expect(ANNOUNCEMENT_SEVERITIES).toEqual(['info', 'maintenance', 'important', 'incident']));
});

describe('linkifyHttps（https のみ・HTML を返さない）', () => {
  test('https はリンク部品', () => {
    const parts = linkifyHttps('前 https://example.com/a 後');
    expect(parts).toEqual([
      { type: 'text', value: '前 ' },
      { type: 'link', url: 'https://example.com/a' },
      { type: 'text', value: ' 後' },
    ]);
  });
  test('http:// と javascript: はリンクにしない（テキストのまま）', () => {
    expect(linkifyHttps('http://a.com javascript:alert(1)')).toEqual([{ type: 'text', value: 'http://a.com javascript:alert(1)' }]);
  });
  test('<script> はテキスト部品のまま（HTML 文字列を返さない）', () => {
    const parts = linkifyHttps('<script>alert(1)</script>');
    expect(parts).toEqual([{ type: 'text', value: '<script>alert(1)</script>' }]);
    expect(parts.every((p) => p.type === 'text' || p.type === 'link')).toBe(true);
  });
  test('末尾の句読点はリンクから除く / 改行は text に残す', () => {
    expect(linkifyHttps('見てね https://ex.com/p。')).toEqual([
      { type: 'text', value: '見てね ' },
      { type: 'link', url: 'https://ex.com/p' },
      { type: 'text', value: '。' },
    ]);
    expect(linkifyHttps('1行目\n2行目')).toEqual([{ type: 'text', value: '1行目\n2行目' }]);
  });
});
