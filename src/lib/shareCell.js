/**
 * 共有画面（SharedShiftView）のセル表示の純粋ロジック。表示のみ・生成/core.js に非関与。
 *
 * 不具合: 右クリックの有給は yukyuByMonth に入りセル値は空のため、共有では空セル→「－」になる。
 * 対応: 共有ペイロードに各職員の有給日(yukyu)を含め、空セルかつ有給日なら「有」と表示する。
 *   セル値（"有休" など）があればそれを優先。旧ペイロード（yukyu 無し）でも従来どおり。
 */

/**
 * 共有セルの表示を決める。セル値優先、空セルかつ有給日なら「有」。
 * @param {string} cellValue  セル値（空文字/未入力は無し扱い）
 * @param {number[]} yukyuDays その職員の有給日の配列（旧ペイロードは undefined）
 * @param {number} day        日（1〜31）
 * @param {(v:string)=>string} cellShort セル値→短縮表示（SharedShiftView 既存の変換。空→'－'）
 * @returns {{text:string, yukyu:boolean}} text=表示文字、yukyu=有給オーバーレイか（色分け用）
 */
export function shareYukyuCell(cellValue, yukyuDays, day, cellShort) {
  const v = cellValue || '';
  const fn = typeof cellShort === 'function' ? cellShort : (x) => (x || '－');
  if (!v && Array.isArray(yukyuDays) && yukyuDays.includes(day)) {
    return { text: '有', yukyu: true };
  }
  return { text: fn(v), yukyu: false };
}
