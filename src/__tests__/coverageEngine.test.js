/**
 * coverageEngine.js テスト（Step 6）
 *
 * 1. App.jsx版 calcDayCoverageResult と coverageEngine.js版の出力完全一致
 * 2. fillGaps: shortage検出テスト（必要2人・実配置1人 → shortage:1）
 */

import { describe, test, expect } from 'vitest';
import {
  buildShiftIntervals,
  buildDayIntervals,
  coverageGaps,
  calcDayCoverageResult,
  fillGaps,
} from '../lib/timeAxisEngine/coverageEngine.js';

// ─────────────────────────────────────────────────────────────────────────────
// App.jsx版 calcDayCoverageResult を inline 再現（変更なしの正確なコピー）
// テスト内でのみ使用する。App.jsx の実装が変わった場合はここも合わせて更新する。
// ─────────────────────────────────────────────────────────────────────────────
function timeToMins(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcDayCoverageResult_AppJsx(dayShiftValues, rules, shiftIntervals) {
  const results = [];
  for (const rule of rules) {
    const rS = timeToMins(rule.start), rE = timeToMins(rule.end);
    if (rS == null || rE == null || rS >= rE) continue;
    let maxShortage = 0, shortageSlots = 0, gapStart = null;
    const gaps = [];
    for (let m = rS; m < rE; m += 15) {
      const cnt = dayShiftValues.reduce((c, sk) => {
        if (!sk || !shiftIntervals[sk]) return c;
        const iv = shiftIntervals[sk];
        return (iv.start <= m && m < iv.end) ? c + 1 : c;
      }, 0);
      const shortage = Math.max(0, rule.min - cnt);
      if (shortage > 0) {
        maxShortage = Math.max(maxShortage, shortage);
        shortageSlots++;
        if (gapStart == null) gapStart = m;
      } else if (gapStart != null) {
        gaps.push({ start: gapStart, end: m, maxShortage });
        gapStart = null; maxShortage = 0;
      }
    }
    if (gapStart != null) gaps.push({ start: gapStart, end: rE, maxShortage });
    results.push({
      rule,
      gaps,
      shortageSlots,
      totalShortageUnits: shortageSlots > 0 ? shortageSlots * (gaps.reduce((s, g) => Math.max(s, g.maxShortage), 0)) : 0,
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// テスト用フィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

// 通常部署（標準時刻）
const dept = {
  shiftTypes: ['早番', '日勤', '遅番'],
  // shiftTimes 未設定 → DEFAULT_SHIFT_TIMES フォールバック
};

// buildShiftIntervals 相当（App.jsx版はモジュール外なので手動定義）
// App.jsx DEFAULT_SHIFT_TIMES と同一
const SHIFT_INTERVALS_FIXTURE = {
  早番: { start: 7 * 60,      end: 16 * 60 },       // 420-960
  日勤: { start: 9 * 60,      end: 18 * 60 },       // 540-1080
  遅番: { start: 11 * 60 + 30,end: 20 * 60 + 30 },  // 690-1230
};

const rules = [
  { start: '09:00', end: '17:00', min: 2 }, // 09:00-17:00 に最低2人
  { start: '17:00', end: '20:00', min: 1 }, // 17:00-20:00 に最低1人
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. calcDayCoverageResult — App.jsx版と完全一致テスト
// ─────────────────────────────────────────────────────────────────────────────
describe('calcDayCoverageResult — App.jsx版との完全一致', () => {

  test('違反なし: 2人配置（早番+日勤）→ 09:00-16:00 はカバー、16:00-17:00 は日勤のみ1人', () => {
    const dayShifts = ['早番', '日勤'];
    const appResult  = calcDayCoverageResult_AppJsx(dayShifts, rules, SHIFT_INTERVALS_FIXTURE);
    const engResult  = calcDayCoverageResult(dayShifts, rules, SHIFT_INTERVALS_FIXTURE);
    // App.jsx版と完全一致することが主な検証
    expect(engResult).toEqual(appResult);
    // 早番(07:00-16:00)+日勤(09:00-18:00): 16:00-17:00 は日勤のみ → min:2 に対して shortage:1
    const r0 = engResult[0]; // rule: 09:00-17:00 min:2
    expect(r0.gaps).toHaveLength(1);
    expect(r0.gaps[0]).toMatchObject({ start: 960, end: 1020, maxShortage: 1 }); // 16:00-17:00
    // rule: 17:00-20:00 min:1 → 日勤(ends 18:00)が1人カバー → 17:00-18:00 OK、18:00-20:00 はギャップ
    const r1 = engResult[1];
    expect(r1.gaps).toHaveLength(1); // 18:00-20:00 に日勤終了後ギャップ
  });

  test('不足あり: 1人配置（日勤のみ）→ 09:00-17:00 に shortage:1', () => {
    const dayShifts = ['日勤'];
    const appResult  = calcDayCoverageResult_AppJsx(dayShifts, rules, SHIFT_INTERVALS_FIXTURE);
    const engResult  = calcDayCoverageResult(dayShifts, rules, SHIFT_INTERVALS_FIXTURE);
    expect(engResult).toEqual(appResult);
    // ルール0（09:00-17:00 min:2）に不足が発生
    const r0 = engResult[0];
    expect(r0.gaps.length).toBeGreaterThan(0);
    expect(r0.gaps[0].maxShortage).toBe(1);
  });

  test('全員休み: 全シフト空 → 全ルールで shortage = min', () => {
    const dayShifts = ['', '', ''];
    const appResult  = calcDayCoverageResult_AppJsx(dayShifts, rules, SHIFT_INTERVALS_FIXTURE);
    const engResult  = calcDayCoverageResult(dayShifts, rules, SHIFT_INTERVALS_FIXTURE);
    expect(engResult).toEqual(appResult);
    expect(engResult[0].gaps[0].maxShortage).toBe(2); // min:2 全不足
    expect(engResult[1].gaps[0].maxShortage).toBe(1); // min:1 全不足
  });

  test('rules が空配列 → 結果も空配列', () => {
    const dayShifts = ['早番', '日勤'];
    const appResult  = calcDayCoverageResult_AppJsx(dayShifts, [], SHIFT_INTERVALS_FIXTURE);
    const engResult  = calcDayCoverageResult(dayShifts, [], SHIFT_INTERVALS_FIXTURE);
    expect(engResult).toEqual(appResult);
    expect(engResult).toHaveLength(0);
  });

  test('rS >= rE のルールはスキップされる（App.jsx と同一）', () => {
    const badRules = [{ start: '17:00', end: '09:00', min: 1 }]; // start > end
    const dayShifts = ['日勤'];
    const appResult  = calcDayCoverageResult_AppJsx(dayShifts, badRules, SHIFT_INTERVALS_FIXTURE);
    const engResult  = calcDayCoverageResult(dayShifts, badRules, SHIFT_INTERVALS_FIXTURE);
    expect(engResult).toEqual(appResult);
    expect(engResult).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. buildShiftIntervals — DEFAULT_SHIFT_TIMES フォールバック確認
// ─────────────────────────────────────────────────────────────────────────────
describe('buildShiftIntervals', () => {

  test('shiftTimes 未設定 → DEFAULT_SHIFT_TIMES で区間が構築される', () => {
    const iv = buildShiftIntervals(dept);
    expect(iv['早番']).toEqual({ start: 420, end: 960 });   // 07:00-16:00
    expect(iv['日勤']).toEqual({ start: 540, end: 1080 });  // 09:00-18:00
    expect(iv['遅番']).toEqual({ start: 690, end: 1230 });  // 11:30-20:30
  });

  test('夜勤（日跨ぎ）は end += 1440 で正規化される', () => {
    const deptWithNight = { shiftTypes: ['夜勤'] };
    const iv = buildShiftIntervals(deptWithNight);
    // 16:30(990) → 09:30(570) → 570 < 990 なので 570+1440=2010
    expect(iv['夜勤']).toEqual({ start: 990, end: 2010 });
  });

  test('shiftTimes で上書きされた場合はその値が使われる', () => {
    const deptCustom = {
      shiftTypes: ['早番'],
      shiftTimes: { 早番: { start: '06:00', end: '15:00' } },
    };
    const iv = buildShiftIntervals(deptCustom);
    expect(iv['早番']).toEqual({ start: 360, end: 900 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. fillGaps — shortage 検出テスト
// ─────────────────────────────────────────────────────────────────────────────
describe('fillGaps', () => {

  test('必要2人・実配置1人（日勤のみ）→ shortage:1 が検出される', () => {
    const shifts = {
      'sta': { 5: '日勤' },   // 1人だけ日勤
      'stb': { 5: '休み' },   // 休み
    };
    const context = {
      dept: { ...dept, coverageRules: rules },
      shifts,
      days: 31,
    };

    const gaps = fillGaps(5, context);
    // ルール0（09:00-17:00 min:2）に対して gap が存在するはず
    const gap0 = gaps.find(g => g.ruleStart === '09:00' && g.ruleEnd === '17:00');
    expect(gap0).toBeDefined();
    expect(gap0.shortage).toBe(1);      // 必要2人 - 配置1人
    expect(gap0.maxShortage).toBe(1);
    // coveringShifts: gap(09:00-17:00)をカバーできるシフト種別
    expect(gap0.coveringShifts).toContain('早番'); // 07:00-16:00 → 重なる
    expect(gap0.coveringShifts).toContain('日勤'); // 09:00-18:00 → 重なる
  });

  test('必要1人・実配置1人 → gaps 空配列', () => {
    const rulesMin1 = [{ start: '09:00', end: '17:00', min: 1 }];
    const shifts = { 'sta': { 10: '日勤' } };
    const context = {
      dept: { ...dept, coverageRules: rulesMin1 },
      shifts,
      days: 31,
    };
    const gaps = fillGaps(10, context);
    expect(gaps).toHaveLength(0);
  });

  test('coverageRules 未設定 → 空配列を返す', () => {
    const shifts = { 'sta': { 1: '日勤' } };
    const context = { dept, shifts, days: 31 }; // coverageRules なし
    const gaps = fillGaps(1, context);
    expect(gaps).toHaveLength(0);
  });

  test('全員休み → coveringShifts が正しく列挙される', () => {
    const shifts = { 'sta': { 3: '休み' }, 'stb': { 3: '休み' } };
    const context = {
      dept: { ...dept, coverageRules: [{ start: '09:00', end: '18:00', min: 2 }] },
      shifts,
      days: 31,
    };
    const gaps = fillGaps(3, context);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].shortage).toBe(2);
    // 09:00-18:00 をカバーできるシフト
    expect(gaps[0].coveringShifts.length).toBeGreaterThan(0);
    expect(gaps[0].coveringShifts).toContain('日勤');
  });
});
