/**
 * validateShift ゴールデンテスト（Step 4 完了確認）
 *
 * 1. 違反なし（手作り正常シフト）→ hardViolations = []
 * 2. 各ルール違反を1件ずつ意図的に作成 → 違反が1件検出される
 * 3. リファクタ前後の出力比較用（beforeRefactor スナップショット）
 */

import { describe, test, expect } from 'vitest';
import { validateShift } from '../lib/validateShift.js';
import { buildRequests } from '../lib/shiftAccessors.js';

// ─────────────────────────────────────────────────────────────────────────────
// 共通フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

const dept = {
  shiftTypes:    ['早番', '日勤', '遅番', '夜勤'],
  intervalThreshold: 11,   // 遅番(20:30)→早番(07:00) = 10.5h → 違反
  maxStaff:      { 早番: 2, 日勤: 5, 遅番: 2, 夜勤: 2 },
  roleShiftTypes: {
    '補助': ['日勤'],       // 補助は日勤のみ
  },
};

const staffs = [
  { id: 'sta', name: 'スタッフA', role: '介護福祉士', kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} },
  { id: 'stb', name: 'スタッフB', role: '補助',       kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} },
];

// 2026年7月（31日間）
const YEAR = 2026, MONTH = 6; // 0-indexed

// ─────────────────────────────────────────────────────────────────────────────
// テスト1：正常シフト → hardViolations = 0
// ─────────────────────────────────────────────────────────────────────────────
describe('validateShift ゴールデンテスト', () => {

  test('正常シフト：hardViolations が空であること', () => {
    // スタッフA: 日勤を並べて夜勤セットを1回だけ正しく配置
    const shiftsA = {};
    for (let d = 1; d <= 31; d++) shiftsA[d] = '日勤';
    shiftsA[10] = '夜勤'; shiftsA[11] = '明け'; shiftsA[12] = '休み';

    // スタッフB: 補助→日勤のみ
    const shiftsB = {};
    for (let d = 1; d <= 31; d++) shiftsB[d] = '日勤';
    shiftsB[15] = '休み';

    const shifts = { sta: shiftsA, stb: shiftsB };
    const requests = buildRequests(staffs, YEAR, MONTH);
    const result = validateShift({ shifts, dept, staffs, requests, prevTail: {}, year: YEAR, month: MONTH });

    expect(result.hardViolations).toEqual([]);
    // Step10以降: stb が sta より日勤2件多いため fairness Soft違反1件
    // stb 日勤 30回 vs チーム平均 28.0回 → imbalance=2.0 → score=40
    expect(result.softViolations).toHaveLength(1);
    expect(result.softViolations[0]).toMatchObject({
      ok:       false,
      rule:     'fairness',
      dedupKey: 'fairness:stb:日勤',
    });
    expect(result.score).toBe(40); // fairness penalty(20) × imbalance(2.0)
    expect(result.breakdown).toEqual({ fairness: 40 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // テスト2：roleAllowedShifts 違反
  // ─────────────────────────────────────────────────────────────────────────
  test('roleAllowedShifts：補助スタッフに早番を配置すると1件検出', () => {
    const shiftsB = {};
    for (let d = 1; d <= 31; d++) shiftsB[d] = '日勤';
    shiftsB[5] = '早番'; // 補助は日勤のみ → 違反

    const shifts = { sta: {}, stb: shiftsB };
    const requests = buildRequests(staffs, YEAR, MONTH);
    const result = validateShift({ shifts, dept, staffs, requests, prevTail: {}, year: YEAR, month: MONTH });

    const rav = result.hardViolations.filter(v => v.rule === 'roleAllowedShifts');
    expect(rav).toHaveLength(1);
    expect(rav[0]).toMatchObject({
      rule:      'roleAllowedShifts',
      staffId:   'stb',
      date:      5,
      actual:    '早番',
      expected:  ['日勤'],
      detail:    '許可外シフトが配置されています',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // テスト3：minInterval 違反
  // ─────────────────────────────────────────────────────────────────────────
  test('minInterval：遅番→早番（10.5h）で違反1件検出', () => {
    const shiftsA = {};
    for (let d = 1; d <= 31; d++) shiftsA[d] = '日勤';
    shiftsA[7]  = '遅番'; // 20:30終了
    shiftsA[8]  = '早番'; // 07:00開始 → 10.5h < 11h → 違反

    const shifts = { sta: shiftsA, stb: {} };
    const requests = buildRequests(staffs, YEAR, MONTH);
    const result = validateShift({ shifts, dept, staffs, requests, prevTail: {}, year: YEAR, month: MONTH });

    const miv = result.hardViolations.filter(v => v.rule === 'minInterval');
    expect(miv).toHaveLength(1);
    expect(miv[0]).toMatchObject({
      rule:    'minInterval',
      staffId: 'sta',
      date:    8,
      actual:  '早番',
      detail:  'インターバル 10.5h（下限 11h）',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // テスト4：requestLock 違反（希望休が上書きされている）
  // ─────────────────────────────────────────────────────────────────────────
  test('requestLock：希望休登録日に日勤を配置すると違反1件検出', () => {
    const staffsWithKibo = [
      { id: 'sta', name: 'スタッフA', role: '介護福祉士',
        kiboByMonth: { '2026-7': [20] }, // 20日に希望休
        yukyuByMonth: {}, shiftRequestsByMonth: {} },
      { id: 'stb', name: 'スタッフB', role: '補助',
        kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} },
    ];

    const shiftsA = {};
    for (let d = 1; d <= 31; d++) shiftsA[d] = '日勤';
    // 20日に日勤を置く → 希望休と不一致

    const shifts = { sta: shiftsA, stb: {} };
    const requests = buildRequests(staffsWithKibo, YEAR, MONTH);
    const result = validateShift({ shifts, dept, staffs: staffsWithKibo, requests, prevTail: {}, year: YEAR, month: MONTH });

    const rlv = result.hardViolations.filter(v => v.rule === 'requestLock');
    expect(rlv).toHaveLength(1);
    expect(rlv[0]).toMatchObject({
      rule:     'requestLock',
      staffId:  'sta',
      date:     20,
      actual:   '日勤',
      expected: ['希望休'],
      detail:   '希望休が上書きされています',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // テスト5：nightSetPattern 違反（夜勤の翌日が明けでない）
  // ─────────────────────────────────────────────────────────────────────────
  test('nightSetPattern：夜勤の翌日が日勤だと違反1件検出', () => {
    const shiftsA = {};
    for (let d = 1; d <= 31; d++) shiftsA[d] = '日勤';
    shiftsA[15] = '夜勤';
    shiftsA[16] = '日勤'; // 明けであるべき → 違反

    const shifts = { sta: shiftsA, stb: {} };
    const requests = buildRequests(staffs, YEAR, MONTH);
    const result = validateShift({ shifts, dept, staffs, requests, prevTail: {}, year: YEAR, month: MONTH });

    const nspv = result.hardViolations.filter(v => v.rule === 'nightSetPattern');
    // 夜勤→日勤(A違反) + 明けでない日に前日夜勤チェックは走らない（日勤[16]は明けでない）
    // 実際には date=16 で checkNightSetPattern が呼ばれるが shiftKey='日勤' → Cに該当しない
    expect(nspv.length).toBeGreaterThanOrEqual(1);
    expect(nspv[0]).toMatchObject({
      rule:     'nightSetPattern',
      staffId:  'sta',
      detail:   expect.stringContaining('明けではありません'),
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // テスト6：前月末夜勤 → 1日=明け（月跨ぎ）
  // ─────────────────────────────────────────────────────────────────────────
  test('nightSetPattern：前月末夜勤 → 1日が日勤だと違反検出', () => {
    const prevTail = { sta: { 30: '夜勤' } }; // 前月末が夜勤

    const shiftsA = {};
    for (let d = 1; d <= 31; d++) shiftsA[d] = '日勤';
    // 1日は日勤のまま（明けであるべき）

    const shifts = { sta: shiftsA, stb: {} };
    const requests = buildRequests(staffs, YEAR, MONTH);
    const result = validateShift({ shifts, dept, staffs, requests, prevTail, year: YEAR, month: MONTH });

    const nspv = result.hardViolations.filter(
      v => v.rule === 'nightSetPattern' && v.date === 1 && v.staffId === 'sta'
    );
    expect(nspv).toHaveLength(1);
    expect(nspv[0].detail).toContain('前月末夜勤');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // テスト7：return 形式の完全確認
  // ─────────────────────────────────────────────────────────────────────────
  test('return 形式：4フィールドすべて存在すること', () => {
    const result = validateShift({
      shifts: {}, dept, staffs: [], requests: {}, prevTail: {}, year: YEAR, month: MONTH,
    });
    expect(result).toHaveProperty('hardViolations');
    expect(result).toHaveProperty('softViolations');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('breakdown');
    expect(Array.isArray(result.hardViolations)).toBe(true);
    expect(Array.isArray(result.softViolations)).toBe(true);
  });
});
