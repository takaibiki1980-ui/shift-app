/**
 * roleAllowedShifts.js — 役職別許可シフト（Hard制約）
 *
 * validateShift.js から移植。挙動変更なし。
 * 明け・休系・未入力はチェック対象外（validateShift と同仕様）。
 */

import { getAllowedShiftTypes } from '../../../shiftAccessors.js';

const RULE = 'roleAllowedShifts';

// 休み系・明け は役職チェック対象外（全役職に共通して配置可）
// 旧実装は WORK_TYPES（固定値）で判定していたが、カスタムシフト（A/B/C 等）が
// WORK_TYPES に含まれないためチェックをスキップしてしまうバグがあった。
// 修正: REST_TYPES（休み系）に含まれないシフトはすべて役職チェック対象とする。
const REST_TYPES = new Set(['休み', '希望休', '有休', '公休', '明け']);

/**
 * 指定スタッフ・指定日のシフトが役職の許可リストに含まれるか検証する。
 *
 * context:
 *   dept   部署設定オブジェクト（dept.roleShiftTypes を getAllowedShiftTypes 経由で参照）
 *   role   スタッフの役職文字列
 *
 * @returns {Array<{ ok: boolean, rule: string, detail?: string, expected?: string[], actual?: string }>}
 */
export function check(staffId, date, shiftKey, context) {
  const { dept, role } = context;

  // 空・休み系・明け はチェック不要（全役職で配置可）
  if (!shiftKey || REST_TYPES.has(shiftKey)) return [];

  const allowed = getAllowedShiftTypes(dept, role);
  if (!allowed.includes(shiftKey)) {
    return [{
      ok:       false,
      rule:     RULE,
      detail:   '許可外シフトが配置されています',
      expected: allowed,
      actual:   shiftKey,
    }];
  }

  return [];
}
