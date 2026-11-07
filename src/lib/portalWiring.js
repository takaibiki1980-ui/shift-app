/**
 * ポータル/共有リンク新方式「配線の判断」純粋ロジック（PR-C）。副作用なし・テスト対象。
 * App.jsx はここの関数で「締切の解決・既存リンクの再利用・無効表示」を判断する。
 * token 生成や期限算出は portalToken.js。ここは“どう振る舞うか”の判断だけ。
 */
import { isLinkActive } from './portalToken.js';

// 無効・期限切れ・失効・不明を区別しない共通文言（理由を漏らさない）。
export const PORTAL_INVALID_MESSAGE = 'このリンクは無効です。リーダーに新しいリンクをもらってください。';

/**
 * 部署 dept と対象月 ym("YYYY-M") から締切日("YYYY-MM-DD" or null) を解決する。
 * App.jsx の resolvePortalDeadline と同一規則（byMonth[ym] 最優先 → flatYm 一致時 flat → それ以外 null）。
 * ym 無しは flat deadline。発行時の p_expires_at 算出に使う（deadlineExpiry に渡す）。
 */
export function resolveDeadlineDate(dept, ym) {
  if (!dept) return null;
  const flatYm = (dept.targetYear && dept.targetMonth) ? `${dept.targetYear}-${dept.targetMonth}` : null;
  const bm = dept.byMonth;
  if (ym) {
    if (bm && Object.prototype.hasOwnProperty.call(bm, ym)) return bm[ym]?.deadline || null;
    if (ym === flatYm) return dept.deadline || null;
    return null;
  }
  return dept.deadline || null;
}

/**
 * 同じ部署・同じ対象月の「有効な」リンクを1つ返す（再利用。重複発行を防ぐ）。無ければ null。
 * links は本人が SELECT した portal_links の行配列 [{dept_id, target_month, expires_at, revoked_at, token, id}]。
 * target_month は null 同士も一致とみなす。有効性は isLinkActive（失効・期限）で判定。
 */
export function findReusablePortalLink(links, deptId, targetMonth, now) {
  if (!Array.isArray(links)) return null;
  const want = targetMonth == null ? null : String(targetMonth);
  return links.find((l) =>
    l && l.dept_id === deptId &&
    ((l.target_month == null ? null : String(l.target_month)) === want) &&
    isLinkActive(l, now)
  ) || null;
}

/**
 * 発行UI（PortalTokenIssuer）の状態を決める純関数。「確認（表示）」と「発行」を分離する。
 *  - 有効な同一部署・同一月リンクがある → 'show'（再利用の token を表示。新規は作らない）。
 *  - 無く、締切日も未設定       → 'needs-deadline'（期限なしリンクは作らせない＝現状維持）。
 *  - 無く、締切日が設定済み     → 'can-issue'（明示ボタンで新規発行してよい）。
 * links は本人が SELECT した portal_links 行配列。null/未取得は呼び出し側で 'loading' を扱う。
 */
export function portalIssuerState({ links, deptId, targetMonth, deadlineDate, now }) {
  const reuse = findReusablePortalLink(links, deptId, targetMonth, now);
  if (reuse) return { mode: 'show', token: reuse.token };
  if (!deadlineDate) return { mode: 'needs-deadline', token: null };
  return { mode: 'can-issue', token: null };
}

/**
 * 職員ポータルのヘッダに出す施設名。メールらしき値（'@' を含む）は職員に見せないため、
 * fallback（既定 'YEIX'）に置き換える。profiles.facility_name が未設定だとメールが既定値に
 * なる経路があるための防御（表示のみ・保存値は変えない）。
 */
export function portalDisplayTitle(facilityName, fallback = 'YEIX') {
  const v = (facilityName == null ? '' : String(facilityName)).trim();
  if (!v) return fallback;
  if (v.includes('@')) return fallback; // メールアドレスらしき値は出さない
  return v;
}
