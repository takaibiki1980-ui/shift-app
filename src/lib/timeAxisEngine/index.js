/**
 * timeAxisEngine/index.js — 栄養科シフト自動生成エンジン（Step 11a）
 *
 * 実装済み Phase:
 *   Phase 0: requestLock 先行固定（希望休・有休・希望勤務）
 *   Phase 3: Coverage 駆動配置（最小版 — 1 gap につき最上位候補 1 件を配置）
 *
 * 未実装 Phase（将来実装）:
 *   Phase 1: 公休アンカー
 *   Phase 2: キーパーソン先配置
 *   Phase 4: 残り公休充足
 *   bestOfN / ランダム探索 / trySwap / 2-opt / 学習再評価
 */

import { getLockedRequest } from '../shiftAccessors.js';
import { fillGaps }          from './coverageEngine.js';
import { getCandidates }     from './constraintEngine.js';
import { rankCandidates }    from './learningEngine.js';
import { validateShift }     from '../validateShift.js';

// ═════════════════════════════════════════════════════════════════════════════
/**
 * 栄養科シフト自動生成エントリポイント
 *
 * @param {{
 *   dept:         object,
 *   staffs:       object[],
 *   requests:     object,
 *   learnedTrend: object | null,
 *   prevTail:     object,
 *   year:         number,
 *   month:        number,  0-indexed
 * }} input
 *
 * @returns {{
 *   shifts:        { [staffId: string]: { [day: number]: string } },
 *   relaxationLog: object[],
 *   infeasible:    { date: number, gap: object, reason: string }[],
 *   stats:         { score: number, hardViolationCount: number, softViolationCount: number },
 * }}
 */
export function generateTimeAxisShift({
  dept,
  staffs,
  requests,
  learnedTrend,
  prevTail = {},
  year,
  month,
}) {
  const days = new Date(year, month + 1, 0).getDate();

  // shifts テーブル初期化（全スタッフ × 全日 = 未配置）
  const shifts = {};
  for (const s of staffs) shifts[s.id] = {};

  const relaxationLog = [];
  const infeasible    = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 0: requestLock — 希望休・有休・希望勤務を先行固定
  //   getLockedRequest は yukyu > kiboRest > shiftRequest の優先順で返す
  //   （buildRequests が既に優先順位を解決済み）
  // ─────────────────────────────────────────────────────────────────────────
  for (const s of staffs) {
    for (let d = 1; d <= days; d++) {
      const locked = getLockedRequest(s.id, d, requests);
      if (locked) shifts[s.id][d] = locked.shiftKey;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: Coverage 駆動配置（最小版）
  //
  //   1日ずつ fillGaps でカバレッジ不足箇所を取得し、
  //   gap ごとに最上位候補（スタッフ × シフト）を 1 件だけ配置する。
  //
  //   候補選定フロー（gap 単位）:
  //     ① gap.coveringShifts — gap をカバーできるシフト種別
  //     ② getCandidates()    — Hard制約を通るシフトを絞り込み
  //     ③ rankCandidates()   — 学習スコアで降順ランキング
  //     最上位の (staffId, shiftKey) を配置
  //
  //   全スタッフで候補ゼロ → infeasible に記録（自動緩和は未実装）
  // ─────────────────────────────────────────────────────────────────────────
  const intervalThreshold = dept.intervalThreshold ?? null;

  for (let d = 1; d <= days; d++) {
    const coverageCtx = { dept, shifts, days };
    const gaps = fillGaps(d, coverageCtx);

    for (const gap of gaps) {
      const { coveringShifts } = gap;

      let bestStaff = null;
      let bestShift = null;
      let bestScore = -Infinity;

      for (const s of staffs) {
        if (shifts[s.id][d]) continue; // Phase 0 配置済み or 直前 gap で配置済み

        const staffCtx = {
          dept, shifts, prevTail, requests,
          role: s.role, intervalThreshold, days,
        };

        // Hard制約を通るシフト候補を取得し、gap カバー可能シフトで絞る
        const candidates = getCandidates(s.id, d, staffCtx);
        const filtered   = candidates.filter(sk => coveringShifts.includes(sk));
        if (filtered.length === 0) continue;

        // 学習スコアで降順ランキング（trend 未取得時は全候補 score=0）
        const rankCtx = { year, month, currentShifts: shifts, prevTail };
        const ranked  = rankCandidates(s, d, filtered, learnedTrend, rankCtx);

        // score が最高の (staff, shift) ペアを採用（同点は先に見つかった方を優先）
        if (ranked.length > 0 && ranked[0].score > bestScore) {
          bestScore = ranked[0].score;
          bestStaff = s;
          bestShift = ranked[0].shiftKey;
        }
      }

      if (bestStaff) {
        shifts[bestStaff.id][d] = bestShift;
      } else {
        // 全スタッフで Hard制約を通る候補なし → 緩和が必要
        infeasible.push({ date: d, gap, reason: 'needs_relaxation' });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // validateShift 接続 — 生成完了後に必ず実行
  // ─────────────────────────────────────────────────────────────────────────
  const validation = validateShift({
    shifts, dept, staffs, requests, prevTail, year, month,
  });

  const stats = {
    score:               validation.score,
    hardViolationCount:  validation.hardViolations.length,
    softViolationCount:  validation.softViolations.length,
  };

  return { shifts, relaxationLog, infeasible, stats };
}
