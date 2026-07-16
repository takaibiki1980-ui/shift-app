/**
 * 有給残数管理（消費計算・確定/解除の残数整合）テスト
 */
import { describe, test, expect } from 'vitest';
import { computePaidLeaveConsumed, applyConsumption } from '../lib/paidLeave.js';

const YEAR = 2026, MONTH = 0; // 1月
const staff = (over) => ({ id: 's1', dept: 'kaigo1', yukyuByMonth: {}, ...over });

describe('computePaidLeaveConsumed（消費量集計）', () => {
  test('フル有休（セル値）1日 → 1.0消費', () => {
    const shifts = { s1: { 5: '有休' } };
    expect(computePaidLeaveConsumed(shifts, [staff()], 'kaigo1', YEAR, MONTH)).toEqual({ s1: 1 });
  });

  test('半日有給1日 → 0.5消費（4種すべて）', () => {
    for (const half of ['早/有', '日/有', '有/日', '有/遅']) {
      const shifts = { s1: { 3: half } };
      expect(computePaidLeaveConsumed(shifts, [staff()], 'kaigo1', YEAR, MONTH)).toEqual({ s1: 0.5 });
    }
  });

  test('yukyuByMonth の予定有休（セル空）→ 1.0消費', () => {
    const shifts = { s1: {} };
    const s = staff({ yukyuByMonth: { '2026-1': [10, 20] } });
    expect(computePaidLeaveConsumed(shifts, [s], 'kaigo1', YEAR, MONTH)).toEqual({ s1: 2 });
  });

  test('予定有休日に勤務シフトが入っていれば消費しない（セル優先）', () => {
    const shifts = { s1: { 10: '日勤' } };
    const s = staff({ yukyuByMonth: { '2026-1': [10] } });
    expect(computePaidLeaveConsumed(shifts, [s], 'kaigo1', YEAR, MONTH)).toEqual({});
  });

  test('フル+半日の混在合計（有休1 + 早/有×2 = 2.0）', () => {
    const shifts = { s1: { 1: '有休', 2: '早/有', 3: '有/遅' } };
    expect(computePaidLeaveConsumed(shifts, [staff()], 'kaigo1', YEAR, MONTH)).toEqual({ s1: 2 });
  });

  test('消費ゼロのスタッフは結果に含めない', () => {
    const shifts = { s1: { 1: '日勤', 2: '休み' } };
    expect(computePaidLeaveConsumed(shifts, [staff()], 'kaigo1', YEAR, MONTH)).toEqual({});
  });

  test('他部署のスタッフは集計しない', () => {
    const shifts = { s1: { 1: '有休' }, s2: { 1: '有休' } };
    const list = [staff(), staff({ id: 's2', dept: 'kaigo2' })];
    expect(computePaidLeaveConsumed(shifts, list, 'kaigo1', YEAR, MONTH)).toEqual({ s1: 1 });
  });
});

describe('applyConsumption（確定=減算 / 解除=復元 の整合）', () => {
  test('確定で残数が消費分だけ減る（1.0減・0.5減）', () => {
    const balances = { s1: 10, s2: 5 };
    const consumed = { s1: 1, s2: 0.5 };
    expect(applyConsumption(balances, consumed, -1)).toEqual({ s1: 9, s2: 4.5 });
  });

  test('確定→解除で残数が元に戻る（二重減算しない）', () => {
    const original = { s1: 10, s2: 5 };
    const consumed = { s1: 2, s2: 0.5 };
    const afterConfirm = applyConsumption(original, consumed, -1);   // 確定
    const afterUnconfirm = applyConsumption(afterConfirm, consumed, +1); // 解除
    expect(afterUnconfirm).toEqual(original);
  });

  test('確定→解除→確定→解除 を繰り返しても残数が正しい', () => {
    let bal = { s1: 8 };
    const consumed = { s1: 1.5 };
    for (let i = 0; i < 5; i++) {
      bal = applyConsumption(bal, consumed, -1); // 確定
      expect(bal).toEqual({ s1: 6.5 });
      bal = applyConsumption(bal, consumed, +1); // 解除
      expect(bal).toEqual({ s1: 8 });
    }
  });

  test('残数がマイナスになっても計算は行われる（確定を止めない）', () => {
    const balances = { s1: 1 };
    const consumed = { s1: 3 }; // 残1に対し3消費
    expect(applyConsumption(balances, consumed, -1)).toEqual({ s1: -2 });
  });

  test('残数未設定(undefined)のスタッフは0扱いで減算', () => {
    expect(applyConsumption({}, { s1: 1 }, -1)).toEqual({ s1: -1 });
  });
});
