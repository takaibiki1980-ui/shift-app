/**
 * coverageEngine.js — 時間帯カバレッジ判定エンジン
 *
 * App.jsx の同名関数をコピーし、timeAxisEngine 内の純関数として再公開する。
 * App.jsx 側は削除・変更しない（互換維持）。
 *
 * 公開 API:
 *   buildShiftIntervals(dept)                       — シフト→{start,end}(分)マップ
 *   buildDayIntervals(shiftKeys, dept)               — 旧二値判定用（互換）
 *   coverageGaps(intervals, reqStart, reqEnd, ...)   — 旧二値判定用（互換）
 *   calcDayCoverageResult(dayShiftValues, rules, shiftIntervals) — 人数考慮判定本体
 *   fillGaps(date, context)                         — gap ごとに coveringShifts/shortage 付与
 *
 * データ取得は shiftAccessors.getShiftDefinition 経由のみ。
 * dept.shiftTimes / dept.customShiftDefs への直接参照はこのファイルの
 * 内部ヘルパー（timeToMins 等）経由のみとし、新規直接参照を追加しない。
 */

import { getShiftDefinition } from '../shiftAccessors.js';

// ── デフォルト時刻（App.jsx の DEFAULT_SHIFT_TIMES と同一） ────────────────────
const DEFAULT_SHIFT_TIMES = {
  早番: { start: '07:00', end: '16:00' },
  日勤: { start: '09:00', end: '18:00' },
  遅番: { start: '11:30', end: '20:30' },
  夜勤: { start: '16:30', end: '09:30' },
};

// ── 内部ユーティリティ ─────────────────────────────────────────────────────────
/** "HH:MM" → 分（null 安全） */
function timeToMins(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * シフトキーの開始時刻を取得する。
 * getShiftDefinition 経由（shiftTimes → customShiftDefs → DEFAULT）。
 */
function getStart(key, dept) {
  return getShiftDefinition(dept, key)?.start ?? null;
}

/** シフトキーの終了時刻を取得する。getShiftDefinition 経由。 */
function getEnd(key, dept) {
  return getShiftDefinition(dept, key)?.end ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. buildShiftIntervals
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 部署の全シフト種別について { start, end }（分単位）のマップを返す。
 * 日跨ぎシフト（end ≤ start）は end += 1440 で正規化する。
 * App.jsx:765 の buildShiftIntervals と完全同一ロジック。
 *
 * @param {object} dept
 * @returns {{ [shiftKey: string]: { start: number, end: number } }}
 */
export function buildShiftIntervals(dept) {
  const iv = {};
  for (const sk of (dept.shiftTypes || [])) {
    const s = timeToMins(getStart(sk, dept));
    const e = timeToMins(getEnd(sk, dept));
    if (s == null || e == null) continue;
    iv[sk] = { start: s, end: e <= s ? e + 1440 : e };
  }
  return iv;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. buildDayIntervals（互換）
// ═════════════════════════════════════════════════════════════════════════════
/**
 * シフトキーの配列から区間リストを返す（旧二値判定用）。
 * App.jsx:374 の buildDayIntervals と完全同一ロジック。
 *
 * @param {string[]} shiftKeys
 * @param {object}   dept
 * @returns {{ start: number, end: number }[]}
 */
export function buildDayIntervals(shiftKeys, dept) {
  const iv = [];
  for (const sk of (shiftKeys || [])) {
    if (!sk) continue;
    const ss = getStart(sk, dept);
    const es = getEnd(sk, dept);
    if (!ss || !es) continue;
    const s0 = timeToMins(ss);
    const e0 = timeToMins(es);
    iv.push({ start: s0, end: e0 <= s0 ? e0 + 1440 : e0 });
  }
  return iv;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. coverageGaps（互換）
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 区間リストと必須運営時間から人員不足スロットを返す（旧二値判定）。
 * App.jsx:385 の coverageGaps と完全同一ロジック。
 *
 * @param {{ start: number, end: number }[]} intervals
 * @param {number} reqStart   分
 * @param {number} reqEnd     分
 * @param {number} minStaff   デフォルト 1
 * @param {number} step       分刻み（デフォルト 15）
 * @returns {{ start: number, end: number }[]}
 */
export function coverageGaps(intervals, reqStart, reqEnd, minStaff = 1, step = 15) {
  const gaps = [];
  let gs = null;
  for (let m = reqStart; m <= reqEnd; m += step) {
    const cnt = intervals.filter(iv => m >= iv.start && m < iv.end).length;
    if (cnt < minStaff) {
      if (gs == null) gs = m;
    } else if (gs != null) {
      gaps.push({ start: gs, end: m });
      gs = null;
    }
  }
  if (gs != null) gaps.push({ start: gs, end: reqEnd });
  return gaps;
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. calcDayCoverageResult（人数考慮判定本体）
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 1日分のシフト配置と coverageRules から、ルールごとの不足区間を返す。
 * App.jsx:777 の calcDayCoverageResult と完全同一ロジック。
 *
 * @param {string[]} dayShiftValues  1日分の全スタッフシフトキー配列
 * @param {{ start: string, end: string, min: number }[]} rules
 * @param {{ [shiftKey: string]: { start: number, end: number } }} shiftIntervals
 *   buildShiftIntervals(dept) の返値
 *
 * @returns {Array<{
 *   rule:              object,
 *   gaps:              { start: number, end: number, maxShortage: number }[],
 *   shortageSlots:     number,
 *   totalShortageUnits: number,
 * }>}
 */
export function calcDayCoverageResult(dayShiftValues, rules, shiftIntervals) {
  const results = [];
  for (const rule of rules) {
    const rS = timeToMins(rule.start);
    const rE = timeToMins(rule.end);
    if (rS == null || rE == null || rS >= rE) continue;

    let maxShortage = 0, shortageSlots = 0, gapStart = null;
    const gaps = [];

    for (let m = rS; m < rE; m += 15) {
      const cnt = dayShiftValues.reduce((c, sk) => {
        if (!sk || !shiftIntervals[sk]) return c;
        const iv = shiftIntervals[sk];
        return (iv.start <= m && m < iv.end) ? c + 1 : c;
      }, 0);

      const shortage = Math.max(0, rule.min - cnt);
      if (shortage > 0) {
        maxShortage = Math.max(maxShortage, shortage);
        shortageSlots++;
        if (gapStart == null) gapStart = m;
      } else if (gapStart != null) {
        gaps.push({ start: gapStart, end: m, maxShortage });
        gapStart = null;
        maxShortage = 0;
      }
    }
    if (gapStart != null) gaps.push({ start: gapStart, end: rE, maxShortage });

    results.push({
      rule,
      gaps,
      shortageSlots,
      totalShortageUnits: shortageSlots > 0
        ? shortageSlots * (gaps.reduce((s, g) => Math.max(s, g.maxShortage), 0))
        : 0,
    });
  }
  return results;
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. fillGaps
// ═════════════════════════════════════════════════════════════════════════════
/**
 * calcDayCoverageResult の gaps を入力に、各 gap について
 * カバー可能なシフト種別（coveringShifts）と不足人数（shortage）を付与して返す。
 *
 * 配置処理はしない（情報付与のみ）。
 *
 * context:
 *   dept              部署設定オブジェクト
 *   shifts            { [staffId]: { [day]: shiftKey } }
 *   days              当月日数
 *
 * @param {number} date  1-indexed
 * @param {object} context
 * @returns {Array<{
 *   ruleStart:       string,   rule.start ("HH:MM")
 *   ruleEnd:         string,   rule.end   ("HH:MM")
 *   gapStart:        number,   分
 *   gapEnd:          number,   分
 *   maxShortage:     number,
 *   coveringShifts:  string[], このgapをカバーできるシフト種別
 *   shortage:        number,   = maxShortage（将来の学習エンジン向けに明示）
 * }>}
 */
export function fillGaps(date, context) {
  const { dept, shifts } = context;
  const rules = dept.coverageRules || [];
  if (rules.length === 0) return [];

  const shiftIntervals = buildShiftIntervals(dept);
  const allStaffIds = Object.keys(shifts);

  // 当日の全スタッフのシフトキー配列
  const dayShiftValues = allStaffIds.map(id => shifts[id]?.[date] || '');

  const coverageResults = calcDayCoverageResult(dayShiftValues, rules, shiftIntervals);

  const enriched = [];
  for (const cr of coverageResults) {
    for (const gap of cr.gaps) {
      // このgapをカバーできるシフト種別 = gapの任意の分を含む区間を持つシフト
      const coveringShifts = Object.entries(shiftIntervals)
        .filter(([, iv]) => {
          // gap 区間と重なるかどうか
          return iv.start < gap.end && iv.end > gap.start;
        })
        .map(([key]) => key);

      enriched.push({
        ruleStart:      cr.rule.start,
        ruleEnd:        cr.rule.end,
        gapStart:       gap.start,
        gapEnd:         gap.end,
        maxShortage:    gap.maxShortage,
        coveringShifts,
        shortage:       gap.maxShortage,
      });
    }
  }
  return enriched;
}
