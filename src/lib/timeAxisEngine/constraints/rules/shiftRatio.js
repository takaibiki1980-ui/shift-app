/**
 * shiftRatio.js — スタッフ別シフト比率の維持（Soft制約）
 *
 * 目標比率（s.shiftRatio / s.shiftRatioByMonth[mk]）に対して
 * 実績比率が EXCESS_THRESHOLD 以上超過する配置を違反とする。
 *
 * 比率カウント対象: dept.shiftTypes に含まれるシフト種別（明けを除く）
 * これは App.jsx:scoreShifts の「WORK.has(sh) && sh !== '明け'」条件に準拠。
 *
 * penalty値はここに書かない。definitions.js が唯一の定義元。
 */

import { getShiftRatio } from '../../../shiftAccessors.js';

// 期待カウントをこの値以上超えたら Violation（算法パラメータ、penalty値ではない）
const EXCESS_THRESHOLD = 1.0;

/**
 * 明けを除く部署シフト種別 = 比率計算の対象。
 * dept.shiftTypes を参照して動的に判定する（customShiftDefs 対応）。
 */
function isRatioTarget(shiftKey, dept) {
  if (!shiftKey || shiftKey === '明け') return false;
  return (dept?.shiftTypes || []).includes(shiftKey);
}

/**
 * shiftKey を date に配置したとき、スタッフの実績比率が目標を超過するか検証する。
 *
 * context:
 *   dept    部署設定（shiftTypes を使用）
 *   shifts  { [staffId]: { [day]: shiftKey } }
 *   staffs  スタッフ配列（shiftRatio / shiftRatioByMonth を参照）
 *   year    西暦（monthKey 構築用）
 *   month   0-indexed 月（monthKey 構築用）
 *
 * @returns {Violation[]}
 */
export function check(staffId, date, shiftKey, context) {
  const { dept, shifts, staffs, year, month } = context;

  if (!isRatioTarget(shiftKey, dept)) return [];

  const staff = (staffs || []).find(s => s.id === staffId);
  if (!staff) return [];

  const mk = (year != null && month != null) ? `${year}-${month + 1}` : null;
  const ratio = getShiftRatio(staff, mk);
  if (!ratio) return [];

  const targetFrac = ratio[shiftKey];
  if (targetFrac == null || targetFrac <= 0) return [];

  // ratioTotal: 目標値の合計（1.0 でない場合に正規化）
  const ratioTotal = Object.values(ratio).reduce((s, v) => s + (v || 0), 0);
  if (ratioTotal <= 0) return [];
  const normalizedTarget = targetFrac / ratioTotal;

  // 既割当の比率カウント対象シフト（date を除く）
  const staffShifts = shifts?.[staffId] || {};
  const assigned = Object.entries(staffShifts)
    .filter(([d]) => Number(d) !== date)
    .map(([, sk]) => sk)
    .filter(sk => isRatioTarget(sk, dept));

  const totalWork = assigned.length;
  const thisTypeCount = assigned.filter(sk => sk === shiftKey).length;

  // date に shiftKey を追加した仮想状態
  const newTotal = totalWork + 1;
  const newCount = thisTypeCount + 1;

  // 期待カウントと実際の差（excess > EXCESS_THRESHOLD で違反）
  const expectedCount = newTotal * normalizedTarget;
  const excess = Math.round((newCount - expectedCount) * 100) / 100;

  if (excess >= EXCESS_THRESHOLD) {
    const actualPct  = Math.round((newCount / newTotal) * 100);
    const targetPct  = Math.round(normalizedTarget * 100);
    return [{
      ok:       false,
      rule:     'shiftRatio',
      dedupKey: `shiftRatio:${staffId}:${shiftKey}:${mk ?? 'all'}`,
      detail:   `${shiftKey}の実績比率が目標を超過（実績${actualPct}% > 目標${targetPct}%）`,
      imbalance: excess,
    }];
  }

  return [];
}
