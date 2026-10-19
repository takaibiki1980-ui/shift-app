# profiles に試用の終わり trial_ends_at を足す — 手順書

対象マイグレーション: `supabase/migrations/20261019_profiles_trial_ends_at.sql`

## 何をするか

`profiles` に `trial_ends_at`（timestamptz・NULL可）を足し、**新規登録の人にだけ**「登録の日時＋2か月」を入れる。
一般の利用者は自分で書き換えられない（plan / is_admin と同じ考え方）。

| 操作 | 実行した人 | 結果 |
|---|---|---|
| 新規登録（`handle_new_user` 経由） | — | `trial_ends_at` ＝ 登録の日時＋2か月 |
| UPDATE で `trial_ends_at` を変える | 一般利用者（`is_admin()`=false の anon/authenticated） | **黙って元の値へ固定**（変わらない） |
| INSERT で `trial_ends_at` を持ち込む | 一般利用者 | **登録の日時＋2か月に固定**（持ち込んだ値は無視。plan/is_admin も従来どおり free/false に固定） |
| UPDATE で `trial_ends_at` を変える | 運営者（`is_admin()`=true）・管理画面(postgres)・service_role | 通る（試用の延長・付与ができる） |
| UPDATE で `plan`/`is_admin` を変える | 一般利用者 | **従来どおりエラー**（SQLSTATE 42501） |

- 既存の行（今ある2件）は**触らない＝ `trial_ends_at` は NULL のまま**（試用なし扱い）。
  列は DEFAULT なしで足すので、ADD COLUMN では既存行に値が入らない。
- アプリのコード（App.jsx 等）・core.js・PR-1 の `planV2.js` は変えない。

### 初期値の入れ方（なぜ handle_new_user か）
「列の DEFAULT で `now()+2か月`」にすると、**ADD COLUMN の時点で既存の2行にも値が入ってしまう**（既存は NULL のままにしたい）。
そこで列は DEFAULT なしで足し、新規行への付与は
`handle_new_user`（通常の新規登録の唯一の経路。SECURITY DEFINER なので protect トリガーに止められない）と、
念のため protect トリガーの INSERT 分岐（利用者の直 INSERT で持ち込みを防ぐ）で行う。
戻すのは関数を元の定義に差し替えて列を落とすだけ＝影響が小さく戻しやすい。

---

## 本番に当てる順番（a〜g）

> 各 SQL は、貼る前に **Ctrl＋A で前の文字をすべて消してから**貼ること。
> SQL Editor で「Potential issue detected」が出たら、貼った全文が本体で、前の SQL が混ざっていないことを確かめてから Run query を押す。

### a. 洗い出し（SELECT のみ・本番は変わらない）
repo の migration と本番の実物がずれていないかを見る。
```sql
-- a-1. profiles の列と制約（trial_ends_at がまだ無いこと／CHECK を含む）
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid='public.profiles'::regclass ORDER BY conname;

-- a-2. profiles のトリガー一覧（trg_profiles_protect_insert / _update があり、tgenabled='O'）
SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal ORDER BY tgname;

-- a-3. 関数の実物（戻す SQL の素になる。テキストで保存する）
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE proname='protect_profiles_privileged_columns' AND pronamespace='public'::regnamespace;
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE proname='handle_new_user' AND pronamespace='public'::regnamespace;

-- a-4. profiles のポリシー（このPRでは変えない。変化しないことの控え）
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;
```
**期待**：`trial_ends_at` は無い。protect トリガー2本が `tgenabled='O'`。関数の実物が取れる。

### b. 控え（保存）
- a-3 の2つの関数定義を**テキストで保存**（戻すときの素。万一 repo とずれていたら、こちらを正にする）。
- `profiles` を Table Editor → Export as CSV で保存（適用前の全行の控え）。

### c. 本体の SQL（＝ migration 全文）
`supabase/migrations/20261019_profiles_trial_ends_at.sql` の全文を貼って実行。冪等（何度でも可）。
**期待**：エラーなし（2回目以降は「column already exists, skipping」の NOTICE が出るだけ）。

### d. 確認（SELECT のみ）
```sql
-- d-1. 列があること
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='trial_ends_at';
-- 期待: 1行・timestamptz・YES(NULL可)・default なし

-- d-2. トリガーが2本・有効
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal ORDER BY tgname;
-- 期待: trg_profiles_protect_insert='O' / trg_profiles_protect_update='O'

-- d-3. 既存の行は trial_ends_at が NULL のまま（値が入っていないこと）
SELECT count(*) AS not_null_rows FROM public.profiles WHERE trial_ends_at IS NOT NULL;
-- 期待: 0（＝既存行は NULL のまま）
```

### e. 動作確認（本番を変えない・結果はエラーメッセージに出る）
一般利用者・運営者になりきって試し、最後にわざとエラーで終えて全部取り消す。
（`profiles` に一般利用者と運営者が1人ずつ以上いることが前提。SQL Editor では `auth.uid()` が NULL になるので claim を明示する。）
```sql
DO $$
DECLARE
  u uuid; a uuid; before_t timestamptz; after_t timestamptz; r text := '';
  ok boolean;
BEGIN
  SELECT id INTO u FROM public.profiles WHERE is_admin=false ORDER BY created_at LIMIT 1;
  SELECT id INTO a FROM public.profiles WHERE is_admin=true  ORDER BY created_at LIMIT 1;
  IF u IS NULL OR a IS NULL THEN RAISE EXCEPTION '一般利用者と運営者が1人ずつ必要です'; END IF;

  -- 一般利用者になりきる
  PERFORM set_config('role','authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);

  -- (ア) 一般利用者が自分の trial_ends_at を変える → 変わらない
  SELECT trial_ends_at INTO before_t FROM public.profiles WHERE id=u;
  UPDATE public.profiles SET trial_ends_at = now() + interval '10 years' WHERE id=u;
  SELECT trial_ends_at INTO after_t FROM public.profiles WHERE id=u;
  r := r || ' (ア)' || CASE WHEN after_t IS NOT DISTINCT FROM before_t THEN 'OK' ELSE 'NG' END;

  -- (エ) plan/is_admin の保護は従来どおり（エラー）
  BEGIN
    UPDATE public.profiles SET plan = CASE WHEN plan='full' THEN 'free' ELSE 'full' END WHERE id=u; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  r := r || ' (エ)' || CASE WHEN ok THEN 'OK' ELSE 'NG' END;

  -- (ウ) 運営者になりきって他人の trial_ends_at を変える → 変わる
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  UPDATE public.profiles SET trial_ends_at = now() + interval '30 days' WHERE id=u;
  SELECT trial_ends_at INTO after_t FROM public.profiles WHERE id=u;
  r := r || ' (ウ)' || CASE WHEN after_t IS DISTINCT FROM before_t THEN 'OK' ELSE 'NG' END;
  PERFORM set_config('role','none', true);

  RAISE EXCEPTION '【確認結果・変更はすべて取り消し済み】%', r;
END $$;
```
**期待**：`ERROR: 【確認結果・変更はすべて取り消し済み】 (ア)OK (エ)OK (ウ)OK`
（INSERT の (イ)＝利用者が持ち込んでも登録＋2か月に固定、は本番の行を増やさないため省略。ローカル検証済み。試したい場合は BEGIN; … ROLLBACK; の中で、自分の id と同じ `request.jwt.claim.sub` を立てて `INSERT INTO profiles(id, facility_name, trial_ends_at) VALUES(自分のid,'x', now()+'10 years')` し、`trial_ends_at` が約61日後になることを見てから ROLLBACK する。）

### f. アプリで動作確認
- 既存アカウントでログイン → 表示・保存ができること（`trial_ends_at` 追加でアプリが壊れないこと。読みは `select('*')`）。
- 新しいメールアドレスで新規登録 → ログインでき、プラン表示が「無料プラン」であること（配線は PR-3 なので、画面に試用の残り日数はまだ出ない）。

### g. 元に戻す SQL（先に用意）
関数を元の定義に戻してから列を落とす（関数が列を参照するため順番が大事）。
`handle_new_user` / `protect_...` の元定義は a-3 で保存したものを正とする。下は repo の #260/001 の定義に基づく復元。
```sql
BEGIN;

-- handle_new_user を trial_ends_at 追加前へ
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, facility_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'facility_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

-- protect 関数を trial_ends_at 追加前（#260）へ
CREATE OR REPLACE FUNCTION protect_profiles_privileged_columns() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  IF is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.plan := 'free'; NEW.is_admin := false; RETURN NEW; END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'plan と is_admin は運営者しか変更できません' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;

-- 列を落とす（関数を戻した後に）
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trial_ends_at;

COMMIT;
```
戻したあと：d-1 が 0 行（列が消えた）になることを確かめる。

---

## ローカルでの検証結果（PostgreSQL 16）

本番と同じ状態（profiles 6列・001 の関数/RLS・#260 の protect トリガー・既存2行 free/full）を作り、本体 SQL を当てて確認。

| # | 内容 | 結果 |
|---|---|---|
| 1 | ADD COLUMN 後、既存2行の `trial_ends_at` | **NULL のまま** |
| 2 | 新規登録（handle_new_user 経由） | `trial_ends_at` ＝ 登録＋2か月（約61日後） |
| 3 | (ア) 一般利用者が自分の `trial_ends_at` を UPDATE | **変わらない**（黙って元の値へ固定） |
| 4 | (イ) 一般利用者が INSERT で `trial_ends_at`・plan=full・is_admin=true を持ち込む | **登録＋2か月／free／false に固定** |
| 5 | (ウ) 運営者が他人の `trial_ends_at` を UPDATE | **変えられる**（約30日後に） |
| 6 | (エ) 一般利用者が `plan` を UPDATE | **従来どおり EXCEPTION（42501）** |
| 7 | 本体 SQL を2回当てる（冪等） | エラーなし（NOTICE: already exists） |
| 8 | 元に戻す SQL | 列が消え、新規登録で `trial_ends_at` が入らない元の挙動に戻る |

---

## この手順の範囲外（別対応）
- 本番への適用そのもの（このPRのマージ後に、上の a〜g をユーザーが行う）。
- 画面・生成への配線（残り日数の表示、無料への切替）＝PR-3、フラグ ON＝PR-4。
- 同じ人が別のメールアドレスで登録し直すと試用がまた始まる件は、今回は扱わない（未確認事項）。
