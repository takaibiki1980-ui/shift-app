/**
 * 勤務種別の「同値グループ」表と、遷移ルールの前日判定で使うマッチ関数。
 *
 * 目的: 遷移強制「休み→遅番」等が、前日の値と文字列完全一致でしか働かず、
 *   前日が「希望休」だと対象外になって翌日が早番のまま残る問題を解消する。
 *   個別の if を足さず、同値グループ表を1か所に集約して拡張しやすくする。
 *
 * ここで扱うのは「遷移ルールの前日判定」のみ。isWork 判定・公休の数え方など、
 * 休みと希望休を区別して使う既存ロジックには関与しない。
 */

// 1行で元に戻せる定数フラグ。false にすると希望休は休み扱いしない（＝従来の完全一致）。
export const FORCE_TREAT_KIBO_AS_REST = true;

// 「休み」トークンと同値に扱う勤務値（前日判定のみ）。
// 有休は賃金支払い対象かつ個別ロックのため含めない。
export const REST_LIKE = FORCE_TREAT_KIBO_AS_REST ? ['休み', '希望休'] : ['休み'];

// 同値グループ表: token -> その token と同値に扱う value の配列。
// 今回は '休み' のみ拡張。将来、別の休暇種別を休み扱いにする等はここに足すだけでよい。
export const DEFAULT_SHIFT_EQUIV = { '休み': REST_LIKE };

/**
 * value が token に一致するか。
 * token が同値グループを持つ場合はそのグループのどれかと一致で真、
 * 持たない token は従来どおり完全一致。
 * @param {string} value 実際の勤務値（例: res[s][d] = '希望休'）
 * @param {string} token 比較する種別トークン（例: force.from = '休み'）
 * @param {Object} [equiv] 同値グループ表の上書き（将来の部署別設定用・今回は未使用）
 * @returns {boolean}
 */
export function matchesToken(value, token, equiv = DEFAULT_SHIFT_EQUIV) {
  if (value == null || token == null) return false;
  const group = equiv?.[token];
  if (Array.isArray(group) && group.length) return group.includes(value);
  return value === token;
}
