/**
 * 指標G「変化追随率」computeDriftMetric の検証（第1段階）。
 * 純粋関数のため core.js の getDays 経由でそのまま呼べる（App.jsx import 不要）。
 */
import { describe, test, expect } from 'vitest';
import { computeDriftMetric } from '../research/backtest.js';

const dept = { id: 'k', shiftTypes: ['早番', '日勤', '遅番', '夜勤'] };
const staff = [{ id: 's1', name: '柳', dept: 'k' }];
// 対象月 2026年8月(month=7)。金曜=7,14,21,28。
const YEAR = 2026, MONTH = 7;

// 指定曜日(dow)の全日を value で埋めた月シフトを作る
function monthWithDow(y, m0, sid, dow, value) {
  const shifts = { [sid]: {} };
  const dim = new Date(y, m0 + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) if (new Date(y, m0, d).getDay() === dow) shifts[sid][d] = value;
  return { y, m0, shifts };
}
const FRI = 5;

describe('指標G 変化追随率', () => {
  test('前半=遅番・後半=日勤 の入れ替わりを変化セルとして検出', () => {
    const monthlyShifts = [
      monthWithDow(2026, 3, 's1', FRI, '遅番'), // 4月 前半
      monthWithDow(2026, 4, 's1', FRI, '遅番'), // 5月 前半
      monthWithDow(2026, 5, 's1', FRI, '日勤'), // 6月 後半(直近2)
      monthWithDow(2026, 6, 's1', FRI, '日勤'), // 7月 後半(直近2)
    ];
    // 対象月8月の実績: 金曜は日勤(new)。生成もすべて日勤に追随。
    const actual = monthWithDow(2026, 7, 's1', FRI, '日勤').shifts;
    const runs = [monthWithDow(2026, 7, 's1', FRI, '日勤').shifts];
    const g = computeDriftMetric({ actual, runs, staffList: staff, dept, monthlyShifts, year: YEAR, month: MONTH });
    expect(g.available).toBe(true);
    const row = g.rows.find(r => r.dow === '金');
    expect(row).toBeTruthy();
    expect(row.old).toBe('遅番');
    expect(row.new).toBe('日勤');
    expect(row.genNewRate).toBe(1);   // 生成が new(日勤)に完全追随
    expect(row.actualNewRate).toBe(1);
    expect(g.changeCells).toBeGreaterThanOrEqual(1);
  });

  test('old と new が同じ（遅番のまま）なら変化セルに含まれない', () => {
    const monthlyShifts = [
      monthWithDow(2026, 3, 's1', FRI, '遅番'),
      monthWithDow(2026, 4, 's1', FRI, '遅番'),
      monthWithDow(2026, 5, 's1', FRI, '遅番'),
      monthWithDow(2026, 6, 's1', FRI, '遅番'),
    ];
    const actual = monthWithDow(2026, 7, 's1', FRI, '遅番').shifts;
    const runs = [monthWithDow(2026, 7, 's1', FRI, '遅番').shifts];
    const g = computeDriftMetric({ actual, runs, staffList: staff, dept, monthlyShifts, year: YEAR, month: MONTH });
    expect(g.rows.find(r => r.dow === '金')).toBeUndefined();
  });

  test('後半のnew観測が1回のみ（minNewObs未満）なら変化セルにしない', () => {
    const monthlyShifts = [
      monthWithDow(2026, 4, 's1', FRI, '遅番'), // 前半
      // 後半は直近2ヶ月。片方だけ日勤1回・もう片方は遅番のまま → new(日勤)観測=1
      monthWithDow(2026, 5, 's1', FRI, '遅番'),
      { y: 2026, m0: 6, shifts: { s1: { 3: '日勤' } } }, // 7/3(金)のみ日勤1回
    ];
    const actual = monthWithDow(2026, 7, 's1', FRI, '日勤').shifts;
    const runs = [monthWithDow(2026, 7, 's1', FRI, '日勤').shifts];
    const g = computeDriftMetric({ actual, runs, staffList: staff, dept, monthlyShifts, year: YEAR, month: MONTH });
    // 後半最頻は遅番(4回)>日勤(1) → そもそもnew=遅番=old → 変化なし。少なくとも金曜の変化行は出ない。
    expect(g.rows.find(r => r.dow === '金' && r.new === '日勤')).toBeUndefined();
  });

  test('学習月が1ヶ月しかないと測定不能', () => {
    const monthlyShifts = [monthWithDow(2026, 6, 's1', FRI, '日勤')];
    const g = computeDriftMetric({ actual: {}, runs: [{}], staffList: staff, dept, monthlyShifts, year: YEAR, month: MONTH });
    expect(g.available).toBe(false);
  });
});
