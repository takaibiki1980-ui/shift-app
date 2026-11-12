# アプリ内お知らせ欄（N-1・DB） — 手順書

対象マイグレーション: `supabase/migrations/20261112_announcements.sql`
元に戻す SQL: `supabase/migrations/20261112_announcements_revert.sql`

## 何をするか（決定済み仕様）
- `announcements` 新表：タイトル・本文・種類（`info`/`maintenance`/`important`/`incident`）・公開開始/終了・固定表示・公開/下書き・作成者。
- `announcement_reads` 新表：ユーザーごとの既読（主キー `(user_id, announcement_id)`）。端末間で既読を引き継ぐ。
- リーダー（`authenticated`）は**公開中**の行だけ読める（`published=true AND publish_at<=now() AND (expire_at IS NULL OR expire_at>now())`）。直書き不可（INSERT/UPDATE/DELETE ポリシーなし）。
- 運営者（`profiles.is_admin=true`）だけが作成・更新できる。RPC 内で既存 `is_admin()` を必ず確認。削除はしない（公開をやめるときは `published=false`）。
- 既読は `announcement_reads` への自分の行の INSERT（`on conflict do nothing`）。
- 新しい表・関数だけを追加し、既存の表・関数・ポリシーは一切変更しない。

**このPRでは本番適用しない。** 下の a〜d をユーザーが手動で行う。

> 各 SQL は貼る前に **Ctrl＋A で全消去**してから貼る。SQL Editor で警告が出たら、貼った全文が本体で前の SQL が混ざっていないか確認してから Run。

---

## a. 洗い出し（SELECT のみ・本番は変わらない）
```sql
-- a-1. 表がまだ無いこと（両方 NULL を期待）
SELECT to_regclass('public.announcements')       AS announcements_exists,
       to_regclass('public.announcement_reads')  AS reads_exists;

-- a-2. is_admin() が存在すること（再利用する。1 行を期待）
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname='is_admin' AND pronamespace='public'::regnamespace;

-- a-3. 同名の関数がまだ無いこと（0 行を期待）
SELECT proname FROM pg_proc
WHERE proname IN ('admin_upsert_announcement','admin_list_announcements')
  AND pronamespace='public'::regnamespace;
```

## b. 適用
`supabase/migrations/20261112_announcements.sql` の全文を SQL Editor に貼って Run（BEGIN〜COMMIT で1トランザクション・冪等）。

## c. 確認（適用後）
```sql
-- c-1. 表と RLS（relrowsecurity が両方 true を期待）
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('announcements','announcement_reads') AND relnamespace='public'::regnamespace;

-- c-2. ポリシー（announcements=select のみ / reads=select,insert のみ）
SELECT tablename, policyname, cmd, roles::text
FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('announcements','announcement_reads') ORDER BY tablename, policyname;

-- c-3. 権限（anon に無いこと・authenticated の EXECUTE/SELECT があること）
SELECT 'anon:announcements' AS item, has_table_privilege('anon','public.announcements','SELECT')::text AS v
UNION ALL SELECT 'authed:announcements SELECT', has_table_privilege('authenticated','public.announcements','SELECT')::text
UNION ALL SELECT 'authed:announcements INSERT', has_table_privilege('authenticated','public.announcements','INSERT')::text  -- false 期待（ポリシーなし）
UNION ALL SELECT 'anon:reads', has_table_privilege('anon','public.announcement_reads','SELECT')::text
UNION ALL SELECT 'authed:reads INSERT', has_table_privilege('authenticated','public.announcement_reads','INSERT')::text
UNION ALL SELECT 'anon:admin_upsert EXECUTE', has_function_privilege('anon','public.admin_upsert_announcement(uuid,text,text,text,timestamptz,timestamptz,boolean,boolean)','EXECUTE')::text  -- false 期待
UNION ALL SELECT 'authed:admin_upsert EXECUTE', has_function_privilege('authenticated','public.admin_upsert_announcement(uuid,text,text,text,timestamptz,timestamptz,boolean,boolean)','EXECUTE')::text
UNION ALL SELECT 'authed:admin_list EXECUTE', has_function_privilege('authenticated','public.admin_list_announcements()','EXECUTE')::text
ORDER BY 1;
-- 期待: anon 系=false / authed:announcements INSERT=false / それ以外の authed=true
```

## d. 元に戻す（revert）
`supabase/migrations/20261112_announcements_revert.sql` の全文を貼って Run（関数→ポリシー→表の順に削除。`pgcrypto`・`is_admin()` は残す）。
戻した後は a-1 が再び NULL を返すことを確認する。
