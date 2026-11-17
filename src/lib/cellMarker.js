/**
 * シフト表セルの「丸マーカー」の種類を決める純関数（副作用なし・テスト対象）。
 *
 * 背景（#288 の穴）: 旧実装は丸を showStaffReq=(isKibo||isYukyu)&&!confirmed で出していたが、
 *   isKibo/isYukyu は「セルに表示値が無い(!dispType)」を条件に含むため、自動生成で
 *   希望休/有休がグリッドに書き込まれる（core.js が res[s.id][d]="希望休"/"有休"）と
 *   dispType が真になり、赤丸が消えていた。申請データ(kiboByMonth/yukyuByMonth)は生きている。
 *
 * 本関数は「申請日かどうか(isStaffReqDay)」で赤を判定し、生成の前後を問わず確定まで残す。
 *
 * @param {object} p
 * @param {boolean} p.isStaffReqDay スタッフ希望日（その日が kiboByMonth か yukyuByMonth に入っている）
 * @param {boolean} p.hasEdit       生成後の手動修正がある（shiftEditsByMonth）。EDIT_MODE 無効時は false を渡す
 * @param {boolean} p.hasFixed      リーダーの希望勤務がある（shiftRequestsByMonth）
 * @param {boolean} p.confirmed     確定中か
 * @returns {'staff'|'edit'|'fix'|null} 丸の種類。確定中は必ず null。優先順は staff > edit > fix。
 */
export function cellMarker({ isStaffReqDay, hasEdit, hasFixed, confirmed }) {
  if (confirmed) return null;          // 確定したら全部消す（装飾のみ・データは残す）
  if (isStaffReqDay) return 'staff';   // スタッフ希望（赤）を最優先＝うっかり上書きを防ぐ安全信号
  if (hasEdit) return 'edit';          // 生成後の手動修正（緑）
  if (hasFixed) return 'fix';          // リーダーの希望勤務（紫）
  return null;
}

/** マーカー種類 → 色。App.jsx の dotColor と一致させる（#288 の色・寸法は不変）。 */
export const CELL_MARKER_COLOR = {
  staff: '#d6455d',
  edit: '#2a9d6f',
  fix: '#7c3aed',
};

/** マーカー種類 → 色（null も許容）。未知・null は null。 */
export function cellMarkerColor(kind) {
  return CELL_MARKER_COLOR[kind] || null;
}
