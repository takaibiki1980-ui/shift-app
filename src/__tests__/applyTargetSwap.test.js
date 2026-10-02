import { describe, test, expect } from 'vitest';
import { applyTargetSwap } from '../engine/core.js';

// 2026年12月8日は火曜(getDay()===2)
const Y = 2026, M = 11, TUE = 8, DAYS = 31;
const sugi = { id: 'sugi', name: '杉本', dept: 'k', role: '常勤' };
const kawa = { id: 'kawa', name: '川田', dept: 'k', role: '常勤' };
const ds = [sugi, kawa];
// 学習: 杉本=火曜 早39%/遅61%, 川田=火曜 早63%/遅37%
const TREND = {
  '杉本': { dowShiftRate: { 2: { 早番: 0.39, 遅番: 0.61 } } },
  '川田': { dowShiftRate: { 2: { 早番: 0.63, 遅番: 0.37 } } },
};
const baseDept = (over = {}) => ({
  id: 'k', shiftTypes: ['早番', '遅番'], minStaff: { 早番: 1, 遅番: 1 }, maxStaff: { 早番: 1, 遅番: 1 },
  allowLateToEarly: true, targetSwapEnabled: true, ...over,
});
const emptyRes = () => ({ sugi: {}, kawa: {} });

describe('applyTargetSwap（生成後ペア交換パス）', () => {
  test('交換される: 火曜に杉本=早/川田=遅 → 学習に合わせ 杉本=遅/川田=早', () => {
    const res = emptyRes(); res.sugi[TUE] = '早番'; res.kawa[TUE] = '遅番';
    applyTargetSwap(res, ds, baseDept(), DAYS, {}, Y, M, TREND);
    expect(res.sugi[TUE]).toBe('遅番');
    expect(res.kawa[TUE]).toBe('早番');
  });

  test('学習ゲインが無い（既に最適）なら交換しない', () => {
    const res = emptyRes(); res.sugi[TUE] = '遅番'; res.kawa[TUE] = '早番';
    applyTargetSwap(res, ds, baseDept(), DAYS, {}, Y, M, TREND);
    expect(res.sugi[TUE]).toBe('遅番'); // 据え置き
    expect(res.kawa[TUE]).toBe('早番');
  });

  test('公平性超過なら交換しない（早番総数の偏りが許容幅3を超える）', () => {
    const res = emptyRes();
    // 川田が他の4日で早番(相手なし=スキップ) → earlyCounts 川田4/杉本1
    for (const d of [1, 2, 3, 4]) res.kawa[d] = '早番';
    res.sugi[TUE] = '早番'; res.kawa[TUE] = '遅番'; // 交換すると 杉本0/川田5 → spread5>3
    applyTargetSwap(res, ds, baseDept(), DAYS, {}, Y, M, TREND);
    expect(res.sugi[TUE]).toBe('早番'); // 公平性ガードで据え置き
    expect(res.kawa[TUE]).toBe('遅番');
  });

  test('ロックされたセルは交換しない（個別希望優先）', () => {
    const res = emptyRes(); res.sugi[TUE] = '早番'; res.kawa[TUE] = '遅番';
    applyTargetSwap(res, ds, baseDept(), DAYS, { sugi: new Set([TUE]) }, Y, M, TREND);
    expect(res.sugi[TUE]).toBe('早番');
    expect(res.kawa[TUE]).toBe('遅番');
  });

  test('遷移ルールに触れるなら交換しない（allowLateToEarly OFFで遅番→早番が生じる）', () => {
    const res = emptyRes();
    res.sugi[TUE] = '早番'; res.kawa[TUE] = '遅番';
    res.sugi[TUE + 1] = '早番'; // 交換で杉本が遅番→(翌日)早番 = 禁止遷移
    applyTargetSwap(res, ds, baseDept({ allowLateToEarly: false }), DAYS, {}, Y, M, TREND);
    expect(res.sugi[TUE]).toBe('早番'); // 遷移整合ガードで据え置き
    expect(res.kawa[TUE]).toBe('遅番');
  });

  test('transitionForces を破る交換はしない', () => {
    const res = emptyRes();
    res.sugi[TUE - 1] = '休み';        // 前日=休み
    res.sugi[TUE] = '早番'; res.kawa[TUE] = '遅番';
    // 強制: 休み→早番（杉本の前日が休みなので当日は早番でなければならない）→ 杉本を遅番にする交換は違反
    applyTargetSwap(res, ds, baseDept({ transitionForces: [{ from: '休み', to: '早番' }] }), DAYS, {}, Y, M, TREND);
    expect(res.sugi[TUE]).toBe('早番'); // 強制違反ガードで据え置き
    expect(res.kawa[TUE]).toBe('遅番');
  });

  test('dept.targetSwapEnabled でなければ no-op', () => {
    const res = emptyRes(); res.sugi[TUE] = '早番'; res.kawa[TUE] = '遅番';
    applyTargetSwap(res, ds, baseDept({ targetSwapEnabled: false }), DAYS, {}, Y, M, TREND);
    expect(res.sugi[TUE]).toBe('早番');
    expect(res.kawa[TUE]).toBe('遅番');
  });
});
