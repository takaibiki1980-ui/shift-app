# STEP7C_PASS_COUNT_RESULT.md
# Phase5 Step7-C — minStaff保証 pass回数増加（3→5）実装・本番実測検証結果

作成: 2026-06-30
対象ブランチ: phase5/night-balance
実装: App.jsx + shiftEngine.js の minStaff保証ループ pass上限を 3→5 に変更
実測: 150試行 × kaigo1/kaigo2 × bestOfN=30（本番autoGenerate使用）
最終判定: **不採用 / revert 実施**

---

## 必須回答 ①〜⑫

### ① 変更ファイル

`src/App.jsx` および `src/shiftEngine.js`（2ファイル）

### ② 変更関数

`autoGenerate`（minStaff保証フェーズ）のみ

### ③ 変更行数

**2行**（各ファイル1行、合計2行）

### ④ 変更内容

```diff
// App.jsx L2383 / shiftEngine.js L1014
- for (let pass = 0; pass < 3; pass++) {
+ for (let pass = 0; pass < 5; pass++) {
```

localSearchImprove のループ（App.jsx L2942, shiftEngine.js L1463）は別ループのため**無変更**。

---

### ⑤ Before/After比較表（150試行、本番autoGenerate使用）

#### kaigo1

| KPI | Before(μ) | After(μ) | Δ | t値 | 判定 |
|---|---|---|---|---|---|
| ① shortage/trial | 0.460 | 0.440 | -0.020 | -0.25 | → 有意差なし |
| ② 夜勤shortage | 0.347 | 0.353 | +0.006 | — | → 変化なし |
| ③ 早番shortage | 0.113 | 0.080 | -0.033 | — | → 微減 |
| ④ 遅番shortage | 0.000 | 0.007 | +0.007 | — | → 変化なし |
| ⑤ 日勤shortage | 0.000 | 0.000 | ±0 | — | → 変化なし |
| ⑥ 公休数違反 | 7.113 | 7.227 | **+0.114** | +1.04 | → 有意差なし（悪化方向） |
| ⑦ 連勤違反 | 1.780 | 1.680 | -0.100 | -0.60 | → 有意差なし |
| ⑧ score | 448,970 | 448,788 | -182 | -0.05 | → 変化なし |
| ⑩ 生成時間(ms) | 192.5 | 196.5 | **+4.0** | +1.49 | → 有意差なし（微増） |
| ⑫ maxStaff違反 | 0.000 | 0.000 | ±0 | — | → 変化なし |

#### kaigo2

| KPI | Before(μ) | After(μ) | Δ | t値 | 判定 |
|---|---|---|---|---|---|
| ① shortage/trial | 0.520 | 0.480 | -0.040 | -0.45 | → 有意差なし |
| ② 夜勤shortage | 0.420 | 0.353 | -0.067 | — | → 微減 |
| ③ 早番shortage | 0.100 | 0.120 | +0.020 | — | → 変化なし |
| ④ 遅番shortage | 0.000 | 0.007 | +0.007 | — | → 変化なし |
| ⑤ 日勤shortage | 0.000 | 0.000 | ±0 | — | → 変化なし |
| ⑥ 公休数違反 | 7.060 | 7.153 | **+0.093** | +0.78 | → 有意差なし（悪化方向） |
| ⑦ 連勤違反 | 1.673 | 1.807 | +0.134 | +0.79 | → 有意差なし |
| ⑧ score | 443,260 | 443,915 | +655 | +0.16 | → 変化なし |
| ⑩ 生成時間(ms) | 194.4 | 191.9 | -2.5 | -1.18 | → 有意差なし |
| ⑫ maxStaff違反 | 0.000 | 0.000 | ±0 | — | → 変化なし |

> ⑨ syncRate: shiftTrend={} のため計測不能（trendデータなし）。
> ⑪ 採用試行率: bestOfN 内部の試行選択 indexの変化は本計測環境では追跡不能。

---

### ⑥ shortage改善率

| 部署 | Before | After | Δ | 改善率 | t値 |
|---|---|---|---|---|---|
| kaigo1 | 0.460 | 0.440 | -0.020 | **-4.3%** | -0.25 |
| kaigo2 | 0.520 | 0.480 | -0.040 | **-7.7%** | -0.45 |

**shortage は両部署ともに方向として改善しているが、t値が 1.96 に遠く及ばないため統計的に有意でない。**

構造的理由: minStaff保証の `anyFixed` 早期 break（全 shortage が pass 1〜2 回で解消または解消不能となる）により、pass を 3→5 に増やしてもほとんどのケースで 3 pass 目以降は `anyFixed=false` となり即 break する。追加 pass は実質ノーオペレーションとなる。

---

### ⑦ 公休数への副作用

- 公休数違反: kaigo1 +0.114（t=+1.04）、kaigo2 +0.093（t=+0.78）
- 両部署ともに有意差なし。方向は微増（悪化方向）。

**採用判定条件「公休数違反が悪化しない」は有意差なしだが方向として悪化のため条件を満たさない。**

---

### ⑧ scoreへの影響

- kaigo1: -182（t=-0.05）→ 変化なし
- kaigo2: +655（t=+0.16）→ 変化なし

実質影響ゼロ。

---

### ⑨ syncRateへの影響

shiftTrend={} のため本計測環境では計測不能。理論上、minStaff保証フェーズのみの変更であり dowShiftRate ベースの syncRate には直接影響しない。

---

### ⑩ 実装を採用すべきか（実測値のみで判断）

**不採用。**

理由（実測値のみ）:
1. shortage: kaigo1 t=-0.25、kaigo2 t=-0.45 → 両部署ともに統計的有意差なし
2. 公休数違反: 方向として微増（有意差なし）
3. 構造的根本原因（`anyFixed` break による早期終了）により pass 数増加が機能しない

---

### ⑪ revertすべきか

**はい。実施済み。**

- App.jsx L2383: `pass < 5` → `pass < 3`
- shiftEngine.js L1014: `pass < 5` → `pass < 3`
- revert後: ビルド成功、全テスト134件パス

---

### ⑫ Step7-Dへ進める状態か

**進める（別方針で）。**

Step7-C不採用の根本原因分析：

`anyFixed` が `false` になると即 `break` する設計のため、pass 1〜2 回で収束するか解消不能かが確定する。3 pass 以降は新たな `anyFixed=true` が生じる余地がない（優先①スライド候補・優先②休み→勤務候補がどちらも枯渇した状態では何度 pass を繰り返しても変化しない）。

→ **pass回数増加はアプローチとして根本的に無効**（Step7-Cの構造的限界）。

#### Step7-D 推奨: PassB の minStaff ブースト係数引き上げ

shortage の発生はminStaff保証フェーズで解消できないケース（候補枯渇）が本質的原因。PassB の段階でより積極的に minStaff を充足させることで、minStaff保証フェーズへの依存を減らす。

```javascript
// 現行: L2106 (App.jsx) / shiftEngine.js 相当
if (deficit > 0) probs[k] = (probs[k] || 0.01) * (1 + deficit * 2);
// 案: deficit * 3 〜 deficit * 4 へ引き上げ
if (deficit > 0) probs[k] = (probs[k] || 0.01) * (1 + deficit * 3);
```

ただし、比率指定（shiftRatio）との競合・過度の集中が生じる可能性があるため、実装後の実測確認が必須。

---

## まとめ

| 検証項目 | 結果 |
|---|---|
| 本番autoGenerate使用 | ✓ shiftEngine.js（vitest node環境）150試行 |
| shortage 統計的改善 | ✗ t=-0.25(k1), t=-0.45(k2) → 有意差なし |
| 公休数違反悪化なし | ✗ 方向として微増（有意差なし）|
| 重大な副作用 | なし（maxStaff違反ゼロ） |
| 生成時間悪化 | なし（+4ms/−2.5ms、有意差なし）|
| **採否** | **不採用 / revert 実施** |

---

*Phase5 Step7-C 完了。pass回数増加（3→5）は本番autoGenerateで統計的有意改善を示さず。構造的根本原因（anyFixed break による早期終了）により pass 数増加は無効。revert 実施済み。Step7-D は PassB ブースト係数引き上げを推奨。*
