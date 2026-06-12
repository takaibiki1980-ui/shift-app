/**
 * learningEngine.js テスト（Step 7）
 *
 * 対象: rankCandidates
 */

import { describe, test, expect } from 'vitest';
import { rankCandidates } from '../lib/timeAxisEngine/learningEngine.js';

// ─────────────────────────────────────────────────────────────────────────────
// フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

// dowShiftRate: getDay() インデックス (0=日〜6=土)
// dowRestRate : (getDay()+6)%7 インデックス (0=月〜6=日)
const TREND = {
  早番: 0.30,   // 全体傾向
  日勤: 0.50,
  遅番: 0.20,
  dowShiftRate: [
    { 早番: 0.20, 日勤: 0.60, 遅番: 0.20 }, // 0: 日曜
    { 早番: 0.10, 日勤: 0.70, 遅番: 0.20 }, // 1: 月曜 ← 日勤が圧倒的に高い
    null,                                     // 2: 火曜（データ薄）
    { 早番: 0.30, 日勤: 0.50, 遅番: 0.20 }, // 3: 水曜
    { 早番: 0.35, 日勤: 0.45, 遅番: 0.20 }, // 4: 木曜
    { 早番: 0.25, 日勤: 0.55, 遅番: 0.20 }, // 5: 金曜
    { 早番: 0.30, 日勤: 0.60, 遅番: 0.10 }, // 6: 土曜
  ],
  dowRestRate: [0.28, 0.25, 0.30, 0.27, 0.31, 0.40, 0.35],
  transitionRate: {
    早番: { 日勤: 0.50, 早番: 0.30, 遅番: 0.20 },
    日勤: { 早番: 0.25, 遅番: 0.40, 日勤: 0.35 },
    遅番: { 日勤: 0.60, 遅番: 0.30, 早番: 0.10 },
  },
};

const learnedTrend = { '山田 花子': TREND };
const staff = { id: 'eiyo_0', name: '山田 花子' };
const candidates = ['早番', '日勤', '遅番'];

// 2026-06-15 = 月曜（getDay()=1）
// context の year/month は 0-indexed month（Date コンストラクタ準拠）
const CTX_2026_06 = { year: 2026, month: 5 }; // 2026年6月

// ─────────────────────────────────────────────────────────────────────────────
// 1. 学習データなし → 全候補 score=0、入力順維持
// ─────────────────────────────────────────────────────────────────────────────
describe('rankCandidates — 学習データなし', () => {

  test('learnedTrend が null → 全候補 score=0、入力順を維持', () => {
    const result = rankCandidates(staff, 15, candidates, null, CTX_2026_06);
    expect(result).toHaveLength(3);
    expect(result.every(r => r.score === 0)).toBe(true);
    // 入力順維持
    expect(result.map(r => r.shiftKey)).toEqual(['早番', '日勤', '遅番']);
  });

  test('スタッフ未収録（getStaffTrend=null）→ 全候補 score=0、入力順維持', () => {
    const unknownStaff = { id: 'x', name: '存在しない スタッフ' };
    const result = rankCandidates(unknownStaff, 15, candidates, learnedTrend, CTX_2026_06);
    expect(result.every(r => r.score === 0)).toBe(true);
    expect(result.map(r => r.shiftKey)).toEqual(['早番', '日勤', '遅番']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 曜日傾向が強いシフトが上位になること
// ─────────────────────────────────────────────────────────────────────────────
describe('rankCandidates — 曜日傾向による順位付け', () => {

  // 月曜 dowShiftRate[1] = { 早番:0.10, 日勤:0.70, 遅番:0.20 }
  // DOWスコア: 日勤=0.70×20=14、遅番=0.20×20=4、早番=0.10×20=2
  // 全体スコア: 日勤=0.50×10=5、早番=0.30×10=3、遅番=0.20×10=2
  // 合計: 日勤=19、遅番=6、早番=5 → 日勤が1位
  test('月曜(2026-06-15)は dowShiftRate[1] が適用され、日勤が1位', () => {
    // 2026-06-15 = getDay()=1
    expect(new Date(2026, 5, 15).getDay()).toBe(1);

    const context = { ...CTX_2026_06, currentShifts: {}, prevTail: {} }; // prevShift なし
    const result = rankCandidates(staff, 15, candidates, learnedTrend, context);

    expect(result[0].shiftKey).toBe('日勤');
    // DOW=0.70×20=14 + 全体=0.50×10=5 = 19
    expect(result[0].score).toBeCloseTo(19, 5);
  });

  test('曜日データ薄(null)の火曜は DOW スコアが付かず、全体傾向のみで順位付け', () => {
    // 2026-06-16 = 火曜（getDay()=2）、dowShiftRate[2]=null
    expect(new Date(2026, 5, 16).getDay()).toBe(2);

    const context = { ...CTX_2026_06, currentShifts: {}, prevTail: {} };
    const result = rankCandidates(staff, 16, candidates, learnedTrend, context);

    // DOWスコアなし、全体傾向のみ: 日勤=5、早番=3、遅番=2
    expect(result[0].shiftKey).toBe('日勤');
    expect(result[0].score).toBeCloseTo(5, 5);  // 0.50×10
    expect(result[1].shiftKey).toBe('早番');
    expect(result[1].score).toBeCloseTo(3, 5);  // 0.30×10
    expect(result[2].shiftKey).toBe('遅番');
    expect(result[2].score).toBeCloseTo(2, 5);  // 0.20×10
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. transitionRate が順位に影響すること
// ─────────────────────────────────────────────────────────────────────────────
describe('rankCandidates — 遷移傾向の影響', () => {

  // 前日=遅番 → transitionRate.遅番 = { 日勤:0.60, 遅番:0.30, 早番:0.10 }
  // 月曜 DOW: 日勤=14、遅番=4、早番=2
  // 遷移スコア: 日勤=0.60×500=300、遅番=0.30×500=150、早番=0.10×500=50
  // 全体スコア: 日勤=5、遅番=2、早番=3
  // 合計: 日勤=319、遅番=156、早番=55
  test('前日=遅番のとき、遷移傾向（日勤:0.60）が加算されて日勤の score が最大', () => {
    const context = {
      ...CTX_2026_06,
      currentShifts: { 'eiyo_0': { 14: '遅番' } }, // date=15、前日=14=遅番
      prevTail: {},
    };
    const result = rankCandidates(staff, 15, candidates, learnedTrend, context);

    expect(result[0].shiftKey).toBe('日勤');
    // DOW=14 + 遷移=300 + 全体=5 = 319
    expect(result[0].score).toBeCloseTo(319, 5);
    // 遅番: DOW=4 + 遷移=150 + 全体=2 = 156
    expect(result[1].shiftKey).toBe('遅番');
    expect(result[1].score).toBeCloseTo(156, 5);
  });

  test('前日=早番のとき、transitionRate.早番 が適用される', () => {
    // transitionRate.早番 = { 日勤:0.50, 早番:0.30, 遅番:0.20 }
    // 月曜: 日勤 DOW=14+遷移=250+全体=5=269
    const context = {
      ...CTX_2026_06,
      currentShifts: { 'eiyo_0': { 14: '早番' } },
      prevTail: {},
    };
    const result = rankCandidates(staff, 15, candidates, learnedTrend, context);

    expect(result[0].shiftKey).toBe('日勤');
    expect(result[0].score).toBeCloseTo(269, 5); // 14+250+5
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 月初1日の遷移スコアが prevTail を参照して計算されること
// ─────────────────────────────────────────────────────────────────────────────
describe('rankCandidates — 月初(date=1)の prevTail 参照', () => {

  test('date=1 のとき getPrevShift(prevTail) で前月末シフトを解決する', () => {
    // 2026-06-01 = 月曜（getDay()=1）
    expect(new Date(2026, 5, 1).getDay()).toBe(1);

    // prevTail の最大 dayNum=30 が前日シフト → prevShift='早番'
    // transitionRate.早番.日勤=0.50 → 0.50×500=250
    const context = {
      ...CTX_2026_06,
      currentShifts: {},
      prevTail: { 'eiyo_0': { 28: '遅番', 29: '日勤', 30: '早番' } },
    };
    const result = rankCandidates(staff, 1, candidates, learnedTrend, context);

    expect(result[0].shiftKey).toBe('日勤');
    // 月曜DOW=14 + transitionRate.早番.日勤=0.50×500=250 + 全体=5 = 269
    expect(result[0].score).toBeCloseTo(269, 5);
  });

  test('date=1 で prevTail なし → 遷移スコア=0（DOW+全体のみ）', () => {
    const context = { ...CTX_2026_06, currentShifts: {}, prevTail: {} };
    const result = rankCandidates(staff, 1, candidates, learnedTrend, context);

    // 遷移なし: 日勤=DOW14+全体5=19
    expect(result[0].shiftKey).toBe('日勤');
    expect(result[0].score).toBeCloseTo(19, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. transitionRate が undefined のスタッフ（新人）→ 遷移スコア0で他要素のみ順位付け
// ─────────────────────────────────────────────────────────────────────────────
describe('rankCandidates — 新人（transitionRate なし）', () => {

  const NEWBIE_TREND = {
    早番: 0.20,
    日勤: 0.60,
    遅番: 0.20,
    dowShiftRate: TREND.dowShiftRate,
    dowRestRate: TREND.dowRestRate,
    // transitionRate フィールドなし（データ10件未満）
  };
  const newbieLearnedTrend = { '新人 スタッフ': NEWBIE_TREND };
  const newbie = { id: 'new_0', name: '新人 スタッフ' };

  test('transitionRate undefined → 遷移スコア=0、DOW+全体のみで順位付け', () => {
    // 前日=遅番があっても transitionRate がないので遷移スコア=0
    const context = {
      ...CTX_2026_06,
      currentShifts: { 'new_0': { 14: '遅番' } },
      prevTail: {},
    };
    const result = rankCandidates(newbie, 15, candidates, newbieLearnedTrend, context);

    // 月曜 DOW: 早番=0.10×20=2、日勤=0.70×20=14、遅番=0.20×20=4
    // 全体: 日勤=0.60×10=6、早番=0.20×10=2、遅番=0.20×10=2
    // 合計（遷移なし）: 日勤=20、遅番=6、早番=4
    expect(result[0].shiftKey).toBe('日勤');
    expect(result[0].score).toBeCloseTo(20, 5);   // 14+6
    // W_TRANSITION=500 が加算されていない（スコアが小さい）
    expect(result[0].score).toBeLessThan(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. score 降順で返ること
// ─────────────────────────────────────────────────────────────────────────────
describe('rankCandidates — score 降順保証', () => {

  test('返り値が score 降順になっていること', () => {
    const context = {
      ...CTX_2026_06,
      currentShifts: { 'eiyo_0': { 14: '遅番' } },
      prevTail: {},
    };
    const result = rankCandidates(staff, 15, candidates, learnedTrend, context);

    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
    }
  });

  test('全候補 score=0 の場合も配列長は candidates と一致', () => {
    const result = rankCandidates(staff, 15, ['早番', '日勤', '遅番', '夜勤'], null, CTX_2026_06);
    expect(result).toHaveLength(4);
    expect(result.every(r => r.score === 0)).toBe(true);
  });
});
