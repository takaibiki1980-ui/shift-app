/**
 * N-1: アプリ内お知らせ欄の純粋ロジック（副作用なし・テスト対象）。
 * 画面はこれらを呼ぶだけ。DB/React/フラグには依存しない。
 */

export const ANNOUNCEMENT_SEVERITIES = ['info', 'maintenance', 'important', 'incident'];
export const BANNER_SEVERITIES = ['important', 'incident']; // 細いバナーを出す重要度
export const TITLE_MAX = 80;
export const BODY_MAX = 2000;

const _ms = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * 公開中か（公開 & (開始なし | 開始<=now) & (終了なし | 終了>now)）。
 * now は Date。publish_at 未設定（null）は「開始条件なし＝公開済み」扱い（DB の RLS と同じ判定）。
 */
export function isVisible(row, now) {
  if (!row || !row.published) return false;
  const n = (now instanceof Date ? now.getTime() : new Date(now).getTime());
  const start = _ms(row.publish_at);
  if (start != null && start > n) return false;  // publish_at が null なら公開開始済み扱い（DB RLS と同じ）
  const end = _ms(row.expire_at);
  if (end != null && end <= n) return false;
  return true;
}

/** 固定表示(pinned)を先頭、その中・その他とも publish_at の新しい順。同時刻は id で安定化。 */
export function sortAnnouncements(rows) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  return list.sort((a, b) => {
    const pa = a?.pinned ? 1 : 0, pb = b?.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;              // pinned 先頭
    const ta = _ms(a?.publish_at) ?? 0, tb = _ms(b?.publish_at) ?? 0;
    if (ta !== tb) return tb - ta;              // 新しい順
    return String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
  });
}

/** 未読数（公開中のうち、既読 id に無いもの）。readIds は Set か配列。 */
export function unreadCount(rows, readIds, now = new Date()) {
  const read = readIds instanceof Set ? readIds : new Set(readIds || []);
  return (Array.isArray(rows) ? rows : []).filter((r) => isVisible(r, now) && !read.has(r.id)).length;
}

/**
 * 細いバナーに出すお知らせ（important/incident・公開中・未読・未dismiss）を並び順で返す。
 * dismissedIds は端末ローカル（localStorage）の「閉じた」記録。
 */
export function shouldShowBanner(rows, readIds, dismissedIds, now = new Date()) {
  const read = readIds instanceof Set ? readIds : new Set(readIds || []);
  const dis = dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds || []);
  const hit = (Array.isArray(rows) ? rows : []).filter((r) =>
    isVisible(r, now) && BANNER_SEVERITIES.includes(r.severity) && !read.has(r.id) && !dis.has(r.id));
  return sortAnnouncements(hit);
}

/** 入力検証。戻り値 { ok, errors:string[] }。保存前に画面と RPC の両方で使える。 */
export function validateAnnouncementInput(input) {
  const errors = [];
  const title = (input?.title ?? '').trim();
  const body = (input?.body ?? '').trim();
  if (!title) errors.push('タイトルを入力してください');
  if (title.length > TITLE_MAX) errors.push(`タイトルは${TITLE_MAX}字以内です`);
  if (!body) errors.push('本文を入力してください');
  if (body.length > BODY_MAX) errors.push(`本文は${BODY_MAX}字以内です`);
  if (!ANNOUNCEMENT_SEVERITIES.includes(input?.severity)) errors.push('種類が不正です');
  const start = _ms(input?.publish_at);
  const end = _ms(input?.expire_at);
  if (input?.publish_at && start == null) errors.push('公開開始日時が不正です');
  if (input?.expire_at && end == null) errors.push('公開終了日時が不正です');
  if (start != null && end != null && end <= start) errors.push('公開終了は公開開始より後にしてください');
  return { ok: errors.length === 0, errors };
}

/**
 * 本文を「テキスト部品」の配列に分解する。https:// で始まる URL だけをリンク部品にする。
 * HTML 文字列は返さない（呼び出し側で React のテキスト/aタグとして描画＝XSS 回避）。
 * 改行は text 部品の中にそのまま残す（描画側で white-space を pre-wrap 等にする）。
 * @returns {Array<{type:'text',value:string}|{type:'link',url:string}>}
 */
export function linkifyHttps(text) {
  const s = text == null ? '' : String(text);
  const out = [];
  const re = /https:\/\/[^\s<>"']+/g; // https のみ。http:// や javascript: は対象外
  let last = 0, m;
  while ((m = re.exec(s)) !== null) {
    let url = m[0];
    // 末尾の句読点・閉じ括弧はリンクから除く（文中URLの実用上）
    const trail = url.match(/[.,;:!?。、）)\]】」』]+$/);
    if (trail) url = url.slice(0, url.length - trail[0].length);
    const start = m.index;
    if (start > last) out.push({ type: 'text', value: s.slice(last, start) });
    out.push({ type: 'link', url });
    last = start + url.length;
    re.lastIndex = last;
  }
  if (last < s.length) out.push({ type: 'text', value: s.slice(last) });
  if (out.length === 0) out.push({ type: 'text', value: '' });
  return out;
}

// バナーを閉じた記録の localStorage キー。
export const ANNOUNCE_DISMISS_KEY = 'announceBannerDismissed';
