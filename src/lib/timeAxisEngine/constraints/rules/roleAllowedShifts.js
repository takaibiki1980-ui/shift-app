/**
 * roleAllowedShifts.js — 役職別許可シフト（Hard制約）
 *
 * validateShift.js から移植。挙動変更なし。
 * 明け・休系・未入力はチェック対象外（validateShift と同仕様）。
 */

import { getAllowedShiftTypes } from '../../../shiftAccessors.js';

const WORK_TYPES = new Set(['早番', '日勤', '遅番', '夜勤', '明け']);
const RULE = 'roleAllowedShifts';

/**
 * 指定スタッフ・指定日のシフトが役職の許可リストに含まれるか検証する。
 *
 * context:
 *   dept   部署設定オブジェクト（dept.roleShiftTypes を getAllowedShiftTypes 経由で参照）
 *   role   スタッフの役職文字列
 *
 * @returns {{ ok: boolean, rule: string, detail?: string, expected?: string[], actual?: string }}
 */
export function check(staffId, date, shiftKey, context) {
  const { dept, role } = context;

  if (!shiftKey || !WORK_TYPES.has(shiftKey) || shiftKey === '明け') {
    return { ok: true, rule: RULE };
  }

  const allowed = getAllowedShiftTypes(dept, role);
  if (!allowed.includes(shiftKey)) {
    return {
      ok:       false,
      rule:     RULE,
      detail:   '許可外シフトが配置されています',
      expected: allowed,
      actual:   shiftKey,
    };
  }

  return { ok: true, rule: RULE };
}
