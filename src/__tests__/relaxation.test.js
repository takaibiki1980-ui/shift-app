/**
 * relaxation.js テスト（Step 8）
 *
 * 対象: placeWithRelaxation
 *
 * Soft ルール（shiftRatio / fairness / maxConsecutive / maxStaff）は Step 9 で実装予定。
 * 現時点では RULE_REGISTRY に未登録のため、Soft制約は常に「通過」する。
 * → 緩和なし（relaxedConstraints=[]）で success するケースを中心にテストし、
 *   Hard制約によるブロックと hard_infeasible を検証する。
 *   緩和エスカレーションの動作確認は Step 9 完了後にテストを追加する。
 */

import { describe, test, expect } from 'vitest';
import { placeWithRelaxation } from '../lib/timeAxisEngine/relaxation.js';
import { resolveConstraints } from '../lib/timeAxisEngine/constraints/definitions.js';

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

const BASE_DEPT = {
  shiftTypes: ['早番', '日勤', '遅番'],
  roleShiftTypes: { '補助': ['日勤'] }, // 補助は日勤のみ
  intervalThreshold: 11,
};

const STAFF_A = { id: 'sta', name: 'スタッフ A', role: '管理栄養士' }; // 全シフト可
const STAFF_B = { id: 'stb', name: 'スタッフ B', role: '補助' };       // 日勤のみ

// constraintEngine が参照する context フィールド:
//   dept / staffs / shifts / prevTail / requests / intervalThreshold / days / role
// role は tryPlaceWith が staff.role から注入するため、ここでは不要
const BASE_CONTEXT = {
  dept: BASE_DEPT,
  staffs: [STAFF_A, STAFF_B],
  shifts: {},       // { [staffId]: { [day]: shiftKey } }
  prevTail: {},
  requests: {},
  intervalThreshold: 11,
  days: 30,
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. 緩和なしで配置可能 → relaxedConstraints=[]
// ─────────────────────────────────────────────────────────────────────────────
describe('placeWithRelaxation — 緩和なし成功', () => {

  test('Hard制約違反なし → relaxedConstraints=[] で success', () => {
    const result = placeWithRelaxation(15, ['日勤'], BASE_CONTEXT);
    expect(result.success).toBe(true);
    expect(result.relaxedConstraints).toEqual([]);
    expect(result.shiftKey).toBe('日勤');
    expect(result.staffId).toBe('sta'); // staffs 先頭の STAFF_A
  });

  test('早番 shiftKey でも全シフト可のスタッフが選ばれる', () => {
    const result = placeWithRelaxation(15, ['早番'], BASE_CONTEXT);
    expect(result.success).toBe(true);
    expect(result.staffId).toBe('sta'); // STAFF_B は補助で早番不可
    expect(result.shiftKey).toBe('早番');
    expect(result.relaxedConstraints).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hard制約が全スタッフをブロック → hard_infeasible
// ─────────────────────────────────────────────────────────────────────────────
describe('placeWithRelaxation — hard_infeasible', () => {

  test('全スタッフが roleAllowedShifts 違反 → hard_infeasible', () => {
    const context = {
      ...BASE_CONTEXT,
      staffs: [STAFF_B], // 補助のみ（日勤しか配置不可）
    };
    // '遅番' は補助に許可されていない Hard制約 → 緩和しても解消しない
    const result = placeWithRelaxation(15, ['遅番'], context);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('hard_infeasible');
  });

  test('staffs=[] → hard_infeasible', () => {
    const context = { ...BASE_CONTEXT, staffs: [] };
    const result = placeWithRelaxation(15, ['日勤'], context);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('hard_infeasible');
  });

  test('shiftKeys=[] → hard_infeasible', () => {
    const result = placeWithRelaxation(15, [], BASE_CONTEXT);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('hard_infeasible');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. shiftKeys・staffs の探索順序
// ─────────────────────────────────────────────────────────────────────────────
describe('placeWithRelaxation — 探索順序', () => {

  test('shiftKeys[0] が全員ブロック → shiftKeys[1] で success', () => {
    const context = {
      ...BASE_CONTEXT,
      staffs: [STAFF_B], // 補助 = 日勤のみ
    };
    // ['遅番', '日勤']: 遅番は補助に不可、日勤は可
    const result = placeWithRelaxation(15, ['遅番', '日勤'], context);
    expect(result.success).toBe(true);
    expect(result.shiftKey).toBe('日勤');
    expect(result.staffId).toBe('stb');
    expect(result.relaxedConstraints).toEqual([]);
  });

  test('staffs 先頭のスタッフが Hard違反 → 2番目のスタッフで success', () => {
    // STAFF_A が requestLock（希望休）で '遅番' 不可 → STAFF_B も遅番不可（補助）
    // shiftKey '日勤' で: STAFF_A は希望休でブロック、STAFF_B は日勤可
    const context = {
      ...BASE_CONTEXT,
      requests: {
        'sta': { 15: { type: 'kiboRest', shiftKey: '希望休' } },
      },
    };
    const result = placeWithRelaxation(15, ['日勤'], context);
    expect(result.success).toBe(true);
    expect(result.staffId).toBe('stb'); // STAFF_A をスキップして STAFF_B
    expect(result.shiftKey).toBe('日勤');
    expect(result.relaxedConstraints).toEqual([]);
  });

  test('minInterval 違反スタッフをスキップして次候補を返す', () => {
    // STAFF_A が前日=遅番（11:30-20:30）→ 早番（07:00-16:00）はインターバル10.5h < 11h
    const context = {
      ...BASE_CONTEXT,
      staffs: [STAFF_A, STAFF_B],
      shifts: { 'sta': { 14: '遅番' } }, // STAFF_A の前日=遅番
    };
    // '早番' に対して: STAFF_A はインターバル違反 → STAFF_B も補助で早番不可
    // '日勤' に対して: STAFF_A は日勤可（インターバル問題なし）
    const result = placeWithRelaxation(15, ['早番', '日勤'], context);
    expect(result.success).toBe(true);
    // '早番'は全員ブロック、'日勤'でSTAFF_Aが通る
    expect(result.shiftKey).toBe('日勤');
    expect(result.staffId).toBe('sta');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Soft制約の緩和順が definitions.js 由来であること（構造保証）
// ─────────────────────────────────────────────────────────────────────────────
describe('placeWithRelaxation — 緩和順の構造的保証', () => {

  test('Soft制約は penalty 昇順に並ぶ（shiftRatio < fairness < maxConsecutive < maxStaff）', () => {
    const soft = resolveConstraints(BASE_DEPT)
      .filter(c => c.hardness === 'soft')
      .sort((a, b) => a.penalty - b.penalty);
    const ids = soft.map(c => c.id);
    expect(ids).toEqual(['shiftRatio', 'fairness', 'maxConsecutive', 'maxStaff']);
  });

  test('maxStaffRelaxable=false → maxStaff が Hard昇格して soft 緩和リストから除外される', () => {
    const dept = { ...BASE_DEPT, maxStaffRelaxable: false };
    const softIds = resolveConstraints(dept)
      .filter(c => c.hardness === 'soft')
      .sort((a, b) => a.penalty - b.penalty)
      .map(c => c.id);

    expect(softIds).not.toContain('maxStaff');
    // 他のSoft制約は引き続き soft
    expect(softIds).toContain('shiftRatio');
    expect(softIds).toContain('fairness');
    expect(softIds).toContain('maxConsecutive');
  });

  test('nightSetPattern のない部署（shiftTypes に夜勤なし）では nightSetPattern が有効でない', () => {
    // nightSetPattern は Hard制約だが enabledWhen で除外される
    const resolved = resolveConstraints(BASE_DEPT);
    const hasNightSet = resolved.some(c => c.id === 'nightSetPattern');
    expect(hasNightSet).toBe(false); // 夜勤なし部署では無効
  });
});
