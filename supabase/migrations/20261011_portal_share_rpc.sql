-- ================================================================
-- 職員ポータル／共有リンク用の「窓口」関数（Phase A・追加のみ）
--
-- 目的: いまは shift_data(facilityConfig) / staff_kibo / shared_shifts が anon から
--   全件読み書きできる（USING true）。将来その公開を外す(Phase C)ための前段として、
--   必要な分だけ返す SECURITY DEFINER 関数を4本足す。
--   このファイルは「追加だけ」。既存のポリシー・GRANT・アプリ動作は一切変えない。
--   （アプリを窓口経由に切り替えるのは Phase B、表の公開を外すのは Phase C）
--
-- 設計の肝:
--   ・SECURITY DEFINER + SET search_path=public で、所有者権限で表を読む
--     （Phase C で anon の表権限を外しても、この関数経由なら読める）。
--   ・返すのは施設1件分／キー一致分だけ。他施設の列挙はできない。
--   ・EXECUTE は anon と authenticated にだけ付与（PUBLIC からは剥がす）。
--   ・戻り値の列名・形は、現行の StaffPortal / SharedShiftView がそのまま使える形。
--   ・CREATE OR REPLACE なので何度実行しても同じ。
--
-- 確認・切り戻し手順: docs/PORTAL_SHARE_RPC_PHASE_A.md
-- ================================================================

-- ─────────────────────────────────────────────────────────────
-- ① ポータルの施設設定: その施設1件だけを返す（他施設は返さない）
--    返り値 jsonb の形は facilityConfig.data_value に合わせる:
--      { facility_name, depts:[{id,label,kiboLimit,kiboDayLimit,deadline,
--        targetYear,targetMonth,byMonth}], staffList:[{id,name,dept}] }
--    p_dept を渡すとその部署の depts / staffList だけに絞る（役職 role は返さない）。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_portal_config(p_admin uuid, p_dept text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN sd.data_value IS NULL THEN NULL ELSE jsonb_build_object(
    'facility_name', COALESCE(sd.data_value->>'facility_name', ''),
    'depts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d->>'id', 'label', d->>'label',
        'kiboLimit', d->'kiboLimit', 'kiboDayLimit', d->'kiboDayLimit',
        'deadline', d->'deadline', 'targetYear', d->'targetYear',
        'targetMonth', d->'targetMonth', 'byMonth', d->'byMonth'
      ))
      FROM jsonb_array_elements(COALESCE(sd.data_value->'depts', '[]'::jsonb)) AS d
      WHERE p_dept IS NULL OR d->>'id' = p_dept
    ), '[]'::jsonb),
    'staffList', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s->>'id', 'name', s->>'name', 'dept', s->>'dept'
      ))
      FROM jsonb_array_elements(COALESCE(sd.data_value->'staffList', '[]'::jsonb)) AS s
      WHERE p_dept IS NULL OR s->>'dept' = p_dept
    ), '[]'::jsonb)
  ) END
  FROM shift_data sd
  WHERE sd.user_id = p_admin AND sd.data_key = 'facilityConfig';
$$;

-- ─────────────────────────────────────────────────────────────
-- ② 希望休の読み取り: その施設・部署・月の行だけ（氏名は返さない）
--    現行 StaffPortal は staff_id / days / yukyu_days を使う。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_portal_kibo(p_admin uuid, p_dept text, p_month text)
RETURNS TABLE (staff_id text, days int[], yukyu_days int[])
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT k.staff_id, k.days, k.yukyu_days
  FROM staff_kibo k
  WHERE k.admin_user_id = p_admin
    AND k.dept_id = p_dept
    AND k.month_key = p_month;
$$;

-- ─────────────────────────────────────────────────────────────
-- ③ 希望休の送信: p_staff がその施設・その部署の職員として facilityConfig に
--    実在するときだけ upsert。実在しなければ例外（なりすまし・捏造を防ぐ）。
--    onConflict キーは現行と同じ (admin_user_id, dept_id, staff_id, month_key)。
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_portal_kibo(
  p_admin uuid, p_dept text, p_staff text, p_month text,
  p_days int[], p_yukyu int[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  -- p_staff が p_admin の p_dept に所属する職員か（facilityConfig.staffList で検証）
  SELECT EXISTS (
    SELECT 1
    FROM shift_data sd,
         jsonb_array_elements(COALESCE(sd.data_value->'staffList', '[]'::jsonb)) AS s
    WHERE sd.user_id = p_admin
      AND sd.data_key = 'facilityConfig'
      AND s->>'id' = p_staff
      AND s->>'dept' = p_dept
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION '指定の職員はこの施設・部署に存在しません'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  INSERT INTO staff_kibo (admin_user_id, dept_id, staff_id, month_key, days, yukyu_days, updated_at)
  VALUES (p_admin, p_dept, p_staff, p_month, COALESCE(p_days, '{}'), COALESCE(p_yukyu, '{}'), now())
  ON CONFLICT (admin_user_id, dept_id, staff_id, month_key)
  DO UPDATE SET days = EXCLUDED.days,
                yukyu_days = EXCLUDED.yukyu_days,
                updated_at = now();
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- ④ 共有シフト: token が完全一致する1件だけ（列挙不可）
--    現行 SharedShiftView は year/month/dept_ids/shift_data/staff_data/dept_data を使う。
-- ─────────────────────────────────────────────────────────────
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
  WHERE s.token = p_token;
$$;

-- ─────────────────────────────────────────────────────────────
-- EXECUTE 権限: PUBLIC から剥がし、anon と authenticated にだけ付与
-- （関数の引数が違うと別シグネチャ扱いになるため、4本それぞれに対して実行）
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.get_portal_config(uuid, text)                       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_kibo(uuid, text, text)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_portal_kibo(uuid, text, text, text, int[], int[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_shift(text)                             FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_portal_config(uuid, text)                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_kibo(uuid, text, text)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_portal_kibo(uuid, text, text, text, int[], int[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_shift(text)                             TO anon, authenticated;

-- ※既存のポリシー・テーブル GRANT・アプリには一切変更なし（Phase A は追加のみ）。
