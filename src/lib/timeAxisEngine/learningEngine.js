/**
 * learningEngine.js — 学習データに基づく候補シフトランキング（Step 7）
 *
 * 公開 API:
 *   rankCandidates(staff, date, candidates, learnedTrend, context)
 *     → { shiftKey, score }[]  score 降順（高いほど良い）
 *
 * score は加点方式。
 * scoreShiftsTime の (1-prob)×W ペナルティ式を prob×W 加点方式に変換済み。
 *
 * 配置処理は行わない（順位付けのみ）。
 */

import { getStaffTrend, getDowShiftRate, getPrevShift } from '../shiftAccessors.js';

// ── 重み定数 ─────────────────────────────────────────────────────────────────
const W_DOW        = 20;   // 曜日×シフト傾向
const W_TRANSITION = 500;  // 遷移傾向
const W_OVERALL    = 10;   // 全体シフト傾向

/**
 * 前日シフトを解決する。
 *   date > 1 : context.currentShifts[staffId][date-1]
 *   date === 1: getPrevShift(prevTail, staffId)
 */
function resolvePrevShift(staff, date, context) {
  if (date > 1) {
    return context.currentShifts?.[staff.id]?.[date - 1] ?? null;
  }
  return getPrevShift(context.prevTail, staff.id);
}

/**
 * 候補シフトに学習スコアを付けて降順に返す。
 *
 * スコア内訳:
 *   曜日傾向  : getDowShiftRate(trend, dateObj)[shiftKey] × W_DOW
 *   遷移傾向  : trend.transitionRate[prevShift]?.[shiftKey] × W_TRANSITION
 *   全体傾向  : trend[shiftKey] × W_OVERALL
 *
 * learnedTrend が null / スタッフ未収録の場合は全候補 score=0 で入力順を維持。
 *
 * @param {{ id: string, name: string }} staff
 * @param {number} date  1-indexed（1〜31）
 * @param {string[]} candidates  getCandidates() の返値
 * @param {object | null} learnedTrend  computeLearnedTrend() の返値
 * @param {{ year: number, month: number, currentShifts?: object, prevTail?: object }} context
 *   year: 西暦, month: 0-indexed（Date コンストラクタと同形式）
 * @returns {{ shiftKey: string, score: number }[]}
 */
export function rankCandidates(staff, date, candidates, learnedTrend, context) {
  const trend = getStaffTrend(learnedTrend, staff);

  // 学習データなし → 全候補 score=0、入力順維持
  if (!trend) {
    return candidates.map(shiftKey => ({ shiftKey, score: 0 }));
  }

  // getDowShiftRate に正しい曜日を渡すため Date に変換する
  // context.year/month が未指定の場合は DOW スコアを計算しない
  const dateObj = (context.year != null && context.month != null)
    ? new Date(context.year, context.month, date)
    : null;

  const dowRates  = dateObj ? getDowShiftRate(trend, dateObj) : null;
  const prevShift = resolvePrevShift(staff, date, context);

  const scored = candidates.map(shiftKey => {
    let score = 0;

    // 1. 曜日×シフト傾向
    const dowProb = dowRates?.[shiftKey];
    if (dowProb != null) score += dowProb * W_DOW;

    // 2. 遷移傾向
    if (prevShift != null) {
      const transProb = trend.transitionRate?.[prevShift]?.[shiftKey];
      if (transProb != null) score += transProb * W_TRANSITION;
    }

    // 3. 全体シフト傾向
    const overallProb = trend[shiftKey];
    if (overallProb != null) score += overallProb * W_OVERALL;

    return { shiftKey, score };
  });

  // score 降順（同点は Array.sort の安定性により入力順を維持）
  return scored.sort((a, b) => b.score - a.score);
}
