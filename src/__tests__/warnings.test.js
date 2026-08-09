import { describe, test, expect } from 'vitest';
import { computeWarnings } from '../warnings.js';

// 2026年8月: 火曜=4,11,18,25 / 月曜=3,10,17,24,31
const dept = { id: 'k', shiftTypes: ['早番', '日勤', '遅番', '夜勤'] };
const staff = [{ id: 's1', name: '柳', dept: 'k' }, { id: 's2', name: '伊藤', dept: 'k' }];

// trend ヘルパー: dowShiftObs[dow][shift], dowWorkObs[dow], dowShiftRate, _monthCounts
function mkTrend(over) {
  const base = { _monthCounts: { 柳: 4, 伊藤: 4 } };
  for (const n of ['柳', '伊藤']) base[n] = {
    dowShiftObs: Array.from({ length: 7 }, () => ({})),
    dowWorkObs: [0, 0, 0, 0, 0, 0, 0],
    dowShiftRate: Array.from({ length: 7 }, () => ({})),
  };
  over(base);
  return base;
}

describe('生成警告の判定', () => {
  test('レベル1: 火曜遅番の確定癖(6/7)なのに早番→警告', () => {
    const trend = mkTrend(b => { b['柳'].dowShiftObs[2] = { 遅番: 6, 早番: 1 }; b['柳'].dowWorkObs[2] = 7; });
    const shifts = { s1: { 4: '早番' } }; // 8/4=火曜
    const w = computeWarnings({ shifts, staffList: [staff[0]], dept, trend, year: 2026, month: 7 });
    const l1 = w.filter(x => x.level === 1);
    expect(l1.length).toBe(1);
    expect(l1[0]).toMatchObject({ staffId: 's1', day: 4, expected: '遅番', actual: '早番', k: 6, n: 7 });
    expect(l1[0].wilsonLower).toBeGreaterThanOrEqual(0.5);
  });

  test('レベル1非該当: 癖どおり(遅番)なら警告なし', () => {
    const trend = mkTrend(b => { b['柳'].dowShiftObs[2] = { 遅番: 6, 早番: 1 }; b['柳'].dowWorkObs[2] = 7; });
    const w = computeWarnings({ shifts: { s1: { 4: '遅番' } }, staffList: [staff[0]], dept, trend, year: 2026, month: 7 });
    expect(w.length).toBe(0);
  });

  test('レベル1: 生成が休み系なら対象外', () => {
    const trend = mkTrend(b => { b['柳'].dowShiftObs[2] = { 遅番: 6, 早番: 1 }; b['柳'].dowWorkObs[2] = 7; });
    for (const rest of ['休み', '希望休', '有休']) {
      const w = computeWarnings({ shifts: { s1: { 4: rest } }, staffList: [staff[0]], dept, trend, year: 2026, month: 7 });
      expect(w.length).toBe(0);
    }
  });

  test('レベル1: 生成が明けなら対象外（前日夜勤従属）', () => {
    const trend = mkTrend(b => { b['柳'].dowShiftObs[2] = { 遅番: 6, 早番: 1 }; b['柳'].dowWorkObs[2] = 7; });
    const w = computeWarnings({ shifts: { s1: { 4: '明け' } }, staffList: [staff[0]], dept, trend, year: 2026, month: 7 });
    expect(w.length).toBe(0);
  });

  test('弱い癖(3/7=Wilson<0.5)は確定癖でないのでレベル1にならない', () => {
    const trend = mkTrend(b => { b['柳'].dowShiftObs[2] = { 遅番: 3, 日勤: 4 }; b['柳'].dowWorkObs[2] = 7; });
    const w = computeWarnings({ shifts: { s1: { 4: '早番' } }, staffList: [staff[0]], dept, trend, year: 2026, month: 7 });
    expect(w.filter(x => x.level === 1).length).toBe(0);
  });

  test('レベル2: 月曜に夜勤の前例ゼロ(観測5回)→警告', () => {
    // 過半数の種別を作らない分布（確定癖ゼロ）で、夜勤だけ前例なし
    const trend = mkTrend(b => { b['伊藤'].dowShiftObs[1] = { 日勤: 2, 早番: 2, 遅番: 1 }; b['伊藤'].dowWorkObs[1] = 5; });
    const w = computeWarnings({ shifts: { s2: { 3: '夜勤' } }, staffList: [staff[1]], dept, trend, year: 2026, month: 7 });
    const l2 = w.filter(x => x.level === 2);
    expect(l2.length).toBe(1);
    expect(l2[0]).toMatchObject({ staffId: 's2', day: 3, actual: '夜勤', k: 0, n: 5 });
    expect(l2[0].wilsonLower).toBeNull();
  });

  test('レベル2非該当: 観測不足(3回)は前例なしでも警告しない', () => {
    const trend = mkTrend(b => { b['伊藤'].dowShiftObs[1] = { 日勤: 1, 早番: 1, 遅番: 1 }; b['伊藤'].dowWorkObs[1] = 3; });
    const w = computeWarnings({ shifts: { s2: { 3: '夜勤' } }, staffList: [staff[1]], dept, trend, year: 2026, month: 7 });
    expect(w.length).toBe(0);
  });

  test('レベル2: 休み系・明けは対象外', () => {
    const trend = mkTrend(b => { b['伊藤'].dowShiftObs[1] = { 日勤: 5 }; b['伊藤'].dowWorkObs[1] = 5; });
    for (const v of ['休み', '有休', '明け']) {
      const w = computeWarnings({ shifts: { s2: { 3: v } }, staffList: [staff[1]], dept, trend, year: 2026, month: 7 });
      expect(w.length).toBe(0);
    }
  });

  test('レベル2は1スタッフ最大3件（確率が低い順）', () => {
    // 月曜(3,10,17,24,31)すべてに前例なし夜勤を置く→5件候補→3件に制限
    const trend = mkTrend(b => { b['伊藤'].dowShiftObs[1] = { 日勤: 3, 早番: 3 }; b['伊藤'].dowWorkObs[1] = 6; });
    const shifts = { s2: { 3: '夜勤', 10: '夜勤', 17: '夜勤', 24: '夜勤', 31: '夜勤' } };
    const w = computeWarnings({ shifts, staffList: [staff[1]], dept, trend, year: 2026, month: 7 });
    expect(w.filter(x => x.level === 2).length).toBe(3);
  });

  test('レベル1がレベル2より優先（重複セルはレベル1のみ）', () => {
    // 火曜: 遅番の確定癖(6/7)。生成=夜勤（前例ゼロでもある）→ レベル1のみ1件
    const trend = mkTrend(b => { b['柳'].dowShiftObs[2] = { 遅番: 6, 早番: 1 }; b['柳'].dowWorkObs[2] = 7; });
    const w = computeWarnings({ shifts: { s1: { 4: '夜勤' } }, staffList: [staff[0]], dept, trend, year: 2026, month: 7 });
    expect(w.length).toBe(1);
    expect(w[0].level).toBe(1);
  });
});
