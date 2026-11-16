/**
 * supabase/functions/send-test-mail の本体 handle() のテスト（fetch・env・時刻を差し替え）。
 */
import { describe, test, expect } from 'vitest';
import { handle, MAIL_FROM, MAIL_SUBJECT, MAIL_TEXT } from '../../supabase/functions/send-test-mail/index.ts';

const KEY = 're_SECRET_dummy_key_123';
const ME = 'me@example.test';

function setup({ admin = true, userOk = true, key = KEY, resend = { status: 200, body: { id: 'mail_1' } } } = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify(userOk ? { id: 'u1', email: ME } : { msg: 'bad' }), { status: userOk ? 200 : 401 });
    if (url.endsWith('/rest/v1/rpc/is_admin')) return new Response(JSON.stringify(admin), { status: 200 });
    if (url === 'https://api.resend.com/emails') return new Response(JSON.stringify(resend.body), { status: resend.status });
    throw new Error('unexpected ' + url);
  };
  const envMap = { SUPABASE_URL: 'https://x.supabase.test', SUPABASE_ANON_KEY: 'anon', RESEND_API_KEY: key };
  const clock = { t: 1_000_000_000_000 };
  const deps = { fetchFn, env: (k) => envMap[k], now: () => clock.t, lastSent: new Map() };
  const req = (body, headers = { Authorization: 'Bearer user.jwt' }, method = 'POST') =>
    new Request('https://x/functions/v1/send-test-mail', { method, headers, body });
  const sent = () => calls.filter((c) => c.url === 'https://api.resend.com/emails');
  return { deps, req, calls, sent, clock };
}

describe('send-test-mail', () => {
  test('Authorization 無しは 401（どこにも問い合わせない）', async () => {
    const s = setup();
    const res = await handle(s.req(undefined, {}), s.deps);
    expect(res.status).toBe(401);
    expect(s.calls.length).toBe(0);
  });

  test('トークンが無効なら 401・送信しない', async () => {
    const s = setup({ userOk: false });
    expect((await handle(s.req(), s.deps)).status).toBe(401);
    expect(s.sent().length).toBe(0);
  });

  test('運営者でなければ 403・送信しない', async () => {
    const s = setup({ admin: false });
    expect((await handle(s.req(), s.deps)).status).toBe(403);
    expect(s.sent().length).toBe(0);
  });

  test('運営者なら本人宛に固定文で1通（本文の宛先指定は無視）', async () => {
    const s = setup();
    const res = await handle(s.req(JSON.stringify({ to: 'other@example.test', subject: 'x', text: 'y', from: 'z' })), s.deps);
    expect(res.status).toBe(200);
    expect(s.sent().length).toBe(1);
    const payload = JSON.parse(s.sent()[0].init.body);
    expect(payload).toEqual({ from: MAIL_FROM, to: [ME], subject: MAIL_SUBJECT, text: MAIL_TEXT });
    expect(MAIL_FROM).toBe('YEIX <noreply@mail.yeix.jp>');
    expect(MAIL_SUBJECT).toBe('YEIX テスト送信');
  });

  test('1分以内の再送は 429、1分たてば送れる', async () => {
    const s = setup();
    expect((await handle(s.req(), s.deps)).status).toBe(200);
    s.clock.t += 59_000;
    expect((await handle(s.req(), s.deps)).status).toBe(429);
    expect(s.sent().length).toBe(1);
    s.clock.t += 1_000;
    expect((await handle(s.req(), s.deps)).status).toBe(200);
    expect(s.sent().length).toBe(2);
  });

  test('キー未設定は 500・送信しない', async () => {
    const s = setup({ key: null });
    const res = await handle(s.req(), s.deps);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('RESEND_API_KEY');
    expect(s.sent().length).toBe(0);
  });

  test('Resend の失敗は内容を返すが、キーとメールアドレスは応答に出ない', async () => {
    const s = setup({ resend: { status: 403, body: { name: 'validation_error', message: 'bad key ' + KEY } } });
    const res = await handle(s.req(), s.deps);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain('validation_error');
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(ME);
  });

  test('成功の応答にもキー・メールアドレスは出ない／POST 以外は 405', async () => {
    const s = setup();
    const text = await (await handle(s.req(), s.deps)).text();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(ME);
    expect((await handle(s.req(undefined, { Authorization: 'Bearer a' }, 'GET'), s.deps)).status).toBe(405);
  });
});
