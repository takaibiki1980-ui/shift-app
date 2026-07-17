/**
 * セル固定/解除の純粋ロジック（生成・core.js には非関与）。
 *
 * 固定は「既存のロック機構（shiftRequestsByMonth）に値を載せる」ことで実現し、
 * fixedByMonth[mk][day]=true は UI 専用マーカー（core.js は読まない）。
 *   - 固定: そのセルの現在値を shiftRequestsByMonth[mk][day] に書き、fixedByMonth を立てる
 *   - 解除: 両方から当該日を削除
 * 空セルは固定しない（値がある時のみ）。
 */
import { monthKey } from '../engine/core.js';

/**
 * @param {Object} staff    対象スタッフ
 * @param {Array}  targets  [[staffId, day], ...] 固定/解除対象
 * @param {boolean} fix      true=固定 / false=解除
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
  const fx = { ...(staff.fixedByMonth || {}) }; fx[mk] = { ...(fx[mk] || {}) };
  for (const [sid, d] of mine) {
    if (fix) {
      const v = shiftsNow?.[sid]?.[d];
      if (!v) continue; // 空セルは固定しない
      sr[mk][d] = v;
      fx[mk][d] = true;
    } else {
      delete sr[mk][d];
      delete fx[mk][d];
    }
  }
  return { ...staff, shiftRequestsByMonth: sr, fixedByMonth: fx };
}
