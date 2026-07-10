/**
 * computeEditRate（修正率計測）テスト
 */
import { describe, test, expect } from 'vitest';
import { computeEditRate } from '../lib/editRate.js';

// 2名 × 各5セル配置（早番/日勤/遅番の実質配置）
function makeBaseline() {
  return {
    s1: { 1: '早番', 2: '日勤', 3: '遅番', 4: '日勤', 5: '早番' },
    s2: { 1: '日勤', 2: '遅番', 3: '日勤', 4: '早番', 5: '日勤' },
  };
}

describe('computeEditRate', () => {
  test('変更ゼロ → 0%', () => {
    const b = makeBaseline();
    const c = JSON.parse(JSON.stringify(b));
    expect(computeEditRate(b, c)).toBe(0);
  });

  test('生成直後から3セル変更 → 3/10 = 30%', () => {
    const b = makeBaseline(); // 生成対象セル = 10
    const c = JSON.parse(JSON.stringify(b));
    c.s1[1] = '遅番';  // 変更1
    c.s1[2] = '早番';  // 変更2
    c.s2[3] = '早番';  // 変更3
    expect(computeEditRate(b, c)).toBe(30);
  });

  test('1セル変更 → 1/10 = 10%', () => {
    const b = makeBaseline();
    const c = JSON.parse(JSON.stringify(b));
    c.s2[5] = '遅番';
    expect(computeEditRate(b, c)).toBe(10);
  });

  test('FIXEDセル（希望休/有休/夜勤/明け）は分母・分子とも除外', () => {
    // baseline に FIXED を混ぜる → 生成対象は非FIXENのみ
    const b = {
      s1: { 1: '早番', 2: '希望休', 3: '日勤', 4: '有休' },   // 生成対象=早番,日勤の2
      s2: { 1: '夜勤', 2: '明け', 3: '日勤', 4: '遅番' },      // 生成対象=日勤,遅番の2
    };
    const c = JSON.parse(JSON.stringify(b));
    // FIXEDセルを変えても分子に入らない
    c.s1[2] = '日勤'; // 希望休→日勤（FIXED起点なので無視）
    c.s2[1] = '日勤'; // 夜勤→日勤（FIXED起点なので無視）
    // 実質配置セルを1つ変更
    c.s1[3] = '遅番'; // 日勤→遅番（生成対象・カウント対象）
    // 生成対象4セル中1セル変更 → 25%
    expect(computeEditRate(b, c)).toBe(25);
  });

  test('baseline なし（貼り付け・手入力の月）→ null', () => {
    expect(computeEditRate(null, { s1: { 1: '早番' } })).toBeNull();
    expect(computeEditRate({}, { s1: { 1: '早番' } })).toBeNull();
  });

  test('生成対象セルが全てFIXED/空白 → 分母0 → null', () => {
    const b = { s1: { 1: '希望休', 2: '有休' } };
    expect(computeEditRate(b, b)).toBeNull();
  });

  test('current側でセルが消えても（空白化）変更としてカウント', () => {
    const b = makeBaseline();
    const c = JSON.parse(JSON.stringify(b));
    delete c.s1[1]; // 早番→空白 = 変更
    expect(computeEditRate(b, c)).toBe(10);
  });
});
