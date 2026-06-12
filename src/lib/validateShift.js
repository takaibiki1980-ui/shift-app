/**
 * validateShift — シフト評価器（集計レイヤー）
 *
 * Hard制約の判定ロジックは rules/*.js に委譲。
 * このファイルは rules を呼び出して結果を集計するだけ。
 *
 * データアクセスは rules 内部で shiftAccessors 経由のみ行う。
 */

import { check as checkNightSetPattern  } from './timeAxisEngine/constraints/rules/nightSetPattern.js';
import { check as checkMinInterval      } from './timeAxisEngine/constraints/rules/minInterval.js';
import { check as checkRoleAllowedShifts} from './timeAxisEngine/constraints/rules/roleAllowedShifts.js';
import { check as checkRequestLock      } from './timeAxisEngine/constraints/rules/requestLock.js';

// ═════════════════════════════════════════════════════════════════════════════
/**
 * validateShift — シフト評価器エントリポイント
 *
 * @param {object} params
 *   shifts    { [staffId]: { [dayNum:number]: shiftKey } }
 *   dept      部署設定オブジェクト
 *   staffs    スタッフ配列
 *   requests  buildRequests(staffs, year, month) の返値
 *   prevTail  { [staffId]: { [dayNum:number]: shiftKey } } 前月末数日分
 *   year      対象年（number）
 *   month     対象月 0-indexed
 *
 * @returns {{
 *   hardViolations: object[],
 *   softViolations: object[],
 *   score:          number|null,
 *   breakdown:      object,
 * }}
 */
export function validateShift({ shifts, dept, staffs, requests = {}, prevTail = {}, year, month }) {
  const hardViolations = [];
  const days = new Date(year, month + 1, 0).getDate();

  const hasNight          = (dept.shiftTypes || []).includes('夜勤');
  const intervalThreshold = dept.intervalThreshold ?? null;

  for (const s of staffs) {
    const staffShifts = shifts[s.id] || {};

    // ── 共通コンテキスト（各 rule に渡す） ────────────────────────────────
    const baseCtx = {
      shifts,
      prevTail,
      dept,
      role:             s.role,
      requests,
      intervalThreshold,
      days,
    };

    // 適用するルールを部署設定に応じて選択
    const activeChecks = [
      checkRoleAllowedShifts,
      checkMinInterval,
      checkRequestLock,
      ...(hasNight ? [checkNightSetPattern] : []),
    ];

    for (let d = 1; d <= days; d++) {
      const shiftKey = staffShifts[d];

      for (const checkFn of activeChecks) {
        for (const r of checkFn(s.id, d, shiftKey, baseCtx)) {
          if (!r.ok) {
            hardViolations.push({
              rule:      r.rule,
              staffId:   s.id,
              staffName: s.name,
              date:      d,
              actual:    r.actual,
              expected:  r.expected,
              detail:    r.detail,
            });
          }
        }
      }
    }
  }

  return {
    hardViolations,
    softViolations: [],
    score:          null,
    breakdown:      {},
  };
}
