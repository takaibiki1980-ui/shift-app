/**
 * PR-3d: 試用期間の終了予告の純粋ロジック（副作用なし・テスト対象）。
 * 日付の差だけで段階を決める（時刻は見ない）。JST カレンダー日の差は planV2 の trialDaysRemaining を再利用。
 * 表示する/しないの最終判定（運営者・フル・無料・フラグOFFでは出さない）は呼び出し側（App.jsx）が持つ。
 */
import { trialDaysRemaining } from './planV2.js';

/**
 * 予告の段階。now と試用終了日(trialEndsAt)の「JSTカレンダー日の差」で決める。
 *   'early' : 30〜15日前（1か月前〜15日前）… 小さく1行
 *   'soon'  : 14〜4日前 … 目立つ形で項目
 *   'last'  : 3日前〜当日(残り3〜0日) … 目立つ形＋終了日を大きく
 *   'none'  : 31日以上前、終了後(残りマイナス)、試用なし
 * @param {Date} now
 * @param {string|Date|null} trialEndsAt
 * @returns {'none'|'early'|'soon'|'last'}
 */
export function trialNoticeStage(now, trialEndsAt) {
  const r = trialDaysRemaining({ trial_ends_at: trialEndsAt }, now);
  if (r === null) return 'none';   // 試用なし/壊れた値
  if (r < 0 || r > 30) return 'none'; // 終了後、または1か月より先
  if (r <= 3) return 'last';       // 残り3〜0日（3日前〜当日）
  if (r <= 14) return 'soon';      // 残り14〜4日
  return 'early';                  // 残り30〜15日
}

/**
 * 予告に出す「使えなくなるもの」の項目。部署・職員は条件で出し分ける。
 * @param {string} plan  profile.plan（API 互換のため受けるが、出し分けは depts/staffCount で行う）
 * @param {Array<{id:string,label?:string}>} depts  タブ並び順の部署配列
 * @param {number} staffCount  全部署合計の職員数
 * @returns {{
 *   depts: null | { usableNames: string[], usableCount: number },  // 部署>3 のときのみ（先頭3つ）
 *   staffAddBlocked: boolean,  // 16人以上
 *   features: string[],        // 有料7機能（常に表示）
 *   sendBlocked: boolean,      // 職員への送信（常に表示）
 * }}
 */
export function trialNoticeContent(plan, depts, staffCount) {
  const list = Array.isArray(depts) ? depts : [];
  const USABLE = 3;
  const deptsItem = list.length > USABLE
    ? { usableNames: list.slice(0, USABLE).map((d) => (d && d.label) ? d.label : (d && d.id) || ''), usableCount: USABLE }
    : null;
  return {
    depts: deptsItem,
    staffAddBlocked: (staffCount ?? 0) >= 16,
    features: ['学習', 'ペア交換', '遷移強制', '曜日パターン', '週◯日出勤', '夜勤レベル', '予定表'],
    sendBlocked: true,
  };
}

// 段階ごとの dismiss 保存キー（localStorage）。段階が進めば別キー＝再度表示される。
export function trialNoticeDismissKey(stage) {
  return `planNoticeDismissed:${stage}`;
}
