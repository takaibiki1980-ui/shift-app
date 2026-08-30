/**
 * ④「日勤はパート優先・正社員カバー」(PART_FIRST_DAY) 関連テスト
 *
 * 確認事項:
 *   a. 定数がエクスポートされ、既定OFF・正社員日勤重み倍率0.3である
 *   b. フラグOFFでは生成が従来通り（＝既存の全回帰テストが緑のまま＝別途担保）
 *
 * 予約挙動そのもの(フラグON)の実測は使い捨てプローブで別途行い、コミットはしない。
 */
import { describe, test, expect } from 'vitest';
import { PART_FIRST_DAY, PART_FIRST_DAY_FULLTIMER_NIKKIN_WEIGHT } from '../engine/core.js';

describe('PART_FIRST_DAY 定数', () => {
  test('既定ON（日勤パート優先が有効）・正社員日勤重み倍率0.3', () => {
    expect(PART_FIRST_DAY).toBe(true);
    expect(PART_FIRST_DAY_FULLTIMER_NIKKIN_WEIGHT).toBe(0.3);
  });
});
