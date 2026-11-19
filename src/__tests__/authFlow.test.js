/**
 * src/lib/authFlow.js のテスト（純粋）。
 */
import { describe, test, expect } from 'vitest';
import {
  classifyAuthError, authErrorMessage, AUTH_ERROR_TEXT, isEmailNotConfirmed,
  validateNewPassword, isRecoveryEvent, isRecoveryHash,
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
    expect(authErrorMessage('Password should be at least 6 characters')).toBe('パスワードは6文字以上で入力してください');
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
