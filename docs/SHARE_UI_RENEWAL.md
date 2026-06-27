# SHARE_UI_RENEWAL.md
# 共有機能リニューアル 変更レポート

実装日: 2026-06-27
コミット: 83fe18b

---

## 変更前後の画面構成

### 変更前

```
📤 書き出し画面
  └─ 印刷
  └─ CSV
  └─ HTML保存

🔗 スタッフ共有URL画面
  └─ サイトQRコード
  └─ 部署ごとの希望休ポータル
       ├─ 対象月・締め切り設定
       ├─ QRコード（希望休用）
       ├─ 希望休入力リンク（LINE/コピー）
       └─ 【確定シフトを送る】← ここにあった（削除）
            ├─ LINEで送る
            └─ URLコピー
```

### 変更後

```
📤 書き出し画面
  └─ 部署選択（チェックボックス）
  └─ 印刷
  └─ CSV
  └─ HTML保存
  └─ 【共有】セクション ← 新設
       └─ 選択部署ごとに：
            ├─ QRコード（確定シフト用）
            ├─ LINEで送る
            └─ URLコピー

🔗 スタッフ共有URL画面
  └─ サイトQRコード
  └─ 部署ごとの希望休ポータル（希望休のみ）
       ├─ 対象月・締め切り設定
       ├─ QRコード（希望休用）
       └─ 希望休入力リンク（LINE/コピー）
```

---

## 削除項目

| 場所 | 削除内容 | コード |
|---|---|---|
| スタッフ共有URL画面（shareModal） | 「📋 確定シフトを送る」セクション全体 | L8622–L8644 削除 |
| 〃 | doShiftLine / doShiftCopy 関数 | 同上 |

---

## 追加項目

| 場所 | 追加内容 | コード |
|---|---|---|
| DownloadModal | `session`, `saveStatus` プロップ追加 | L4836 |
| DownloadModal | 【共有】セクション（選択部署ごとのQR・LINE・URLコピー） | L4854–L4895 |

### 共有URLの形式（変更なし）

```
${origin}?staff=${uuidToShort(session.user.id)}&dept=${d.id}&view=shift&ym=${year}${String(month+1).padStart(2,'0')}
```

---

## 表示変換（④ 希→休）

ShiftViewPortal の `cellText` 関数に追加:

```javascript
// 変更前
if (v === '希望休' || v === '休み') return '休';

// 変更後
if (v === '希望休' || v === '休み' || v === '希') return '休';
```

- 管理画面データは一切変更しない
- 共有画面（ShiftViewPortal）の表示時のみ変換
- `日休` → `v.slice(0,2)` = `日休` のまま（変更なし）

---

## セル幅 CSS 修正（⑤）

ShiftViewPortal のテーブルスタイルを変更:

```javascript
// 変更前
<table style={{borderCollapse:'collapse',width:'100%'}}>
th: { padding:'3px 4px', minWidth:24 }
td: { padding:'3px 4px' }

// 変更後
<table style={{borderCollapse:'collapse',width:'100%',tableLayout:'fixed'}}>
th: { padding:'3px 2px', width:28, maxWidth:28, overflow:'hidden', boxSizing:'border-box' }
td: { padding:'3px 2px', width:28, maxWidth:28, overflow:'hidden', boxSizing:'border-box' }
氏名列: width:72, maxWidth:72
集計列: width:32/28
```

- `tableLayout: 'fixed'` により列幅がコンテンツで広がらない
- `日休`（2文字）も他のセルと同幅で表示される
- 既存レイアウト（overflowX:'auto'の親div）はそのまま維持

---

## 影響範囲

| コンポーネント | 変更 | 影響 |
|---|---|---|
| `DownloadModal` | 共有セクション追加・props追加 | 書き出し画面にQR・共有ボタン表示 |
| `shareModal`（JSX） | 確定シフト送信セクション削除 | スタッフ共有画面から確定シフト送信が消える |
| `ShiftViewPortal` | CSS固定・cellText追加 | セル幅均一・希→休変換 |
| 生成エンジン・保存処理 | 変更なし | 影響なし |

---

## 今後の拡張性（QRコード・複数部署共有）

### 今回の実装範囲

- 書き出し画面の「対象部署」チェックボックスで複数部署を選択できる構成（将来の複数部署共有に対応できる設計）
- 選択した各部署の共有QR・URLを**部署ごとに個別**表示する
- 複数部署を1画面へ統合して表示する機能は**次フェーズで実装予定**

### 今後の拡張候補

| 機能 | 実装ポイント |
|---|---|
| QRコード一括印刷 | `buildPrintHTML` に QR SVG を埋め込む（`qrcode.react` → string 変換が必要） |
| 複数部署を1URLにまとめる | URLパラメータに `depts=kaigo1,kaigo2` を追加し ShiftViewPortal でタブ切替表示 |
| 共有専用ページ | `view=shift-bundle` などの新 view モードを追加 |
| 有効期限付きURL | Supabase テーブルに `share_tokens` を追加し token ベース認証 |

---

## 保存処理との関係

共有ボタンは `saveStatus === 'saved'` のときのみ有効（グレーアウト解除）。
保存が完了していない状態でボタンを押すと alert が出て送信されない。

ただし「保存済み」表示の偽陽性問題（現在調査中）が解消されるまで、
共有直前に「[SAVE] UPSERT OK」のコンソールログで確認することを推奨する。
