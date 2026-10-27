/**
 * src/lib/shareCell.js のテスト（共有セル表示の純ロジック）。
 */
import { describe, test, expect } from 'vitest';
import { shareYukyuCell } from '../lib/shareCell.js';

// SharedShiftView の cellShort を模した簡易スタブ（空→'－'、有休→'有'、他は先頭1文字）。
const cs = (v) => !v ? '－' : (v === '有休' ? '有' : v.slice(0, 1));

describe('shareYukyuCell', () => {
  test('空セル＋有給日 → 「有」（yukyu オーバーレイ）', () => {
    expect(shareYukyuCell('', [2, 5], 2, cs)).toEqual({ text: '有', yukyu: true });
  });
  test('空セル＋有給日でない → 「－」', () => {
    expect(shareYukyuCell('', [2, 5], 3, cs)).toEqual({ text: '－', yukyu: false });
  });
  test('セル値 "有休" → 「有」（セル由来・オーバーレイでない）', () => {
    expect(shareYukyuCell('有休', [], 2, cs)).toEqual({ text: '有', yukyu: false });
  });
  test('セル値あり＋有給日が重なっても セル値優先', () => {
    expect(shareYukyuCell('日勤', [2], 2, cs)).toEqual({ text: '日', yukyu: false });
  });
  test('旧ペイロード（yukyu undefined）→ 従来どおり（空→「－」）', () => {
    expect(shareYukyuCell('', undefined, 2, cs)).toEqual({ text: '－', yukyu: false });
  });
  test('yukyu が非配列・不正でも例外を出さず従来どおり', () => {
    expect(shareYukyuCell('', 'bad', 2, cs)).toEqual({ text: '－', yukyu: false });
    expect(shareYukyuCell('', null, 2, cs)).toEqual({ text: '－', yukyu: false });
    expect(shareYukyuCell('', {}, 2, cs)).toEqual({ text: '－', yukyu: false });
  });
  test('cellShort 未指定でも落ちない（空→「－」、値はそのまま）', () => {
    expect(shareYukyuCell('', [], 1).text).toBe('－');
    expect(shareYukyuCell('日勤', [], 1).text).toBe('日勤');
  });
});
