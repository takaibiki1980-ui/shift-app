-- ================================================================
-- N-1: アプリ内お知らせ欄（DB側）。元に戻す SQL（revert）。
-- 20261112_announcements.sql の逆操作。追加したものだけを落とす（既存には触れない）。
-- 全体を1トランザクションで。適用の逆順（関数→ポリシー→表）で削除する。
-- ================================================================

BEGIN;

-- ③ RPC を削除（is_admin() は既存のため残す）。
DROP FUNCTION IF EXISTS public.admin_upsert_announcement(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean);
DROP FUNCTION IF EXISTS public.admin_list_announcements();

-- ② announcement_reads のポリシーと表を削除。
DROP POLICY IF EXISTS announcement_reads_select_own ON announcement_reads;
DROP POLICY IF EXISTS announcement_reads_insert_own ON announcement_reads;
DROP TABLE IF EXISTS announcement_reads;

-- ① announcements のポリシー・索引・表を削除。
DROP POLICY IF EXISTS announcements_select_public ON announcements;
DROP INDEX IF EXISTS announcements_pub_idx;
DROP TABLE IF EXISTS announcements;

COMMIT;

-- ※ pgcrypto 拡張・is_admin()・その他の既存オブジェクトは、他でも使うため削除しない。
