-- ============================================================
--  facilityConfig を anon から読み取り可能にする
--  （SECURITY DEFINER + GRANT EXECUTE だけでは Supabase の RLS を
--    bypass できない場合があるため、専用ポリシーを追加する）
--  Supabase Dashboard の SQL Editor でこのファイルを実行してください
-- ============================================================

-- ① shift_data の facilityConfig 行だけ誰でも読めるようにする
--    （staff 名・部署名のみで個人情報ではないため公開可）
DROP POLICY IF EXISTS "public_read_facilityConfig" ON shift_data;
CREATE POLICY "public_read_facilityConfig" ON shift_data
  FOR SELECT
  USING (data_key = 'facilityConfig');

-- ② anon ロールに shift_data の SELECT 権限を付与
GRANT SELECT ON shift_data TO anon;
