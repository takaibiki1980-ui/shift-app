# SAVE_PIPELINE_TRACE.md
# 保存パイプライン TRACEログ 確認ガイド

作成日: 2026-06-27
対象コミット: a199ff8
対象ファイル: `src/App.jsx`（保存エフェクト）

---

## TRACEログ一覧

| ログ | 出力タイミング | 重要フィールド |
|---|---|---|
| `[TRACE①] 保存エフェクト開始` | 保存エフェクト（useEffect）の最初 | userEditSeq / seqAtLastRemoteLoad / dirtyDeptIds |
| `[TRACE②] STOP: dbInitialized=false` | L7382 で return | — |
| `[TRACE②] STOP: isLoadingMonth=true` | L7383 で return | — |
| `[TRACE②] STOP: L7386 true` | L7386 で return（upsertなしで"saved"） | userEditSeq と seqAtLastRemoteLoad の値 |
| `[TRACE③] 保存タイマー開始` | setTimeout(1000ms) をセット | closureDeptId / dirtyDeptIds |
| `[TRACE②] STOP: タイマー内 isLoadingMonth=true` | タイマー内で isLoadingMonth が true | — |
| `[TRACE②] STOP: L7399 年月不一致` | 年月チェックで return | — |
| `[TRACE④] 保存対象部署` | forループ開始前 | deptIdsToSave |
| `[TRACE⑤] forループ開始` | 部署ごとのループ開始 | currentDeptId / key / staffCount |
| `[TRACE⑥] supabase.upsert() 呼び出し直前` | upsert 直前 | table / key / staffCount |
| `[TRACE⑦] supabase.upsert() 戻り値` | upsert 完了後 | error / success |
| `[TRACE⑧] 保存ループ完了` | 全部署ループ後 | saveError |

---

## 確認手順

1. ブラウザで管理画面を開く
2. DevTools → Console タブを開く（F12）
3. シフト生成を実行する
4. 以下のパターンでログを読む

---

## ログ読み方

### パターン A: 正常保存

```
[TRACE①] 保存エフェクト開始 { userEditSeq: 1, seqAtLastRemoteLoad: 0, ... }
[TRACE③] 保存タイマー開始 setTimeout(1000ms) ...
[TRACE④] 保存対象部署: ['kaigo1']
[TRACE⑤] forループ開始 { currentDeptId: 'kaigo1', staffCount: 15 }
[TRACE⑥] supabase.upsert() 呼び出し直前 { staffCount: 15 }
[TRACE⑦] supabase.upsert() 戻り値 { error: null, success: true }
[save] Supabase保存OK: shifts_2026_7_kaigo1
[TRACE⑧] setSaveStatus("saved") 呼び出し（upsert成功）
```

→ 正常。ShiftViewPortal が「－」になる場合は別の問題。

---

### パターン B: L7386 で止まる

```
[TRACE①] 保存エフェクト開始 { userEditSeq: 1, seqAtLastRemoteLoad: 1, ... }
[TRACE②] STOP: L7386 true (userEditSeq===seqAtLastRemoteLoad=1) → setSaveStatus("saved") → return
```

→ 根本原因は L7386。reloadFromRemote が seqAtLastRemoteLoad を 1 に更新していた。

---

### パターン C: isLoadingMonth で止まる

```
[TRACE①] 保存エフェクト開始 { isLoadingMonth: true, ... }
[TRACE②] STOP: isLoadingMonth=true → return
```

→ 保存エフェクト発火時に Realtime ロード中だった。

---

### パターン D: タイマーがセットされるが upsert に到達しない

```
[TRACE①] 保存エフェクト開始 { userEditSeq: 1, seqAtLastRemoteLoad: 0, ... }
[TRACE③] 保存タイマー開始 ...
（1秒後）
[TRACE②] STOP: タイマー内 isLoadingMonth=true → return
```

または

```
[TRACE③] 保存タイマー開始 ...
（1秒後）
[TRACE②] STOP: L7399 年月不一致 → return
```

→ タイマー発火時に isLoadingMonth が true、または年月が変わっていた。

---

### パターン E: upsert 失敗

```
[TRACE⑥] supabase.upsert() 呼び出し直前 { staffCount: 0 }
[TRACE⑦] supabase.upsert() 戻り値 { error: "...", success: false }
[save] Supabase保存失敗: ...
[TRACE⑧] setSaveStatus("unsaved") 呼び出し（upsert失敗）
```

→ staffCount: 0 の場合は deptData = {} で保存されている。
→ error がある場合は Supabase 側のエラー。

---

## 貼り付けてほしいログ

シフト生成後、Console に出た `[TRACE` で始まる行をすべてコピーして貼り付けてください。
（量が多い場合は `[TRACE①]` から最初の `[TRACE②] STOP:` または `[TRACE⑧]` まで）
