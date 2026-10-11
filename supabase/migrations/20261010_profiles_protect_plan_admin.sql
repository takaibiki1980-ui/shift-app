-- ================================================================
-- profiles の plan / is_admin を利用者が自分で書き換えられないようにする
-- 背景: profiles_update / profiles_insert の RLS は「自分の行なら可」だけで、
--       列の制限がない。そのため一般利用者がブラウザから自分の plan を 'full' に、
--       is_admin を true に書き換えられた（自己昇格）。
-- 方針: RLS ポリシーはそのまま残し、BEFORE トリガーで列の変更を見張る。
--   ・UPDATE: plan か is_admin が変わる更新は、運営者（is_admin() = true）だけ許す。
--             施設名など、ほかの欄の自分での更新は今までどおり許す。
--   ・INSERT: 運営者以外が行を作るときは plan='free'・is_admin=false に強制する。
--   ・アプリ経由（PostgREST）の利用者ロール anon / authenticated だけが対象。
--     Supabase 管理画面の SQL Editor（postgres）や service_role からの変更は素通り。
--     新規登録時の handle_new_user()（SECURITY DEFINER＝所有者権限で動く）も素通りだが、
--     もともと plan / is_admin を指定しないので既定値（free / false）になる。
-- is_admin() について: SECURITY DEFINER で profiles を SELECT するだけ。
--   SELECT はトリガーを起こさないので無限ループにならない。所有者権限で RLS を通らずに
--   読むので、トリガーの中から呼んでも権限の問題は起きない。
--   読むのは更新前の値なので、自分の is_admin を true にする更新の中で true と判定されることはない。
-- 使い方: Supabase SQL Editor でこのファイルの内容をそのまま実行（何度実行しても同じ結果）。
-- 手順書・確認用SQL・元に戻すSQL: docs/PROFILES_PLAN_ADMIN_PROTECTION.md
-- ================================================================

CREATE OR REPLACE FUNCTION protect_profiles_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER          -- current_user で「誰が実行したか」を見るため、呼び出し元の権限で動かす
SET search_path = public
AS $$
BEGIN
  -- 管理画面（postgres）・service_role・SECURITY DEFINER の関数内などは対象外
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- 運営者は今までどおり（AdminPanel からほかの施設の plan を変えられる）
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.plan     := 'free';
    NEW.is_admin := false;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'plan と is_admin は運営者しか変更できません'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_update ON profiles;
CREATE TRIGGER trg_profiles_protect_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profiles_privileged_columns();

DROP TRIGGER IF EXISTS trg_profiles_protect_insert ON profiles;
CREATE TRIGGER trg_profiles_protect_insert
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profiles_privileged_columns();

-- ※RLS ポリシー（profiles_select / profiles_update / profiles_insert）・is_admin()・
--   handle_new_user()・on_auth_user_created には一切変更を加えない。
