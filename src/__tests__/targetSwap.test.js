import { describe, test, expect } from 'vitest';
import {
  swapLearningGain, fairnessOkAfterSwap, shouldSwapPair, DEFAULT_FAIRNESS_TOL,
} from '../lib/targetSwap.js';

describe('swapLearningGain', () => {
  test('交換で学習が上がるケースは正（川田早63%/杉本遅61% に寄せる例）', () => {
    // 現在: 早番=杉本(火曜早39%), 遅番=川田(火曜遅37%) → 交換後: 早番=川田(63%), 遅番=杉本(61%)
    const g = swapLearningGain(0.39, 0.37, 0.61, 0.63);
    expect(g).toBeCloseTo((0.63 + 0.61) - (0.39 + 0.37), 6);
    expect(g).toBeGreaterThan(0);
  });
  test('既に最適なら負（交換すると下がる）', () => {
    const g = swapLearningGain(0.63, 0.61, 0.37, 0.39);
    expect(g).toBeLessThan(0);
  });
  test('同率なら 0', () => {
    expect(swapLearningGain(0.5, 0.5, 0.5, 0.5)).toBe(0);
  });
  test('欠損(undefined)は0扱いで安全', () => {
    expect(swapLearningGain(undefined, undefined, 0.6, 0.6)).toBeCloseTo(1.2, 6);
  });
});

describe('fairnessOkAfterSwap', () => {
  test('交換後の早番回数の広がりが tol 以内なら true', () => {
    // [10,10,10] で idx0(-1)→9, idx1(+1)→11 → spread=2 <= 3
    expect(fairnessOkAfterSwap([10, 10, 10], 0, 1, 3)).toBe(true);
  });
  test('tol を超えると false', () => {
    // [12,9,9] で idx1 が早番-1→8, idx0 が+1→13 → spread=13-8=5 > 3
    expect(fairnessOkAfterSwap([12, 9, 9], 1, 0, 3)).toBe(false);
  });
  test('境界値 spread===tol は true', () => {
    // [11,9,10] → idx0-1=10, idx1+1=10 → [10,10,10] spread0 ; 別例で境界
    // [12,9,10]: idx2(+1)=11, idx1(-1)=8 → [12,8,11] spread=4>3 false
    expect(fairnessOkAfterSwap([12, 9, 10], 1, 2, 3)).toBe(false);
    // spread ちょうど3: [11,9,10] idx1(-1)=8, idx2(+1)=11 → [11,8,11] spread3 → true
    expect(fairnessOkAfterSwap([11, 9, 10], 1, 2, 3)).toBe(true);
  });
  test('既定 tol は 3', () => {
    expect(DEFAULT_FAIRNESS_TOL).toBe(3);
    expect(fairnessOkAfterSwap([10, 10, 10], 0, 1)).toBe(true);
  });
  test('同一index・空配列・null安全／非破壊', () => {
    expect(fairnessOkAfterSwap([1, 2], 0, 0, 3)).toBe(false);
    expect(fairnessOkAfterSwap([], 0, 1, 3)).toBe(true);
    const arr = [10, 10, 10]; fairnessOkAfterSwap(arr, 0, 1, 3);
    expect(arr).toEqual([10, 10, 10]);
  });
});

describe('shouldSwapPair', () => {
  const ok = { gain: 0.5, locked: false, coverageOk: true, transitionOk: true, fairnessOk: true };
  test('全条件OK＋gain>0 → true', () => {
    expect(shouldSwapPair(ok)).toBe(true);
  });
  test('ロックされていれば false（個別優先）', () => {
    expect(shouldSwapPair({ ...ok, locked: true })).toBe(false);
  });
  test('遷移NG → false', () => {
    expect(shouldSwapPair({ ...ok, transitionOk: false })).toBe(false);
  });
  test('カバレッジNG → false', () => {
    expect(shouldSwapPair({ ...ok, coverageOk: false })).toBe(false);
  });
  test('公平性NG → false', () => {
    expect(shouldSwapPair({ ...ok, fairnessOk: false })).toBe(false);
  });
  test('学習が増えない(gain<=0) → false', () => {
    expect(shouldSwapPair({ ...ok, gain: 0 })).toBe(false);
    expect(shouldSwapPair({ ...ok, gain: -0.2 })).toBe(false);
  });
});
