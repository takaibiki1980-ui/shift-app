-- ================================================================
-- 職員ポータル／共有リンクの新方式（PR-B・DB側）
--
-- ねらい（決定済み仕様）:
--   ・URL に管理者 uuid を含めず、リンクごとに長いランダム token（24文字・portalToken.js と同形式）。
--   ・希望休リンクの期限 = リーダーが毎月設定する締切日の終わり(JST)。発行時に expires_at へ入れる
--     （締切は facilityConfig.depts[].deadline / .byMonth["YYYY-M"].deadline に "YYYY-MM-DD" で保存。
--      その「日の終わり(JST)」を画面側(deadlineExpiry)で算出し p_expires_at として渡す）。
--   ・共有シフトリンクの期限 = そのシフト月の月末(JST)の30日後（画面側 shareExpiry で算出して保存）。
--   ・リーダー本人はいつでも失効できる（revoked_at）。
--   ・不存在／期限切れ／失効は区別せず「見つからない／無効」と同じ応答（列挙・推測を防ぐ）。
--
-- 併用期間のため、旧 RPC（get_portal_config/get_portal_kibo/submit_portal_kibo・旧引数形）は残す。
-- get_shared_shift は同じシグネチャのまま expires_at/revoked_at 判定を追加（既存 share は expires_at=NULL
-- なので従来どおり見える）。旧経路の撤去は PR-F。
--
-- 冪等（IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS）。全体を1トランザクションで。
-- 本番適用は手動（docs/PORTAL_LINKS_SCHEMA.md の手順）。このPRでは適用しない。
-- ================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_bytes / gen_random_uuid 用

-- ── ① portal_links 新表 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dept_id       text NOT NULL,
  token         text NOT NULL UNIQUE,
  target_month  text,                       -- 'YYYY-M' / 'YYYY-MM'（対象シフト月）
  label         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,                -- NULL=無期限
  revoked_at    timestamptz                 -- NULL=有効
);
CREATE INDEX IF NOT EXISTS portal_links_token_idx ON portal_links(token);
CREATE INDEX IF NOT EXISTS portal_links_admin_idx ON portal_links(admin_user_id);

ALTER TABLE portal_links ENABLE ROW LEVEL SECURITY;

-- authenticated 本人は自分の行だけ SELECT（発行済み一覧 UI 用）。INSERT/UPDATE/DELETE の
-- ポリシーは作らない＝直書き不可。書き込みは下の SECURITY DEFINER RPC 経由のみ。
DROP POLICY IF EXISTS portal_links_select_own ON portal_links;
CREATE POLICY portal_links_select_own ON portal_links
  FOR SELECT TO authenticated
  USING (auth.uid() = admin_user_id);

GRANT SELECT ON TABLE portal_links TO authenticated;  -- select_own ポリシー下でのみ有効
REVOKE ALL ON TABLE portal_links FROM anon;           -- anon は表に触れない（RPC 経由のみ）

-- ── ② shared_shifts: 失効列を追加 ───────────────────────────────
ALTER TABLE shared_shifts ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- ── 内部: token 生成（24文字・54字集合・CSPRNG・棄却サンプリングでバイアス無し）──
-- portalToken.js の genPortalToken と同一アルゴリズム。DEFINER 内からのみ使う。
CREATE OR REPLACE FUNCTION public.gen_portal_token(p_len int DEFAULT 24)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; -- 54字
  m int := 54;
  maxv int := (256 / 54) * 54;  -- 216（216..255 は棄却してバイアス回避）
  out text := '';
  bytes bytea;
  b int;
  i int;
BEGIN
  WHILE length(out) < p_len LOOP
    bytes := gen_random_bytes(p_len);
    i := 0;
    WHILE i < length(bytes) AND length(out) < p_len LOOP
      b := get_byte(bytes, i);
      IF b < maxv THEN
        out := out || substr(alphabet, (b % m) + 1, 1);
      END IF;
      i := i + 1;
    END LOOP;
  END LOOP;
  RETURN out;
END;
$$;

-- ── ③ RPC（SECURITY DEFINER / SET search_path=public）─────────────

-- 施設設定（token 起点・admin uuid を引数に取らない）。role は返さない（get_portal_config を再利用）。
CREATE OR REPLACE FUNCTION public.get_portal_by_token(p_token text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT get_portal_config(l.admin_user_id, l.dept_id)
  FROM portal_links l
  WHERE l.token = p_token
    AND l.revoked_at IS NULL
    AND (l.expires_at IS NULL OR l.expires_at > now());
$$;

-- 希望休の読み取り（token 起点・氏名は返さない）。
CREATE OR REPLACE FUNCTION public.get_portal_kibo_by_token(p_token text, p_month text)
RETURNS TABLE (staff_id text, days int[], yukyu_days int[])
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT k.staff_id, k.days, k.yukyu_days
  FROM portal_links l
  JOIN staff_kibo k
    ON k.admin_user_id = l.admin_user_id AND k.dept_id = l.dept_id
  WHERE l.token = p_token
    AND l.revoked_at IS NULL
    AND (l.expires_at IS NULL OR l.expires_at > now())
    AND k.month_key = p_month;
$$;

-- 希望休の送信（token 起点）。期限・失効・職員実在を関数内で判定。
-- 失敗は全て同一メッセージ（不存在/期限切れ/失効/職員不在を区別しない）。
CREATE OR REPLACE FUNCTION public.submit_portal_kibo_by_token(
  p_token text, p_staff text, p_month text, p_days int[], p_yukyu int[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_dept  text;
  v_ok    boolean;
BEGIN
  -- 月フォーマットの最低限チェック（本格的な検証は PR-D）
  IF p_month IS NULL OR p_month !~ '^[0-9]{4}-[0-9]{1,2}$' THEN
    RAISE EXCEPTION 'リンクが無効です' USING ERRCODE = '42501';
  END IF;

  SELECT l.admin_user_id, l.dept_id INTO v_admin, v_dept
  FROM portal_links l
  WHERE l.token = p_token
    AND l.revoked_at IS NULL
    AND (l.expires_at IS NULL OR l.expires_at > now());

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'リンクが無効です' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM shift_data sd,
         jsonb_array_elements(COALESCE(sd.data_value->'staffList', '[]'::jsonb)) AS s
    WHERE sd.user_id = v_admin
      AND sd.data_key = 'facilityConfig'
      AND s->>'id' = p_staff
      AND s->>'dept' = v_dept
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'リンクが無効です' USING ERRCODE = '42501';
  END IF;

  INSERT INTO staff_kibo (admin_user_id, dept_id, staff_id, month_key, days, yukyu_days, updated_at)
  VALUES (v_admin, v_dept, p_staff, p_month, COALESCE(p_days, '{}'), COALESCE(p_yukyu, '{}'), now())
  ON CONFLICT (admin_user_id, dept_id, staff_id, month_key)
  DO UPDATE SET days = EXCLUDED.days, yukyu_days = EXCLUDED.yukyu_days, updated_at = now();
END;
$$;

-- 発行（authenticated 本人のみ）。token はサーバ生成。衝突時は再試行。id と token を返す。
CREATE OR REPLACE FUNCTION public.issue_portal_link(
  p_dept text, p_month text, p_expires_at timestamptz, p_label text
)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_token text;
  v_id    uuid;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '認証が必要です' USING ERRCODE = '42501';
  END IF;
  IF p_dept IS NULL OR length(p_dept) = 0 THEN
    RAISE EXCEPTION '部署が未指定です' USING ERRCODE = '22023';
  END IF;
  IF p_month IS NOT NULL AND p_month !~ '^[0-9]{4}-[0-9]{1,2}$' THEN
    RAISE EXCEPTION '月の形式が不正です' USING ERRCODE = '22023';
  END IF;

  LOOP
    v_token := gen_portal_token(24);
    BEGIN
      INSERT INTO portal_links (admin_user_id, dept_id, token, target_month, expires_at, label)
      VALUES (v_admin, p_dept, v_token, p_month, p_expires_at, p_label)
      RETURNING portal_links.id INTO v_id;
      id := v_id; token := v_token;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- token 衝突（極稀）→ 作り直し
    END;
  END LOOP;
END;
$$;

-- 失効（authenticated 本人のみ）。他人・不存在は 0 行更新（例外にせず存在を漏らさない）。
CREATE OR REPLACE FUNCTION public.revoke_portal_link(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '認証が必要です' USING ERRCODE = '42501';
  END IF;
  UPDATE portal_links
  SET revoked_at = now()
  WHERE id = p_id AND admin_user_id = v_admin AND revoked_at IS NULL;
END;
$$;

-- 共有シフトの失効（authenticated 本人のみ）。
CREATE OR REPLACE FUNCTION public.revoke_shared_shift(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION '認証が必要です' USING ERRCODE = '42501';
  END IF;
  UPDATE shared_shifts
  SET revoked_at = now()
  WHERE id = p_id AND admin_user_id = v_admin AND revoked_at IS NULL;
END;
$$;

-- get_shared_shift: 同シグネチャのまま、期限切れ・失効を「見つからない」と同じ応答にする。
CREATE OR REPLACE FUNCTION public.get_shared_shift(p_token text)
RETURNS TABLE (
  year int, month int, dept_ids text[],
  shift_data jsonb, staff_data jsonb, dept_data jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.year, s.month, s.dept_ids, s.shift_data, s.staff_data, s.dept_data
  FROM shared_shifts s
  WHERE s.token = p_token
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now());
$$;

-- ── EXECUTE 権限 ────────────────────────────────────────────────
-- 内部用 token 生成は誰にも付与しない（DEFINER 関数内＝所有者権限でのみ呼ばれる）。
REVOKE ALL ON FUNCTION public.gen_portal_token(int) FROM PUBLIC;

-- 職員（ログイン不要）が使う窓口 → anon/authenticated。
REVOKE ALL ON FUNCTION public.get_portal_by_token(text)                           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_kibo_by_token(text, text)                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_portal_kibo_by_token(text, text, text, int[], int[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_shift(text)                              FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_by_token(text)                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_kibo_by_token(text, text)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_portal_kibo_by_token(text, text, text, int[], int[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_shift(text)                              TO anon, authenticated;

-- 発行・失効はリーダー（ログイン済み）のみ。
REVOKE ALL ON FUNCTION public.issue_portal_link(text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_portal_link(uuid)                         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_shared_shift(uuid)                        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_portal_link(text, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_portal_link(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_shared_shift(uuid)                        TO authenticated;

COMMIT;

-- ※旧 RPC（get_portal_config / get_portal_kibo / submit_portal_kibo）・既存ポリシー・
--   staff_kibo / shift_data / profiles には一切変更しない（併用期間のため）。
