import { describe, test, expect } from 'vitest';
import { isBadTransition, buildNightSet } from '../engine/core.js';

// 夜勤ありの介護部署（nightSet に 夜勤/明け 等）
const kaigo = { shiftTypes: ['早番', '日勤', '遅番', '夜勤'] };
const nsKaigo = buildNightSet(kaigo);
// 夜勤なしの栄養科（allowLateToEarly=ON）
const eiyo = { shiftTypes: ['早番', '日勤', '遅番'], allowLateToEarly: true };
const nsEiyo = buildNightSet(eiyo);

describe('isBadTransition × dept.transitionBans（PR-3 反映）', () => {
  test('transitionBans 未設定なら従来通り（介護: 遅番→早番は禁止）', () => {
    expect(isBadTransition('遅番', '早番', kaigo, nsKaigo)).toBe(true);
    expect(isBadTransition('休み', '早番', kaigo, nsKaigo)).toBe(false); // 禁止設定なし
  });

  test('allowLateToEarly の栄養科は従来通り遅番→早番を許可', () => {
    expect(isBadTransition('遅番', '早番', eiyo, nsEiyo)).toBe(false);
  });

  test('栄養科に「休み→早番」禁止を追加 → true（allowLateToEarly でも適用）', () => {
    const d = { ...eiyo, transitionBans: [{ from: '休み', to: '早番' }] };
    const ns = buildNightSet(d);
    expect(isBadTransition('休み', '早番', d, ns)).toBe(true);   // 新ルールで禁止
    expect(isBadTransition('休み', '日勤', d, ns)).toBe(false);  // 対象外は許可
    expect(isBadTransition('遅番', '早番', d, ns)).toBe(false);  // 既存の遅番→早番許可は維持
  });

  test('介護部署に任意の禁止を追加しても既存ルールと共存', () => {
    const d = { ...kaigo, transitionBans: [{ from: '休み', to: '早番' }] };
    const ns = buildNightSet(d);
    expect(isBadTransition('休み', '早番', d, ns)).toBe(true);   // 追加ルール
    expect(isBadTransition('遅番', '早番', d, ns)).toBe(true);   // 既存ルールも維持
  });

  test('夜勤→明け→休みセットに非干渉（明け判定は従来通り）', () => {
    const d = { ...kaigo, transitionBans: [{ from: '休み', to: '早番' }] };
    const ns = buildNightSet(d);
    // 夜勤→明け は正常（禁止でない）
    expect(isBadTransition('夜勤', '明け', d, ns)).toBe(false);
    // 非夜勤→明け は従来通り禁止（明けは夜勤連鎖のみ）
    expect(isBadTransition('日勤', '明け', d, ns)).toBe(true);
  });

  test('空の transitionBans は no-op', () => {
    const d = { ...kaigo, transitionBans: [] };
    const ns = buildNightSet(d);
    expect(isBadTransition('休み', '早番', d, ns)).toBe(false);
  });
});
