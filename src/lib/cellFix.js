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
export function applyCellFix(staff, targets, fix, shiftsNow, year, month, markEdit = false) {
  const mk = monthKey(year, month);
  const mine = (targets || []).filter(([sid]) => sid === staff.id);
  if (mine.length === 0) return staff;
  const sr = { ...(staff.shiftRequestsByMonth || {}) }; sr[mk] = { ...(sr[mk] || {}) };
  // 修正マーカー(shiftEditsByMonth): 表示・一括削除用のマーカー。
  // markEdit時のみ書き込む/既に持つ場合のみ整理する（フラグOFF・従来利用時は staff の形を変えない）。
  const touchEdits = markEdit || !!staff.shiftEditsByMonth;
  const se = touchEdits ? { ...(staff.shiftEditsByMonth || {}) } : null;
  if (se) se[mk] = { ...(se[mk] || {}) };
  for (const [sid, d] of mine) {
    if (fix) {
      const v = shiftsNow?.[sid]?.[d];
      if (!v) { if (se) delete se[mk][d]; continue; } // 空セルは固定しない
      if (markEdit) {
        // 段階2: 修正は「その回の生成の産物」。希望勤務(shiftRequestsByMonth)には載せない
        //   → 生成step1で絶対固定されず、同じ月を生成し直すと消えて新結果に置き換わる（ユーザー意図）。
        //   マーカー(shiftEditsByMonth)だけに記録し、同セルに希望が残っていれば解除する（修正≠希望）。
        delete sr[mk][d];
        if (se) se[mk][d] = v;
      } else {
        sr[mk][d] = v;                    // 希望勤務は従来通り固定（生成step1で絶対ロック）
        if (se) delete se[mk][d];         // 希望で上書き＝修正マーカー解除
      }
    } else {
      delete sr[mk][d];
      if (se) delete se[mk][d];
    }
  }
  const out = { ...staff, shiftRequestsByMonth: sr };
  if (se) out.shiftEditsByMonth = se;
  return out;
}
