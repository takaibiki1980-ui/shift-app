/**
 * 新プラン（free/full 2段階）の「配線の判断」純粋ロジック（PR-3b）。副作用なし・テスト対象。
 * 画面(App.jsx)はここで実効プランの値を決め、読み込み失敗時にどの profile を保持するかを決める。
 * 制限・ロック・通知（PR-3c/3d）は入れない＝ここは“値の決定”だけ。
 */
import { effectivePlan } from './planV2.js';

// AdminPanel のプラン選択肢（standard は廃止＝無料とフルの2択）。
export const PLAN_V2_CHOICES = ['free', 'full'];

/**
 * 実効プランの値を返す。
 *  - enabled=true（新プラン ON）: planV2 の effectivePlan（管理者→有料→試用→無料）。
 *  - enabled=false（OFF）: 挙動には使わない「参考値」。管理者→'full'、その他は保存プラン（既定 'free'）。
 * now はテスト固定のため引数。opts は planV2 の effectivePlan にそのまま渡す（isPaidActive 等）。
 */
export function effectivePlanValue(profile, now, enabled, opts = {}) {
  if (enabled) return effectivePlan(profile, now, opts);
  if (profile?.is_admin) return 'full';
  return profile?.plan || 'free';
}

// 「読み込み失敗」を表す reason（ensureProfile(Safe) の戻り値 reason）。
// これらのときは、すでに読み込み済みの profile があれば保持する（有料/管理者が一瞬無料に落ちるのを防ぐ）。
const KEEP_PREV_REASONS = new Set(['read-error', 'exception', 'reread-error']);

/**
 * fetchProfile が setProfile に渡す値を決める純関数。
 *  - 失敗(reason が上記) かつ 既存 profile が「同じユーザーのもの」(prevProfile.id === userId) → 既存を保持。
 *  - それ以外 → 取得結果 result.profile（初回失敗なら既定 free が入っている）。
 * ★ userId は今回読み込んだ対象ユーザー(session.user.id)。別ユーザーに切り替わった直後の失敗で、
 *   前のユーザーの profile を保持してしまわないためのガード。
 */
export function resolveFetchedProfile(prevProfile, result, userId) {
  const sameUser = !!prevProfile && userId != null && prevProfile.id === userId;
  if (sameUser && result && KEEP_PREV_REASONS.has(result.reason)) return prevProfile;
  return (result && Object.prototype.hasOwnProperty.call(result, 'profile')) ? result.profile : null;
}
