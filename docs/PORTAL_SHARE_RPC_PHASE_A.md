# 職員ポータル／共有リンク 窓口関数（Phase A）— 手順書

対象マイグレーション: `supabase/migrations/20261011_portal_share_rpc.sql`

## これは何か（Phase A）
職員ポータルと共有リンクが「必要な分だけ」読み書きするための窓口（SECURITY DEFINER 関数）を4本足す**追加のみ**の変更。
**この段階ではアプリも既存ポリシーも変えない**（＝今の動作は一切変わらない）。

- Phase A（本書）：窓口を足す。
- Phase B（別PR）：アプリ（StaffPortal / SharedShiftView）を `supabase.rpc()` 経由に差し替え、実機確認。
- Phase C（別PR）：`shift_data(facilityConfig)` / `staff_kibo` / `shared_shifts` の anon 公開を外す。

窓口は所有者権限で表を読むため、**Phase C で anon の表権限を外しても関数経由なら動く**（本書末尾のローカル検証で確認済み）。

## 足す関数（戻り値はアプリの現行形に合わせてある）
| 関数 | 返す | 悪用防止 |
|---|---|---|
| `get_portal_config(p_admin uuid, p_dept text default null)` | その施設1件の `{facility_name, depts[], staffList[{id,name,dept}]}`（jsonb）。p_dept 指定でその部署だけ | p_admin 一致の1件のみ。他施設は返らない（列挙不可） |
| `get_portal_kibo(p_admin uuid, p_dept text, p_month text)` | `staff_id, days, yukyu_days`（氏名なし） | キー3点一致の行のみ |
| `submit_portal_kibo(p_admin, p_dept, p_staff, p_month, p_days int[], p_yukyu int[])` | なし（upsert） | p_staff が p_admin の p_dept の職員として facilityConfig に実在するときだけ。無ければ例外(42501)。onConflict は現行と同じ |
| `get_shared_shift(p_token text)` | `year, month, dept_ids, shift_data, staff_data, dept_data` | token 完全一致の1件のみ（列挙不可） |

全関数 `SECURITY DEFINER` / `SET search_path=public` / `EXECUTE` は PUBLIC から剥がし anon・authenticated にのみ付与。`CREATE OR REPLACE`（冪等）。

---

## 1. 実行前の確認（SQL Editor）
```sql
-- 1-1. 同名関数がまだ無い（or 旧版）か
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('get_portal_config','get_portal_kibo','submit_portal_kibo','get_shared_shift')
ORDER BY 1,2;

-- 1-2. 対象表が存在すること
SELECT tablename FROM pg_tables WHERE schemaname='public'
  AND tablename IN ('shift_data','staff_kibo','shared_shifts') ORDER BY 1;
```

## 2. 実行
SQL Editor に `supabase/migrations/20261011_portal_share_rpc.sql` の全文を貼って実行（何度でも可）。

## 3. 実行後の確認（SQL Editor）
```sql
-- 3-1. 4本が SECURITY DEFINER(prosecdef=t) で存在し、search_path=public
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('get_portal_config','get_portal_kibo','submit_portal_kibo','get_shared_shift')
ORDER BY 1,2;
-- 期待: 4行、prosecdef=t、proconfig={search_path=public}

-- 3-2. EXECUTE 権限が anon / authenticated にあり、PUBLIC には無い
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('public', p.oid, 'EXECUTE')        AS public_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('get_portal_config','get_portal_kibo','submit_portal_kibo','get_shared_shift')
ORDER BY 1;
-- 期待: anon_exec=t, auth_exec=t, public_exec=f
```

## 4. 本番データを壊さない動作確認（SQL Editor）
実在の施設 id（`profiles.id` ＝ `shift_data.user_id`）を1つ選び、`<ADMIN>` に入れて実行する。
読み取り（①②④）は変更なし。③は **BEGIN〜ROLLBACK で必ず巻き戻す**。

```sql
-- 実在の施設 id を1つ拾う（結果の id を下の <ADMIN> に使う）
SELECT user_id AS admin_id
FROM shift_data WHERE data_key='facilityConfig' LIMIT 1;
```

### 4-1. ① 窓口 vs 直読み が一致（施設1件だけ返る）
```sql
BEGIN;
SET LOCAL role anon;
-- 窓口（施設名・部署数・職員数）
SELECT get_portal_config('<ADMIN>'::uuid)->>'facility_name' AS name,
       jsonb_array_length(get_portal_config('<ADMIN>'::uuid)->'depts')     AS n_depts,
       jsonb_array_length(get_portal_config('<ADMIN>'::uuid)->'staffList') AS n_staff;
ROLLBACK;

-- 直読み（現行ポータルが読んでいる値）と見比べる
SELECT data_value->>'facility_name' AS name,
       jsonb_array_length(data_value->'depts')     AS n_depts,
       jsonb_array_length(data_value->'staffList') AS n_staff
FROM shift_data WHERE user_id='<ADMIN>'::uuid AND data_key='facilityConfig';
-- → name / n_depts / n_staff が一致すること
```

### 4-2. ② 窓口 vs 直読み（希望休。`<DEPT>` `<YM>` は上の施設の実在値）
```sql
BEGIN; SET LOCAL role anon;
SELECT * FROM get_portal_kibo('<ADMIN>'::uuid,'<DEPT>','<YM>') ORDER BY staff_id;
ROLLBACK;

SELECT staff_id, days, yukyu_days FROM staff_kibo
WHERE admin_user_id='<ADMIN>'::uuid AND dept_id='<DEPT>' AND month_key='<YM>'
ORDER BY staff_id;
-- → 同じ行・同じ内容であること
```

### 4-3. ③ 送信（必ず ROLLBACK。実在職員 `<STAFF>` で）
```sql
BEGIN;
SET LOCAL role anon;
-- 正当: 実在職員なら成功し、窓口で読み直すと反映されている
SELECT submit_portal_kibo('<ADMIN>'::uuid,'<DEPT>','<STAFF>','<YM>','{1,2,3}','{}');
SELECT days, yukyu_days FROM get_portal_kibo('<ADMIN>'::uuid,'<DEPT>','<YM>') WHERE staff_id='<STAFF>';
ROLLBACK;   -- ← 本番データは変更しない

-- 捏造: 存在しない職員は弾かれる（例外 42501）
DO $$ BEGIN
  PERFORM set_config('role','anon',true);
  PERFORM submit_portal_kibo('<ADMIN>'::uuid,'<DEPT>','__no_such_staff__','<YM>','{1}','{}');
  RAISE NOTICE 'NG: 通ってしまった';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK: 弾かれた'; END $$;
RESET ROLE;
```

### 4-4. ④ 共有（実在トークン `<TOKEN>` と出鱈目トークン）
```sql
-- 実在トークンを1つ拾う
SELECT token FROM shared_shifts LIMIT 1;

BEGIN; SET LOCAL role anon;
SELECT year, month, dept_ids FROM get_shared_shift('<TOKEN>');   -- 1件
SELECT count(*) AS wrong FROM get_shared_shift('___nope___');     -- 0件
ROLLBACK;
```

### 4-5. アプリでの確認
Phase A ではアプリは未変更なので、**ポータル・共有・リーダー画面が今までどおり動くこと**（＝何も変わっていないこと）を一応確認。

---

## 5. 元に戻す SQL（DROP FUNCTION）
関数を消すだけ。ポリシー・表・アプリには何も触れていないので、これで実行前と同じ状態に戻る。
```sql
BEGIN;
DROP FUNCTION IF EXISTS public.get_portal_config(uuid, text);
DROP FUNCTION IF EXISTS public.get_portal_kibo(uuid, text, text);
DROP FUNCTION IF EXISTS public.submit_portal_kibo(uuid, text, text, text, int[], int[]);
DROP FUNCTION IF EXISTS public.get_shared_shift(text);
COMMIT;
```
戻した後は 3-1 が 0 行になることを確認。

---

## 6. ローカル検証の結果（PostgreSQL 16）
Supabase 風ロール（anon / authenticated）と3表の最小構成を作り、施設A（部署 d1/d2・職員3名）と施設B・既存 kibo・共有1件を投入して本マイグレーションを適用し、`SET ROLE anon` で確認した。

| 確認 | 結果 |
|---|---|
| anon から4本すべて EXECUTE 可（`has_function_privilege`） | すべて t |
| anon は3表を直接 SELECT 不可（この環境で未 GRANT＝Phase C 後相当） | すべて f。**それでも窓口は動く** |
| ① `get_portal_config(A,'d1')` | 施設A・d1 の depts/staffList だけ（role は返さない） |
| ① `get_portal_config(A)` | facility_name=施設A、depts=2、staff=3 |
| ① 存在しない施設 | NULL |
| ② `get_portal_kibo(A,'d1','2026-12')` | s-a1 {3,10}/{}・s-a2 {10,20}/{25} の2件 |
| ② 他施設 id で A のキー | 0件 |
| ③ 正当(A,d1,s-a1) | before {3,10} → after-submit {5,6,7}/{8} → **ROLLBACK で {3,10} に復帰** |
| ③ 存在しない職員 / 他部署の職員 / 他施設の職員 | いずれも例外(42501)で**拒否** |
| ④ 正しいトークン | 1件 |
| ④ 不一致トークン | 0件 |
| マイグレーション2回実行 | エラーなし |
| 5 の DROP | 4本削除で実行前に戻る |

## 7. 次段（本書の範囲外）
- Phase B：アプリを `supabase.rpc('get_portal_config'/'get_portal_kibo'/'submit_portal_kibo'/'get_shared_shift', …)` に差し替え。
- Phase C：`public_read_facilityConfig`・`staff_kibo` の anon 向け(true)ポリシー・`shared_shifts` の `public read by token`(true) を外し、anon の表 GRANT を REVOKE。
- 任意強化：共有トークンの桁増し＋偏り除去、ポータル URL への失効可能トークン追加。
