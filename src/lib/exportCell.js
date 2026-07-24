/**
 * 書き出し（印刷HTML / CSV）のセル表示値を決める純粋ロジック。
 *
 * 画面(ShiftTable)は dispType = セル実値(deptShifts) || 希望勤務値(shiftRequestsByMonth)
 * のオーバーレイ方式（App.jsx の dispType）。書き出しも同じ優先順位にそろえ、
 * 「セルは空だが希望勤務に値がある」状態でも画面と同じ値を出力する。
 *
 * 希望休(kiboByMonth)・有休(yukyuByMonth)のオーバーレイは呼び出し側で従来通り
 * 適用する（この関数が "" を返したときのみ有効になる＝画面の isKibo/isYukyu と同じ）。
 *
 * @param {string} rawVal   セル実値（deptShifts[staffId][day]）
 * @param {string} fixedVal 希望勤務値（shiftRequestsByMonth[mk][day]）
 * @returns {string} 表示に用いるシフト値（実値優先・無ければ希望勤務・どちらも無ければ ""）
 */
export function effectiveCellShift(rawVal, fixedVal) {
  return rawVal || fixedVal || "";
}
