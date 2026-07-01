# STEP6_TRANSITION_PROBABILITY_ANALYSIS.md
# Phase5 Step6 — 遷移確率 現状分析・設計レポート

作成: 2026-06-30
対象ブランチ: phase5/night-balance
調査範囲: src/App.jsx（全行）
コード変更: なし（調査・設計のみ）

---

## 作業前回答（記録）

① 現在フェーズ: Phase5 Step6（遷移確率 現状分析・設計）
② Phase5進捗率: Step5-A/B完了・Step5-C適用不可確認済み → 約35%
③ 今回で生成結果が変わるか: **変わらない**（コード変更禁止）

---

## 必須回答 ① 遷移確率の完全フロー図

```
[DB: shifts_YYYY_M_deptId]
        │
        ▼
computeLearnedTrend()  ← L503
        │
        ├─ freq[shiftKey]          = 全体シフト頻度（重み付き平均）
        ├─ transitionRate[prev][curr] = 前日→当日 遷移確率  ← ★計算済・未使用
        ├─ dowShiftRate[dow][shiftKey] = 曜日別シフト確率
        └─ dowRestRate[dow]          = 曜日別休み確率
        │
        ▼
learnedTrend (state)  ← L8472
        │
        ├─────────────────────────────────────────────────────────────────┐
        │                                                                 │
        ▼                                                                 ▼
bestOfN()  ← L2980                                             generateTimeAxis()  ← L3031
 └─ autoGenerate() × N                                          └─ USE_LEARN_PICK = true (L3052)
     └─ getTrend(s)                                                 └─ getTrendTA(s)
         ├─ PassA: スロット配置順 sort                                    │
         │   dowShiftRate × freq（第2優先）  ← L1977                     │
         ├─ PassB: 確率サンプリング                                       │
         │   getShiftWeight(d,k)  ← L2045                                │
         │   = dowShiftRate[weekday][k] × 0.6 + ratioW × 0.4            │
         │     or freq[k] × 0.6 + ratioW × 0.4                          │
         │     or 1/allowed.length (均等)                                │
         │   → sampleFromProbs(probs)  ← L2110                           │
         └─ scoreShifts(): 学習適合ペナルティ                             │
             dowShiftRate or freq → (1-p) × 30 点  ← L2899              │
                                                                         │
                                                             runOneTrial (non-eiyo) ← L3117
                                                              Step4: dowShiftRate重み付き選択 ← L3209
                                                             runOneTrialEiyo (eiyo) ← L3323
                                                              Step5: dowShiftRate候補スコア ← L3365
                                                              Step6: dowShiftRate出勤率ソート ← L3409
                                                                         │
        ┌────────────────────────────────────────────────────────────────┘
        │
        ▼
computeSyncRate()  ← L682
 = "シンクロ率" (UI表示のみ)
 各勤務日: dowShiftRate の最頻シフト == 実際の配置か？ を判定
 ※ scoreShifts() とは別の指標。生成には影響しない。
```

---

## 必須回答 ② 関数一覧

| 関数名 | 行 | 役割 | 遷移確率との関係 |
|---|---|---|---|
| `computeLearnedTrend` | L503 | DB学習データを集計し learnedTrend を生成 | `transitionRate` / `dowShiftRate` / `dowRestRate` / `freq` を計算 |
| `getTrend(s)` | L1154 | autoGenerate 内: スタッフ名で learnedTrend を引く | freq / dowShiftRate / dowRestRate を返す |
| `getTrendTA(s)` | L3053 | generateTimeAxis 内: 同上 + USE_LEARN_PICK チェック | 同上 |
| `getShiftWeight(d,k)` | L2045 | PassB: 1日1シフトの重みを返す | `dowShiftRate[weekday][k]` × 0.6 + ratioW × 0.4 |
| `sampleFromProbs(probs)` | L1720 | 重み付き確率サンプリング（1件） | getShiftWeight の出力を消費 |
| `weightedSampleN(items,weights,n)` | L1730 | 重み付き非復元サンプリング（N件） | ratio指定時の日付選択に使用 |
| `pickWithTrend(s,available,cnts)` | L1160 | 夜勤配置PassA: sort時の第4優先 | `trend[k]` diff > 0.05 なら学習が効く |
| `scoreShifts` | L2763 | bestOfN のスコアリング | `(1-predictedProb)*30` 点（軟制約） |
| `localSearchImprove` | L2913 | 2-opt swap でスコアを下げる | scoreShifts を使うため間接的に学習が効く |
| `isBadTransition` | L806 | 遷移ルール違反チェック（ハード制約） | transitionRate とは**無関係**。ルール固定 |
| `computeSyncRate` | L682 | UI「シンクロ率」表示のみ | dowShiftRate の最頻値と実配置を比較 |

---

## 必須回答 ③ 呼び出し順（kaigo1/kaigo2 の生成フロー）

```
_runGenerateCore()  ← L8601
  └─ bestOfN(shiftTrend=learnedTrend, n=30)  ← L8605
       └─ [×30試行] autoGenerate()
            ├─ PassA: 夜勤配置（slot-first）
            │   ├─ getTrend(s) → pickWithTrend で sort 第4優先に freq 使用
            │   └─ dowShiftRate 使用（スタッフ選択 sort 補助）
            ├─ PassB: 勤務シフト配置
            │   ├─ getShiftWeight(d,k) = dowShiftRate × 0.6 + ratioW × 0.4
            │   ├─ sampleFromProbs(probs) → シフト確率選択
            │   └─ ratio指定あり: weightedSampleN で日付を確率選択
            ├─ PassC: 最低配置保証・違反修正
            │   └─ _isBadTransition （ルール固定・transitionRate 不使用）
            └─ [修正ループ]
       └─ scoreShifts (×30回 + localSearchImprove 後)
            └─ (1-dowShiftRate[dow][shift]) × 30 点
       └─ best 採用
```

---

## 必須回答 ④ 現在の問題点

### ⚠️ 最重要問題: transitionRate が完全に未使用

| 項目 | 内容 |
|---|---|
| 計算場所 | `computeLearnedTrend` L603-L608 |
| 格納先 | `learnedTrend[staffName].transitionRate[prev][curr]` |
| 参照箇所 | **ゼロ件**（grep 結果: L603/607/608/628 のみ — 全て計算・格納のみ） |
| 影響 | 前日シフトを考慮した確率選択が一切行われていない |

### ⚠️ 問題2: PassB の確率反映が「初日のみ」前日考慮

L2109: `if (d === 1) { const ps = prevShift(s.id); if (ps) allowed.forEach(k => { if (_isBadTransition(ps, k)) probs[k] = 0; }); }`

- **d=1（月初日）**: 前月末シフトを確認し、`isBadTransition` 違反なら確率0に。
- **d=2以降**: 前日シフトを参照した確率調整は **なし**。前日が何であれ `getShiftWeight` は `dowShiftRate[dow][k]` のみで決定。

### ⚠️ 問題3: dowShiftRate の重み係数が固定 (0.6/0.4)

L2051: `trendW * 0.6 + ratioW * 0.4`

- ratio（シフト比率設定）とtrendの混合比が固定。データ量による信頼度調整なし。
- スタッフのデータ量が多くても少なくても同じ比率で混合する。

### ⚠️ 問題4: alpha スムージング（freq）はあるが transitionRate にはない

L596: `const alpha = Math.min(1, totals[staff.id] / 10);` — freq には適用済み。
L602-L610: transitionRate は `totals >= 10` のみ計算するが、スムージングなし。

### ⚠️ 問題5: scoreShifts の学習ペナルティが軽い

`(1 - predictedProb) × 30` 点 — minStaff不足(300〜1000点)、連勤違反(100点)の後の最軽量制約。
確率0.5のシフトでもペナルティは15点のみ。学習の誘導力が弱い。

### ⚠️ 問題6: localSearchImprove で transitionRate を考慮したスワップをしていない

L2913-L2980: 2-opt swap は scoreShifts で判断するが、そこに transitionRate は含まれない。

---

## 必須回答 ⑤ 改善候補一覧

### 候補A: transitionRate を PassB の確率選択に組み込む

**対象**: L2094-L2117（ratio指定なし PassB ループ）
**方法**: `probs[k]` に `transitionRate[prevShift][k]` を乗算（または加重平均）
**効果**: 「前日が遅番なら翌日は休みの確率が高い」など実績ベースの選択になる
**難易度**: 中（prevShift の参照追加、d>1 での前日シフト取得が必要）
**リスク**: 制約ではなく確率なので、大きな破壊はない。scoreShifts との整合性要確認。

### 候補B: transitionRate を scoreShifts の学習ペナルティに追加

**対象**: L2883-L2908（scoreShifts 学習適合ペナルティブロック）
**方法**: `res[s.id][d]` の実際の遷移が transitionRate と乖離した場合にペナルティ追加
**効果**: bestOfN の30試行で、前日→当日の遷移が実績に近い試行が採用されやすくなる
**難易度**: 低（scoreShifts に数行追加のみ）
**リスク**: ペナルティ値の設定次第でルール制約と競合しない調整が必要

### 候補C: PassB の getShiftWeight に transitionRate を追加

**対象**: L2045-L2059（getShiftWeight 関数）
**方法**: `trend?.transitionRate?.[prevShift]?.[k]` を第3の重みとして組み込む
**効果**: 日付ごとに「前日シフト → 当日シフト」の実績確率が重みに反映
**難易度**: 中（前日シフト `d>1 ? res[s.id][d-1] : prevShift(s.id)` の参照が必要）
**リスク**: 初期配置時点では d=1...n 順に配置するため、前日が未確定の場合がある

### 候補D: localSearchImprove に transitionRate ペナルティを追加

**対象**: scoreShifts（L2763）経由で改善後に localSearchImprove が呼ばれる
**方法**: 候補Bを先に実装すれば自動的に localSearchImprove にも伝播する
**効果**: 2-opt swap でも遷移実績が考慮された改善が行われる
**難易度**: 低（候補Bの副次効果）

### 候補E: dowShiftRate の混合比を alpha 連動に変更

**対象**: L2051 `trendW * 0.6 + ratioW * 0.4`
**方法**: `const trendAlpha = Math.min(1, dataTot / 30);` として `trendW * trendAlpha + ratioW * (1-trendAlpha)`
**効果**: データ少ないスタッフは ratio 寄り、データ多いスタッフは trend 寄りになる
**難易度**: 低
**リスク**: 混合比変更は全スタッフの生成に影響する（影響範囲大）

### 候補F: transitionRate に部署平均スムージングを適用

**対象**: L602-L610（transitionRate 計算ブロック）
**方法**: freq と同様に `alpha` スムージングを transitionRate に適用
**効果**: データ少ないスタッフでも部署傾向に近い遷移確率を持てる
**難易度**: 低（computeLearnedTrend 内の変更のみ）
**リスク**: 部署平均の計算が増える（O(n²) だが非リアルタイムなので問題なし）

---

## 必須回答 ⑥ 優先順位

| 順位 | 候補 | 理由 |
|---|---|---|
| 1位 | **候補B**（scoreShifts に transitionRate ペナルティ追加） | 最小変更・低リスク・bestOfN全試行に自動適用される |
| 2位 | **候補C**（getShiftWeight に transitionRate 組み込み） | 生成時点でリアルタイムに前日実績を反映できる |
| 3位 | **候補A**（PassB probs 乗算） | 候補C と重複するためCの後に評価 |
| 4位 | **候補F**（transitionRate スムージング） | 候補B/C の前提品質向上として先行実施も可 |
| 5位 | **候補E**（alpha 連動混合比） | 全体影響大・効果測定が難しい |
| 6位 | **候補D**（localSearchImprove）| 候補Bの副次効果として自動実現 |

---

## 必須回答 ⑦ 修正対象関数

| 候補 | 修正対象関数 | 場所 |
|---|---|---|
| B | `scoreShifts` | L2763 |
| C | `getShiftWeight`（autoGenerate 内クロージャ） | L2045 |
| A | PassB ループ内（ratio指定なし側） | L2094 |
| F | `computeLearnedTrend` | L602 |
| E | `getShiftWeight` | L2051 |

---

## 必須回答 ⑧ 修正対象行番号

| 候補 | 行番号 | 変更内容 |
|---|---|---|
| B | L2883-L2908 | transitionRate ペナルティブロックを scoreShifts 末尾に追加 |
| B | L2893-L2898 | 学習ペナルティの計算式に transitionRate を加算 |
| C | L2045-L2059 | getShiftWeight に前日シフト引数を追加し transitionRate 重みを組み込む |
| C | L2074, L2100 | getShiftWeight 呼び出し箇所に `d > 1 ? res[s.id][d-1] : prevShift(s.id)` を渡す |
| A | L2099-L2109 | `probs[k]` 計算後に transitionRate を乗算するブロック追加 |
| F | L602-L610 | transitionRate 計算後にスムージングループを追加 |

---

## 必須回答 ⑨ Step6 を何サブステップに分割するべきか

### 推奨: 2サブステップ

**Step6-A: scoreShifts に transitionRate ペナルティ追加（候補B）**
- 変更関数: `scoreShifts` のみ
- 影響範囲: bestOfN (kaigo1/kaigo2) の試行選択
- 停止条件: shortage 増加、公休数違反増加
- 効果検証: 修正セル数の実測比較（100試行 × kaigo1/kaigo2）

**Step6-B: getShiftWeight に transitionRate 組み込み（候補C）**
- 変更関数: `getShiftWeight`（autoGenerate 内クロージャ）
- 前提: Step6-A の効果確認後
- 停止条件: shortage 増加、生成時間大幅悪化
- 効果検証: 同上

**Step6-A のみで効果十分なら Step6-B は不要。1改善=1効果検証の原則を維持。**

---

## 必須回答 ⑩ 今回コード変更しなかった理由

Step5-C の調査で「kaigo1/kaigo2 は `engineType === 'time'` を持たない → generateTimeAxis 非適用」が確認された直後に本調査へ移行したため、新たな調査フェーズとしてコード変更なしでの分析が求められていたため。

---

## 必須調査 — 詳細分析結果

### ① 遷移確率が生成に使われる場所

**使われていない（transitionRate は未使用）**。ただし `isBadTransition`（ルール固定）が遷移の「禁止チェック」として使われている（L1691, L1965, L2109, L2256, L2304, L2333, L2363, L2398）。

### ② 遷移確率が使われていない場所

- PassB（L2094-L2116）: probs は `getShiftWeight(d,k)` のみ。前日シフト参照なし（d=1以外）
- PassA スタッフ選択 sort（L1977）: freq / dowShiftRate のみ。transitionRate 参照なし
- scoreShifts（L2883-L2908）: dowShiftRate / freq のみ。transitionRate 参照なし
- generateTimeAxis 全体（L3031-L3700+）: `getTrendTA` は dowShiftRate / freq を参照。transitionRate 参照なし

### ③ 学習データの流れ

```
DB (supabase) → allDBData
    → computeLearnedTrend (L503)
        → freq[shiftKey]         重み: monthsAgo に応じ 1〜4倍
        → transitionRate[p][c]   前日→当日（d=2以降）重み付き集計
        → dowShiftRate[dow][k]   曜日別シフト確率
        → dowRestRate[dow]       曜日別休み確率
    → learnedTrend (state, L8472)
        → bestOfN → autoGenerate → getTrend → PassA/PassB/scoreShifts
        → generateTimeAxis → getTrendTA → runOneTrialEiyo
        → computeSyncRate → UI "シンクロ率"
```

### ④ 曜日学習

`dowShiftRate[dow][shiftKey]` として格納（dow=0〜6、JS getDay 準拠）。
使用箇所:
- PassB `getShiftWeight(d,k)`: 最高優先 (weight ×0.6)
- PassA スタッフ選択 sort 補助（L1977-L1980）
- generateTimeAxis Step4 dowRate 重み付き選択（L3209-L3222）
- scoreShifts 学習ペナルティ（L2895-L2899）
- computeSyncRate（L702）

`dowRestRate[dow]` は **どこにも使用されていない**（格納のみ）。

### ⑤ 前日勤務との関係

- **d=1（月初日）のみ**: `prevShift(s.id)` を取得し `_isBadTransition` で禁止遷移を確率0に（L2109）
- **d=2以降**: 前日シフトを参照する確率調整は **ゼロ**
- transitionRate は計算済みだが、d=2以降の前日シフト参照に使用していない

### ⑥ 前々日勤務との関係

現行コード上、前々日シフトを参照している箇所は **ゼロ**。
`isBadTransition` の夜勤チェーン（夜勤→明け）は 1日前のみ。

### ⑦ 夜勤前後への影響

- 夜勤配置（PassA）: スロット管理（role-slot）で1日1名制約。学習は第4優先（sort）
- 明け翌日: `isBadTransition(curr='明け', nightSet)` で前日夜勤以外を禁止（ハード制約）
- 夜勤前後の transitionRate 学習: 計算はされているが生成に使用していない
- 例: `transitionRate['休み']['夜勤']` が 0.3 であっても、PassA・PassB のいずれも参照しない

### ⑧ 現在の重み計算式

```
getShiftWeight(d, k):
  weekday = new Date(year, month, d).getDay()
  ratioW  = ratio[k] / ratioTotal   (ratio設定あり時)

  if dowShiftRate[weekday][k] != null:
    trendW = max(0.01, dowShiftRate[weekday][k])
    return ratioW ? trendW × 0.6 + ratioW × 0.4 : trendW

  if freq[k] != null:
    trendW = max(0.01, freq[k])
    return ratioW ? trendW × 0.6 + ratioW × 0.4 : trendW

  if ratioW:
    return ratioW

  return 1 / allowed.length   ← 均等（学習データなし）
```

`pickWithTrend`（PassA sort）:
```
// 第4優先（diff > 0.05 の場合のみ有効）
tA = trend[a] || 0   ← freq 系
tB = trend[b] || 0
if |tA - tB| > 0.05: return tB - tA
else: random
```

`scoreShifts` 学習ペナルティ:
```
// 勤務日
predictedProb = dowShiftRate[dow][shift] or freq[shift]
score += (1 - predictedProb) × 30

// 休み日
restProb = dowRestRate[dow6]
score += (1 - restProb) × 30
```

### ⑨ 最終的に勤務決定されるまでのフロー

```
[kaigo1/kaigo2 最終勤務決定フロー]

1. 希望休・有休・希望勤務: res[] に直接格納（絶対変更なし）
2. PassA: 夜勤配置（slotManaged）
   ├─ 候補スタッフを dowShiftRate 重みで sort → 上位から配置
   └─ isBadTransition で禁止遷移スタッフを除外
3. PassB: 勤務シフト配置（ratio指定あり）
   ├─ 希少シフト(早番・遅番)を weightedSampleN で日付確率選択
   │   重み = getShiftWeight(d, k)
   └─ 残り日を日勤で埋める
3'. PassB: 勤務シフト配置（ratio指定なし）
   ├─ 各日を sampleFromProbs(probs) で選択
   │   probs = getShiftWeight(d, k) + minStaff不足ブースト
   └─ isBadTransition(prevShift) で月初のみ確率0
4. PassC: 最低配置保証・isBadTransition 違反修正
5. 休み調整: 公休数不足スタッフに休みを追加
6. [×30回] scoreShifts でスコア計算
7. localSearchImprove（2-opt swap × 3pass）
8. 最低スコア試行を best として採用
```

### ⑩ 実際に確率が反映される割合

`computeSyncRate` が「シンクロ率」として測定している。UI表示値が実態に近い。

- シンクロ率 = 勤務日のうち「dowShiftRate 最頻値 == 実際のシフト」の割合
- 85%以上: 緑、70%以上: 黄、未満: 青（L9259）
- **ただし**: シンクロ率は「勤務シフト種別」の一致のみを測定。曜日選択（いつ休むか）の一致は測定していない

---

## 必須分析

### ① 遷移確率だけで決定している箇所

**ゼロ件**。transitionRate は生成に使用されていない。
dowShiftRate（曜日別確率）が最も近い概念だが、前日シフトとは無関係。

### ② 制約が優先される箇所

| 優先度 | 制約 | 箇所 |
|---|---|---|
| 最高 | 希望休・有休・希望勤務（ロック） | PassA前（L1200-L1227） |
| 高 | isBadTransition（遅番→早番禁止等） | PassA/PassB/PassC 随所 |
| 高 | maxStaff/role制限 | PassA（slotManaged）, PassB（probs=0） |
| 高 | maxConsecutive（連勤） | PassC, RepairEngine |
| 中 | minStaff（ブースト） | PassB（×(1+deficit×2)） |
| 低 | 学習適合（scoreShifts ペナルティ） | bestOfN 試行選択 |

### ③ 学習が無効化される条件

1. `shiftTrend` が空オブジェクト（学習データなし施設）
2. スタッフ名が learnedTrend のキーと `nameMatch` しない
3. `totals[staff.id] < 1`（DB データなし）
4. `dowShiftRate[weekday]` が null（当該曜日のデータなし → freq にフォールバック）
5. `USE_LEARN_PICK = false`（generateTimeAxis のみ影響。現在は `true`）

### ④ 学習が効いている条件

1. DB に 3ヶ月以上のシフト実績がある
2. `totals[staff.id] >= 10`（遷移確率計算の最低条件）
3. dowShiftRate[weekday][k] が存在する（当該曜日に当該シフト実績あり）
4. ratio設定がある場合: trendW × 0.6 の形で反映

### ⑤ 修正セル数削減に寄与しそうな箇所

1. **transitionRate を PassB に追加**: 「前日遅番→翌日休み」など施設長が自然と配置するパターンを学習反映 → 修正頻度低下の可能性あり
2. **dowRestRate の活用**: 現在未使用。「この人は土日休みが多い」を生成に反映できれば修正セル削減
3. **scoreShifts の transitionRate ペナルティ**: 30試行中で「人間的な遷移」を選ぶ確率が上がる

### ⑥ 学習品質を上げられる候補

1. 候補F（transitionRate スムージング）: データ少ないスタッフを部署平均に寄せる
2. dowRestRate の生成への組み込み（現在未使用）
3. exceptionMonths（例外月除外）の適切な設定（現在利用者側の設定依存）

### ⑦ 既存コードを流用できる部分

- L2109 の「d=1 での前日シフト参照 + isBadTransition」: transitionRate 組み込み時の参照パターンとして流用可
- L2045-L2059 `getShiftWeight`: 3番目の重みとして transitionRate を追加する形で拡張可
- L596 `alpha = Math.min(1, totals/10)`: transitionRate のスムージングに同式が流用可

### ⑧ 影響範囲

| 候補 | 影響範囲 |
|---|---|
| B（scoreShifts） | bestOfN の試行選択のみ。autoGenerate の内部生成は変わらない |
| C（getShiftWeight） | PassB 全スタッフ・全日付の勤務シフト選択 |
| A（PassB probs） | C と重複 |
| F（computeLearnedTrend） | 全部署・全スタッフの学習データ品質 |

### ⑨ 実装難易度

| 候補 | 難易度 | 理由 |
|---|---|---|
| B | **低** | scoreShifts に 10行追加。前日参照は `res[s.id][d-1]` で取得可 |
| C | **中** | `getShiftWeight` のシグネチャ変更が必要。呼び出し側 2箇所も変更 |
| F | **低** | computeLearnedTrend 内のみ。ループ追加 |
| A | **中** | Cと同等。PassBループ内での前日参照実装 |
| E | **低** | L2051 の係数変更のみ |

### ⑩ 期待改善効果

**注意**: 以下は実測なし・設計レベルでの推定。実装後に100試行比較が必要。

| 候補 | 期待効果 | 根拠 |
|---|---|---|
| B | 修正セル数 5〜15%削減（推定） | bestOfN 30試行で「遷移が自然な結果」が選ばれやすくなる |
| C | 修正セル数 10〜20%削減（推定） | 各日の前日実績反映により「違和感のない連続パターン」が増える |
| F | 品質改善 on B/C の土台 | データ少ないスタッフの遷移確率品質向上 |

---

## 最重要評価: 「修正セル数削減」に本当に寄与するか

### 評価結論: **中程度の寄与が期待できる。ただし単体での劇的改善は限定的。**

#### 寄与できる理由

1. **transitionRate は「人間的なシフトの流れ」を最も直接的に学習している**
   - 施設長・リーダーが過去に手動修正した結果が「前日→当日」の遷移実績に蓄積
   - 例: 「夜勤明け翌々日は休み→早番 ではなく 日勤 が多い」などの暗黙的パターン
   - これを生成に反映すれば、施設長が「なぜかいつもここを直す」修正が減る

2. **現在 transitionRate は計算されているが完全に死んでいる**
   - すでにデータはある。使うだけで改善する可能性がある（実装コストに対するROIが高い）

3. **dowRestRate も未使用**
   - 「この人は土日に休みが入りやすい」パターンが反映されていない
   - 修正の原因「なぜここに出勤させるの？」の一部は曜日別休みパターンのズレ

#### 寄与できない理由・限界

1. **最終的な勤務決定は制約（minStaff/maxStaff）が強く支配する**
   - transitionRate の反映がどれだけ「自然」でも、人員不足なら上書きされる
   - 「人間が作ったようなシフト」には minStaff ゼロ（人員十分）が前提

2. **『修正が不要なシフト』の最大要因は制約充足であり学習ではない**
   - shortage（人員不足コマ）が存在する限り、施設長は必ず手動修正する
   - transitionRate 改善だけでは shortage は減らない

3. **transitionRate の学習品質がデータ量に依存する**
   - 新スタッフ・シフト変更直後のスタッフは transitionRate データなし
   - totals < 10 のスタッフには現在も计算されない

#### 総合判断

```
修正セル削減への寄与度:
  Step6（transitionRate）: ★★★☆☆（中）
    → 「なぜかここを直す」の暗黙パターン減少は期待できる
    → shortage/maxConsec 起因の修正には寄与しない

  より効果が高い可能性がある改善（参考）:
    - minStaff 充足率向上（shortage削減）: ★★★★★
    - 夜勤均等化（NSO代替手法）: ★★★★☆
    - 役職制限違反削減: ★★★☆☆
    - transitionRate 活用（Step6）: ★★★☆☆
```

---

## 結論: Step6 実装方針

1. **Step6-A（候補B）を優先実装**
   - `scoreShifts` に `transitionRate` ペナルティを追加
   - 変更関数: `scoreShifts` のみ（L2883-L2908 付近に追加）
   - 100試行比較で修正セル数・shortage の変化を確認
   - shortage 増加 → 即停止

2. **Step6-A 効果確認後に Step6-B（候補C）を判断**
   - `getShiftWeight` への transitionRate 組み込み
   - 前日参照ロジックは L2109 のパターンを流用

3. **dowRestRate 活用（候補G、将来）**
   - 現在完全未使用。生成への組み込みは別フェーズ（Step7以降）で検討

*このドキュメントは Phase5 Step6 の分析・設計として作成。コード変更は Step6-A 実装時。*
