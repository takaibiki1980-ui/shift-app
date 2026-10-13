# Phase C: 表の anon 公開を外す — 手順書

対象マイグレーション: `supabase/migrations/20261013_phase_c_close_public_rls.sql`

## 【前提・最重要】
本番(Production)のアプリが **Phase B の窓口経由（`VITE_PORTAL_RPC_ENABLED=true`）で動いていること**。
切り替え前にこれを実行すると、ログインなしの職員ポータル／共有画面が止まる。
**必ず Production を RPC 経路にし、ポータル表示・希望休送信・共有表示が窓口経由で動くことを確認してから**実行する。

> 本書は `pg_policies` の実物CSVが今回のメッセージに添付されていないため、**リポジトリの migration（001/003/004/20260627）で作られたポリシー名**を正とした。実行前に「1-2」で本番の実際の名前を必ず突き合わせること（名前が違えば DROP 対象名を合わせる）。

## 消すポリシー / 残すポリシー / 追加するポリシー

| 表 | 消す（今 anon に開いている） | 残す | 追加（リーダー自分行） |
|---|---|---|---|
| `shift_data` | `public_read_facilityConfig`（SELECT・`data_key='facilityConfig'`） | `users_own_shift_data`（ALL・自分） | （なし） |
| `staff_kibo` | `staff_kibo_select`(true) / `staff_kibo_insert`(true) / `staff_kibo_update`(true) | `staff_kibo_delete`（自分） | `staff_kibo_select_own` / `staff_kibo_insert_own` / `staff_kibo_update_own`（すべて authenticated・`auth.uid()=admin_user_id`） |
| `shared_shifts` | `public read by token`(true) | `insert own shared_shifts`（自分・INSERT） | `shared_shifts_select_own`（authenticated・`auth.uid()=admin_user_id`） |

GRANT：3表の **anon への直接権限を REVOKE ALL**。`authenticated` への GRANT は触らない（リーダーの既存動作維持）。窓口関数4本の `EXECUTE`（anon/authenticated）はそのまま＝ポータル/共有は動き続ける（SECURITY DEFINER＝所有者権限で表を読む）。

---

## 1. 実行前：バックアップと現状の控え

### 1-1. 3表の中身を CSV で保存（Supabase の画面でかんたんに）
1. Supabase ダッシュボード → 左メニュー **Table Editor**。
2. テーブル一覧から **`staff_kibo`** を開く。
3. 右上の **「…」(Export)** または列ヘッダ付近の **Export** → **Export as CSV** → ダウンロード。
4. 同じ手順で **`shared_shifts`** も CSV 保存。
5. **`shift_data` の facilityConfig 行だけ**保存したいときは、Table Editor 上部の **Filter** で `data_key` = `facilityConfig` を追加 → Export as CSV。
   （件数が多い/フィルタが使いづらい場合は、SQL Editor で下を実行し結果を保存してもよい）
   ```sql
   SELECT user_id, data_key, data_value, updated_at
   FROM shift_data WHERE data_key = 'facilityConfig';
   ```
> これは「適用前の状態の控え」。万一戻すとき・監査のために取っておく。

### 1-2. 現在のポリシー / GRANT を控える（SQL Editor）
```sql
-- ポリシー（消す名前が本番に実在するか確認）
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('shift_data','staff_kibo','shared_shifts')
ORDER BY tablename, policyname;

-- anon / authenticated の表権限
SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('shift_data','staff_kibo','shared_shifts')
  AND grantee IN ('anon','authenticated')
GROUP BY grantee, table_name ORDER BY grantee, table_name;
```
結果を控える（戻すときの照合用）。`public_read_facilityConfig` / `staff_kibo_select` / `staff_kibo_insert` / `staff_kibo_update` / `public read by token` が実在することを確認。無い・名前が違う場合は migration の DROP 名を実物に合わせる。

## 2. 実行
SQL Editor に `supabase/migrations/20261013_phase_c_close_public_rls.sql` の全文を貼って実行（冪等・何度でも可）。

## 3. 実行後の確認（SQL Editor）

### 3-1. ポリシー / GRANT が狙いどおりか
```sql
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('shift_data','staff_kibo','shared_shifts')
ORDER BY tablename, policyname;
-- 期待:
--  shift_data:    users_own_shift_data のみ
--  staff_kibo:    staff_kibo_delete / _select_own / _insert_own / _update_own
--  shared_shifts: insert own shared_shifts / shared_shifts_select_own

SELECT grantee, table_name, string_agg(privilege_type,',') AS privs
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('shift_data','staff_kibo','shared_shifts')
  AND grantee='anon' GROUP BY 1,2;
-- 期待: 0 行（anon の表権限なし）
```

### 3-2. anon は直読み不可・窓口は動く（本番データを変えない）
`<ADMIN>` `<DEPT>` `<YM>` `<TOKEN>` は実在値（Phase A 手順書の方法で取得）。
```sql
BEGIN;
SET LOCAL role anon;
-- 直読みは権限エラー（それぞれ ERROR になるのが正しい）
-- ※エラーで止まるので1つずつ試すか、下の DO ブロックで判定する
DO $$ BEGIN PERFORM 1 FROM shift_data WHERE data_key='facilityConfig';
  RAISE NOTICE 'shift_data NG'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'shift_data OK(拒否)'; END $$;
DO $$ BEGIN PERFORM 1 FROM staff_kibo;
  RAISE NOTICE 'staff_kibo NG'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'staff_kibo OK(拒否)'; END $$;
DO $$ BEGIN PERFORM 1 FROM shared_shifts;
  RAISE NOTICE 'shared_shifts NG'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'shared_shifts OK(拒否)'; END $$;
-- 窓口は動く
SELECT get_portal_config('<ADMIN>'::uuid)->>'facility_name' AS cfg_name;
SELECT count(*) AS kibo FROM get_portal_kibo('<ADMIN>'::uuid,'<DEPT>','<YM>');
SELECT count(*) AS shared1 FROM get_shared_shift('<TOKEN>');     -- 1
SELECT count(*) AS shared0 FROM get_shared_shift('___nope___');  -- 0
ROLLBACK;
```

### 3-3. リーダー（ログイン済み）が自分の施設だけ読み書きできる
```sql
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claim.sub','<ADMIN>', true);  -- 施設A本人になりきる
SELECT count(*) AS own_kibo    FROM staff_kibo;              -- 自分の施設の行だけ（Bは0）
SELECT count(*) AS own_cfg     FROM shift_data WHERE user_id='<ADMIN>'::uuid AND data_key='facilityConfig'; -- 1
SELECT count(*) AS own_shared  FROM shared_shifts;           -- 自分の発行分だけ
-- 自分の staff_kibo upsert（右クリック付与相当）→ 成功。ROLLBACK で巻き戻す
INSERT INTO staff_kibo(admin_user_id,dept_id,staff_id,month_key,days,updated_at)
VALUES('<ADMIN>'::uuid,'<DEPT>','<STAFF>','<YM>','{1}',now())
ON CONFLICT (admin_user_id,dept_id,staff_id,month_key) DO UPDATE SET days=EXCLUDED.days;
ROLLBACK;
```
- アプリでも確認：リーダーでログイン → 希望休の表示・右クリックの付与/解除・（別端末での）リアルタイム反映が動くこと。職員ポータル（別ブラウザ/シークレット）で表示・送信できること。共有URLが開けること。

---

## 4. 元に戻す SQL（Phase A 適用前＝今と同じ公開状態に戻す）
```sql
BEGIN;
-- staff_kibo: 追加した自分行ポリシーを消し、anon 向け true を復活
DROP POLICY IF EXISTS "staff_kibo_select_own" ON staff_kibo;
DROP POLICY IF EXISTS "staff_kibo_insert_own" ON staff_kibo;
DROP POLICY IF EXISTS "staff_kibo_update_own" ON staff_kibo;
CREATE POLICY "staff_kibo_select" ON staff_kibo FOR SELECT USING (true);
CREATE POLICY "staff_kibo_insert" ON staff_kibo FOR INSERT WITH CHECK (true);
CREATE POLICY "staff_kibo_update" ON staff_kibo FOR UPDATE USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON staff_kibo TO anon;

-- shared_shifts: 追加した select_own を消し、public read by token(true) を復活
DROP POLICY IF EXISTS "shared_shifts_select_own" ON shared_shifts;
CREATE POLICY "public read by token" ON shared_shifts FOR SELECT USING (true);
GRANT SELECT ON shared_shifts TO anon;

-- shift_data: facilityConfig 公開読みを復活
CREATE POLICY "public_read_facilityConfig" ON shift_data FOR SELECT USING (data_key = 'facilityConfig');
GRANT SELECT ON shift_data TO anon;
COMMIT;
```
> 戻すと「誰でも読める/書ける」状態に戻る点に注意。戻したら 1-2 のクエリで元の一覧と一致するか確認。
> （Phase A の窓口関数は残したままで問題ない。アプリ側は `VITE_PORTAL_RPC_ENABLED` を外せば従来経路に戻る。）

---

## 5. ローカル検証（PostgreSQL 16）
Supabase 風ロール（anon / authenticated）＋ `auth.uid()`（`request.jwt.claim.sub` を読む）を用意し、現状のポリシー/GRANT（001/003/004/20260627 相当）＋ Phase A 窓口関数を入れ、施設A/B を投入して確認した。

| 段階 | 確認 | 結果 |
|---|---|---|
| 適用前 | anon が facilityConfig / staff_kibo / shared_shifts を直読み | 2 / 2 / 2 件（＝今は全件漏れ） |
| 適用後・anon | 3表の直 SELECT・staff_kibo への INSERT | すべて **権限エラー（拒否）** |
| 適用後・anon | `get_portal_config(A)` / `get_portal_kibo(A,d1,YM)` / `get_shared_shift(正)` / 不一致トークン | 施設A / 1件 / 1件 / 0件 |
| 適用後・anon | `submit_portal_kibo`（実在職員）→ 書けて ROLLBACK | before→{1,2}→巻き戻し |
| 適用後・リーダーA | 自分の staff_kibo / facilityConfig / shared_shifts | s-a1 の1件 / 1 / 1（Bは見えない=0） |
| 適用後・リーダーA | 自分行 upsert / 他施設B行への書き込み | 自分=成功(ROLLBACK) / B=**RLS 拒否** |
| 適用後 | anon の表権限 | 0 行（REVOKE 済み） |
| 最終ポリシー | shift_data=own のみ / staff_kibo=delete+select/insert/update_own / shared_shifts=insert own+select_own | 期待どおり |

（補足：ローカルで `SELECT auth.uid()` を直接呼ぶと schema 権限の都合でエラーになるが、RLS 内からの `auth.uid()` 評価は正常に働き、A は自分の行だけが見えることで確認できている。本番の Supabase では authenticated に auth スキーマ権限があるため直呼びも可。）

## 6. 実行順のまとめ
1. Production を `VITE_PORTAL_RPC_ENABLED=true` にして窓口経路に（Phase B・実機確認）。
2. 本書 1（CSVバックアップ＋現状控え）。
3. 本書 2（この migration を実行）。
4. 本書 3（anon 拒否 / 窓口可 / リーダー可 を確認）。
5. 問題があれば本書 4 で即戻す。
