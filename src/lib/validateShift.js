/**
 * validateShift — シフト評価器（care/time 共用・純関数・読み取り専用）
 *
 * Hard制約 4本を検証し、Soft違反・スコアの枠を用意した評価器として機能する。
 * Soft違反・score・breakdown は次ステップ（definitions.js 完成後）で追加する。
 *
 * データアクセスはすべて shiftAccessors 経由。
 * dept.shiftTimes / customShiftDefs / roleShiftTypes /
 * maxStaff / shiftRequestsByMonth / prevTail への直接参照なし。
 */

import {
  getShiftDefinition,
  getAllowedShiftTypes,
  getLockedRequest,
  getPrevShift,
} from './shiftAccessors.js';

// ── 定数 ─────────────────────────────────────────────────────────────────────
const WORK_TYPES = new Set(['早番', '日勤', '遅番', '夜勤', '明け']);
const REST_TYPES  = new Set(['休み', '希望休', '有休']);

// ── 内部ユーティリティ ────────────────────────────────────────────────────────
/**
 * 前シフト終了 → 次シフト開始のインターバルを時間単位で返す。
 * 時刻定義は getShiftDefinition 経由（shiftTimes / customShiftDefs / DEFAULT 順）。
 * 定義が取れない場合は 24h を返す（safe fallback）。
 */
function intervalHours(prevKey, nextKey, dept) {
  const prevDef = getShiftDefinition(dept, prevKey);
  const nextDef = getShiftDefinition(dept, nextKey);
  if (!prevDef || !nextDef) return 24;
  const [eh, em] = prevDef.end.split(':').map(Number);
  const [sh, sm] = nextDef.start.split(':').map(Number);
  // 日跨ぎ対応（1440 min = 24h）
  return (sh * 60 + sm + 1440 - (eh * 60 + em)) / 60;
}

// ═════════════════════════════════════════════════════════════════════════════
/**
 * validateShift — シフト評価器エントリポイント
 *
 * @param {object} params
 *   shifts    { [staffId]: { [dayNum:number]: shiftKey } }
 *   dept      部署設定オブジェクト
 *   staffs    スタッフ配列
 *   requests  buildRequests(staffs, year, month) の返値
 *             （希望休/有休/希望勤務を統合した lock map）
 *   prevTail  { [staffId]: { [dayNum:number]: shiftKey } } 前月末数日分
 *   year      対象年（number）  — days 計算に使用
 *   month     対象月 0-indexed  — days 計算に使用
 *
 * @returns {{
 *   hardViolations: object[],   // 1違反1オブジェクト
 *   softViolations: object[],   // 未実装（常に []）
 *   score:          number|null, // 未実装（常に null）
 *   breakdown:      object,     // 未実装（常に {}）
 * }}
 */
export function validateShift({ shifts, dept, staffs, requests = {}, prevTail = {}, year, month }) {
  const hardViolations = [];
  const days = new Date(year, month + 1, 0).getDate();

  const hasNight          = (dept.shiftTypes || []).includes('夜勤');
  const intervalThreshold = dept.intervalThreshold ?? null;

  for (const s of staffs) {
    const staffShifts = shifts[s.id] || {};

    // ══════════════════════════════════════════════════════════════════════════
    // 1. roleAllowedShifts
    //    getAllowedShiftTypes は roleShiftTypes エントリなし時 dept.shiftTypes を返す。
    //    → 制限なし役職は dept 全シフトが許可リストになるため誤検出なし。
    //    → 制限あり役職は許可外シフトを検出。
    //    明け・休系・未入力はチェック対象外。
    // ══════════════════════════════════════════════════════════════════════════
    const allowedShifts = getAllowedShiftTypes(dept, s.role);
    for (let d = 1; d <= days; d++) {
      const actual = staffShifts[d];
      if (!actual || !WORK_TYPES.has(actual) || actual === '明け') continue;
      if (!allowedShifts.includes(actual)) {
        hardViolations.push({
          rule:      'roleAllowedShifts',
          staffId:   s.id,
          staffName: s.name,
          date:      d,
          actual,
          expected:  allowedShifts,
          detail:    '許可外シフトが配置されています',
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. minInterval
    //    dept.intervalThreshold が設定されている部署のみ有効。
    //    前日終了 → 当日開始 のインターバルが threshold 時間未満で違反。
    //    d=1 の前日は getPrevShift(prevTail, staffId) で取得（月跨ぎ対応）。
    //    明け・休系を prev/curr に含む場合はスキップ
    //    （明けは夜勤の連続として別途 nightSetPattern で管理）。
    // ══════════════════════════════════════════════════════════════════════════
    if (intervalThreshold != null) {
      for (let d = 1; d <= days; d++) {
        const curr = staffShifts[d];
        if (!curr || !WORK_TYPES.has(curr) || curr === '明け') continue;

        const prev = d === 1 ? getPrevShift(prevTail, s.id) : staffShifts[d - 1];
        if (!prev || !WORK_TYPES.has(prev) || prev === '明け') continue;

        const hours = intervalHours(prev, curr, dept);
        if (hours < intervalThreshold) {
          hardViolations.push({
            rule:      'minInterval',
            staffId:   s.id,
            staffName: s.name,
            date:      d,
            actual:    curr,
            expected:  `前日(${prev})終了から${intervalThreshold}h以上`,
            detail:    `インターバル ${hours.toFixed(1)}h（下限 ${intervalThreshold}h）`,
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. requestLock
    //    requests = buildRequests(staffs, year, month) の lock map を参照。
    //    kiboByMonth / yukyuByMonth / shiftRequestsByMonth へのアクセスは
    //    buildRequests + getLockedRequest に完全委譲（このファイルは読まない）。
    //    日番号の文字列→Number 変換は getLockedRequest 内で吸収済み。
    //    優先順位: yukyu > kiboRest > shiftRequest（buildRequests 内で解決済み）。
    // ══════════════════════════════════════════════════════════════════════════
    for (let d = 1; d <= days; d++) {
      const lock = getLockedRequest(s.id, d, requests);
      if (!lock) continue;
      const actual = staffShifts[d];
      if (actual === lock.shiftKey) continue;

      const detail = lock.type === 'kiboRest'     ? '希望休が上書きされています'
                   : lock.type === 'yukyu'         ? '有休が上書きされています'
                   : `希望勤務(${lock.shiftKey})が反映されていません`;

      hardViolations.push({
        rule:      'requestLock',
        staffId:   s.id,
        staffName: s.name,
        date:      d,
        actual:    actual ?? '(空欄)',
        expected:  [lock.shiftKey],
        detail,
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. nightSetPattern
    //    dept.shiftTypes に '夜勤' が含まれる部署のみ有効。
    //    前月末シフトは getPrevShift(prevTail, staffId) で取得。
    //
    //    検証パターン:
    //      前月末処理 — 前月末夜勤 → 1日=明け
    //                   前月末明け → 1日=休系
    //      A. 夜勤[d] → 翌日は明け    (月内に翌日がある場合)
    //      B. 明け[d] → 翌日は休系    (月内に翌日がある場合)
    //      C. 明け[d] → 前日は夜勤    (d=1 の前日は prevTail 参照)
    //
    //    月末の夜勤 → 翌月1日チェックはスコープ外（翌月の検証で検出）。
    // ══════════════════════════════════════════════════════════════════════════
    if (hasNight) {
      const prevLast = getPrevShift(prevTail, s.id);

      // 前月末 夜勤 → 1日は明けのはず
      if (prevLast === '夜勤') {
        const day1 = staffShifts[1];
        if (day1 && day1 !== '明け') {
          hardViolations.push({
            rule:      'nightSetPattern',
            staffId:   s.id,
            staffName: s.name,
            date:      1,
            actual:    day1,
            expected:  ['明け'],
            detail:    '前月末夜勤の翌日(1日)が明けではありません',
          });
        }
      }

      // 前月末 明け → 1日は休系のはず
      if (prevLast === '明け') {
        const day1 = staffShifts[1];
        if (day1 && !REST_TYPES.has(day1)) {
          hardViolations.push({
            rule:      'nightSetPattern',
            staffId:   s.id,
            staffName: s.name,
            date:      1,
            actual:    day1,
            expected:  ['休み', '希望休', '有休'],
            detail:    '前月末明けの翌日(1日)が休みではありません',
          });
        }
      }

      for (let d = 1; d <= days; d++) {
        const curr = staffShifts[d];
        if (!curr) continue;

        // A. 夜勤[d] → 翌日は明け
        if (curr === '夜勤' && d < days) {
          const next = staffShifts[d + 1];
          if (next && next !== '明け') {
            hardViolations.push({
              rule:      'nightSetPattern',
              staffId:   s.id,
              staffName: s.name,
              date:      d + 1,
              actual:    next,
              expected:  ['明け'],
              detail:    `夜勤(${d}日)の翌日が明けではありません`,
            });
          }
        }

        // B. 明け[d] → 翌日は休系
        if (curr === '明け' && d < days) {
          const next = staffShifts[d + 1];
          if (next && !REST_TYPES.has(next)) {
            hardViolations.push({
              rule:      'nightSetPattern',
              staffId:   s.id,
              staffName: s.name,
              date:      d + 1,
              actual:    next,
              expected:  ['休み', '希望休', '有休'],
              detail:    `明け(${d}日)の翌日が休みではありません`,
            });
          }
        }

        // C. 明け[d] → 前日は夜勤
        if (curr === '明け') {
          const prev = d === 1 ? prevLast : staffShifts[d - 1];
          if (prev && prev !== '夜勤') {
            hardViolations.push({
              rule:      'nightSetPattern',
              staffId:   s.id,
              staffName: s.name,
              date:      d,
              actual:    curr,
              expected:  ['明け'],
              detail:    `明け(${d}日)の前日が夜勤ではありません（前日: ${prev}）`,
            });
          }
        }
      }
    }
  }

  return {
    hardViolations,
    softViolations: [],  // Soft制約は definitions.js 完成後に実装
    score:          null, // 未実装
    breakdown:      {},  // 未実装
  };
}
