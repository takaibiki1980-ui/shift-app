/**
 * relaxation.js — Soft制約 penalty 昇順緩和による再配置候補探索（Step 8）
 *
 * 公開 API:
 *   placeWithRelaxation(date, shiftKeys, context)
 *     → { success: true, staffId, shiftKey, relaxedConstraints } | { success: false, reason }
 *
 * 配置処理は行わない（呼び出し元が staffId + shiftKey を受け取って実際に配置する）。
 *
 * 緩和順は resolveConstraints(dept) から導出する（definitions.js が唯一の定義元）。
 * 制約IDのリストをこのファイル内にベタ書きしない。
 * maxStaffRelaxable=false の Hard昇格も resolveConstraints 経由で自動的に効く。
 */

import { resolveConstraints } from './constraints/definitions.js';
import { canPlace } from './constraintEngine.js';

// ═════════════════════════════════════════════════════════════════════════════
// placeWithRelaxation
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Soft制約を penalty 昇順に1つずつ緩和しながら、
 * date × shiftKeys × staffs の組み合わせから canPlace が通る最初の候補を返す。
 *
 * 緩和なし → shiftRatio → fairness → maxConsecutive → maxStaff の順（penalty昇順）。
 * maxStaffRelaxable=false の部署では maxStaff は Hard昇格済みのため緩和対象外となる。
 * Hard制約（nightSetPattern / minInterval / roleAllowedShifts / requestLock）は絶対に緩和しない。
 *
 * @param {number}   date       1-indexed（1〜31）
 * @param {string[]} shiftKeys  試すシフト種別（coveringShifts など gap 由来）
 * @param {object}   context    { dept, staffs, shifts, prevTail, requests, intervalThreshold, days }
 *   staffs: [{ id, role, ... }]  — 役職を含むスタッフオブジェクト配列
 *
 * @returns {{
 *   success: true,
 *   staffId: string,
 *   shiftKey: string,
 *   relaxedConstraints: string[],  // 緩和した Soft制約ID（緩和不要なら []）
 * } | {
 *   success: false,
 *   reason: 'hard_infeasible',
 * }}
 */
export function placeWithRelaxation(date, shiftKeys, context) {
  const { dept } = context;

  // Soft制約を penalty 昇順に取得（resolveConstraints 経由 = definitions.js が唯一の定義元）
  const softByPenalty = resolveConstraints(dept)
    .filter(c => c.hardness === 'soft')
    .sort((a, b) => a.penalty - b.penalty);

  const relaxed = [];

  // 緩和なし（null） → Soft1つ → Soft2つ … の順で試す
  for (const constraintToAdd of [null, ...softByPenalty]) {
    if (constraintToAdd !== null) relaxed.push(constraintToAdd.id);

    const result = tryPlaceWith(date, shiftKeys, context, [...relaxed]);
    if (result.success) {
      return { ...result, relaxedConstraints: [...relaxed] };
    }
  }

  // 全 Soft 緩和後も候補なし = Hard制約による真の充足不能
  return { success: false, reason: 'hard_infeasible' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 指定した relaxedIds で shiftKeys × staffs を全探索し、最初に通った組み合わせを返す。
 * 配置（shifts の更新）は行わない。
 *
 * roleAllowedShifts は context.role を参照するため、
 * スタッフごとに staff.role を context へ注入してから canPlace を呼ぶ。
 *
 * @param {number}   date
 * @param {string[]} shiftKeys
 * @param {object}   context
 * @param {string[]} relaxedIds  現在緩和中の Soft制約ID
 * @returns {{ success: true, staffId: string, shiftKey: string } | { success: false }}
 */
function tryPlaceWith(date, shiftKeys, context, relaxedIds) {
  for (const shiftKey of shiftKeys) {
    for (const staff of (context.staffs || [])) {
      // roleAllowedShifts が context.role を読むため、スタッフごとに role を注入する
      const staffContext = staff.role !== undefined
        ? { ...context, role: staff.role }
        : context;

      if (canPlace(staff.id, date, shiftKey, staffContext, relaxedIds)) {
        return { success: true, staffId: staff.id, shiftKey };
      }
    }
  }
  return { success: false };
}
