/**
 * 人手修正セル検出 & 学習重み付けテスト
 *
 * 確認事項:
 *   a. detectManualEditCells が差分セルを正しく検出する
 *   b. computeLearnedTrend が edits_* キーを読み取り editWeight を適用する
 *   c. 編集なしセルには editWeight が乗算されない
 */
import { describe, test, expect } from 'vitest';
import { detectManualEditCells, computeLearnedTrend, EDIT_WEIGHT } from '../engine/core.js';

// ─── a. detectManualEditCells ─────────────────────────────────────────────

describe('detectManualEditCells', () => {
  test('差分があるセルのみ返す', () => {
    const baseline = { s1: { 1: '日勤', 2: '早番', 3: '休み' } };
    const current  = { s1: { 1: '日勤', 2: '遅番', 3: '休み' } }; // 2日目が変化
    const result = detectManualEditCells(baseline, current);
    expect(result).toEqual({ s1: [2] });
  });

  test('差分ゼロなら空オブジェクトを返す', () => {
    const baseline = { s1: { 1: '日勤', 2: '早番' } };
    const current  = { s1: { 1: '日勤', 2: '早番' } };
    expect(detectManualEditCells(baseline, current)).toEqual({});
  });

  test('複数スタッフ・複数日の差分を正しく検出する', () => {
    const baseline = {
      s1: { 1: '早番', 2: '日勤', 3: '遅番' },
      s2: { 1: '夜勤', 2: '明け', 3: '日勤' },
    };
    const current = {
      s1: { 1: '日勤', 2: '日勤', 3: '遅番' }, // 1日目が変化
      s2: { 1: '夜勤', 2: '明け', 3: '休み' }, // 3日目が変化
    };
    const result = detectManualEditCells(baseline, current);
    expect(result.s1).toEqual([1]);
    expect(result.s2).toEqual([3]);
  });

  test('current に新規追加されたセルも検出する', () => {
    const baseline = { s1: { 1: '日勤' } };
    const current  = { s1: { 1: '日勤', 2: '早番' } }; // 2日目が新規
    const result = detectManualEditCells(baseline, current);
    expect(result.s1).toContain(2);
  });

  test('baseline に存在してcurrentで消えたセルも検出する', () => {
    const baseline = { s1: { 1: '日勤', 2: '早番' } };
    const current  = { s1: { 1: '日勤' } }; // 2日目が消えた
    const result = detectManualEditCells(baseline, current);
    expect(result.s1).toContain(2);
  });
});

// ─── b/c. computeLearnedTrend editWeight ─────────────────────────────────

describe('computeLearnedTrend editWeight', () => {
  const YEAR = 2026, MONTH_RAW = 1; // 2026年1月

  const staffList = [
    { id: 's1', name: 'スタッフA', dept: 'dept1' },
  ];

  function makeDBData(shifts, editCells = null) {
    const key = `shifts_${YEAR}_${MONTH_RAW}_dept1`;
    const db = { [key]: shifts };
    if (editCells) {
      db[`edits_${YEAR}_${MONTH_RAW}_dept1`] = editCells;
    }
    return db;
  }

  test('editWeight定数が1.5であること', () => {
    expect(EDIT_WEIGHT).toBe(1.5);
  });

  test('編集ありセルは freq が高くなる', () => {
    // s1: 1日目=日勤(編集あり), 2日目=早番(編集なし)
    const shifts = { s1: { 1: '日勤', 2: '早番' } };

    // 編集なし baseline
    const dbNoEdit = makeDBData(shifts);
    const trendNoEdit = computeLearnedTrend(dbNoEdit, staffList);

    // 1日目を編集ありとしてマーク
    const dbWithEdit = makeDBData(shifts, { s1: [1] });
    const trendWithEdit = computeLearnedTrend(dbWithEdit, staffList);

    // 編集ありの場合、日勤の freq が高くなるはず
    const freqNoEdit   = trendNoEdit['スタッフA']?.['日勤'] ?? 0;
    const freqWithEdit = trendWithEdit['スタッフA']?.['日勤'] ?? 0;
    expect(freqWithEdit).toBeGreaterThan(freqNoEdit);
  });

  test('編集なしセルは editWeight が乗算されない（早番の比率が変わらない）', () => {
    // alpha=min(1, totals/10) が1に近づくよう10件以上のシフトを用意する
    // 日勤5件(うち1件編集あり) + 早番5件(編集なし) = 計10件
    const shifts = { s1: { 1: '日勤', 2: '早番', 3: '日勤', 4: '早番', 5: '日勤', 6: '早番', 7: '日勤', 8: '早番', 9: '日勤', 10: '早番' } };

    const dbNoEdit   = makeDBData(shifts);
    const dbWithEdit = makeDBData(shifts, { s1: [1] }); // 1日目(日勤)のみ編集あり

    const trendNoEdit   = computeLearnedTrend(dbNoEdit, staffList);
    const trendWithEdit = computeLearnedTrend(dbWithEdit, staffList);

    // 早番の freq: 編集なしでは 5/10=0.5
    // 編集ありでは 日勤の重みが1件分1.5倍 → 日勤:4+1.5=5.5, 早番:5 → 早番比率=5/10.5≈0.476 < 0.5
    const hayaNoEdit   = trendNoEdit['スタッフA']?.['早番'] ?? 0;
    const hayaWithEdit = trendWithEdit['スタッフA']?.['早番'] ?? 0;
    expect(hayaWithEdit).toBeLessThan(hayaNoEdit);
  });

  test('edits_* キーが存在しない場合は従来通り動作する', () => {
    const shifts = { s1: { 1: '日勤', 2: '日勤', 3: '早番' } };
    const db = makeDBData(shifts); // editCells なし
    const trend = computeLearnedTrend(db, staffList);
    // エラーなく動作し、日勤が最多シフトになる
    expect(trend['スタッフA']?.['日勤']).toBeGreaterThan(0);
    expect(trend['スタッフA']?.['日勤']).toBeGreaterThan(trend['スタッフA']?.['早番'] ?? 0);
  });
});
