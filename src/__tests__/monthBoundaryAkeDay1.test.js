/**
 * 月またぎ再発バグの回帰テスト。
 * 症状: 前の月の最終日が「明け」で終わる職員の、当月1日目が稀に勤務になる。
 * 原因: localSearchImprove が 1日目の前日（＝前月末 prevTail）を見ずに、
 *   繰り越しの「休み」を勤務へスワップしてしまう（autoGenerate 直後は正しい）。
 * 修正: localSearchImprove で「前月末=明け の人の1日目」を locked に加え、固定する（追加のみ）。
 */
import { describe, test, expect } from 'vitest';
import { bestOfN, localSearchImprove, scoreShifts } from '../engine/core.js';

const getDays = (y, m) => new Date(y, m + 1, 0).getDate();

const dept = { id: 'k', shiftTypes: ['早番', '日勤', '遅番', '夜勤'],
  minStaff: { 日勤: 3, 夜勤: 1 }, maxStaff: { 早番: 1, 遅番: 1, 夜勤: 1 }, maxConsecutive: 5, roleShiftTypes: {} };

function mkTrend(names) {
  const t = { _monthCounts: {} };
  for (const n of names) {
    t[n] = { dowShiftObs: Array.from({ length: 7 }, () => ({})), dowWorkObs: [0,0,0,0,0,0,0],
      dowShiftRate: Array.from({ length: 7 }, () => ({})), dowRestRate: Array(7).fill(0.3) };
    t._monthCounts[n] = 4;
  }
  return t;
}
function mkStaff(specs) {
  return specs.map(sp => ({ id: sp.id, name: sp.id, dept: 'k', role: 'x', nightOk: sp.nightOk, nightMax: 8,
    kyukoDays: 8, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} }));
}

const staff = mkStaff([
  { id: 'a0', nightOk: true }, { id: 'a1', nightOk: true }, { id: 'a2', nightOk: true },
  { id: 'f0', nightOk: false }, { id: 'f1', nightOk: false }, { id: 'f2', nightOk: false }, { id: 'f3', nightOk: false },
]);
const trend = mkTrend(staff.map(s => s.id));

function prevTailAke(year, month) {
  const pY = month === 0 ? year - 1 : year, pIdx = month === 0 ? 11 : month - 1;
  const pd = getDays(pY, pIdx);
  return { a0: { [pd - 1]: '夜勤', [pd]: '明け' } }; // a0 は前月末=明け → 当月1日は休みのはず
}

describe('月またぎ: 前月末=明け の1日目は休みのまま（回帰）', () => {
  test('2026/12 → 2027/1: 120回生成して a0 の1日目はすべて休み', () => {
    const pt = prevTailAke(2027, 0);
    let bad = 0;
    for (let r = 0; r < 120; r++) {
      const best = bestOfN(staff, dept, 2027, 0, {}, trend, 30, pt);
      if (best.shifts['a0'][1] !== '休み') bad++;
    }
    expect(bad).toBe(0);
  }, 30000);

  test('2026/11 → 2026/12: 120回生成して a0 の1日目はすべて休み', () => {
    const pt = prevTailAke(2026, 11);
    let bad = 0;
    for (let r = 0; r < 120; r++) {
      const best = bestOfN(staff, dept, 2026, 11, {}, trend, 30, pt);
      if (best.shifts['a0'][1] !== '休み') bad++;
    }
    expect(bad).toBe(0);
  }, 30000);
});

describe('月またぎ修正の不変性: 前月末=明け の人がいなければ結果は変わらない', () => {
  // localSearchImprove は入力盤面に対して決定的（乱数なし）。
  // 明けで終わる人がいない prevTail では、今回追加したロックは一切作用しない
  //  → prevTail の中身（空 / 夜勤終わり / 休み終わり）によらず出力は同一。
  const ds = staff.filter(s => s.dept === dept.id);
  const year = 2027, month = 0, days = getDays(year, month);

  // 1日目が understaffed（休みが多い）＝スワップ圧がかかる固定盤面を用意。
  function fixedBoard() {
    const b = {};
    for (const s of ds) { b[s.id] = {}; for (let d = 1; d <= days; d++) b[s.id][d] = '休み'; }
    // 何人かだけ勤務を散らす（スワップの余地を作る）
    b.f0[1] = '日勤'; b.f1[2] = '日勤'; b.f2[3] = '日勤'; b.a1[1] = '日勤'; b.a2[2] = '早番';
    return b;
  }

  test('空 prevTail と「夜勤で終わる」prevTail で localSearchImprove 出力が一致', () => {
    const r1 = localSearchImprove(fixedBoard(), ds, dept, days, year, month, trend, {});
    const r2 = localSearchImprove(fixedBoard(), ds, dept, days, year, month, trend, { a0: { 31: '夜勤' } });
    expect(r1).toEqual(r2);
  });

  test('空 prevTail と「休みで終わる」prevTail で localSearchImprove 出力が一致', () => {
    const r1 = localSearchImprove(fixedBoard(), ds, dept, days, year, month, trend, {});
    const r3 = localSearchImprove(fixedBoard(), ds, dept, days, year, month, trend, { a0: { 31: '休み' } });
    expect(r1).toEqual(r3);
  });

  test('「明けで終わる」prevTail を渡したときだけ a0 の1日目=休みが固定される', () => {
    const board = fixedBoard();
    board.a0[1] = '休み'; // 明け繰り越し相当
    const out = localSearchImprove(board, ds, dept, days, year, month, trend, { a0: { 31: '明け' } });
    expect(out.a0[1]).toBe('休み');
  });
});
