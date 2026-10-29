/**
 * src/lib/printCell.js のテスト（印刷/HTMLダウンロードのセル表示・純ロジック）。
 */
import { describe, test, expect } from 'vitest';
import { printCellText } from '../lib/printCell.js';

describe('printCellText', () => {
  test('右クリック有給(overlay)は「有」＝紫 span を含まない', () => {
    const t = printCellText({ isKibo: false, dispV: '', isYukyu2: true, half: false, short: undefined });
    expect(t).toBe('有');
    expect(t).not.toContain('<span');
    expect(t).not.toContain('9b4db5');
  });

  test('overlay 有給と、セル値 "有休"（short="有"）は同じ表現になる', () => {
    const overlay = printCellText({ isKibo: false, dispV: '', isYukyu2: true, half: false, short: undefined });
    const cell = printCellText({ isKibo: false, dispV: '有休', isYukyu2: false, half: false, short: '有' });
    expect(overlay).toBe('有');
    expect(cell).toBe('有');
    expect(overlay).toBe(cell);
  });

  test('希望休オーバーレイ・希望休セルは「休」', () => {
    expect(printCellText({ isKibo: true, dispV: '', isYukyu2: false, half: false, short: undefined })).toBe('休');
    expect(printCellText({ isKibo: false, dispV: '希望休', isYukyu2: false, half: false, short: '希' })).toBe('休');
    expect(printCellText({ isKibo: false, dispV: '希', isYukyu2: false, half: false, short: '希' })).toBe('休');
  });

  test('半日休(日/休 等)はスラッシュ付きのまま', () => {
    expect(printCellText({ isKibo: false, dispV: '日/休', isYukyu2: false, half: true, short: '日休' })).toBe('日/休');
  });

  test('通常勤務は short、無ければ「－」', () => {
    expect(printCellText({ isKibo: false, dispV: '日勤', isYukyu2: false, half: false, short: '日' })).toBe('日');
    expect(printCellText({ isKibo: false, dispV: '', isYukyu2: false, half: false, short: undefined })).toBe('－');
  });

  test('希望休は有給オーバーレイより優先（同時なら「休」）', () => {
    expect(printCellText({ isKibo: true, dispV: '', isYukyu2: true, half: false, short: undefined })).toBe('休');
  });
});
