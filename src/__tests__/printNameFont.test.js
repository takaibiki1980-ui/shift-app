/**
 * 印刷/HTML出力の氏名フォント自動縮小（printNameFontSize）の検証。
 * 固定幅の氏名列（印刷時 約84px・使用可能約72px）に、適用後の推定幅が収まる
 * フォントサイズを返すこと（＝中黒入りの長い外国人フルネームでも1行で切れない）を確認する。
 */
import { describe, test, expect, vi, beforeAll } from 'vitest';
let printNameFontSize;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:9999');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
  ({ printNameFontSize } = await import('../App.jsx'));
});

// 実測ベースのpx幅モデル（printNameFontSize と同一）
const SMALL = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ';
function width10(name) {
  let w = 0;
  for (const ch of name) {
    const c = ch.charCodeAt(0);
    if ('・·ー／　 '.includes(ch)) w += 6.0;
    else if (c <= 0x00FF) w += 6.0;
    else if (SMALL.includes(ch)) w += 8.0;
    else if (c >= 0x3040 && c <= 0x30FF) w += 11.5;
    else w += 10.0;
  }
  return w;
}
const USABLE = 72;

describe('printNameFontSize', () => {
  const names = ['テツ・テツ・カイン', 'ラ・ラ・ビュー', 'ジョン・スミス・ジュニア', '佐々木真理恵', '長谷川小百合', '渡部亜由美', '原', '中村 美咲子'];

  test('どの名前も 6〜10px', () => {
    for (const n of names) {
      const f = printNameFontSize(n);
      expect(f).toBeGreaterThanOrEqual(6);
      expect(f).toBeLessThanOrEqual(10);
    }
  });

  test('適用後の推定幅が使用可能幅(72px)以内＝切れない', () => {
    for (const n of names) {
      const f = printNameFontSize(n);
      const applied = width10(n) * f / 10;
      expect(applied).toBeLessThanOrEqual(USABLE + 0.1);
    }
  });

  test('長いカタカナ中黒名は10px未満に縮む / 短い名前は10pxのまま', () => {
    expect(printNameFontSize('テツ・テツ・カイン')).toBeLessThan(10);
    expect(printNameFontSize('ジョン・スミス・ジュニア')).toBeLessThan(10);
    expect(printNameFontSize('原')).toBe(10);
    expect(printNameFontSize('佐々木真理恵')).toBe(10); // 6漢字=60px<72 → 10pxで収まる
  });

  test('空/未定義でも既定10px', () => {
    expect(printNameFontSize('')).toBe(10);
    expect(printNameFontSize(undefined)).toBe(10);
  });
});
