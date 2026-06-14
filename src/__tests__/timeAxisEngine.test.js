/**
 * timeAxisEngine index.js テスト（Step 11a）
 *
 * 対象: generateTimeAxisShift()
 *
 * テスト方針:
 *   - Phase 0 の requestLock 先行固定が正しく動くこと
 *   - validateShift が接続されており stats が返ること
 *   - roleAllowedShifts が Phase 3 でも守られること
 */

import { describe, test, expect } from 'vitest';
import { generateTimeAxisShift } from '../lib/timeAxisEngine/index.js';
import { buildRequests }         from '../lib/shiftAccessors.js';

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャヘルパー
// ─────────────────────────────────────────────────────────────────────────────
function mkStaff(id, name, role, extra = {}) {
  return {
    id, name, role,
    kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {},
    ...extra,
  };
}

const YEAR = 2026, MONTH = 6; // 2026年7月（31日間）

// ═════════════════════════════════════════════════════════════════════════════
describe('generateTimeAxisShift', () => {

  // ── Test 1: Phase 0 — requestLock ────────────────────────────────────────
  test('Phase0: 希望休・有休・希望勤務が初期配置される', () => {
    const staffs = [
      mkStaff('sta', 'スタッフA', '管理栄養士', {
        kiboByMonth:          { '2026-7': [10, 15] },   // 10日・15日を希望休
        yukyuByMonth:         { '2026-7': [20] },        // 20日を有休
        shiftRequestsByMonth: { '2026-7': { '5': '早番' } }, // 5日を早番希望
      }),
    ];
    const dept = { shiftTypes: ['早番', '日勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { shifts } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    expect(shifts['sta'][10]).toBe('希望休');   // kiboRest
    expect(shifts['sta'][15]).toBe('希望休');   // kiboRest
    expect(shifts['sta'][20]).toBe('有休');     // yukyu（最高優先）
    expect(shifts['sta'][5]).toBe('早番');      // shiftRequest
  });

  // ── Test 2: validateShift 接続 → stats.score ─────────────────────────────
  test('validateShift が実行され stats の各フィールドが数値で返る', () => {
    const staffs = [mkStaff('sta', 'スタッフA', '管理栄養士')];
    const dept   = { shiftTypes: ['日勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { stats } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    // 型確認
    expect(typeof stats.score).toBe('number');
    expect(typeof stats.hardViolationCount).toBe('number');
    expect(typeof stats.softViolationCount).toBe('number');
    // coverageRules なし・シフト未配置 → Hard違反なし
    expect(stats.hardViolationCount).toBe(0);
    // score は null でなく 0 以上の数値
    expect(stats.score).toBeGreaterThanOrEqual(0);
  });

  // ── Test 3: roleAllowedShifts — 補助スタッフに早番が入らない ─────────────
  test('roleAllowedShifts: Phase3配置で補助スタッフに早番が割り当てられない', () => {
    // 2つの coverageRules を設定:
    //   07:00-09:00 gap → coveringShifts=['早番']（早番のみカバー）
    //   16:00-18:00 gap → coveringShifts=['日勤']（日勤のみカバー、早番は16:00終了で対象外）
    // stb（補助）は日勤のみ許可 → 早番 gap は sta が埋め、日勤 gap は stb が埋める
    const staffs = [
      mkStaff('sta', 'スタッフA', '管理栄養士'),
      mkStaff('stb', 'スタッフB', '補助'),
    ];
    const dept = {
      shiftTypes:    ['早番', '日勤'],
      roleShiftTypes: { '補助': ['日勤'] },
      coverageRules: [
        { start: '07:00', end: '09:00', min: 1 }, // 早番のみカバー
        { start: '16:00', end: '18:00', min: 1 }, // 日勤のみカバー
      ],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { shifts } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    // stb に早番が配置されていないこと
    const stbValues = Object.values(shifts['stb']);
    expect(stbValues.every(sk => sk !== '早番')).toBe(true);

    // stb が実際に日勤で配置されていること（Coverage駆動で配置が起きた確認）
    expect(stbValues.some(sk => sk === '日勤')).toBe(true);

    // sta が早番で配置されていること（役職無制限 = 早番 gap を担当）
    expect(Object.values(shifts['sta']).some(sk => sk === '早番')).toBe(true);
  });

  // ── Test 4: 出力フォーマット確認 ─────────────────────────────────────────
  test('出力は shifts / relaxationLog / infeasible / stats の4フィールドを持つ', () => {
    const staffs   = [mkStaff('sta', 'A', '管理栄養士')];
    const dept     = { shiftTypes: ['日勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const result = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    expect(result).toHaveProperty('shifts');
    expect(result).toHaveProperty('relaxationLog');
    expect(result).toHaveProperty('infeasible');
    expect(result).toHaveProperty('stats');
    expect(Array.isArray(result.relaxationLog)).toBe(true);
    expect(Array.isArray(result.infeasible)).toBe(true);
  });

  // ── Test 5: Coverage駆動でシフトが生成され infeasible に記録される ────────
  test('coverageRules あり: gap が埋まり infeasible は配列で返る', () => {
    const staffs = [mkStaff('sta', 'A', '管理栄養士')];
    const dept = {
      shiftTypes: ['早番', '日勤'],
      coverageRules: [{ start: '07:00', end: '09:00', min: 1 }],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { shifts, infeasible } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    // sta が早番でカバーされているはず（coveringShifts=['早番']、sta は制限なし）
    expect(shifts['sta'][1]).toBe('早番');
    // infeasible は配列（今回は sta が全日カバーするので 0 件）
    expect(Array.isArray(infeasible)).toBe(true);
    expect(infeasible).toHaveLength(0);
  });
});
