/**
 * セル固定（＝希望勤務）の純粋ロジック（生成・core.js には非関与）。
 *
 * 「固定」と「希望勤務」は同一概念として統一：どちらも shiftRequestsByMonth に
 * 値が入っている＝その日をそのシフトに固定（生成で変更されない）。
 *   - 固定/希望勤務にする: そのセルの現在値を shiftRequestsByMonth[mk][day] に書く
 *   - 解除:               shiftRequestsByMonth[mk][day] を削除
 * 空セルは固定しない（値がある時のみ）。UI専用マーカー(fixedByMonth)は廃止し、
 * shiftRequestsByMonth の有無だけで固定判定する（表示・生成ロックが一致）。
 */
import { monthKey } from '../engine/core.js';

/**
 * @param {Object} staff    対象スタッフ
 * @param {Array}  targets  [[staffId, day], ...] 固定/解除対象
 * @param {boolean} fix      true=希望勤務にする / false=解除
 * @param {Object} shiftsNow { staffId: { day: shift } } 現在のシフト（固定時に値を読む）
 * @param {number} year
 * @param {number} month     0始まり
 * @returns {Object} 更新後のスタッフ（対象外なら同一参照）
 */
export function applyCellFix(staff, targets, fix, shiftsNow, year, month) {
  const mk = monthKey(year, month);
  const mine = (targets || []).filter(([sid]) => sid === staff.id);
  if (mine.length === 0) return staff;
  const sr = { ...(staff.shiftRequestsByMonth || {}) }; sr[mk] = { ...(sr[mk] || {}) };
  for (const [sid, d] of mine) {
    if (fix) {
      const v = shiftsNow?.[sid]?.[d];
      if (!v) continue; // 空セルは固定しない
      sr[mk][d] = v;
    } else {
      delete sr[mk][d];
    }
  }
  return { ...staff, shiftRequestsByMonth: sr };
}
