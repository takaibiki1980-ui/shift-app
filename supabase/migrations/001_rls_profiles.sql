-- ============================================================
--  しふぽん マルチテナント対応
--  Supabase Dashboard の SQL Editor でこのファイルを実行してください
-- ============================================================

-- ① shift_data テーブルに RLS を有効化
ALTER TABLE shift_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_shift_data" ON shift_data;
CREATE POLICY "users_own_shift_data" ON shift_data
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ② profiles テーブル（施設情報・プラン管理）
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_name TEXT        NOT NULL DEFAULT '',
  plan          TEXT        NOT NULL DEFAULT 'free'
                            CHECK (plan IN ('free', 'standard', 'full')),
  is_admin      BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ③ 管理者チェック関数（SECURITY DEFINER で RLS 再帰を回避）
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ④ profiles の RLS ポリシー
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE
  USING  (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ⑤ 新規ユーザー登録時に profile を自動作成するトリガー
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, facility_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'facility_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ⑥ 既存ユーザーへの profile 付与（初回実行時のみ有効）
INSERT INTO profiles (id, facility_name)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;
