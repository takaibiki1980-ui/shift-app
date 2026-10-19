/**
 * 新しいプラン（無料 free / フル full の2段階）の判定ロジック（純粋・副作用なし）。
 * HANDOVER 3.46 の仕様をそのまま関数化したもの。
 *
 * ★この PR では画面にも生成にも配線しない（App.jsx / core.js は触らない）。
 *   既存の PLAN_LIMITS・limitOf・isLearningEnabled（App.jsx）はそのまま。ここは新規追加のみ。
 *
 * 設計メモ:
 *  - 現在時刻は必ず引数 now (Date) で受け取る（テストで日付を固定するため）。
 *  - 日数は日本時間（Asia/Tokyo）のカレンダー日で数える。
 *  - 「有料の契約中」の判定項目は今の profiles に無いため、plan === 'full' を既定で有料扱いとし、
 *    opts.isPaidActive で差し替えられる（決済・DB項目は後の PR）。
 *  - 'standard' は新しい判定では扱わない（下記 effectivePlan のコメント参照）。
 */

// ── Asia/Tokyo のカレンダー日を「UTC通日(整数)」へ正規化して日数差を出す ──
// Intl で JST の年月日を取り出し、その年月日の 00:00 UTC を通日に換算する。
// 両者を同じ基準に揃えるので、差はちょうど「JSTカレンダー日の差（整数）」になる。
const _jstDayNumber = (date) => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  return Math.floor(Date.UTC(+p.year, +p.month - 1, +p.day) / 86400000);
};

/**
 * 試用の残り日数（JSTカレンダー日）。trial_ends_at が無ければ null。
 * 例) now=10/19, trial_ends_at=10/25 → 6。end当日(残り0)は終了扱い。
 * @param {object|null} profile  { trial_ends_at?: string|Date|null }
 * @param {Date} now
 * @returns {number|null}
 */
export function trialDaysRemaining(profile, now) {
  const t = profile?.trial_ends_at;
  if (t === undefined || t === null || t === '') return null; // 試用なし
  const end = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(end.getTime())) return null; // 壊れた値は試用なし扱い（安全側）
  return _jstDayNumber(end) - _jstDayNumber(now);
}

/** 試用期間内か（残り1日以上。end当日=残り0 は終了＝無料）。 */
export function isTrialActive(profile, now) {
  const r = trialDaysRemaining(profile, now);
  return r !== null && r >= 1;
}

/**
 * 実効プラン 'free' | 'full'。判定順:
 *   ① 運営者(is_admin) → full
 *   ② 有料の契約中 → full（既定は plan==='full'。opts.isPaidActive で差し替え可）
 *   ③ 試用期間内 → full
 *   ④ それ以外 → free
 *
 * 'standard' の扱い: 新プランには standard が無い。既定では「有料扱いにしない」＝ free に落ちる
 *   （既存 limitOf の `PLAN_LIMITS[plan] || PLAN_LIMITS.free` と同じ最小権限フォールバック）。
 *   既存 standard 契約者を full として扱いたい場合は、本番の standard 行の有無を確認のうえ、
 *   配線 PR で opts.isPaidActive=true を渡して明示的に昇格させる（黙って昇格させない）。
 *
 * @param {object|null} profile  { is_admin?: boolean, plan?: string, trial_ends_at?: string|Date|null }
 * @param {Date} now
 * @param {object} [opts]  { isPaidActive?: boolean }
 * @returns {'free'|'full'}
 */
export function effectivePlan(profile, now, opts = {}) {
  if (profile?.is_admin) return 'full';
  const paidActive = opts.isPaidActive !== undefined ? !!opts.isPaidActive : (profile?.plan === 'full');
  if (paidActive) return 'full';
  if (isTrialActive(profile, now)) return 'full';
  return 'free';
}

// ── 数の上限（施設合計）。free=部署3・職員15、full=無制限 ──
export const PLAN_V2_LIMITS = {
  free: { depts: 3, staff: 15 },
  full: { depts: Infinity, staff: Infinity },
};

/** 実効プランの上限 { depts, staff }。 */
export function planV2Limits(effPlan) {
  return PLAN_V2_LIMITS[effPlan] || PLAN_V2_LIMITS.free;
}

/** 部署を追加してよいか（free は現在の部署数が3未満なら可）。既存は消さない前提。 */
export function canAddDept(effPlan, currentDeptCount) {
  return (currentDeptCount ?? 0) < planV2Limits(effPlan).depts;
}

/** 職員を追加してよいか（free は全部署合計が15未満なら可）。既存は消さない前提。 */
export function canAddStaff(effPlan, totalStaffCount) {
  return (totalStaffCount ?? 0) < planV2Limits(effPlan).staff;
}

/**
 * 使える部署の id 一覧。free はタブ並び順の先頭3つ、full は全部。
 * それ以外の部署は「閲覧・印刷・書き出しだけ」（生成・編集不可）＝この配列に含まれない。
 * @param {'free'|'full'} effPlan
 * @param {Array<string|{id:string}>} orderedDepts  タブ並び順（depts 配列と同じ順）
 * @returns {string[]}
 */
export function usableDeptIds(effPlan, orderedDepts) {
  const ids = (orderedDepts || []).map((d) => (typeof d === 'string' ? d : d?.id));
  const lim = planV2Limits(effPlan).depts;
  return lim === Infinity ? ids : ids.slice(0, lim);
}

/** 指定部署（並び順の index）が使えるか。free は先頭3つ(index<3)のみ。 */
export function isDeptUsable(effPlan, index) {
  const lim = planV2Limits(effPlan).depts;
  return lim === Infinity ? true : index < lim;
}

/**
 * 生成の補助（ペア交換 targetSwap・遷移強制 transitionForces・曜日パターン recurringPattern）が
 * 使えるか。フル（運営者・試用中・有料を含む）だけ true。無料は false。
 */
export function generationAssistEnabled(effPlan) {
  return effPlan === 'full';
}

/**
 * 学習（#173）が効くか。新プランでも同じ結果＝フルのみ true。
 * （既存 isLearningEnabled は standard/full/is_admin で true。新プランは standard を廃し、
 *   free/full/admin では同じ結果になる。）配線はしない。
 */
export function learningEnabledV2(profile, now, opts = {}) {
  return effectivePlan(profile, now, opts) === 'full';
}

/**
 * 試用の予告段階（残り日数から）。
 *   'none'      : 残り31日以上、または試用なし
 *   'small'     : 15〜30日
 *   'prominent' : 4〜14日
 *   'last'      : 1〜3日
 *   'ended'     : 0日以下（終了＝無料になった）
 */
export function trialNoticeStage(profile, now) {
  const r = trialDaysRemaining(profile, now);
  if (r === null) return 'none';   // 試用なし
  if (r <= 0) return 'ended';
  if (r <= 3) return 'last';
  if (r <= 14) return 'prominent';
  if (r <= 30) return 'small';
  return 'none';                   // 31日以上
}
