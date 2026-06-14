/**
 * fairness.js — 公平性（シフト種別回数の偏り）（Soft制約）
 *
 * 当該スタッフの shiftKey 配置回数が、そのシフトを担当可能な
 * スタッフのみを母集団としたチーム平均を fairnessTolerance 以上
 * 上回る場合に違反とする。
 *
 * 変更点（Step11a 修正）:
 *   - 母集団を「shiftKey を配置可能なスタッフ」に限定
 *     （role 制限を考慮。早番不可スタッフを早番の平均計算に含めない）
 *   - '明け' を fairness チェック対象外に追加
 *     （夜勤翌日の強制配置を公平性違反として誤計上しない）
 *   - IMBALANCE_THRESHOLD を definitions.js の fairnessTolerance から読む
 *
 * penalty値はここに書かない。definitions.js が唯一の定義元。
 */

import { getAllowedShiftTypes } from '../../../shiftAccessors.js';
import { constraintDefinitions } from '../definitions.js';

// fairnessTolerance は definitions.js の fairness 制約定義から読む（ベタ書き禁止）
const _fairnessDef      = constraintDefinitions.find(c => c.id === 'fairness');
const IMBALANCE_THRESHOLD = _fairnessDef?.fairnessTolerance ?? 2;

// fairness チェック対象外シフト（休み系 + 明け）
// 明けは夜勤翌日の強制配置であり、自由配置の公平性評価に含めない
const SKIP_TYPES = new Set(['休み', '希望休', '有休', '公休', '明け']);

function isFairnessTarget(sk) {
  return !!sk && !SKIP_TYPES.has(sk);
}

/**
 * shiftKey を配置可能なスタッフのみを母集団としてチーム平均を算出し、
 * 当該スタッフが平均を大幅に上回るか検証する。
 *
 * context:
 *   dept    部署設定（roleShiftTypes で役職制限を確認）
 *   staffs  スタッフ配列（全員の id / role を使用）
 *   shifts  { [staffId]: { [day]: shiftKey } }
 *
 * @returns {Violation[]}
 */
export function check(staffId, date, shiftKey, context) {
  const { dept, staffs, shifts } = context;

  if (!isFairnessTarget(shiftKey)) return [];

  const allStaffs = staffs || [];
  if (allStaffs.length === 0) return [];

  // 母集団: shiftKey を配置可能なスタッフのみ
  // dept が null/undefined の場合は役職制限なし扱いで全員を母集団にする
  const eligibleStaffs = allStaffs.filter(s =>
    !dept || getAllowedShiftTypes(dept, s.role).includes(shiftKey)
  );
  if (eligibleStaffs.length === 0) return [];

  // 各スタッフの shiftKey 回数（date を除く既割当）
  const counts = eligibleStaffs.map(s => {
    const sShifts = shifts?.[s.id] || {};
    return Object.entries(sShifts)
      .filter(([d]) => Number(d) !== date)
      .filter(([, sk]) => sk === shiftKey)
      .length;
  });

  const teamTotal    = counts.reduce((a, b) => a + b, 0);
  const teamAvg      = teamTotal / eligibleStaffs.length;

  const myIdx        = eligibleStaffs.findIndex(s => s.id === staffId);
  const myCount      = myIdx >= 0 ? counts[myIdx] : 0;
  const myCountAfter = myCount + 1; // date への配置後

  const imbalance    = Math.round((myCountAfter - teamAvg) * 10) / 10;

  if (myCountAfter - teamAvg >= IMBALANCE_THRESHOLD) {
    return [{
      ok:       false,
      rule:     'fairness',
      dedupKey: `fairness:${staffId}:${shiftKey}`,
      detail:   `${shiftKey}の配置が不均衡（${myCountAfter}回、チーム平均${teamAvg.toFixed(1)}回）`,
      imbalance,
    }];
  }

  return [];
}
