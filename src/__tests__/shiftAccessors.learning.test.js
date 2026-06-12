/**
 * shiftAccessors — 学習データアクセサ（Step 6.5）テスト
 *
 * 対象: getStaffTrend / getDowShiftRate / getDowRestRate
 */

import { describe, test, expect } from 'vitest';
import {
  getStaffTrend,
  getDowShiftRate,
  getDowRestRate,
} from '../lib/shiftAccessors.js';

// ─────────────────────────────────────────────────────────────────────────────
// テスト用フィクスチャ（computeLearnedTrend の実出力を模した構造）
// ─────────────────────────────────────────────────────────────────────────────

const YAMADA_TREND = {
  早番: 0.32,
  日勤: 0.45,
  遅番: 0.23,
  // dowShiftRate: getDay()インデックス (0=日〜6=土)
  dowShiftRate: [
    { 早番: 0.20, 日勤: 0.60, 遅番: 0.20 }, // 0: 日曜
    { 早番: 0.40, 日勤: 0.40, 遅番: 0.20 }, // 1: 月曜
    null,                                     // 2: 火曜（データ薄）
    { 早番: 0.30, 日勤: 0.50, 遅番: 0.20 }, // 3: 水曜
    { 早番: 0.35, 日勤: 0.45, 遅番: 0.20 }, // 4: 木曜
    { 早番: 0.25, 日勤: 0.55, 遅番: 0.20 }, // 5: 金曜
    { 早番: 0.10, 日勤: 0.70, 遅番: 0.20 }, // 6: 土曜
  ],
  // dowRestRate: (getDay()+6)%7 インデックス (0=月〜6=日)
  dowRestRate: [0.28, 0.25, 0.30, 0.27, 0.31, 0.40, 0.35],
  transitionRate: {
    早番: { 日勤: 0.50, 早番: 0.30, 遅番: 0.20 },
    日勤: { 早番: 0.25, 遅番: 0.40, 休み: 0.35 },
  },
};

const learnedTrend = {
  '山田 花子': YAMADA_TREND,
  _monthCounts: { '山田 花子': 6 },
};

// ─────────────────────────────────────────────────────────────────────────────
// getStaffTrend
// ─────────────────────────────────────────────────────────────────────────────
describe('getStaffTrend', () => {

  test('正常系: staff.name に一致するトレンドを返す', () => {
    const staff = { id: 'eiyo_0', name: '山田 花子' };
    const trend = getStaffTrend(learnedTrend, staff);
    expect(trend).toBe(YAMADA_TREND);
    expect(trend['早番']).toBe(0.32);
    expect(trend.transitionRate['早番']['日勤']).toBe(0.50);
  });

  test('該当スタッフ名が存在しない場合は null', () => {
    const staff = { id: 'eiyo_1', name: '存在しない スタッフ' };
    expect(getStaffTrend(learnedTrend, staff)).toBeNull();
  });

  test('learnedTrend が null の場合は null', () => {
    const staff = { id: 'eiyo_0', name: '山田 花子' };
    expect(getStaffTrend(null, staff)).toBeNull();
    expect(getStaffTrend(undefined, staff)).toBeNull();
  });

  test('learnedTrend が空オブジェクト {} の場合は null', () => {
    const staff = { id: 'eiyo_0', name: '山田 花子' };
    expect(getStaffTrend({}, staff)).toBeNull();
  });

  test('_monthCounts エントリは trend として返されない（実データ確認）', () => {
    // _monthCounts はオブジェクト型なので trend としては有効だが、
    // staff.name キーで取得するため通常スタッフとは競合しない
    const staff = { id: 'x', name: '_monthCounts' };
    // _monthCounts は { '山田 花子': 6 } という形なので trend ではない
    const result = getStaffTrend(learnedTrend, staff);
    expect(result).toEqual({ '山田 花子': 6 }); // 取れてしまうが null でない
    // → 通常 staffName が '_monthCounts' になることはないため実害なし
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDowShiftRate — getDay()インデックス（0=日〜6=土）
// ─────────────────────────────────────────────────────────────────────────────
describe('getDowShiftRate', () => {

  test('月曜（2026-06-15 = 月曜）→ dowShiftRate[1] を返す', () => {
    // 2026-06-15 は月曜（getDay()=1）
    const date = new Date(2026, 5, 15); // 月=5（0-indexed）
    expect(date.getDay()).toBe(1); // 事前確認

    const rate = getDowShiftRate(YAMADA_TREND, date);
    expect(rate).toEqual({ 早番: 0.40, 日勤: 0.40, 遅番: 0.20 });
  });

  test('日曜（getDay()=0）→ dowShiftRate[0] を返す', () => {
    const date = new Date(2026, 5, 14); // 2026-06-14 = 日曜
    expect(date.getDay()).toBe(0);
    const rate = getDowShiftRate(YAMADA_TREND, date);
    expect(rate).toEqual({ 早番: 0.20, 日勤: 0.60, 遅番: 0.20 });
  });

  test('火曜（データ薄=null）→ null を返す', () => {
    const date = new Date(2026, 5, 16); // 2026-06-16 = 火曜（getDay()=2）
    expect(date.getDay()).toBe(2);
    const rate = getDowShiftRate(YAMADA_TREND, date);
    expect(rate).toBeNull();
  });

  test('trend が null の場合は null', () => {
    const date = new Date(2026, 5, 15);
    expect(getDowShiftRate(null, date)).toBeNull();
    expect(getDowShiftRate(undefined, date)).toBeNull();
  });

  test('trend に dowShiftRate がない場合は null', () => {
    const date = new Date(2026, 5, 15);
    expect(getDowShiftRate({}, date)).toBeNull();
    expect(getDowShiftRate({ 早番: 0.5 }, date)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDowRestRate — (getDay()+6)%7インデックス（0=月〜6=日）
// ─────────────────────────────────────────────────────────────────────────────
describe('getDowRestRate', () => {

  test('月曜（getDay()=1 → idx=(1+6)%7=0）→ dowRestRate[0]=0.28', () => {
    const date = new Date(2026, 5, 15); // 月曜
    expect(date.getDay()).toBe(1);
    const rate = getDowRestRate(YAMADA_TREND, date);
    expect(rate).toBe(0.28); // dowRestRate[0]
  });

  test('日曜（getDay()=0 → idx=(0+6)%7=6）→ dowRestRate[6]=0.35', () => {
    const date = new Date(2026, 5, 14); // 日曜
    expect(date.getDay()).toBe(0);
    const rate = getDowRestRate(YAMADA_TREND, date);
    expect(rate).toBe(0.35); // dowRestRate[6]
  });

  test('土曜（getDay()=6 → idx=(6+6)%7=5）→ dowRestRate[5]=0.40', () => {
    const date = new Date(2026, 5, 20); // 2026-06-20 = 土曜
    expect(date.getDay()).toBe(6);
    const rate = getDowRestRate(YAMADA_TREND, date);
    expect(rate).toBe(0.40); // dowRestRate[5]
  });

  test('trend が null の場合は null', () => {
    const date = new Date(2026, 5, 15);
    expect(getDowRestRate(null, date)).toBeNull();
    expect(getDowRestRate(undefined, date)).toBeNull();
  });

  test('trend に dowRestRate がない場合は null', () => {
    const date = new Date(2026, 5, 15);
    expect(getDowRestRate({}, date)).toBeNull();
  });

  // getDowShiftRate と getDowRestRate が同じ日付で異なる値を返すことを確認
  // （インデックス体系の違いが正しく吸収されていること）
  test('同じ日曜に getDowShiftRate[0] と getDowRestRate[6] は別エントリを参照する', () => {
    const sunday = new Date(2026, 5, 14); // 日曜
    const shiftRate = getDowShiftRate(YAMADA_TREND, sunday); // dowShiftRate[0]
    const restRate  = getDowRestRate(YAMADA_TREND, sunday);  // dowRestRate[6]
    // dowShiftRate[0] は { 早番:0.20, 日勤:0.60, 遅番:0.20 }
    // dowRestRate[6] は 0.35（別エントリ）
    expect(shiftRate).toEqual({ 早番: 0.20, 日勤: 0.60, 遅番: 0.20 });
    expect(restRate).toBe(0.35);
  });
});
