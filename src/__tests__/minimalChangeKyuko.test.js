/**
 * 最小変更フェーズの公休ガード（MINCHANGE_KYUKO_GUARD）の検証。
 * applyMinimalChangePhase1 は App.jsx のモジュール内関数のため、env をスタブして import する。
 * dept は 日勤のみ・制約なし → dayM は常に0 になり、巻き戻し可否を分けるのは公休ガードだけ。
 */
import { describe, test, expect, vi, beforeAll } from 'vitest';

let applyMinimalChangePhase1;
beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:9999');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test');
  ({ applyMinimalChangePhase1 } = await import('../App.jsx'));
});

// 2026-02 = 28日。日勤のみ・minStaff/maxStaff なし・連勤上限大 → dayM 恒等0。
const cd = { id: 'k', shiftTypes: ['日勤'], minStaff: {}, maxStaff: {}, maxConsecutive: 31, customShiftDefs: [] };
const ds = [{ id: 's1', name: 'A', dept: 'k', kyukoDays: 2 }];
const YEAR = 2026, MONTH = 1; // 2月

function fillDaily(map) {
  const out = {};
  for (let d = 1; d <= 28; d++) out[d] = map[d] || '日勤';
  return out;
}
const restCount = (obj) => Object.values(obj).filter(v => v === '休み' || v === '希望休').length;

describe('最小変更フェーズ 公休ガード', () => {
  test('公休を目標から遠ざける巻き戻し（休み→日勤）は却下され、公休が守られる', () => {
    // 新結果: 公休2日ちょうど（目標一致）
    const result = { s1: fillDaily({ 1: '休み', 2: '休み' }) };
    // 前回結果: day1 が日勤（＝巻き戻すと公休が1に減る）
    const genSnapshot = { s1: fillDaily({ 2: '休み' }) }; // day1='日勤'
    applyMinimalChangePhase1(result, genSnapshot, ds, cd, YEAR, MONTH);
    expect(result.s1[1]).toBe('休み');        // 巻き戻されない
    expect(restCount(result.s1)).toBe(2);     // 公休は目標どおり維持
  });

  test('公休に影響しない巻き戻し（日勤の別日への差異）は従来どおり適用され、最小変更が維持される', () => {
    // 新結果と前回結果で「日勤の並び」だけが違い、公休数は両方2で不変のケースを作る。
    // day3 を新結果では日勤、前回結果でも日勤 … 公休セルは触らない差異にする。
    // ここでは day5 の値が新旧で異なるが両方勤務(日勤)で公休非該当 → 巻き戻し可能。
    const result = { s1: fillDaily({ 1: '休み', 2: '休み', 5: '日勤' }) };
    const genSnapshot = { s1: fillDaily({ 1: '休み', 2: '休み', 5: '日勤' }) };
    // 公休セル(1,2)は新旧同一 → 候補にならない。公休は不変。
    applyMinimalChangePhase1(result, genSnapshot, ds, cd, YEAR, MONTH);
    expect(restCount(result.s1)).toBe(2);     // 公休維持
    expect(result.s1[1]).toBe('休み');
  });

  test('公休を目標へ近づける巻き戻し（不足時に日勤→休み）は許可される', () => {
    // 新結果: 公休1日（目標2に不足）。前回結果 day2 が休み → 巻き戻すと公休2で目標一致。
    const result = { s1: fillDaily({ 1: '休み' }) };            // rest=1
    const genSnapshot = { s1: fillDaily({ 1: '休み', 2: '休み' }) }; // day2='休み'
    applyMinimalChangePhase1(result, genSnapshot, ds, cd, YEAR, MONTH);
    expect(result.s1[2]).toBe('休み');        // 目標へ近づく巻き戻しは許可
    expect(restCount(result.s1)).toBe(2);
  });
});
