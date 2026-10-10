# profiles の plan / is_admin 書き換え防止 — 手順書

対象マイグレーション: `supabase/migrations/20261010_profiles_protect_plan_admin.sql`

## 何を直すか

本番の `profiles` の RLS は次のとおりで、列の制限がない。

| ポリシー | 条件 |
|---|---|
| `profiles_update` | qual・with_check とも `(auth.uid() = id) OR is_admin()` |
| `profiles_insert` | with_check `(auth.uid() = id)` |

そのため、ログイン中の一般利用者がブラウザから自分の行の `plan` を `full` に、`is_admin` を `true` に書き換えられる。
`is_admin` が true になると、ほかの施設の `profiles` を見たり変えたりでき、運営者用の画面（AdminPanel）も開ける。

## どう直すか

RLS ポリシーはそのまま残し、`profiles` に BEFORE トリガーを 2 つ足す（関数は 1 つで共用）。

| 操作 | 実行した人 | 結果 |
|---|---|---|
| UPDATE で `plan` か `is_admin` が変わる | 一般利用者（anon / authenticated で、`is_admin()` が false） | **エラーで止まる**（SQLSTATE 42501） |
| UPDATE で施設名など、ほかの欄だけ変わる | 一般利用者 | 今までどおり通る |
| UPDATE で `plan` / `is_admin` が変わる | 運営者（authenticated で、`is_admin()` が true） | 今までどおり通る（AdminPanel） |
| INSERT | 一般利用者 | `plan='free'`、`is_admin=false` に強制して通す |
| 何でも | SQL Editor（postgres）・service_role・SECURITY DEFINER 関数の中 | 素通り（今までどおり） |

- 新規登録時の `handle_new_user()` は SECURITY DEFINER なので素通りする。もともと plan / is_admin を指定しないので、既定値（free / false）になる。
- `is_admin()` は SECURITY DEFINER で `profiles` を SELECT するだけ。SELECT はトリガーを起こさないので無限ループにならない。所有者権限で RLS を通らずに読むので、権限の問題もない。読むのは更新前の値なので、自分を true にする更新の中で運営者と判定されることはない。
- アプリのコードは変えない。

---

## 1. 実行前の確認（SQL Editor）

```sql
-- 1-1. 今の profiles のポリシー（profiles_update / profiles_insert が上の表のとおりか）
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 1-2. 今の profiles のトリガー（trg_profiles_protect_* がまだ無いこと）
SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;

-- 1-3. is_admin() の中身（profiles を SELECT するだけで、SECURITY DEFINER であること）
SELECT prosecdef, pg_get_functiondef(oid)
FROM pg_proc WHERE proname = 'is_admin' AND pronamespace = 'public'::regnamespace;

-- 1-4. すでに自己昇格された行が無いか（運営者と有料プランの一覧。心当たりの無い行が無いか目で見る）
SELECT id, facility_name, plan, is_admin, created_at, updated_at
FROM public.profiles
WHERE is_admin OR plan <> 'free'
ORDER BY updated_at DESC;
```

1-4 で心当たりの無い行があれば、先に SQL Editor から直す（トリガーを入れた後でも、SQL Editor からなら直せる）。

```sql
-- 例: 心当たりの無い運営者フラグ・プランを戻す（id は 1-4 で確認したもの）
UPDATE public.profiles SET is_admin = false, plan = 'free' WHERE id = '<id>';
```

## 2. 実行

SQL Editor に `supabase/migrations/20261010_profiles_protect_plan_admin.sql` の中身を貼って実行する。
何度実行しても結果は同じ。

## 3. 実行後の確認（SQL Editor）

```sql
-- 3-1. トリガーが 2 つあり、有効（tgenabled = 'O'）であること
SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
ORDER BY tgname;
-- 期待: trg_profiles_protect_insert / trg_profiles_protect_update の 2 行

-- 3-2. 関数が SECURITY INVOKER（prosecdef = false）で、search_path が固定されていること
SELECT proname, prosecdef, proconfig
FROM pg_proc WHERE proname = 'protect_profiles_privileged_columns';
-- 期待: prosecdef = false, proconfig = {search_path=public}

-- 3-3. ポリシーが変わっていないこと（1-1 と同じ結果）
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;
```

### 3-4. 動作の確認（本番データは変わらない）

下の SQL は、一般利用者と運営者になりきって実際に更新を試す。
最後にわざとエラーを出して終わるので、途中の変更はすべて自動で取り消される。
**結果はエラーメッセージの中に出る**。全部 OK なら成功。
（`profiles` に一般利用者と運営者が 1 人ずつ以上いることが前提）

```sql
DO $$
DECLARE
  u uuid;  -- 一般ユーザー（is_admin=false）を1人
  a uuid;  -- 運営者（is_admin=true）を1人
  v_plan text; v_admin boolean; v_name text;
  ok boolean;
  r text := '';
BEGIN
  SELECT id INTO u FROM public.profiles WHERE is_admin = false ORDER BY created_at LIMIT 1;
  SELECT id INTO a FROM public.profiles WHERE is_admin = true  ORDER BY created_at LIMIT 1;
  IF u IS NULL OR a IS NULL THEN RAISE EXCEPTION '一般ユーザーと運営者が1人ずつ必要です'; END IF;

  -- アプリからのログイン中ユーザー（一般）になりきる
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  -- ① 一般ユーザーが自分の plan を（今と違う値に）変える → 拒否されるべき
  BEGIN
    UPDATE public.profiles SET plan = CASE WHEN plan = 'full' THEN 'free' ELSE 'full' END WHERE id = u; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  r := r || ' ①' || CASE WHEN ok THEN 'OK' ELSE 'NG' END;

  -- ② 一般ユーザーが自分の is_admin を true にする → 拒否されるべき
  BEGIN
    UPDATE public.profiles SET is_admin = true WHERE id = u; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  r := r || ' ②' || CASE WHEN ok THEN 'OK' ELSE 'NG' END;

  -- ③ 一般ユーザーが自分の施設名を変える → 通るべき
  UPDATE public.profiles SET facility_name = facility_name || '（確認）' WHERE id = u;
  SELECT facility_name INTO v_name FROM public.profiles WHERE id = u;
  r := r || ' ③' || CASE WHEN v_name LIKE '%（確認）' THEN 'OK' ELSE 'NG' END;

  -- ④ 運営者になりきって、一般ユーザーの plan を変える → 通るべき（AdminPanel と同じ）
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  SELECT plan INTO v_plan FROM public.profiles WHERE id = u;
  UPDATE public.profiles SET plan = CASE WHEN v_plan = 'standard' THEN 'full' ELSE 'standard' END WHERE id = u;
  PERFORM set_config('role', 'none', true);  -- SQL Editor 本来の権限に戻す
  r := r || ' ④' || CASE WHEN (SELECT plan FROM public.profiles WHERE id = u) IS DISTINCT FROM v_plan THEN 'OK' ELSE 'NG' END;

  -- ⑤ SQL Editor（管理画面）から is_admin を変える → 通るべき
  UPDATE public.profiles SET is_admin = true WHERE id = u;
  SELECT is_admin INTO v_admin FROM public.profiles WHERE id = u;
  r := r || ' ⑤' || CASE WHEN v_admin THEN 'OK' ELSE 'NG' END;

  RAISE EXCEPTION '【確認結果・変更はすべて取り消し済み】%', r;
END $$;
```

期待する表示: `ERROR: 【確認結果・変更はすべて取り消し済み】 ①OK ②OK ③OK ④OK ⑤OK`
（トリガーを入れる前に実行すると `①NG ②NG ③OK ④OK ⑤OK` になる）

### 3-5. アプリでの確認

- 運営者アカウントでログインし、AdminPanel（管理）からどこかの施設のプランを変えて元に戻す → 変わること。
- 新しいメールアドレスで新規登録 → ログインでき、プラン表示が「無料プラン」であること。

---

## 4. 元に戻す SQL

トリガーと関数を消すだけ。ポリシー・`is_admin()`・`handle_new_user()` には触れていないので、これで実行前と同じ状態に戻る（＝自己昇格できる状態に戻る点に注意）。

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_profiles_protect_update ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_protect_insert ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profiles_privileged_columns();
COMMIT;
```

戻したあとは 3-1 で 0 行になることを確かめる。

---

## 5. ローカルでの検証結果（PostgreSQL 16）

Supabase をまねた最小構成（`anon` / `authenticated` / `service_role` ロール、`auth.users`、`auth.uid()`）に
`001_rls_profiles.sql` と本マイグレーションを適用して確認した。

| # | 内容 | 修正前 | 修正後 |
|---|---|---|---|
| T1 | 一般ユーザーが自分の plan を full に | 通ってしまう | **拒否** |
| T2 | 一般ユーザーが自分の is_admin を true に | 通ってしまう | **拒否** |
| T3 | 施設名と plan を同時に変更 | 通ってしまう | **まとめて拒否**（施設名も変わらない） |
| T4 | 一般ユーザーが自分の施設名だけ変更 | 通る | 通る |
| T5 | 同じ値で plan / is_admin を上書き（変化なし） | 通る | 通る |
| T6 | 一般ユーザーが他人の plan を変更 | RLS で 0 行 | RLS で 0 行 |
| T7 | 運営者が他施設の plan を full に（AdminPanel と同じ） | 通る | 通る |
| T8 | service_role で plan を変更 | 通る | 通る |
| T9 | 一般ユーザーが plan を下げる（standard→free） | 通る | **拒否**（変更そのものが運営者のみ） |
| T10 | profiles 行が無いユーザーが full / admin を指定して自分で INSERT | full / true で入る | **free / false に強制** |
| T11 | upsert（INSERT … ON CONFLICT DO UPDATE）で昇格 | 通ってしまう | **拒否** |
| T12 | 新規登録（auth.users に INSERT）で profiles 自動作成 | free / false で作成 | free / false で作成 |
| — | SQL Editor（postgres）から is_admin を付ける | 通る | 通る |
| — | マイグレーションを 2 回実行 | — | エラーなし |
| — | 4 の「元に戻す SQL」 | — | トリガー 0 件・再び昇格できる状態に戻る |
| — | 3-4 の確認 SQL | ①NG ②NG ③OK ④OK ⑤OK | ①OK ②OK ③OK ④OK ⑤OK・データ変化なし |

## 6. この修正の範囲外（別対応）

- `is_admin()` に `SET search_path` が付いていない（SECURITY DEFINER 関数の一般的な注意点）。今回は触っていない。
- プランの上限（部署数・職員数・学習機能）はブラウザ側でしか確認していない。サーバー側の制限は別途。
- `shift_data` の `facilityConfig`、`staff_kibo`、`shared_shifts` が誰でも読めたり書けたりする件は別途。
