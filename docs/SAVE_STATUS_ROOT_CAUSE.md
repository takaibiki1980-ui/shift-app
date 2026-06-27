# SAVE_STATUS_ROOT_CAUSE.md
# 「保存済み」表示 ≠ Supabase 保存 原因特定レポート

調査日: 2026-06-27  
調査対象: `/home/user/shift-app/src/App.jsx`  
確認された事実: 管理画面「保存済み」表示 / ShiftViewPortal 診断「0件」  
制約: 実装禁止・コード変更禁止・推測禁止

---

## 現在フェーズ・残りフェーズ・生成結果

| 項目 | 内容 |
|---|---|
| 現在フェーズ | 原因確定フェーズ |
| 最終目標まで残りフェーズ | 修正 → 動作確認 の2フェーズ |
| 今回で生成結果が変わるか | 変わらない（調査のみ） |

---

## ① supabase.upsert() は生成後に必ず呼ばれる設計か

**いいえ。必ず呼ばれる設計ではない。**

`supabase.upsert()` が到達するまでには 5 つのガードがある（コード根拠は後述）。いずれかのガードが `return` すれば upsert は実行されない。

---

## ② `setSaveStatus("saved")` に到達する全経路（コード根拠付き）

| # | 行 | 経路名 | upsert の実行 |
|---|---|---|---|
| A | L7387 | **seqチェック早期リターン** | **なし（偽陽性）** |
| B | L7404 | **年月不一致早期リターン** | **なし（偽陽性）** |
| C | L7458 | メイン保存成功 | あり ✅ |
| D | L7317 | 緊急保存（月切替）成功 | あり ✅ |
| E | L7474 | 5回失敗→ロールバック確認 | なし |
| F | L8517 | 復元モーダルからの復元 | なし |

通常の生成操作で到達しうる経路: **A、B、C** の3つ。

---

## ③ upsert 成功後のみ "saved" になるのか

**いいえ。upsert なしで "saved" になる経路 A と B が存在する。**

### 経路 A（L7387）— seqチェック早期リターン

```javascript
// L7386–7389: 保存エフェクト内（upsert より手前）
if (userEditSeq.current === seqAtLastRemoteLoad.current) {
  setSaveStatus('saved');   // ← upsert なしで 'saved'
  return;
}
// ↑ この return より下に upsert がある
```

`userEditSeq.current`（生成/編集のたびにインクリメント）が `seqAtLastRemoteLoad.current`（Realtime 受信時に userEditSeq に追いつく）と等しければ、**保存タイマーを設定せずに "saved" を返す。**

### 経路 B（L7404）— 年月不一致早期リターン

```javascript
// L7399–7405: 保存タイマー内（upsert より手前）
if (year !== yearRef.current || month !== monthRef.current) {
  setSaveStatus('saved');   // ← upsert なしで 'saved'
  return;
}
// ↑ この return より下に upsert がある
```

保存タイマー（1秒デバウンス）が発火した時点で、クロージャの year/month と現在の year/month が不一致なら、**upsert を実行せずに "saved" を返す。**

---

## ④ "saved" 表示だが upsert が1回も実行されない経路が存在するか

**存在する。経路 A（L7387）が最有力。**

経路 A が発火する条件:

```
userEditSeq.current === seqAtLastRemoteLoad.current
```

この等式が成立するのは、`seqAtLastRemoteLoad` が `userEditSeq` の現在値に更新された後。

### seqAtLastRemoteLoad が更新される箇所（全2か所）

```javascript
// L7149: reloadFromRemote() → setAllShifts updater 内
seqAtLastRemoteLoad.current = userEditSeq.current;

// L7175: reloadFromRemote() → legacy key 処理時
seqAtLastRemoteLoad.current = userEditSeq.current;
```

`reloadFromRemote()` は以下のタイミングで呼ばれる:
1. Realtime チャンネルが `shifts_*` の変更を検知 → `debouncedReload()` → 500ms 後
2. タブを離れて戻ったとき（visibility change）
3. 5回失敗ロールバックのロールバック後

---

## ⑤ "saved" 表示 + upsert 未実行 の具体的経路（if/return の特定）

### 経路 A（L7387）の詳細フロー

```
【事前条件】
Realtime が発火（他デバイスの保存または自身の前回保存のエコー）
 → reloadFromRemote() 起動
 → seqAtLastRemoteLoad.current = userEditSeq.current（例: 0）
    ※ userEditSeq = 0（まだ生成前）

【生成実行】
 L7917: userEditSeq.current++   （例: 1）
 L7918: saveStatusRef.current = "unsaved"
 L8227: dirtyDeptIdsRef.current.add('kaigo1')
 L8228: setAllShifts({kaigo1: result})   ← allShifts 変化 → 保存エフェクト発火

【保存エフェクト（L7380）発火】
 L7382: !dbInitialized.current → false → 通過
 L7383: isLoadingMonth.current → false → 通過
 L7386: userEditSeq.current(1) === seqAtLastRemoteLoad.current(?)

 ★ここで seqAtLastRemoteLoad が 1 なら → setSaveStatus('saved'); return; ★

```

**seqAtLastRemoteLoad が 1 になる条件**:

`reloadFromRemote()` が `userEditSeq++ (= 1)` の後 に開始し、かつ `seqAtLastRemoteLoad = 1` を設定した場合。

ただし `reloadFromRemote()` は L7077 でブロックされる:

```javascript
// L7077
if (saveStatusRef.current === 'unsaved') {
  return;
}
```

生成時に `saveStatusRef.current = "unsaved"` が L7918 でセットされるため、**生成後は reloadFromRemote がブロックされる**。

しかし `saveStatusRef.current` の同期更新は L6954 の useEffect 経由でも行われる:

```javascript
// L6953–6954
const saveStatusRef = useRef("saved");
useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
```

`setSaveStatus("saved")` が呼ばれると、次のレンダー後のこの Effect で `saveStatusRef.current = "saved"` になる。このタイミングで Realtime が発火すれば、`reloadFromRemote()` がブロックされず実行される。

---

### 根本原因：seqAtLastRemoteLoad の更新とエフェクト発火の競合

**確定した事実のみのフロー（コード根拠付き）**:

```
Step 1: 初回起動
  userEditSeq.current = 0（L6965 初期値）
  seqAtLastRemoteLoad.current = -1（L6968 初期値）
  saveStatus = "saved"（L6952 初期値）
  saveStatusRef.current = "saved"（L6953 初期値）

Step 2: 初回 Realtime or visibility 発火
  reloadFromRemote() 起動
  saveStatusRef.current === 'saved' → ブロックされない（L7077）
  seqAtStart = 0（L7091）
  Supabase fetch...
  userEditSeq.current(0) === seqAtStart(0) → 通過（L7147）
  seqAtLastRemoteLoad.current = 0（L7149）  ← ★ -1 → 0 に更新

Step 3: シフト生成
  L7917: userEditSeq.current = 1
  L7918: saveStatusRef.current = "unsaved"（Ref 同期更新）
  L8237: setSaveStatus("unsaved")（React 状態更新 → 次レンダーで Ref 追従）

Step 4: 保存エフェクト発火（allShifts 変化）
  L7386: userEditSeq.current(1) === seqAtLastRemoteLoad.current(0)?
         → 1 ≠ 0 → 通過 ✓ → 保存タイマーセット

  ← ここまでは正常。1秒後のタイマーが upsert を実行する。

Step 5: タイマー発火前（<1秒）に seqAtLastRemoteLoad が 1 に更新される場合

  【発生条件】
  - saveStatusRef.current が "saved" に戻るタイミングで reloadFromRemote() が起動
  - saveStatusRef.current は setSaveStatus("saved") 後、次レンダーの L6954 Effect で "saved" になる
  - これが起きるのは「前回の保存済み状態が正しく Ref に反映された後」

  reloadFromRemote():
    seqAtStart = 1（userEditSeq.current）
    Supabase fetch → 完了
    userEditSeq.current(1) === seqAtStart(1) → 通過
    seqAtLastRemoteLoad.current = 1 ← ★ 1 に更新

Step 6: 保存タイマー発火前に 保存エフェクトが再発火
  （allShifts が reloadFromRemote により更新されたため）
  L7386: userEditSeq.current(1) === seqAtLastRemoteLoad.current(1)
         → 1 === 1 → ★ setSaveStatus('saved'); return ★

  → upsert は実行されない
  → 管理画面「保存済み」表示
  → Supabase に 0件
```

---

## 結論

### upsert が実行されない経路の特定

**L7386（if 文）+ L7387（setSaveStatus + return）が root cause。**

```javascript
// L7386–7389 ← ここが止まる
if (userEditSeq.current === seqAtLastRemoteLoad.current) {
  setSaveStatus('saved');  // ← "saved" 表示
  return;                  // ← upsert に到達しない
}
```

### 発生条件（コード根拠付き）

1. 生成後 1秒以内に `reloadFromRemote()` が実行される（L7073）
2. `reloadFromRemote()` が `seqAtLastRemoteLoad.current = userEditSeq.current` を設定する（L7149）
3. `setAllShifts(reloaded data)` → 保存エフェクトが再発火（dep: allShifts 変化）
4. `userEditSeq(1) === seqAtLastRemoteLoad(1)` → `setSaveStatus('saved'); return`

### なぜ reloadFromRemote が 1秒以内に起動するのか

以下のいずれかが条件:
- Realtime チャンネルが `shifts_*` キーの変更を受信 → `debouncedReload()` → 500ms 後（他デバイスの保存や過去のエコー）
- タブを切り替えて戻る（visibility change → L7193: `reloadFromRemote()` 即時）

### saveStatusRef の問題

`saveStatusRef.current = "saved"` への同期は L6954 の useEffect 経由:

```javascript
useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
```

この Effect は React レンダー後に非同期実行される。`setSaveStatus("saved")` 呼び出し直後、`saveStatusRef.current` はまだ "saved" に戻っていない場合があるが、Realtime の 500ms debounce 後（debouncedReload）ならば十分時間が経過しており、`saveStatusRef.current = "saved"` に戻っている。

---

## 修正方針（事実の提示のみ）

問題の核心は **L7386 の判定が「保存完了の確認」ではなく「変更なしの判定」として機能しているが、Realtime が生成後 1秒以内に seqAtLastRemoteLoad を更新するとこの判定が誤発火する**こと。

修正すべきコード: **L7386–7389**

現在の判定:
```javascript
if (userEditSeq.current === seqAtLastRemoteLoad.current) {
  setSaveStatus('saved');
  return;
}
```

この判定は「Realtime 受信後にユーザー変更がなければ保存不要」という意図だが、**生成→Realtime→再エフェクト発火の 1秒以内連鎖で誤発火する。**

---

## 5段階フロー最終版

| 段階 | 状態 | 根拠行 |
|---|---|---|
| 生成直後 `allShifts[cd.id]` | ✅ データあり | L8228 |
| dirtyDeptIdsRef 登録 | ✅ 登録される | L8227 |
| 保存エフェクト発火 | ✅ 発火する | allShifts 変化 |
| **L7386 seqチェック** | **⚠️ Realtime 次第で誤発火** | L7386–7389 |
| supabase.upsert() | **❌ 到達しない（L7386 return）** | — |
| 「保存済み」表示 | **❌ 偽陽性（upsert なし）** | L7387 |
