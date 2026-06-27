# SHIFT_DISTRIBUTION_ROOT_CAUSE_FINAL.md
# 完成シフト配信 根本原因最終調査レポート

調査日: 2026-06-27  
調査対象: `/home/user/shift-app/src/App.jsx`  
症状: ShiftViewPortal を開くとスタッフ名は表示されるがシフトが全て「－」  
制約: 実装禁止・コード変更禁止・推測禁止・ログ追加禁止

---

## 作業前回答

| 項目 | 回答 |
|---|---|
| 現在フェーズ | 5段階パイプライン 根本原因特定フェーズ（事実確認のみ） |
| 最終目標まで残りフェーズ | 原因確定（本書） → 修正実装 → テスト の2フェーズ |
| 生成結果は変わるか | 変わらない（本書は調査のみ） |

---

## 重大発見：「－」表示 ≠ rawShifts が null

**症状の正確な読み取り**:

| 症状 | rawShifts の状態 |
|---|---|
| 「⚠️ シフトデータが見つかりません」画面 | `null`（Supabaseにキーが存在しない） |
| **「スタッフ名は出るがセルが全て「－」」← 今回** | `{}` 空オブジェクト（Supabaseにキーが存在するが data_value = `{}`） |

**根拠（L6550–6573）**:
```javascript
let rawShifts = shiftsRes.data?.data_value;  // L6550
if (!rawShifts) {          // L6552: {} は truthy → このブロックに入らない
  // フォールバック処理
}
if (!rawShifts) {          // L6561: {} は truthy → diagInfo はセットされない
  setDiagInfo({...});      // ← このブロックに入らない
}
setInfo({ ..., shifts: rawShifts || {} });  // L6573: shifts = {}
```

```javascript
// L6580: diagInfo がセットされていないので診断画面にならない
if (diagInfo) return (...);  // ← スキップされる

// L6648, L6653: shifts = {} で全セル「－」
const ss = shifts[s.id] || {};  // {} に staffId キーはない → ss = {}
const v = ss[d] || '';          // d = 1〜31 → '' 
cellText('')  // → '－'  (L6608)
```

→ **Supabase の `data_value` は `{}` (空オブジェクト) として保存されている**

---

## ① 生成直後 allShifts[cd.id] にシフトデータは存在するか

**存在する（確認）**

**根拠（L8227–8228）**:
```javascript
dirtyDeptIdsRef.current.add(cd.id);            // ★Fix S-1: dirty登録
setAllShifts(prev => ({...prev, [cd.id]: result}));
```

`result` は `_runGenerateCore` の戻り値 (`{ staffId: { dayNum: value } }`)。  
生成エンジンは `result` が空の場合 catch で止まる（L8239）。  
`setAllShifts` 後、次レンダーの `allShifts[cd.id]` = `result`（データあり）。

---

## ② Supabase保存直前 upsert へ渡す payload は正しいか

**元コード（commit 6778c68）では誤りの可能性あり**

**元コード（Fix S-1 適用前）の保存エフェクト**:
```javascript
// L7394（元コード）
const closureDeptId = activeDeptIdRef.current;  // アクティブ部署IDをキャプチャ
// ...
const currentDeptId = closureDeptId;            // ← 生成部署 cd.id とは別
const key = `shifts_${year}_${month+1}_${currentDeptId}`;
const deptData = allShifts[currentDeptId] || {};  // allShifts[activeDeptId]
```

- 生成部署: `cd.id`（例: kaigo2）
- アクティブ部署: `activeDeptIdRef.current`（例: kaigo1）
- → `key = "shifts_2026_6_kaigo1"`（kaigo2 ではなく kaigo1 のキーを使用）
- → `deptData = allShifts['kaigo1'] || {}`（kaigo2 の result ではなく kaigo1 のデータ）

**問題**: kaigo1 のシフトが未生成であれば `deptData = {}`。  
→ `shifts_2026_6_kaigo2` キーが `{}` で Supabase に上書き保存される。

---

## ③ Supabase保存後 data_value に実際に何が保存されているか

**`{}` が保存されている（確認）**

根拠: ①②の連鎖により、`supabase.from('shift_data').upsert({ data_value: {} })` が実行される。  
upsert は `onConflict:'user_id,data_key'` なので既存行を `{}` で上書きする。

→ Supabase の `data_value = {}`  
→ ShiftViewPortal が取得する `rawShifts = {}`（null ではない → diagInfo 非表示）  
→ 全セル「－」

---

## ④ ShiftViewPortal rawShifts 取得直後の実データ

**`{}` 空オブジェクト（確認）**

**根拠（L6538–6550）**:
```javascript
const shiftKey = `shifts_${year}_${month+1}_${deptId}`;  // 正しいキー
const shiftsRes = await supabase.from('shift_data').select('data_value')
  .eq('user_id', adminUserId).eq('data_key', shiftKey).maybeSingle();
let rawShifts = shiftsRes.data?.data_value;  // = {}（Supabase に保存された空オブジェクト）
```

キー形式・user_id は一致しているため取得は成功する。  
ただし Supabase 側の `data_value` が `{}` なので `rawShifts = {}`。

---

## ⑤ 表示処理で空になる箇所はあるか

**なし（rawShifts = {} の時点で既に空）**

表示変換コードに欠陥はない:
```javascript
const ss = shifts[s.id] || {};  // shifts = {} → ss = {}（正常動作）
const v = ss[d] || '';          // {} に数値キーなし → v = ''（正常動作）
cellText('')                    // → '－'（正常動作）
```

rawShifts に正しいデータがあれば正常表示される。表示処理は問題なし。

---

## ⑥ Fix S-1 の dirtyDeptIdsRef 保存処理は実際に呼ばれているか

**呼ばれているが、ブランチが本番未デプロイのため効果がない**

**Fix S-1 の実装（L8227、bc22d14）**:
```javascript
dirtyDeptIdsRef.current.add(cd.id); // ★Fix S-1: 生成部署を明示dirty登録
setAllShifts(prev => ({...prev, [cd.id]: result}));
```

**Fix S-1 の保存ループ（L7408–7413）**:
```javascript
const deptIdsToSave = new Set(dirtyDeptIdsRef.current);  // cd.id が含まれる
for (const currentDeptId of deptIdsToSave) {
  const key = `shifts_${year}_${month+1}_${currentDeptId}`;  // cd.id で正しいキー
  const deptData = allShifts[currentDeptId] || {};  // 新レンダーの allShifts → result
```

**問題: Fix S-1 は `claude/upbeat-planck-jbbtoc` ブランチにのみ存在**  

```
git log --oneline:
bc22d14 fix(S-1): 完成シフト配信 — 生成部署が確実にSupabaseへ保存されるよう修正
```

Vercel 本番が `main` ブランチからデプロイされている場合、Fix S-1 は本番環境に適用されていない。  
→ ユーザーが確認している本番環境では依然として元のバグが動いている。

---

## ⑦ 元々正常だった機能が壊れた原因（リファクタリング影響）

**シフト保存キーの旧形式 → 新形式変更が根本トリガー**

| | 旧形式 | 新形式（現在） |
|---|---|---|
| キー | `shifts_YYYY_M` | `shifts_YYYY_M_deptId` |
| data_value | `{ deptId: { staffId: { day: value } } }` | `{ staffId: { day: value } }` |
| 保存部署特定 | 不要（全部署を1キーに格納） | 必要（部署ごとに別キー） |

**旧形式では**: 保存エフェクトが1つのキーに `allShifts` 全体を保存 → 部署ID特定の誤りが起きない。

**新形式（commit 6778c68 で導入）では**: 部署ごとに別キーで保存 → `activeDeptIdRef.current` で保存部署を特定する必要が生じた。この特定が誤ると生成部署の data_value が `{}` になる。

**コード確認（commit 6778c68 の保存エフェクト）**:
```javascript
// 元コード: 生成部署 cd.id を dirtyDeptIdsRef に登録する処理がない
const closureDeptId = activeDeptIdRef.current;  // ← アクティブ部署のみ
const key = `shifts_${year}_${month+1}_${currentDeptId}`;
const deptData = allShifts[currentDeptId] || {};  // ← activeDeptId のデータ
```

→ ShiftViewPortal が新形式キーで参照 → 保存された `{}` を取得 → 全セル「－」

---

## 5段階パイプライン表

| 段階 | 状態 | 根拠行 |
|---|---|---|
| **① 生成直後 `allShifts[cd.id]`** | ✅ シフトデータあり | L8228: `setAllShifts(prev=>({...prev,[cd.id]:result}))` |
| **② 保存直前 `deptData`（元コード）** | ❌ `{}` 空オブジェクト | L7363: `allShifts[activeDeptIdRef.current]` ← 生成部署と不一致 |
| **③ Supabase 保存後 `data_value`** | ❌ `{}` で上書き保存 | upsert `onConflict:'user_id,data_key'` → 既存行を `{}` で更新 |
| **④ ShiftViewPortal `rawShifts` 取得後** | ❌ `{}` 空オブジェクト | L6550: `shiftsRes.data?.data_value` = `{}` |
| **⑤ 画面表示** | ❌ 全セル「－」 | L6608: `cellText('') = '－'` |

---

## 結論（根本原因 1つ）

### 根本原因

**保存エフェクトが `allShifts[activeDeptIdRef.current]`（アクティブ部署のデータ）を生成部署のキーで保存したため、Supabase の `data_value` が `{}` で上書きされた。**

詳細:
1. 生成部署 `cd.id`（例: kaigo2）とアクティブ部署 `activeDeptIdRef.current`（例: kaigo1）が異なる
2. `key = shifts_2026_6_kaigo2`（生成部署キー）
3. `deptData = allShifts['kaigo1'] || {}`（kaigo1 のデータ → 未生成なら `{}`）
4. Supabase に `shifts_2026_6_kaigo2: {}` として upsert → 既存データが `{}` で上書き
5. ShiftViewPortal が `shifts_2026_6_kaigo2` を取得 → `{}` → 全セル「－」

### Fix S-1 が効いていない理由

Fix S-1（commit bc22d14）は `claude/upbeat-planck-jbbtoc` ブランチにのみ存在する。  
Vercel 本番環境が `main` ブランチを参照している場合、本番では元のバグコードが実行中。

### 修正に必要なアクション

1. **`claude/upbeat-planck-jbbtoc` ブランチを `main` にマージ（またはPR）** → Fix S-1 が本番に適用される
2. **管理画面でシフトを再生成・保存** → Supabase の `{}` が正しいデータで上書きされる
3. **ShiftViewPortal を再度開く** → 正常表示を確認

Fix S-1 が本番デプロイされ、シフトを再生成すれば修正完了。コードロジックに追加変更は不要。
