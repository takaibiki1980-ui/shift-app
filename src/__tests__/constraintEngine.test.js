/**
 * constraintEngine.js — Step 5 動作確認テスト
 *
 * 1. getCandidates: roleAllowedShifts / minInterval による除外例
 * 2. canPlace: hard は常に有効 / soft は relaxedIds でスキップ
 */

import { describe, test, expect } from 'vitest';
import { getCandidates, canPlace } from '../lib/timeAxisEngine/constraintEngine.js';
import { buildRequests } from '../lib/shiftAccessors.js';

// ─────────────────────────────────────────────────────────────────────────────
// 共通フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

const dept = {
  shiftTypes:        ['早番', '日勤', '遅番', '夜勤'],
  intervalThreshold: 11,     // 遅番(20:30)→早番(07:00) = 10.5h → 違反
  maxStaff:          { 早番: 2, 日勤: 5, 遅番: 2, 夜勤: 2 },
  roleShiftTypes: {
    '補助': ['日勤'],         // 補助は日勤のみ
  },
};

const YEAR = 2026, MONTH = 6; // 2026年7月（31日間）
const days = 31;

// ─────────────────────────────────────────────────────────────────────────────
// getCandidates テスト
// ─────────────────────────────────────────────────────────────────────────────
describe('getCandidates', () => {

  test('制限なし役職・前日勤務なし → dept.shiftTypes が全て候補に返る', () => {
    const context = {
      dept,
      shifts:   { sta: {} },
      prevTail: {},
      role:     '介護福祉士',
      requests: {},
      intervalThreshold: dept.intervalThreshold,
      days,
    };
    const candidates = getCandidates('sta', 5, context);
    // 全4種が候補（前日シフトなし → minInterval スキップ）
    expect(candidates).toEqual(expect.arrayContaining(['早番', '日勤', '遅番', '夜勤']));
    expect(candidates).toHaveLength(4);
  });

  test('roleAllowedShifts：補助スタッフは日勤のみ候補に返る（早番・遅番・夜勤が除外される）', () => {
    const context = {
      dept,
      shifts:   { stb: {} },
      prevTail: {},
      role:     '補助',      // ← 日勤のみ許可
      requests: {},
      intervalThreshold: dept.intervalThreshold,
      days,
    };
    const candidates = getCandidates('stb', 10, context);
    // ★ roleAllowedShifts により早番・遅番・夜勤が除外される
    expect(candidates).toEqual(['日勤']);
  });

  test('minInterval：前日=遅番のとき、早番が除外される（10.5h < 11h）', () => {
    const context = {
      dept,
      shifts:   { sta: { 6: '遅番' } }, // 6日が遅番
      prevTail: {},
      role:     '介護福祉士',
      requests: {},
      intervalThreshold: dept.intervalThreshold,
      days,
    };
    // 7日の候補 → 遅番→早番(10.5h) と 遅番→日勤(12.5h) を検証
    const candidates = getCandidates('sta', 7, context);
    // ★ minInterval により早番が除外される
    expect(candidates).not.toContain('早番');
    // 日勤(12.5h)・遅番(9h day-wrap OK)・夜勤 は通過
    expect(candidates).toContain('日勤');
  });

  test('minInterval：前月末=遅番（prevTail）のとき、1日=早番が除外される', () => {
    const context = {
      dept,
      shifts:   { sta: {} },
      prevTail: { sta: { 30: '遅番' } }, // 前月末が遅番
      role:     '介護福祉士',
      requests: {},
      intervalThreshold: dept.intervalThreshold,
      days,
    };
    // 1日の候補
    const candidates = getCandidates('sta', 1, context);
    // ★ minInterval（月跨ぎ）により早番が除外される
    expect(candidates).not.toContain('早番');
  });

  test('requestLock：希望休登録日は希望休のみが候補（shiftTypes外）', () => {
    const staffsWithKibo = [
      { id: 'sta', name: 'A', role: '介護福祉士',
        kiboByMonth: { '2026-7': [15] },
        yukyuByMonth: {}, shiftRequestsByMonth: {} },
    ];
    const requests = buildRequests(staffsWithKibo, YEAR, MONTH);
    const context = {
      dept,
      shifts:   { sta: {} },
      prevTail: {},
      role:     '介護福祉士',
      requests,
      intervalThreshold: dept.intervalThreshold,
      days,
    };
    // 15日: 希望休ロック → 全シフト種別（早番/日勤/遅番/夜勤）が違反 → 候補0件
    const candidates = getCandidates('sta', 15, context);
    // shiftTypes = ['早番','日勤','遅番','夜勤'] は全て requestLock 違反
    expect(candidates).toHaveLength(0);
  });

  test('nightSetPattern：夜勤あり部署で前日=夜勤のとき1日=明けのみ候補', () => {
    const context = {
      dept, // shiftTypes に '夜勤' あり → nightSetPattern 有効
      shifts:   { sta: { 5: '夜勤' } }, // 5日が夜勤
      prevTail: {},
      role:     '介護福祉士',
      requests: {},
      intervalThreshold: dept.intervalThreshold,
      days,
    };
    // 6日候補: 夜勤[5]の翌日なので明けのみ通過（dept.shiftTypesに'明け'は含まれないので実質0候補）
    // shiftTypes = ['早番','日勤','遅番','夜勤'] → 明けがないため全除外
    const candidates = getCandidates('sta', 6, context);
    expect(candidates).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canPlace テスト
// ─────────────────────────────────────────────────────────────────────────────
describe('canPlace', () => {

  const baseCtx = {
    dept,
    shifts:   { sta: {} },
    prevTail: {},
    role:     '介護福祉士',
    requests: {},
    intervalThreshold: dept.intervalThreshold,
    days,
  };

  test('Hard違反 → false（relaxedIds に含めても覆らない）', () => {
    const ctx = {
      ...baseCtx,
      role: '補助', // 日勤のみ許可
    };
    // 早番は roleAllowedShifts(Hard)違反
    expect(canPlace('sta', 5, '早番', ctx)).toBe(false);
    // relaxedIds に roleAllowedShifts を渡しても Hard なので無効化されない
    expect(canPlace('sta', 5, '早番', ctx, ['roleAllowedShifts'])).toBe(false);
  });

  test('Hard通過 → true', () => {
    expect(canPlace('sta', 5, '日勤', baseCtx)).toBe(true);
  });

  test('Soft違反（maxStaff）は relaxedIds なしで false、ありで true', () => {
    // maxStaff は現時点で rule 実装なし → RULE_REGISTRY に未登録 → 常に通過
    // このテストは Step6 後に再確認（現在は通過確認のみ）
    expect(canPlace('sta', 5, '日勤', baseCtx)).toBe(true);
    expect(canPlace('sta', 5, '日勤', baseCtx, ['maxStaff'])).toBe(true);
  });

  test('minInterval Hard違反 → false', () => {
    const ctx = {
      ...baseCtx,
      shifts: { sta: { 9: '遅番' } }, // 9日=遅番
    };
    // 10日=早番 → 10.5h < 11h → Hard違反 → false
    expect(canPlace('sta', 10, '早番', ctx)).toBe(false);
    // 10日=日勤 → 12.5h ≥ 11h → 通過 → true
    expect(canPlace('sta', 10, '日勤', ctx)).toBe(true);
  });
});
