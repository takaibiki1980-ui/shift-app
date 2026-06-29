-- shared_shifts テーブル作成
-- 完成シフト共有専用。push時点のスナップショットを保存する。
-- shift_data テーブルとは完全に独立。

create table if not exists shared_shifts (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,        -- 共有トークン（8文字英数字）・不変
  schema_version integer not null default 1, -- データ構造のバージョン管理用
  admin_user_id uuid not null,               -- 発行した管理者のuser_id
  year          integer not null,
  month         integer not null,            -- 1-indexed（1〜12）
  dept_ids      text[] not null,             -- 共有対象部署IDの配列

  -- 共有表示に必要な全データをこのテーブルに含める（他テーブル参照不要）
  shift_data    jsonb not null,              -- { "deptId": { "staffId": { "day": "value" } } }
  staff_data    jsonb not null,              -- [{ "id": "uuid", "name": "氏名", "dept": "deptId" }]
  dept_data     jsonb not null,              -- [{ "id": "deptId", "label": "部署名", "icon": "絵文字" }]

  created_at    timestamptz default now(),
  expires_at    timestamptz                  -- null = 無期限（将来の有効期限機能用）
);

-- RLS 有効化
alter table shared_shifts enable row level security;

-- 書き込み: 認証済みユーザーが自分のレコードのみ INSERT 可能
-- UPDATE / UPSERT は禁止（発行済みURLの不変性を保証）
create policy "insert own shared_shifts"
  on shared_shifts for insert
  to authenticated
  with check (auth.uid() = admin_user_id);

-- 読み取り: token を知っている人なら誰でも参照可能（認証不要）
create policy "public read by token"
  on shared_shifts for select
  using (true);

-- token 検索用インデックス
create index if not exists shared_shifts_token_idx on shared_shifts (token);
