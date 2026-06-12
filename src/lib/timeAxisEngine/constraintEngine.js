/**
 * constraintEngine.js — 制約エンジン（Hard/Soft判定・候補絞り込み）
 *
 * 設計書 v1.3 §5 に準拠。
 *
 * 外部 API:
 *   getCandidates(staffId, date, context)
 *     → Hard制約を全て通過するシフトキーの配列
 *
 *   canPlace(staffId, date, shiftKey, context, relaxedIds?)
 *     → 全適用制約を通過すれば true
 *
 * ルール実装は rules/*.js に完全委譲。
 * このファイルは resolveConstraints + RULE_REGISTRY を通じた集約のみ行う。
 *
 * context 必須フィールド（呼び出し元が組み立てる）:
 *   dept              部署設定オブジェクト
 *   shifts            { [staffId]: { [day]: shiftKey } }
 *   prevTail          { [staffId]: { [day]: shiftKey } }
 *   role              対象スタッフの役職
 *   requests          buildRequests() の返値
 *   intervalThreshold dept.intervalThreshold ?? null
 *   days              当月日数
 */

import { resolveConstraints } from './constraints/definitions.js';
import { check as checkNightSetPattern  } from './constraints/rules/nightSetPattern.js';
import { check as checkMinInterval      } from './constraints/rules/minInterval.js';
import { check as checkRoleAllowedShifts} from './constraints/rules/roleAllowedShifts.js';
import { check as checkRequestLock      } from './constraints/rules/requestLock.js';

// ── ルールレジストリ ──────────────────────────────────────────────────────────
// 制約ID → check関数 のマッピング。
// Step 6 で Soft制約の実装が追加されたらここに登録する。
// 登録のないIDは check が存在しないため「常に通過」扱い（空配列返し相当）。
const RULE_REGISTRY = {
  nightSetPattern:   checkNightSetPattern,
  minInterval:       checkMinInterval,
  roleAllowedShifts: checkRoleAllowedShifts,
  requestLock:       checkRequestLock,
};

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 指定した制約リストに対して shiftKey を検証する。
 * 1件でも違反があれば { passed: false, violations } を返す。
 *
 * @param {string} staffId
 * @param {number} date
 * @param {string} shiftKey
 * @param {object} context
 * @param {object[]} constraints  resolveConstraints() の部分リスト
 * @returns {{ passed: boolean, violations: object[] }}
 */
function runChecks(staffId, date, shiftKey, context, constraints) {
  const violations = [];
  for (const c of constraints) {
    const checkFn = RULE_REGISTRY[c.id];
    if (!checkFn) continue; // 実装未登録（将来の Soft ルール待ち）→ 通過
    const results = checkFn(staffId, date, shiftKey, context);
    for (const r of results) {
      if (!r.ok) violations.push(r);
    }
  }
  return { passed: violations.length === 0, violations };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. getCandidates
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 指定スタッフ・指定日において全 Hard制約を通過するシフト候補を返す。
 *
 * 候補プール: dept.shiftTypes（部署が持つ全シフト種別）
 *
 * @param {string} staffId
 * @param {number} date     1-indexed
 * @param {object} context  上記 context フィールドを含むオブジェクト
 * @returns {string[]}      例: ['早番', '日勤']  /  [] (全候補が Hard違反)
 */
export function getCandidates(staffId, date, context) {
  const { dept } = context;
  const resolved = resolveConstraints(dept);
  const hardConstraints = resolved.filter(c => c.hardness === 'hard');

  return (dept.shiftTypes || []).filter(shiftKey => {
    const { passed } = runChecks(staffId, date, shiftKey, context, hardConstraints);
    return passed;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. canPlace
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 指定スタッフ・指定日・指定シフトが配置可能かを返す。
 *
 * - Hard制約: 常に有効（relaxedIds に含まれていても無効化できない）
 * - Soft制約: relaxedIds に id が含まれる場合のみスキップ（緩和済み）
 *
 * @param {string}   staffId
 * @param {number}   date        1-indexed
 * @param {string}   shiftKey
 * @param {object}   context
 * @param {string[]} relaxedIds  緩和済み Soft制約IDのリスト（デフォルト []）
 * @returns {boolean}
 */
export function canPlace(staffId, date, shiftKey, context, relaxedIds = []) {
  const { dept } = context;
  const resolved = resolveConstraints(dept);

  // Hard は常に有効。Soft は relaxedIds に含まれなければ有効。
  const activeConstraints = resolved.filter(c =>
    c.hardness === 'hard' || !relaxedIds.includes(c.id)
  );

  const { passed } = runChecks(staffId, date, shiftKey, context, activeConstraints);
  return passed;
}
