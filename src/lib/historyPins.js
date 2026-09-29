/**
 * 変更履歴の「ピン留め（永続保存）」の純粋ロジック。生成・core.js には非関与。
 *
 * ピンは独立テーブル shift_data_pins（案B）に保存する。ここでは DB 非依存の
 * 純粋関数だけを提供する（名前の検証、INSERT 行の組み立て、表示用の並べ替え）。
 * 実際の Supabase 読み書き・UI は後続 PR で配線する。
 */

// ピン名の最大長（表示崩れ防止・実用上十分）
export const MAX_PIN_NAME_LEN = 40;
// 名前が空のときの既定名
export const DEFAULT_PIN_NAME = '無名のピン';

/**
 * ピン名を整形する。前後空白を除去し、最大長で切り詰め、空なら既定名を返す。
 * @param {string} name
 * @param {string} [fallback=DEFAULT_PIN_NAME]
 * @returns {string}
 */
export function sanitizePinName(name, fallback = DEFAULT_PIN_NAME) {
  const t = (name == null ? '' : String(name)).trim();
  if (!t) return fallback;
  return t.length > MAX_PIN_NAME_LEN ? t.slice(0, MAX_PIN_NAME_LEN) : t;
}

/**
 * shift_data_pins へ INSERT する行オブジェクトを組み立てる（純粋・非破壊）。
 * data_value が無い場合は null を返す（呼び出し側で INSERT しない）。
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.dataKey            例 shifts_2026_9_kaigo1
 * @param {string} args.name               ピン名（未整形で可）
 * @param {Object} args.dataValue          shifts の中身（必須）
 * @param {Object} [args.marksValue]       対の editmarks(色) のコピー（任意）
 * @param {string} [args.sourceArchivedAt] 元履歴の archived_at（任意・表示用）
 * @param {string} [args.originalUpdatedAt]元 shift_data.updated_at（任意・参考）
 * @returns {Object|null} INSERT 用オブジェクト、または data_value 欠如時 null
 */
export function buildPinInsert({ userId, dataKey, name, dataValue, marksValue = null, sourceArchivedAt = null, originalUpdatedAt = null }) {
  if (!userId || !dataKey || dataValue == null) return null;
  return {
    user_id: userId,
    data_key: dataKey,
    name: sanitizePinName(name),
    data_value: dataValue,
    marks_value: marksValue ?? null,
    source_archived_at: sourceArchivedAt ?? null,
    original_updated_at: originalUpdatedAt ?? null,
  };
}

/**
 * ピン一覧を新しい順（created_at 降順）に並べ替える（非破壊）。
 * created_at が無い/同値の場合は id 降順で安定化。
 * @param {Array} pins
 * @returns {Array} 新しい配列
 */
export function sortPinsByNewest(pins) {
  return [...(pins || [])].sort((a, b) => {
    const ta = a?.created_at ? Date.parse(a.created_at) : 0;
    const tb = b?.created_at ? Date.parse(b.created_at) : 0;
    if (tb !== ta) return tb - ta;
    return (b?.id || 0) - (a?.id || 0);
  });
}
