-- ================================================================
-- Phase C: 表の anon 公開を外す（職員ポータル/共有は Phase A の窓口関数経由に統一）
--
-- 【前提・超重要】本番(Production)のアプリが既に窓口経由（VITE_PORTAL_RPC_ENABLED=true・Phase B）
--   で動いていること。窓口に切り替える前にこの SQL を適用すると、ログインなしの職員ポータル／
--   共有画面が表を直接読めなくなって止まる。必ず Production を RPC 経路にしてから実行する。
--
-- 何をするか:
--   ・shift_data: 全施設の facilityConfig を anon に見せる public_read_facilityConfig を削除。
--   ・staff_kibo: anon 向けの「誰でも読める/書ける(true)」ポリシーを削除し、
--                 ログイン済みリーダーが「自分の施設の行(admin_user_id = auth.uid())」だけを
--                 読む/入れる/更新/削除できるポリシーに揃える。
--   ・shared_shifts: トークン無視で全件読める public read by token(true) を削除。
--                    発行(insert own)は残し、リーダーが自分の行を読む select を追加。
--   ・上記3表の anon への直接権限(GRANT)を剥がす。
--   ・窓口関数4本(get_portal_config/get_portal_kibo/submit_portal_kibo/get_shared_shift)は
--     SECURITY DEFINER=所有者権限で動くので、anon の表権限が無くても引き続き動く（EXECUTE は維持）。
--
-- リーダー側(ログイン済み)の現在の読み書きは止めない:
--   ・shift_data: users_own_shift_data(ALL, 自分) は温存。
--   ・staff_kibo: 読込(select own)・右クリック付与/解除(upsert=insert+update own)・
--     Realtime購読(select own で RLS 通過) が動く。
--   ・shared_shifts: 発行(insert own)・自分の行の参照(select own) が動く。
--
-- 冪等（DROP IF EXISTS / CREATE OR REPLACE 相当）。確認・切り戻し: docs/PHASE_C_CLOSE_PUBLIC_RLS.md
-- ================================================================

-- ── shift_data: 全施設 facilityConfig の公開読みを外す ──────────────
DROP POLICY IF EXISTS "public_read_facilityConfig" ON shift_data;
-- users_own_shift_data（ALL・auth.uid()=user_id）はそのまま（リーダーの読み書き）。
REVOKE ALL ON TABLE shift_data FROM anon;

-- ── staff_kibo: anon 向け true ポリシーを削除し、リーダー自分行だけに ──
DROP POLICY IF EXISTS "staff_kibo_select" ON staff_kibo;   -- 旧: USING (true)
DROP POLICY IF EXISTS "staff_kibo_insert" ON staff_kibo;   -- 旧: WITH CHECK (true)
DROP POLICY IF EXISTS "staff_kibo_update" ON staff_kibo;   -- 旧: USING/CHECK (true)
-- ★本番にだけ存在した追加ポリシー（repo の migration には無い）。ALL・USING/CHECK=true・role public。
--   RLS は許可ポリシーの OR 合成で、public は authenticated も含むため、これが残ると anon の
--   GRANT を外しても「登録しただけの他施設ユーザー」が全施設の staff_kibo を読み書きできてしまう。必ず削除。
DROP POLICY IF EXISTS "public_read_write" ON staff_kibo;
-- （staff_kibo_delete は既に「自分の施設のみ(auth.uid()=admin_user_id)」なので残す）

DROP POLICY IF EXISTS "staff_kibo_select_own" ON staff_kibo;
CREATE POLICY "staff_kibo_select_own" ON staff_kibo
  FOR SELECT TO authenticated
  USING (auth.uid() = admin_user_id);

DROP POLICY IF EXISTS "staff_kibo_insert_own" ON staff_kibo;
CREATE POLICY "staff_kibo_insert_own" ON staff_kibo
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = admin_user_id);

DROP POLICY IF EXISTS "staff_kibo_update_own" ON staff_kibo;
CREATE POLICY "staff_kibo_update_own" ON staff_kibo
  FOR UPDATE TO authenticated
  USING (auth.uid() = admin_user_id)
  WITH CHECK (auth.uid() = admin_user_id);

REVOKE ALL ON TABLE staff_kibo FROM anon;

-- ── shared_shifts: トークン無視の全件公開を外す ────────────────────
DROP POLICY IF EXISTS "public read by token" ON shared_shifts;  -- 旧: USING (true)
-- 発行(insert own)は残す。リーダーが自分の発行分を参照できる select を追加。
DROP POLICY IF EXISTS "shared_shifts_select_own" ON shared_shifts;
CREATE POLICY "shared_shifts_select_own" ON shared_shifts
  FOR SELECT TO authenticated
  USING (auth.uid() = admin_user_id);

REVOKE ALL ON TABLE shared_shifts FROM anon;

-- ※窓口関数の EXECUTE（anon/authenticated）には触れない＝ポータル/共有は動き続ける。
-- ※authenticated への表 GRANT には触れない＝リーダーの既存動作は不変。
