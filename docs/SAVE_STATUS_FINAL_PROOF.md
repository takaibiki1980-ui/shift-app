# SAVE_STATUS_FINAL_PROOF.md
# 保存処理 根本原因最終確定レポート

調査日: 2026-06-27
調査対象: `/home/user/shift-app/src/App.jsx`
症状: 管理画面「保存済み」表示 / ShiftViewPortal 診断「0件」
制約: 実装禁止・コード変更禁止・推測禁止・事実確認のみ

---

## 重要訂正（前回ドキュメントからの修正）

`docs/SAVE_STATUS_ROOT_CAUSE.md` で「L7386 が reloadFromRemote 経由でtrueになる」と記載したが、
本書の精密解析により **L7386 は通常の生成フローでは発火しない** ことが判明した。
根本原因は **L7386 ではなく L7386 の前段階（L7383: isLoadingMonth guard）** にある。
詳細は以下 ⑥ に記載。

---

## ① L7386 が実際に true になる実行経路が存在するか

**存在する。ただし通常の生成フローでは発生しない。**

### L7386 が true になる唯一の前提条件

```javascript
// L7386
if (userEditSeq.current === seqAtLastRemoteLoad.current) {
```

`seqAtLastRemoteLoad` は `reloadFromRemote()` 内のみで更新される（後述③参照）。
`reloadFromRemote()` は以下のガードを通過した場合のみ実行される:

```javascript
// L7077
if (saveStatusRef.current === 'unsaved') {
  return;  // ← 生成後は常にここでブロック
}
```

### 生成後の saveStatusRef.current の状態

```javascript
// L7917–7918: handleGenerate 内（setAllShifts より前、同期実行）
userEditSeq.current++;                 // L7917: 同期・即時
saveStatusRef.current = "unsaved";     // L7918: 同期・即時
```

JavaScript はシングルスレッド。L7918 が実行された後、
Realtime コールバック・visibilitychange は次のイベントループまで実行されない。
よって **生成後は必ず `saveStatusRef.current = "unsaved"` が設定済みである。**

### 結論①

| 経路 | L7386 true になるか | 理由 |
|---|---|---|
| **通常生成後の Realtime** | **ならない** | L7918 → saveStatusRef="unsaved" → L7077 でブロック |
| **通常生成後の visibilitychange** | **ならない** | 同上 |
| **保存完了後（setSaveStatus("saved")後）の Realtime** | なる可能性あり | saveStatusRef が "saved" に戻った後 |
| **dbInitialized=false の状態** | 無関係（L7382 で先にブロック） | — |

---

## ② userEditSeq.current の値変化 時系列追跡

### 初期値

```javascript
// L6965
const userEditSeq = useRef(0);          // 初期値: 0
const seqAtLastRemoteLoad = useRef(-1); // 初期値: -1（L6968）
```

### 値変化の全タイムライン（シフト生成の場合）

```
T=0ms   アプリ起動
        userEditSeq.current = 0
        seqAtLastRemoteLoad.current = -1

T=init  初回 reloadFromRemote() 実行（dbLoading=false 後）
        → L7091: seqAtStart = 0
        → Supabase fetch 完了
        → L7147: userEditSeq(0) === seqAtStart(0) → 通過
        → L7149: seqAtLastRemoteLoad.current = 0  ← -1→0 に更新

T=gen   シフト生成ボタン押下（handleGenerate）
        → L7917: userEditSeq.current = 1  ← 0→1 にインクリメント（同期）
        → L7918: saveStatusRef.current = "unsaved"  ← 同期

T=gen+  setAllShifts({ [cd.id]: result }) → React キュー

T=eff   保存エフェクト発火（allShifts dep 変化）
        → L7382: dbInitialized.current = true → 通過
        → L7383: isLoadingMonth.current = false → 通過
        → L7386: userEditSeq(1) === seqAtLastRemoteLoad(0)?
                  1 ≠ 0 → false → 通過  ✓
        → L7390: saveStatusRef.current = "unsaved"（再セット）
        → L7391: setSaveStatus("unsaved")
        → L7396: setTimeout(1000ms) セット

T=eff+1000ms  保存タイマー発火 → upsert 実行（通常経路）
              → setSaveStatus("saved")（L7458）

★ 問題が起きる場合は T=eff と T=eff+1000ms の間に isLoadingMonth が介在する ★
```

---

## ③ seqAtLastRemoteLoad.current がいつ・どこで・何を契機に更新されるか

### 更新箇所（全2か所・コード根拠付き）

```javascript
// L7149: reloadFromRemote → setAllShifts updater 内（通常パス）
seqAtLastRemoteLoad.current = userEditSeq.current;

// L7175: reloadFromRemote → legacy key 処理時
seqAtLastRemoteLoad.current = userEditSeq.current;
```

**重要**: seqAtLastRemoteLoad は `reloadFromRemote()` 内のみで更新される。
他のコードパスからの更新は存在しない。

### reloadFromRemote() が呼ばれる契機（全3か所）

```javascript
// A: visibilitychange（L7193）
const onVisibility = () => { if (!document.hidden) reloadFromRemote(); };

// B: debouncedReload（L7228–7231）→ Realtime 受信後500ms
reloadDebounceTimer = setTimeout(() => { reloadFromRemote(); }, 500);

// C: 5回失敗ロールバック後（別箇所）
```

### reloadFromRemote の内部シーケンスガード

```javascript
// L7091: fetch開始時のseqを記録
const seqAtStart = userEditSeq.current;

// L7100: fetch中にユーザー編集があればキャンセル
if (userEditSeq.current !== seqAtStart) return;

// L7147: setAllShifts updater 内でも再チェック
if (userEditSeq.current !== seqAtStart) return prev;

// L7149: 全ガード通過後のみ更新
seqAtLastRemoteLoad.current = userEditSeq.current;
```

---

## ④ reloadFromRemote / Realtime / visibilitychange のどれが今回の保存失敗に関与するか

### 各経路の関与分析

| 経路 | 関与するか | 理由 |
|---|---|---|
| **通常生成後 Realtime (debouncedReload)** | **しない** | L7918 → saveStatusRef="unsaved" → L7077 でブロック |
| **通常生成後 visibilitychange** | **しない** | 同上（タブ切替操作がなければ発火しない） |
| **保存完了後 Realtime** | する | saveStatusRef が "saved" に戻った後は通過する |

### 今回の保存失敗に最も関与する経路

**経路なし（Realtime/visibilitychange は生成後にブロックされる）**

生成後 1000ms の保存タイマー期間中は:
- `saveStatusRef.current = "unsaved"` → reloadFromRemote をブロック
- seqAtLastRemoteLoad は更新されない
- L7386 は false のまま → 保存タイマーは正常に発火するはず

---

## ⑤ L7386 → return まで到達した場合、upsert は 100% 呼ばれないことをコードフローで証明

L7386 が true の場合のフロー（コード根拠付き完全追跡）:

```javascript
// 保存エフェクト（L7380）
useEffect(() => {
  if (!dbInitialized.current) return;                  // L7382: ガード
  if (isLoadingMonth.current) return;                  // L7383: ガード

  if (userEditSeq.current === seqAtLastRemoteLoad.current) {  // L7386: true
    setSaveStatus('saved');   // L7387: "saved" 表示
    return;                   // L7388: ← ここで return
  }
  // L7389 以降のコードは一切実行されない:
  // L7390: saveStatusRef.current = "unsaved";   ← 未到達
  // L7391: setSaveStatus("unsaved");             ← 未到達
  // L7392: clearTimeout(saveTimer.current);      ← 未到達
  // L7394: closureDeptId = ...;                  ← 未到達
  // L7396: saveTimer.current = setTimeout(async () => {  ← 未到達
  //   ...
  //   supabase.from('shift_data').upsert(...)    // L7415: 未到達
  //   ...
  //   setSaveStatus("saved");                    // L7458: 未到達
  // }, 1000);
}, [allShifts, year, month, ...]);
```

**証明**: L7388 の `return` 以降のコードは JavaScript の実行モデル上
絶対に実行されない。upsert は L7415 にのみ存在し、L7388 の return からは
コードフロー上到達不可能（dead code）。

**L7386 が true → upsert は 100% 実行されない。**

---

## ⑥ 今回の不具合を L7386 だけで 100% 説明できるか

**できない。L7386 は通常の生成フローでは発火しない。**

### 実際の根本原因候補

#### 候補 X: L7383（isLoadingMonth guard）— 最有力

```javascript
// L7383
if (isLoadingMonth.current) return;
```

```javascript
// reloadFromRemote 内（L7132–7133）
if (deptShiftEntries.length > 0) {
  isLoadingMonth.current = true;  // ← setAllShifts 前に true にセット
  // ...
  setAllShifts(prev => { ... });
  setTimeout(() => { isLoadingMonth.current = false; }, 100);  // L7168: 100ms後に解除
}
```

**発火する経路**:

```
T=0:    初回 reloadFromRemote() 実行
        → deptShiftEntries.length > 0（過去のシフトデータが Supabase にある場合）
        → isLoadingMonth.current = true
        → setAllShifts(prev => { ... seqAtLastRemoteLoad.current = 0 ... })
        → setTimeout(100ms) → isLoadingMonth = false

T=100ms: isLoadingMonth = false

T=gen:  生成実行
        → userEditSeq.current = 1
        → saveStatusRef.current = "unsaved"
        → setAllShifts({ [cd.id]: result })

T=eff:  保存エフェクト発火
        → L7382: dbInitialized = true → 通過
        → L7383: isLoadingMonth.current = ???
```

**問題**: `reloadFromRemote` が生成の setAllShifts と並行して走っている場合、
`isLoadingMonth.current = true` の状態で生成後の setAllShifts が発火すると、
**保存エフェクトは L7383 で return される。**

```
保存エフェクト発火（isLoadingMonth = true）
→ L7383: return  ← 保存タイマーがセットされない
→ 100ms後: isLoadingMonth = false
→ 保存エフェクトは再発火しない（allShifts dep は変化していない）
→ upsert 未実行
→ setSaveStatus("unsaved") も呼ばれない
→ 画面は何も変化しない
```

**しかし**: この経路では `setSaveStatus("saved")` も呼ばれないため、
「保存済み」表示にならない。ユーザー症状（「保存済み表示」）と矛盾する。

#### 候補 Y: 初回 reloadFromRemote が生成前に完了 → L7386 が true になる経路

```
T=init:  reloadFromRemote() 完了
         seqAtLastRemoteLoad.current = 0（userEditSeq = 0 の時点）

T=gen:   userEditSeq.current = 1（L7917）
         saveStatusRef.current = "unsaved"（L7918）
         setAllShifts({ kaigo1: result })

T=eff:   保存エフェクト発火
         L7386: userEditSeq(1) === seqAtLastRemoteLoad(0)? → 1 ≠ 0 → false → 通過 ✓
         L7396: setTimeout(1000ms) セット

T=eff+1000ms: タイマー発火
         L7399: year === yearRef.current && month === monthRef.current? → 通過
         L7415: upsert 実行
         L7458: setSaveStatus("saved")  ✓
```

この経路は正常動作。L7386 は false になる。

#### 候補 Z: 保存タイマー内でのエラー（JWT / 認証切れ）

```javascript
// L7421–7425
if (error.code === "PGRST301" || error.message?.includes("JWT") ...) {
  alert("セッションが切れました。再ログインしてください。");
  await supabase.auth.signOut();
  return;  // ← setSaveStatus が呼ばれない
}
```

認証エラーの場合、`setSaveStatus` が呼ばれずに `return` する。
ただし `alert` が表示されるため、ユーザー症状（アラートなし）と矛盾する可能性がある。

---

## 最終まとめ

### 6つの確認事項への回答

| # | 確認事項 | 回答 |
|---|---|---|
| ① | L7386 が実際に true になる実行経路が存在するか | **存在するが通常の生成フローでは発火しない** |
| ② | userEditSeq.current の値変化 時系列 | 初期0 → 生成時に+1（同期・L7917）→ 以降変化なし |
| ③ | seqAtLastRemoteLoad がいつ・どこで更新されるか | reloadFromRemote() 内 L7149 / L7175 のみ |
| ④ | reloadFromRemote/Realtime/visibilitychange のどれが関与するか | **生成後はいずれも L7077 でブロックされる** |
| ⑤ | L7386→return で upsert は 100% 呼ばれないか | **100% 呼ばれない（L7388 return 以降は dead code）** |
| ⑥ | L7386 だけで 100% 説明できるか | **できない（通常フローでは L7386 は発火しない）** |

### 静的解析の限界

本調査はコード静的解析のみによる。「保存済み表示 + Supabase 0件」を
静的解析のみで 100% 特定することは不可能。以下が不明のまま:

1. **実際の isLoadingMonth.current の値**（生成時点）
2. **初回 reloadFromRemote のタイミング**（dbInitialized フラグ設定との前後関係）
3. **Supabase の実際の応答**（upsert が実際に呼ばれたか）

### 推奨アクション

1. **ブラウザコンソールで `[save] Supabase保存OK:` ログを確認**（L7430）
   - 表示される → upsert は実行された → 別の原因
   - 表示されない → upsert 未実行 → 保存エフェクトが L7382/L7383/L7386/L7399 でブロックされている
2. **`[save] Supabase保存OK:` が出ない場合、以降の絞り込みが必要**

### Fix S-1 との関係

Fix S-1（dirtyDeptIdsRef による全部署保存ループ）は「**正しい部署に正しいデータを保存する**」修正。
しかし保存エフェクト自体が L7382–L7405 のいずれかで `return` される場合、
Fix S-1 の保存ループにも到達しない。
Fix S-1 は原因ではなく、**「到達できれば正しく保存する」改善**である。

---

調査者注: 本書は静的解析の範囲内での最大限の事実確認。実行時ログなしでの 100% 断定は不可能。
