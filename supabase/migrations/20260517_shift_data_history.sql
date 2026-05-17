-- ================================================================
-- shift_data 自動バックアップ（15世代履歴保存）
-- 目的: フロントエンドのバグによる上書き事故からデータを守る
-- 使い方: Supabase SQL Editor でこのファイルの内容をそのまま実行
-- ================================================================

-- 1. 履歴テーブル作成
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_data_history (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_key        TEXT        NOT NULL,
  data_value      JSONB       NOT NULL,
  original_updated_at TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 検索用インデックス（ユーザー×キー×時刻の降順）
CREATE INDEX IF NOT EXISTS idx_sdh_user_key_time
  ON shift_data_history(user_id, data_key, archived_at DESC);

-- Row Level Security: 自分のデータのみ参照可
ALTER TABLE shift_data_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own history" ON shift_data_history;
CREATE POLICY "Users can view own history" ON shift_data_history
  FOR SELECT USING (auth.uid() = user_id);


-- 2. トリガー関数
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_shift_data_history()
RETURNS TRIGGER AS $$
BEGIN
  -- 上書き前の古いデータを履歴テーブルに退避
  INSERT INTO shift_data_history (user_id, data_key, data_value, original_updated_at)
  VALUES (OLD.user_id, OLD.data_key, OLD.data_value, OLD.updated_at);

  -- 15世代を超えた古い履歴を自動削除（容量節約）
  DELETE FROM shift_data_history
  WHERE id IN (
    SELECT id
    FROM shift_data_history
    WHERE user_id = OLD.user_id
      AND data_key = OLD.data_key
    ORDER BY archived_at DESC
    OFFSET 15
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. トリガー設定（UPDATEのたびに旧データを退避）
-- ----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_shift_data_history ON shift_data;
CREATE TRIGGER trg_shift_data_history
  BEFORE UPDATE ON shift_data
  FOR EACH ROW
  EXECUTE FUNCTION fn_shift_data_history();


-- ================================================================
-- 【復元手順】万が一データが消えた場合の確認・巻き戻しSQL
-- ================================================================

-- ▼ 過去15世代の履歴を確認（重要データのみ抽出）
/*
SELECT
  id,
  data_key,
  to_char(archived_at     AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') AS 上書き時刻,
  to_char(original_updated_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') AS 元保存時刻
FROM shift_data_history
WHERE user_id = auth.uid()
  AND data_key IN ('staffList', 'depts')
ORDER BY data_key, archived_at DESC;
*/

-- ▼ 特定バージョンに巻き戻し（上のSELECTで確認したidを指定）
/*
UPDATE shift_data
SET
  data_value  = h.data_value,
  updated_at  = NOW()
FROM shift_data_history h
WHERE shift_data.user_id = auth.uid()
  AND shift_data.data_key = h.data_key
  AND h.id = 123;  -- ← ここにhistory_idを指定
*/

-- ▼ 特定キーの全履歴を見る（シフトデータ含む）
/*
SELECT
  id,
  data_key,
  to_char(archived_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI:SS') AS 上書き時刻
FROM shift_data_history
WHERE user_id = auth.uid()
ORDER BY archived_at DESC
LIMIT 50;
*/
