/**
 * src/lib/authFlow.js のテスト（純粋）。
 */
import { describe, test, expect } from 'vitest';
import {
  classifyAuthError, authErrorMessage, AUTH_ERROR_TEXT, isEmailNotConfirmed,
  validateNewPassword, isRecoveryEvent, isRecoveryHash, isRecoveryErrorHash,
  PASSWORD_MIN_LENGTH, PASSWORD_MIN_NOTE, CONFIRM_MAIL_NOTE, validateSignupPassword,
} from '../lib/authFlow.js';

describe('classifyAuthError / authErrorMessage', () => {
  test('ログイン失敗', () => {
    expect(classifyAuthError('Invalid login credentials')).toBe('invalid');
    expect(authErrorMessage('Invalid login credentials')).toBe(AUTH_ERROR_TEXT.invalid);
  });
  test('メール未確認', () => {
    expect(classifyAuthError('Email not confirmed')).toBe('unconfirmed');
    expect(authErrorMessage('Email not confirmed')).toBe('メール確認が完了していません。確認メールのリンクを開いてください');
  });
  test('登録済み', () => {
    expect(classifyAuthError('User already registered')).toBe('exists');
    expect(authErrorMessage('User already registered')).toBe('このメールアドレスはすでに登録されています');
  });
  test('弱いパスワード（既存文言と同一）', () => {
    expect(classifyAuthError('Password should be at least 6 characters')).toBe('weak');
    expect(authErrorMessage('Password should be at least 6 characters')).toBe(`パスワードは${PASSWORD_MIN_NOTE}で入力してください`);
  });
  test('送信間隔制限（複数の言い回し）', () => {
    expect(classifyAuthError('For security purposes, you can only request this after 46 seconds.')).toBe('ratelimit');
    expect(classifyAuthError('email rate limit exceeded')).toBe('ratelimit');
    expect(classifyAuthError('Too many requests')).toBe('ratelimit');
    expect(authErrorMessage('you can only request this after 20 seconds')).toBe('短い間に続けて送れません。しばらく待ってからお試しください');
  });
  test('未知はそのまま／空は汎用文', () => {
    expect(classifyAuthError('Something weird')).toBe('generic');
    expect(authErrorMessage('Something weird')).toBe('Something weird');
    expect(authErrorMessage('')).toBe('エラーが発生しました');
    expect(authErrorMessage(null)).toBe('エラーが発生しました');
  });
});

describe('isEmailNotConfirmed', () => {
  test('未確認のときだけ true', () => {
    expect(isEmailNotConfirmed('Email not confirmed')).toBe(true);
    expect(isEmailNotConfirmed('Invalid login credentials')).toBe(false);
  });
});

describe('validateNewPassword', () => {
  test('8文字未満は不可', () => {
    expect(validateNewPassword('1234567', '1234567').ok).toBe(false);
    expect(validateNewPassword('1234567', '1234567').message).toContain('8文字以上');
  });
  test('不一致は不可', () => {
    const r = validateNewPassword('abcd1234', 'abcd9999');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('一致');
  });
  test('8文字以上かつ一致は可', () => {
    expect(validateNewPassword('abcd1234', 'abcd1234')).toEqual({ ok: true, message: '' });
  });
  test('空・null は不可', () => {
    expect(validateNewPassword('', '').ok).toBe(false);
    expect(validateNewPassword(null, null).ok).toBe(false);
  });
});

describe('isRecoveryEvent', () => {
  test('PASSWORD_RECOVERY のときだけ true', () => {
    expect(isRecoveryEvent('PASSWORD_RECOVERY')).toBe(true);
    expect(isRecoveryEvent('SIGNED_IN')).toBe(false);
    expect(isRecoveryEvent('INITIAL_SESSION')).toBe(false);
  });
});

describe('isRecoveryHash', () => {
  test('type=recovery を含む hash は true', () => {
    expect(isRecoveryHash('#access_token=xxx&expires_in=3600&type=recovery')).toBe(true);
    expect(isRecoveryHash('#type=recovery')).toBe(true);
    expect(isRecoveryHash('?type=recovery')).toBe(true);
    expect(isRecoveryHash('#type=recovery&other=1')).toBe(true);
  });
  test('含まなければ false（signup 等）', () => {
    expect(isRecoveryHash('#access_token=xxx&type=signup')).toBe(false);
    expect(isRecoveryHash('#type=recoveryX')).toBe(false); // 部分一致で誤判定しない
    expect(isRecoveryHash('')).toBe(false);
    expect(isRecoveryHash(null)).toBe(false);
  });
});

describe('パスワード最小文字数の定数と文言の一致', () => {
  test('定数は8、表記は定数から生成', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MIN_NOTE).toBe('8文字以上');
  });
  test('weak エラー文は最小文字数と一致（旧「6文字」でない）', () => {
    expect(AUTH_ERROR_TEXT.weak).toBe(`パスワードは${PASSWORD_MIN_NOTE}で入力してください`);
    expect(AUTH_ERROR_TEXT.weak).toContain('8文字以上');
    expect(AUTH_ERROR_TEXT.weak).not.toContain('6文字');
  });
  test('validateNewPassword / validateSignupPassword が最小文字数で判定', () => {
    expect(validateNewPassword('1234567', '1234567').ok).toBe(false);   // 7文字→不可
    expect(validateNewPassword('12345678', '12345678').ok).toBe(true);  // 8文字→可
    expect(validateSignupPassword('1234567').ok).toBe(false);
    expect(validateSignupPassword('1234567').message).toBe(`パスワードは${PASSWORD_MIN_NOTE}で入力してください`);
    expect(validateSignupPassword('12345678').ok).toBe(true);
  });
});

describe('確認メールの補足案内 CONFIRM_MAIL_NOTE', () => {
  test('迷惑メールと最新1通のリンクの2点を含む', () => {
    expect(CONFIRM_MAIL_NOTE).toContain('迷惑メール');
    expect(CONFIRM_MAIL_NOTE).toContain('最新の1通');
  });
});

describe('新規登録拒否の日本語化', () => {
  test('Signups not allowed 系 → signup_disabled → 和文', () => {
    expect(classifyAuthError('Signups not allowed for this instance')).toBe('signup_disabled');
    expect(classifyAuthError('Signup is disabled')).toBe('signup_disabled');
    expect(classifyAuthError('Email signups are disabled')).toBe('signup_disabled');
    expect(authErrorMessage('Signups not allowed for this instance')).toBe('現在、新規登録は受け付けていません');
  });
});

describe('isRecoveryErrorHash（期限切れ・無効リンク）', () => {
  test('otp_expired / access_denied を含むと true', () => {
    expect(isRecoveryErrorHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe(true);
    expect(isRecoveryErrorHash('#error_code=otp_expired')).toBe(true);
    expect(isRecoveryErrorHash('?error=access_denied')).toBe(true);
  });
  test('正常な recovery / 無関係・空は false', () => {
    expect(isRecoveryErrorHash('#access_token=xxx&type=recovery')).toBe(false);
    expect(isRecoveryErrorHash('#error_code=otp_expiredX')).toBe(false); // 部分一致で誤判定しない
    expect(isRecoveryErrorHash('')).toBe(false);
    expect(isRecoveryErrorHash(null)).toBe(false);
  });
});
