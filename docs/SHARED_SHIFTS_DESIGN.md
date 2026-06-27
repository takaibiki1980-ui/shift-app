# SHARED_SHIFTS_DESIGN.md
# 完成シフト共有機能 設計書

作成日: 2026-06-27
更新日: 2026-06-27

---

## 1. 設計方針

### 基本原則

- 書き出し画面（DownloadModal）が見ている `allShifts` を共有データの唯一の源泉とする
- 共有ボタン押下時に `shared_shifts` テーブルへ保存し、その時点のスナップショットを共有する
- 共有画面（SharedShiftView）は `shared_shifts` のみを参照し、`shift_data` には依存しない
- ShiftViewPortal（旧共有コンポーネント）は段階的に廃止する

### 追加原則（確定）

#### ① スナップショット保存

共有ボタンを押した時点の完成シフトを `shared_shifts` に保存する。

- 保存後に管理画面でシフトを変更しても、`shared_shifts` の内容は変わらない
- 「この URL に保存されたシフト」＝「共有ボタンを押した瞬間の確定シフト」である

#### ② 単体完結（自己完結型テーブル）

`shared_shifts` 1レコードに共有表示に必要な全データを含める。

- `shift_data`（シフトデータ）
- `staff_data`（スタッフ氏名・部署）
- `dept_data`（部署名・アイコン）

共有画面は他テーブル（`shift_data` / `staffList` / `depts`）を一切参照しない。

#### ③ 発行済みURLの不変性

発行済みの URL は管理画面の変更から独立している。

- 同じ部署・同じ月に対して共有ボタンを再押下した場合 → **新しい token を発行**し新しい URL を生成する
- 旧 URL はそのまま旧スナップショットを表示し続ける
- 「上書き更新」は行わない（token は immutable）

### 旧設計との比較

```
【旧設計】
書き出し画面 → allShifts（表示）
共有ボタン  → shift_data（Supabase） → URL → ShiftViewPortal → shift_data を再取得
                ↑ 自動保存タイマー依存・保存失敗で「－」表示

【新設計】
書き出し画面 → allShifts（表示）
共有ボタン  → shared_shifts（保存） → URL（short token） → SharedShiftView → shared_shifts を取得
                ↑ ボタン押下時に確実保存・専用テーブルで独立
```

---

## 2. Supabase テーブル設計

### shared_shifts テーブル

```sql
create table shared_shifts (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,          -- 短縮トークン（8文字英数字）・不変
  admin_user_id uuid not null,                 -- 管理者のuser_id（参照用のみ）
  year          integer not null,
  month         integer not null,              -- 1-indexed（1〜12）
  dept_ids      text[] not null,               -- 共有対象部署IDの配列（将来の複数部署対応）

  -- ② 単体完結: 共有表示に必要な全データをここに含める
  -- 他テーブル（shift_data / staffList / depts）は参照しない
  shift_data    jsonb not null,                -- 押下時点のスナップショット { "kaigo1": { staffId: { day: value } } }
  staff_data    jsonb not null,                -- 押下時点のスナップショット [{ id, name, dept }]
  dept_data     jsonb not null,                -- 押下時点のスナップショット [{ id, label, icon }]

  created_at    timestamptz default now(),
  expires_at    timestamptz                    -- 将来: 有効期限（null = 無期限）
);
```

### 不変性の保証（③）

- `token` には `unique` 制約のみ。`upsert` / `update` は使用しない
- 共有ボタン押下 → 毎回 `insert`（新 token 生成）
- 既存レコードは変更・削除しない（管理画面の操作が影響しない）

### RLS ポリシー

```sql
-- 書き込み: 認証済みユーザーのみ（自分のレコードのみ）
create policy "insert own shared_shifts"
  on shared_shifts for insert
  with check (auth.uid() = admin_user_id);

-- 読み取り: 誰でも token で参照可能（認証不要）
create policy "public read by token"
  on shared_shifts for select
  using (true);

-- 更新: 自分のレコードのみ（token再利用時の上書き）
create policy "update own shared_shifts"
  on shared_shifts for update
  using (auth.uid() = admin_user_id);
```

---

## 3. トークン設計

### フォーマット

```
8文字英数字（大文字小文字区別あり・数字込み）
例: aB3xK7mQ
```

### 生成ルール

```javascript
const genToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"[b % 54])
    .join('');
// 54^6 ≈ 2.4億通り。衝突時は再生成。
// 紛らわしい文字（0/O, 1/I/l）を除外
```

### 共有URL

```
https://<origin>?share=<token>
例: https://shiftapp.vercel.app?share=aB3xK7mQ
```

---

## 4. 共有データ構造（shift_data / staff_data / dept_data）

### shift_data（jsonb）

```json
{
  "kaigo1": {
    "<staffId-uuid>": {
      "1": "早番",
      "2": "日勤",
      "3": "休み",
      ...
      "31": "夜勤"
    }
  },
  "kaigo2": { ... }
}
```

- `allShifts` のうち共有対象部署分のみ抽出してそのまま保存
- 管理画面データを変更しない

### staff_data（jsonb）

```json
[
  { "id": "<uuid>", "name": "山田 太郎", "dept": "kaigo1" },
  { "id": "<uuid>", "name": "佐藤 花子", "dept": "kaigo2" }
]
```

- 共有対象部署に所属するスタッフのみ
- 共有画面での氏名表示に使用

### dept_data（jsonb）

```json
[
  { "id": "kaigo1", "label": "介護1階", "icon": "🏠" },
  { "id": "kaigo2", "label": "介護2階", "icon": "🏡" }
]
```

---

## 5. 共有フロー（実装詳細）

### 5-1. 共有ボタン押下時（管理画面側）

```
doShare(selectedDepts, mode)

  【① スナップショット作成】
  1. token     = genToken()（8文字・毎回新規生成）
  2. shift_data = selectedDepts の allShifts[dept] を抽出（押下時点のコピー）
  3. staff_data = selectedDepts に所属するスタッフを staffList から抽出（押下時点のコピー）
  4. dept_data  = selectedDepts の部署情報を depts から抽出（押下時点のコピー）

  【② 単体完結データとして INSERT（upsert/update は使わない）】
  5. supabase.from('shared_shifts').insert({
       token,
       admin_user_id: session.user.id,
       year, month,
       dept_ids: selectedDepts,
       shift_data,   ← 他テーブルを後から参照しない完結データ
       staff_data,   ← 同上
       dept_data     ← 同上
     })

  【③ 発行済みURL不変：毎回新token・既存レコード変更なし】
  6. shareUrl = `${origin}?share=${token}`
  7. mode === 'line'  → LINE送信
     mode === 'copy'  → クリップボードコピー
     QR              → shareUrl から即時生成（QRCodeSVG）
```

### 5-2. スタッフがURLを開いたとき（共有画面側）

```
App.jsx 起動
  → params.get('share') = token が存在する
  → <SharedShiftView token={token} /> をレンダリング
  → LoginPage / MainApp は表示しない

SharedShiftView
  → supabase.from('shared_shifts').select('*').eq('token', token).maybeSingle()
  → 取得成功 → shift_data / staff_data / dept_data でシフト表をレンダリング
  → 取得失敗 → 「共有リンクが無効です」と表示
```

---

## 6. 共有画面コンポーネント（SharedShiftView）設計

### 表示仕様

```
ヘッダー: {dept_data[0].icon} {dept_data[0].label}  {year}年{month}月
          ※ 複数部署の場合はタブ切替（将来対応）

テーブル: 印刷画面（buildPrintHTML）と同等のレイアウト
  - 氏名列（固定）
  - 日付列（1〜末日）
  - 曜日表示（土=青、日・祝=赤）
  - セル変換: 希望休・希 → 休、有休 → 有、夜勤 → 夜、明け → 明（管理データ非変更）

CSS: tableLayout: 'fixed'、列幅固定（印刷画面と同一設計）
```

### セル変換関数（共有画面のみ適用）

```javascript
const cellText = (v) => {
  if (!v) return '－';
  if (v === '希望休' || v === '休み' || v === '希') return '休';
  if (v === '有休') return '有';
  if (v === '明け') return '明';
  if (v === '夜勤') return '夜';
  return v.slice(0, 2);
};
```

---

## 7. 拡張設計（将来対応）

### 複数部署の1画面表示

```
shared_shifts.dept_ids = ['kaigo1', 'kaigo2']
shift_data = { kaigo1: {...}, kaigo2: {...} }

SharedShiftView:
  → dept_ids.length > 1 → タブ表示
  → タブ: [🏠 介護1階] [🏡 介護2階]
  → タブ切替で dept ごとのテーブルを表示
```

### QR・LINE・URLコピーの同時表示

```
DownloadModal 共有セクション:
  選択部署（チェックボックス）
    ↓
  [共有URLを作成] ボタン（1回のupsertで全部署をまとめて保存）
    ↓
  QRコード（120×120）
  💬 LINEで送る
  📋 URLコピー
```

### 有効期限（将来）

```
shared_shifts.expires_at に期限を設定
SharedShiftView:
  → expires_at < now() → 「このリンクは期限切れです」
```

---

## 8. ルーティング変更

### 現在

```javascript
// App.jsx
const staffViewMode = params.get('view');   // 'shift'
if (resolvedUserId && staffViewMode === 'shift')
  return <ShiftViewPortal ... />;
```

### 変更後

```javascript
// App.jsx
const shareToken = params.get('share');
if (shareToken)
  return <SharedShiftView token={shareToken} />;

// 旧 ?view=shift ルートは廃止（ShiftViewPortal 削除）
```

---

## 9. 実装ステップ

| ステップ | 内容 |
|---|---|
| 1 | Supabase: `shared_shifts` テーブル作成・RLS設定 |
| 2 | `genToken()` 関数追加 |
| 3 | `SharedShiftView` コンポーネント作成 |
| 4 | App.jsx ルーティングに `?share=token` を追加 |
| 5 | DownloadModal の `doShare()` を `shared_shifts` upsert に変更 |
| 6 | 旧 `ShiftViewPortal` を削除・旧 `?view=shift` ルートを削除 |

---

## 10. 影響範囲

| コンポーネント / 機能 | 変更 |
|---|---|
| `DownloadModal.doShare()` | `shift_data` upsert → `shared_shifts` upsert |
| `App.jsx` ルーティング | `?share=token` 追加 |
| `SharedShiftView`（新規） | `shared_shifts` から取得・レンダリング |
| `ShiftViewPortal`（旧） | 削除 |
| 生成エンジン・保存処理 | 変更なし |
| `shift_data` テーブル | 変更なし（管理画面の保存先として継続使用） |
