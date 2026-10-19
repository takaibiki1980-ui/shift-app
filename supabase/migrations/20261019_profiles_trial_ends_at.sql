-- ================================================================
-- profiles に試用の終わり trial_ends_at を足し、一般利用者が書き換えられないようにする
--
-- 本番の実態（2026-10-20 にユーザーが SQL Editor で確認）に合わせた版:
--   ・本番には handle_new_user が無く、auth.users のトリガーも0件（repo 001 の自動作成は本番で未使用）。
--     → この migration では handle_new_user を作らない／触らない。
--   ・profiles の行を作る経路で protect トリガーの INSERT 分岐が動くとき、trial_ends_at を
--     「今＋2か月」に固定する（created_at に依存しない）。
--   ・protect_profiles_privileged_columns の本番実物は repo の #260 と同一（SECURITY INVOKER・
--     search_path=public・判定も同じ）。本 migration はその関数に trial_ends_at の保護だけ足す。
--
-- 方針:
--   ・列は DEFAULT なしで足す（ADD COLUMN で既存行へ値が入らない＝既存は NULL のまま＝試用なし）。
--   ・一般利用者（is_admin()=false の anon/authenticated）:
--       - INSERT: plan='free'・is_admin=false・trial_ends_at=now()+2か月 に固定（持ち込みは無視）。
--       - UPDATE: trial_ends_at は黙って元の値へ固定（plan/is_admin は従来どおり EXCEPTION）。
--   ・運営者（is_admin）・管理画面(postgres)・service_role・SECURITY DEFINER の関数内は素通り
--     ＝試用の延長・付与ができる。判定は既存 protect と同一（current_user と is_admin()）。
--
-- 冪等（add column if not exists / create or replace / drop trigger if exists）。何度でも可。
-- 保護が途切れる隙間をなくすため、全体を1つのトランザクションで実行する。
-- 手順書・確認用SQL・元に戻すSQL: docs/PROFILES_TRIAL_ENDS_AT.md
-- ================================================================

BEGIN;

-- ① 列を足す（DEFAULT なし・NULL可）。既存の行は NULL のまま（＝試用なし）。
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ② protect トリガーに trial_ends_at の保護を追加（plan/is_admin の保護は #260 のまま）。
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

  -- 運営者は今までどおり（AdminPanel から plan/試用などを変えられる）
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.plan          := 'free';
    NEW.is_admin      := false;
    -- 試用の終わり＝今＋2か月に固定（利用者が持ち込んだ値は無視。created_at には依存しない）。
    NEW.trial_ends_at := now() + interval '2 months';
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'plan と is_admin は運営者しか変更できません'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;
  -- trial_ends_at は一般利用者には変えさせない（黙って元の値へ固定）。
  NEW.trial_ends_at := OLD.trial_ends_at;

  RETURN NEW;
END;
$$;

-- ③ トリガーを張り直す（冪等。関数差し替えだけでも効くが、名前の存在を担保するため再作成）。
DROP TRIGGER IF EXISTS trg_profiles_protect_update ON profiles;
CREATE TRIGGER trg_profiles_protect_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profiles_privileged_columns();

DROP TRIGGER IF EXISTS trg_profiles_protect_insert ON profiles;
CREATE TRIGGER trg_profiles_protect_insert
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profiles_privileged_columns();

COMMIT;

-- ※RLS ポリシー（profiles_select / profiles_update / profiles_insert）・is_admin() には一切変更しない。
--   handle_new_user / on_auth_user_created には触れない（本番に無いため作らない）。
--   既存の行（trial_ends_at=NULL）も変えない。
