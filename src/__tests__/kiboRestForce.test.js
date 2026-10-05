import { describe, test, expect } from 'vitest';
import { applyTransitionForces, applyTargetSwap, bestOfN } from '../engine/core.js';

const mk = (o) => JSON.parse(JSON.stringify(o));
const ds = [
  { id: 'kawa', name: '川田', role: '常勤' },
  { id: 'sugi', name: '杉本', role: '常勤' },
  { id: 'fuku', name: '福田', role: '常勤' },
];
const eiyo = (over = {}) => ({
  id: 'eiyo', label: '栄養科', shiftTypes: ['早番', '遅番'],
  minStaff: { 早番: 1, 遅番: 1 }, maxStaff: { 早番: 1, 遅番: 1 },
  maxConsecutive: 5, allowLateToEarly: true,
  roleShiftTypes: { 常勤: ['早番', '遅番'] }, customShiftDefs: [],
  transitionForces: [{ from: '休み', to: '遅番' }],
  ...over,
});
const DAYS = 2;
const counts = (res, d) => ({
  e: ['kawa', 'sugi', 'fuku'].filter(s => res[s]?.[d] === '早番').length,
  l: ['kawa', 'sugi', 'fuku'].filter(s => res[s]?.[d] === '遅番').length,
});

describe('希望休の翌日に遷移強制が働く（同値グループ）', () => {
  test('希望休の翌日が早番なら、強制で遅番へ交換される（人数不変）', () => {
    const res = mk({
      kawa: { 1: '希望休', 2: '早番' },
      sugi: { 1: '早番', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    const before = counts(res, 2);
    applyTransitionForces(res, ds, eiyo(), DAYS, {});
    expect(res.kawa[2]).toBe('遅番');   // 希望休翌日が遅番化
    expect(res.sugi[2]).toBe('早番');   // 交換相手
    expect(counts(res, 2)).toEqual(before); // 早1遅1 不変
    expect(res.kawa[1]).toBe('希望休');  // 前日（個別ロック）は不変
  });

  test('有休の翌日は交換されない（有休は休み扱いにしない）', () => {
    const res = mk({
      kawa: { 1: '有休', 2: '早番' },
      sugi: { 1: '早番', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    applyTransitionForces(res, ds, eiyo(), DAYS, {});
    expect(res.kawa[2]).toBe('早番');   // 据え置き
    expect(res.sugi[2]).toBe('遅番');
  });

  test("前日が'休み'の既存挙動は不変", () => {
    const res = mk({
      kawa: { 1: '休み', 2: '早番' },
      sugi: { 1: '早番', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    applyTransitionForces(res, ds, eiyo(), DAYS, {});
    expect(res.kawa[2]).toBe('遅番');
    expect(res.sugi[2]).toBe('早番');
  });

  test('前日が希望休で翌日が個別ロックなら交換しない（個別優先）', () => {
    const res = mk({
      kawa: { 1: '希望休', 2: '早番' },
      sugi: { 1: '早番', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    // 川田の day2 がロック（希望勤務など）→ 強制より個別優先
    applyTransitionForces(res, ds, eiyo(), DAYS, { kawa: new Set([2]) });
    expect(res.kawa[2]).toBe('早番');
    expect(res.sugi[2]).toBe('遅番');
  });

  test('ペア交換は希望休翌日の遅番を早番に戻さない（forceViolated が希望休を休み扱い）', () => {
    const Y = 2026, M = 11;
    const w = new Date(Y, M, 2).getDay();
    const rate = (e, l) => ({ dowShiftRate: { [w]: { 早番: e, 遅番: l } } });
    const trend = { 川田: rate(0.9, 0.1), 杉本: rate(0.1, 0.9) }; // 戻したい方向に学習ゲイン
    const res = mk({
      kawa: { 1: '希望休', 2: '早番' },
      sugi: { 1: '早番', 2: '遅番' },
      fuku: { 1: '遅番', 2: '休み' },
    });
    applyTransitionForces(res, ds, eiyo({ targetSwapEnabled: true }), DAYS, {});
    expect(res.kawa[2]).toBe('遅番'); // 強制で遅番
    applyTargetSwap(res, ds, eiyo({ targetSwapEnabled: true }), DAYS, {}, Y, M, trend);
    expect(res.kawa[2]).toBe('遅番'); // ★希望休翌日の遅番は戻されない
    expect(res.sugi[2]).toBe('早番');
  });
});

describe('bestOfN 経由（希望休翌日の遅番強制が最終出力に残る）', () => {
  const mkStaff = (id, name, kibo) => ({ id, name, dept: 'eiyo', role: '常勤', nightOk: false, kyukoDays: 8, kiboByMonth: { '2026-12': kibo }, yukyuByMonth: {}, shiftRequestsByMonth: {} });

  test('希望休のある月でも 全日 早1遅1 維持 ＋ 希望休翌日の勤務は遅番', () => {
    const Y = 2026, M = 11, days = 31;
    const staff = [mkStaff('kawa', '川田', [5, 12, 19]), mkStaff('sugi', '杉本', [8, 15]), mkStaff('fuku', '福田', [3, 22])];
    const { shifts } = bestOfN(staff, eiyo(), Y, M, {}, {}, 20, {});
    for (let d = 1; d <= days; d++) {
      expect(['kawa', 'sugi', 'fuku'].filter(s => shifts[s]?.[d] === '早番').length).toBe(1);
      expect(['kawa', 'sugi', 'fuku'].filter(s => shifts[s]?.[d] === '遅番').length).toBe(1);
    }
    // 希望休の翌日が勤務なら遅番であること
    let tot = 0, ok = 0;
    for (const s of ['kawa', 'sugi', 'fuku']) for (let d = 1; d < days; d++) {
      if (shifts[s]?.[d] === '希望休') { const nx = shifts[s]?.[d + 1]; if (nx && nx !== '休み' && nx !== '希望休' && nx !== '有休') { tot++; if (nx === '遅番') ok++; } }
    }
    expect(tot).toBeGreaterThan(0);
    expect(ok).toBe(tot);
  });
});
