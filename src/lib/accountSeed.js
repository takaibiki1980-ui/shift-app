/**
 * 新規アカウント（自分のサーバー行が無い）の初期データの選び方（純関数・副作用なし）。
 *
 * 背景（別アカウント汚染）: 旧実装は、サーバーに自分の行が無い新規アカウントのとき、端末の
 *   localStorage 由来の値（deptsRef/staffListRef。キーが user_id 無しで全アカウント共有）を
 *   そのまま自分の行へ保存していた。これにより、実施設のデータが入った端末で新規アカウントに
 *   初ログインすると、その実データが新アカウントへ混入した。
 *
 * 本モジュールは「サーバー行があればそれ、無ければ localStorage ではなくハードコード既定」を返す。
 * App.jsx 側は chooseSeed の戻り値を state と保存の両方に使う。
 */

/** 深いクローン（既定値の共有参照を避け、後からの変更で定数を壊さない）。 */
function deepClone(v) {
  if (v == null) return v;
  try {
    if (typeof structuredClone === 'function') return structuredClone(v);
  } catch { /* fall through */ }
  return JSON.parse(JSON.stringify(v));
}

/**
 * サーバーに自分の行の値があればそれを使い、無ければハードコード既定のクローンを返す。
 * localStorage 由来の値は渡さない運用にする（呼び出し側で serverValue と hardcodedDefault のみ渡す）。
 * @param {*} serverValue  その data_key のサーバー値（無ければ null/undefined）
 * @param {*} hardcodedDefault  DEFAULT_DEPTS / buildStaff() などのハードコード既定
 * @returns {*} serverValue（あるとき）/ hardcodedDefault のクローン（新規のとき）
 */
export function chooseSeed(serverValue, hardcodedDefault) {
  if (serverValue !== undefined && serverValue !== null) return serverValue;
  return deepClone(hardcodedDefault);
}

/**
 * このアカウントが「既存（自分のサーバー行がある）」か。depts か staffList のどちらかがあれば既存。
 * @param {object} byKey  data_key → data_value のマップ
 */
export function isExistingAccount(byKey) {
  return !!(byKey && (byKey.depts || byKey.staffList));
}
