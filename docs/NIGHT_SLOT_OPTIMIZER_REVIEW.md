# Night Slot Optimizer 最終設計レビュー
## Phase5 Step4

作成日: 2026-06-30  
対象: docs/NIGHT_SLOT_OPTIMIZER_DESIGN.md / src/App.jsx L1106-1241  
前提: Step2・Step3検証済み。コード変更なし。

---

## 0. 作業前回答

| 項目 | 回答 |
|------|------|
| 現在フェーズ | Phase5 Step4 Night Slot Optimizer 設計レビュー |
| Phase5進捗率 | 3/8ステップ完了（37.5%） |
| 今回で生成結果が変わるか | **変わらない**（レビューのみ・コード変更なし）|

---

## 1. 現在の夜勤配置アルゴリズムとの優位性比較

### 1-1. 設計思想の優位性（原則として認める）

| 観点 | 現方式（逐次貪欲） | NSO | 優位 |
|------|------------------|-----|------|
| 将来情報 | d=1から順に局所決定 | feasible matrix で全日可視化 | NSO ✅ |
| 目標値 | autoMax上限のみ | targetCount / targetFirst / targetSecond | NSO ✅ |
| 前後半制御 | halfCount二次キー（副作用あり）| targetFirst/Secondを事前設計 | NSO ✅ |
| shortage対処 | フォールバック（後付け）| difficulty-first（事前回避）| NSO ✅ |
| ロールバック | なし | hill-climbing でSwap/Move | NSO ✅ |

### 1-2. ただし kaigo1/2 での実測値を踏まえると

```
現方式 kaigo1: 夜勤回数σ=0.037（理論最小=0.000に近い）
NSO改善余地:   夜勤回数は既にほぼ上限。前後半偏差（0.854）が主な改善対象。
```

**数値上の改善余地は「前後半偏差の削減」にほぼ絞られる。**  
count equity をハード制約化する点は正しいが、現方式でも σ=0.037 は既に高水準。  
NSO が本当に優位と言えるのは「前後半偏差を副作用なしに改善できるか」次第。

---

## 2. 設計上の問題点（要修正）

### 【問題1】C3制約と困難日優先配置の根本矛盾 ★★★ 最重要

**C3制約（現コード L1196）**:
```javascript
if (["夜勤","明け"].includes(d === 1 ? prevShift(s.id) : res[s.id][d - 1])) return false;
```
C3は「前日 d-1 が夜勤/明けなら当日配置不可」。  
**前日 d-1 の状態は、d-1 が配置確定しているときに初めて確定する。**

設計書の STEP 3 では `dayOrder = sort(d) by difficulty ascending`（困難日優先）。  
例: `dayOrder = [15, 3, 22, 8, ...]`

```
d=15 を先に処理: res[s][14] はまだ未配置（d=14 は後から処理される）
                  → canAssignInitial(s, 15) でC3チェックが不正確
d=3  を次に処理: res[s][2]  はまだ未配置（d=2  は後から処理される）
                  → 同様に不正確
```

**結果**: feasible[s][d] を静的初期化（STEP 1）した後、困難日優先で配置すると  
C3 の判定が「前日が未配置」のまま行われ、誤った feasible 評価に基づいて配置される。

**propagateConstraints では C3 の「逆方向伝播」が必要**:
- d 日に s を配置した場合 → `feasible[s][d+1] = false`（d+1 を前日チェックで除外）
- しかし d+1 が dayOrder 上で既に処理済みの場合、この伝播は空振りする

**これは逐次貪欲と困難日優先の本質的競合であり、設計書には記載されていない。**

---

### 【問題2】アンカー配置済み夜勤が targetCount に含まれない

設計書 STEP 4 の assignment 初期化:
```javascript
nightPool.forEach(s => { assignment[s.id] = new Set(); });
```

Step1.5 でアンカー配置済みの夜勤（res[s.id][nightDay]="夜勤" 済み）が  
`assignment[s.id]` に反映されていない。

**結果**: targetCount の算出が「全スロット ÷ nightPool」だが、  
アンカー配置済み分を引かないため、NSO がアンカー配置スタッフに過剰配置する可能性がある。

**修正案**:
```javascript
// assignment 初期化時にアンカー配置済み夜勤を反映
nightPool.forEach(s => {
  const anchorNights = Object.entries(res[s.id])
    .filter(([, v]) => v === '夜勤').map(([d]) => Number(d));
  assignment[s.id] = new Set(anchorNights);
});
// targetCount は「残余スロット ÷ nightPool」で再計算
const remainingSlots = days * M - nightPool.reduce((acc, s) => acc + assignment[s.id].size, 0);
```

---

### 【問題3】lockedDays 追加動作が現行と異なる

**現行ステップ2（L1233-1238）**:
```javascript
res[s.id][d] = "夜勤";
if (d + 1 <= days) res[s.id][d + 1] = "明け";
if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
// lockedDays への追加なし ← ステップ2では追加しない
```

**設計書 2-7**:
```javascript
lockedDays[s.id].add(d);
if (d + 1 <= days) lockedDays[s.id].add(d + 1);
```

ステップ2の夜勤配置で `lockedDays.add(d)` を行うと、PassA 以降の処理が  
現行と異なる動作をする可能性がある。

**確認が必要な点**:
- PassA が `lockedDays` を参照して夜勤セルを保護しているか
- 現行は夜勤セルを lockedDays なしで PassA に渡し、PassA 内部で "夜勤" を判定して保護しているか

→ **実装前に PassA の夜勤保護ロジックを確認し、lockedDays 追加要否を判定すること**。

---

### 【問題4】canSwap / propagateConstraints が未定義

設計書 2-6 の疑似コードに以下の関数が呼ばれているが、定義がない:
- `canAssignInitial(s, d, lockedDays, prevShift, deptWork, days)` — 部分定義のみ
- `propagateConstraints(s.id, d, feasible, nightPool, days, deptWork)` — 未定義
- `canSwap(s1, s2, d1, d2, feasible, assignment)` — 未定義
- `computeCost(assignment, nightPool, days, halfMid, M)` — 未定義

**これら4関数の仕様が確定していないと実装できない。** 特に:
- `canSwap`: swap後の C3制約（隣接日との連鎖）を全方向チェックする必要
- `propagateConstraints`: C3の逆方向伝播をどのように処理するか

---

### 【問題5】dayOrder の一回計算による feasibility 陳腐化

STEP 3 で dayOrder を一度だけ計算するが、STEP 4 配置が進むと  
`propagateConstraints` により feasible が変化し、difficulty が動的に変動する。

当初「困難度3」だった日が配置後に「困難度1」になっても dayOrder は更新されない。  
→ fail-first 原則が配置中盤から機能しなくなる。

**対策**: dayOrder を動的更新する（配置ごとに再ソート）か、  
初期の feasible マトリクスが十分正確であることを仮定して「近似」として割り切るか。

---

## 3. 生成品質向上の期待根拠

| 改善項目 | 根拠 | 確度 |
|---------|------|------|
| 前後半偏差削減 | targetFirst/Second を事前設計し、困難日優先で逆算配置 | 高 ★★★ |
| count equity 維持 | targetCount をハード制約化（現方式は副作用あり）| 中 ★★（問題1,2が解消後）|
| shortage 削減 | difficulty-first で配置困難日を事前処理 | 中 ★★（問題1解消後）|
| 間隔均等 | スコアリング三次キーで引き続き考慮 | 中 ★★ |

**重要**: 問題1（C3と困難日優先の競合）が解消されない場合、  
difficulty-first の効果が相殺される可能性があり、shortage が現行より悪化するリスクがある。

---

## 4. 生成速度への影響

| 処理 | 演算数 | 時間見積 |
|------|--------|---------|
| feasible matrix 構築 | O(N×D) = 5×30 = 150 | < 0.01ms |
| dayOrder ソート | O(D log D) = 30×5 = 150 | < 0.01ms |
| 配置ループ（STEP 4）| O(D×N) = 30×5 = 150 | < 0.01ms |
| computeCost（hill-climbing×100）| O(100 × N×D) = 15,000 | < 0.5ms |
| **合計（NSO 1回）** | ～15,600演算 | **< 1ms** |
| **現方式ステップ2** | O(D×N×comparator) ≈ 4,500 | < 0.1ms |
| **bestOfN 30回への影響** | +30ms以内 | **許容範囲内** |

**結論**: 速度への影響は軽微。ただし hill-climbing 内の `computeCost` が  
Set のイテレーション（`[...assignment[a.id]]`）を繰り返す場合、  
100回×30試行×候補数でコスト増加する可能性あり。Array.from 等で最適化推奨。

---

## 5. メモリ使用量への影響

- feasible オブジェクト: N×D = 5×30 = 150 ブール値 → 無視できる
- assignment オブジェクト: N個の Set（各最大6要素）→ 無視できる
- dayOrder 配列: 30要素 → 無視できる

**総追加メモリ: < 1KB/試行。問題なし。**

---

## 6. 各エンジンとの整合性

### 6-1. RepairEngine との整合性 ✅（影響なし）

- RepairEngine は `res[]` の最終状態のみを参照
- NSO が `res[s.id][d]="夜勤"`, `res[s.id][d+1]="明け"`, `res[s.id][d+2]="休み"` を正確に書き込めば影響なし
- ただし lockedDays の扱い（問題3）が正確でないと RepairEngine が夜勤セルを意図せず変更するリスクあり

### 6-2. DiagnosticEngine への影響 ✅（影響なし）

- DiagnosticEngine は生成後の `res[]` を読み取るのみ
- NSO の出力が現方式と同じ `res[]` 形式であれば変更不要

### 6-3. LearningEngine への影響 ✅（影響なし）

- LearningEngine は承認されたシフトから学習するため、生成アルゴリズムの変更は無影響

### 6-4. PassA との整合性 ⚠️（要確認）

- PassA は lockedDays で保護された日を変更しない
- **問題3**で指摘の通り、NSO が `lockedDays.add(d)` を行う設計の場合、PassA の動作が変化
- 実装前に PassA の夜勤セル保護ロジックを確認すること

### 6-5. PassB・PassC との整合性 ✅（影響なし）

- PassB（明けシフト調整）・PassC（希望シフト確定）は夜勤配置後の処理
- res[] / lockedDays の書き込み形式が現行と同一であれば影響なし

---

## 7. 完全置換 vs 段階的移行

### 7-1. 完全置換のリスク

| リスク | 深刻度 |
|--------|--------|
| 問題1（C3×困難日優先の競合）が実装後に顕在化すると全体がデグレード | ★★★ 高 |
| 問題2（アンカー分の targetCount 誤算）で over/under 配置が発生 | ★★ 中 |
| canSwap・propagateConstraints の仕様が実装中に変化し設計が崩れる | ★★ 中 |
| 一括置換でデグレードしても切り戻しが大規模 | ★★★ 高 |

### 7-2. 段階的移行の優位性

各フェーズで「現行 vs 追加分」を独立検証でき、デグレード箇所の特定が容易。

---

## 8. 段階的実装計画（推奨）

### Phase4-A: 基盤関数の実装と単体検証

```
実装対象（新関数のみ追加、既存コード未変更）:
  canAssignInitial(s, d, lockedDays, prevShift, deptWork, days)
  propagateConstraints(s.id, d, feasible, nightPool, days)
  computeCost(assignment, nightPool, days, halfMid, M)
  canSwap(s1, s2, d1, d2, feasible, assignment, days)

検証: 上記4関数のユニットテスト（Node.js スクリプトで独立実行）
完了条件: canAssignInitial の出力が現行 canNight と等値（アンカー配置後の状態で比較）
```

**C3問題への対処をここで確定させる。**  
`canAssignInitial` は lockedDays / prevShift のみ（静的制約）を判定し、  
C3（前日夜勤）は assignment が確定した時点で `propagateConstraints` で後処理する設計にする。

### Phase4-B: feasible matrix + targetCount 構築

```
実装対象:
  STEP 1 feasible matrix 初期化
  STEP 2 targetCount / targetFirst / targetSecond 計算（アンカー分考慮）

検証: アンカー配置後の res[] を入力し、feasible / targetCount が期待値と一致するか確認
完了条件: 問題2が解消されていること（アンカー夜勤を assignment に反映済み）
```

### Phase4-C: difficulty-first 配置ループ（hill-climbing なし）

```
実装対象:
  STEP 3 dayOrder 計算
  STEP 4 配置ループ（hill-climbing 抜き）
  STEP 5 スキップ

検証: 旧アルゴリズム vs NSO（Phase4-C）を 100試行比較
完了条件: shortage が旧以下、夜勤回数σが旧以下
```

### Phase4-D: hill-climbing リファイン追加

```
実装対象:
  STEP 5 hill-climbing 100イテレーション（canSwap + trySwap）

検証: Phase4-C vs Phase4-D を 100試行比較
完了条件: 前後半偏差が Phase4-C 以下
```

### Phase4-E: 既存ステップ2の完全置換

```
実装対象:
  ステップ2の for(d=1..days) ループを nightSlotOptimizer() 呼び出しに置換
  旧コードはコメントアウト（切り戻し用に保持）

検証: 旧 vs Phase4-E を 4パターン 100試行比較（Step2最終/Step3含む全比較）
採用条件:
  ① 夜勤回数σ: 旧以下（有意差なし、または有意に改善）
  ② 前後半偏差: -30%以上改善（p<0.05）
  ③ shortage: 旧以下
  ④ 生成時間増加: < 50%
```

---

## 9. 最終回答

### ① 実装推奨度: **70 / 100点**

設計思想（全日可視化・targetCount ハード制約・difficulty-first）は正しく、  
現方式の構造的限界（逐次貪欲）を克服する可能性がある。

**-30点の理由**:
- 問題1（C3制約と困難日優先の根本矛盾）が未解決で、実装時に大規模修正が必要になりうる
- 問題2（アンカー分の targetCount 誤算）は実装時に明示的修正が必要
- 未定義関数（canSwap, propagateConstraints）の仕様が確定していない

設計書に修正・補足を行った上での実装推奨度は **85点** に上昇する見込み。

### ② 実装リスク

| リスク | 発生確率 | 深刻度 |
|--------|---------|--------|
| C3×困難日優先の競合でshortagedegration | 高（問題1未解決） | ★★★ |
| アンカー分 targetCount 誤算で過剰配置 | 中（問題2）| ★★ |
| lockedDays 追加の差異で PassA 動作変化 | 低〜中（問題3）| ★★ |
| hill-climbing でcount equity が崩れる | 低 | ★ |
| 既存コードとのインターフェース不一致 | 低 | ★ |

### ③ 最も注意すべきポイント

**C3制約（前日が夜勤/明けなら不可）と困難日優先配置（時系列でない）の競合。**

困難日優先で d=15 を先に処理するとき、d=14 の配置状態が未確定なため  
C3チェックが機能しない。これが解消されないと、困難日優先の最大のメリット（shortage回避）が  
逆に C3違反を発生させるリスクになる。

**解決策**: canAssignInitial をロック済みの静的制約のみに限定し、  
C3チェックは propagateConstraints で動的に処理する（配置確定後に隣接日の feasible を更新）。

### ④ 実装は一括か段階的か

**段階的（Phase4-A→E）を強く推奨。**

理由:
1. 未定義関数（canSwap, propagateConstraints）の仕様が実装中に変化するため
2. C3問題が Phase4-A で解消されない場合、Phase4-C 以降の検証が意味をなさない
3. デグレード発生時の切り戻し範囲を最小化できる
4. 各フェーズで独立検証することで「どの変更が改善に寄与したか」を明確にできる

一括実装の唯一のメリットは「実装工数の削減」だが、  
未解決の設計矛盾がある現状では、一括実装後のデバッグコストの方が大きい。

### ⑤ 次の実装フェーズ数

**5フェーズ（Phase4-A 〜 Phase4-E）**

| フェーズ | 内容 | 目安工数 |
|---------|------|---------|
| Phase4-A | 基盤関数実装・C3問題解決 | 2〜3セッション |
| Phase4-B | feasible matrix / targetCount | 1セッション |
| Phase4-C | difficulty-first 配置ループ | 1〜2セッション |
| Phase4-D | hill-climbing リファイン | 1セッション |
| Phase4-E | 既存ステップ2置換・最終検証 | 1〜2セッション |
| **合計** | | **6〜9セッション** |

---

## 付記: 設計書への修正・追記推奨事項

1. **問題1の明示と解決策**: C3制約を静的 feasible matrix に含めず、propagateConstraints での動的更新に委ねる旨を設計書に追記
2. **問題2の修正**: STEP 2 の targetCount 計算にアンカー配置済み夜勤を反映するコードを追記
3. **問題3の解決**: lockedDays 追加要否について PassA コードを参照した上で方針確定
4. **未定義関数の仕様書**: canAssignInitial / propagateConstraints / canSwap / computeCost の引数・戻り値・制約チェック内容を明文化
5. **dayOrder 動的更新の方針**: 静的計算（近似）とするか、動的更新（高精度）とするかを明記
