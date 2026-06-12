/**
 * fairness.js — 公平性（シフト種別回数の偏り）（Soft制約）
 *
 * 当該スタッフの shiftKey 配置回数がチーム平均を IMBALANCE_THRESHOLD 以上
 * 上回る場合に違反とする。
 *
 * penalty値はここに書かない。definitions.js が唯一の定義元。
 */

// チーム平均を何件超えたら Violation（算法パラメータ、penalty値ではない）
const IMBALANCE_THRESHOLD = 2;

const REST_TYPES = new Set(['休み', '希望休', '有休', '公休']);

function isWorkShift(sk) {
  return !!sk && !REST_TYPES.has(sk);
}

/**
 * 全スタッフの shiftKey 配置回数を集計し、当該スタッフが平均を大幅に上回るか検証する。
 *
 * context:
 *   staffs  スタッフ配列（全員の id を使用）
 *   shifts  { [staffId]: { [day]: shiftKey } }
 *
 * @returns {Violation[]}
 */
export function check(staffId, date, shiftKey, context) {
  const { staffs, shifts } = context;

  if (!isWorkShift(shiftKey)) return [];

  const allStaffs = staffs || [];
  if (allStaffs.length === 0) return [];

  // 各スタッフの shiftKey 回数（date を除く既割当）
  const counts = allStaffs.map(s => {
    const sShifts = shifts?.[s.id] || {};
    return Object.entries(sShifts)
      .filter(([d]) => Number(d) !== date)
      .filter(([, sk]) => sk === shiftKey)
      .length;
  });

  const teamTotal  = counts.reduce((a, b) => a + b, 0);
  const teamAvg    = teamTotal / allStaffs.length;

  const myIdx      = allStaffs.findIndex(s => s.id === staffId);
  const myCount    = myIdx >= 0 ? counts[myIdx] : 0;
  const myCountAfter = myCount + 1; // date への配置後

  const imbalance  = Math.round((myCountAfter - teamAvg) * 10) / 10;

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
