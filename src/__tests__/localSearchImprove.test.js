/**
 * localSearchImprove swap改善ロジック 回帰テスト（設計④）
 *
 * localSearchImprove は完全に決定論的（Math.random なし・同じ入力→必ず同じ出力）で
 * あることをコードで確認済み。よって②のようなランダム性起因のフレーキー問題はない。
 *
 * 検証する不変条件（すべて実挙動をコードで確認済み・推測なし）:
 *   1. swap改善: 改善余地のある構成では適用後スコア <= 入力スコア（かつ本ケースでは厳密改善）
 *   2. 無駄な変更なし: 既に最適(score0)なら入力と同一シフトを返す
 *   3. FIXED保護: 希望休/有休/夜勤/明け のセルはswap対象外で保持
 *   4. ロック日保護: kibo/yukyu/shiftRequests で固定された日はswapされない
 *   5. 早期return: ds.length < 2 のとき入力をそのまま（同一参照で）返す
 *
 * 本体コード変更・export追加は一切なし（既存export localSearchImprove のみ使用）。
 */
import { describe, test, expect } from 'vitest';
import { localSearchImprove, scoreShifts, monthKey } from '../engine/core.js';

const Y = 2026, M = 0;
const mk = monthKey(Y, M);
const dept = {
  shiftTypes: ['早番', '日勤', '遅番'],
  customShiftDefs: [],
  maxConsecutive: 5,
  minStaff: {},
  maxStaff: { 早番: 1, 日勤: 99, 遅番: 1 },
};
function mkStaff(over) {
  return { id: 'x', name: 'x', role: '職員', kyukoDays: 0, kyukoDaysByMonth: {}, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {}, ...over };
}

// ────────────────────────────────────────────────────────────────
// 1. swap改善の成立（適用後スコア <= 入力スコア／本ケースは厳密改善）
// ────────────────────────────────────────────────────────────────
describe('1. swap改善: スコアが入力以下になる', () => {
  test('公休不均衡（s1=0休/s2=2休・各目標1）をswapで解消しスコアが下がる', () => {
    const ds = [mkStaff({ id: 's1', name: 'P1', kyukoDays: 1 }), mkStaff({ id: 's2', name: 'P2', kyukoDays: 1 })];
    const shifts = { s1: { 1: '日勤', 2: '日勤', 3: '日勤', 4: '日勤' }, s2: { 1: '休み', 2: '休み', 3: '日勤', 4: '日勤' } };
    const before = scoreShifts(shifts, ds, dept, 4, Y, M, {});
    const result = localSearchImprove(shifts, ds, dept, 4, Y, M, {});
    const after = scoreShifts(result, ds, dept, 4, Y, M, {});

    // 不変条件: 適用後スコアは入力を超えない
    expect(after).toBeLessThanOrEqual(before);
    // 本構成では改善余地があるので厳密に下がる
    expect(after).toBeLessThan(before);

    // 決定論性: 2回実行して同一結果
    const result2 = localSearchImprove(shifts, ds, dept, 4, Y, M, {});
    expect(JSON.stringify(result2)).toBe(JSON.stringify(result));

    // 入力オブジェクトは破壊的変更されない（新しいコピーを返す）
    expect(shifts.s1[1]).toBe('日勤');
  });
});

// ────────────────────────────────────────────────────────────────
// 2. 無駄な変更をしない（既に最適なら入力と同一）
// ────────────────────────────────────────────────────────────────
describe('2. 既に最適(score0)なら無変更', () => {
  test('違反ゼロのシフトはそのまま返る', () => {
    const ds = [mkStaff({ id: 's1', name: 'P1', kyukoDays: 0 }), mkStaff({ id: 's2', name: 'P2', kyukoDays: 0 })];
    const shifts = { s1: { 1: '早番', 2: '日勤' }, s2: { 1: '日勤', 2: '遅番' } };
    const before = scoreShifts(shifts, ds, dept, 2, Y, M, {});
    expect(before).toBe(0); // 前提: 違反ゼロ

    const result = localSearchImprove(shifts, ds, dept, 2, Y, M, {});
    expect(JSON.stringify(result)).toBe(JSON.stringify(shifts));
  });
});

// ────────────────────────────────────────────────────────────────
// 3. FIXEDセルの保護（希望休/有休/夜勤/明け）
// ────────────────────────────────────────────────────────────────
describe('3. FIXEDセル(希望休/有休/夜勤/明け)はswap対象外', () => {
  test('全セルがFIXED種別なら一切swapされず入力と同一', () => {
    const ds = [mkStaff({ id: 's1', name: 'P1' }), mkStaff({ id: 's2', name: 'P2' })];
    // 夜勤・明け・有休・希望休 の4種すべてを配置
    const shifts = { s1: { 1: '夜勤', 2: '明け' }, s2: { 1: '有休', 2: '希望休' } };
    const result = localSearchImprove(shifts, ds, dept, 2, Y, M, {});
    expect(JSON.stringify(result)).toBe(JSON.stringify(shifts));
    // 各FIXEDセルが保持されている
    expect(result.s1[1]).toBe('夜勤');
    expect(result.s1[2]).toBe('明け');
    expect(result.s2[1]).toBe('有休');
    expect(result.s2[2]).toBe('希望休');
  });
});

// ────────────────────────────────────────────────────────────────
// 4. ロック日の保護（kibo/yukyu/shiftRequests）
// ────────────────────────────────────────────────────────────────
describe('4. ロック日はswapされない', () => {
  // 改善swapが day1 のみに存在する構成（day2は希望休FIXEDでブロック）。
  // day1 をロックすると改善swapが実行できず無変更になる（＝ロックが効いている）。
  const shifts = { s1: { 1: '日勤', 2: '日勤' }, s2: { 1: '休み', 2: '希望休' } };

  test('対照: ロックなしなら day1 がswapされ改善する', () => {
    const ds = [mkStaff({ id: 's1', name: 'P1', kyukoDays: 1 }), mkStaff({ id: 's2', name: 'P2', kyukoDays: 1 })];
    const sh = JSON.parse(JSON.stringify(shifts));
    const result = localSearchImprove(sh, ds, dept, 2, Y, M, {});
    expect(result.s1[1]).toBe('休み'); // day1 がswapされた
    expect(result.s2[1]).toBe('日勤');
  });

  test('kiboでday1をロック → 改善swapが拒否され入力と同一（ロック保護）', () => {
    const ds = [mkStaff({ id: 's1', name: 'P1', kyukoDays: 1, kiboByMonth: { [mk]: [1] } }), mkStaff({ id: 's2', name: 'P2', kyukoDays: 1 })];
    const sh = JSON.parse(JSON.stringify(shifts));
    const result = localSearchImprove(sh, ds, dept, 2, Y, M, {});
    expect(JSON.stringify(result)).toBe(JSON.stringify(shifts));
    expect(result.s1[1]).toBe('日勤'); // ロック日は元のまま
  });

  test('yukyuでロックした日もswapされない', () => {
    const ds = [mkStaff({ id: 's1', name: 'P1', kyukoDays: 1, yukyuByMonth: { [mk]: [1] } }), mkStaff({ id: 's2', name: 'P2', kyukoDays: 1 })];
    const sh = JSON.parse(JSON.stringify(shifts));
    const result = localSearchImprove(sh, ds, dept, 2, Y, M, {});
    expect(result.s1[1]).toBe('日勤');
  });

  test('shiftRequestsでロックした日もswapされない', () => {
    const ds = [mkStaff({ id: 's1', name: 'P1', kyukoDays: 1, shiftRequestsByMonth: { [mk]: { 1: '日勤' } } }), mkStaff({ id: 's2', name: 'P2', kyukoDays: 1 })];
    const sh = JSON.parse(JSON.stringify(shifts));
    const result = localSearchImprove(sh, ds, dept, 2, Y, M, {});
    expect(result.s1[1]).toBe('日勤');
  });
});

// ────────────────────────────────────────────────────────────────
// 5. 早期return（ds.length < 2）
// ────────────────────────────────────────────────────────────────
describe('5. ds.length < 2 は入力をそのまま返す', () => {
  test('スタッフ0名 → 入力shiftsを同一参照で返す', () => {
    const shifts = { s1: { 1: '日勤' } };
    const result = localSearchImprove(shifts, [], dept, 1, Y, M, {});
    expect(result).toBe(shifts); // 同一参照
  });

  test('スタッフ1名 → 入力shiftsを同一参照で返す', () => {
    const shifts = { s1: { 1: '日勤' } };
    const result = localSearchImprove(shifts, [mkStaff({ id: 's1', name: 'P1' })], dept, 1, Y, M, {});
    expect(result).toBe(shifts); // 同一参照
  });
});
