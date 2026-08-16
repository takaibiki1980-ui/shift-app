/**
 * 希望勤務の学習重み強化（WISH_WEIGHT_BOOST）の検証。
 * 希望勤務は staffList[sid].shiftRequestsByMonth["Y-M"][day] に保持され、
 * computeLearnedTrend が staffList 経由で staffId×日 を判別してブーストする。
 */
import { describe, test, expect } from 'vitest';
import { computeLearnedTrend, WISH_WEIGHT_BOOST_ENABLED, WISH_WEIGHT, WISH_OBS_COUNT, EDIT_WEIGHT, EDIT_OBS_COUNT } from '../engine/core.js';

const FRI = 5;
// 対象月キー "2026-6"（6月, m0=5）。金曜: 5,12,19,26。
function friCells(y, m0, k, v) {
  const o = {}; let p = 0; const dim = new Date(y, m0 + 1, 0).getDate();
  for (let d = 1; d <= dim && p < k; d++) if (new Date(y, m0, d).getDay() === FRI) { o[d] = v; p++; }
  return { cells: o, days: Object.keys(o).map(Number) };
}
const mkStaff = (wish) => [{ id: 's1', name: '柳', dept: 'k', shiftRequestsByMonth: wish ? { '2026-6': wish } : {} }];
const trendOf = (db, staff) => computeLearnedTrend(db, staff, [])['柳'];

describe('希望勤務の学習重み強化', () => {
  test('定数: ON=3.0 / OBS=3', () => {
    expect(WISH_WEIGHT_BOOST_ENABLED).toBe(true);
    expect(WISH_WEIGHT).toBe(3.0);
    expect(WISH_OBS_COUNT).toBe(3);
  });

  test('希望勤務セルは dowShiftObs / dowWorkObs が WISH_OBS_COUNT 倍で加算される', () => {
    const f = friCells(2026, 5, 4, '日勤'); // 金4回すべて日勤
    const db = { 'shifts_2026_6_k': { s1: f.cells } };
    // うち1日(f.days[0])を希望勤務指定
    const staff = mkStaff({ [f.days[0]]: '日勤' });
    const t = trendOf(db, staff);
    // 通常3回 + 希望勤務1回×3 = 6
    expect(t.dowShiftObs[FRI]['日勤']).toBe(3 + WISH_OBS_COUNT);
    expect(t.dowWorkObs[FRI]).toBe(3 + WISH_OBS_COUNT);
  });

  test('dowShiftRate（重み付き）が希望勤務で底上げされる（希望勤務なしより日勤比率が高い）', () => {
    // 金曜: 日勤2・遅番2。うち日勤1日を希望勤務指定 → 日勤の重みが増え比率上昇。
    const cells = {}; const fri = friCells(2026, 5, 4, '日勤').days; // [5,12,19,26]
    cells[fri[0]] = '日勤'; cells[fri[1]] = '日勤'; cells[fri[2]] = '遅番'; cells[fri[3]] = '遅番';
    const db = { 'shifts_2026_6_k': { s1: cells } };
    const rateNo = trendOf(db, mkStaff(null)).dowShiftRate[FRI]['日勤'] ?? 0;
    const rateWish = trendOf(db, mkStaff({ [fri[0]]: '日勤' })).dowShiftRate[FRI]['日勤'] ?? 0;
    expect(rateWish).toBeGreaterThan(rateNo);
  });

  test('手修正かつ希望勤務のセルは倍率が掛け合わされず 3.0 のまま（obsも3）', () => {
    const f = friCells(2026, 5, 4, '日勤');
    const day = f.days[0];
    const db = { 'shifts_2026_6_k': { s1: f.cells }, 'edits_2026_6_k': { s1: [day] } };
    const staff = mkStaff({ [day]: '日勤' }); // 同一セルが手修正かつ希望勤務
    const t = trendOf(db, staff);
    // obs: 通常3回 + 当該1回×max(EDIT_OBS_COUNT, WISH_OBS_COUNT)=3 = 6（9ではない）
    expect(t.dowShiftObs[FRI]['日勤']).toBe(3 + Math.max(EDIT_OBS_COUNT, WISH_OBS_COUNT));
    expect(EDIT_OBS_COUNT).toBe(3); expect(WISH_OBS_COUNT).toBe(3);
  });

  test('希望勤務=休み/有休 は対象外（ブーストされない）', () => {
    // 金曜すべて日勤の月で、ある金曜に「休み」を希望勤務指定しても日勤obsは増えない
    const f = friCells(2026, 5, 4, '日勤');
    const db = { 'shifts_2026_6_k': { s1: f.cells } };
    const staffRestWish = mkStaff({ [f.days[0]]: '休み' }); // 休みリクエスト（対象外）
    const t = trendOf(db, staffRestWish);
    expect(t.dowShiftObs[FRI]['日勤']).toBe(4); // ブーストなし=通常4回
  });

  test('希望休(kiboByMonth)・有休(yukyuByMonth)の扱いは不変（rest率が変わらない）', () => {
    // shiftRequestsByMonth を使わないケースで従来通り。希望休/有休は別管理なので影響なし。
    const cells = {}; friCells(2026, 5, 4, '日勤').days.forEach(d => cells[d] = '日勤');
    const db = { 'shifts_2026_6_k': { s1: cells } };
    const t = trendOf(db, mkStaff(null));
    // 金曜は全部日勤=勤務 → 休み率0のまま
    expect(t.dowRestRate[FRI - 1] ?? 0).toBe(0); // dowRestRateは月曜=0インデックス
  });
});
