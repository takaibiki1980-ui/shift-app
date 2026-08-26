/**
 * D-1「本物の100%の絶対保護」(HARD_REST_100) 関連テスト
 *
 * 確認事項:
 *   a. HARD_REST_100 / HARD_REST_MIN_OBS がエクスポートされ、既定はOFF・下限8である
 *   b. computeLearnedTrend が D-1判定用の生カウンタ dowCellObs/dowRestObs を出力する
 *      （getDay基準・0=日..6=土・重みなし）
 *   c. 「本物の100%休み」(該当曜日 >= 下限 かつ 全て休み) の曜日に勤務が置かれると
 *      computeWarnings が level:3 / hardRest100:true の警告を出す
 *   d. 偽の100%（観測が下限未満）では level:3 警告を出さない
 */
import { describe, test, expect } from 'vitest';
import {
  computeLearnedTrend, HARD_REST_100, HARD_REST_MIN_OBS, getDays,
} from '../engine/core.js';
import { computeWarnings } from '../warnings.js';

const DEPT = 'dept1';
const staffList = [{ id: 's1', name: 'スタッフA', dept: DEPT }];

// 指定した (year, month1..12) の全日について、その曜日が sundayValue の曜日=日曜なら休み、
// 月曜には勤務を1つ置く（totals>=1 でスタッフが学習対象に入るように）。
function buildMonth(year, month1, sundayVal) {
  const days = getDays(year, month1 - 1);
  const m = {};
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month1 - 1, d).getDay();
    if (dow === 0) m[d] = sundayVal;       // 日曜
    else if (dow === 1) m[d] = '日勤';      // 月曜に勤務
  }
  return m;
}

function makeDB(months, sundayVal = '休み') {
  const db = {};
  for (const [y, mo] of months) {
    db[`shifts_${y}_${mo}_${DEPT}`] = { s1: buildMonth(y, mo, sundayVal) };
  }
  return db;
}

// 日曜が >=8 回集まる月数（各月4〜5回の日曜）
const MONTHS = [[2025, 1], [2025, 2], [2025, 3]];

describe('HARD_REST_100 フラグ・定数', () => {
  test('既定はOFF・観測下限は8', () => {
    expect(HARD_REST_100).toBe(false);
    expect(HARD_REST_MIN_OBS).toBe(8);
  });
});

describe('computeLearnedTrend: D-1用の生カウンタ', () => {
  test('dowCellObs/dowRestObs が getDay基準(0=日)で出力される', () => {
    const trend = computeLearnedTrend(makeDB(MONTHS), staffList);
    const t = trend['スタッフA'];
    expect(t).toBeTruthy();
    expect(Array.isArray(t.dowCellObs)).toBe(true);
    expect(t.dowCellObs).toHaveLength(7);
    // 日曜(index0)は全て休み → cellObs>=8 かつ restObs===cellObs
    expect(t.dowCellObs[0]).toBeGreaterThanOrEqual(HARD_REST_MIN_OBS);
    expect(t.dowRestObs[0]).toBe(t.dowCellObs[0]);
    // 月曜(index1)は勤務のみ → restObsは0
    expect(t.dowRestObs[1]).toBe(0);
  });
});

describe('computeWarnings: 本物100%休みへの勤務配置 (level 3)', () => {
  const dept = { id: DEPT };
  // 対象月(2025-04)の最初の日曜を探す
  const Y = 2025, M0 = 3; // 4月(0始まり)
  const days = getDays(Y, M0);
  let firstSunday = null;
  for (let d = 1; d <= days; d++) if (new Date(Y, M0, d).getDay() === 0) { firstSunday = d; break; }

  test('本物100%休みの日曜に勤務を置くと level:3 / hardRest100 警告', () => {
    const trend = computeLearnedTrend(makeDB(MONTHS), staffList);
    const shifts = { s1: { [firstSunday]: '日勤' } }; // 本来休みの日曜に勤務
    const w = computeWarnings({ shifts, staffList, dept, trend, year: Y, month: M0 });
    const l3 = w.find(x => x.level === 3);
    expect(l3).toBeTruthy();
    expect(l3.hardRest100).toBe(true);
    expect(l3.staffId).toBe('s1');
    expect(l3.day).toBe(firstSunday);
  });

  test('休みを置いた場合は level:3 警告なし', () => {
    const trend = computeLearnedTrend(makeDB(MONTHS), staffList);
    const shifts = { s1: { [firstSunday]: '休み' } };
    const w = computeWarnings({ shifts, staffList, dept, trend, year: Y, month: M0 });
    expect(w.find(x => x.level === 3)).toBeUndefined();
  });

  test('偽の100%（観測<8）では level:3 警告を出さない', () => {
    // 1ヶ月のみ → 日曜は4〜5回で下限8未満
    const trend = computeLearnedTrend(makeDB([[2025, 1]]), staffList);
    const t = trend['スタッフA'];
    expect(t.dowCellObs[0]).toBeLessThan(HARD_REST_MIN_OBS);
    const shifts = { s1: { [firstSunday]: '日勤' } };
    const w = computeWarnings({ shifts, staffList, dept, trend, year: Y, month: M0 });
    expect(w.find(x => x.level === 3)).toBeUndefined();
  });
});
