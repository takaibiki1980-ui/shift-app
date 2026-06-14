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
import { generateTimeAxisShift, buildPreferredRestDays } from '../lib/timeAxisEngine/index.js';
import { buildRequests } from '../lib/shiftAccessors.js';

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

  // ── Test 2: validateShift 接続 → stats（Step 11c 形式） ──────────────────
  test('validateShift が実行され stats の各フィールドが正しく返る', () => {
    const staffs = [mkStaff('sta', 'スタッフA', '管理栄養士')];
    const dept   = { shiftTypes: ['日勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { stats } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    // 型確認（Step 11c stats 形式）
    expect(typeof stats.trials).toBe('number');
    expect(typeof stats.bestScore).toBe('number');
    expect(typeof stats.bestHardViolationCount).toBe('number');
    expect(typeof stats.allTrialsInvalid).toBe('boolean');
    // coverageRules なし → Hard 違反なし
    expect(stats.bestHardViolationCount).toBe(0);
    // bestScore は 0 以上の数値
    expect(stats.bestScore).toBeGreaterThanOrEqual(0);
    // options 未指定 → デフォルト 10 試行
    expect(stats.trials).toBe(10);
    expect(stats.allTrialsInvalid).toBe(false);
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
    // kyukoDays: 0 で Phase1 が休みを置かないようにし、全日カバー可能にする
    const staffs = [mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 })];
    const dept = {
      shiftTypes: ['早番', '日勤'],
      coverageRules: [{ start: '07:00', end: '09:00', min: 1 }],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { shifts, infeasible } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    // sta が早番でカバーされているはず（Phase2/3 が配置）
    expect(shifts['sta'][1]).toBe('早番');
    // infeasible は配列（sta が全日カバーするので 0 件）
    expect(Array.isArray(infeasible)).toBe(true);
    expect(infeasible).toHaveLength(0);
  });

  // ── Test 6: Phase 1 — 公休アンカー ───────────────────────────────────────
  test('Phase1: kyukoDays=5 のスタッフに最低5日の公休が配置される', () => {
    const staffs = [mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 5 })];
    const dept = { shiftTypes: ['日勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { shifts } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    const REST_SET = new Set(['休み', '希望休', '有休', '公休', '明け']);
    const restCount = Object.values(shifts['sta']).filter(sk => REST_SET.has(sk)).length;
    expect(restCount).toBeGreaterThanOrEqual(5);
  });

  // ── Test 7: buildPreferredRestDays — DOW 傾向で優先順位が決まる ───────────
  test('buildPreferredRestDays: dowRestRate が高い曜日の日が先頭に並ぶ', () => {
    const staff = mkStaff('sta', 'スタッフA', '管理栄養士');
    // idx=0 (月曜) の rate を最高にする（dowRestRate: [月,火,水,木,金,土,日]）
    const learnedTrend = {
      'スタッフA': { dowRestRate: [0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] },
    };

    const days = buildPreferredRestDays(staff, learnedTrend, 2026, 6); // 2026年7月

    // 2026年7月の月曜日: 6, 13, 20, 27 が先頭4件に来るはず
    const top4 = days.slice(0, 4);
    expect(top4).toContain(6);
    expect(top4).toContain(13);
    expect(top4).toContain(20);
    expect(top4).toContain(27);
    // 全日分の長さ（7月=31日）
    expect(days).toHaveLength(31);
  });

  // ── Test 8: Phase 2 — MRV でキーパーソンが先に配置される ────────────────
  test('Phase2: eligible が少ない gap が先に処理され制約スタッフが正しく配置される', () => {
    // 07:00-09:00 gap は sta のみが埋められる（eligible=1、MRV で最優先）
    // 09:00-18:00 gap は両者が埋められる（eligible=2）
    // kyukoDays=0 で Phase1 の休み干渉なし
    const staffs = [
      mkStaff('sta', 'スタッフA', '管理栄養士', { kyukoDays: 0 }),
      mkStaff('stb', 'スタッフB', '補助',       { kyukoDays: 0 }),
    ];
    const dept = {
      shiftTypes: ['早番', '日勤'],
      roleShiftTypes: { '補助': ['日勤'] },
      coverageRules: [
        { start: '07:00', end: '09:00', min: 1 },
        { start: '09:00', end: '18:00', min: 1 },
      ],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { shifts } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    // sta が早番に配置される（07:00-09:00 gap を sta のみが埋められる）
    expect(Object.values(shifts['sta']).some(sk => sk === '早番')).toBe(true);
    // stb に早番が入らない（roleShiftTypes で禁止）
    expect(Object.values(shifts['stb']).every(sk => sk !== '早番')).toBe(true);
    // stb が日勤に配置される（09:00-18:00 gap を stb が埋める）
    expect(Object.values(shifts['stb']).some(sk => sk === '日勤')).toBe(true);
  });

  // ── Test 9: Phase 4 — Coverage 後に公休が充足される ─────────────────────
  test('Phase4: 2スタッフ・coverageRules あり・kyukoDays=8 が両者で充足される', () => {
    const staffs = [
      mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 8 }),
      mkStaff('stb', 'B', '調理師',     { kyukoDays: 8 }),
    ];
    const dept = {
      shiftTypes: ['日勤'],
      coverageRules: [{ start: '09:00', end: '18:00', min: 1 }],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { shifts } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    const REST_SET = new Set(['休み', '希望休', '有休', '公休', '明け']);
    const staRest = Object.values(shifts['sta']).filter(sk => REST_SET.has(sk)).length;
    const stbRest = Object.values(shifts['stb']).filter(sk => REST_SET.has(sk)).length;
    expect(staRest).toBeGreaterThanOrEqual(8);
    expect(stbRest).toBeGreaterThanOrEqual(8);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 11c: bestOfN テスト
  // ─────────────────────────────────────────────────────────────────────────

  // ── Test 10: trials パラメータが stats.trials に反映される ───────────────
  test('bestOfN: options.trials=5 を渡すと stats.trials===5 が返る', () => {
    const staffs = [mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 })];
    const dept = { shiftTypes: ['日勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { stats } = generateTimeAxisShift(
      { dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH },
      { trials: 5 },
    );

    expect(stats.trials).toBe(5);
    expect(typeof stats.bestScore).toBe('number');
    expect(stats.bestHardViolationCount).toBe(0);
    expect(stats.allTrialsInvalid).toBe(false);
  });

  // ── Test 11: score 最小解が採用される ────────────────────────────────────
  test('bestOfN: 違反ゼロのシナリオで bestScore===0 が返る（最良解選択の確認）', () => {
    // kyukoDays=0・coverage なし → 何もシフト配置されない → Soft 違反ゼロ → score=0
    // 全試行がこのスコアになるため、bestOfN の「最小選択」が安定して検証できる
    const staffs = [mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 })];
    const dept = { shiftTypes: ['日勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { stats } = generateTimeAxisShift(
      { dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH },
      { trials: 10 },
    );

    expect(stats.bestScore).toBe(0);
    expect(stats.trials).toBe(10);
    expect(stats.allTrialsInvalid).toBe(false);
  });

  // ── Test 12: valid 試行が Hard 違反あり試行より優先される ─────────────────
  test('bestOfN: valid 試行が存在する場合 bestHardViolationCount===0 が採用される', () => {
    // 通常の生成では Hard 違反が発生しない設定で、
    // "valid が優先される" ロジックを allTrialsInvalid=false で間接確認する
    const staffs = [
      mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 }),
      mkStaff('stb', 'B', '補助',       { kyukoDays: 0 }),
    ];
    const dept = {
      shiftTypes: ['早番', '日勤'],
      roleShiftTypes: { '補助': ['日勤'] },
      coverageRules: [{ start: '07:00', end: '09:00', min: 1 }],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { stats } = generateTimeAxisShift(
      { dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH },
      { trials: 5 },
    );

    // Hard 違反ゼロの試行が存在する → allTrialsInvalid=false & bestHardViolationCount=0
    expect(stats.allTrialsInvalid).toBe(false);
    expect(stats.bestHardViolationCount).toBe(0);
  });

  // ── Test 13: 全試行 Hard 違反 → allTrialsInvalid=true ────────────────────
  test('bestOfN: 全試行で Hard 違反が発生する場合 allTrialsInvalid===true になる', () => {
    // 夜勤(30日) → 早番(31日) は nightSetPattern hard 違反
    // Phase0 で両日がロックされるため、全試行で hard 違反が確実に発生する
    const staffs = [
      mkStaff('sta', 'スタッフA', '管理栄養士', {
        shiftRequestsByMonth: { '2026-7': { '30': '夜勤', '31': '早番' } },
      }),
    ];
    const dept = { shiftTypes: ['早番', '夜勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { stats } = generateTimeAxisShift(
      { dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH },
      { trials: 3 },
    );

    expect(stats.allTrialsInvalid).toBe(true);
    expect(stats.bestHardViolationCount).toBeGreaterThan(0);
    expect(stats.trials).toBe(3);
  });
});
