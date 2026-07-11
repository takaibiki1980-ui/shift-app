/**
 * computeLearnedMatch（学習一致度）テスト
 */
import { describe, test, expect } from 'vitest';
import { computeLearnedMatch } from '../lib/learnedMatch.js';

const dept = { id: 'kaigo1', customShiftDefs: [] };
const YEAR = 2026, MONTH = 0; // 1月
// 曜日に依存しないよう全曜日同一の dowShiftRate を用意
function trendAll(map) {
  return { dowShiftRate: Array.from({ length: 7 }, () => ({ ...map })) };
}

describe('computeLearnedMatch', () => {
  test('既知の確率で平均が想定通り（早番0.5×3 + 日勤0.3×2 = 2.1/5 = 42%）', () => {
    const staff = [{ id: 's1', name: 'テスト', dept: 'kaigo1' }];
    const learnedTrend = { 'テスト': trendAll({ 早番: 0.5, 日勤: 0.3, 遅番: 0.2 }) };
    // 早番3・日勤2 の5セル配置（曜日非依存なので日は任意）
    const shifts = { s1: { 1: '早番', 2: '早番', 3: '早番', 4: '日勤', 5: '日勤' } };
    // (0.5+0.5+0.5+0.3+0.3)/5 = 0.42 → 42
    expect(computeLearnedMatch(shifts, staff, dept, YEAR, MONTH, learnedTrend)).toBe(42);
  });

  test('全セルが最頻シフト（確率0.6）→ 60%', () => {
    const staff = [{ id: 's1', name: 'テスト', dept: 'kaigo1' }];
    const learnedTrend = { 'テスト': trendAll({ 早番: 0.6, 日勤: 0.3, 遅番: 0.1 }) };
    const shifts = { s1: { 1: '早番', 2: '早番', 3: '早番', 4: '早番', 5: '早番', 6: '早番' } };
    expect(computeLearnedMatch(shifts, staff, dept, YEAR, MONTH, learnedTrend)).toBe(60);
  });

  test('学習に無い種別を配置 → 確率0として平均を下げる', () => {
    const staff = [{ id: 's1', name: 'テスト', dept: 'kaigo1' }];
    const learnedTrend = { 'テスト': trendAll({ 早番: 1.0 }) }; // 遅番は未収録=0
    const shifts = { s1: { 1: '早番', 2: '早番', 3: '早番', 4: '遅番', 5: '遅番' } };
    // (1+1+1+0+0)/5 = 0.6 → 60
    expect(computeLearnedMatch(shifts, staff, dept, YEAR, MONTH, learnedTrend)).toBe(60);
  });

  test('FIXED（夜勤/明け/希望休/有休）・休み・空白は母数に含めない', () => {
    const staff = [{ id: 's1', name: 'テスト', dept: 'kaigo1' }];
    const learnedTrend = { 'テスト': trendAll({ 早番: 0.4, 日勤: 0.4 }) };
    const shifts = { s1: {
      1: '早番', 2: '日勤', 3: '早番', 4: '日勤', 5: '早番', // 評価対象5セル
      6: '夜勤', 7: '明け', 8: '希望休', 9: '有休', 10: '休み', 11: '' // 全て除外
    } };
    // (0.4×3 + 0.4×2)/5 = 0.4 → 40
    expect(computeLearnedMatch(shifts, staff, dept, YEAR, MONTH, learnedTrend)).toBe(40);
  });

  test('学習データなし（trend空/該当スタッフなし）→ null', () => {
    const staff = [{ id: 's1', name: 'テスト', dept: 'kaigo1' }];
    const shifts = { s1: { 1: '早番', 2: '早番', 3: '早番', 4: '早番', 5: '早番' } };
    expect(computeLearnedMatch(shifts, staff, dept, YEAR, MONTH, {})).toBeNull();
    expect(computeLearnedMatch(shifts, staff, dept, YEAR, MONTH, { '別人': trendAll({ 早番: 0.5 }) })).toBeNull();
  });

  test('母数が5未満 → null（誤解を招く数字を出さない）', () => {
    const staff = [{ id: 's1', name: 'テスト', dept: 'kaigo1' }];
    const learnedTrend = { 'テスト': trendAll({ 早番: 0.5 }) };
    const shifts = { s1: { 1: '早番', 2: '早番', 3: '早番', 4: '早番' } }; // 4セルのみ
    expect(computeLearnedMatch(shifts, staff, dept, YEAR, MONTH, learnedTrend)).toBeNull();
  });

  test('その曜日のdowShiftRateがnull（データ薄）→ そのセルは評価対象外', () => {
    const staff = [{ id: 's1', name: 'テスト', dept: 'kaigo1' }];
    // 全曜日 null → 評価対象ゼロ → 母数不足で null
    const learnedTrend = { 'テスト': { dowShiftRate: [null, null, null, null, null, null, null] } };
    const shifts = { s1: { 1: '早番', 2: '早番', 3: '早番', 4: '早番', 5: '早番', 6: '早番' } };
    expect(computeLearnedMatch(shifts, staff, dept, YEAR, MONTH, learnedTrend)).toBeNull();
  });
});
