/**
 * 発行済みリンク（希望休/共有）の一覧表示の純粋ロジック（PR-E）。副作用なし・テスト対象。
 * 状態判定・状態ラベル・部署名変換・並び替え・「もっと見る」の件数計算だけを行う。
 * token は URL 生成に使うが、画面に“文字”として出さない前提（UI 側で QR/コピーのみに使う）。
 */
import { isLinkActive } from './portalToken.js';

const STATUS_ORDER = { active: 0, expired: 1, revoked: 2 };
const STATUS_LABEL = { active: '有効', expired: '期限切れ', revoked: '止めた' };

/** リンクの状態: 'active'（有効）/ 'expired'（期限切れ）/ 'revoked'（止めた）。 */
export function linkStatus(link, now) {
  if (!link) return 'revoked';
  if (link.revoked_at != null && link.revoked_at !== '') return 'revoked';
  return isLinkActive(link, now) ? 'active' : 'expired';
}

/** 止められるか＝有効なときだけ。 */
export function canRevokeLink(link, now) {
  return linkStatus(link, now) === 'active';
}

export function statusLabel(status) {
  return STATUS_LABEL[status] || '';
}

/** 部署ID→部署名。マップに無ければ ID をそのまま返す。 */
export function deptNameOf(deptId, deptNameById) {
  return (deptNameById && deptNameById[deptId]) || deptId;
}

// 並べ替え: 有効→期限切れ→止めた、同状態内は created_at 新しい順。
function sortRows(rows) {
  return rows.slice().sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return (tb || 0) - (ta || 0);
  });
}

/** portal_links 行を表示用に整形＋並べ替え。 */
export function formatPortalRows(links, deptNameById, now) {
  const rows = (Array.isArray(links) ? links : []).map((l) => {
    const status = linkStatus(l, now);
    return {
      id: l.id, kind: 'portal',
      deptName: deptNameOf(l.dept_id, deptNameById),
      targetMonth: l.target_month || null,
      label: l.label || null,
      status, statusLabel: statusLabel(status),
      createdAt: l.created_at || null,
      canRevoke: status === 'active',
      token: l.token || null, // URL 生成用（画面に文字では出さない）
    };
  });
  return sortRows(rows);
}

/** shared_shifts 行を表示用に整形＋並べ替え。 */
export function formatSharedRows(shared, deptNameById, now) {
  const rows = (Array.isArray(shared) ? shared : []).map((s) => {
    const status = linkStatus(s, now);
    return {
      id: s.id, kind: 'share',
      deptNames: (Array.isArray(s.dept_ids) ? s.dept_ids : []).map((id) => deptNameOf(id, deptNameById)),
      ym: (s.year != null && s.month != null) ? `${s.year}-${s.month}` : null,
      status, statusLabel: statusLabel(status),
      createdAt: s.created_at || null,
      canRevoke: status === 'active',
      token: s.token || null,
    };
  });
  return sortRows(rows);
}

/** 「もっと見る」用: 先頭 limit 件に絞り、残りの有無・件数を返す。 */
export function sliceWithMore(rows, limit) {
  const arr = Array.isArray(rows) ? rows : [];
  const lim = (typeof limit === 'number' && limit > 0) ? limit : arr.length;
  return { shown: arr.slice(0, lim), hasMore: arr.length > lim, remaining: Math.max(0, arr.length - lim) };
}
