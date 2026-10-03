import { describe, test, expect } from 'vitest';
import { applyTransitionForces, applyTargetSwap, localSearchImprove, bestOfN } from '../engine/core.js';

const mk = (obj) => JSON.parse(JSON.stringify(obj));
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
// 各日 早1・遅1・休1 を保つ6日間（回転）
const sched6 = () => ({
  kawa: { 1: '休み', 2: '早番', 3: '遅番', 4: '休み', 5: '早番', 6: '遅番' },
  sugi: { 1: '早番', 2: '遅番', 3: '休み', 4: '早番', 5: '遅番', 6: '休み' },
  fuku: { 1: '遅番', 2: '休み', 3: '早番', 4: '遅番', 5: '休み', 6: '早番' },
});
const DAYS = 6;
const counts = (res, d) => ({
  e: ['kawa', 'sugi', 'fuku'].filter(s => res[s][d] === '早番').length,
  l: ['kawa', 'sugi', 'fuku'].filter(s => res[s][d] === '遅番').length,
});
const forceOkRate = (res) => {
  let tot = 0, ok = 0;
  for (const s of ['kawa', 'sugi', 'fuku']) for (let d = 1; d < DAYS; d++) {
    if (res[s][d] === '休み') { const nx = res[s][d + 1]; if (nx && nx !== '休み') { tot++; if (nx === '遅番') ok++; } }
  }
  return { tot, ok };
};

describe('最終確定パス（localSearch後の 強制→ペア交換 再適用）', () => {
  test('最終パスは各日の早番/遅番の人数を変えない（同日スワップのみ・人数不変）', () => {
    const res = sched6();
    const before = [];
    for (let d = 1; d <= DAYS; d++) before.push(counts(res, d));
    applyTransitionForces(res, ds, eiyo(), DAYS, {});
    applyTargetSwap(res, ds, eiyo({ targetSwapEnabled: true }), DAYS, {}, 2026, 11, {
      川田: { dowShiftRate: Object.fromEntries([...Array(7)].map((_, w) => [w, { 早番: 0.9, 遅番: 0.1 }])) },
      杉本: { dowShiftRate: Object.fromEntries([...Array(7)].map((_, w) => [w, { 早番: 0.1, 遅番: 0.9 }])) },
    });
    for (let d = 1; d <= DAYS; d++) expect(counts(res, d)).toEqual(before[d - 1]);
  });

  test('★強制が localSearch 後も残る: localSearch→強制 の順で 休み翌日=遅番 が達成される', () => {
    const res = localSearchImprove(sched6(), ds, eiyo(), DAYS, 2026, 11, {}); // scoreで組み直し（強制は崩れうる）
    const beforeCounts = [];
    for (let d = 1; d <= DAYS; d++) beforeCounts.push(counts(res, d));
    applyTransitionForces(res, ds, eiyo(), DAYS, {});                          // 最終パスで確定
    const r = forceOkRate(res);
    expect(r.tot).toBeGreaterThan(0);
    expect(r.ok).toBe(r.tot);                                                  // 全て遅番（100%）
    for (let d = 1; d <= DAYS; d++) expect(counts(res, d)).toEqual(beforeCounts[d - 1]); // 人数不変
  });

  test('★ペア交換が localSearch 後も残る: localSearch→交換 の順で学習整合が確定する', () => {
    const trend = {
      川田: { dowShiftRate: Object.fromEntries([...Array(7)].map((_, w) => [w, { 早番: 0.9, 遅番: 0.1 }])) },
      杉本: { dowShiftRate: Object.fromEntries([...Array(7)].map((_, w) => [w, { 早番: 0.1, 遅番: 0.9 }])) },
      福田: { dowShiftRate: Object.fromEntries([...Array(7)].map((_, w) => [w, { 早番: 0.5, 遅番: 0.5 }])) },
    };
    const dept = eiyo({ targetSwapEnabled: true });
    const res = localSearchImprove(sched6(), ds, dept, DAYS, 2026, 11, trend);
    const beforeCounts = [];
    for (let d = 1; d <= DAYS; d++) beforeCounts.push(counts(res, d));
    applyTargetSwap(res, ds, dept, DAYS, {}, 2026, 11, trend);
    // 交換後は「川田=早番 のとき 遅番の相手より学習的に適切」= これ以上ゲインのある交換が残らない状態。
    // 具体的に: 川田が早番/遅番いずれでも、同日の相手との再交換でゲインが出ないこと（冪等）を確認。
    const snapshot = mk(res);
    applyTargetSwap(res, ds, dept, DAYS, {}, 2026, 11, trend); // 再適用しても変化しない（確定済み）
    expect(res).toEqual(snapshot);
    for (let d = 1; d <= DAYS; d++) expect(counts(res, d)).toEqual(beforeCounts[d - 1]); // 人数不変
  });
});

describe('bestOfN 統合（バックテスト経路）: 最終パスで強制・人数が担保される', () => {
  const mkStaff = (id, name) => ({ id, name, dept: 'eiyo', role: '常勤', nightOk: false, kyukoDays: 8, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} });
  const staff = [mkStaff('kawa', '川田'), mkStaff('sugi', '杉本'), mkStaff('fuku', '福田')];

  test('全日 早1・遅1 を保ち（人数崩れなし）、休み翌日の遅番率が100%', () => {
    const Y = 2026, M = 11, days = 31;
    const { shifts } = bestOfN(staff, eiyo(), Y, M, {}, {}, 20, {});
    for (let d = 1; d <= days; d++) {
      const e = ['kawa', 'sugi', 'fuku'].filter(s => shifts[s]?.[d] === '早番').length;
      const l = ['kawa', 'sugi', 'fuku'].filter(s => shifts[s]?.[d] === '遅番').length;
      expect(e).toBe(1);
      expect(l).toBe(1);
    }
    let tot = 0, ok = 0;
    for (const s of ['kawa', 'sugi', 'fuku']) for (let d = 1; d < days; d++) {
      if (shifts[s]?.[d] === '休み') { const nx = shifts[s]?.[d + 1]; if (nx && nx !== '休み') { tot++; if (nx === '遅番') ok++; } }
    }
    expect(tot).toBeGreaterThan(0);
    expect(ok).toBe(tot); // 休み翌日の勤務は全て遅番
  });
});
