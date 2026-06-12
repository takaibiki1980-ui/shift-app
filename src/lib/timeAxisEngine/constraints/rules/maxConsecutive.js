/**
 * maxConsecutive.js — 最大連続勤務日数（Soft制約）
 *
 * date に勤務シフトを配置すると連続勤務が dept.maxConsecutive を超える場合に違反とする。
 * prevTail を参照して月跨ぎの連続判定を行う。
 *
 * 「勤務」の定義: 休み / 希望休 / 有休 / 公休 以外のシフト（明けを含む）。
 * 明けは夜勤翌日の在院状態であり連続勤務日数として計上される。
 *
 * penalty値はここに書かない。definitions.js が唯一の定義元。
 */

const REST_TYPES = new Set(['休み', '希望休', '有休', '公休']);

function isWorkShift(sk) {
  return !!sk && !REST_TYPES.has(sk);
}

/**
 * staffId の連続勤務日数を date-1 まで逆算する。
 * 月内で遡りきった場合は prevTail を連続して参照する。
 *
 * @param {string} staffId
 * @param {number} date    1-indexed
 * @param {object} shifts  { [staffId]: { [day]: shiftKey } }
 * @param {object} prevTail { [staffId]: { [day]: shiftKey } }
 * @returns {number}  date-1 まで遡った連続勤務日数
 */
function countConsecutiveBack(staffId, date, shifts, prevTail) {
  const staffShifts = shifts?.[staffId] || {};
  let count = 0;

  // 今月内を遡る
  let d = date - 1;
  while (d >= 1) {
    if (!isWorkShift(staffShifts[d])) return count;
    count++;
    d--;
  }

  // 月初（d=0）を超えたら前月末（prevTail）を参照
  const tail = prevTail?.[staffId];
  if (!tail) return count;

  // prevTail の日番号を降順で走査（連続性を保証するためギャップで打ち切る）
  const tailDays = Object.keys(tail).map(Number).sort((a, b) => b - a);
  let prevDay = null;
  for (const td of tailDays) {
    if (prevDay !== null && prevDay - td > 1) break; // ギャップあり → 連続終了
    if (!isWorkShift(tail[td])) break;
    count++;
    prevDay = td;
  }

  return count;
}

/**
 * date に shiftKey を配置すると最大連続勤務日数を超過するか検証する。
 *
 * context:
 *   dept    部署設定（dept.maxConsecutive を使用）
 *   shifts  { [staffId]: { [day]: shiftKey } }
 *   prevTail { [staffId]: { [day]: shiftKey } }
 *
 * @returns {Violation[]}
 */
export function check(staffId, date, shiftKey, context) {
  const { dept, shifts, prevTail } = context;

  const limit = dept?.maxConsecutive;
  if (limit == null) return []; // 上限未設定 → チェック不要

  if (!isWorkShift(shiftKey)) return []; // 休み配置は連続を延ばさない

  const consecutive = countConsecutiveBack(staffId, date, shifts, prevTail);
  const wouldBe = consecutive + 1;

  if (wouldBe > limit) {
    const excess = wouldBe - limit;
    return [{
      ok:       false,
      rule:     'maxConsecutive',
      dedupKey: `maxConsecutive:${staffId}:${date}`,
      detail:   `${wouldBe}日連続勤務になる（上限${limit}日）`,
      excess,
    }];
  }

  return [];
}
