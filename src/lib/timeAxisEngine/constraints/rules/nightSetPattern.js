/**
 * nightSetPattern.js — 夜勤→明け→休みパターン強制（Hard制約）
 *
 * validateShift.js から移植。挙動変更なし。
 * dept.shiftTypes を直接参照するが、それは enabledWhen で呼び出し前に
 * フィルタ済みの前提（hasNight gate は呼び出し元が担う）。
 */

import { getPrevShift } from '../../../shiftAccessors.js';

const REST_TYPES = new Set(['休み', '希望休', '有休']);

const RULE = 'nightSetPattern';

/**
 * 指定スタッフ・指定日のシフトが夜勤セットパターンを満たすか検証する。
 *
 * context:
 *   shifts    { [staffId]: { [day]: shiftKey } }  当月全スタッフ
 *   prevTail  { [staffId]: { [day]: shiftKey } }  前月末5日分
 *   days      当月日数（number）
 *
 * 検証内容（validateShift と完全一致）:
 *   前月末夜勤 → 1日=明け
 *   前月末明け → 1日=休系
 *   A. 夜勤[d] → 翌日=明け    (d < days)
 *   B. 明け[d] → 翌日=休系    (d < days)
 *   C. 明け[d] → 前日=夜勤    (前日は prevTail or 前日シフト)
 *
 * @returns {{ ok: boolean, rule: string, detail?: string, expected?: any, actual?: any }[]}
 *   1スタッフ・1日につき複数違反が起きうるため配列を返す。
 *   違反なし = []
 */
export function check(staffId, date, shiftKey, context) {
  const { shifts, prevTail, days } = context;
  const staffShifts = shifts[staffId] || {};
  const violations = [];

  // ─── 前月末処理（date=1 のみ実行） ────────────────────────────────────────
  if (date === 1) {
    const prevLast = getPrevShift(prevTail, staffId);

    if (prevLast === '夜勤' && shiftKey && shiftKey !== '明け') {
      violations.push({
        ok:       false,
        rule:     RULE,
        detail:   '前月末夜勤の翌日(1日)が明けではありません',
        expected: ['明け'],
        actual:   shiftKey,
      });
    }

    if (prevLast === '明け' && shiftKey && !REST_TYPES.has(shiftKey)) {
      violations.push({
        ok:       false,
        rule:     RULE,
        detail:   '前月末明けの翌日(1日)が休みではありません',
        expected: ['休み', '希望休', '有休'],
        actual:   shiftKey,
      });
    }
  }

  // ─── A. 夜勤[d] → 翌日は明け ──────────────────────────────────────────────
  if (shiftKey === '夜勤' && date < days) {
    const next = staffShifts[date + 1];
    if (next && next !== '明け') {
      violations.push({
        ok:       false,
        rule:     RULE,
        detail:   `夜勤(${date}日)の翌日が明けではありません`,
        expected: ['明け'],
        actual:   next,
      });
    }
  }

  // ─── B. 明け[d] → 翌日は休系 ──────────────────────────────────────────────
  if (shiftKey === '明け' && date < days) {
    const next = staffShifts[date + 1];
    if (next && !REST_TYPES.has(next)) {
      violations.push({
        ok:       false,
        rule:     RULE,
        detail:   `明け(${date}日)の翌日が休みではありません`,
        expected: ['休み', '希望休', '有休'],
        actual:   next,
      });
    }
  }

  // ─── C. 明け[d] → 前日は夜勤 ──────────────────────────────────────────────
  if (shiftKey === '明け') {
    const prev = date === 1 ? getPrevShift(prevTail, staffId) : staffShifts[date - 1];
    if (prev && prev !== '夜勤') {
      violations.push({
        ok:       false,
        rule:     RULE,
        detail:   `明け(${date}日)の前日が夜勤ではありません（前日: ${prev}）`,
        expected: ['明け'],
        actual:   shiftKey,
      });
    }
  }

  // ─── D. 前日が夜勤 → 当日は明けのはず（A の逆方向：候補フィルタ用）──────────
  // A は「夜勤[d]を見て翌日をチェック」するが、
  // getCandidates では「候補[d]を見て前日が夜勤かをチェック」が必要。
  // date>1 に限定することで、d=1 の月跨ぎケースと二重報告しない。
  if (shiftKey !== '明け' && date > 1) {
    const prev = staffShifts[date - 1];
    if (prev === '夜勤') {
      violations.push({
        ok:       false,
        rule:     RULE,
        detail:   `前日(${date - 1}日)が夜勤のため${date}日は明けが必要です`,
        expected: ['明け'],
        actual:   shiftKey,
      });
    }
  }

  // 違反なし → ok オブジェクトを1件返す
  if (violations.length === 0) {
    return [{ ok: true, rule: RULE }];
  }
  return violations;
}
