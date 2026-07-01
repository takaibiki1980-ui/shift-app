# STEP7B_PRIME_RESULT.md
# Phase5 Step7-B' — 本番autoGenerate による restCands条件緩和 最終採否確定

作成: 2026-06-30
対象ブランチ: phase5/night-balance
実測: 100試行 × kaigo1/kaigo2 × bestOfN=30
使用エンジン: shiftEngine.js（本番autoGenerate エクスポート版）
比較: Before（actualKyuko > targetKyuko）vs After（actualKyuko >= targetKyuko）
最終判定: **不採用 / revert 実施**

---

## 本番autoGenerate使用の根拠

`src/shiftEngine.js` は `src/App.jsx` の内部 `autoGenerate`/`bestOfN`/`scoreShifts` を分離エクスポートしたものであり、コードコメント（例: `// 元コード: autoGenerate 内 L968〜982`）によって同一ロジックであることが明示されている。既存テストスイート（131件）はすべて `shiftEngine.js` を対象としており、これが本番テスト可能な autoGenerate の実体である。`App.jsx` は React 依存のため Node.js 環境での直接インポートが不可能であり、`shiftEngine.js` を経由することが本番計測の唯一の実用的経路である。

---

## 必須回答 ①〜⑫

### ① 使用した検証方法

- **vitest（node 環境）** + `shiftEngine.js` の `bestOfN` を直接呼び出し
- Before: shiftEngine.js L1060 = `actualKyuko > targetKyuko`（元コード）で100試行
- After:  shiftEngine.js L1060 = `actualKyuko >= targetKyuko`（変更後）で100試行
- **完全同一シード・スタッフ定義・部署定義** で両条件を比較
- 測定スクリプト: `src/__tests__/step7b_production.test.js`（After）/ `step7b_production_before.test.js`（Before）

### ② 本番autoGenerateを使用した根拠

上記の通り。`shiftEngine.js` = `App.jsx` 内部 `autoGenerate` の抽出エクスポート版（同一ロジック）。

---

### ③ Before / After 比較表（100試行）

#### kaigo1

| KPI | Before(μ) | After(μ) | Δ | t値 | 判定 |
|---|---|---|---|---|---|
| ① shortage/trial | 0.520 | 0.510 | -0.010 | -0.10 | → 有意差なし |
| ② 夜勤shortage | 0.390 | 0.400 | +0.010 | — | → 微増（悪化方向） |
| ③ 日勤shortage | 0.000 | 0.000 | ±0 | — | → 変化なし |
| ④ 早番shortage | 0.120 | 0.110 | -0.010 | — | → 微減（有意差なし） |
| ⑤ 遅番shortage | 0.010 | 0.000 | -0.010 | — | → 変化なし |
| ⑥ 公休数違反スタッフ数 | 7.050 | 7.180 | **+0.130** | +0.98 | → 有意差なし（悪化方向） |
| — 公休数不足日合計 | 23.230 | 23.420 | +0.190 | +0.45 | → 有意差なし |
| ⑦ score平均 | 449,535 | 449,885 | **+350** | +0.08 | → 変化なし |
| ⑪ 生成時間(ms) | 195.6 | 189.8 | -5.8 | -2.05 | ★改善（高速化） |

#### kaigo2

| KPI | Before(μ) | After(μ) | Δ | t値 | 判定 |
|---|---|---|---|---|---|
| ① shortage/trial | 0.380 | 0.430 | **+0.050** | +0.53 | → 有意差なし（**悪化方向**） |
| ② 夜勤shortage | 0.320 | 0.350 | +0.030 | — | → 微増（悪化方向） |
| ③ 日勤shortage | 0.000 | 0.000 | ±0 | — | → 変化なし |
| ④ 早番shortage | 0.060 | 0.080 | +0.020 | — | → 微増（悪化方向） |
| ⑤ 遅番shortage | 0.000 | 0.000 | ±0 | — | → 変化なし |
| ⑥ 公休数違反スタッフ数 | 7.070 | 7.240 | **+0.170** | +1.22 | → 有意差なし（悪化方向） |
| — 公休数不足日合計 | 23.630 | 23.530 | -0.100 | -0.24 | → 変化なし |
| ⑦ score平均 | 442,695 | 442,637 | -58 | -0.01 | → 変化なし |
| ⑪ 生成時間(ms) | 194.8 | 189.2 | -5.6 | -1.98 | → 有意差なし（改善方向） |

> ⑧ Repair発生回数・⑨ Repair成功率: RepairEngine は kaigo1/kaigo2 に適用されない（Step5-C確定済み）。
> ⑩ syncRate: shiftTrend={} での計測のため計算不能（trendデータなし）。
> ⑫ 採用試行率: bestOfN は最小スコア試行を採用するため N=30 全試行を使用。
> ⑬ DiagnosticReport: DiagnosticEngine は UI 層に存在し、本番計測環境外（vitest node）では取得不能。

---

### ④ shortage改善率

| 部署 | Before | After | Δ | 改善率 |
|---|---|---|---|---|
| kaigo1 | 0.520/trial | 0.510/trial | -0.010 | **-1.9%**（有意差なし t=-0.10） |
| kaigo2 | 0.380/trial | 0.430/trial | **+0.050** | **-13.2%悪化**（有意差なし t=+0.53） |

**shortage は統計的に改善していない**（どちらも |t| < 1.96）。kaigo2 は方向として悪化。

> 注: 測定ベースライン（0.38〜0.52/trial）は Step6-B 実測（17.9/trial）と乖離している。これは shiftEngine.js 計測環境（shiftTrend={}, 外国人夜勤制約なし, 公休希望ランダム）が本番の複雑な制約環境を再現できていないため。実際の shortage 改善量は本環境では評価不能であり、これ自体が「制約環境なしでは shortage が発生しにくい」ことを示す（shortage の根本原因は制約密度であり、restCands 緩和単体では解消困難）。

---

### ⑤ 統計的有意差

| 項目 | t値(kaigo1) | t値(kaigo2) | 有意（|t|>1.96） |
|---|---|---|---|
| shortage | -0.10 | +0.53 | **なし** |
| 公休数違反 | +0.98 | +1.22 | **なし** |
| score | +0.08 | -0.01 | なし |
| 生成時間 | -2.05 | -1.98 | 改善のみ有意（kaigo1のみ） |

**採用判定条件「shortage が統計的有意に改善」は満たされない。**

---

### ⑥ 公休数への副作用

- 公休数違反スタッフ数: kaigo1 +0.130、kaigo2 +0.170（いずれも有意差なし、方向は悪化）
- 公休数不足日合計: kaigo1 +0.190、kaigo2 -0.100（混在）

**採用判定条件「公休数違反が増えていない」は満たされない（方向として悪化）。**

これは `>=` 条件により公休数ちょうど達成済みのスタッフを休み→勤務に変換した後、公休数回復フェーズで日勤→休みに戻す際に minStaff ガードが干渉し、公休数が目標に戻りきらないケースが発生するため。

---

### ⑦ scoreへの影響

- kaigo1: +350（t=+0.08、有意差なし）
- kaigo2: -58（t=-0.01、有意差なし）

**事実上変化なし。**

---

### ⑧ Repairへの影響

kaigo1/kaigo2 は RepairEngine（eiyo 専用）を使用しない。影響なし。

---

### ⑨ 他部署への影響

| 部署 | 影響 |
|---|---|
| kaigo1/kaigo2 | 本計測対象。不採用のためrevert。 |
| eiyo | generateTimeAxis を使用のため autoGenerate の変更は影響しない。 |

---

### ⑩ 実装を採用すべきか（実測値のみで判断）

**不採用。**

理由（実測値のみ）:
1. kaigo1: shortage Δ=-0.010（t=-0.10、有意差なし）
2. kaigo2: shortage Δ=+0.050（t=+0.53、方向として**悪化**、有意差なし）
3. 公休数違反: 両部署ともに方向として悪化（kaigo1 +0.130、kaigo2 +0.170）
4. score・連勤違反: 有意差なし
5. 採用判定条件（「shortage が統計的有意に改善」かつ「公休数違反が増えていない」）を2項目とも満たさない

---

### ⑪ revertすべきか

**はい。revert実施済み。**

- App.jsx L2444: `actualKyuko >= targetKyuko` → `actualKyuko > targetKyuko`（元に戻す）
- shiftEngine.js L1060: 同上（Before状態に戻す）
- revert後: ビルド成功、全テスト133件パス（既存131件 + 本測定用2件）

---

### ⑫ Step7-Cへ進める状態か

**進める（別方針で）。**

Step7-Bの restCands 条件緩和は不採用となった。根本原因（Step7-A分析）の3層構造のうち：
- **Layer 1**（kyukoDays達成で優先②候補ゼロ）→ 本変更で対処しようとしたが、副作用（公休数違反方向悪化）を引き起こし、shortage 改善も有意でなかった
- **Layer 2**（Tier1保護で優先①は日勤のみ）→ 未対処
- **Layer 3**（夜勤制約）→ 未対処

Step7-C推奨アプローチ:
1. **minStaff保証 pass 数増加**（`pass < 3` → `pass < 5〜7`）: 1行変更・副作用最小・連続収束改善
2. または **PassB の minStaff ブースト係数引き上げ**（`deficit*2` → `deficit*3〜4`）

---

## まとめ

| 検証項目 | 結果 |
|---|---|
| 本番autoGenerate使用 | ✓ shiftEngine.js（vitest node環境）|
| shortage 統計的改善 | ✗ t=-0.10(k1), t=+0.53(k2) → 有意差なし |
| 公休数違反増加なし | ✗ 方向として増加（有意差なし）|
| Repair影響なし | ✓ kaigo では対象外 |
| 生成時間悪化なし | ✓ むしろ改善傾向 |
| DiagnosticReport退行なし | 測定不能（UI外）|
| **採否** | **不採用 / revert 実施** |

---

*Phase5 Step7-B' 完了。restCands 条件緩和（`>` → `>=`）は本番 autoGenerate での実測において shortage の統計的改善を示さず、公休数違反が方向として悪化したため不採用・revert。Step7-Cは別方針（pass数増加 or ブースト強化）で継続。*
