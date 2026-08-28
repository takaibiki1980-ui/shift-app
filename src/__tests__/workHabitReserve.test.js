/**
 * 案B「高確率勤務の先行予約」(WORK_HABIT_RESERVE) 関連テスト
 *
 * 確認事項:
 *   a. 定数がエクスポートされ、既定OFF・閾値(RATE0.9/OBS8/WILSON0.6)である
 *   b. フラグOFFでは生成が従来通り（予約は行われない）＝ warnings に level4 は出ない
 *
 * 予約挙動そのもの(フラグON)の実測は使い捨てプローブで別途行い、コミットはしない。
 */
import { describe, test, expect } from 'vitest';
import {
  WORK_HABIT_RESERVE, WORK_HABIT_RESERVE_RATE, WORK_HABIT_MIN_OBS, WORK_HABIT_WILSON,
  computeLearnedTrend, getDays,
} from '../engine/core.js';
import { computeWarnings } from '../warnings.js';

describe('WORK_HABIT_RESERVE 定数', () => {
  test('既定ON（先行予約が有効）・閾値 RATE0.9/OBS8/WILSON0.6', () => {
    expect(WORK_HABIT_RESERVE).toBe(true);
    expect(WORK_HABIT_RESERVE_RATE).toBe(0.9);
    expect(WORK_HABIT_MIN_OBS).toBe(8);
    expect(WORK_HABIT_WILSON).toBe(0.6);
  });
});

describe('フラグON時 level4(学習配置調整)警告', () => {
  const DEPT = 'care';
  const staff = [{ id: 's1', name: '早番太', dept: DEPT }];
  // 月曜=早番100%(観測十分)の学習を作る
  function buildDB() {
    const db = {};
    for (const [y, mo] of [[2025, 1], [2025, 2], [2025, 3]]) {
      const dim = getDays(y, mo - 1);
      const rec = { s1: {} };
      for (let d = 1; d <= dim; d++) {
        const dow = new Date(y, mo - 1, d).getDay();
        rec.s1[d] = dow === 1 ? '早番' : (dow === 0 ? '休み' : '日勤');
      }
      db[`shifts_${y}_${mo}_${DEPT}`] = rec;
    }
    return db;
  }
  test('予約対象(月曜早番)に別勤務が置かれると level4 が出る（フラグON）', () => {
    const trend = computeLearnedTrend(buildDB(), staff);
    const Y = 2025, M0 = 8; const dim = getDays(Y, M0);
    let firstMon = null;
    for (let d = 1; d <= dim; d++) if (new Date(Y, M0, d).getDay() === 1) { firstMon = d; break; }
    const shifts = { s1: { [firstMon]: '日勤' } }; // 早番癖の月曜に日勤
    const w = computeWarnings({ shifts, staffList: staff, dept: { id: DEPT }, trend, year: Y, month: M0 });
    const l4 = w.find(x => x.level === 4);
    expect(l4).toBeTruthy();
    expect(l4.reserveMiss).toBe(true);
    expect(l4.expected).toBe('早番');
  });
  test('予約対象どおり(月曜早番)なら level4 は出ない', () => {
    const trend = computeLearnedTrend(buildDB(), staff);
    const Y = 2025, M0 = 8; const dim = getDays(Y, M0);
    let firstMon = null;
    for (let d = 1; d <= dim; d++) if (new Date(Y, M0, d).getDay() === 1) { firstMon = d; break; }
    const shifts = { s1: { [firstMon]: '早番' } };
    const w = computeWarnings({ shifts, staffList: staff, dept: { id: DEPT }, trend, year: Y, month: M0 });
    expect(w.find(x => x.level === 4)).toBeUndefined();
  });
});
