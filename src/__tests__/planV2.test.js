/**
 * 新しいプラン（free/full の2段階）判定ロジック src/lib/planV2.js のテスト（純粋・配線なし）。
 * 現在時刻は引数で固定。日付は日本時間（Asia/Tokyo）。人名・部署名は仮名。
 */
import { describe, test, expect } from 'vitest';
import {
  effectivePlan, trialDaysRemaining, isTrialActive,
  planV2Limits, canAddDept, canAddStaff,
  usableDeptIds, isDeptUsable,
  generationAssistEnabled, learningEnabledV2, trialNoticeStage,
} from '../lib/planV2.js';

// JST 2026-10-19 の正午相当（UTC 03:00）。基準の「今」。
const NOW = new Date('2026-10-19T03:00:00Z');
// trial_ends_at を「今から d 日後（JSTカレンダー日）」に置くヘルパ。
const endInDays = (d) => new Date('2026-10-19T03:00:00Z').getTime() + d * 86400000;
const trialEnds = (d) => new Date(endInDays(d)).toISOString();

describe('effectivePlan（実効プラン free/full）', () => {
  test('運営者(is_admin) はフル', () => {
    expect(effectivePlan({ is_admin: true, plan: 'free' }, NOW)).toBe('full');
  });
  test('有料の契約中（既定 plan=full）はフル', () => {
    expect(effectivePlan({ plan: 'full' }, NOW)).toBe('full');
  });
  test('試用期間内はフル', () => {
    expect(effectivePlan({ plan: 'free', trial_ends_at: trialEnds(10) }, NOW)).toBe('full');
  });
  test('試用終了後は無料', () => {
    expect(effectivePlan({ plan: 'free', trial_ends_at: trialEnds(0) }, NOW)).toBe('free');
    expect(effectivePlan({ plan: 'free', trial_ends_at: trialEnds(-5) }, NOW)).toBe('free');
  });
  test('trial_ends_at なし（undefined/null）は試用なし→無料', () => {
    expect(effectivePlan({ plan: 'free' }, NOW)).toBe('free');
    expect(effectivePlan({ plan: 'free', trial_ends_at: null }, NOW)).toBe('free');
  });
  test('profile が null は無料（最小権限フォールバック）', () => {
    expect(effectivePlan(null, NOW)).toBe('free');
    expect(effectivePlan(undefined, NOW)).toBe('free');
  });
  test("'standard' は既定で無料扱い（有料に昇格させない）", () => {
    expect(effectivePlan({ plan: 'standard' }, NOW)).toBe('free');
  });
  test("'standard' でも opts.isPaidActive=true を明示すればフル（配線PRで判断）", () => {
    expect(effectivePlan({ plan: 'standard' }, NOW, { isPaidActive: true })).toBe('full');
  });
  test('opts.isPaidActive=false は plan=full より優先して無料に落とせる', () => {
    expect(effectivePlan({ plan: 'full' }, NOW, { isPaidActive: false })).toBe('free');
  });
});

describe('trialDaysRemaining / isTrialActive（JSTカレンダー日）', () => {
  test('残り日数は end当日=0、未来は正、過去は負', () => {
    expect(trialDaysRemaining({ trial_ends_at: trialEnds(6) }, NOW)).toBe(6);
    expect(trialDaysRemaining({ trial_ends_at: trialEnds(0) }, NOW)).toBe(0);
    expect(trialDaysRemaining({ trial_ends_at: trialEnds(-2) }, NOW)).toBe(-2);
  });
  test('試用なしは null', () => {
    expect(trialDaysRemaining({}, NOW)).toBeNull();
    expect(trialDaysRemaining({ trial_ends_at: '' }, NOW)).toBeNull();
    expect(trialDaysRemaining({ trial_ends_at: 'こわれた値' }, NOW)).toBeNull();
  });
  test('isTrialActive は残り1日以上で true、0以下で false', () => {
    expect(isTrialActive({ trial_ends_at: trialEnds(1) }, NOW)).toBe(true);
    expect(isTrialActive({ trial_ends_at: trialEnds(0) }, NOW)).toBe(false);
    expect(isTrialActive({}, NOW)).toBe(false);
  });
  test('JSTの日またぎ: UTCでは同日でもJSTで日付が変わると残り日数が1減る', () => {
    // trial_ends_at を JST 2026-10-20 の 00:30（UTC 2026-10-19T15:30Z）に固定。
    const end = new Date('2026-10-19T15:30:00Z'); // JST 10/20 00:30
    // 「今」が UTC 2026-10-19T14:00（JST 10/19 23:00）→ JSTで前日 → 残り1
    expect(trialDaysRemaining({ trial_ends_at: end }, new Date('2026-10-19T14:00:00Z'))).toBe(1);
    // 「今」が UTC 2026-10-19T15:40（JST 10/20 00:40）→ JSTで同日 → 残り0
    expect(trialDaysRemaining({ trial_ends_at: end }, new Date('2026-10-19T15:40:00Z'))).toBe(0);
  });
});

describe('上限と追加ゲート（free=部署3・職員15 / full=無制限）', () => {
  test('planV2Limits', () => {
    expect(planV2Limits('free')).toEqual({ depts: 3, staff: 15 });
    expect(planV2Limits('full')).toEqual({ depts: Infinity, staff: Infinity });
  });
  test('部署追加: free は3未満で可、3以上で不可。full は常に可', () => {
    expect(canAddDept('free', 2)).toBe(true);
    expect(canAddDept('free', 3)).toBe(false);
    expect(canAddDept('free', 4)).toBe(false); // 既存4でも消さない・追加だけ止める
    expect(canAddDept('full', 99)).toBe(true);
  });
  test('職員追加: free は15未満で可、15以上で不可。full は常に可', () => {
    expect(canAddStaff('free', 14)).toBe(true);
    expect(canAddStaff('free', 15)).toBe(false);
    expect(canAddStaff('free', 16)).toBe(false);
    expect(canAddStaff('full', 999)).toBe(true);
  });
  test('16人でも「使えるか」は別問題: 職員は超過しても編集・生成を止めない（この関数は追加可否のみ）', () => {
    // canAddStaff は追加の可否だけを返す。既存職員の利用可否は制限しない設計。
    expect(canAddStaff('free', 16)).toBe(false); // 追加は不可
    // 使える部署の判定(usableDeptIds)にも職員数は一切影響しない＝既存職員は使える。
    const depts = ['d1', 'd2', 'd3'];
    expect(usableDeptIds('free', depts)).toEqual(['d1', 'd2', 'd3']);
  });
});

describe('使える3部署（free=並び先頭3つ / full=全部）', () => {
  const depts = [{ id: 'A組' }, { id: 'B組' }, { id: 'C組' }, { id: 'D組' }, { id: 'E組' }];
  test('free は先頭3つだけ使える', () => {
    expect(usableDeptIds('free', depts)).toEqual(['A組', 'B組', 'C組']);
    expect(isDeptUsable('free', 2)).toBe(true);
    expect(isDeptUsable('free', 3)).toBe(false);
  });
  test('並べ替えると使える部署が変わる（先頭が入れ替わる）', () => {
    const reordered = [{ id: 'D組' }, { id: 'A組' }, { id: 'B組' }, { id: 'C組' }, { id: 'E組' }];
    expect(usableDeptIds('free', reordered)).toEqual(['D組', 'A組', 'B組']);
  });
  test('full は全部署が使える', () => {
    expect(usableDeptIds('full', depts)).toEqual(['A組', 'B組', 'C組', 'D組', 'E組']);
    expect(isDeptUsable('full', 99)).toBe(true);
  });
  test('id 文字列配列でも受け付ける', () => {
    expect(usableDeptIds('free', ['x', 'y', 'z', 'w'])).toEqual(['x', 'y', 'z']);
  });
});

describe('生成の補助ゲート（ペア交換・遷移強制・曜日パターン）', () => {
  test('無料は3機能すべて不可', () => {
    expect(generationAssistEnabled('free')).toBe(false);
  });
  test('フルは3機能すべて可', () => {
    expect(generationAssistEnabled('full')).toBe(true);
  });
  test('運営者・試用中はフル扱いなので可', () => {
    expect(generationAssistEnabled(effectivePlan({ is_admin: true }, NOW))).toBe(true);
    expect(generationAssistEnabled(effectivePlan({ plan: 'free', trial_ends_at: trialEnds(5) }, NOW))).toBe(true);
  });
});

describe('学習ゲート（#173 と同じ結果＝フルのみ）', () => {
  test('free=オフ / full=オン / 運営者=オン / 試用中=オン', () => {
    expect(learningEnabledV2({ plan: 'free' }, NOW)).toBe(false);
    expect(learningEnabledV2({ plan: 'full' }, NOW)).toBe(true);
    expect(learningEnabledV2({ plan: 'free', is_admin: true }, NOW)).toBe(true);
    expect(learningEnabledV2({ plan: 'free', trial_ends_at: trialEnds(10) }, NOW)).toBe(true);
  });
});

describe('試用の予告段階', () => {
  test('境界: 31→none / 30→small / 15→small / 14→prominent / 4→prominent / 3→last / 1→last / 0→ended / -1→ended', () => {
    const stage = (d) => trialNoticeStage({ trial_ends_at: trialEnds(d) }, NOW);
    expect(stage(31)).toBe('none');
    expect(stage(30)).toBe('small');
    expect(stage(15)).toBe('small');
    expect(stage(14)).toBe('prominent');
    expect(stage(4)).toBe('prominent');
    expect(stage(3)).toBe('last');
    expect(stage(1)).toBe('last');
    expect(stage(0)).toBe('ended');
    expect(stage(-1)).toBe('ended');
  });
  test('試用なしは none', () => {
    expect(trialNoticeStage({}, NOW)).toBe('none');
    expect(trialNoticeStage({ trial_ends_at: null }, NOW)).toBe('none');
  });
  test('JSTの日またぎで段階が変わる（残り1→last, 残り0→ended）', () => {
    const end = new Date('2026-10-19T15:30:00Z'); // JST 10/20 00:30
    expect(trialNoticeStage({ trial_ends_at: end }, new Date('2026-10-19T14:00:00Z'))).toBe('last');  // JST 10/19 → 残り1
    expect(trialNoticeStage({ trial_ends_at: end }, new Date('2026-10-19T15:40:00Z'))).toBe('ended'); // JST 10/20 → 残り0
  });
});
