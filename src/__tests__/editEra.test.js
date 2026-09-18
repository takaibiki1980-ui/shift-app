import { describe, test, expect } from 'vitest';
import { resolveEditEra } from '../lib/editEra.js';

describe('resolveEditEra（修正/希望モード判定＋旧月フォールバック）', () => {
  test('flag=true は常に修正モード', () => {
    expect(resolveEditEra(true, false, false)).toBe(true);
    expect(resolveEditEra(true, true, true)).toBe(true);
  });
  test('flag=false は常に希望モード（オールクリアの明示クリアを尊重）', () => {
    expect(resolveEditEra(false, true, true)).toBe(false); // 確定/シフトありでも false 尊重
    expect(resolveEditEra(false, false, false)).toBe(false);
  });
  test('flag=undefined + 確定済み → 修正モード（旧月フォールバック）', () => {
    expect(resolveEditEra(undefined, true, false)).toBe(true);
  });
  test('flag=undefined + 保存済みシフトあり → 修正モード（旧月フォールバック）', () => {
    expect(resolveEditEra(undefined, false, true)).toBe(true);
  });
  test('flag=undefined + 確定なし・シフトなし → 希望モード', () => {
    expect(resolveEditEra(undefined, false, false)).toBe(false);
  });
});
