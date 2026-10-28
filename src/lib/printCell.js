/**
 * 印刷 / HTMLダウンロード（buildPrintHTML）の1セルの表示文字を決める純粋ロジック。
 * 表示のみ・生成/core.js には非関与。CSV(buildCSV) とは別物（CSV は変更しない）。
 *
 * 右クリックの有給（セル空＋yukyu日）は「有」で表示する。これは色指定なし＝印刷の
 * 既定色（body color:#111）で描かれ、セル値 "有休"（getShiftDef('有休').short='有'）と
 * 同じ見た目になる。以前は overlay だけ紫 <span style="color:#9b4db5"> が付いて浮いていた。
 *
 * @param {object} a
 * @param {boolean} a.isKibo   希望休オーバーレイ（セル空＋希望休日）か
 * @param {string}  a.dispV    実効セル値（effectiveCellShift の結果。空文字可）
 * @param {boolean} a.isYukyu2 右クリック有給オーバーレイ（セル空＋有給日）か
 * @param {boolean} a.half     dispV が半日休(日/休・休/日・早/休・休/遅)か（HALF_REST_TYPES.has(dispV)）
 * @param {string}  [a.short]  dispV の短縮表示（getShiftDef(dispV)?.short）。無ければ '－'
 * @returns {string} td に入れる表示文字（色 span を含まないプレーン文字）
 */
export function printCellText({ isKibo, dispV, isYukyu2, half, short }) {
  if (isKibo || dispV === '希望休' || dispV === '希') return '休';
  if (isYukyu2) return '有';           // 右クリック有給：色指定なし＝セル値 "有休" と同じ
  if (half) return dispV;              // 半日休はスラッシュ付きのまま
  return short || '－';
}
