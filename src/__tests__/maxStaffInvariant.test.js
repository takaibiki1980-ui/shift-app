/**
 * maxStaff 不変条件 回帰テスト（設計②・間接テスト方式）
 *
 * 背景: eiyo実構成（8名・minStaff7種別×1・早番maxStaff:1）で早番が同日2人に
 *       なるバグが94%発生していた。原因は repairHardConstraints の強制配置で、
 *       PR #97 で修正済み。本テストは「早番が同日2人にならない」不変条件を
 *       bestOfN / repairHardConstraints の出力に対する回帰テストとして固定する。
 *
 * 方式: enforceMaxStaff は autoGenerate 内部フェーズのまま（抽出せず）、
 *       bestOfN / repairHardConstraints の出力を黒箱検証する間接テスト。
 *       ランダム性を吸収するため各構成を複数回試行して不変条件を確認する。
 *
 * 本体コード変更・export追加は一切なし（既存export関数のみ使用）。
 *
 * ※不変条件の閾値は実測に基づく（推測なし）:
 *   - maxStaff超過: 全構成・全試行で 0 件（実測 0/50）
 *   - 日勤(maxStaff:99)buffer: minStaff:2構成で全試行 日勤>=2 成立（実測 50/50・最小4）
 *   - 公休超過: buffer潤沢構成で 0 件（実測 0/50）
 */
import { describe, test, expect } from 'vitest';
import { bestOfN, repairHardConstraints, getDays, monthKey } from '../engine/core.js';

const YEAR = 2026, MONTH = 1; // 2月(28日)
const days = getDays(YEAR, MONTH);
const mk = monthKey(YEAR, MONTH);
const REST = new Set(['休み', '希望休', '有休']);
const TRIALS = 30;
const N = 15; // bestOfN 試行回数

// maxStaff<99 の種別で上限超過している (日,種別) を数える
function maxStaffExcess(shifts, ds, dept) {
  let excess = 0;
  for (let d = 1; d <= days; d++) {
    for (const [k, mx] of Object.entries(dept.maxStaff)) {
      if (mx >= 99) continue;
      const cnt = ds.filter(s => shifts[s.id]?.[d] === k).length;
      if (cnt > mx) excess += cnt - mx;
    }
  }
  return excess;
}

// ────────────────────────────────────────────────────────────────
// ②-1. eiyo実構成: 早番が同日2人にならない（今日のバグの再発防止）
// ────────────────────────────────────────────────────────────────
describe('②-1 eiyo実構成: 早番/遅番 maxStaff 超過ゼロ（bestOfN → repair 全経路）', () => {
  const eiyoDept = {
    id: 'eiyo', label: '栄養科',
    shiftTypes: ['早番', '遅番', '日勤', 'A', 'B', 'C'],
    minStaff: { 早番: 1, 遅番: 1, 日勤: 1, A: 1, B: 1, C: 1 },
    maxStaff: { 早番: 1, 遅番: 1, 日勤: 99, A: 99, B: 99, C: 99 },
    defaultKyukoDays: 9, maxConsec: 5, maxConsecutive: 5,
    customShiftDefs: [{ key: 'A', baseType: '日勤' }, { key: 'B', baseType: '日勤' }, { key: 'C', baseType: '日勤' }],
    roleShiftTypes: {
      '栄養士': ['日勤'], '常勤': ['早番', '遅番'],
      '非常勤A': ['A'], '非常勤B': ['B'], '非常勤AC': ['A', 'C'], '非常勤C': ['C'],
    },
  };
  function makeEiyoStaff() {
    const b = { dept: 'eiyo', kyukoDays: 9, kyukoDaysByMonth: {}, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} };
    return [
      { id: 'e0', name: '渡部', role: '栄養士', ...b },
      { id: 'e1', name: '川田', role: '常勤', ...b },
      { id: 'e2', name: '福田', role: '常勤', ...b },
      { id: 'e3', name: '杉本', role: '常勤', ...b },
      { id: 'e4', name: '栗田', role: '非常勤A', ...b, kyukoDays: 12 },
      { id: 'e5', name: '岩瀬', role: '非常勤B', ...b, kyukoDays: 12 },
      { id: 'e6', name: '佐藤', role: '非常勤AC', ...b, kyukoDays: 12 },
      { id: 'e7', name: '落合', role: '非常勤C', ...b, kyukoDays: 12 },
    ];
  }

  test(`${TRIALS}試行: bestOfN後・repair後ともに早番/遅番が同日2人以上にならない`, () => {
    for (let i = 0; i < TRIALS; i++) {
      const staff = makeEiyoStaff();
      const ds = staff.filter(s => s.dept === 'eiyo');
      const { shifts } = bestOfN(staff, eiyoDept, YEAR, MONTH, {}, {}, N, {});

      // 段階1: bestOfN（autoGenerate + enforceMaxStaff + localSearch）後
      expect(maxStaffExcess(shifts, ds, eiyoDept), `試行${i}: bestOfN後にmaxStaff超過`).toBe(0);

      // 段階2: repairHardConstraints（App.jsx _runGenerateCore 相当）後
      //   ← PR #97 で修正した強制配置バグの再発防止ポイント
      repairHardConstraints(eiyoDept, shifts, ds, YEAR, MONTH);
      expect(maxStaffExcess(shifts, ds, eiyoDept), `試行${i}: repair後にmaxStaff超過`).toBe(0);

      // 早番・遅番それぞれ全日で人数<=1 を明示確認
      for (let d = 1; d <= days; d++) {
        expect(ds.filter(s => shifts[s.id]?.[d] === '早番').length,
          `試行${i} d${d}: 早番が2人以上`).toBeLessThanOrEqual(1);
        expect(ds.filter(s => shifts[s.id]?.[d] === '遅番').length,
          `試行${i} d${d}: 遅番が2人以上`).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────
// ②-2. 日勤(maxStaff:99) buffer が enforceMaxStaff で不必要に潰されない
// ────────────────────────────────────────────────────────────────
describe('②-2 日勤buffer(maxStaff:99)は上限1に潰されない', () => {
  // 日勤 minStaff:2 → buffer が1に潰されていれば minStaff を満たせず 日勤>=2 が出ない
  const dept = {
    id: 'kaigo1',
    shiftTypes: ['早番', '日勤', '遅番'],
    minStaff: { 早番: 1, 日勤: 2, 遅番: 1 },
    maxStaff: { 早番: 1, 日勤: 99, 遅番: 1 },
    defaultKyukoDays: 8, maxConsec: 5, maxConsecutive: 5, customShiftDefs: [],
  };
  function makeStaff() {
    const b = { dept: 'kaigo1', kyukoDays: 8, kyukoDaysByMonth: {}, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} };
    return Array.from({ length: 7 }, (_, i) => ({ id: 'b' + i, name: 'B' + i, role: '介護', nightOk: false, nightMax: 0, ...b }));
  }

  test(`${TRIALS}試行: 早番/遅番<=1 を保ちつつ 日勤>=2 の日が各試行で発生する`, () => {
    for (let i = 0; i < TRIALS; i++) {
      const staff = makeStaff();
      const ds = staff.filter(s => s.dept === 'kaigo1');
      const { shifts } = bestOfN(staff, dept, YEAR, MONTH, {}, {}, N, {});

      // slot種別（早番・遅番）は上限1を厳守
      expect(maxStaffExcess(shifts, ds, dept), `試行${i}: 早番/遅番 maxStaff超過`).toBe(0);

      // 日勤(buffer)は2人以上配置される日がある = 上限1に潰されていない
      let maxNikkin = 0;
      for (let d = 1; d <= days; d++) {
        const c = ds.filter(s => shifts[s.id]?.[d] === '日勤').length;
        if (c > maxNikkin) maxNikkin = c;
      }
      expect(maxNikkin, `試行${i}: 日勤が1人以下に潰されている（bufferが機能していない）`).toBeGreaterThanOrEqual(2);
    }
  });
});

// ────────────────────────────────────────────────────────────────
// ②-3. 余剰人員が maxStaff違反として残らない（振替/休みで必ず吸収される）
// ────────────────────────────────────────────────────────────────
// 【実測に基づく設計判断】
//   当初「maxStaff適用後にminStaff割れ/公休超過が新規発生しない」を検証しようとしたが、
//   minStaff・公休はいずれも soft制約（scoreShifts のペナルティ項）であり、
//   bestOfN のランダム性で不足/超過が確率的に発生する（実測: minStaff不足は
//   低密度構成でも 2〜10/50試行、公休超過も n を下げると発生）。
//   よってこれらを「ゼロ」とする invariant はフレーキーになるため採用しない。
//   代わりに、確実に成立する「余剰は maxStaff違反として残らない」を検証する。
describe('②-3 余剰人員圧の下でも maxStaff違反が残らない（振替/休みで吸収）', () => {
  // slot席は毎日2つ（早番1・遅番1）のみ。8名中6名は日勤(buffer)か休みに回るしかない。
  // enforceMaxStaff の振替が機能せず余剰を早番/遅番に残せば maxStaff違反になる。
  const dept = {
    id: 'kaigo1',
    shiftTypes: ['早番', '日勤', '遅番'],
    minStaff: { 早番: 1, 日勤: 1, 遅番: 1 },
    maxStaff: { 早番: 1, 日勤: 99, 遅番: 1 },
    defaultKyukoDays: 8, maxConsec: 5, maxConsecutive: 5, customShiftDefs: [],
  };
  function makeStaff(n) {
    const b = { dept: 'kaigo1', kyukoDays: 8, kyukoDaysByMonth: {}, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} };
    return Array.from({ length: n }, (_, i) => ({ id: 's' + i, name: 'S' + i, role: '介護', nightOk: false, nightMax: 0, ...b }));
  }

  test(`${TRIALS}試行: 8名の余剰圧下でも早番/遅番が同日2人以上にならない`, () => {
    for (let i = 0; i < TRIALS; i++) {
      const staff = makeStaff(8);
      const ds = staff.filter(s => s.dept === 'kaigo1');
      const { shifts } = bestOfN(staff, dept, YEAR, MONTH, {}, {}, N, {});

      // 余剰は日勤bufferや休みに吸収され、slot種別に maxStaff違反として残らない
      expect(maxStaffExcess(shifts, ds, dept), `試行${i}: 余剰がmaxStaff違反として残存`).toBe(0);

      // buffer(日勤)が余剰の受け皿として実際に使われている（振替先が機能）
      const nikkinTotal = ds.reduce((sum, s) =>
        sum + Object.values(shifts[s.id] || {}).filter(v => v === '日勤').length, 0);
      expect(nikkinTotal, `試行${i}: 日勤bufferが全く使われていない`).toBeGreaterThan(0);
    }
  });
});
