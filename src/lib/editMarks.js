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

/**
 * byKey(全 shift_data の {data_key:data_value}) から当該月の editmarks 行だけを
 * 取り出し collectSeById へ渡すためのユーティリティ。
 * @param {Object} byKey  { data_key: data_value }
 * @param {number} year
 * @param {number} month  0始まり
 * @returns {Object} { [staffId]: se }
 */
export function collectSeByIdFromByKey(byKey, year, month) {
  const prefix = `editmarks_${year}_${month + 1}_`;
  const rows = [];
  for (const [k, v] of Object.entries(byKey || {})) {
    if (k.startsWith(prefix)) rows.push({ data_value: v });
  }
  return collectSeById(rows);
}

/**
 * staffList の shiftEditsByMonth[mk] が空の staff に、companion 由来の se を補う。
 * 既に中身がある staff は上書きしない（真実の記録を壊さない）。他月・他フィールドは不変。
 * staffList を設定する全経路(初期ロード・月ロード・reloadFromRemote)で共用し、
 * どの経路でも緑が消えないことを保証する。
 * @param {Array}  staffList
 * @param {string} mk
 * @param {Object} seById  { [staffId]: se }
 * @returns {Array} 変化があれば新配列・無ければ同一参照
 */
export function hydrateStaffListSe(staffList, mk, seById) {
  if (!staffList || !seById || Object.keys(seById).length === 0) return staffList;
  let changed = false;
  const next = staffList.map((s) => {
    if (!s) return s;
    const cur = s.shiftEditsByMonth?.[mk];
    if (cur && Object.keys(cur).length) return s; // 既に緑あり → 上書きしない
    const se = seById[s.id];
    if (!se) return s;
    changed = true;
    return { ...s, shiftEditsByMonth: { ...(s.shiftEditsByMonth || {}), [mk]: se } };
  });
  return changed ? next : staffList;
}

/**
 * 履歴復元時、対の色情報(marksVal)が見つかった場合のみ当該部署×月の色を復元する。
 * marksVal が無い(対が見つからない)場合は何もしない＝現在の色をそのまま保持（破壊しない）。
 * @param {Array}  staffList
 * @param {string} deptId
 * @param {string} mk
 * @param {Object|null} marksVal  { [staffId]: { sr, se } } | null
 * @returns {Array} 更新後の staffList（marksVal が無ければ同一参照）
 */
export function applyRestoredMarks(staffList, deptId, mk, marksVal) {
  if (!marksVal) return staffList;
  return (staffList || []).map((s) => {
    if (!s || s.dept !== deptId) return s;
    const m = marksVal[s.id]; // {sr, se} | undefined
    const sr = { ...(s.shiftRequestsByMonth || {}) };
    const se = { ...(s.shiftEditsByMonth || {}) };
    if (m?.sr) sr[mk] = m.sr; else delete sr[mk];
    if (m?.se) se[mk] = m.se; else delete se[mk];
    return { ...s, shiftRequestsByMonth: sr, shiftEditsByMonth: se };
  });
}

/**
 * セルの色分類（表示ロジックのモデル）。App.jsx の ShiftTable 描画（青/緑/赤の
 * 優先順位・confirmed ゲート）を忠実に写したもの。回帰テストの基準に使う。
 * 優先順位: 赤(スタッフ希望) > 緑(修正) > 青(希望勤務)。確定中は全て装飾なし。
 * @returns {'red'|'green'|'blue'|null}
 */
export function cellColor({ hasSe, hasSr, isKibo, isYukyu, confirmed = false, editModeEnabled = true }) {
  if (confirmed) return null;
  if (isKibo || isYukyu) return 'red';
  if (editModeEnabled && hasSe) return 'green';
  if (hasSr) return 'blue';
  return null;
}

/** cellColor を staff オブジェクト＋月キー＋日から判定するヘルパ（テスト・可読性用）。 */
export function cellColorOf(staff, mk, day, opts = {}) {
  return cellColor({
    hasSe: !!staff?.shiftEditsByMonth?.[mk]?.[day],
    hasSr: !!staff?.shiftRequestsByMonth?.[mk]?.[day],
    isKibo: !!opts.kibodays?.includes(day),
    isYukyu: !!opts.yukyudays?.includes(day),
    confirmed: !!opts.confirmed,
    editModeEnabled: opts.editModeEnabled !== false,
  });
}
