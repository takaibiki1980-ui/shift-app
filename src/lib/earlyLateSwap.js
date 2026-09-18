/**
 * 早番⇄遅番の1対1入れ替え用の純粋ロジック（表示・入力データのみ・生成/core.jsに非関与）。
 *
 * 右クリックで「早番」を選んだとき、同じ日・同じ部署に既に「早番」の人がいれば、
 * その人を「遅番」に入れ替える（逆方向も同様）。対象は早番⇄遅番のみ。
 */
export const SWAP_PAIR = { '早番': '遅番', '遅番': '早番' };

export function isSwapShift(shift) {
  return shift === '早番' || shift === '遅番';
}

/**
 * 入れ替え相手の候補を返す。
 * @param {Object} deptShifts    { [staffId]: { [day]: shift } } その部署の当月シフト（deptShifts）
 * @param {Array}  staffList     スタッフ配列
 * @param {string} deptId        対象部署
 * @param {string} targetId      右クリックされた本人（除外）
 * @param {number} day           対象日
 * @param {string} selectedShift 選んだ勤務（早番 or 遅番）
 * @returns {string[]} 同じ日に selectedShift を持つ他スタッフの id 配列（入れ替え候補）
 */
export function findSwapCandidates(deptShifts, staffList, deptId, targetId, day, selectedShift) {
  if (!isSwapShift(selectedShift)) return [];
  const out = [];
  for (const s of (staffList || [])) {
    if (!s || s.dept !== deptId || s.id === targetId) continue;
    if (deptShifts?.[s.id]?.[day] === selectedShift) out.push(s.id);
  }
  return out;
}
