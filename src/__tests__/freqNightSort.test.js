/**
 * 段階1「夜勤ソートの頻度化」(FREQ_BASED_LEARNING) 関連テスト
 *
 * 確認事項:
 *   a. 定数がエクスポートされ、既定OFF・観測下限4である
 *   b. computeLearnedTrend が dowShiftFreq(=種別観測/その曜日の総観測) を出力する
 *      （既存の dowShiftRate は条件付き率のまま・別物）
 */
import { describe, test, expect } from 'vitest';
import { FREQ_BASED_LEARNING, FREQ_MIN_OBS, computeLearnedTrend, getDays } from '../engine/core.js';

describe('FREQ_BASED_LEARNING 定数', () => {
  test('既定OFF・観測下限4', () => {
    expect(FREQ_BASED_LEARNING).toBe(false);
    expect(FREQ_MIN_OBS).toBe(4);
  });
});

describe('computeLearnedTrend: dowShiftFreq(頻度)', () => {
  const DEPT = 'care';
  const staff = [{ id: 's1', name: '夜勤太', dept: DEPT }];
  // 月曜=夜勤/明け 中心・日曜=休み中心 の3ヶ月を作る
  function buildDB() {
    const db = {};
    for (const [y, mo] of [[2025, 1], [2025, 2], [2025, 3]]) {
      const dim = getDays(y, mo - 1); const rec = { s1: {} };
      for (let d = 1; d <= dim; d++) {
        const dow = new Date(y, mo - 1, d).getDay();
        rec.s1[d] = dow === 1 ? '夜勤' : dow === 2 ? '明け' : dow === 0 ? '休み' : '日勤';
      }
      db[`shifts_${y}_${mo}_${DEPT}`] = rec;
    }
    return db;
  }
  test('dowShiftFreq が存在し、頻度=種別観測/総観測になっている', () => {
    const t = computeLearnedTrend(buildDB(), staff)['夜勤太'];
    expect(Array.isArray(t.dowShiftFreq)).toBe(true);
    expect(t.dowShiftFreq).toHaveLength(7);
    // 月曜(getDay=1)は毎回夜勤 → 頻度≈1、率も≈1
    const monFreq = t.dowShiftFreq[1]['夜勤'] ?? 0;
    expect(monFreq).toBeGreaterThan(0.8);
    // 頻度 = 夜勤観測 / 月曜総観測(dowCellObs) と一致
    const obs = t.dowShiftObs[1]['夜勤'] ?? 0, cell = t.dowCellObs[1] ?? 0;
    expect(monFreq).toBeCloseTo(cell > 0 ? obs / cell : 0, 6);
    // dowShiftRate(条件付き率)は別フィールドとして維持されている
    expect(t.dowShiftRate).toBeTruthy();
  });
});
