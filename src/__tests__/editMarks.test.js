import { describe, test, expect } from 'vitest';
import { buildMarksVal, collectSeById } from '../lib/editMarks.js';

const mk = '2026-7';

describe('buildMarksVal（companion 値の構築）', () => {
  test('sr(青)のみ・se(緑)のみ・両方を正しく拾う', () => {
    const staff = [
      { id: 'a', dept: 'k1', shiftRequestsByMonth: { [mk]: { 5: '日勤' } } },
      { id: 'b', dept: 'k1', shiftEditsByMonth:    { [mk]: { 6: '早番' } } },
      { id: 'c', dept: 'k1', shiftRequestsByMonth: { [mk]: { 7: '休み' } }, shiftEditsByMonth: { [mk]: { 8: '遅番' } } },
    ];
    expect(buildMarksVal(staff, 'k1', mk)).toEqual({
      a: { sr: { 5: '日勤' }, se: null },
      b: { sr: null, se: { 6: '早番' } },
      c: { sr: { 7: '休み' }, se: { 8: '遅番' } },
    });
  });
  test('別部署・空マーカー・当月以外は除外', () => {
    const staff = [
      { id: 'x', dept: 'k2', shiftEditsByMonth: { [mk]: { 1: '日勤' } } }, // 別部署
      { id: 'y', dept: 'k1', shiftRequestsByMonth: { [mk]: {} } },          // 空
      { id: 'z', dept: 'k1', shiftEditsByMonth: { '2026-8': { 1: '早番' } } }, // 別月
    ];
    expect(buildMarksVal(staff, 'k1', mk)).toEqual({});
  });
  test('空配列・null 安全', () => {
    expect(buildMarksVal([], 'k1', mk)).toEqual({});
    expect(buildMarksVal(null, 'k1', mk)).toEqual({});
  });
});

describe('collectSeById（緑の表示ハイドレーション用集約）', () => {
  test('複数部署の companion 行から se だけを集約', () => {
    const rows = [
      { data_value: { a: { sr: { 5: '日勤' }, se: { 6: '早番' } }, b: { sr: null, se: null } } },
      { data_value: { c: { sr: null, se: { 9: '遅番' } } } },
    ];
    expect(collectSeById(rows)).toEqual({ a: { 6: '早番' }, c: { 9: '遅番' } });
  });
  test('se が空/なしの staff は含めない', () => {
    const rows = [{ data_value: { a: { sr: { 1: '日勤' }, se: {} }, b: { sr: { 2: '休み' } } } }];
    expect(collectSeById(rows)).toEqual({});
  });
  test('空・null 安全', () => {
    expect(collectSeById([])).toEqual({});
    expect(collectSeById(null)).toEqual({});
    expect(collectSeById([{ data_value: null }])).toEqual({});
  });
});
