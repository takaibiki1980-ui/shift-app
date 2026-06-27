# SHIFT_SAVE_PIPELINE_REVIEW.md
# 完成シフト保存パイプライン 詳細調査レポート

調査日: 2026-06-27  
調査対象: `/home/user/shift-app/src/App.jsx`  
症状: ShiftViewPortal の診断画面で「保存済みシフトキー 0件」  
制約: 実装禁止・コード変更禁止・推測禁止・ログ追加禁止

---

## 現在フェーズ・残りフェーズ・生成結果

| 項目 | 内容 |
|---|---|
| 現在フェーズ | 保存パイプライン詳細調査（静的解析フェーズ終端） |
| 最終目標まで残りフェーズ | 原因確定 → 修正 → テスト の2フェーズ |
| 今回で生成結果が変わるか | 変わらない（調査のみ） |

---

## 重大前提：「診断画面を見ている」が示すこと

ShiftViewPortal の診断画面（`setDiagInfo(...)` / 「保存済みシフトキー」一覧）は、`main` ブランチには存在しない。追加されたのは commit `02c1674`（`claude/upbeat-planck-jbbtoc` ブランチ）以降。

**結論**: ユーザーが診断画面を見ているということは、`claude/upbeat-planck-jbbtoc` ブランチ（Fix S-1 適用済み）のコードで動作している。

| ブランチ | 診断画面 | Fix S-1 |
|---|---|---|
| `main`（commit fd435b7） | なし | なし |
| `claude/upbeat-planck-jbbtoc`（commit 7847f2a） | あり ✅ | あり ✅ |

→ Fix S-1 は適用済みだが、依然として 0件。**Fix S-1 とは別の原因が存在する。**

---

## 「0件」と「空オブジェクト（{}）」の違い

| 診断結果 | Supabase 状態 | 原因 |
|---|---|---|
| 全セル「－」（診断画面なし） | `data_value = {}` でキーは存在 | Fix S-1 修正前の activeDeptId 誤り（旧バグ） |
| **「0件」診断画面表示（今回）** | `shifts_%` キー自体が存在しない | **保存が1回も実行されていない** |

診断クエリ（L6563）:
```javascript
supabase.from('shift_data').select('data_key')
  .eq('user_id', adminUserId)
  .like('data_key', 'shifts_%')
```

0件 = Supabase に `shifts_` で始まるキーが皆無。生成はしているが **upsert が到達していない。**

---

## 保存処理 5段階フロー（コード根拠付き）

```
【段階1】生成実行
  L7917: userEditSeq.current++         ← シーケンス番号インクリメント
  L8227: dirtyDeptIdsRef.current.add(cd.id)   ← ★Fix S-1: 生成部署をdirty登録
  L8228: setAllShifts(prev=>({...prev, [cd.id]: result}))
         ↓ React re-render 後
         ↓ allShifts（依存）が変化

【段階2】保存エフェクト発火 (L7380)
  useEffect(() => { ... }, [allShifts, year, month])
  
  ガード①: L7382  if (!dbInitialized.current) return;     ← DB未初期化で中断
  ガード②: L7383  if (isLoadingMonth.current) return;      ← 月ロード中で中断
  ガード③: L7386  if (userEditSeq === seqAtLastRemoteLoad) ← 変更なし判定で中断
              { setSaveStatus('saved'); return; }
  
  通過 → L7394: closureDeptId = activeDeptIdRef.current
         L7395: dirtyDeptIdsRef.current.add(closureDeptId)
         L7396: saveTimer = setTimeout(async()=>{...}, 1000)

【段階3】タイマー発火（1秒後）
  ガード④: L7397  if (isLoadingMonth.current) return;      ← 月ロード中で中断
  ガード⑤: L7399  if (year !== yearRef.current || month !== monthRef.current)
              { setSaveStatus('saved'); return; }           ← 年月不一致で中断
  
  通過 → L7408: deptIdsToSave = new Set(dirtyDeptIdsRef.current)
         L7409: deptIdsToSave.add(closureDeptId)
  
  → ★deptIdsToSave が空なら for ループに入らず何も保存されない

【段階4】Supabase upsert (L7415)
  for (const currentDeptId of deptIdsToSave) {
    const key = `shifts_${year}_${month+1}_${currentDeptId}`
    const deptData = allShifts[currentDeptId] || {}
    const { error } = await supabase.from('shift_data').upsert(...)
    
    ガード⑥: L7421  if JWT/PGRST301 error → signOut; return  ← 認証エラーで完全中断
    ガード⑦: L7427  throw error (他エラー)                    → catch に飛ぶ
  }

【段階5】完了処理
  成功: L7454  setSaveStatus("saved")  / localStorage.setItem
  失敗: L7460  setSaveStatus("unsaved") / saveFailCount++
         5回失敗で: setSaveStatus('error') / window.confirm
```

---

## ① 生成直後に setAllShifts(result) まで実行されているか

**コード上は必ず実行される（確認）**

```javascript
// L8227–8228
dirtyDeptIdsRef.current.add(cd.id);
setAllShifts(prev => ({...prev, [cd.id]: result}));
```

この2行はtry ブロック内だが、生成エンジンが正常終了すれば必ず実行される。生成が失敗すると catch（L8239）でアラートが出るため、ユーザーには分かる。

---

## ② dirtyDeptIdsRef に kaigo1 が追加されているか

**Fix S-1 適用後はコード上は必ず追加される（確認）**

```javascript
// L8227 (Fix S-1)
dirtyDeptIdsRef.current.add(cd.id);  // 生成部署を登録（kaigo1 等）
```

```javascript
// L7395 (保存エフェクト内)
dirtyDeptIdsRef.current.add(closureDeptId);  // activeDeptId も追加
```

`dirtyDeptIdsRef` は初期値 `new Set()`（L6806）で、`.clear()` を呼ぶコードは存在しない。追加のみ。

---

## ③ 保存タイマー（setTimeout）が実際に起動しているか

**コード上は 3つのガードを全て通過すれば起動する（静的解析では確認不可）**

| ガード | 条件 | 通過できるか |
|---|---|---|
| ガード① `dbInitialized` | 初期ロード完了後は true | 生成ボタンを押せる = UI表示済 = ロード完了 → 通常は通過 |
| ガード② `isLoadingMonth` | 初期ロード後 100ms で false | 生成ボタン押下時は通常 false → 通過 |
| ガード③ `userEditSeq === seqAtLastRemoteLoad` | 生成後は userEditSeq が +1 | **条件次第で中断の可能性 ← 詳細後述** |

---

## ④ supabase.upsert() が実際に呼ばれているか

**deptIdsToSave が空でなく、ガード④⑤を通過すれば呼ばれる（静的解析では確認不可）**

ガード⑤（L7399）の年月不一致チェック:
```javascript
if (year !== yearRef.current || month !== monthRef.current) {
  setSaveStatus('saved');  // ← 保存なしで 'saved' になる
  return;
}
```

**この分岐は「保存なしで saved を返す」最も危険な出口。生成後に月を切り替えると発火する。**

---

## ⑤ upsert の戻り値（success / error）

**静的解析では確認不可。ただし失敗時の処理は存在する（L7449–7477）**

```javascript
} catch(e) {
  saveError = e;
  console.error("[save] Supabase保存失敗:", key, e?.message || e);
}
// ...
if (!saveError) {
  setSaveStatus("saved");
} else {
  setSaveStatus("unsaved");  // ← ユーザーには「未保存」として表示される
  saveFailCountRef.current += 1;
  if (saveFailCountRef.current >= 5) {
    setSaveStatus('error');
    window.confirm(...);  // ← 5回連続失敗で確認ダイアログ
  }
}
```

upsert が失敗すれば `saveStatus = 'unsaved'`（グレー表示）。ユーザーが気付かない可能性はある。

---

## ⑥ 保存を途中で抜ける経路の有無

コード根拠付きで全列挙:

| 位置 | 条件 | 抜け方 | saved と表示されるか |
|---|---|---|---|
| L7382 | `!dbInitialized.current` | early return | いいえ（状態変化なし） |
| L7383 | `isLoadingMonth.current` | early return | いいえ |
| L7386 | `userEditSeq === seqAtLastRemoteLoad` | return + `setSaveStatus('saved')` | **はい（偽陽性）** |
| L7397 | `isLoadingMonth.current`（タイマー内） | return | いいえ |
| L7399 | 年月不一致 | return + `setSaveStatus('saved')` | **はい（偽陽性）** |
| L7421 | JWT/認証エラー | `supabase.auth.signOut()` + return | 強制ログアウト |
| L7449 | その他upsertエラー | catch → saveError → 'unsaved' | いいえ |
| ループ空 | `deptIdsToSave.size === 0` | ループ非実行 → 'saved' | **はい（偽陽性）** |

---

## 保存処理フローチャートと「止まる可能性がある箇所」

```
生成ボタン押下
  │
  ├─ try ブロック内
  │    userEditSeq.current++                     ← L7917
  │    dirtyDeptIdsRef.add(cd.id)                ← L8227 (Fix S-1)
  │    setAllShifts({...prev, [cd.id]: result})  ← L8228
  │
  ▼
保存エフェクト発火（allShifts 依存変化）
  │
  ├─▶ [STOP-A] !dbInitialized → return          ← 初回ロード前のみ（通常は通過）
  ├─▶ [STOP-B] isLoadingMonth → return           ← 初期ロード直後 100ms のみ（通常は通過）
  ├─▶ [STOP-C] userEditSeq === seqAtLastRemoteLoad → setSaved + return
  │             ⚠️ 最も危険：保存なしで「保存済」表示
  │
  ▼
setTimeout(1000ms) セット
  │
  ▼（1秒後）
タイマー発火
  │
  ├─▶ [STOP-D] isLoadingMonth → return          ← 通常は通過
  ├─▶ [STOP-E] 年月不一致 → setSaved + return   ⚠️ 保存なしで「保存済」表示
  │
  ▼
deptIdsToSave ループ
  │
  ├─▶ [STOP-F] deptIdsToSave が空 → 'saved' 表示 ⚠️ 保存なしで「保存済」表示
  │             （Fix S-1 適用後は通常は空にならないはず）
  │
  ▼
supabase.upsert() 実行
  │
  ├─▶ [STOP-G] JWT エラー → signOut + return    ← 認証切れ
  ├─▶ [STOP-H] その他エラー → 'unsaved' 表示   ← 失敗表示されるので気付く
  │
  ▼
保存成功 → setSaveStatus('saved')
```

---

## 根本原因候補（優先順位付き）

### 第1位（最有力）: STOP-C — seqAtLastRemoteLoad が userEditSeq に追いついている

**条件**: Realtime が生成完了後・タイマー発火前（1秒以内）に発火し、`reloadFromRemote` が `seqAtLastRemoteLoad = userEditSeq.current` を設定する

**コード根拠（L7149）**:
```javascript
setAllShifts(prev => {
  if (userEditSeq.current !== seqAtStart) return prev;
  seqAtLastRemoteLoad.current = userEditSeq.current;  // ← 生成後の seq に追いつく
  ...
});
```

**ガード（L7077）**:
```javascript
if (saveStatusRef.current === 'unsaved') { return; }  // 保存中はRT拒否
```

このガードは `saveStatusRef.current = "unsaved"` が L7390 でセットされた後に有効になる。しかし save useEffect は `setTimeout` より後に `setSaveStatus('unsaved')` を呼ぶが、`saveStatusRef.current` は L7390 で**同期的に**セットされる。

→ 通常はガードが機能するが、Realtime の到着タイミングが L7390 以前（保存エフェクトのセットアップより先）であれば、ガードが効かない可能性がある。

**ただし**: 生成が起きている時点で userEditSeq が +1 されており、Realtime で seqAtLastRemoteLoad が userEditSeq (= 生成後の値) に追いつくには、Realtime が同じタイミングで同じ値を読む必要がある。

**現時点での評価**: **静的解析では確認不可。実行時の seqAtLastRemoteLoad の値が分からない。**

---

### 第2位: STOP-E — 年月不一致による保存キャンセル（偽陽性で 'saved'）

**条件**: 1秒のタイマー待機中にユーザーが月を切り替えた場合

**コード根拠（L7399–7405）**:
```javascript
if (year !== yearRef.current || month !== monthRef.current) {
  setSaveStatus('saved');  // 保存なしで 'saved'
  return;
}
```

- `year` / `month` = クロージャ値（エフェクト発火時の値）
- `yearRef.current` / `monthRef.current` = タイマー発火時の最新値

7月のシフトを生成 → 1秒以内に6月に戻す → タイマー発火時: 7 !== 6 → キャンセル

**検索キーが `shifts_2026_7_kaigo1` であることから**: ユーザーは7月のシフトを生成しようとしている。もし管理画面が6月表示のまま生成ボタンを押すと、6月のシフトを生成 → クロージャ month=5（6月） → タイマー発火時 monthRef = 5（変化なし） → 問題なし。

7月を選んで生成し、その後6月に切り替えた場合にはキャンセルが発生する可能性あり。

---

### 第3位: STOP-G — JWT 認証エラーによる完全中断

**条件**: Supabase セッションの有効期限切れ

**コード根拠（L7421–7425）**:
```javascript
if (error.code === "PGRST301" || error.message?.includes("JWT") || error.message?.includes("token")) {
  alert("セッションが切れました。再ログインしてください。");
  await supabase.auth.signOut();
  return;  // ← for ループから return = 全部署の保存が中断
}
```

→ ログアウトダイアログが表示される。ユーザーが報告していないなら可能性は低い。

---

### 第4位: STOP-H — upsert の実行は成功するが RLS ポリシーで弾かれる

**条件**: Supabase の Row Level Security が upsert を拒否する場合

→ error が返る → `saveStatus = 'unsaved'`。ユーザーが「未保存」に気付かない可能性がある。

---

### 第5位: Fix S-1 の deptIdsToSave が空（STOP-F）

**条件**: `dirtyDeptIdsRef.current` と `closureDeptId` が両方未登録

Fix S-1 適用後（L8227, L7395 で必ず追加）、通常は発生しない。ただし理論上:
- L8227 の `add(cd.id)` が実行されない（コードには到達している）
- L7395 の `add(closureDeptId)` が実行されない（save effect がガードで弾かれた後）

→ 現時点では可能性は低い。

---

## 静的解析の限界

以下は **コードを読んだだけでは確認不可能** な項目:

| 確認項目 | 理由 |
|---|---|
| ガード③（seqAtLastRemoteLoad 比較）が発火しているか | 実行時の Ref 値が分からない |
| upsert が呼ばれているか | 静的解析では実行パスの分岐先が不明 |
| upsert の戻り値 | Supabase の実行時状態が不明 |
| Realtime の発火タイミング | 非同期・環境依存 |
| ガード⑤（年月不一致）が発火しているか | ユーザーの操作順序が不明 |

---

## まとめ

| 段階 | 状態 | 根拠 |
|---|---|---|
| 生成直後 `allShifts[cd.id]` | ✅ シフトデータあり | L8228 |
| `dirtyDeptIdsRef.add(cd.id)` | ✅ 登録される（Fix S-1適用後） | L8227 |
| 保存タイマー起動 | ⚠️ 未確認（3つのガードを通過する必要あり） | L7382, L7383, L7386 |
| supabase.upsert() 呼び出し | ⚠️ 未確認（4つのガードを通過する必要あり） | L7397, L7399, L7408, L7415 |
| upsert 成功 | ❌ 0件（確認済） | 診断画面 |

**根本原因候補（第1位）**: 保存エフェクトの `userEditSeq === seqAtLastRemoteLoad` 判定（STOP-C）が偽陽性（保存なし）で 'saved' を返している可能性が最も高い。ただし静的解析では確定不可。

**次のアクション（静的解析の限界）**: 実行時の動作確認なしでは、どのガードで止まっているかを特定することは不可能。
ユーザーが見ている画面の `saveStatus` 表示（「保存済」「未保存」）を確認することで、STOP-C/E（偽陽性で'saved'）かSTOP-H（upsertエラーで'unsaved'）かの切り分けが可能。
