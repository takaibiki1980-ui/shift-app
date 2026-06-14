/**
 * timeAxisEngine/index.js — 栄養科シフト自動生成エンジン（Step 12）
 *
 * 実装済み Phase:
 *   Phase 0: requestLock 先行固定（希望休・有休・希望勤務）
 *   Phase 1: 公休アンカー（最低公休数を DOW 傾向順で優先配置）
 *   Phase 2: キーパーソン先配置（MRV — eligible スタッフ数昇順で coverage gap を処理）
 *   Phase 3: Coverage 駆動配置（日順 greedy、Soft制約 Relaxation 接続、infeasible 記録）
 *   Phase 4: 残り公休充足（Phase 3 後の不足公休を空きスロットに補填）
 *   bestOfN: 複数試行から Hard 違反ゼロ・score 最小の最良解を選択
 *
 * 未実装（将来実装）:
 *   swap / 2-opt / tryRepair
 */

import { getLockedRequest, getStaffTrend, getDowRestRate } from '../shiftAccessors.js';
import { fillGaps }       from './coverageEngine.js';
import { getCandidates, canPlace } from './constraintEngine.js';
import { rankCandidates } from './learningEngine.js';
import { validateShift }  from '../validateShift.js';
import { resolveConstraints, getSoftConstraintsByPenalty } from './constraints/definitions.js';

// 休み系シフトキーセット（公休カウント・Phase 1/4 に使用）
const REST_SET = new Set(['休み', '希望休', '有休', '公休', '明け']);

/**
 * Soft制約を penalty 昇順（緩和優先順）で返す。
 * Phase 3 の Relaxation ループで使用する。
 */
function resolveRelaxationOrder(dept) {
  return getSoftConstraintsByPenalty(resolveConstraints(dept));
}

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
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
 *
 * @param rankFn  rankCandidates 互換の評価関数。試行ごとの jitter 版を受け取る。
 */
function placeKeyPersons(
  dept, staffs, shifts, days, learnedTrend,
  requests, prevTail, intervalThreshold, year, month,
  rankFn = rankCandidates,
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
      const ranked = rankFn(s, d, filtered, learnedTrend,
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

// ─────────────────────────────────────────────────────────────────────────────
// 1試行の生成ロジック
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1試行分のシフト生成を実行し、{ shifts, infeasible, validation } を返す。
 *
 * 各試行では rankCandidates に微小ランダム jitter (Math.random() × 0.001) を
 * 重畳し、Learning Engine 本体の重みを変えずに候補順位を多様化する。
 */
function runOneTrial({ dept, staffs, requests, learnedTrend, prevTail, year, month, days, intervalThreshold }) {
  // shifts テーブル初期化
  const shifts = {};
  for (const s of staffs) shifts[s.id] = {};
  const infeasible = [];
  const relaxationLog = [];

  // Phase 0: requestLock — 希望休・有休・希望勤務を先行固定
  for (const s of staffs) {
    for (let d = 1; d <= days; d++) {
      const locked = getLockedRequest(s.id, d, requests);
      if (locked) shifts[s.id][d] = locked.shiftKey;
    }
  }

  // Phase 1 前処理: 優先休日リストを一括構築
  const preferredRestDaysMap = {};
  for (const s of staffs) {
    preferredRestDaysMap[s.id] = buildPreferredRestDays(s, learnedTrend, year, month);
  }

  // Phase 1: 公休アンカー
  placeMinimumRestDays(staffs, shifts, year, month, preferredRestDaysMap);

  // この試行専用の jitter wrapper（Learning Engine 本体の重みは変更しない）
  const rankFn = (staff, date, candidates, trend, ctx) =>
    rankCandidates(staff, date, candidates, trend, ctx)
      .map(r => ({ ...r, score: r.score + Math.random() * 0.001 }))
      .sort((a, b) => b.score - a.score);

  // Phase 2: キーパーソン先配置（MRV）
  placeKeyPersons(
    dept, staffs, shifts, days, learnedTrend,
    requests, prevTail, intervalThreshold, year, month, rankFn,
  );

  // Phase 3: Coverage 駆動配置（日順 greedy + Soft制約 Relaxation）
  // relaxCtx は staffs / year / month を含み Soft ルール（shiftRatio 等）に対応する
  const relaxCtx = { dept, shifts, prevTail, requests, staffs, intervalThreshold, days, year, month };

  for (let d = 1; d <= days; d++) {
    for (const gap of fillGaps(d, { dept, shifts, days })) {
      const { coveringShifts } = gap;
      let bestStaff = null, bestShift = null, bestScore = -Infinity;

      // 初期探索: Hard + 全 Soft 制約を適用（relaxedIds=[]）
      for (const s of staffs) {
        if (shifts[s.id][d]) continue;
        const filtered = coveringShifts.filter(sk =>
          canPlace(s.id, d, sk, { ...relaxCtx, role: s.role }, [])
        );
        if (filtered.length === 0) continue;
        const ranked = rankFn(s, d, filtered, learnedTrend,
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
        // Relaxation: Soft制約を penalty 昇順に1段ずつ解除して再探索
        let placed = false;
        const relaxedIds = [];
        for (const constraint of resolveRelaxationOrder(dept)) {
          relaxedIds.push(constraint.id);
          let rBestStaff = null, rBestShift = null, rBestScore = -Infinity;
          for (const s of staffs) {
            if (shifts[s.id][d]) continue;
            const filtered = coveringShifts.filter(sk =>
              canPlace(s.id, d, sk, { ...relaxCtx, role: s.role }, relaxedIds)
            );
            if (filtered.length === 0) continue;
            const ranked = rankFn(s, d, filtered, learnedTrend,
              { year, month, currentShifts: shifts, prevTail });
            if (ranked.length > 0 && ranked[0].score > rBestScore) {
              rBestScore = ranked[0].score;
              rBestStaff = s;
              rBestShift = ranked[0].shiftKey;
            }
          }
          if (rBestStaff) {
            shifts[rBestStaff.id][d] = rBestShift;
            relaxationLog.push({
              date:               d,
              relaxedIds:         [...relaxedIds],
              blockingConstraint: relaxedIds[relaxedIds.length - 1],
              staffId:            rBestStaff.id,
              shiftKey:           rBestShift,
            });
            placed = true;
            break;
          }
        }
        if (!placed) {
          infeasible.push({ date: d, gap, reason: 'needs_relaxation' });
        }
      }
    }
  }

  // Phase 4: 残り公休充足
  placeMinimumRestDays(staffs, shifts, year, month, preferredRestDaysMap);

  const validation = validateShift({ shifts, dept, staffs, requests, prevTail, year, month });
  return { shifts, infeasible, relaxationLog, validation };
}

// ═════════════════════════════════════════════════════════════════════════════
/**
 * 栄養科シフト自動生成エントリポイント（bestOfN 版）
 *
 * @param {{
 *   dept:         object,
 *   staffs:       object[],
 *   requests:     object,
 *   learnedTrend: object | null,
 *   prevTail:     object,
 *   year:         number,
 *   month:        number,  0-indexed
 * }} params
 *
 * @param {{ trials?: number }} options
 *   trials: 試行回数（省略時 10、将来 30 へ増やせる構造）
 *
 * @returns {{
 *   shifts:        { [staffId: string]: { [day: number]: string } },
 *   relaxationLog: object[],
 *   infeasible:    { date: number, gap: object, reason: string }[],
 *   stats: {
 *     trials:                number,
 *     bestScore:             number,
 *     bestHardViolationCount: number,
 *     allTrialsInvalid:      boolean,
 *     relaxationCount:       number,
 *     relaxationBreakdown:   { [constraintId: string]: number },
 *   },
 * }}
 */
export function generateTimeAxisShift(
  { dept, staffs, requests, learnedTrend, prevTail = {}, year, month },
  { trials = 10 } = {},
) {
  const days = new Date(year, month + 1, 0).getDate();
  const intervalThreshold = dept.intervalThreshold ?? null;
  const trialParams = { dept, staffs, requests, learnedTrend, prevTail, year, month, days, intervalThreshold };

  // ── 複数試行実行 ──────────────────────────────────────────────────────────
  const trialResults = [];
  for (let t = 0; t < trials; t++) {
    trialResults.push(runOneTrial(trialParams));
  }

  // ── 最良解選択 ────────────────────────────────────────────────────────────
  // 有効試行（hardViolations=0）が存在すればその中から score 最小を選ぶ。
  // 全試行失敗時は hardViolations 件数最小 → score 最小の順で選ぶ。
  const validTrials = trialResults.filter(r => r.validation.hardViolations.length === 0);
  const allTrialsInvalid = validTrials.length === 0;
  const pool = allTrialsInvalid ? trialResults : validTrials;

  const best = pool.reduce((a, b) => {
    const aHard = a.validation.hardViolations.length;
    const bHard = b.validation.hardViolations.length;
    if (aHard !== bHard) return aHard < bHard ? a : b;
    return a.validation.score <= b.validation.score ? a : b;
  });

  // ── Relaxation 統計（採用された best trial の relaxationLog から集計） ────────
  const relaxationCount = best.relaxationLog.length;
  const relaxationBreakdown = {};
  const blockingConstraintBreakdown = {};
  for (const entry of best.relaxationLog) {
    for (const id of entry.relaxedIds) {
      relaxationBreakdown[id] = (relaxationBreakdown[id] ?? 0) + 1;
    }
    if (entry.blockingConstraint) {
      blockingConstraintBreakdown[entry.blockingConstraint] =
        (blockingConstraintBreakdown[entry.blockingConstraint] ?? 0) + 1;
    }
  }

  const stats = {
    trials,
    bestScore:              best.validation.score,
    bestHardViolationCount: best.validation.hardViolations.length,
    allTrialsInvalid,
    relaxationCount,
    relaxationBreakdown,
    blockingConstraintBreakdown,
  };

  return { shifts: best.shifts, relaxationLog: best.relaxationLog, infeasible: best.infeasible, stats };
}
