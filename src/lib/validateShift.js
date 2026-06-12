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
import { check as checkShiftRatio       } from './timeAxisEngine/constraints/rules/shiftRatio.js';
import { check as checkFairness         } from './timeAxisEngine/constraints/rules/fairness.js';
import { check as checkMaxConsecutive   } from './timeAxisEngine/constraints/rules/maxConsecutive.js';
import { check as checkMaxStaff         } from './timeAxisEngine/constraints/rules/maxStaff.js';
import { resolveConstraints } from './timeAxisEngine/constraints/definitions.js';

// Soft制約ルールレジストリ（constraintEngine.js と同一パターン）
const SOFT_RULE_REGISTRY = {
  shiftRatio:    checkShiftRatio,
  fairness:      checkFairness,
  maxConsecutive: checkMaxConsecutive,
  maxStaff:      checkMaxStaff,
};

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
 *   score:          number,
 *   breakdown:      object,
 * }}
 */
export function validateShift({ shifts, dept, staffs, requests = {}, prevTail = {}, year, month }) {
  const hardViolations = [];
  const days = new Date(year, month + 1, 0).getDate();

  const hasNight          = (dept.shiftTypes || []).includes('夜勤');
  const intervalThreshold = dept.intervalThreshold ?? null;

  // ── Hard制約 ────────────────────────────────────────────────────────────
  for (const s of staffs) {
    const staffShifts = shifts[s.id] || {};

    const baseCtx = {
      shifts,
      prevTail,
      dept,
      role:             s.role,
      requests,
      intervalThreshold,
      days,
    };

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

  // ── Soft制約 ────────────────────────────────────────────────────────────
  // resolveConstraints で有効な Soft 制約を取得（制約リストのベタ書き禁止）
  const softConstraints = resolveConstraints(dept).filter(c => c.hardness === 'soft');

  // dedupKey → { violation, penalty } の Map（同一 key は最初の1件のみ保持）
  // maxConsecutive は日付単位の dedupKey のため畳まれず累積する（仕様）
  const softMap = new Map();

  const softCtx = { shifts, prevTail, dept, staffs, year, month };

  for (const s of staffs) {
    const staffShifts = shifts[s.id] || {};
    const staffCtx = { ...softCtx, role: s.role };

    for (let d = 1; d <= days; d++) {
      const shiftKey = staffShifts[d];
      if (!shiftKey) continue;

      for (const constraint of softConstraints) {
        const checkFn = SOFT_RULE_REGISTRY[constraint.id];
        if (!checkFn) continue;

        for (const r of checkFn(s.id, d, shiftKey, staffCtx)) {
          if (!r.ok && !softMap.has(r.dedupKey)) {
            softMap.set(r.dedupKey, { violation: r, penalty: constraint.penalty });
          }
        }
      }
    }
  }

  const softViolations = [...softMap.values()].map(({ violation }) => violation);

  // score = Σ( penalty × severity )
  // hardViolations が存在しても score は計算して返す（失格判定は呼び出し側の責務）
  let score = 0;
  const breakdown = {};
  for (const { violation, penalty } of softMap.values()) {
    const severity = violation.excess ?? violation.imbalance ?? 1;
    const contribution = penalty * severity;
    score += contribution;
    breakdown[violation.rule] = (breakdown[violation.rule] || 0) + contribution;
  }

  return { hardViolations, softViolations, score, breakdown };
}
