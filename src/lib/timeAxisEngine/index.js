/**
 * timeAxisEngine/index.js — 栄養科シフト自動生成エンジン（Step 11b）
 *
 * 実装済み Phase:
 *   Phase 0: requestLock 先行固定（希望休・有休・希望勤務）
 *   Phase 1: 公休アンカー（最低公休数を DOW 傾向順で優先配置）
 *   Phase 2: キーパーソン先配置（MRV — eligible スタッフ数昇順で coverage gap を処理）
 *   Phase 3: Coverage 駆動配置（日順 greedy、infeasible 記録）
 *   Phase 4: 残り公休充足（Phase 3 後の不足公休を空きスロットに補填）
 *
 * 未実装 Phase（将来実装）:
 *   bestOfN / ランダム探索 / trySwap / 2-opt / 学習再評価
 */

import { getLockedRequest, getStaffTrend, getDowRestRate } from '../shiftAccessors.js';
import { fillGaps }       from './coverageEngine.js';
import { getCandidates }  from './constraintEngine.js';
import { rankCandidates } from './learningEngine.js';
import { validateShift }  from '../validateShift.js';

// 休み系シフトキーセット（公休カウント・Phase 1/4 に使用）
const REST_SET = new Set(['休み', '希望休', '有休', '公休', '明け']);

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー（エクスポート: buildPreferredRestDays はテスト可能にする）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * スタッフの DOW 別休み出現率（dowRestRate）に基づき、
 * 休みを優先的に配置すべき日リストを rate 降順で返す。
 * trend データがない日は rate=0 として末尾に回す。
 *
 * @param {object} staff         スタッフオブジェクト（name フィールドを使用）
 * @param {object|null} learnedTrend  computeLearnedTrend() の返値
 * @param {number} year
 * @param {number} month  0-indexed
 * @returns {number[]}  day 番号の配列（1-indexed）
 */
export function buildPreferredRestDays(staff, learnedTrend, year, month) {
  const totalDays = new Date(year, month + 1, 0).getDate();
  const trend = getStaffTrend(learnedTrend, staff);
  const dayRates = [];
  for (let d = 1; d <= totalDays; d++) {
    const rate = getDowRestRate(trend, new Date(year, month, d)) ?? 0;
    dayRates.push({ d, rate });
  }
  dayRates.sort((a, b) => b.rate - a.rate);
  return dayRates.map(x => x.d);
}

/**
 * Phase 1 / Phase 4 共用:
 * requiredDaysOff に達するまで、preferredRestDaysMap の優先順で空きスロットに
 * '休み' を配置する。requests（Phase 0 ロック済み）の日は変更しない。
 *
 * requiredDaysOff = s.kyukoDaysByMonth[mk] ?? s.kyukoDays ?? 8
 */
function placeMinimumRestDays(staffs, shifts, year, month, preferredRestDaysMap) {
  const mk = `${year}-${month + 1}`;
  for (const s of staffs) {
    const required = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const sShifts = shifts[s.id];
    const currentRest = Object.values(sShifts).filter(sk => REST_SET.has(sk)).length;
    let needed = required - currentRest;
    if (needed <= 0) continue;
    for (const d of preferredRestDaysMap[s.id] || []) {
      if (needed <= 0) break;
      if (sShifts[d]) continue; // Phase 0 ロック済み or 既配置
      sShifts[d] = '休み';
      needed--;
    }
  }
}

/**
 * Phase 2: キーパーソン先配置（MRV ヒューリスティック）
 *
 * 月内の全 coverage gap を eligible スタッフ数昇順でソートし、
 * 「最も配置が困難な gap」から順に最優秀候補を配置する。
 * infeasible は記録せず（Phase 3 の責務）、best-effort で配置する。
 */
function placeKeyPersons(
  dept, staffs, shifts, days, learnedTrend,
  requests, prevTail, intervalThreshold, year, month,
) {
  // ① 全日の gap を収集し eligible 数を付与
  const gapQueue = [];
  for (let d = 1; d <= days; d++) {
    for (const gap of fillGaps(d, { dept, shifts, days })) {
      const eligibleCount = staffs.filter(s => {
        if (shifts[s.id][d]) return false;
        const ctx = { dept, shifts, prevTail, requests, role: s.role, intervalThreshold, days };
        return getCandidates(s.id, d, ctx).some(sk => gap.coveringShifts.includes(sk));
      }).length;
      gapQueue.push({ d, gap, eligibleCount });
    }
  }

  // ② MRV: eligible 数昇順でソート（最も制約が厳しい gap を先に処理）
  gapQueue.sort((a, b) => a.eligibleCount - b.eligibleCount);

  // ③ 各 gap に最優秀候補を配置
  for (const { d, gap } of gapQueue) {
    // Phase 2 内の先行配置で既に充足済みか確認
    const recheck = fillGaps(d, { dept, shifts, days });
    const stillOpen = recheck.some(
      g => g.gapStart === gap.gapStart && g.gapEnd === gap.gapEnd && g.ruleStart === gap.ruleStart,
    );
    if (!stillOpen) continue;

    let bestStaff = null, bestShift = null, bestScore = -Infinity;
    for (const s of staffs) {
      if (shifts[s.id][d]) continue;
      const staffCtx = { dept, shifts, prevTail, requests, role: s.role, intervalThreshold, days };
      const candidates = getCandidates(s.id, d, staffCtx);
      const filtered = candidates.filter(sk => gap.coveringShifts.includes(sk));
      if (filtered.length === 0) continue;
      const ranked = rankCandidates(s, d, filtered, learnedTrend,
        { year, month, currentShifts: shifts, prevTail });
      if (ranked.length > 0 && ranked[0].score > bestScore) {
        bestScore = ranked[0].score;
        bestStaff = s;
        bestShift = ranked[0].shiftKey;
      }
    }
    if (bestStaff) shifts[bestStaff.id][d] = bestShift;
  }
}

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
  const intervalThreshold = dept.intervalThreshold ?? null;

  // shifts テーブル初期化（全スタッフ × 全日 = 未配置）
  const shifts = {};
  for (const s of staffs) shifts[s.id] = {};

  const relaxationLog = [];
  const infeasible    = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 0: requestLock — 希望休・有休・希望勤務を先行固定
  // ─────────────────────────────────────────────────────────────────────────
  for (const s of staffs) {
    for (let d = 1; d <= days; d++) {
      const locked = getLockedRequest(s.id, d, requests);
      if (locked) shifts[s.id][d] = locked.shiftKey;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1 前処理: 全スタッフの優先休日リストを一括構築
  // ─────────────────────────────────────────────────────────────────────────
  const preferredRestDaysMap = {};
  for (const s of staffs) {
    preferredRestDaysMap[s.id] = buildPreferredRestDays(s, learnedTrend, year, month);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1: 公休アンカー — requiredDaysOff に達するまで '休み' を先行配置
  // ─────────────────────────────────────────────────────────────────────────
  placeMinimumRestDays(staffs, shifts, year, month, preferredRestDaysMap);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: キーパーソン先配置（MRV ヒューリスティック）
  // ─────────────────────────────────────────────────────────────────────────
  placeKeyPersons(
    dept, staffs, shifts, days, learnedTrend,
    requests, prevTail, intervalThreshold, year, month,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: Coverage 駆動配置（日順 greedy）
  //   Phase 2 で充足済みの gap は fillGaps が返さないため自動的にスキップ。
  //   Phase 2 が best-effort で埋めきれなかった gap を補完し、
  //   それでも候補なしなら infeasible に記録する。
  // ─────────────────────────────────────────────────────────────────────────
  for (let d = 1; d <= days; d++) {
    for (const gap of fillGaps(d, { dept, shifts, days })) {
      const { coveringShifts } = gap;
      let bestStaff = null, bestShift = null, bestScore = -Infinity;

      for (const s of staffs) {
        if (shifts[s.id][d]) continue;
        const staffCtx = { dept, shifts, prevTail, requests, role: s.role, intervalThreshold, days };
        const candidates = getCandidates(s.id, d, staffCtx);
        const filtered   = candidates.filter(sk => coveringShifts.includes(sk));
        if (filtered.length === 0) continue;
        const ranked = rankCandidates(s, d, filtered, learnedTrend,
          { year, month, currentShifts: shifts, prevTail });
        if (ranked.length > 0 && ranked[0].score > bestScore) {
          bestScore = ranked[0].score;
          bestStaff = s;
          bestShift = ranked[0].shiftKey;
        }
      }

      if (bestStaff) {
        shifts[bestStaff.id][d] = bestShift;
      } else {
        infeasible.push({ date: d, gap, reason: 'needs_relaxation' });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: 残り公休充足
  //   Phase 3 後も required に達していないスタッフの空きスロットに '休み' を補填。
  // ─────────────────────────────────────────────────────────────────────────
  placeMinimumRestDays(staffs, shifts, year, month, preferredRestDaysMap);

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
