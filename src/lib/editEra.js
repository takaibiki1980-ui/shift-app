/**
 * 修正/希望モードの判定（editEra）の純粋ロジック。表示のみ・生成/core.jsに非関与。
 *
 * - generatedFlag === true  → 修正モード（自動生成ボタンが押された明示フラグ）。
 * - generatedFlag === false → 希望モード（オールクリアで明示的にクリア。必ず尊重＝フォールバックしない）。
 * - generatedFlag === undefined（記録なし＝明示フラグ導入 PR #198 より前の旧月）→ フォールバック：
 *     確定済み(confirmed) または 保存済み生成シフト(hasSavedShifts) があれば修正モードとみなす。
 *
 * 新しい月は生成/クリア時に必ず true/false が記録されるため、フォールバックには依存しない。
 *
 * @param {boolean|undefined} generatedFlag  generatedMonths[key]
 * @param {boolean} confirmed                その月が確定済みか
 * @param {boolean} hasSavedShifts           その月に保存済みシフトが存在するか
 * @returns {boolean} true=修正モード / false=希望モード
 */
export function resolveEditEra(generatedFlag, confirmed, hasSavedShifts) {
  if (generatedFlag === true) return true;
  if (generatedFlag === false) return false;
  return confirmed === true || hasSavedShifts === true;
}
