-- ================================================================
-- profiles に試用の終わり trial_ends_at を足し、一般利用者が書き換えられないようにする
--
-- 背景・方針:
--   ・試用は登録から2か月。登録の日時＋2か月を trial_ends_at（timestamptz・NULL可）に入れる。
--   ・新規登録（handle_new_user）でだけ値が入る。既存の行は触らない＝NULL のまま（試用なし）。
--     → ADD COLUMN に DEFAULT を付けると既存行へも値が入ってしまうため、列は DEFAULT なしで足し、
--       新規行への付与は handle_new_user と protect トリガーで行う（既存行は NULL のまま）。
--   ・plan / is_admin と同じく、一般利用者は trial_ends_at を変えられない:
--       - UPDATE: 一般利用者の変更は黙って元の値へ固定（plan/is_admin は従来どおり EXCEPTION）。
--       - INSERT: 一般利用者が持ち込んだ値は無視し、登録の日時＋2か月へ固定。
--   ・運営者（is_admin）・管理画面(postgres)・service_role・SECURITY DEFINER の関数内は従来どおり素通り
--     ＝試用の延長・付与ができる。判定は既存 protect トリガーと同一（current_user と is_admin()）。
--
-- 注意（順番）: 列の既定値は BEFORE INSERT トリガーが動く時点で既に NEW に入っている。
--   そのため protect トリガーは NEW.created_at（既定 now()）を使って trial_ends_at を決められる。
--
-- 冪等（add column if not exists / create or replace）。何度実行しても同じ結果。
-- 手順書・確認用SQL・元に戻すSQL: docs/PROFILES_TRIAL_ENDS_AT.md
-- ================================================================

-- ① 列を足す（DEFAULT なし・NULL可）。既存の行は NULL のまま（＝試用なし）。
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ② 新規登録で試用の終わりを入れる（登録の日時＋2か月）。
--    handle_new_user は SECURITY DEFINER＝所有者権限で動くので protect トリガーに止められず、
--    ここで入れた値がそのまま残る。既存行には一切触れない。
--    （facility_name の扱いは従来どおり。trial_ends_at の1列だけ追加。）
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, facility_name, trial_ends_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'facility_name', NEW.email),
    now() + interval '2 months'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ③ protect トリガーに trial_ends_at の保護を追加（plan/is_admin の保護は従来どおり）。
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
    -- 試用の終わり＝登録の日時＋2か月に固定（利用者が持ち込んだ値は無視）。
    -- created_at の既定(now())は BEFORE INSERT の時点で NEW に入っている。
    NEW.trial_ends_at := NEW.created_at + interval '2 months';
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

-- ④ トリガーを張り直す（冪等。関数差し替えだけでも効くが、名前の存在を担保するため再作成）。
DROP TRIGGER IF EXISTS trg_profiles_protect_update ON profiles;
CREATE TRIGGER trg_profiles_protect_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profiles_privileged_columns();

DROP TRIGGER IF EXISTS trg_profiles_protect_insert ON profiles;
CREATE TRIGGER trg_profiles_protect_insert
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profiles_privileged_columns();

-- ※RLS ポリシー（profiles_select / profiles_update / profiles_insert）・is_admin()・
--   on_auth_user_created には一切変更を加えない。既存の行（trial_ends_at=NULL）も変えない。
