/**
 * minInterval.js — 勤務間インターバル下限（Hard制約）
 *
 * validateShift.js から移植。挙動変更なし。
 * dept.intervalThreshold が null/undefined の場合、呼び出し元でスキップする。
 */

import { getShiftDefinition, getPrevShift } from '../../../shiftAccessors.js';

const WORK_TYPES = new Set(['早番', '日勤', '遅番', '夜勤', '明け']);
const RULE = 'minInterval';

/**
 * 前日終了 → 当日開始のインターバルを時間単位で返す。
 * 定義が取れない場合は 24h（safe fallback）。
 */
function intervalHours(prevKey, nextKey, dept) {
  const prevDef = getShiftDefinition(dept, prevKey);
  const nextDef = getShiftDefinition(dept, nextKey);
  if (!prevDef || !nextDef) return 24;
  const [eh, em] = prevDef.end.split(':').map(Number);
  const [sh, sm] = nextDef.start.split(':').map(Number);
  return (sh * 60 + sm + 1440 - (eh * 60 + em)) / 60;
}

/**
 * 指定スタッフ・指定日のシフトがインターバル下限を満たすか検証する。
 *
 * context:
 *   shifts            { [staffId]: { [day]: shiftKey } }
 *   prevTail          { [staffId]: { [day]: shiftKey } }
 *   dept              部署設定オブジェクト
 *   intervalThreshold 下限時間（null なら無効 → ok を返す）
 *
 * @returns {Array<{ ok: boolean, rule: string, detail?: string, expected?: string, actual?: string }>}
 */
export function check(staffId, date, shiftKey, context) {
  const { shifts, prevTail, dept, intervalThreshold } = context;

  if (intervalThreshold == null) return [];

  if (!shiftKey || !WORK_TYPES.has(shiftKey) || shiftKey === '明け') {
    return [];
  }

  const staffShifts = shifts[staffId] || {};
  const prev = date === 1 ? getPrevShift(prevTail, staffId) : staffShifts[date - 1];

  if (!prev || !WORK_TYPES.has(prev) || prev === '明け') {
    return [];
  }

  const hours = intervalHours(prev, shiftKey, dept);
  if (hours < intervalThreshold) {
    return [{
      ok:       false,
      rule:     RULE,
      detail:   `インターバル ${hours.toFixed(1)}h（下限 ${intervalThreshold}h）`,
      expected: `前日(${prev})終了から${intervalThreshold}h以上`,
      actual:   shiftKey,
    }];
  }

  return [];
}
