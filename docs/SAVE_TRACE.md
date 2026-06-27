# SAVE_TRACE.md
# 保存処理 TRACEログ 確認ガイド

対象コミット: fdf03e8
対象ファイル: `src/App.jsx`（保存エフェクト）

---

## 追加したログ（5種類）

| ログ | 出力タイミング |
|---|---|
| `[SAVE] START` | 保存エフェクト開始（毎回）|
| `[SAVE] STOP L7382 dbInitialized=false` | DB初期化前に return |
| `[SAVE] STOP L7383 isLoadingMonth=true` | ロード中に return（エフェクト冒頭 or タイマー内）|
| `[SAVE] STOP L7386 userEditSeq===seqAtLastRemoteLoad=N` | seq一致で return（upsertなしで"保存済み"）|
| `[SAVE] STOP L7399 year/month mismatch` | 年月不一致で return（upsertなしで"保存済み"）|
| `[SAVE] UPSERT <data_key> <件数>` | upsert 呼び出し直前 |
| `[SAVE] UPSERT OK` | upsert 成功 |
| `[SAVE] UPSERT ERROR <message>` | upsert 失敗 |

---

## 確認手順

1. 管理画面を開く
2. DevTools → Console タブを開く（F12）
3. 保存が発生する操作を実施（シフト生成・手動編集・貼り付けなど）
4. Console に出た `[SAVE]` で始まる行を全てコピーして貼り付ける

---

## ログの読み方

### 正常保存（期待値）

```
[SAVE] START
[SAVE] UPSERT shifts_2026_7_kaigo1 15
[SAVE] UPSERT OK
```

### L7386 で止まる（upsert 未実行）

```
[SAVE] START
[SAVE] STOP L7386 userEditSeq===seqAtLastRemoteLoad=1
```

→ upsert は実行されていない。管理画面は "保存済み" 表示になるが Supabase には書かれない。

### isLoadingMonth で止まる

```
[SAVE] START
[SAVE] STOP L7383 isLoadingMonth=true
```

### upsert はされたが件数0（空データ保存）

```
[SAVE] START
[SAVE] UPSERT shifts_2026_7_kaigo1 0
[SAVE] UPSERT OK
```

→ data_value = {} で保存されている。ShiftViewPortal は空表示になる。

### upsert エラー

```
[SAVE] START
[SAVE] UPSERT shifts_2026_7_kaigo1 15
[SAVE] UPSERT ERROR <エラーメッセージ>
```
