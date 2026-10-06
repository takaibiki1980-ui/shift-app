import { describe, test, expect } from 'vitest';
import { countRestAndPaid } from '../lib/summaryCounts.js';

// buildDeptRestTypes 相当（REST_TYPES）。
const deptRest = new Set(["休み", "希望休", "有休", "明け", "日/休", "休/日", "早/休", "休/遅"]);

describe('countRestAndPaid 休(rest)', () => {
  test('休み・希望休セルは1、半日休と有/休は0.5、明け・有休は除外', () => {
    const cellByDay = { 1: '休み', 2: '希望休', 3: '日/休', 4: '休/遅', 5: '有/休', 6: '明け', 7: '有休', 8: '早番' };
    const { rest } = countRestAndPaid({ cellByDay, deptRest });
    // 休み1 + 希望休1 + 日/休0.5 + 休/遅0.5 + 有/休0.5 = 3.5（明け・有休・早番は除外）
    expect(rest).toBe(3.5);
  });

  test('カスタム休（deptRest に追加）も数える', () => {
    const dr = new Set([...deptRest, '特休']);
    const { rest } = countRestAndPaid({ cellByDay: { 1: '特休', 2: '休み' }, deptRest: dr });
    expect(rest).toBe(2);
  });

  test('申請希望休: セルが空の日は+1、セルに値ありなら足さない（二重計上なし）', () => {
    const cellByDay = { 10: '早番' }; // 10日は勤務が入っている
    const kiboDays = [10, 11, 12];    // 10はセル有→無視、11・12はセル空→+2
    const { rest } = countRestAndPaid({ cellByDay, kiboDays, deptRest });
    expect(rest).toBe(2);
  });

  test('セル値の希望休と申請希望休が同じ日でも二重に数えない', () => {
    const cellByDay = { 5: '希望休' }; // セル値で休1
    const kiboDays = [5];              // 同じ日・セル有→加算しない
    const { rest } = countRestAndPaid({ cellByDay, kiboDays, deptRest });
    expect(rest).toBe(1);
  });
});

describe('countRestAndPaid 有(paid)', () => {
  test('有休=1 / 早有・有遅・日有・有日=0.5 / 有休(有/休)=0.5', () => {
    const cellByDay = { 1: '有休', 2: '早/有', 3: '有/遅', 4: '日/有', 5: '有/日', 6: '有/休', 7: '早番' };
    const { paid } = countRestAndPaid({ cellByDay, deptRest });
    // 1 + 0.5*4 + 0.5 = 3.5
    expect(paid).toBe(3.5);
  });

  test('申請有休: セルが空の日は+1、セルに値ありなら足さない', () => {
    const cellByDay = { 3: '日勤' };
    const yukyuDays = [3, 4]; // 3はセル有→無視、4はセル空→+1
    const { paid } = countRestAndPaid({ cellByDay, yukyuDays, deptRest });
    expect(paid).toBe(1);
  });

  test('有/休 は休0.5・有0.5 の両方に入る', () => {
    const { rest, paid } = countRestAndPaid({ cellByDay: { 1: '有/休' }, deptRest });
    expect(rest).toBe(0.5);
    expect(paid).toBe(0.5);
  });
});

describe('countRestAndPaid 端', () => {
  test('申請もセルも無ければ 0', () => {
    expect(countRestAndPaid({ cellByDay: {}, deptRest })).toEqual({ rest: 0, paid: 0 });
  });

  test('申請なしなら既存 restCnt と同じ数（回帰）', () => {
    // 既存 L3015 の式を素朴に再現して突き合わせ
    const cellByDay = { 1: '休み', 2: '日/休', 3: '有/休', 4: '明け', 5: '有休', 6: '遅番', 7: '休/日', 8: '希望休' };
    const expectRest = Object.values(cellByDay).reduce((acc, v) =>
      (deptRest.has(v) || v === '有/休') && v !== '明け' && v !== '有休'
        ? acc + ((new Set(["日/休","休/日","早/休","休/遅","有/休"]).has(v)) ? 0.5 : 1) : acc, 0);
    const { rest } = countRestAndPaid({ cellByDay, deptRest });
    expect(rest).toBe(expectRest);
  });
});
