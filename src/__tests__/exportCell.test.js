/**
 * 書き出しセル表示値ロジックの回帰テスト。
 *  - 本不具合: セル空＋希望勤務あり → 書き出しに希望勤務の値が出る（画面と一致）。
 *  - 非劣化: セルに実値があれば実値優先／どちらも無ければ空。
 * ※ buildPrintHTML/buildCSV はこの effectiveCellShift を用いてセル値を決める。
 */
import { describe, test, expect } from 'vitest';
import { effectiveCellShift } from '../lib/exportCell.js';

describe('書き出しセル表示値（希望勤務オーバーレイ）', () => {
  test('【本不具合の回帰】セル空＋希望勤務"日勤" → "日勤"（書き出しで"－"にならない）', () => {
    // 竹澤さん8/15: deptShifts空・shiftRequestsByMonth[mk][15]="日勤"
    expect(effectiveCellShift("", "日勤")).toBe("日勤");
  });

  test('セルに実値があれば実値優先（希望勤務は無視）', () => {
    expect(effectiveCellShift("遅番", "日勤")).toBe("遅番");
  });

  test('半日シフトの実値もそのまま（非劣化）', () => {
    expect(effectiveCellShift("日/休", undefined)).toBe("日/休");
  });

  test('どちらも無ければ空（希望休・有休オーバーレイが効く余地を残す）', () => {
    expect(effectiveCellShift("", undefined)).toBe("");
    expect(effectiveCellShift("", null)).toBe("");
    expect(effectiveCellShift(undefined, undefined)).toBe("");
  });

  test('希望勤務が休系(有休)でもその値を返す', () => {
    expect(effectiveCellShift("", "有休")).toBe("有休");
  });
});
