/**
 * 認証まわりの純ロジック（副作用なし・テスト対象）。
 * Supabase の英語エラー文の和訳、パスワード再設定の入力検証、回復(リカバリー)モード判定を集約する。
 * ここは「文字列・真偽の判定」だけ。supabase 呼び出しや画面状態は App.jsx 側。
 */

/**
 * Supabase Auth のエラー文を分類する。
 * @param {string} raw e.message
 * @returns {'invalid'|'unconfirmed'|'exists'|'weak'|'ratelimit'|'generic'}
 */
// パスワードの最小文字数。画面の文言・エラー文・検証をこの1か所に揃える（直書き禁止）。
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_NOTE = `${PASSWORD_MIN_LENGTH}文字以上`;

// 確認メールの補足案内（登録直後・再送時に添える）。テストで同一文言を検証する。
export const CONFIRM_MAIL_NOTE = '確認メールが届かないときは、迷惑メールフォルダもご確認ください。再送した場合は、最新の1通のリンクだけが有効です。';

// CAPTCHA（Turnstile）の失敗文言。トークン取得失敗・期限切れ・検証エラー共通。
export const CAPTCHA_FAILED_NOTE = '確認に失敗しました。もう一度お試しください';

// ── Turnstile（CAPTCHA）トークンの options 組み立て（純粋・テスト対象）──
//    トークンが空（＝鍵未設定で未検証）のときは captchaToken を付けない＝従来と完全に同じ呼び出し。

/** 空文字/空白/null/undefined を undefined に正規化（付けない印）。 */
export function captchaToken(token) {
  const t = token == null ? '' : String(token).trim();
  return t ? t : undefined;
}

/** signUp 用 options。data は必ず付け、トークンがあるときだけ captchaToken を足す。 */
export function signupOptions(data, token) {
  const o = { data };
  const t = captchaToken(token);
  if (t) o.captchaToken = t;
  return o;
}

/** captchaToken だけの options。トークンが無ければ undefined（呼び出し側は options を付けない）。 */
export function captchaOnlyOptions(token) {
  const t = captchaToken(token);
  return t ? { captchaToken: t } : undefined;
}

export function classifyAuthError(raw) {
  const m = String(raw || '');
  if (/Invalid login credentials/i.test(m)) return 'invalid';
  if (/Email not confirmed/i.test(m)) return 'unconfirmed';
  if (/User already registered/i.test(m)) return 'exists';
  if (/Password should be at least/i.test(m)) return 'weak';
  // 新規登録が無効（Supabase の「Allow new users to sign up」OFF）:
  //   "Signups not allowed for this instance" / "Signup is disabled" / "email signups are disabled" など。
  if (/signups? (not allowed|is disabled|are disabled)|email signups are disabled|signup_disabled/i.test(m)) return 'signup_disabled';
  // CAPTCHA（Turnstile）検証エラー: "captcha verification process failed" / "captcha protection: ..." など。
  if (/captcha|turnstile/i.test(m)) return 'captcha';
  // 送信間隔制限: "For security purposes, you can only request this after 46 seconds."
  //   / "email rate limit exceeded" / "Too many requests" など。
  if (/only request this after|rate limit|too many requests|after\s+\d+\s+seconds/i.test(m)) return 'ratelimit';
  return 'generic';
}

export const AUTH_ERROR_TEXT = {
  invalid: 'メールアドレスまたはパスワードが正しくありません',
  unconfirmed: 'メール確認が完了していません。確認メールのリンクを開いてください',
  exists: 'このメールアドレスはすでに登録されています',
  weak: `パスワードは${PASSWORD_MIN_NOTE}で入力してください`,
  signup_disabled: '現在、新規登録は受け付けていません',
  captcha: CAPTCHA_FAILED_NOTE,
  ratelimit: '短い間に続けて送れません。しばらく待ってからお試しください',
};

/**
 * エラー文を日本語に変換。未知はそのまま（空なら汎用文）。
 * 既存のログイン/新規登録の文言（invalid/exists/weak）は従来と同一。
 */
export function authErrorMessage(raw) {
  const c = classifyAuthError(raw);
  return AUTH_ERROR_TEXT[c] || (String(raw || '') || 'エラーが発生しました');
}

/** ログイン失敗が「メール未確認」か（＝確認メール再送ボタンを出す条件）。 */
export function isEmailNotConfirmed(raw) {
  return classifyAuthError(raw) === 'unconfirmed';
}

/**
 * 新パスワードの検証（PASSWORD_MIN_LENGTH 文字以上・確認一致）。
 * @returns {{ok:boolean, message:string}}
 */
export function validateNewPassword(pw, pw2) {
  const p = String(pw || '');
  if (p.length < PASSWORD_MIN_LENGTH) return { ok: false, message: `パスワードは${PASSWORD_MIN_NOTE}で入力してください` };
  if (p !== String(pw2 || '')) return { ok: false, message: '確認用のパスワードが一致しません' };
  return { ok: true, message: '' };
}

/**
 * 新規登録パスワードの検証（登録画面用。PASSWORD_MIN_LENGTH 文字以上）。
 * 画面の「8文字以上」表記と実挙動を一致させるためのクライアント側チェック。
 * @returns {{ok:boolean, message:string}}
 */
export function validateSignupPassword(pw) {
  const p = String(pw || '');
  if (p.length < PASSWORD_MIN_LENGTH) return { ok: false, message: `パスワードは${PASSWORD_MIN_NOTE}で入力してください` };
  return { ok: true, message: '' };
}

/** onAuthStateChange のイベントが回復(パスワード再設定)か。 */
export function isRecoveryEvent(event) {
  return event === 'PASSWORD_RECOVERY';
}

/**
 * 再設定メールのリンクで戻ってきた URL か（Supabase の implicit flow は hash に
 * "#access_token=...&type=recovery" を付ける）。初期描画で通常画面を出さないための判定。
 * @param {string} hash  window.location.hash（または search）
 */
export function isRecoveryHash(hash) {
  const h = String(hash || '').replace(/^[#?]/, '');
  return /(^|&)type=recovery(&|$)/.test(h);
}

/**
 * 再設定/確認リンクが期限切れ・無効で戻ってきた URL か。
 * Supabase はこの場合 session を作らず、hash/query に
 * "error=access_denied&error_code=otp_expired&..." を付けて Site URL に戻す。
 * @param {string} hash  window.location.hash（または search）
 */
export function isRecoveryErrorHash(hash) {
  const h = String(hash || '').replace(/^[#?]/, '');
  return /(^|&)error_code=otp_expired(&|$)/.test(h) || /(^|&)error=access_denied(&|$)/.test(h);
}
