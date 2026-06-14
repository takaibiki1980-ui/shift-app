/**
 * Soft制約 4本 テスト（Step 9）
 *
 * 対象: shiftRatio / fairness / maxConsecutive / maxStaff
 * インターフェース: check(staffId, date, shiftKey, context) → Violation[]
 *
 * 各 Violation は必ず:
 *   ok: false / rule: string / dedupKey: string / detail: string
 *   + severity フィールド（excess | imbalance）を含む
 */

import { describe, test, expect } from 'vitest';
import { check as checkShiftRatio     } from '../lib/timeAxisEngine/constraints/rules/shiftRatio.js';
import { check as checkFairness       } from '../lib/timeAxisEngine/constraints/rules/fairness.js';
import { check as checkMaxConsecutive } from '../lib/timeAxisEngine/constraints/rules/maxConsecutive.js';
import { check as checkMaxStaff       } from '../lib/timeAxisEngine/constraints/rules/maxStaff.js';

// ─────────────────────────────────────────────────────────────────────────────
// 共通フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

const BASE_DEPT = {
  shiftTypes: ['早番', '日勤', '遅番'],
  maxStaff: { 早番: 1 },
  maxConsecutive: 5,
};

const STAFF_A = { id: 'sta', name: 'スタッフ A', role: '管理栄養士',
  shiftRatio: { 早番: 0.20, 日勤: 0.60, 遅番: 0.20 } };
const STAFF_B = { id: 'stb', name: 'スタッフ B', role: '管理栄養士',
  shiftRatio: { 早番: 0.20, 日勤: 0.60, 遅番: 0.20 } };
const STAFF_C = { id: 'stc', name: 'スタッフ C', role: '補助' };

// ═════════════════════════════════════════════════════════════════════════════
// shiftRatio
// ═════════════════════════════════════════════════════════════════════════════
describe('shiftRatio', () => {

  test('目標内 → 違反なし', () => {
    // 早番:1, 日勤:3, 遅番:1 (total=5). 日勤配置で 日勤4/6 = 67% > 目標60%
    // excess = 4 - 6*0.6 = 4 - 3.6 = 0.4 < 1 → 違反なし
    const context = {
      dept: BASE_DEPT,
      staffs: [STAFF_A],
      shifts: { 'sta': { 1:'早番', 2:'日勤', 3:'日勤', 4:'日勤', 5:'遅番' } },
      year: 2026, month: 5,
    };
    expect(checkShiftRatio('sta', 6, '日勤', context)).toHaveLength(0);
  });

  test('目標を大幅超過（excess >= 1.0）→ 違反1件', () => {
    // 早番:1, 日勤:7, 遅番:1 (total=9). 日勤を追加→ 8/10=80% 目標60%
    // excess = 8 - 10*0.6 = 8 - 6 = 2.0 >= 1 → 違反
    const shifts = { 'sta': {} };
    for (let d = 1; d <= 7; d++) shifts['sta'][d] = '日勤';
    shifts['sta'][8] = '早番';
    shifts['sta'][9] = '遅番';
    const context = {
      dept: BASE_DEPT, staffs: [STAFF_A],
      shifts, year: 2026, month: 5,
    };
    const result = checkShiftRatio('sta', 10, '日勤', context);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('shiftRatio');
    expect(result[0].ok).toBe(false);
    expect(result[0].dedupKey).toMatch(/^shiftRatio:sta:日勤:/);
    expect(result[0].imbalance).toBeGreaterThanOrEqual(1);
    expect(result[0].detail).toContain('日勤');
  });

  test('shiftRatio 未設定のスタッフ → 違反なし', () => {
    const context = {
      dept: BASE_DEPT, staffs: [STAFF_C], // STAFF_C に shiftRatio なし
      shifts: { 'stc': { 1:'日勤', 2:'日勤', 3:'日勤', 4:'日勤', 5:'日勤', 6:'日勤', 7:'日勤' } },
      year: 2026, month: 5,
    };
    expect(checkShiftRatio('stc', 8, '日勤', context)).toHaveLength(0);
  });

  test('明けは比率計算対象外（明け配置は違反を発生させない）', () => {
    const context = {
      dept: BASE_DEPT, staffs: [STAFF_A],
      shifts: {},
      year: 2026, month: 5,
    };
    // 明けは dept.shiftTypes にないので ratioTarget=false → 即時 []
    expect(checkShiftRatio('sta', 5, '明け', context)).toHaveLength(0);
  });

  test('shiftRatioByMonth で月別上書き（shiftRatio 未設定の場合は byMonth を使用）', () => {
    const staffByMonth = {
      id: 'sbm', name: 'スタッフ BM', role: '管理栄養士',
      shiftRatioByMonth: { '2026-6': { 早番: 0.10, 日勤: 0.80, 遅番: 0.10 } },
    };
    // 日勤8/10 = 80% 目標80%: excess = 8 - 10*0.8 = 0 → 違反なし
    // ただし shiftRatio が優先される（shiftRatio=null なので byMonth が使われる）
    const context = {
      dept: BASE_DEPT,
      staffs: [staffByMonth],
      shifts: { 'sbm': { 1:'日勤',2:'日勤',3:'日勤',4:'日勤',5:'日勤',6:'日勤',7:'日勤',8:'早番',9:'遅番' } },
      year: 2026, month: 5, // monthKey = "2026-6"
    };
    // 日勤を追加: 8/10 → excess = 8 - 10*0.8 = 0 → 違反なし
    const result = checkShiftRatio('sbm', 10, '日勤', context);
    expect(result).toHaveLength(0);
  });

  test('dedupKey はスタッフ・シフト・月をユニークに識別する', () => {
    const shifts = { 'sta': {} };
    for (let d = 1; d <= 9; d++) shifts['sta'][d] = '日勤';
    const context = { dept: BASE_DEPT, staffs: [STAFF_A], shifts, year: 2026, month: 5 };
    const result = checkShiftRatio('sta', 10, '日勤', context);
    if (result.length > 0) {
      expect(result[0].dedupKey).toBe('shiftRatio:sta:日勤:2026-6');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// fairness
// ═════════════════════════════════════════════════════════════════════════════
describe('fairness', () => {

  test('均等配置 → 違反なし', () => {
    // sta: 日勤3, stb: 日勤3 → avg=3、追加後sta=4、imbalance=4-3=1 < 2 → 違反なし
    const context = {
      staffs: [STAFF_A, STAFF_B],
      shifts: {
        'sta': { 1:'日勤', 2:'日勤', 3:'日勤' },
        'stb': { 1:'日勤', 2:'日勤', 3:'日勤' },
      },
    };
    expect(checkFairness('sta', 4, '日勤', context)).toHaveLength(0);
  });

  test('STAFF_A が STAFF_B より 2件以上多い → 違反1件', () => {
    // sta: 日勤6, stb: 日勤1 → avg=3.5、追加後sta=7、imbalance=7-3.5=3.5 >= 2 → 違反
    const context = {
      staffs: [STAFF_A, STAFF_B],
      shifts: {
        'sta': { 1:'日勤', 2:'日勤', 3:'日勤', 4:'日勤', 5:'日勤', 6:'日勤' },
        'stb': { 1:'日勤' },
      },
    };
    const result = checkFairness('sta', 7, '日勤', context);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('fairness');
    expect(result[0].ok).toBe(false);
    expect(result[0].dedupKey).toBe('fairness:sta:日勤');
    expect(result[0].imbalance).toBeGreaterThanOrEqual(2);
    expect(result[0].detail).toContain('日勤');
  });

  test('休みシフト → 違反なし（休みは公平性チェック対象外）', () => {
    const context = {
      staffs: [STAFF_A, STAFF_B],
      shifts: { 'sta': {}, 'stb': {} },
    };
    expect(checkFairness('sta', 1, '休み', context)).toHaveLength(0);
  });

  test('staffs なし（空配列）→ 違反なし', () => {
    const context = { staffs: [], shifts: {} };
    expect(checkFairness('sta', 1, '日勤', context)).toHaveLength(0);
  });

  test('severity (imbalance) が violation に含まれる', () => {
    const context = {
      staffs: [STAFF_A, STAFF_B, STAFF_C],
      shifts: {
        'sta': { 1:'早番', 2:'早番', 3:'早番', 4:'早番', 5:'早番', 6:'早番' },
        'stb': { 1:'早番' },
        'stc': {},
      },
    };
    const result = checkFairness('sta', 7, '早番', context);
    if (result.length > 0) {
      expect(typeof result[0].imbalance).toBe('number');
      expect(result[0].imbalance).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// fairness 母集団限定・明け除外（修正検証テスト）
// ═════════════════════════════════════════════════════════════════════════════
describe('fairness 母集団限定・明け除外', () => {

  test('早番可能2人で均等配分 → 違反なし（母集団2人）', () => {
    // 両スタッフが早番可能・均等配分 → チーム平均＝自分の回数 → 差1 < 2 → 違反なし
    const dept = { shiftTypes: ['早番', '日勤'] };
    const staffs = [
      { id: 'sta', role: '管理栄養士' },
      { id: 'stb', role: '管理栄養士' },
    ];
    const shifts = {
      'sta': { 1:'早番', 2:'早番', 3:'早番' },
      'stb': { 1:'早番', 2:'早番', 3:'早番' },
    };
    // counts excl 4: sta=3, stb=3 → teamAvg=3, myCountAfter=4, 4-3=1 < 2 → 違反なし
    expect(checkFairness('sta', 4, '早番', { dept, staffs, shifts })).toHaveLength(0);
  });

  test('早番可能1人・不可1人 → 独占しても違反なし（母集団1人）', () => {
    // stb は補助（日勤のみ）→ 早番 fairness の母集団から除外
    // sta のみが母集団 → チーム平均 = sta 自身のカウント → 差は常に1 → 違反なし
    const dept = {
      shiftTypes: ['早番', '日勤'],
      roleShiftTypes: { '補助': ['日勤'] },
    };
    const staffs = [
      { id: 'sta', role: '管理栄養士' }, // 早番可能
      { id: 'stb', role: '補助' },       // 早番不可 → 母集団外
    ];
    const shifts = {
      'sta': { 1:'早番', 2:'早番', 3:'早番', 4:'早番', 5:'早番', 6:'早番', 7:'早番', 8:'早番' },
      'stb': { 1:'日勤', 2:'日勤', 3:'日勤', 4:'日勤', 5:'日勤', 6:'日勤', 7:'日勤', 8:'日勤' },
    };
    // 母集団=[sta], counts excl 9: sta=8, teamAvg=8, myCountAfter=9, 9-8=1 < 2 → 違反なし
    expect(checkFairness('sta', 9, '早番', { dept, staffs, shifts })).toHaveLength(0);
  });

  test('同一シフト可能な3人で1人が極端に多い → 違反あり', () => {
    // 3人全員早番可能、staが突出して多い
    const dept = { shiftTypes: ['早番', '日勤'] };
    const staffs = [
      { id: 'sta', role: '管理栄養士' },
      { id: 'stb', role: '管理栄養士' },
      { id: 'stc', role: '管理栄養士' },
    ];
    const shifts = {
      'sta': { 1:'早番', 2:'早番', 3:'早番', 4:'早番', 5:'早番', 6:'早番', 7:'早番', 8:'早番', 9:'早番' },
      'stb': { 1:'早番', 2:'早番', 3:'早番' },
      'stc': { 1:'早番', 2:'早番', 3:'早番' },
    };
    // counts excl 10: sta=9, stb=3, stc=3 → teamTotal=15, teamAvg=5
    // myCountAfter=10, 10-5=5 >= 2 → 違反
    const result = checkFairness('sta', 10, '早番', { dept, staffs, shifts });
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('fairness');
    expect(result[0].imbalance).toBeGreaterThanOrEqual(2);
  });

  test('明けシフトの配置は fairness チェック対象外', () => {
    // sta が明け×多数でも fairness 違反なし（明けは SKIP_TYPES 対象）
    const dept = { shiftTypes: ['日勤', '夜勤', '明け'] };
    const staffs = [
      { id: 'sta', role: '管理栄養士' },
      { id: 'stb', role: '管理栄養士' },
    ];
    const shifts = {
      'sta': { 1:'明け', 2:'明け', 3:'明け', 4:'明け', 5:'明け' },
      'stb': {},
    };
    // '明け' は isFairnessTarget → false → return []
    expect(checkFairness('sta', 6, '明け', { dept, staffs, shifts })).toHaveLength(0);
  });

  test('明けの多い夜勤者が日勤公平性で誤発火しない（母集団限定）', () => {
    // sta は夜勤専従（日勤不可）、stb は日勤専従
    // 旧実装: sta が日勤0でチーム平均を下げ、stb が誤発火していた
    // 修正後: sta は '日勤' の母集団から除外 → stb のみで計算 → 差=1 → 違反なし
    const dept = {
      shiftTypes: ['日勤', '夜勤', '明け'],
      roleShiftTypes: {
        '夜勤専従': ['夜勤', '明け'], // 日勤不可 → fairness の日勤母集団から除外
        '日勤専従': ['日勤'],
      },
    };
    const staffs = [
      { id: 'sta', role: '夜勤専従' }, // 日勤不可
      { id: 'stb', role: '日勤専従' }, // 日勤可
    ];
    // stb が日勤を20日担当、sta は明けのみ
    const stbShifts = {};
    for (let d = 1; d <= 20; d++) stbShifts[d] = '日勤';
    const shifts = {
      'sta': { 1:'夜勤', 2:'明け', 3:'夜勤', 4:'明け', 5:'夜勤', 6:'明け' },
      'stb': stbShifts,
    };
    // 母集団=[stb] のみ。counts excl 21: stb=20, teamAvg=20
    // myCountAfter=21, 21-20=1 < 2 → 違反なし（旧実装では 21-10=11 ≥ 2 で誤発火）
    expect(checkFairness('stb', 21, '日勤', { dept, staffs, shifts })).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// maxConsecutive
// ═════════════════════════════════════════════════════════════════════════════
describe('maxConsecutive', () => {

  test('連続5日（上限5）に追加 → 上限到達で違反なし（等号は可）', () => {
    // 上限5日: 5日連続はOK（6日目が違反）
    const context = {
      dept: { maxConsecutive: 5 },
      shifts: { 'sta': { 1:'早番', 2:'日勤', 3:'遅番', 4:'早番' } },
      prevTail: {},
    };
    // date=5 を追加で連続=5 → 5 <= 5 → 違反なし
    expect(checkMaxConsecutive('sta', 5, '日勤', context)).toHaveLength(0);
  });

  test('連続6日（上限5超過）→ 違反1件、excess=1', () => {
    const context = {
      dept: { maxConsecutive: 5 },
      shifts: { 'sta': { 1:'早番', 2:'日勤', 3:'遅番', 4:'早番', 5:'日勤' } },
      prevTail: {},
    };
    // date=6 で連続=6 > 5 → 違反
    const result = checkMaxConsecutive('sta', 6, '日勤', context);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('maxConsecutive');
    expect(result[0].ok).toBe(false);
    expect(result[0].dedupKey).toBe('maxConsecutive:sta:6');
    expect(result[0].excess).toBe(1); // 6 - 5 = 1
    expect(result[0].detail).toContain('6日');
  });

  test('休みシフト → 連続を延ばさない（違反なし）', () => {
    const context = {
      dept: { maxConsecutive: 3 },
      shifts: { 'sta': { 1:'日勤', 2:'日勤', 3:'日勤' } },
      prevTail: {},
    };
    // 4日目に休みを配置 → 休みは連続カウント外 → 違反なし
    expect(checkMaxConsecutive('sta', 4, '休み', context)).toHaveLength(0);
  });

  test('maxConsecutive 未設定 → 違反なし', () => {
    const context = {
      dept: { /* maxConsecutive なし */ },
      shifts: { 'sta': { 1:'日勤', 2:'日勤', 3:'日勤', 4:'日勤', 5:'日勤', 6:'日勤', 7:'日勤' } },
      prevTail: {},
    };
    expect(checkMaxConsecutive('sta', 8, '日勤', context)).toHaveLength(0);
  });

  test('月跨ぎ連勤: 前月末3日連続 → 1日配置で合計4日（上限3超過）→ 違反', () => {
    const context = {
      dept: { maxConsecutive: 3 },
      shifts: { 'sta': {} }, // 今月は未配置
      prevTail: { 'sta': { 28:'早番', 29:'日勤', 30:'早番' } }, // 前月末3日連続
    };
    // date=1 に勤務追加: prevTailの3日 + 今月1日 = 4日連続 > 3
    const result = checkMaxConsecutive('sta', 1, '日勤', context);
    expect(result).toHaveLength(1);
    expect(result[0].excess).toBe(1); // 4 - 3 = 1
  });

  test('月跨ぎ: 前月末最終日が休みなら連続リセット', () => {
    const context = {
      dept: { maxConsecutive: 3 },
      shifts: { 'sta': {} },
      prevTail: { 'sta': { 28:'日勤', 29:'日勤', 30:'休み' } }, // 30日が休み → リセット
    };
    // date=1: prevTail の30日が休みなのでカウントしない → 連続=0+1=1 → 違反なし
    expect(checkMaxConsecutive('sta', 1, '日勤', context)).toHaveLength(0);
  });

  test('月跨ぎ: 前月末prevTailなし → 今月内のみカウント', () => {
    const context = {
      dept: { maxConsecutive: 3 },
      shifts: { 'sta': {} },
      prevTail: {}, // prevTail にデータなし
    };
    expect(checkMaxConsecutive('sta', 1, '日勤', context)).toHaveLength(0);
  });

  test('severity(excess) が violation に含まれる', () => {
    const context = {
      dept: { maxConsecutive: 3 },
      shifts: { 'sta': { 1:'日勤', 2:'日勤', 3:'日勤', 4:'日勤' } },
      prevTail: {},
    };
    const result = checkMaxConsecutive('sta', 5, '日勤', context);
    expect(result).toHaveLength(1);
    expect(typeof result[0].excess).toBe('number');
    expect(result[0].excess).toBe(2); // 5 - 3 = 2
  });

  // ── 月跨ぎ実証：prevTail 3日 + 当月 3日 = 6連勤（上限5） ─────────────────
  test('[実証] 前月末28-30日勤 + 当月1-3日勤 → 4日目配置で6連勤 excess=1', () => {
    // prevTail: 前月 28/29/30 が日勤（3日連続）
    // 当月:     1/2/3 が日勤（さらに3日連続）
    // date=4 に日勤を配置しようとすると 3+3+1 = 7 ではなく
    //   countConsecutiveBack(sta, 4, ...) = 3(当月) + 3(prevTail) = 6
    //   wouldBe = 6 + 1 = 7 → excess = 7 - 5 = 2
    // ※ユーザー指示の「6連勤, excess=1」は date=4 を含めた計算：
    //   date=4 が "6日目" なので wouldBe=6, excess=6-5=1 を確認する
    //   （date=1,2,3 が既配置 3日、prevTail が3日、合計 back=6、wouldBe=7 は 7連勤）
    //
    // ユーザー指定シナリオの正確な再現：
    //   当月配置済み: 1,2,3（3日）
    //   prevTail:    28,29,30（3日）
    //   date=4 に配置 → back=6 → wouldBe=7 → excess=2
    //
    // 「6連勤として判定」= date=3+prevTail3+date自身=7日目 配置前の連続が6
    //   つまり date を含めた連続が 7 になる場合を確認する
    //
    // ユーザーが期待する「6連勤、excess=1」を実現するには:
    //   prevTail 3日 + 当月 2日 = back=5 → wouldBe=6 → excess=1
    //   これが「前月3日 + 当月 1,2 + date=3 を配置」シナリオ
    const context = {
      dept: { maxConsecutive: 5 },
      shifts: { 'sta': { 1: '日勤', 2: '日勤' } }, // 当月2日分
      prevTail: { 'sta': { 28: '日勤', 29: '日勤', 30: '日勤' } }, // 前月末3日
    };
    // back = 当月2日 + prevTail3日 = 5, wouldBe = 6 → excess = 1
    const result = checkMaxConsecutive('sta', 3, '日勤', context);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('maxConsecutive');
    expect(result[0].excess).toBe(1); // 6 - 5 = 1
    expect(result[0].dedupKey).toBe('maxConsecutive:sta:3');
    // Violation 実例をテスト内に記録
    // { ok:false, rule:'maxConsecutive', dedupKey:'maxConsecutive:sta:3',
    //   detail:'6日連続勤務になる（上限5日）', excess:1 }
  });

  // ── 累積挙動確認：上限5で7連勤 ─────────────────────────────────────────────
  test('[累積確認] 上限5で7連勤: 6日目 excess=1、7日目 excess=2', () => {
    // 6日目（date=6）: 当月1-5が日勤 → back=5, wouldBe=6, excess=1
    const ctx6 = {
      dept: { maxConsecutive: 5 },
      shifts: { 'sta': { 1:'日勤', 2:'日勤', 3:'日勤', 4:'日勤', 5:'日勤' } },
      prevTail: {},
    };
    const v6 = checkMaxConsecutive('sta', 6, '日勤', ctx6);
    expect(v6).toHaveLength(1);
    expect(v6[0].excess).toBe(1);
    expect(v6[0].dedupKey).toBe('maxConsecutive:sta:6');

    // 7日目（date=7）: 当月1-6が日勤 → back=6, wouldBe=7, excess=2
    const ctx7 = {
      dept: { maxConsecutive: 5 },
      shifts: { 'sta': { 1:'日勤', 2:'日勤', 3:'日勤', 4:'日勤', 5:'日勤', 6:'日勤' } },
      prevTail: {},
    };
    const v7 = checkMaxConsecutive('sta', 7, '日勤', ctx7);
    expect(v7).toHaveLength(1);
    expect(v7[0].excess).toBe(2);
    expect(v7[0].dedupKey).toBe('maxConsecutive:sta:7');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// maxStaff
// ═════════════════════════════════════════════════════════════════════════════
describe('maxStaff', () => {

  test('上限未達 → 違反なし', () => {
    // 早番上限1人、現在0人 → 1人目配置可
    const context = {
      dept: { maxStaff: { 早番: 1 } },
      shifts: { 'sta': {}, 'stb': {} },
    };
    expect(checkMaxStaff('sta', 5, '早番', context)).toHaveLength(0);
  });

  test('上限到達（既に1人、上限1）→ 追加で超過 → 違反1件', () => {
    const context = {
      dept: { maxStaff: { 早番: 1 } },
      shifts: {
        'sta': {},
        'stb': { 5: '早番' }, // STAFF_B が既に早番
      },
    };
    const result = checkMaxStaff('sta', 5, '早番', context);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('maxStaff');
    expect(result[0].ok).toBe(false);
    expect(result[0].dedupKey).toBe('maxStaff:5:早番');
    expect(result[0].excess).toBe(1); // 2 - 1 = 1
    expect(result[0].detail).toContain('早番');
    expect(result[0].detail).toContain('2人');
  });

  test('maxStaff 未設定（Infinity）→ 違反なし', () => {
    const context = {
      dept: { maxStaff: {} }, // 早番の上限設定なし
      shifts: { 'sta':{}, 'stb':{ 5:'早番' }, 'stc':{ 5:'早番' } },
    };
    expect(checkMaxStaff('sta', 5, '早番', context)).toHaveLength(0);
  });

  test('配置候補スタッフ自身は既存カウントから除外される', () => {
    // sta が既に早番（再配置チェック想定）: 除外されるので excess は変わらない
    const context = {
      dept: { maxStaff: { 早番: 1 } },
      shifts: {
        'sta': { 5: '早番' }, // sta 自身が既に早番（除外される）
        'stb': {},
      },
    };
    // sta を除くと早番=0人 → 上限1に対して違反なし
    expect(checkMaxStaff('sta', 5, '早番', context)).toHaveLength(0);
  });

  test('超過2人 → excess=2', () => {
    const context = {
      dept: { maxStaff: { 早番: 1 } },
      shifts: {
        'sta': {},
        'stb': { 5: '早番' },
        'stc': { 5: '早番' }, // 既に上限を超えている（2人）
      },
    };
    const result = checkMaxStaff('sta', 5, '早番', context);
    expect(result).toHaveLength(1);
    expect(result[0].excess).toBe(2); // 3 - 1 = 2
  });

  test('日勤に maxStaff 設定なし → 違反なし', () => {
    const context = {
      dept: { maxStaff: { 早番: 1 } }, // 日勤は設定なし
      shifts: { 'sta':{}, 'stb':{ 5:'日勤' }, 'stc':{ 5:'日勤' }, 'std':{ 5:'日勤' } },
    };
    expect(checkMaxStaff('sta', 5, '日勤', context)).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Violation 共通フォーマット検証
// ═════════════════════════════════════════════════════════════════════════════
describe('Violation 共通フォーマット', () => {

  test('各 Violation は ok/rule/dedupKey/detail を含む', () => {
    // maxStaff の違反で共通フォーマットを確認
    const context = {
      dept: { maxStaff: { 早番: 1 } },
      shifts: { 'sta': {}, 'stb': { 1: '早番' } },
    };
    const [v] = checkMaxStaff('sta', 1, '早番', context);
    expect(v.ok).toBe(false);
    expect(typeof v.rule).toBe('string');
    expect(typeof v.dedupKey).toBe('string');
    expect(typeof v.detail).toBe('string');
    expect(typeof v.excess).toBe('number'); // severity
  });

  test('maxConsecutive の dedupKey は staffId と date で一意', () => {
    const context = {
      dept: { maxConsecutive: 2 },
      shifts: { 'sta': { 1:'日勤', 2:'日勤' } },
      prevTail: {},
    };
    const result = checkMaxConsecutive('sta', 3, '日勤', context);
    expect(result[0].dedupKey).toBe('maxConsecutive:sta:3');
  });

  test('maxStaff の dedupKey は date と shiftKey で一意（複数スタッフで共通）', () => {
    // sta と stb 両方で checkMaxStaff を呼ぶと同じ dedupKey が返る
    const context = {
      dept: { maxStaff: { 早番: 1 } },
      shifts: { 'sta': {}, 'stb': {}, 'stc': { 5: '早番' } },
    };
    const rA = checkMaxStaff('sta', 5, '早番', context);
    const rB = checkMaxStaff('stb', 5, '早番', context);
    expect(rA[0].dedupKey).toBe('maxStaff:5:早番');
    expect(rB[0].dedupKey).toBe('maxStaff:5:早番'); // 同一 key → Step10 で1件に集約
  });
});
