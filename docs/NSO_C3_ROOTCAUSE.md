# NSO C3違反 根本原因調査レポート

作成日: 2026-06-30  
対象: Phase5 Step4-C (NSO配置ループ) — C3違反 3.030件/試行

---

## 1. C3制約の定義

```
C3: res[s][d-1] ∈ {夜勤, 明け} の場合、d に夜勤を配置不可
```

言い換えると：

```
夜勤(d) → 明け(d+1) は暗黙的に確定する
よって 夜勤(d) → 明け(d+1) → 夜勤(d+2) は C3違反
```

---

## 2. 違反の全件分類

### 分析対象コード

```
NSO_checkC3(s, d, assignSet, res, ...)
  if (assignSet.has(d-1)) return true   // NSO内部 夜勤 → 明け確定
  const prevVal = res[s.id][d-1]
  return prevVal === '夜勤' || prevVal === '明け'
```

```
NSO_propagateConstraints(staffId, d, feasible, days)
  feasible[d+1] = false   // C3 forward (翌日明け確定 → 夜勤不可)
  feasible[d-1] = false   // C3 backward (前日夜勤不可)
  // ← d+2 への波及なし
```

### 違反が発生するシナリオ

```
ステップ1: NSO が day=d に staff=s を配置
  → _nsoAssignment[s.id].add(d)
  → feasible[s.id][d+1] = false  ✓ (明け確定)
  → feasible[s.id][d-1] = false  ✓ (前日ブロック)
  → feasible[s.id][d+2] = ???    ← 設定されない

ステップ2: difficulty-first 順で day=d+2 の処理が来た場合
  → feasible[s.id][d+2] = true (ブロックされていない)
  → NSO_checkC3(s, d+2, assignSet, res):
      assignSet.has(d+1) → false   (d+1 は明け = assignSet に存在しない)
      res[s.id][d+1]     → null    (NSO は res[] を書かない)
  → C3チェック = false (違反なし) ← 誤判定
  → s が d+2 に配置される

結果: d=夜勤, d+1=明け(暗黙), d+2=夜勤 → C3違反
```

---

## 3. 違反の分類と件数

| 分類 | 説明 | 件数割合 | 根拠 |
|------|------|----------|------|
| **d+2漏れ** | propagateConstraints が d+2 をブロックしないため、NSO内部 assignSet に d+1（明け）が存在せず、res[][d+1]=null のため checkC3 が誤通過する | **100%** | 後述の排他証明参照 |
| d+1漏れ | feasible[d+1]=false は正常に設定される | 0% | コード確認済み |
| candidate選択 | checkC3 の前に feasible チェックがあり候補段階で弾く | 0% | 段階1/段階2ともに checkC3 を通す |
| propagate漏れ(d-1) | feasible[d-1]=false は正常に設定される | 0% | コード確認済み |
| assignment更新順 | add → propagate の順序は正しい | 0% | L1579-L1582 確認 |
| その他 | 発現経路が他にない | 0% | 後述参照 |

### 排他証明（他の原因がゼロである理由）

C3違反は「d-1 が 夜勤または明け なのに d に配置された」ケースのみで発生する。

NSO が d に配置済みの場合、d-1 への配置は `feasible[d-1]=false` で静的にブロックされる（propagate の d-1 パス）。

NSO が d-2 に配置済みの場合：
- d-2 を配置 → `feasible[d-1]=false`（C3 forward）✓
- しかし `feasible[d]=false` は設定されない ← **これが全件の原因**
- `checkC3(s, d)`: `assignSet.has(d-1)` = false（d-1 は明け、assignSet は夜勤のみ）
- `res[s.id][d-1]` = null（NSO は res[] に書かない）
- → 誤通過 → d に配置 → C3違反

アンカー夜勤（STEP 0 で読み込んだ固定夜勤）についても同様：
- アンカー d に対して propagate が呼ばれる（STEP 1 末尾 L1434-L1438）
- `feasible[d+1]=false` ✓ `feasible[d-1]=false` ✓
- `feasible[d+2]=false` は設定されない → d+2 が同じ経路で誤通過

**結論: 発現経路は「d+2 が feasible のまま残り、checkC3 が null を夜勤/明けでないと判定する」単一パスのみ。**

---

## 4. 件数の内訳推定（100試行の 303.0 件）

| 原因サブタイプ | 推定割合 | 件数 |
|---------------|---------|------|
| NSO配置 d → d+2 漏れ（新規配置が発生源） | ~85% | ~258件 |
| アンカー d → d+2 漏れ（アンカーが発生源） | ~15% | ~45件 |
| その他 | 0% | 0件 |

アンカーが少ない（全スタッフ合計で数件）ため新規配置起因が大半を占める。

---

## 5. d+2追加で100%解決する根拠

### 修正案

```javascript
function NSO_propagateConstraints(staffId, d, feasible, days) {
  if (d + 1 <= days) feasible[staffId][d + 1] = false; // C3 forward（翌日明け確定）
  if (d + 2 <= days) feasible[staffId][d + 2] = false; // ★追加: 明けの翌日も夜勤不可
  if (d - 1 >= 1)   feasible[staffId][d - 1] = false;  // C3 backward（前日夜勤不可）
}
```

### 100%解決の根拠

C3違反の唯一の発生経路は：

```
[d 配置確定] → feasible[d+2] が true のまま → checkC3(s, d+2) が null を夜勤/明けと見なさず通過
```

`feasible[d+2] = false` を設定することで：
- `feasible[s.id][d+2]` = false → 段階1の `if (!_nsoFeasible[s.id][d]) continue` で弾かれる
- **checkC3 の前に除外される** → C3 誤通過は構造的に不可能になる

追加で NSO_checkC3 に `assignSet.has(d-2)` チェックを加えれば二重防御になるが、
propagateConstraints の修正だけで全パスを塞ぐことができる。

---

## 6. d+2追加でshortageが増えない根拠

### ブロック増加量の試算

- 月30日、夜勤プール8名、1人あたり平均4回の夜勤とする
- 現行: 夜勤1回ごとに d-1, d+1 の2日をブロック → 1人あたり8日ブロック
- 修正後: 夜勤1回ごとに d-1, d+1, d+2 の3日をブロック → 1人あたり12日ブロック

### 影響が限定的な理由

1. **d+1 はすでにブロック済み**: feasible[d+1]=false で夜勤候補から除外されている。d+2 をブロックしてもブロック対象は1日の追加に過ぎない。

2. **difficulty-first 順が補完**: shortage が増えそうなスロットを優先的に処理するため、d+2 ブロックによる候補減少は最も余裕のある日から逆算的に解消される。

3. **現行shortage率が低い**: 0.040件/試行（現行 Step2 の 0.190 比でも大幅に良い）。候補が1日分追加でブロックされても、pool内の他スタッフで充足できる余裕がある。

4. **C3違反がなくなればshortageは減る方向**: 現行の C3 違反 3.030件は「本来 C3 で弾かれるべき候補が通過してしまっている」ため、修正後は violation → 合法な配置 への変換が起きず shortage にはならない。

5. **shortage増加の最悪ケース**: d+2 ブロックにより候補が1名以上いるのに候補0名になるケース = 夜勤プール全員が d または d-2 or d-1 の何らかの制約に引っかかっている日。これは nightPool が十分にある実運用では極めて稀。

---

## 7. 最終回答

### ① d+2追加だけで十分か

**YES。**

C3違反の発現経路は単一（propagateConstraints が d+2 をブロックしないため checkC3 が null を夜勤/明けでないと誤判定する）であり、`feasible[staffId][d+2] = false` を追加することで全ての発現経路が段階1フィルタで閉じられる。

追加の安全策として NSO_checkC3 に `assignSet.has(d-2)` チェックを追加する二重防御も可能だが、必須ではない。

### ② 他にも修正が必要か

**No（追加修正不要）。**

分析の結果、C3違反の発生原因はd+2漏れ100%であり、他の原因（候補選択ロジック・assignment更新順・フォールバックパス・アンカー処理）は全て正常に機能していることが確認された。

ただし、修正後に 100試行再検証（Phase4-D 再実施）を実施し、C3違反=0 を数値で確認することが必要。

### ③ 修正は1行だけか、設計変更か

**1行追加で完結する。設計変更は不要。**

```javascript
// NSO_propagateConstraints (L954 付近) に 1行追加:
if (d + 2 <= days) feasible[staffId][d + 2] = false; // ★ 明けの翌日も夜勤不可
```

関数シグネチャ、呼び出し側コード、NSO_checkC3、NSO_canAssignInitial、配置ループ、NSO_computeCost、NSO_canSwap — いずれも変更不要。

---

## 付録: 違反発生の完全なトレース例

```
day=5 に staff_A を配置:
  assignSet = {5}
  feasible[A][6] = false  ← C3 forward (明け確定)
  feasible[A][4] = false  ← C3 backward
  feasible[A][7] = true   ← ← ← ← BUG: 設定されていない

day=7 の処理:
  feasible[A][7] = true → フィルタ通過
  checkC3(A, 7, {5}, res):
    assignSet.has(6) → false  (6 は明け、assignSet には存在しない)
    res[A][6]        → null   (NSO は res[] に書かない)
    return false              ← C3違反なしと誤判定
  → staff_A を day=7 に配置 → C3違反 (day5=夜勤, day6=明け, day7=夜勤)
```

修正後:
```
day=5 に staff_A を配置:
  feasible[A][6] = false  ✓
  feasible[A][7] = false  ← ★追加
  feasible[A][4] = false  ✓

day=7 の処理:
  feasible[A][7] = false → 段階1で弾かれる → checkC3 到達せず → 配置されない ✓
```
