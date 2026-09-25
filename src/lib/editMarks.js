/**
 * editmarks companion（色情報の記録）の純粋ロジック。生成・core.js には非関与。
 *
 * companion キー `editmarks_Y_M_dept` の値の形:
 *   { [staffId]: { sr: {day:shift}|null, se: {day:shift}|null } }
 *     sr = 希望勤務(青・shiftRequestsByMonth[mk]) / se = 修正マーカー(緑・shiftEditsByMonth[mk])
 *
 * shifts_ を書く全経路(saveNow・emergencySave・履歴復元)で同じ値を同一 updated_at で
 * ペア書きするために共用する。これによりペアの欠落(復元時 marksVal=null)を防ぐ。
 */

/**
 * staffList から当該部署×月の companion 値を構築する。
 * @param {Array}  staffList スタッフ配列
 * @param {string} deptId    対象部署
 * @param {string} mk        monthKey(year, month) 例 "2026-7"
 * @returns {Object} { [staffId]: { sr, se } }（sr/se いずれかに中身がある staff のみ）
 */
export function buildMarksVal(staffList, deptId, mk) {
  const marksVal = {};
  for (const s of (staffList || [])) {
    if (!s || s.dept !== deptId) continue;
    const sr = s.shiftRequestsByMonth?.[mk];
    const se = s.shiftEditsByMonth?.[mk];
    if ((sr && Object.keys(sr).length) || (se && Object.keys(se).length)) {
      marksVal[s.id] = { sr: sr || null, se: se || null };
    }
  }
  return marksVal;
}

/**
 * 複数部署の editmarks companion 行から staffId -> se(緑) を集約する。
 * 月ロード時、staffList の shiftEditsByMonth[mk] が空でも companion に残る緑を
 * 表示用に補う(ハイドレーション)ために使う（赤の mergeStaffKibo と同じ思想）。
 * @param {Array} rows [{ data_value: {staffId:{sr,se}} }, ...]
 * @returns {Object} { [staffId]: se }（se に中身がある staff のみ）
 */
export function collectSeById(rows) {
  const seById = {};
  for (const row of (rows || [])) {
    const val = row?.data_value || {};
    for (const [sid, marks] of Object.entries(val)) {
      const se = marks?.se;
      if (se && Object.keys(se).length) seById[sid] = se;
    }
  }
  return seById;
}
