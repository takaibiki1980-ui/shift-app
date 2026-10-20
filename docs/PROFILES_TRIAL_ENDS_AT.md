# profiles に試用の終わり trial_ends_at を足す — 手順書

対象マイグレーション: `supabase/migrations/20261019_profiles_trial_ends_at.sql`

## 何をするか

`profiles` に `trial_ends_at`（timestamptz・NULL可・DEFAULTなし）を足し、profiles の行が作られるときに
protect トリガーの INSERT 分岐で「今＋2か月」を入れる。一般の利用者は自分で書き換えられない（plan / is_admin と同じ考え方）。

| 操作 | 実行した人 | 結果 |
|---|---|---|
| INSERT（profiles の行が作られるとき） | 一般利用者（`is_admin()`=false の anon/authenticated） | `trial_ends_at` ＝ 今＋2か月（持ち込んだ値は無視。plan/is_admin も free/false に固定） |
| UPDATE で `trial_ends_at` を変える | 一般利用者 | **黙って元の値へ固定**（変わらない） |
| UPDATE で `trial_ends_at` を変える | 運営者（`is_admin()`=true）・管理画面(postgres)・service_role | 通る（試用の延長・付与ができる） |
| UPDATE で `plan`/`is_admin` を変える | 一般利用者 | **従来どおりエラー**（SQLSTATE 42501） |

- 既存の行（今ある2件）は**触らない＝ `trial_ends_at` は NULL のまま**（試用なし扱い）。列は DEFAULT なしで足す。
- アプリのコード（App.jsx 等）・core.js・PR-1 の `planV2.js` は変えない。

### 本番の実態に合わせた点（重要）
- 本番には `handle_new_user` が無く、`auth.users` のトリガーも0件（repo 001 の自動作成は本番で使われていない）。
  → この migration では **handle_new_user を作らない／触らない**。試用の付与は protect トリガーの INSERT 分岐だけで行う。
- `protect_profiles_privileged_columns` の本番実物は repo の #260 と同一。そこに trial_ends_at の保護を足すだけ。
- **profiles の行を今どの経路が作っているかは未確定**（アプリは profiles に INSERT しない＝select と AdminPanel の plan 更新のみ）。
  INSERT 分岐が動くのは「将来アプリ等が profiles に INSERT する経路ができたとき」。この migration はその時に備えた DB 側の保護。

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

-- a-2b. auth.users のトリガーが0件であること（本番に自動作成トリガーが無いことの記録）
SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal ORDER BY tgname;
-- 期待: 0行

-- a-3. protect 関数の実物（戻す SQL の素になる。テキストで保存する）
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE proname='protect_profiles_privileged_columns' AND pronamespace='public'::regnamespace;

-- a-4. profiles のポリシー（このPRでは変えない。変化しないことの控え）
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;
```
**期待**：`trial_ends_at` は無い。protect トリガー2本が `tgenabled='O'`。auth.users のトリガーは0行。protect 関数の実物が取れる。

### b. 控え（保存）
- a-3 の protect 関数定義を**テキストで保存**（戻すときの素。万一 repo とずれていたら、こちらを正にする）。
- `profiles` を Table Editor → Export as CSV で保存（適用前の全行の控え）。

### c. 本体の SQL（＝ migration 全文）
`supabase/migrations/20261019_profiles_trial_ends_at.sql` の全文を貼って実行。冪等（何度でも可）。全体が `BEGIN; … COMMIT;` で1トランザクション。
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

- (イ) INSERT の確認（利用者が持ち込んでも plan=free・is_admin=false・trial_ends_at=今＋2か月 に固定）は、
  **本番では profiles に行を増やせない（profiles.id は auth.users への外部キー）ため実施しない＝ローカル検証のみ**。

### f. アプリで動作確認（本番の実態に合わせて）
- 既存アカウントでログイン → 表示・保存ができること（`trial_ends_at` 追加でアプリが壊れないこと。読みは `select('*')`）。
- 新規登録の確認は **本番に実アカウントを1つ作る操作**になるので任意（やるかはユーザー判断）。やる場合:
  1. 使い捨ての受信できるアドレスで新規登録する（実在の他人のアドレスは使わない）。
  2. ログインできること・プラン表示が「無料プラン」であることを見る（配線は PR-3 なので残り日数はまだ出ない）。
  3. 確認後にそのアカウントを消す: Supabase ダッシュボード → Authentication → Users → 対象ユーザーを Delete。
     `profiles.id` は `auth.users(id)` への外部キーで `ON DELETE CASCADE` のため、ユーザー削除で profiles 行も消えるはず。
     `SELECT count(*) FROM profiles WHERE id='<消したユーザーのid>';` が 0 になることを確認する。

### g. 元に戻す SQL（先に用意）
protect 関数を #260 の定義（＝本番の実物と同一）へ戻してから列を落とす。handle_new_user には触れない。
```sql
BEGIN;

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

-- トリガーを張り直す（関数が差し替わったので念のため）
DROP TRIGGER IF EXISTS trg_profiles_protect_update ON profiles;
CREATE TRIGGER trg_profiles_protect_update BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profiles_privileged_columns();
DROP TRIGGER IF EXISTS trg_profiles_protect_insert ON profiles;
CREATE TRIGGER trg_profiles_protect_insert BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profiles_privileged_columns();

-- 列を落とす（関数を戻した後に）
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trial_ends_at;

COMMIT;
```
戻したあと：d-1 が 0 行（列が消えた）になることを確かめる。

---

## ローカルでの検証結果（PostgreSQL 16）

本番の実態に合わせた基準状態（profiles 6列・001 の RLS・#260 の protect トリガー・**handle_new_user なし／auth.users トリガーなし**・既存2行 free/full）を作り、本体 SQL を当てて確認。

| # | 内容 | 結果 |
|---|---|---|
| 1 | ADD COLUMN 後、既存2行の `trial_ends_at` | **NULL のまま** |
| 2 | (イ) 一般利用者が INSERT で trial=10年後・created_at=10年後・plan=full・is_admin=true を持ち込む | **plan=free／is_admin=false／trial=今＋2か月（約61日後）に固定** |
| 3 | (ア) 一般利用者が自分の `trial_ends_at` を UPDATE | **変わらない**（黙って元の値へ固定） |
| 4 | (ア') upsert（INSERT … ON CONFLICT DO UPDATE）で自分の trial を変える | **変わらない**（UPDATE 経路でも固定） |
| 5 | (エ) 一般利用者が `plan` を UPDATE | **従来どおり EXCEPTION（42501）** |
| 6 | (ウ) 運営者が他人の `trial_ends_at` を UPDATE | **変えられる** |
| 7 | 本体 SQL を2回当てる（冪等） | エラーなし |
| 8 | 元に戻す SQL | protect が #260 に戻り、列が消える |

---

## この手順の範囲外（別対応）
- 本番への適用そのもの（このPRのマージ後に、上の a〜g をユーザーが行う）。
- profiles の行を作る経路（アプリでの初回 INSERT 等）＝ PR-3。現状アプリは profiles に INSERT しない。
- 画面・生成への配線（残り日数の表示、無料への切替）＝PR-3、フラグ ON＝PR-4。
- 同じ人が別のメールアドレスで登録し直すと試用がまた始まる件は、今回は扱わない（未確認事項）。
