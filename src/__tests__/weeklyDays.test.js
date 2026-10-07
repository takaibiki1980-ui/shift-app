import { describe, test, expect } from 'vitest';
import { weeklyWorkValue, getMonthWeeks, weeklyWorkBefore, monthlyWorkCapAndRest, countWeeklyOverages } from '../lib/weeklyDays.js';

describe('weeklyWorkValue（1セルの週出勤寄与）', () => {
  test('通常勤務・有休・半日有給=1', () => {
    for (const v of ['早番', '日勤', '遅番', '夜勤', '研修', '有休', '早/有', '日/有', '有/日', '有/遅']) {
      expect(weeklyWorkValue(v)).toBe(1);
    }
  });
  test('有/休と半日休=0.5', () => {
    for (const v of ['有/休', '日/休', '休/日', '早/休', '休/遅']) expect(weeklyWorkValue(v)).toBe(0.5);
  });
  test('休み・希望休・明け・空=0', () => {
    for (const v of ['休み', '希望休', '明け', '', null, undefined]) expect(weeklyWorkValue(v)).toBe(0);
  });
  test('restLike を渡すとその値は0', () => {
    expect(weeklyWorkValue('特休', new Set(['特休']))).toBe(0);
    expect(weeklyWorkValue('早番', new Set(['特休']))).toBe(1);
  });
});

describe('getMonthWeeks（月曜始まり・前月側日数）', () => {
  test('月曜始まりの月（2024-07, 31日）はprevCount=0', () => {
    const w = getMonthWeeks(2024, 6); // 7月
    expect(w[0]).toEqual({ current: [1,2,3,4,5,6,7], prevCount: 0, prevDays: [] });
    expect(w.length).toBe(5);
    expect(w[4].current).toEqual([29,30,31]);
  });
  test('日曜始まりの月（2024-09, 30日）はprevCount=6・初週は1日', () => {
    const w = getMonthWeeks(2024, 8); // 9月（1日=日）
    expect(w[0].current).toEqual([1]);
    expect(w[0].prevCount).toBe(6);
    expect(w[0].prevDays).toEqual([26,27,28,29,30,31]); // 8月末6日
  });
  test('水曜始まり（2025-01, 31日）はprevCount=2・初週は5日', () => {
    const w = getMonthWeeks(2025, 0);
    expect(w[0].current).toEqual([1,2,3,4,5]);
    expect(w[0].prevCount).toBe(2);
    expect(w[0].prevDays).toEqual([30,31]); // 12月末2日
  });
});

describe('monthlyWorkCapAndRest', () => {
  test('月曜始まり 2024-07 / 週5 → 上限23・休み目標8', () => {
    expect(monthlyWorkCapAndRest({ weeklyCap: 5, year: 2024, month: 6 })).toEqual({ workCap: 23, restTarget: 8 });
  });
  test('月曜始まり 2024-07 / 週4 → 上限19・休み目標12', () => {
    expect(monthlyWorkCapAndRest({ weeklyCap: 4, year: 2024, month: 6 })).toEqual({ workCap: 19, restTarget: 12 });
  });
  test('日曜始まり 2024-09 / 週5・前月データなし → 上限22・休み目標8', () => {
    expect(monthlyWorkCapAndRest({ weeklyCap: 5, year: 2024, month: 8 })).toEqual({ workCap: 22, restTarget: 8 });
  });
  test('2月(2025-02, 28日, 土曜始まり) / 週6 → 上限25・休み目標3', () => {
    expect(monthlyWorkCapAndRest({ weeklyCap: 6, year: 2025, month: 1 })).toEqual({ workCap: 25, restTarget: 3 });
  });
  test('月初週に前月の有休・半日が入る（2025-01 水曜始まり / 週5, 前月12/30=有休,12/31=日/休→1.5）→ floor(min(3.5,5))=3 で上限23', () => {
    const prevCellByDay = { 30: '有休', 31: '日/休' };
    expect(monthlyWorkCapAndRest({ weeklyCap: 5, year: 2025, month: 0, prevCellByDay })).toEqual({ workCap: 23, restTarget: 8 });
  });
  test('前月側が多すぎると初週は0にクランプ（2024-09 週5, 前月末6日すべて勤務=6 → 5-6<0）', () => {
    const prevCellByDay = { 26: '日勤', 27: '日勤', 28: '日勤', 29: '日勤', 30: '日勤', 31: '日勤' };
    // 初週cap=0、以降 5+5+5+5+1=21、休み目標=9
    expect(monthlyWorkCapAndRest({ weeklyCap: 5, year: 2024, month: 8, prevCellByDay })).toEqual({ workCap: 21, restTarget: 9 });
  });
  test('未設定(null/空)は {null,null}', () => {
    expect(monthlyWorkCapAndRest({ weeklyCap: null, year: 2024, month: 6 })).toEqual({ workCap: null, restTarget: null });
    expect(monthlyWorkCapAndRest({ weeklyCap: '', year: 2024, month: 6 })).toEqual({ workCap: null, restTarget: null });
  });
  test('休み目標 = 月の日数 − 上限（恒等）', () => {
    const r = monthlyWorkCapAndRest({ weeklyCap: 3, year: 2025, month: 1 });
    expect(r.restTarget).toBe(28 - r.workCap);
  });
});

describe('countWeeklyOverages', () => {
  const Y = 2024, M = 6; // 7月・月曜始まり
  test('超過なし（週4で週内4日勤務）→ 空', () => {
    const cells = { 1:'日勤',2:'日勤',3:'日勤',4:'日勤',5:'休み',6:'休み',7:'休み' };
    expect(countWeeklyOverages({ cellByDayByStaff:{s:cells}, year:Y, month:M, capByStaff:{s:4} })).toEqual([]);
  });
  test('超過あり（週内5日勤務・週4）→ 1件', () => {
    const cells = { 1:'日勤',2:'日勤',3:'日勤',4:'日勤',5:'日勤' };
    expect(countWeeklyOverages({ cellByDayByStaff:{s:cells}, year:Y, month:M, capByStaff:{s:4} }))
      .toEqual([{ staffId:'s', weekStart:1, worked:5, cap:4 }]);
  });
  test('月初の月またぎで前月分を足すと超える（2024-09 日曜始まり・初週は1日＋前月6日）', () => {
    const cells = { 1:'日勤' };                         // 当月分 1
    const prev = { 28:'日勤', 29:'日勤', 30:'日勤', 31:'有休' }; // 前月分 4（有休=1）
    const r = countWeeklyOverages({ cellByDayByStaff:{s:cells}, prevByStaff:{s:prev}, year:2024, month:8, capByStaff:{s:4} });
    expect(r).toEqual([{ staffId:'s', weekStart:1, worked:5, cap:4 }]); // 1+4=5>4
  });
  test('未設定(cap=null)の人は数えない', () => {
    const cells = { 1:'日勤',2:'日勤',3:'日勤',4:'日勤',5:'日勤' };
    expect(countWeeklyOverages({ cellByDayByStaff:{s:cells}, year:Y, month:M, capByStaff:{s:null} })).toEqual([]);
  });
  test('有/休・半日休は0.5で数える', () => {
    const cells = { 1:'日勤',2:'日勤',3:'日勤',4:'日勤',5:'有/休',6:'日/休' }; // 4 + 0.5 + 0.5 = 5
    expect(countWeeklyOverages({ cellByDayByStaff:{s:cells}, year:Y, month:M, capByStaff:{s:4} }))
      .toEqual([{ staffId:'s', weekStart:1, worked:5, cap:4 }]);
  });
});

describe('weeklyWorkBefore', () => {
  test('同じ週で当日より前の当月出勤を数える（月曜始まり週の木曜）', () => {
    // 2024-07: 1=月..。day=4(木)、同週 1,2,3 が勤務 → 3
    const cellByDay = { 1: '早番', 2: '日勤', 3: '遅番', 4: '早番' };
    expect(weeklyWorkBefore({ day: 4, cellByDay, year: 2024, month: 6 })).toBe(3);
  });
  test('月初週は前月側も数える（2025-01 水曜始まり day=2、前月12/30,31＋当月1日）', () => {
    const cellByDay = { 1: '日勤' };
    const prevCellByDay = { 30: '日勤', 31: '有/休' }; // 1 + 0.5
    // day=2 の前 = 当月1(1) + 前月30(1)+31(0.5) = 2.5
    expect(weeklyWorkBefore({ day: 2, cellByDay, prevCellByDay, year: 2025, month: 0 })).toBe(2.5);
  });
  test('週頭(月曜)は前が無ければ0', () => {
    expect(weeklyWorkBefore({ day: 8, cellByDay: { 1:'日勤',2:'日勤',3:'日勤',4:'日勤',5:'日勤' }, year: 2024, month: 6 })).toBe(0); // 8=次週の月
  });
});
