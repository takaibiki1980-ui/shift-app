import { describe, test, expect } from 'vitest';
import { applyTransitionForces } from '../engine/core.js';

// res を毎回新規生成するヘルパ
const mkRes = (obj) => JSON.parse(JSON.stringify(obj));
const ds2 = [{ id: 'a', dept: 'k1', role: '職員' }, { id: 'b', dept: 'k1', role: '職員' }];
const ds1 = [{ id: 'a', dept: 'k1', role: '職員' }];

const baseDept = (over = {}) => ({
  id: 'k1', shiftTypes: ['早番', '日勤', '遅番'],
  minStaff: {}, maxStaff: {},
  transitionForces: [{ from: '休み', to: '遅番' }],
  ...over,
});

describe('applyTransitionForces（生成後処理の強制パス）', () => {
  test('適用: 休みの翌日の勤務日を遅番へ（同カテゴリ・条件クリア）', () => {
    const res = mkRes({ a: { 1: '休み', 2: '日勤' } }); // 翌々日なし → to→翌日チェックは対象外
    applyTransitionForces(res, ds1, baseDept(), 2, {});
    expect(res.a[2]).toBe('遅番'); // 日勤(勤務)→遅番(勤務)
  });

  test('適用: to→翌日が許容なら翌々日ありでも適用（遅番→遅番）', () => {
    const res = mkRes({ a: { 1: '休み', 2: '日勤', 3: '遅番' } });
    applyTransitionForces(res, ds1, baseDept(), 3, {});
    expect(res.a[2]).toBe('遅番'); // 遅番→遅番 は既存ルール違反でない
  });

  test('諦める: minStaff を割るなら適用しない', () => {
    const res = mkRes({ a: { 1: '休み', 2: '日勤' } });
    const dept = baseDept({ minStaff: { 日勤: 1 } }); // a しかいない → 日勤を抜くと 0 < 1
    applyTransitionForces(res, ds1, dept, 2, {});
    expect(res.a[2]).toBe('日勤'); // 据え置き
  });

  test('諦める: maxStaff を超えるなら適用しない（2人目）', () => {
    const res = mkRes({ a: { 1: '休み', 2: '日勤' }, b: { 1: '休み', 2: '日勤' } });
    const dept = baseDept({ maxStaff: { 遅番: 1 }, minStaff: {} });
    applyTransitionForces(res, ds2, dept, 2, {});
    // 1人目は遅番化できる、2人目は遅番が上限1を超えるので据え置き
    const lates = [res.a[2], res.b[2]].filter(v => v === '遅番').length;
    const days = [res.a[2], res.b[2]].filter(v => v === '日勤').length;
    expect(lates).toBe(1);
    expect(days).toBe(1);
  });

  test('個別優先: d+1 がロックされていれば適用しない', () => {
    const res = mkRes({ a: { 1: '休み', 2: '日勤' } });
    applyTransitionForces(res, ds1, baseDept(), 2, { a: new Set([2]) });
    expect(res.a[2]).toBe('日勤'); // 個別希望が勝つ
  });

  test('役職外: to が役職で不可なら適用しない', () => {
    const res = mkRes({ a: { 1: '休み', 2: '日勤' } });
    const dept = baseDept({ roleShiftTypes: { 職員: ['日勤'] } }); // 遅番不可
    applyTransitionForces(res, ds1, dept, 2, {});
    expect(res.a[2]).toBe('日勤');
  });

  test('夜勤セット非干渉: 夜勤/明けが絡む遷移は触れない', () => {
    // from=夜勤 は NIGHT なので対象外
    const res1 = mkRes({ a: { 1: '夜勤', 2: '明け' } });
    applyTransitionForces(res1, ds1, baseDept({ transitionForces: [{ from: '夜勤', to: '遅番' }] }), 2, {});
    expect(res1.a[2]).toBe('明け');
    // d+2 が明け（夜勤連鎖）なら触れない
    const res2 = mkRes({ a: { 1: '休み', 2: '日勤', 3: '明け' } });
    applyTransitionForces(res2, ds1, baseDept(), 3, {});
    expect(res2.a[2]).toBe('日勤');
    // to=明け は NIGHT なので対象外
    const res3 = mkRes({ a: { 1: '休み', 2: '日勤' } });
    applyTransitionForces(res3, ds1, baseDept({ transitionForces: [{ from: '休み', to: '明け' }] }), 2, {});
    expect(res3.a[2]).toBe('日勤');
  });

  test('公休保護: 休み→休み(rest→work)で公休が崩れるなら適用しない', () => {
    const res = mkRes({ a: { 1: '休み', 2: '休み' } });
    applyTransitionForces(res, ds1, baseDept(), 2, {});
    expect(res.a[2]).toBe('休み'); // 休み(rest)→遅番(work) は異カテゴリ → 諦める
  });

  test('既存遷移ルール: to→翌日 が遅番→早番になるなら適用しない', () => {
    const res = mkRes({ a: { 1: '休み', 2: '日勤', 3: '早番' } });
    applyTransitionForces(res, ds1, baseDept(), 3, {});
    expect(res.a[2]).toBe('日勤'); // 遅番にすると 遅番→早番(禁止) になる → 諦める
  });

  test('transitionForces 未設定/空は no-op', () => {
    const res = mkRes({ a: { 1: '休み', 2: '日勤' } });
    applyTransitionForces(res, ds1, baseDept({ transitionForces: [] }), 2, {});
    expect(res.a[2]).toBe('日勤');
    const res2 = mkRes({ a: { 1: '休み', 2: '日勤' } });
    applyTransitionForces(res2, ds1, { id: 'k1', shiftTypes: ['日勤', '遅番'] }, 2, {});
    expect(res2.a[2]).toBe('日勤');
  });
});
