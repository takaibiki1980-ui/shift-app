import { describe, test, expect } from 'vitest';
import { matchesToken, REST_LIKE, FORCE_TREAT_KIBO_AS_REST, DEFAULT_SHIFT_EQUIV } from '../lib/shiftEquivalence.js';

describe('matchesToken（遷移ルールの前日判定・同値グループ）', () => {
  test("'休み'→'休み' は真", () => expect(matchesToken('休み', '休み')).toBe(true));
  test("'希望休'→'休み' は真（休み扱い）", () => expect(matchesToken('希望休', '休み')).toBe(true));
  test("'有休'→'休み' は偽（休み扱いにしない）", () => expect(matchesToken('有休', '休み')).toBe(false));

  test('休み以外の token は完全一致のまま', () => {
    expect(matchesToken('早番', '早番')).toBe(true);
    expect(matchesToken('遅番', '早番')).toBe(false);
    expect(matchesToken('明け', '明け')).toBe(true);
    expect(matchesToken('日勤', '遅番')).toBe(false);
  });

  test('上書き値を渡すとグループが差し替わる（将来の部署別設定用）', () => {
    const equiv = { '休み': ['休み', '有休'] }; // 有休も休み扱いにする上書き
    expect(matchesToken('有休', '休み', equiv)).toBe(true);
    expect(matchesToken('希望休', '休み', equiv)).toBe(false); // この上書きには希望休は無い
  });

  test('null/undefined 安全', () => {
    expect(matchesToken(null, '休み')).toBe(false);
    expect(matchesToken('休み', null)).toBe(false);
  });

  test('既定の同値グループは 休み=[休み,希望休]（有休なし）', () => {
    expect(FORCE_TREAT_KIBO_AS_REST).toBe(true);
    expect(REST_LIKE).toEqual(['休み', '希望休']);
    expect(DEFAULT_SHIFT_EQUIV['休み']).toEqual(['休み', '希望休']);
  });
});
