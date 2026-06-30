# STEP7DA_PASSB_ANALYSIS.md
# Phase5 Step7-DA — PassB minStaffブースト係数 調査・分析設計書

作成: 2026-06-30
対象ブランチ: phase5/night-balance
対象ファイル: src/shiftEngine.js（読み取り専用調査）
実測: なし（コード読み取り・静的分析のみ）

---

## 必須回答 ①〜⑫

---

### ① PassB 全体フローの中での boost 適用箇所

**shiftEngine.js L641〜783**（PassB全体）

PassB は全スタッフの「勤務日（PassA後の未割当日）」にシフトを確率サンプリングで配置するフェーズ。
2つのパスに分岐する。

#### Path A（ratio指定あり、L706〜730）

```javascript
if (ratio && Object.values(targetShiftCounts[s.id]).some(v => v > 0)) {
  // ratio に基づき targetShiftCounts を計算済み
  // 非日勤シフトを weightedSampleN で先確保
  // slot-first（maxStaff<99）のシフトは除外
  remaining.forEach(d => { res[s.id][d] = nikkin; }); // 残りは日勤
}
```

**Path A では deficit boost を一切適用しない。**
ratio指定あり = shiftRatio 設定済みスタッフ専用パス。

#### Path B（ratio指定なし、L731〜776）

```javascript
workDays.forEach(d => {
  const probs = {};
  allowed.forEach(k => { probs[k] = getShiftWeight(d, k); }); // ベース重み
  const dayCnts = {};
  dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
  allowed.forEach(k => {
    const deficit = Math.max(0, (dept.minStaff[k] || 0) - (dayCnts[k] || 0));
    if (deficit > 0) { probs[k] = (probs[k] || 0.01) * (1 + deficit * 2); hasDeficit = true; } // ★boost
    if ((dayCnts[k] || 0) >= (maxStaff[k] ?? 99)) { probs[k] = 0; hasCapacity = true; } // cap
  });
  const pick = sampleFromProbs(probs) || ...;
  res[s.id][d] = pick;
});
```

**boost が適用されるのは Path B のみ。**

---

### ② deficit × 2 の適用箇所（全ファイル）

| ファイル | 行番号 | コード |
|---|---|---|
| src/shiftEngine.js | L742 | `if (deficit > 0) { probs[k] = (probs[k] || 0.01) * (1 + deficit * 2); hasDeficit = true; }` |
| src/App.jsx | L2101〜2108 相当 | 同一ロジック（shiftEngine.js の分離エクスポート元） |

**合計2箇所（shiftEngine.js + App.jsx の同期ペア）。**

---

### ③ 係数が × 2 である理由

コードコメントにドキュメント記載なし。shiftEngine.js 全体を検索しても係数選定根拠の注記はない。

構造から推測される設計意図:
- `1 + deficit * 2` = deficit=0 のとき係数1.0（ベース重みそのまま）、deficit=1 のとき係数3.0（3倍）、deficit=2 のとき係数5.0（5倍）
- deficit が整数（minStaff=1 のシフトなら deficit は最大1）のため、小さな boost 倍率を使っても「確実に選ばれる」にはならない。確率的サンプリングなので 3倍では他シフトが選ばれることもある。
- とはいえ極端に大きな係数（× 10 など）にすると他シフトがほぼ無視され、連続勤務制約・遷移制約（PassC）との衝突が増える。
- 推測: 「適度な引き上げで shortage を減らしつつ、他制約違反を招かない」経験的中間値として × 2 が採用された。

---

### ④ deficit=0/1/2/3 時の probs 重み変化表

`getShiftWeight` の戻り値 = `w` とする。

| deficit | 乗数 (1 + deficit * 2) | 変化後 probs[k] | 倍率 |
|---|---|---|---|
| 0 | 1.0 | w | ×1.0（変化なし） |
| 1 | 3.0 | w × 3 | ×3.0 |
| 2 | 5.0 | w × 5 | ×5.0 |
| 3 | 7.0 | w × 7 | ×7.0 |

deficit × 3 案での比較:

| deficit | 現行 (×2) 乗数 | 提案 (×3) 乗数 | Δ倍率 |
|---|---|---|---|
| 0 | 1.0 | 1.0 | ±0 |
| 1 | 3.0 | **4.0** | +33% |
| 2 | 5.0 | **7.0** | +40% |
| 3 | 7.0 | **10.0** | +43% |

kaigo1/kaigo2 の実際の minStaff 構成（早番:1, 日勤:1, 遅番:1, 夜勤:1）では deficit は最大1（minStaff=1 のため）。
実際に発生するのは **deficit=1 のケースのみ**（×3 → ×4、+33%増）。

---

### ⑤ PassB 後に残る shortage 量

#### PassA〜PassB〜PassC の流れ

```
PassA: 夜勤配置 → 夜勤不足日 → shortage（候補枯渇時 break で許容）
PassA: 休み配置 → kyukoDays 確保
PassB: 残りの勤務日にシフト配置（deficit boost あり）
PassC: 連続勤務超過を休みに変換（shortage 再発の原因）
公休数調整: 公休超過日は日勤へ変換、不足日は日勤→休みへ変換
enforceMaxStaff: maxStaff超過を除去
minStaff保証: 3-pass（優先①スライド + 優先②休み→勤務）
```

#### shortage が残るメカニズム（2層）

**Layer 1: PassB 後 shortage（PassB 段階で解消されないケース）**

- **夜勤 shortage**: `allowed = getAllowedTypes(s).filter(k => k !== '夜勤' && k !== '明け')` （L674）により、PassB の allowed から夜勤が除外されている。PassB の deficit boost は夜勤に**一切適用されない**。夜勤 shortage は PassA 段階で発生し、PassB では手を加えられない。
- **早番/遅番 shortage（maxStaff=1）**: ds.forEach の staff 処理順で最初のスタッフが早番/遅番を取ると `dayCnts[k]=1` → `probs[k]=0`（cap）。以降のスタッフは選択不可。deficit boost は処理順の早いスタッフに有利に働くが、1名確保後は boost の適用余地がない（minStaff=1 なので 1名確保で deficit 解消）。

**Layer 2: PassC・公休数調整後の shortage 再発**

- PassC（L785〜793）: 連続勤務超過スタッフの勤務日を休みに変換。早番/遅番/日勤が変換される可能性あり。
- 公休数調整（L815〜864）: 公休超過スタッフの休み→日勤変換、および不足スタッフの日勤→休み変換。この段階でも minStaff が再び割り込む。

Step7-C 実測（150試行, bestOfN=30）での shortage 内訳（After=現行 pass<3 相当の Before値）:

| shortage 種別 | kaigo1 μ | kaigo2 μ |
|---|---|---|
| 夜勤 shortage | 0.347 | 0.420 |
| 早番 shortage | 0.113 | 0.100 |
| 遅番 shortage | 0.000 | 0.000 |
| 日勤 shortage | 0.000 | 0.000 |
| **合計** | **0.460** | **0.520** |

**夜勤 shortage が全 shortage の 75〜81% を占める。**

---

### ⑥ deficit boost が夜勤 shortage に効かない理由

```javascript
// shiftEngine.js L673-675
const workDays = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
const allowed = getAllowedTypes(s).filter(k => k !== '夜勤' && k !== '明け');
//                                                       ^^^^^^^^^^^^^^^^^^
//                                          夜勤・明けは PassB の allowed から除外
if (!allowed.length) return;
```

PassB は「勤務日の昼間シフト（早番/日勤/遅番）」を配置するフェーズ。夜勤は PassA 専用。
allowed に夜勤が含まれないため、`deficit = Math.max(0, dept.minStaff['夜勤'] - dayCnts['夜勤'])` が計算されても probs['夜勤'] への加算対象がない。

→ **deficit boost の係数をいくら大きくしても夜勤 shortage には無効。**

---

### ⑦ deficit × 3 改善ポテンシャル（理論分析）

#### 有効ケース（理論上）

- **早番/遅番 shortage（全体の 20〜25%）** に限定して有効。
- deficit=1（minStaff=1 なので最大値）のとき、選択確率が ×3 → ×4 に増加（+33%）。
- ds.forEach の処理順で早番/遅番の deficit が残っているスタッフが後処理の場合、boost 強化により選択確率が上がる。

#### 無効ケース・制限

1. **夜勤 shortage（75〜81%）**: allowed 除外のため完全無効。
2. **maxStaff=1 の cap（早番/遅番）**: 1名が確保した後は `probs[k]=0` 固定。2名目以降は boost 不要（deficit 解消済み）かつ cap で選択不可。
3. **Path A（ratio指定あり）スタッフ**: boost 適用なし。係数変更の影響対象外。
4. **PassC・公休数調整での再発**: PassB 段階で deficit を解消しても、PassC や公休数調整で早番/遅番スタッフが「休み」へ変換されると shortage が再発し、minStaff保証へ委ねられる。
5. **minStaff保証の anyFixed break**: 既に Step7-C で確認済み。最終的な shortage 解消能力はスライド候補・restCands の枯渇に依存。

#### 理論上の最大改善量（早番/遅番のみ）

Step7-C 実測より、早番 shortage = kaigo1: 0.113/trial、kaigo2: 0.100/trial。
係数 +33% の影響が早番 shortage にそのまま反映されると仮定しても:
- 改善量上限 ≒ 0.113 × 33% ≈ 0.037/trial（kaigo1）
- 合計 shortage に対する割合 ≈ 0.037 / 0.460 ≈ 8%

**統計的有意性（t > 1.96）の達成には 150 試行ではσが大きすぎる可能性が高い。**
（Step7-C では shortage Δ=-0.033 で t=-0.25 → 有意差なし。+33% の係数変化でも同様か以下の効果量と推測。）

---

### ⑧ boost 係数変更のリスク

1. **Path A スタッフへの影響なし（中立）**: ratio指定スタッフは boost の対象外のため、変更による意図しない副作用なし。
2. **早番/遅番の過剰集中（低リスク）**: maxStaff=1 のため cap が即時適用される。複数スタッフが同日の早番/遅番を「狙う」ことはあっても cap 到達後は probs=0 に落ちるため、過剰配置は発生しない。
3. **連続勤務違反（低リスク）**: deficit boost は選択確率の倍率のみ変更。スタッフが早番/遅番を多く選ぶ傾向が僅かに増えるが、PassC（L785〜793）が連続勤務超過を休みに変換するため二重制御あり。
4. **公休数違反（低〜中リスク）**: Step7-B（restCands 緩和）でも観察されたように、早番/遅番の配置強化により公休数調整フェーズとの競合が生じる可能性。ただし係数は +33% 増（3→4 倍）と小幅なため影響は Step7-B より小さい見込み。
5. **score 悪化（不明）**: 学習データ（dowShiftRate/trend）と deficit boost が競合する場合、trend top シフトが選ばれにくくなる可能性あり（stepC実測で -182 〜 +655 の変動）。

---

### ⑨ Path A スタッフへの影響

**Path A スタッフ（ratio 指定あり）には deficit boost が適用されない**（L706〜730 参照）。
係数変更の影響対象は Path B スタッフ（ratio指定なし）のみ。
kaigo1/kaigo2 では ratio=null のスタッフが大半（test環境では全スタッフ ratio=null）。

実環境でも kaigo 部署の多数スタッフは `shiftRatio=null`（設定なし）のため Path B が主パス。

---

### ⑩ 改善候補ランキング（PassB boost 変更候補を含む）

| 順位 | 候補 | 対象shortage | 理論改善量 | リスク | 判定 |
|---|---|---|---|---|---|
| 1位 | **PassA 夜勤配置の候補拡大**（nightOk制約/foreignNightSupportRequired 緩和） | 夜勤（75〜81%） | 高（shortage 主因を直撃） | 中〜高（業務制約変更） | 要調査 |
| 2位 | **PassA break 廃止 → 強制配置**（nightOk=false スタッフへの夜勤強制） | 夜勤（75〜81%） | 高 | 高（労務制約違反） | 実務上不可 |
| 3位 | **PassB boost 係数引き上げ（×2→×3）** | 早番（20〜25%） | 低（理論 ≤8%、t有意未到達疑い） | 低 | 実測要 |
| 4位 | **minStaff保証の候補選択改善**（anyFixed break 廃止 → 固定回数） | 早番/遅番 | 低（Step7-C実証済みで無効） | 低 | 不採用済み（Step7-C） |
| 5位 | **restCands 条件緩和（>= targetKyuko）** | 早番/遅番 | 低（Step7-B実証済みで無効） | 低〜中 | 不採用済み（Step7-B'） |

---

### ⑪ Step7-DB（deficit × 3 実装・実測）への進出可否

**進める。ただし期待効果は限定的。**

理由:
- 実装難度: 1行変更（shiftEngine.js + App.jsx の2ファイル）
- リスク: 低（maxStaff cap で過剰配置を防止済み）
- 期待改善量: 早番 shortage の最大 8%（合計 shortage の）→ t有意未到達の可能性大
- 副作用: 公休数違反への影響は実測で確認必要

**夜勤 shortage（75〜81%）には boost 係数変更は無効**という構造的事実を踏まえ、
Step7-DB は「早番/遅番の僅かな改善の確認 + 夜勤 shortage 対策方針を別途検討する」位置づけが適切。

---

### ⑫ Step7-DA 調査まとめ

| 調査項目 | 結論 |
|---|---|
| boost 適用箇所 | shiftEngine.js L742（Path B のみ）、App.jsx 同一行 |
| Path A への適用 | なし（ratio指定スタッフは deficit boost を受けない） |
| 夜勤 shortage への効果 | **ゼロ**（PassB allowed から夜勤を除外のため） |
| 早番/遅番への効果 | maxStaff=1 cap で 1 名確保後は即無効化 |
| deficit × 3 の最大改善量 | 早番 shortage の ≤33%、合計 shortage の ≤8% |
| 統計的有意性到達予測 | 困難（Step7-C で Δ=-0.033, t=-0.25 → 今回の効果量はそれ以下） |
| リスク | 低（係数 +33%、maxStaff cap 保護あり） |
| 根本的な shortage 原因 | **夜勤 shortage（75〜81%）** = PassA 段階の候補枯渇（nightOk制約） |
| 次の優先アクション | PassA の夜勤配置候補拡大（Step7-E方向）を別途調査 |

---

## PassB フロー詳細図

```
autoGenerate 呼び出し
  │
  ├── PassA: 夜勤配置
  │     ├── nightOk スタッフから候補抽出
  │     ├── 候補なし → break → 夜勤 shortage（★shortage の 75〜81%）
  │     └── 夜勤/明け 配置完了
  │
  ├── PassA: 休み配置（kyukoDays）
  │
  ├── PassB: 勤務シフト配置
  │     ├── Path A（ratio指定あり）: targetShiftCounts に従い weightedSampleN → deficit boost なし
  │     └── Path B（ratio指定なし）: 確率サンプリング
  │           ├── getShiftWeight でベース重み
  │           ├── deficit boost: probs[k] *= (1 + deficit * 2) ← ★変更候補
  │           ├── cap: probs[k] = 0 if dayCnts[k] >= maxStaff[k]
  │           └── 早番/遅番の deficit 解消（1名で deficit→0）
  │
  ├── PassC: 連続勤務超過 → 休みへ変換（早番/遅番 shortage 再発の可能性）
  │
  ├── 公休数調整（日勤⇔休み変換）
  │
  ├── enforceMaxStaff（×3回）
  │
  └── minStaff保証（3-pass, anyFixed break）
        ├── 優先①: 他シフト→対象シフトへスライド（Tier1保護考慮）
        ├── 優先②: 休み→対象シフト（actualKyuko > targetKyuko のみ）
        └── anyFixed=false → break（候補枯渇で早期終了 ← Step7-C 確認済み）
```

---

*Phase5 Step7-DA 完了。PassB boost 係数（deficit × 2）は夜勤 shortage（75〜81%）に無効、早番のみに理論的効果あり（≤8%）。Step7-DB 実測に進む価値はあるが期待値は低い。根本解決は PassA 夜勤候補拡大方針（Step7-E）を要検討。*
