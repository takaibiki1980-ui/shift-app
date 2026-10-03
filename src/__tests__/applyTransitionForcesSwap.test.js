import { describe, test, expect } from 'vitest';
import { applyTransitionForces, applyTargetSwap } from '../engine/core.js';

// res を毎回新規生成
const mk = (obj) => JSON.parse(JSON.stringify(obj));
// 栄養科相当: 常勤3人・早1遅1（min=max=1）・遅番→早番許可・強制 休み→遅番
const ds = [
  { id: 'kawa', name: '川田', role: '常勤' },
  { id: 'sugi', name: '杉本', role: '常勤' },
  { id: 'fuku', name: '福田', role: '常勤' },
];
const eiyo = (over = {}) => ({
  id: 'k', shiftTypes: ['早番', '日勤', '遅番'],
  minStaff: { 早番: 1, 遅番: 1 }, maxStaff: { 早番: 1, 遅番: 1 },
  allowLateToEarly: true,
  transitionForces: [{ from: '休み', to: '遅番' }],
  roleShiftTypes: { 常勤: ['早番', '日勤', '遅番'] },
  customShiftDefs: [],
  ...over,
});

describe('applyTransitionForces（スワップ方式・早1遅1）', () => {
  test('★スワップ適用: 早1遅1でも「休み→遅番」が相手との交換で成立（人数不変）', () => {
    // 川田 day1=休み → day2 を遅番にしたい。day2 の遅番担当=杉本と交換。
    const res = mk({
      kawa: { 1: '休み', 2: '早番' },
      sugi: { 1: '早番', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    applyTransitionForces(res, ds, eiyo(), 2, {});
    expect(res.kawa[2]).toBe('遅番');   // 強制成立
    expect(res.sugi[2]).toBe('早番');   // 相手は川田の元の種別を受け取る
    // 人数は不変（早1・遅1）
    const early = [res.kawa[2], res.sugi[2], res.fuku[2]].filter(v => v === '早番').length;
    const late = [res.kawa[2], res.sugi[2], res.fuku[2]].filter(v => v === '遅番').length;
    expect(early).toBe(1);
    expect(late).toBe(1);
  });

  test('相手側が遷移ルールを破るなら交換しない（相手 前日→早番 が禁止遷移）', () => {
    // allowLateToEarly=false。相手=杉本は前日=日勤 → 早番(curr) を受けると 日勤→早番 で違反。
    const res = mk({
      kawa: { 1: '休み', 2: '早番' },
      sugi: { 1: '日勤', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    applyTransitionForces(res, ds, eiyo({ allowLateToEarly: false }), 2, {});
    expect(res.kawa[2]).toBe('早番');   // 据え置き（交換不可＋単一セルも min早番割れで諦め）
    expect(res.sugi[2]).toBe('遅番');
  });

  test('相手が個別ロックされていれば交換しない', () => {
    const res = mk({
      kawa: { 1: '休み', 2: '早番' },
      sugi: { 1: '早番', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    applyTransitionForces(res, ds, eiyo(), 2, { sugi: new Set([2]) });
    expect(res.kawa[2]).toBe('早番');   // 相手ロックで交換不可 → 据え置き
    expect(res.sugi[2]).toBe('遅番');
  });

  test('相手が別の強制を破る交換はしない（相手も「休み→遅番」対象）', () => {
    // 川田・杉本とも前日=休み（両者 遅番にしたいが遅番枠は1つ）。
    // 川田と交換すると杉本が早番になり、杉本自身の 休み→遅番 を破る → 交換不可。
    const res = mk({
      kawa: { 1: '休み', 2: '早番' },
      sugi: { 1: '休み', 2: '遅番' },
      fuku: { 1: '早番', 2: '休み' },
    });
    applyTransitionForces(res, ds, eiyo(), 2, {});
    expect(res.kawa[2]).toBe('早番');   // 交換不可 → 据え置き
    expect(res.sugi[2]).toBe('遅番');   // 杉本の遅番は保持（自分の強制は満たされている）
  });

  test('相手不在でも空きスロットなら従来どおり単一セルで適用（後方互換）', () => {
    // 遅番を誰も持っていない日。min/max に余裕 → 単一セル書換。
    const res = mk({ a: { 1: '休み', 2: '日勤' } });
    const ds1 = [{ id: 'a', role: '職員' }];
    applyTransitionForces(res, ds1, { id: 'k', shiftTypes: ['日勤', '遅番'], minStaff: {}, maxStaff: {}, transitionForces: [{ from: '休み', to: '遅番' }] }, 2, {});
    expect(res.a[2]).toBe('遅番');
  });
});

describe('強制→ペア交換 の順序: forceViolated ガードで"戻されない"（統合）', () => {
  test('★強制で確定した遅番を、後続のペア交換が学習ゲインがあっても戻さない', () => {
    const Y = 2026, M = 11; // 12月
    const w = new Date(Y, M, 2).getDay(); // day2 の曜日
    // 学習は「川田=早番寄り / 杉本=遅番寄り」＝ 遅番(川田)↔早番(杉本) を元に戻す交換に +ゲイン が付く状況。
    const rate = (e, l) => ({ dowShiftRate: { [w]: { 早番: e, 遅番: l } } });
    const TREND = { 川田: rate(0.9, 0.1), 杉本: rate(0.1, 0.9) };

    const res = mk({
      kawa: { 1: '休み', 2: '早番' },
      sugi: { 1: '早番', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    // 1) 強制（スワップ）: 川田 day2 → 遅番、杉本 → 早番
    applyTransitionForces(res, ds, eiyo({ targetSwapEnabled: true }), 2, {});
    expect(res.kawa[2]).toBe('遅番');
    expect(res.sugi[2]).toBe('早番');

    // 2) ペア交換: 学習的には 杉本=遅番/川田=早番 に"戻したい"（gain>0）が、
    //    川田の前日=休み + 強制 休み→遅番 のため forceViolated が交換を拒否 → 戻さない。
    applyTargetSwap(res, ds, eiyo({ targetSwapEnabled: true }), 2, {}, Y, M, TREND);
    expect(res.kawa[2]).toBe('遅番'); // ★強制の遅番が保持される
    expect(res.sugi[2]).toBe('早番');
  });
});
