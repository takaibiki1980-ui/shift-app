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

    for (let d = 1; d <= days; d++) {
      const shiftKey = staffShifts[d];

      // ── 1. roleAllowedShifts ─────────────────────────────────────────────
      const raResult = checkRoleAllowedShifts(s.id, d, shiftKey, baseCtx);
      if (!raResult.ok) {
        hardViolations.push({
          rule:      raResult.rule,
          staffId:   s.id,
          staffName: s.name,
          date:      d,
          actual:    raResult.actual,
          expected:  raResult.expected,
          detail:    raResult.detail,
        });
      }

      // ── 2. minInterval ───────────────────────────────────────────────────
      const miResult = checkMinInterval(s.id, d, shiftKey, baseCtx);
      if (!miResult.ok) {
        hardViolations.push({
          rule:      miResult.rule,
          staffId:   s.id,
          staffName: s.name,
          date:      d,
          actual:    miResult.actual,
          expected:  miResult.expected,
          detail:    miResult.detail,
        });
      }

      // ── 3. requestLock ───────────────────────────────────────────────────
      const rlResult = checkRequestLock(s.id, d, shiftKey, baseCtx);
      if (!rlResult.ok) {
        hardViolations.push({
          rule:      rlResult.rule,
          staffId:   s.id,
          staffName: s.name,
          date:      d,
          actual:    rlResult.actual,
          expected:  rlResult.expected,
          detail:    rlResult.detail,
        });
      }

      // ── 4. nightSetPattern（hasNight 部署のみ） ──────────────────────────
      if (hasNight) {
        const nspResults = checkNightSetPattern(s.id, d, shiftKey, baseCtx);
        for (const r of nspResults) {
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
