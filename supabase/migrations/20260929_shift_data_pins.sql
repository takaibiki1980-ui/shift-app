-- ================================================================
-- 変更履歴の「ピン留め（永続保存）」用テーブル
-- 目的: shift_data_history は (user_id,data_key) ごとに最新15件で自動回転するため、
--       「大事な状態」を回転枠とは別に、無制限・名前付きで永続保存できるようにする。
-- 設計: 案B（独立テーブル）。既存の退避トリガー(fn_shift_data_history)には一切触れない。
--       ピン留め = 選んだ履歴の中身(data_value)と対の色情報(marks_value)をここにコピー(INSERT)。
--       このテーブルにはトリガーが無い＝自動削除されない＝無制限に保持できる。
-- 使い方: Supabase SQL Editor でこのファイルの内容をそのまま実行。
-- ================================================================

-- 1. テーブル作成
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_data_pins (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_key            TEXT        NOT NULL,   -- 例 shifts_2026_9_kaigo1（表示スコープ絞り込み用）
  name                TEXT        NOT NULL,   -- ピンの名前（リーダーが付ける）
  data_value          JSONB       NOT NULL,   -- shifts の中身（履歴からのコピー）
  marks_value         JSONB,                  -- 対の editmarks(色) のコピー（あれば・自己完結復元用）
  source_archived_at  TIMESTAMPTZ,            -- 元履歴の archived_at（表示用）
  original_updated_at TIMESTAMPTZ,            -- 参考（元 shift_data.updated_at）
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 検索用インデックス（ユーザー×キー×新しい順）
CREATE INDEX IF NOT EXISTS idx_sdp_user_key_time
  ON shift_data_pins(user_id, data_key, created_at DESC);

-- 2. Row Level Security: 自分のデータのみ CRUD 可
-- ----------------------------------------------------------------
ALTER TABLE shift_data_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own pins select" ON shift_data_pins;
CREATE POLICY "own pins select" ON shift_data_pins
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own pins insert" ON shift_data_pins;
CREATE POLICY "own pins insert" ON shift_data_pins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own pins update" ON shift_data_pins;
CREATE POLICY "own pins update" ON shift_data_pins
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own pins delete" ON shift_data_pins;
CREATE POLICY "own pins delete" ON shift_data_pins
  FOR DELETE USING (auth.uid() = user_id);

-- ※このテーブルにはトリガーを付けない（自動削除されない＝無制限保持）。
-- ※既存の shift_data / shift_data_history / トリガーには一切変更を加えない。
