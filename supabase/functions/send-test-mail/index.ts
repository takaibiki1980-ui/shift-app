// @ts-nocheck
// send-test-mail: メール基盤（Resend）の疎通確認用。運営者(is_admin)だけが、自分の登録メール宛に
// 固定文のテストメールを1通送れる。宛先・件名・本文はリクエストから一切受け取らない。
// RESEND_API_KEY は Edge Function Secrets から読むだけで、ログにも応答にも出さない。

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const MAIL_FROM = "YEIX <noreply@mail.yeix.jp>";
export const MAIL_SUBJECT = "YEIX テスト送信";
export const MAIL_TEXT =
  "これは YEIX のメール送信テストです。\nこのメールが届いていれば、送信の設定は正しく動いています。\n\n※このメールは送信専用です。返信はできません。";
export const RATE_WINDOW_MS = 60 * 1000;

const jsonResp = (body, status) =>
  new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// 応答に載せる文字列から、万一キーが混ざっていても伏せる。
const scrub = (s, secret) => {
  let t = String(s == null ? "" : s);
  if (secret) t = t.split(secret).join("[hidden]");
  return t.slice(0, 300);
};

/**
 * 本体。deps を差し替えてテストできる（fetch / env / now / lastSent）。
 *  lastSent: Map<userId, 最後に送信を試みた時刻(ms)>。同じ実行環境が生きている間だけ保持。
 */
export async function handle(req, deps) {
  const { fetchFn, env, now, lastSent } = deps;

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResp({ error: "POST のみ受け付けます" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) return jsonResp({ error: "ログインが必要です" }, 401);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return jsonResp({ error: "サーバー設定が不足しています" }, 500);
  const base = { Authorization: auth, apikey: anonKey };

  // ① 呼び出した本人を、本人のトークンで確認する（宛先はここで得たメールだけ）。
  const uRes = await fetchFn(supabaseUrl + "/auth/v1/user", { headers: base });
  if (!uRes.ok) return jsonResp({ error: "ログインが必要です" }, 401);
  const user = await uRes.json().catch(() => null);
  if (!user || !user.id || !user.email) return jsonResp({ error: "ログインが必要です" }, 401);

  // ② 運営者かどうかは、既存の is_admin()（001_rls_profiles.sql）に本人のトークンで聞く。
  const aRes = await fetchFn(supabaseUrl + "/rest/v1/rpc/is_admin", {
    method: "POST",
    headers: { ...base, "Content-Type": "application/json" },
    body: "{}",
  });
  const isAdmin = aRes.ok ? await aRes.json().catch(() => false) : false;
  if (isAdmin !== true) return jsonResp({ error: "運営者だけが使えます" }, 403);

  // ③ キーの確認（値は出さない）。
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) return jsonResp({ error: "RESEND_API_KEY が設定されていません" }, 500);

  // ④ 連続送信の制限：同じ人は1分に1回まで。
  const t = now();
  const prev = lastSent.get(user.id);
  if (prev !== undefined && t - prev < RATE_WINDOW_MS) {
    const wait = Math.ceil((RATE_WINDOW_MS - (t - prev)) / 1000);
    return jsonResp({ error: "送信は1分に1回までです。" + wait + "秒後にもう一度お試しください。" }, 429);
  }
  lastSent.set(user.id, t);

  // ⑤ 送信。Idempotency-Key は、実行環境が入れ替わって④の記録が消えた場合の二重送信よけ
  //    （同じ人・同じ「分」の2通目を Resend 側で重複扱いにする）。
  let rRes;
  try {
    rRes = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": "send-test-mail/" + user.id + "/" + Math.floor(t / RATE_WINDOW_MS),
      },
      body: JSON.stringify({ from: MAIL_FROM, to: [user.email], subject: MAIL_SUBJECT, text: MAIL_TEXT }),
    });
  } catch (_e) {
    return jsonResp({ error: "メール送信サービスに接続できませんでした" }, 502);
  }
  const rBody = await rRes.json().catch(() => null);
  if (!rRes.ok) {
    return jsonResp({
      error: "メールを送信できませんでした",
      resend: {
        status: rRes.status,
        name: scrub(rBody && rBody.name, apiKey),
        message: scrub(rBody && rBody.message, apiKey),
      },
    }, 502);
  }
  return jsonResp({ ok: true, message: "ご自身の登録メールアドレスへ送信しました", id: (rBody && rBody.id) || null }, 200);
}

if (typeof Deno !== "undefined") {
  const lastSent = new Map();
  Deno.serve((req) =>
    handle(req, { fetchFn: fetch, env: (k) => Deno.env.get(k), now: () => Date.now(), lastSent })
      .catch(() => jsonResp({ error: "サーバーエラー" }, 500))
  );
}
