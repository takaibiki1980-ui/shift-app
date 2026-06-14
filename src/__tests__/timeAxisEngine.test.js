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

  // ─────────────────────────────────────────────────────────────────────────
  // Step 12: Relaxation テスト
  // ─────────────────────────────────────────────────────────────────────────

  // ── Test 14: relaxationLog は配列として返る ───────────────────────────────
  test('Step12: relaxationLog は配列として返る', () => {
    const staffs = [mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 })];
    const dept = { shiftTypes: ['日勤'], coverageRules: [] };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { relaxationLog } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    expect(Array.isArray(relaxationLog)).toBe(true);
  });

  // ── Test 15: Soft制約の緩和不要な場合 relaxationLog は空 ─────────────────
  test('Step12: Soft制約の緩和なしで配置できる場合 relaxationLog は空', () => {
    // 1スタッフ・kyukoDays=0・maxStaff/maxConsecutive 等の制約なし
    // → canPlace(relaxedIds=[]) が常に通過 → relaxation 不要
    const staffs = [mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 })];
    const dept = {
      shiftTypes: ['日勤'],
      coverageRules: [{ start: '09:00', end: '18:00', min: 1 }],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { relaxationLog, infeasible } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    expect(relaxationLog).toHaveLength(0);
    expect(infeasible).toHaveLength(0);
  });

  // ── Test 16: 全スタッフが休みで relaxation も失敗 → infeasible ───────────
  test('Step12: 全スタッフが休みのため relaxation も失敗し infeasible に記録される', () => {
    // 7月=31日。kyukoDays=31 で Phase1 が全日を '休み' にする。
    // Phase3 は全スタッフが既配置（'休み'）のため配置不可 → infeasible
    const staffs = [mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 31 })];
    const dept = {
      shiftTypes: ['日勤'],
      coverageRules: [{ start: '09:00', end: '18:00', min: 1 }],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { relaxationLog, infeasible } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    }, { trials: 1 });

    expect(infeasible.length).toBeGreaterThan(0);
    expect(relaxationLog).toHaveLength(0);
  });

  // ── Test 17: maxStaff(Soft) が初期探索をブロック → relaxation で配置 ──────
  test('Step12: maxStaff Soft 制約を Relaxation で緩和して配置し relaxationLog が非空になる', () => {
    // 2スタッフ・min:2 カバレッジ・maxStaff={日勤:1}(Soft)
    // Phase2: 1スタッフ配置（getCandidates=Hard-only なので maxStaff は無視）
    // Phase3 初期探索: 2人目は maxStaff で blocked → relaxation で 'maxStaff' を解除 → 配置成功
    const staffs = [
      mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 }),
      mkStaff('stb', 'B', '調理師',     { kyukoDays: 0 }),
    ];
    const dept = {
      shiftTypes: ['日勤'],
      coverageRules: [{ start: '09:00', end: '18:00', min: 2 }],
      maxStaff: { 日勤: 1 },
      // maxStaffRelaxable デフォルト true → Soft 扱い
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { relaxationLog, infeasible } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    }, { trials: 1 });

    // relaxation が発動して全日配置できた
    expect(relaxationLog.length).toBeGreaterThan(0);
    expect(infeasible).toHaveLength(0);

    // 各エントリに必須フィールドが揃っている
    const entry = relaxationLog[0];
    expect(entry).toHaveProperty('date');
    expect(entry).toHaveProperty('relaxedIds');
    expect(entry).toHaveProperty('staffId');
    expect(entry).toHaveProperty('shiftKey');

    // maxStaff が緩和対象に含まれている
    expect(entry.relaxedIds).toContain('maxStaff');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 12.5: Relaxation 統計テスト
  // ─────────────────────────────────────────────────────────────────────────

  // ── Test 18: 緩和不要なら relaxationCount=0, breakdown={} ─────────────────
  test('Step12.5: 緩和不要な場合 stats.relaxationCount===0 かつ breakdown が空', () => {
    const staffs = [mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 })];
    const dept = {
      shiftTypes: ['日勤'],
      coverageRules: [{ start: '09:00', end: '18:00', min: 1 }],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { stats } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    expect(stats.relaxationCount).toBe(0);
    expect(stats.relaxationBreakdown).toEqual({});
  });

  // ── Test 19: maxStaff 緩和 → stats.relaxationCount が非ゼロ ───────────────
  test('Step12.5: maxStaff 緩和成功ケースで stats.relaxationCount > 0 になる', () => {
    const staffs = [
      mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 }),
      mkStaff('stb', 'B', '調理師',     { kyukoDays: 0 }),
    ];
    const dept = {
      shiftTypes: ['日勤'],
      coverageRules: [{ start: '09:00', end: '18:00', min: 2 }],
      maxStaff: { 日勤: 1 },
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { stats } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    }, { trials: 1 });

    expect(stats.relaxationCount).toBeGreaterThan(0);
    expect(typeof stats.relaxationBreakdown).toBe('object');
    expect(stats.relaxationBreakdown).toHaveProperty('maxStaff');
  });

  // ── Test 20: breakdown の集計が relaxationLog と完全一致する ─────────────
  test('Step12.5: relaxationBreakdown が relaxationLog.relaxedIds の集計と一致する', () => {
    const staffs = [
      mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 0 }),
      mkStaff('stb', 'B', '調理師',     { kyukoDays: 0 }),
    ];
    const dept = {
      shiftTypes: ['日勤'],
      coverageRules: [{ start: '09:00', end: '18:00', min: 2 }],
      maxStaff: { 日勤: 1 },
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { relaxationLog, stats } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    }, { trials: 1 });

    // breakdown は relaxationLog の relaxedIds を集計したものと一致するはず
    const expected = {};
    for (const entry of relaxationLog) {
      for (const id of entry.relaxedIds) {
        expected[id] = (expected[id] ?? 0) + 1;
      }
    }
    expect(stats.relaxationBreakdown).toEqual(expected);

    // maxStaff は全 relaxation イベントで必ず含まれる（最後に解除される）
    expect(stats.relaxationBreakdown.maxStaff).toBe(stats.relaxationCount);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 13.1: Phase1 公休アンカー 同日集中バグ修正テスト
  // ─────────────────────────────────────────────────────────────────────────

  // ── Test 21: learnedTrend=null でも全員休みの日が発生しない ──────────────
  test('Step13.1: 3名・kyukoDays=8・learnedTrend=null で全員休みの日がなくなる', () => {
    const staffs = [
      mkStaff('sta', 'A', '管理栄養士', { kyukoDays: 8 }),
      mkStaff('stb', 'B', '調理師',     { kyukoDays: 8 }),
      mkStaff('stc', 'C', '調理補助',   { kyukoDays: 8 }),
    ];
    const dept = {
      shiftTypes:    ['早番', '日勤'],
      roleShiftTypes: { '調理補助': ['日勤'] },
      coverageRules: [
        { start: '07:00', end: '09:00', min: 1 },
        { start: '09:00', end: '18:00', min: 1 },
      ],
    };
    const requests = buildRequests(staffs, YEAR, MONTH);

    const { shifts, stats } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    }, { trials: 1 });

    // 全員休みの日がないこと
    const REST_SET = new Set(['休み', '希望休', '有休', '公休', '明け']);
    const allRestDays = [];
    for (let d = 1; d <= 31; d++) {
      if (staffs.every(s => REST_SET.has(shifts[s.id][d]))) allRestDays.push(d);
    }
    expect(allRestDays).toHaveLength(0);

    // stats に maxRestPerDay / minRestPerDay が含まれること
    expect(typeof stats.maxRestPerDay).toBe('number');
    expect(typeof stats.minRestPerDay).toBe('number');
    // 最大でも全員同日休みにはならない（staffs.length 未満）
    expect(stats.maxRestPerDay).toBeLessThan(staffs.length);
  });

  // ── Test 22: roleShiftTypes Hard制約 — カスタムシフト含む完全禁止テスト ───
  test('roleShiftTypes Hard: 栄養士(日勤のみ)設定時にA/B/C/早番/遅番が1件も生成されない', () => {
    // 栄養科を想定: 早番・日勤・遅番 に加えカスタムシフト A/B/C が存在する
    // 栄養士ロールは '日勤' のみ許可。A/B/C/早番/遅番 は割り当て不可。
    const dept = {
      id: 'eiyoka',
      shiftTypes: ['早番', '日勤', '遅番', 'A', 'B', 'C'],
      roleShiftTypes: { '栄養士': ['日勤'] },
      coverageRules: [
        { start: '07:00', end: '09:00', min: 1 },   // 早番/A のみカバー → 栄養士は不可
        { start: '09:00', end: '18:00', min: 3 },   // 全シフト区間 → 多人数必要
        { start: '18:00', end: '21:00', min: 1 },   // 遅番/C のみカバー → 栄養士は不可
      ],
      customShiftDefs: [
        { key: 'A', baseType: '早番', startTime: '07:00', endTime: '16:00' },
        { key: 'B', baseType: '日勤', startTime: '09:00', endTime: '18:00' },
        { key: 'C', baseType: '遅番', startTime: '12:00', endTime: '21:00' },
      ],
    };
    const staffs = [
      mkStaff('eiy1', '栄養士A', '栄養士'),    // 日勤のみ許可
      mkStaff('cho1', '調理師A', '調理師'),    // 制限なし
      mkStaff('cho2', '調理師B', '調理師'),    // 制限なし
      mkStaff('cho3', '調理師C', '調理師'),    // 制限なし
      mkStaff('cho4', '調理師D', '調理師'),    // 制限なし
    ];
    const requests = buildRequests(staffs, YEAR, MONTH);
    const days = new Date(YEAR, MONTH + 1, 0).getDate(); // 31日

    const { shifts } = generateTimeAxisShift({
      dept, staffs, requests, learnedTrend: null, prevTail: {}, year: YEAR, month: MONTH,
    });

    const FORBIDDEN = new Set(['早番', '遅番', 'A', 'B', 'C']);
    const violations = [];
    for (let d = 1; d <= days; d++) {
      const shift = shifts['eiy1']?.[d];
      if (shift && FORBIDDEN.has(shift)) {
        violations.push(`${d}日: ${shift}`);
      }
    }

    expect(violations).toHaveLength(0);
    // violations がある場合に詳細を出す
    if (violations.length > 0) {
      console.error('栄養士A に禁止シフトが割り当てられた:', violations);
    }
  });
});
