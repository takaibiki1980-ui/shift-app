/**
 * validateShift — シフト検証器（care/time 共用・純関数・読み取り専用）
 *
 * 検証対象: Hard制約 4本
 *   1. roleAllowedShifts   役職別許可シフト
 *   2. minInterval         勤務間インターバル
 *   3. requestLock         希望休・有休・希望勤務の不一致
 *   4. nightSetPattern     夜勤→明け→休みパターンの崩れ
 */

// ── シフト時刻解決（App.jsx の getShiftStartTime / getShiftEndTime と同ロジック）──
const DEFAULT_SHIFT_TIMES = {
  早番: { start: '07:00', end: '16:00' },
  日勤: { start: '09:00', end: '18:00' },
  遅番: { start: '11:30', end: '20:30' },
  夜勤: { start: '16:30', end: '09:30' },
};

function getShiftStart(key, dept) {
  // 優先順位: dept.shiftTimes → dept.customShiftDefs[].startTime → DEFAULT_SHIFT_TIMES
  const st = dept?.shiftTimes?.[key];
  if (st?.start) return st.start;
  const cd = (dept?.customShiftDefs || []).find(d => d.key === key);
  if (cd?.startTime) return cd.startTime;
  return DEFAULT_SHIFT_TIMES[key]?.start ?? null;
}

function getShiftEnd(key, dept) {
  // 優先順位: dept.shiftTimes → dept.customShiftDefs[].endTime → DEFAULT_SHIFT_TIMES
  const st = dept?.shiftTimes?.[key];
  if (st?.end) return st.end;
  const cd = (dept?.customShiftDefs || []).find(d => d.key === key);
  if (cd?.endTime) return cd.endTime;
  return DEFAULT_SHIFT_TIMES[key]?.end ?? null;
}

function calcIntervalHours(prevKey, nextKey, dept) {
  const endStr   = getShiftEnd(prevKey, dept);
  const startStr = getShiftStart(nextKey, dept);
  if (!endStr || !startStr) return 24;
  const [eh, em] = endStr.split(':').map(Number);
  const [sh, sm] = startStr.split(':').map(Number);
  // 日跨ぎ対応（1440 min = 24h）
  return (sh * 60 + sm + 1440 - (eh * 60 + em)) / 60;
}

// ── 定数 ─────────────────────────────────────────────────────────────────────
const WORK_TYPES = new Set(['早番', '日勤', '遅番', '夜勤', '明け']);
const REST_TYPES  = new Set(['休み', '希望休', '有休']);

// ── ヘルパー ──────────────────────────────────────────────────────────────────
/** prevTail[staffId] の最終日シフトを返す。データなければ null */
function lastPrevShift(prevTail, staffId) {
  const tail = prevTail?.[staffId];
  if (!tail) return null;
  const dayNums = Object.keys(tail).map(Number);
  if (!dayNums.length) return null;
  return tail[Math.max(...dayNums)];
}

/**
 * @param {{ shifts, dept, staffs, prevTail, year, month }} params
 *   shifts   { [staffId]: { [dayNum:number]: shiftKey } }
 *   dept     部署設定オブジェクト
 *   staffs   スタッフ配列
 *   prevTail { [staffId]: { [dayNum:number]: shiftKey } }  前月末数日分
 *   year     対象年（number）
 *   month    対象月（0-indexed: 0=1月 … 11=12月）
 * @returns {Array} violations  1違反1オブジェクトの配列
 */
export function validateShift({ shifts, dept, staffs, prevTail = {}, year, month }) {
  const violations = [];
  const days = new Date(year, month + 1, 0).getDate(); // 月末日
  // monthKey は App.jsx の `${y}-${m+1}` 形式と一致させる
  const mk = `${year}-${month + 1}`;

  const hasNight          = (dept.shiftTypes || []).includes('夜勤');
  const intervalThreshold = dept.intervalThreshold ?? null;

  for (const s of staffs) {
    const staffShifts = shifts[s.id] || {};

    // ══════════════════════════════════════════════════════════════════════════
    // 1. roleAllowedShifts
    //    dept.roleShiftTypes[role] に含まれないシフトが配置されていれば違反
    //    エントリなし = 制限なし（介護エンジンの getAllowedTypes と同仕様）
    // ══════════════════════════════════════════════════════════════════════════
    const allowedShifts = dept.roleShiftTypes?.[s.role];
    if (allowedShifts) {
      for (let d = 1; d <= days; d++) {
        const actual = staffShifts[d];
        // 明け・休系・未入力は対象外
        if (!actual || !WORK_TYPES.has(actual) || actual === '明け') continue;
        if (!allowedShifts.includes(actual)) {
          violations.push({
            rule: 'roleAllowedShifts',
            staffId:   s.id,
            staffName: s.name,
            date:      d,
            actual,
            expected:  allowedShifts,
            detail:    '許可外シフトが配置されています',
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. minInterval
    //    dept.intervalThreshold がある場合のみ有効
    //    前日終了 → 当日開始のインターバルが threshold 時間を下回れば違反
    //    d=1 の前日は prevTail から取得
    // ══════════════════════════════════════════════════════════════════════════
    if (intervalThreshold != null) {
      for (let d = 1; d <= days; d++) {
        const curr = staffShifts[d];
        if (!curr || !WORK_TYPES.has(curr) || curr === '明け') continue;

        const prev = d === 1 ? lastPrevShift(prevTail, s.id) : staffShifts[d - 1];
        if (!prev || !WORK_TYPES.has(prev) || prev === '明け') continue;

        const hours = calcIntervalHours(prev, curr, dept);
        if (hours < intervalThreshold) {
          violations.push({
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
    //    希望休 / 有休 / 希望勤務（shiftRequestsByMonth）の申請と実配置が異なれば違反
    //    データ参照元:
    //      希望休  : s.kiboByMonth[mk]           → dayNum[]
    //      有休    : s.yukyuByMonth[mk]           → dayNum[]
    //      希望勤務: s.shiftRequestsByMonth[mk]   → { [dayStr]: shiftKey }
    // ══════════════════════════════════════════════════════════════════════════
    for (const d of (s.kiboByMonth?.[mk] || []).map(Number)) {
      const actual = staffShifts[d];
      if (actual !== '希望休') {
        violations.push({
          rule:      'requestLock',
          staffId:   s.id,
          staffName: s.name,
          date:      d,
          actual:    actual ?? '(空欄)',
          expected:  ['希望休'],
          detail:    '希望休が上書きされています',
        });
      }
    }

    for (const d of (s.yukyuByMonth?.[mk] || []).map(Number)) {
      const actual = staffShifts[d];
      if (actual !== '有休') {
        violations.push({
          rule:      'requestLock',
          staffId:   s.id,
          staffName: s.name,
          date:      d,
          actual:    actual ?? '(空欄)',
          expected:  ['有休'],
          detail:    '有休が上書きされています',
        });
      }
    }

    for (const [dayStr, shiftKey] of Object.entries(s.shiftRequestsByMonth?.[mk] || {})) {
      const d      = Number(dayStr);
      const actual = staffShifts[d];
      if (actual !== shiftKey) {
        violations.push({
          rule:      'requestLock',
          staffId:   s.id,
          staffName: s.name,
          date:      d,
          actual:    actual ?? '(空欄)',
          expected:  [shiftKey],
          detail:    `希望勤務(${shiftKey})が反映されていません`,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 4. nightSetPattern
    //    dept.shiftTypes に '夜勤' が含まれる部署のみ有効
    //    検証するパターン:
    //      A. 夜勤[d] → 翌日が明けでない
    //      B. 明け[d] → 翌日が休系でない（月内に翌日が存在する場合のみ）
    //      C. 明け[d] → 前日が夜勤でない（d=1 の前日は prevTail から確認）
    //    月末の夜勤に対する翌月チェックはスコープ外（次月の検証で検出）
    // ══════════════════════════════════════════════════════════════════════════
    if (hasNight) {
      // 前月末 夜勤 → 1日が明けであるべき
      const prevLast = lastPrevShift(prevTail, s.id);
      if (prevLast === '夜勤') {
        const day1 = staffShifts[1];
        if (day1 && day1 !== '明け') {
          violations.push({
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

      // 前月末 明け → 1日が休系であるべき
      if (prevLast === '明け') {
        const day1 = staffShifts[1];
        if (day1 && !REST_TYPES.has(day1)) {
          violations.push({
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
            violations.push({
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
            violations.push({
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
            violations.push({
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

  return violations;
}
