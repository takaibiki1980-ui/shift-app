/**
 * maxStaff.js — シフト種別ごとの上限人数（Soft制約）
 *
 * date に shiftKey を配置するとそのシフト種別の配置人数が
 * dept.maxStaff[shiftKey] を超過する場合に違反とする。
 *
 * dept.maxStaffRelaxable=false の場合は definitions.js で Hard に昇格済みのため、
 * このチェックは maxStaffRelaxable=true（デフォルト）の Soft 用途。
 *
 * penalty値はここに書かない。definitions.js が唯一の定義元。
 */

import { getMaxStaff } from '../../../shiftAccessors.js';

/**
 * date × shiftKey で既に配置済みのスタッフ数（staffId を除く）を返す。
 *
 * @param {string} excludeStaffId  配置候補のスタッフ（カウントから除外）
 * @param {number} date
 * @param {string} shiftKey
 * @param {object} shifts  { [staffId]: { [day]: shiftKey } }
 * @returns {number}
 */
function countOnDate(excludeStaffId, date, shiftKey, shifts) {
  return Object.entries(shifts || {})
    .filter(([sid, dayMap]) => sid !== excludeStaffId && dayMap[date] === shiftKey)
    .length;
}

/**
 * date に shiftKey を配置すると上限人数を超過するか検証する。
 *
 * context:
 *   dept    部署設定（dept.maxStaff[shiftKey] を getMaxStaff 経由で参照）
 *   shifts  { [staffId]: { [day]: shiftKey } }
 *
 * @returns {Violation[]}
 */
export function check(staffId, date, shiftKey, context) {
  const { dept, shifts } = context;

  const maxAllowed = getMaxStaff(dept, shiftKey);
  if (!Number.isFinite(maxAllowed)) return []; // 上限なし → チェック不要

  const existing = countOnDate(staffId, date, shiftKey, shifts);

  if (existing >= maxAllowed) {
    const wouldBe = existing + 1;
    const excess  = wouldBe - maxAllowed;
    return [{
      ok:       false,
      rule:     'maxStaff',
      dedupKey: `maxStaff:${date}:${shiftKey}`,
      detail:   `${shiftKey}の配置上限${maxAllowed}人に対して${wouldBe}人になる`,
      excess,
    }];
  }

  return [];
}
