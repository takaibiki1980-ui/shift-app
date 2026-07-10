/**
 * 修正率（作成後に人がどれだけ直したか）の計測ロジック。
 *
 * baseline = 自動生成した直後のスナップショット（lastAutoGenRef）
 * current  = 確定時点のシフト
 *
 * 「生成対象セル」＝ baseline が実質配置したセル（値があり、かつ FIXED でない）。
 *   - FIXED（希望休・有休・夜勤・明け）は人の希望や固定枠であり生成物ではないため除外
 *   - 空白（未生成）も除外
 * 修正率 = 生成対象セルのうち current で値が変わったセル数 ÷ 生成対象セル数（%）
 *
 * baseline が無い月（貼り付け・手入力＝生成物でない）は null を返し「—」表示にする。
 */
const FIXED_CELLS = new Set(['希望休', '有休', '夜勤', '明け']);

/**
 * @param {Object|null} baseline 生成直後スナップショット { staffId: { day: shift } }
 * @param {Object} current 確定時シフト { staffId: { day: shift } }
 * @returns {number|null} 0〜100 の整数（%）、計測不能なら null
 */
export function computeEditRate(baseline, current) {
  if (!baseline || Object.keys(baseline).length === 0) return null;
  let eligible = 0;
  let edited = 0;
  for (const staffId of Object.keys(baseline)) {
    const baseDays = baseline[staffId] || {};
    const currDays = (current && current[staffId]) || {};
    for (const dayStr of Object.keys(baseDays)) {
      const bv = baseDays[dayStr];
      if (!bv || FIXED_CELLS.has(bv)) continue; // 空白・FIXEDは生成対象外
      eligible++;
      if (currDays[dayStr] !== bv) edited++;
    }
  }
  if (eligible === 0) return null;
  return Math.round((edited / eligible) * 100);
}
