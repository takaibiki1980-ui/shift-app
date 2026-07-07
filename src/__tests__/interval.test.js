/**
 * インターバル判定 回帰テスト（設計①）
 *
 * 背景: インターバル設定（intervalEnabled/intervalTargetShifts/intervalHours）を
 *       全エンジンで開放したが、介護エンジン（core.js）側でそれが正しく効くことの
 *       回帰テストが皆無だった。本ファイルはその空白を埋める。
 *
 * インターバル判定ロジックは core.js の3経路に重複実装されている:
 *   - isBadTransition（L126・トップレベル純粋関数）
 *   - scoreShifts 内インライン（L2045・違反に +100）
 *   - localSearchImprove 内 badTrans（L2179・違反スワップを拒否）
 * 本テストは3経路すべてを対象にする。
 *
 * DEFAULT_SHIFT_TIMES に基づく検証済み時間差:
 *   遅番(終20:30) → 早番(始07:00) = 10.5h  (< 11 → 違反)
 *   日勤(終18:00) → 早番(始07:00) = 13.0h  (>= 11 → 非違反)
 *   早番(終16:00) → 早番(始07:00) = 15.0h  (>= 11 → 非違反)
 */
import { describe, test, expect } from 'vitest';
import {
  isBadTransition,
  buildNightSet,
  scoreShifts,
  localSearchImprove,
} from '../engine/core.js';

const YEAR = 2026, MONTH = 0;

// インターバル有効・対象=早番・11時間・shiftTimes未設定（DEFAULT使用）
const deptOn = {
  id: 'eiyo',
  shiftTypes: ['早番', '日勤', '遅番'],
  customShiftDefs: [],
  intervalEnabled: true,
  intervalTargetShifts: ['早番'],
  intervalHours: 11,
  maxConsecutive: 5,
};

// インターバル無効（フラグでゲートされることの確認用）
const deptOff = { ...deptOn, intervalEnabled: false };

// カスタム勤務時間: 遅番の終業を12:00に前倒し → 遅番→早番 = 19h（非違反）
const deptCustomTimes = {
  ...deptOn,
  shiftTimes: { '遅番': { start: '03:00', end: '12:00' } },
};

// ────────────────────────────────────────────────────────────────
// 1. isBadTransition 直接（5ケース）
// ────────────────────────────────────────────────────────────────
describe('isBadTransition：インターバル判定', () => {
  const nightSet = buildNightSet(deptOn); // 夜勤なし → 空Set

  test('遅番→早番（10.5h < 11h）→ 違反true', () => {
    expect(isBadTransition('遅番', '早番', deptOn, nightSet)).toBe(true);
  });

  test('日勤→早番（13h >= 11h）→ 非違反false（インターバル分岐が従来の日勤→早番禁止を上書き）', () => {
    // 従来の文字ルールでは 日勤→早番 は違反だが、intervalTargetShifts に早番が
    // 含まれるためインターバル分岐に入り、13h >= 11h で false になる
    expect(isBadTransition('日勤', '早番', deptOn, nightSet)).toBe(false);
  });

  test('遅番→日勤（currが対象外）→ インターバル分岐を通らず従来の文字ルールにフォールバック（true）', () => {
    // intervalTargetShifts=['早番'] に日勤は含まれない → 従来ルール: 遅番→日勤 は違反
    expect(isBadTransition('遅番', '日勤', deptOn, nightSet)).toBe(true);
  });

  test('intervalEnabled:false → 従来ルールのみ（回帰：開放前と同挙動）', () => {
    const nightSetOff = buildNightSet(deptOff);
    // フラグOFFなら intervalTargetShifts があってもインターバル分岐に入らない。
    // 日勤→早番 は従来の文字ルールで違反 → true（deptOnのcase2ではfalseだった）
    expect(isBadTransition('日勤', '早番', deptOff, nightSetOff)).toBe(true);
    // 早番→日勤 は従来ルールでも非違反 → false
    expect(isBadTransition('早番', '日勤', deptOff, nightSetOff)).toBe(false);
  });

  test('shiftTimes未設定時はDEFAULT_SHIFT_TIMESで時間差計算される', () => {
    // shiftTimes未設定のdeptOn: 遅番→早番=10.5h（DEFAULT）→ 違反true
    expect(isBadTransition('遅番', '早番', deptOn, nightSet)).toBe(true);
    // shiftTimesで遅番終業を12:00に上書きしたdeptCustomTimes: 遅番→早番=19h → 非違反false
    const nightSetCustom = buildNightSet(deptCustomTimes);
    expect(isBadTransition('遅番', '早番', deptCustomTimes, nightSetCustom)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// 2. scoreShifts 経由（2ケース）— インターバル違反に +100
// ────────────────────────────────────────────────────────────────
describe('scoreShifts：インターバル違反ペナルティ(+100)', () => {
  // 公休0・minStaffなしのシンプル構成でペナルティを分離
  const scoreDept = {
    id: 'eiyo',
    shiftTypes: ['早番', '日勤', '遅番'],
    customShiftDefs: [],
    intervalEnabled: true,
    intervalTargetShifts: ['早番'],
    intervalHours: 11,
    minStaff: {},
    maxConsecutive: 5,
  };
  const scoreDeptOff = { ...scoreDept, intervalEnabled: false };
  const staff = [{ id: 'p1', name: 'P1', role: '職員', kyukoDays: 0, kyukoDaysByMonth: {} }];
  const DAYS = 2;

  test('インターバル違反列（遅番→早番）はスコアに +100 が乗る', () => {
    // 違反列: day1=遅番, day2=早番 → 10.5h < 11h で +100
    const violation = { p1: { 1: '遅番', 2: '早番' } };
    // 非違反列: day1=遅番, day2=遅番 → 遅番→遅番 は非違反（+0）
    const clean = { p1: { 1: '遅番', 2: '遅番' } };
    // day1が同一・day2のみ違い（両者とも勤務シフト・公休0・同一シフト連続ペナルティ閾値未満）
    // → 差分はインターバルペナルティ +100 のみ
    const sViolation = scoreShifts(violation, staff, scoreDept, DAYS, YEAR, MONTH, {});
    const sClean = scoreShifts(clean, staff, scoreDept, DAYS, YEAR, MONTH, {});
    expect(sViolation - sClean).toBe(100);
  });

  test('違反なし列には +100 が乗らない（intervalEnabledの有無で同一スコア）', () => {
    // 非違反列は intervalEnabled の ON/OFF でスコアが変わらない
    // = クリーンな列にインターバルペナルティが乗っていない証明
    const clean = { p1: { 1: '遅番', 2: '遅番' } };
    const sOn = scoreShifts(clean, staff, scoreDept, DAYS, YEAR, MONTH, {});
    const sOff = scoreShifts(clean, staff, scoreDeptOff, DAYS, YEAR, MONTH, {});
    expect(sOn).toBe(sOff);
  });
});

// ────────────────────────────────────────────────────────────────
// 3. localSearchImprove 経由（1ケース）— 違反スワップの拒否
// ────────────────────────────────────────────────────────────────
describe('localSearchImprove：インターバル違反を生むスワップは拒否', () => {
  const lsDept = {
    id: 'eiyo',
    shiftTypes: ['早番', '日勤', '遅番'],
    customShiftDefs: [],
    intervalEnabled: true,
    intervalTargetShifts: ['早番'],
    intervalHours: 11,
    minStaff: {},
    maxStaff: { 早番: 1, 遅番: 1, 日勤: 99 },
    maxConsecutive: 5,
  };
  const emptyLock = { kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} };

  test('スワップすると遅番→早番が生じる組合せ → スワップされず元シフトが保持される', () => {
    // s1 は全日 遅番、s2 は全日 早番。
    // day1/day2 いずれのスワップも、遅番の翌日に早番を作る（10.5h<11hのインターバル違反）
    // ため badTrans ガードで拒否される → 出力は入力と同一。
    const ds = [
      { id: 's1', name: 'S1', role: '職員', kyukoDays: 0, kyukoDaysByMonth: {}, ...emptyLock },
      { id: 's2', name: 'S2', role: '職員', kyukoDays: 0, kyukoDaysByMonth: {}, ...emptyLock },
    ];
    const shifts = {
      s1: { 1: '遅番', 2: '遅番' },
      s2: { 1: '早番', 2: '早番' },
    };
    const result = localSearchImprove(shifts, ds, lsDept, 2, YEAR, MONTH, {});

    // 元シフトが保持されている（違反を生むスワップが実行されていない）
    expect(result.s1[1]).toBe('遅番');
    expect(result.s1[2]).toBe('遅番');
    expect(result.s2[1]).toBe('早番');
    expect(result.s2[2]).toBe('早番');

    // 念のため：どのスタッフにも 遅番→早番 の違反隣接が生じていない
    for (const id of ['s1', 's2']) {
      for (let d = 2; d <= 2; d++) {
        const bad = result[id][d - 1] === '遅番' && result[id][d] === '早番';
        expect(bad).toBe(false);
      }
    }
  });
});
