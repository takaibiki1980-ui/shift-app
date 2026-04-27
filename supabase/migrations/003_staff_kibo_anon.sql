-- ============================================================
--  staff_kibo テーブル: 匿名アクセス（スタッフポータル）対応
--  Supabase Dashboard の SQL Editor でこのファイルを実行してください
-- ============================================================

-- ① staff_kibo テーブルを作成（既存の場合はスキップ）
CREATE TABLE IF NOT EXISTS staff_kibo (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID        NOT NULL,
  dept_id        TEXT        NOT NULL,
  staff_id       TEXT        NOT NULL,
  month_key      TEXT        NOT NULL,
  days           INT[]       NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, dept_id, staff_id, month_key)
);

-- ② RLS を有効化
ALTER TABLE staff_kibo ENABLE ROW LEVEL SECURITY;

-- ③ 既存ポリシーを削除してリセット
DROP POLICY IF EXISTS "staff_kibo_select" ON staff_kibo;
DROP POLICY IF EXISTS "staff_kibo_insert" ON staff_kibo;
DROP POLICY IF EXISTS "staff_kibo_update" ON staff_kibo;
DROP POLICY IF EXISTS "staff_kibo_upsert" ON staff_kibo;
DROP POLICY IF EXISTS "staff_kibo_all" ON staff_kibo;

-- ④ 匿名（anon）・ログイン済み両方から読み取りを許可
--    （同じ部署の他スタッフの希望休件数を表示するため）
CREATE POLICY "staff_kibo_select" ON staff_kibo
  FOR SELECT
  USING (true);

-- ⑤ 匿名・ログイン済み両方から書き込みを許可
--    （スタッフはログイン不要でURLから希望休を送信できる）
CREATE POLICY "staff_kibo_insert" ON staff_kibo
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "staff_kibo_update" ON staff_kibo
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ⑥ anon ロールにテーブルアクセス権限を付与
GRANT SELECT, INSERT, UPDATE ON staff_kibo TO anon;
GRANT SELECT, INSERT, UPDATE ON staff_kibo TO authenticated;

-- ⑦ 管理者（ログイン済み）は自分の admin_user_id のデータのみ削除可
CREATE POLICY "staff_kibo_delete" ON staff_kibo
  FOR DELETE
  USING (auth.uid() = admin_user_id);
