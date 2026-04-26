-- スタッフポータル: 施設設定を公開読み取りするRPC関数
CREATE OR REPLACE FUNCTION get_facility_config(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT data_value FROM shift_data
  WHERE user_id = p_user_id AND data_key = 'facilityConfig'
  LIMIT 1;
$$;
