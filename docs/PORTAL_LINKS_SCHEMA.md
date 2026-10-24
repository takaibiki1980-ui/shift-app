# 職員ポータル／共有リンク新方式（PR-B・DB） — 手順書

対象マイグレーション: `supabase/migrations/20261024_portal_links.sql`

## 何をするか（決定済み仕様）
- `portal_links` 新表：リンクごとに**長いランダム token（24文字）**・`expires_at`（期限）・`revoked_at`（失効）を持つ。URL に管理者 uuid を含めない。
- 希望休リンクの期限 = リーダーが毎月設定する**締切日の終わり(JST)**。締切は `facilityConfig.depts[].deadline`（`"YYYY-MM-DD"`。月別は `depts[].byMonth["YYYY-M"].deadline`）に保存されている。発行時に画面側 `deadlineExpiry()` で「その日の終わり(JST)」を算出し `p_expires_at` に渡す。
- 共有シフトリンクの期限 = **そのシフト月の月末(JST)の30日後**（画面側 `shareExpiry()` で算出）。
- リーダー本人はいつでも失効できる（`revoke_portal_link` / `revoke_shared_shift`）。
- 不存在・期限切れ・失効は**区別せず**同じ「見つからない／無効」応答（列挙・推測を防ぐ）。
- 併用期間のため旧 RPC（`get_portal_config` / `get_portal_kibo` / `submit_portal_kibo`）は残す。`get_shared_shift` は同じシグネチャのまま期限・失効の判定を追加（既存 share は `expires_at=NULL` なので従来どおり見える）。旧経路の撤去は PR-F。

**このPRでは本番適用しない。** 下の a〜f をユーザーが手動で行う。

> 各 SQL は貼る前に **Ctrl＋A で全消去**してから貼る。SQL Editor で「Potential issue detected」が出たら、貼った全文が本体で前の SQL が混ざっていないか確認してから Run。

---

## a. 洗い出し（SELECT のみ・本番は変わらない）
```sql
-- a-1. portal_links がまだ無いこと
SELECT to_regclass('public.portal_links') AS portal_links_exists;  -- 期待: NULL

-- a-2. shared_shifts の列（revoked_at がまだ無いこと）
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='shared_shifts' ORDER BY ordinal_position;

-- a-3. shared_shifts の本番ポリシー（"insert own" と "shared_shifts_select_own" の2つだけか）
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='shared_shifts' ORDER BY policyname;

-- a-4. 本番の get_shared_shift が repo（20261011）と一致するか（戻り値/本体）
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE proname='get_shared_shift' AND pronamespace='public'::regnamespace;

-- a-5. pgcrypto が入っているか（gen_random_bytes 用）
SELECT extname FROM pg_extension WHERE extname='pgcrypto';
```
**期待**：a-1=NULL／a-2 に `revoked_at` 無し／a-3 は2ポリシーのみ／a-4 は token 一致1件を返すだけの定義／a-5 で pgcrypto 有り（無ければ本体で `CREATE EXTENSION` される）。

## b. 控え
- a-4 の `get_shared_shift` 定義を**テキスト保存**（戻すときの素）。
- `shared_shifts` を Table Editor → Export as CSV（適用前の控え）。

## c. 本体（＝ migration 全文）
`supabase/migrations/20261024_portal_links.sql` を貼って実行。冪等・`BEGIN;…COMMIT;`。
**期待**：エラーなし（2回目以降は NOTICE が出るだけ）。

## d. 確認（SELECT のみ）
```sql
-- d-1. portal_links があり RLS 有効
SELECT relrowsecurity FROM pg_class WHERE oid='public.portal_links'::regclass; -- 期待 true
-- d-2. ポリシー（portal_links_select_own のみ）
SELECT policyname, cmd, roles::text, qual FROM pg_policies
WHERE schemaname='public' AND tablename='portal_links';
-- d-3. anon は portal_links に表権限なし（0 行）
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='portal_links' AND grantee='anon';
-- d-4. shared_shifts に revoked_at 追加
SELECT column_name FROM information_schema.columns
WHERE table_name='shared_shifts' AND column_name='revoked_at';
-- d-5. 新 RPC の EXECUTE 権限
SELECT p.proname, r.grantee
FROM pg_proc p
JOIN information_schema.routine_privileges r ON r.routine_name=p.proname AND r.routine_schema='public'
WHERE p.proname IN ('get_portal_by_token','get_portal_kibo_by_token','submit_portal_kibo_by_token',
  'issue_portal_link','revoke_portal_link','revoke_shared_shift','get_shared_shift','gen_portal_token')
ORDER BY p.proname, r.grantee;
-- 期待: get_*_by_token/submit_*_by_token/get_shared_shift は anon,authenticated。
--       issue/revoke_* は authenticated のみ。gen_portal_token は付与なし。
```

## e. 動作確認（本番を変えない・`BEGIN; … ROLLBACK;`）
`<ADMIN>`（運営アカウントでない実リーダーの id）・`<DEPT>`・`<STAFF>`・`<YM>` は実在値。
```sql
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claim.sub','<ADMIN>', true);
SELECT set_config('request.jwt.claims', json_build_object('sub','<ADMIN>','role','authenticated')::text, true);

-- 発行（未来期限）→ token を得る
SELECT id AS link_id, token FROM issue_portal_link('<DEPT>','<YM>', now()+interval '7 days','確認用') \gset
-- anon 視点で token から取得できる
SET LOCAL role anon;
SELECT get_portal_by_token(:'token') IS NOT NULL AS can_read;          -- 期待 t
SELECT submit_portal_kibo_by_token(:'token','<STAFF>','<YM>','{1}','{}'); -- 期待 成功

-- 期限切れは見えない
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claim.sub','<ADMIN>', true);
SELECT token AS extk FROM issue_portal_link('<DEPT>','<YM>', now()-interval '1 day','期限切れ') \gset
SET LOCAL role anon;
SELECT get_portal_by_token(:'extk') IS NULL AS expired_hidden;          -- 期待 t

ROLLBACK;  -- 発行したテスト行も含め全部取り消し
```
**期待**：`can_read=t`／送信成功／`expired_hidden=t`。ROLLBACK で本番は不変。
（失効・他人不可・anon 直読み不可はローカル検証済み。本番で試す場合も必ず `BEGIN; … ROLLBACK;` 内で。）

## f. アプリで動作確認
- 配線は PR-C（フラグ OFF）なので、この時点では画面の挙動は変わらない。既存のログイン・保存・既存の共有/ポータルが従来どおり動くことだけ確認。

## g. 元に戻す SQL（先に用意）
```sql
BEGIN;
-- get_shared_shift を期限/失効チェック無し（20261011）へ戻す
CREATE OR REPLACE FUNCTION public.get_shared_shift(p_token text)
RETURNS TABLE (year int, month int, dept_ids text[], shift_data jsonb, staff_data jsonb, dept_data jsonb)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT s.year, s.month, s.dept_ids, s.shift_data, s.staff_data, s.dept_data
  FROM shared_shifts s WHERE s.token = p_token;
$$;
REVOKE ALL ON FUNCTION public.get_shared_shift(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_shift(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_portal_by_token(text);
DROP FUNCTION IF EXISTS public.get_portal_kibo_by_token(text, text);
DROP FUNCTION IF EXISTS public.submit_portal_kibo_by_token(text, text, text, int[], int[]);
DROP FUNCTION IF EXISTS public.issue_portal_link(text, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.revoke_portal_link(uuid);
DROP FUNCTION IF EXISTS public.revoke_shared_shift(uuid);
DROP FUNCTION IF EXISTS public.gen_portal_token(int);

ALTER TABLE shared_shifts DROP COLUMN IF EXISTS revoked_at;

DROP POLICY IF EXISTS portal_links_select_own ON portal_links;
DROP TABLE IF EXISTS portal_links;
COMMIT;
```
戻したあと：d-1 がエラー（表が無い）、`shared_shifts.revoked_at` が無いことを確認。

---

## ローカル検証結果（PostgreSQL 16）
本番相当（anon/authenticated/service_role・`auth.uid()`・shift_data(facilityConfig)・staff_kibo・shared_shifts・既存 get_portal_config）に本体を適用して確認。

| # | 観点 | 結果 |
|---|---|---|
| 1 | 冪等（2回適用） | エラーなし |
| 2 | `gen_portal_token(24)` | 24文字・許可文字のみ |
| 3 | 発行→token で `get_portal_by_token`（施設名取得・role 無し） | OK |
| 4 | anon が token で `submit_portal_kibo_by_token` → staff_kibo に入る | OK |
| 5 | 期限切れリンク：get は NULL／submit は「リンクが無効です」 | OK |
| 6 | 本人が `revoke_portal_link` → get は NULL | OK |
| 7 | 他人（B）は A のリンクを id 指定でも失効できない | OK（有効のまま） |
| 8 | anon は `portal_links` を直接 SELECT 不可 | OK（permission denied） |
| 9 | authenticated 本人は自分の行だけ SELECT（他施設=0） | OK |
| 10 | `revoke_shared_shift`（本人）→ `get_shared_shift` が no row | OK |
| 11 | 元に戻す SQL | portal_links 削除・revoked_at 削除・get_shared_shift 復元 |

---

## 未確認事項
- 本番の `get_shared_shift` が repo（20261011）と一致するか（a-4 で突合。ズレていれば本体の CREATE OR REPLACE で上書きされる点に留意）。
- 本番 `shared_shifts` のポリシーが「insert own」「shared_shifts_select_own」の2つだけか（a-3）。想定外ポリシーがあれば報告のうえ判断。
- pgcrypto が本番で有効か（a-5）。無効で `CREATE EXTENSION` が権限で失敗する場合は、Supabase の Database → Extensions から pgcrypto を有効化してから本体を流す。
- `issue_portal_link` は `p_expires_at` を client（画面）から受け取る設計。締切の真実源（facilityConfig の deadline）をサーバ側で直接読む方式にするかは PR-C/PR-D で再検討（未確認）。

## PR-C（画面配線）に必要な前提
- 発行：`supabase.rpc('issue_portal_link', { p_dept, p_month, p_expires_at, p_label })` → `{ id, token }`。`p_expires_at` は希望休なら `deadlineExpiry(deadline)`、共有は別導線。URL は `buildPortalUrl(base, token)`（`?p=<token>`）。
- 取得：`get_portal_by_token(p_token)` / `get_portal_kibo_by_token(p_token, p_month)` / `submit_portal_kibo_by_token(...)`。入口（`App.jsx` の `parseLinkParams`）で `kind:'portal'` の token を使う。
- 共有：発行時に `shared_shifts.expires_at = shareExpiry(shiftYm, 30)` を入れて INSERT。失効は `revoke_shared_shift(id)`。読み取りは既存 `get_shared_shift`（期限/失効判定込み）。
- 失効 UI：`portal_links`（本人 SELECT 可）を一覧し `revoke_portal_link(id)` / `revoke_shared_shift(id)`。
- フラグ：新方式は `VITE_PORTAL_TOKEN_ENABLED`（既定 OFF）で OFF 時は旧経路のまま（PR-C で導入）。
