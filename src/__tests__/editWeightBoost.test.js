/**
 * 第2段階: 手修正重み強化（EDIT_WEIGHT_BOOST）の検証。
 * computeLearnedTrend が edits_* を EDIT_OBS_COUNT 倍で生カウントすることを確認する。
 */
import { describe, test, expect } from 'vitest';
import { computeLearnedTrend, wilsonLower, EDIT_WEIGHT_BOOST_ENABLED, EDIT_OBS_COUNT, EDIT_WEIGHT } from '../engine/core.js';

const staff = [{ id: 's1', name: '柳', dept: 'k' }];
const FRI = 5;
const trendOf = (db) => computeLearnedTrend(db, staff, [])['柳'];

// 月 m0(0始まり) の「先頭K個の金曜」に value を置く（金曜数を厳密に制御するため）
function friCells(y, m0, k, value) {
  const o = {}; let placed = 0;
  const dim = new Date(y, m0 + 1, 0).getDate();
  for (let d = 1; d <= dim && placed < k; d++) if (new Date(y, m0, d).getDay() === FRI) { o[d] = value; placed++; }
  return { cells: o, days: Object.keys(o).map(Number) };
}

describe('手修正重み強化', () => {
  test('フラグONで EDIT_WEIGHT=3.0 / EDIT_OBS_COUNT=3', () => {
    expect(EDIT_WEIGHT_BOOST_ENABLED).toBe(true);
    expect(EDIT_WEIGHT).toBe(3.0);
    expect(EDIT_OBS_COUNT).toBe(3);
  });

  test('手修正セルは dowShiftObs / dowWorkObs が EDIT_OBS_COUNT 倍で加算される', () => {
    // 金曜4回すべて日勤。うち1回を手修正指定 → 生カウント = 通常3 + 手修正1×3 = 6
    const f = friCells(2026, 5, 4, '日勤');
    const db = { 'shifts_2026_6_k': { s1: f.cells }, 'edits_2026_6_k': { s1: [f.days[0]] } };
    const t = trendOf(db);
    expect(t.dowShiftObs[FRI]['日勤']).toBe(3 + EDIT_OBS_COUNT);
    expect(t.dowWorkObs[FRI]).toBe(3 + EDIT_OBS_COUNT);
  });

  test('漂流追随の中核: 古い遅番12回 vs 直近手修正日勤5回×3=15 で 日勤Wilson下限が遅番を上回る', () => {
    // 過去3ヶ月×金曜4回 = 遅番12回（手修正なし）。直近月は金曜5回すべて日勤かつ手修正指定。
    const db = {};
    [[2026, 1], [2026, 2], [2026, 3]].forEach(([y, m]) => { db[`shifts_${y}_${m}_k`] = { s1: friCells(y, m - 1, 4, '遅番').cells }; });
    const may = friCells(2026, 4, 5, '日勤'); // 2026-05 の金曜は5回
    db['shifts_2026_5_k'] = { s1: may.cells };
    db['edits_2026_5_k'] = { s1: may.days };

    const t = trendOf(db);
    const kLate = t.dowShiftObs[FRI]['遅番'] || 0;
    const kNikkin = t.dowShiftObs[FRI]['日勤'] || 0;
    const n = t.dowWorkObs[FRI];
    expect(kLate).toBe(12);
    expect(kNikkin).toBe(15); // 5回×EDIT_OBS_COUNT(3)
    // ブーストON: 日勤(15) > 遅番(12) → Wilson下限も日勤が上回る
    expect(wilsonLower(kNikkin, n, 1.645)).toBeGreaterThan(wilsonLower(kLate, n, 1.645));
    // 対比（ブーストOFF相当＝手修正を1回として数えた場合）: 日勤5 < 遅番12 で逆転しない
    const nOff = 12 + 5;
    expect(wilsonLower(5, nOff, 1.645)).toBeLessThan(wilsonLower(12, nOff, 1.645));
  });
});
