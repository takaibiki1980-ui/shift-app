/**
 * 有給残数管理の計測ロジック（生成・学習には非関与の独立モジュール）。
 *
 * 消費量の定義（PR #113/#114 で確定した半日シフト整備を踏まえる）:
 *   フル有休（セル値 "有休" / yukyuByMonth の予定日）= 1.0 日消費
 *   半日有給（早/有・日/有・有/日・有/遅）           = 0.5 日消費
 *
 * 有休はセル値 "有休" と yukyuByMonth（セルが空のとき有効）の両方で表現されるため
 * 両方を数える（画面集計 `v || (yukyudays?"有休")` と同一の判定）。
 */
import { getDays, monthKey } from '../engine/core.js';

const HALF_PAID_TYPES = new Set(['早/有', '日/有', '有/日', '有/遅']);

/**
 * その月・その部署の有給消費量をスタッフごとに集計する。
 * @param {Object} shifts    { staffId: { day: shift } }
 * @param {Array}  staffList
 * @param {string} deptId
 * @param {number} year
 * @param {number} month     0始まり
 * @returns {{ [staffId: string]: number }} 消費量>0 のスタッフのみ
 */
export function computePaidLeaveConsumed(shifts, staffList, deptId, year, month) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const result = {};
  for (const s of (staffList || []).filter(x => x.dept === deptId)) {
    const yukyu = new Set((s.yukyuByMonth?.[mk] || []).map(Number));
    let c = 0;
    for (let d = 1; d <= days; d++) {
      const v = shifts?.[s.id]?.[d];
      if (v === '有休') c += 1;               // セル値のフル有休
      else if (HALF_PAID_TYPES.has(v)) c += 0.5; // 半日有給
      else if (!v && yukyu.has(d)) c += 1;    // 予定有休（セル空のとき有効）
    }
    if (c > 0) result[s.id] = c;
  }
  return result;
}

/**
 * 消費量マップを残数に適用する（純粋関数・二重減算防止のテスト用）。
 * @param {Object} balances  { staffId: number } 現在の残数
 * @param {Object} consumed  { staffId: number } 消費量
 * @param {number} sign      -1=減算（確定時） / +1=復元（解除時）
 * @returns {Object} 新しい残数マップ
 */
export function applyConsumption(balances, consumed, sign) {
  const next = { ...balances };
  for (const [id, amt] of Object.entries(consumed || {})) {
    next[id] = (next[id] ?? 0) + sign * amt;
  }
  return next;
}
