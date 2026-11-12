/**
 * PR-3c: プランの制限・有料機能のゲート（純粋・副作用なし・テスト対象）。
 * 判定は planV2.js の effectivePlan 等を入口にし、ここでは「許可/禁止」と「実効フラグ」だけを決める。
 * 画面側はこれを呼ぶだけ。保存値は一切書き換えない（読み取り側で無効化する）。
 *
 * ★フラグ VITE_PLAN_V2_ENABLED が OFF のときは、呼び出し側がこれらを使わず従来値を使う。
 *   ここは「ON のときの判定」だけを定義する（OFF 分岐は App.jsx 側が持つ）。
 */
import { planV2Limits, canAddDept, canAddStaff, isDeptUsable, usableDeptIds } from './planV2.js';

export { planV2Limits, canAddDept, canAddStaff, isDeptUsable, usableDeptIds };

/**
 * 職員への送信（希望休リンク・共有シフトリンクの「新規発行／再発行」）を許可するか。
 * フル（運営者・試用中・有料を含む）のみ true。無料は false。
 * ※既存リンクの表示・コピー・QR・「止める」はこのゲートの対象外（呼び出し側で発行だけに効かせる）。
 */
export function canIssuePortalLink(effPlan) {
  return effPlan === 'full';
}

/**
 * 有料機能の実効フラグ。無料は全 false、フル（試用・有料・運営者）は全 true。
 * 設定値（保存値）は渡さない＝ここでは「効かせるか否か」だけ。呼び出し側が
 *   「保存フラグ && effectiveFeatureFlags(effPlan).xxx」で読み取り時に無効化する。
 * 7機能: learning(学習) / pairSwap(ペア交換) / transitionForce(遷移強制) /
 *        recurringPattern(曜日パターン) / weeklyDays(週◯日出勤) /
 *        nightLevel(夜勤レベル1・2) / yotei(予定表)
 */
export function effectiveFeatureFlags(effPlan) {
  const on = effPlan === 'full';
  return {
    learning: on,
    pairSwap: on,
    transitionForce: on,
    recurringPattern: on,
    weeklyDays: on,
    nightLevel: on,
    yotei: on,
  };
}

/**
 * Excel 貼り付けで職員が増える取り込みを許可するか（＋理由）。
 * 方針: 取り込み後の合計が上限を超える場合は「全体を止めて理由を表示」（部分取り込みで
 *   半端な状態を作らない）。現在数が既に上限以上なら 0 件でも不可。
 * @param {'free'|'full'} effPlan
 * @param {number} currentStaffCount 取り込み前の全部署合計
 * @param {number} incomingCount    今回取り込もうとする人数（新規追加分）
 * @returns {{ ok: boolean, limit: number, reason?: string }}
 */
export function canPasteStaff(effPlan, currentStaffCount, incomingCount) {
  const limit = planV2Limits(effPlan).staff;
  const total = (currentStaffCount ?? 0) + (incomingCount ?? 0);
  if (total <= limit) return { ok: true, limit };
  return {
    ok: false,
    limit,
    reason: `無料プランでは職員は合計${limit}名までです（取り込み後 ${total} 名）。フルプランで人数無制限になります。`,
  };
}

// 無料で機能が制限されたときに出す共通の短い案内（料金・購入ボタンは入れない）。
export const FULL_ONLY_NOTE = 'フルプランで使えます';

/**
 * 生成に渡す「部署」から有料の設定を外した新オブジェクトを返す（元は書き換えない＝保存値は不変）。
 * 外す: transitionForces(遷移強制)・targetSwapEnabled(ペア交換)。再び有料なら元の値がそのまま復活する。
 */
export function sanitizeDeptForFree(dept) {
  if (!dept || typeof dept !== 'object') return dept;
  const { transitionForces, targetSwapEnabled, ...rest } = dept; // eslint-disable-line no-unused-vars
  return rest;
}

/**
 * 生成に渡す「職員」から有料の設定を外した新オブジェクトを返す（元は書き換えない）。
 * 外す: weeklyWorkDays(週◯日)・nightLevel(夜勤レベル)・recurringPatterns(曜日パターン)。
 */
export function sanitizeStaffForFree(staff) {
  if (!staff || typeof staff !== 'object') return staff;
  const { weeklyWorkDays, nightLevel, recurringPatterns, ...rest } = staff; // eslint-disable-line no-unused-vars
  return rest;
}
