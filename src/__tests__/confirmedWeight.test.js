/**
 * confirmed フラグによる学習重み付けテスト
 *
 * 確認事項:
 *   a. confirmed:true の月は通常 weight がそのまま使用される
 *   b. confirmed:false（下書き）の月は weight が 0.3 倍になる
 *   c. confirmed キーが存在しない月（旧データ）は通常 weight を使用する
 */
import { describe, test, expect } from 'vitest';
import { computeLearnedTrend } from '../engine/core.js';

const YEAR = 2026, MONTH_RAW = 1; // 2026年1月
const staffList = [{ id: 's1', name: 'スタッフA', dept: 'dept1' }];
const shiftKey = `shifts_${YEAR}_${MONTH_RAW}_dept1`;

// 同一シフトパターン（日勤のみ10件）で confirmed フラグのみ変えて比較
const shifts = { s1: { 1:'日勤',2:'日勤',3:'日勤',4:'日勤',5:'日勤',6:'日勤',7:'日勤',8:'日勤',9:'日勤',10:'日勤' } };

describe('computeLearnedTrend confirmed weight', () => {
  test('a. confirmed:true の月は通常 weight（freq が高い）', () => {
    const db = {
      [shiftKey]: shifts,
      [`confirmed_${YEAR}_${MONTH_RAW}_dept1`]: true,
    };
    const trend = computeLearnedTrend(db, staffList);
    expect(trend['スタッフA']?.['日勤']).toBeGreaterThan(0);
  });

  test('b. confirmed:false の月は通常より freq が低くなる（weight×0.3）', () => {
    const dbConfirmed = {
      [shiftKey]: shifts,
      [`confirmed_${YEAR}_${MONTH_RAW}_dept1`]: true,
    };
    const dbDraft = {
      [shiftKey]: shifts,
      [`confirmed_${YEAR}_${MONTH_RAW}_dept1`]: false,
    };
    const trendConfirmed = computeLearnedTrend(dbConfirmed, staffList);
    const trendDraft = computeLearnedTrend(dbDraft, staffList);
    // freq は totals で正規化されるため freq 値自体は同じ（全て日勤）
    // 代わりに totals の差異を間接的に確認：
    // totals が小さいほど alpha が小さく freq が小さい（deptAvg補正なし時）
    // confirmed: totals=weight*10, draft: totals=weight*0.3*10 → alpha 差 → freq 差
    const freqConfirmed = trendConfirmed['スタッフA']?.['日勤'] ?? 0;
    const freqDraft = trendDraft['スタッフA']?.['日勤'] ?? 0;
    // confirmed の alpha は draft より大きい → confirmed の freq が高いはず
    expect(freqConfirmed).toBeGreaterThan(freqDraft);
  });

  test('c. confirmed キーなし（旧データ）は通常 weight として扱われる', () => {
    // confirmed キーあり(true) vs なし で freq が同一になるはず
    const dbWithKey = {
      [shiftKey]: shifts,
      [`confirmed_${YEAR}_${MONTH_RAW}_dept1`]: true,
    };
    const dbNoKey = {
      [shiftKey]: shifts,
      // confirmed キーなし
    };
    const trendWith = computeLearnedTrend(dbWithKey, staffList);
    const trendNo   = computeLearnedTrend(dbNoKey,   staffList);
    // どちらも同じ weight で同じ freq
    expect(trendWith['スタッフA']?.['日勤']).toBeCloseTo(trendNo['スタッフA']?.['日勤'] ?? 0, 5);
  });
});
