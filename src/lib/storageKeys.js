/**
 * localStorage の「アカウント中身」キーに、ログイン中のユーザーIDを含める（2b）。
 * アカウントが違えば別の保存場所になり、同じ端末での別アカウント混入を防ぐ。
 *
 * 対象（呼び出し側で baseKey に渡す）: shiftNavi_depts / shiftNavi_staffList /
 *   shiftNavi_shifts_{Y}_{M} / shiftNavi_allFloorSettings / shiftNavi_yotei_{Y}_{M} など
 *   「アカウントの中身」だけ。端末の好み（shiftTableZoom・各種 dismiss）は対象外。
 *
 * 方針:
 *   - userId が空のときは null を返し、呼び出し側は localStorage を読み書きしない（空キー混入の防止）。
 *   - 旧キー（userId なしの shiftNavi_*）は読まない（別アカウント混入の防止）。削除は後続PR。
 */

/** 名前空間付きキー。userId か baseKey が空なら null（呼び出し側は何もしない）。 */
export function userKey(userId, baseKey) {
  const uid = userId == null ? '' : String(userId).trim();
  const base = baseKey == null ? '' : String(baseKey);
  if (!uid || !base) return null;
  return `u:${uid}:${base}`;
}

/** 名前空間付きキーから読む。userId 無し・不可環境では null。 */
export function readUserKey(userId, baseKey) {
  const k = userKey(userId, baseKey);
  if (!k) return null;
  try { return localStorage.getItem(k); } catch { return null; }
}

/** 名前空間付きキーへ書く。userId 無し・不可環境では false（画面は壊さない）。 */
export function writeUserKey(userId, baseKey, value) {
  const k = userKey(userId, baseKey);
  if (!k) return false;
  try { localStorage.setItem(k, value); return true; } catch { return false; }
}

/** 名前空間付きキーを削除。 */
export function removeUserKey(userId, baseKey) {
  const k = userKey(userId, baseKey);
  if (!k) return false;
  try { localStorage.removeItem(k); return true; } catch { return false; }
}
