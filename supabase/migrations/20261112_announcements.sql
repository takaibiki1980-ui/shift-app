-- ================================================================
-- N-1: アプリ内お知らせ欄（DB側）。適用用 SQL。
--
-- ねらい（決定済み仕様）:
--   ・リーダー（authenticated）は「公開中」のお知らせだけ読める。
--   ・運営者（profiles.is_admin = true）だけが作成・更新できる（RPC 内で is_admin() を必ず確認）。
--   ・既読はユーザーごとに DB に保存（端末間で引き継ぐ）。
--   ・削除はしない。公開をやめるときは published=false（下書き）に戻す。
--
-- 既存の is_admin()（001_rls_profiles.sql、SECURITY DEFINER・profiles.is_admin を auth.uid() で読む）を再利用。
-- 新しい表・関数だけを追加し、既存の表・関数・ポリシーは一切変更しない。
-- 冪等（IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS）。全体を1トランザクションで。
-- 本番適用は手動（docs/ANNOUNCEMENTS_SCHEMA.md の手順）。このPRでは適用しない。
-- ================================================================

BEGIN;

-- gen_random_uuid 用（既に入っていれば何もしない）。
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── ① announcements 表 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('info','maintenance','important','incident')),
  publish_at  timestamptz,
  expire_at   timestamptz,
  pinned      boolean NOT NULL DEFAULT false,
  published   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS announcements_pub_idx ON announcements(published, publish_at);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- authenticated は「公開中」の行だけ SELECT。INSERT/UPDATE/DELETE のポリシーは作らない＝直書き不可。
DROP POLICY IF EXISTS announcements_select_public ON announcements;
CREATE POLICY announcements_select_public ON announcements
  FOR SELECT TO authenticated
  USING (published = true AND publish_at <= now() AND (expire_at IS NULL OR expire_at > now()));

GRANT SELECT ON TABLE announcements TO authenticated; -- select_public ポリシー下でのみ有効
REVOKE ALL ON TABLE announcements FROM anon;          -- anon は何もできない

-- ── ② announcement_reads 表（既読）──────────────────────────────
CREATE TABLE IF NOT EXISTS announcement_reads (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

-- 自分の行だけ SELECT / INSERT できる。UPDATE/DELETE のポリシーは作らない＝不可。
DROP POLICY IF EXISTS announcement_reads_select_own ON announcement_reads;
CREATE POLICY announcement_reads_select_own ON announcement_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS announcement_reads_insert_own ON announcement_reads;
CREATE POLICY announcement_reads_insert_own ON announcement_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON TABLE announcement_reads TO authenticated; -- ポリシー下でのみ有効
REVOKE ALL ON TABLE announcement_reads FROM anon;

-- ── ③ RPC（SECURITY DEFINER / search_path=public）──────────────

-- 作成・更新（運営者のみ）。p_id が NULL なら作成、あれば更新。入力検証つき。
CREATE OR REPLACE FUNCTION public.admin_upsert_announcement(
  p_id uuid, p_title text, p_body text, p_severity text,
  p_publish_at timestamptz, p_expire_at timestamptz, p_pinned boolean, p_published boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_title text := btrim(COALESCE(p_title, ''));
  v_body  text := btrim(COALESCE(p_body, ''));
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '権限がありません' USING ERRCODE = '42501';
  END IF;
  IF v_title = '' OR length(v_title) > 80 THEN
    RAISE EXCEPTION 'タイトルは1〜80字です' USING ERRCODE = '22023';
  END IF;
  IF v_body = '' OR length(v_body) > 2000 THEN
    RAISE EXCEPTION '本文は1〜2000字です' USING ERRCODE = '22023';
  END IF;
  IF p_severity IS NULL OR p_severity NOT IN ('info','maintenance','important','incident') THEN
    RAISE EXCEPTION '種類が不正です' USING ERRCODE = '22023';
  END IF;
  IF p_publish_at IS NOT NULL AND p_expire_at IS NOT NULL AND p_expire_at <= p_publish_at THEN
    RAISE EXCEPTION '公開終了は公開開始より後にしてください' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO announcements (title, body, severity, publish_at, expire_at, pinned, published, created_by)
    VALUES (v_title, v_body, p_severity, p_publish_at, p_expire_at, COALESCE(p_pinned,false), COALESCE(p_published,false), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE announcements
    SET title = v_title, body = v_body, severity = p_severity,
        publish_at = p_publish_at, expire_at = p_expire_at,
        pinned = COALESCE(p_pinned,false), published = COALESCE(p_published,false),
        updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION '対象が見つかりません' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

-- 一覧（運営者のみ）。下書き・期限切れも含めて全部返す。
CREATE OR REPLACE FUNCTION public.admin_list_announcements()
RETURNS SETOF announcements
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '権限がありません' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM announcements ORDER BY pinned DESC, publish_at DESC NULLS LAST, created_at DESC;
END;
$$;

-- ── EXECUTE 権限（運営者判定は関数内。anon には default privileges 対策で明示 REVOKE）──
REVOKE ALL ON FUNCTION public.admin_upsert_announcement(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_announcement(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_announcements() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_announcements() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_announcement(uuid, text, text, text, timestamptz, timestamptz, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_announcements() TO authenticated;

COMMIT;

-- ※既存の表・関数・ポリシー（profiles / portal_links / shared_shifts / shift_data 等）には一切変更しない。
