/**
 * src/lib/planNotice.js のテスト（PR-3d 試用予告・純ロジック）。
 */
import { describe, test, expect } from 'vitest';
import { trialNoticeStage, trialNoticeContent, trialNoticeDismissKey } from '../lib/planNotice.js';

// JST 正午基準で「ちょうど N 日前」の試用終了日を作る（時刻差で日がずれないよう正午にする）。
const NOW = new Date('2026-11-12T03:00:00Z'); // JST 12:00
const endInDays = (n) => {
  const d = new Date(NOW.getTime() + n * 86400000);
  return d.toISOString();
};

describe('trialNoticeStage（境界）', () => {
  test('31日前は none / 30日前・15日前は early', () => {
    expect(trialNoticeStage(NOW, endInDays(31))).toBe('none');
    expect(trialNoticeStage(NOW, endInDays(30))).toBe('early');
    expect(trialNoticeStage(NOW, endInDays(15))).toBe('early');
  });
  test('14日前・4日前は soon', () => {
    expect(trialNoticeStage(NOW, endInDays(14))).toBe('soon');
    expect(trialNoticeStage(NOW, endInDays(4))).toBe('soon');
  });
  test('3日前・当日(残り0)は last', () => {
    expect(trialNoticeStage(NOW, endInDays(3))).toBe('last');
    expect(trialNoticeStage(NOW, endInDays(0))).toBe('last');
  });
  test('終了後(マイナス)は none / 試用なし(null)は none', () => {
    expect(trialNoticeStage(NOW, endInDays(-1))).toBe('none');
    expect(trialNoticeStage(NOW, null)).toBe('none');
    expect(trialNoticeStage(NOW, '')).toBe('none');
  });
});

describe('trialNoticeContent（出し分け）', () => {
  const depts4 = [{ id: 'a', label: '1階' }, { id: 'b', label: '2階' }, { id: 'c', label: '3階' }, { id: 'd', label: '4階' }];
  const depts3 = depts4.slice(0, 3);

  test('部署4つ: 先頭3つの名前を出す', () => {
    const c = trialNoticeContent('free', depts4, 10);
    expect(c.depts).not.toBeNull();
    expect(c.depts.usableNames).toEqual(['1階', '2階', '3階']);
    expect(c.depts.usableCount).toBe(3);
  });
  test('部署3以内: 部署項目は出さない(null)', () => {
    expect(trialNoticeContent('free', depts3, 10).depts).toBeNull();
  });
  test('職員16人以上: 追加不可フラグ true / 15人以下: false', () => {
    expect(trialNoticeContent('free', depts3, 16).staffAddBlocked).toBe(true);
    expect(trialNoticeContent('free', depts3, 15).staffAddBlocked).toBe(false);
  });
  test('7機能と送信は常に出す', () => {
    const c = trialNoticeContent('free', depts3, 5);
    expect(c.features).toHaveLength(7);
    expect(c.features).toContain('学習');
    expect(c.features).toContain('予定表');
    expect(c.sendBlocked).toBe(true);
  });
});

describe('trialNoticeDismissKey（段階ごとに別キー）', () => {
  test('段階名を含むキー', () => {
    expect(trialNoticeDismissKey('early')).toBe('planNoticeDismissed:early');
    expect(trialNoticeDismissKey('soon')).toBe('planNoticeDismissed:soon');
    expect(trialNoticeDismissKey('last')).toBe('planNoticeDismissed:last');
    expect(trialNoticeDismissKey('early')).not.toBe(trialNoticeDismissKey('soon'));
  });
});
