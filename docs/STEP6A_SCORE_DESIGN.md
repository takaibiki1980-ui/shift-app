# STEP6A_SCORE_DESIGN.md
# Phase5 Step6-A — transitionRate → scoreShifts 組み込み 設計書

作成: 2026-06-30
対象ブランチ: phase5/night-balance
調査範囲: src/App.jsx L2763-L2910, L2912-L2975, L2980-L3010
コード変更: なし（設計のみ）

---

## 必須回答 ① scoreShifts の完全フロー図

```
scoreShifts(res, ds, dept, days, year, month, shiftTrend = {})
  │
  ├─ [初期化]
  │   WORK = buildDeptWorkTypes(customShiftDefs)
  │   REST = {'休み','希望休'}
  │   maxConsec = dept.maxConsecutive || 5
  │   maxStaffSc = {shiftKey: 上限} (customShiftDefs 考慮)
  │
  ├─ [スタッフループ: for s of ds]
  │   │
  │   ├─ P1: 公休数逸脱ペナルティ
  │   │   actualKyuko = REST に該当するシフト数
  │   │   score += |actualKyuko - targetKyuko| × 10,000
  │   │
  │   ├─ P2: 連続勤務違反ペナルティ
  │   │   d=1..days: WORK && ≠明け が maxConsec 超えるごとに
  │   │   score += 100
  │   │
  │   └─ P3: 禁止遷移ペナルティ（isBadTransition に相当）
  │       d=2..days:
  │       ・遅番→早番 / 遅番→日勤 → score += 100
  │       ・日勤→早番 → score += 100
  │       ・intervalEnabled 時: インターバル不足 → score += 100
  │       ※ 同一シフト連続ペナルティ（4連=1500, 5連以上=6000/日）も同ループ
  │
  ├─ [日付ループ: for d=1..days]
  │   ├─ P4: minStaff不足ペナルティ
  │   │   actual == 0 → score += minC × 1000
  │   │   actual < minC → score += (minC - actual) × 300
  │   └─ P5: maxStaff超過ペナルティ
  │       actual > maxC → score += (actual - maxC) × 150
  │
  ├─ [公平性ペナルティ: ds.length > 1]
  │   P6: 夜勤回数分散 → score += (varN / ds.length) × 500
  │   P7: 土日出勤回数分散 → score += (varW / ds.length) × 200
  │
  ├─ [役職制限ペナルティ]
  │   P8: roleShiftTypes 違反 1件 → score += 5,000
  │
  ├─ [勤務比率乖離ペナルティ]
  │   P9: |actualRatio - targetRatio| × 100 × 50 (per shiftKey per staff)
  │
  └─ [学習適合ペナルティ: 現行 dowShiftRate/dowRestRate 使用]
      P10: LEARN_TYPES（夜勤・明け除く勤務）
          predictedProb = dowShiftRate[dow][shift] or freq[shift]
          score += (1 - predictedProb) × 30
      P11: LEARN_REST（休み・希望休）
          restProb = dowRestRate[dow6]
          score += (1 - restProb) × 30
      ★ transitionRate は P10/P11 いずれにも使用されていない ★

  return score  ← 値が小さいほど良い試行として bestOfN が採用
```

---

## 必須回答 ② 現在の score 計算式一覧

| ID | 名称 | 計算式 | 点数規模 | 行番号 |
|---|---|---|---|---|
| P1 | 公休数逸脱 | `|actualKyuko - targetKyuko| × 10,000` | 10,000/日 | L2774-L2776 |
| P2 | 連続勤務違反 | `maxConsec超え1日 × 100` | 100/日 | L2782 |
| P3 | 禁止遷移（遅→早・日→早等） | `違反1件 × 100` | 100/件 | L2788 |
| P3b | 同一シフト4連 | `1,500/回` | 1,500/回 | L2796 |
| P3c | 同一シフト5連以上 | `6,000/日` | 6,000/日 | L2797 |
| P4 | minStaff完全0 | `minC × 1,000` | 1,000〜4,000 | L2808 |
| P4b | minStaff不足（1人以上いる） | `(minC - actual) × 300` | 300〜900 | L2808 |
| P5 | maxStaff超過 | `(actual - maxC) × 150` | 150〜 | L2813 |
| P6 | 夜勤回数分散 | `(varN / ds.length) × 500` | 0〜数千 | L2840 |
| P7 | 土日出勤分散 | `(varW / ds.length) × 200` | 0〜数百 | L2841 |
| P8 | 役職制限違反 | `5,000/件` | 5,000/件 | L2851 |
| P9 | 勤務比率乖離 | `|Δratio| × 100 × 50` | 0〜数百 | L2875 |
| P10 | dowShiftRate適合 | `(1 - predictedProb) × 30` | 0〜30/日 | L2899 |
| P11 | dowRestRate適合 | `(1 - restProb) × 30` | 0〜30/日 | L2903 |

### 点数スケール比較（月31日・10名規模）

| 制約クラス | 典型値 | 備考 |
|---|---|---|
| Hard（P1,P8） | 10,000 / 5,000 点 | 1件で全体を支配 |
| Semi-Hard（P4,P3b/c） | 300〜6,000 点 | 現場制約として重要 |
| Medium（P5,P6,P7） | 150〜2,000 点 | 公平性・上限管理 |
| Soft（P9,P10,P11） | 0〜100 点 | 学習・比率の誘導 |
| **追加予定（P12）** | **0〜50 点** | **transitionRate（設計案）** |

---

## 必須回答 ③ transitionRate を入れる最適位置

### 追加位置: L2908 直後（学習適合ペナルティブロック P10/P11 の末尾）

```
現行 L2879-L2908:
  // ④⑤ 学習適合ペナルティ: 勤務日も休日も含む。1人1日あたり最大100点
  ...
  if (shiftTrend && ds.length > 0) {
    ...
    for (const s of ds) {
      ...
      for (let d = 1; d <= days; d++) {
        ... P10/P11 計算 ...
      }
    }
  }
  ← ここに P12（transitionRate ペナルティ）を追加 ← L2908 直後

  return score;  ← L2909
```

### 理由

1. **同じ `shiftTrend` ガード内に収まる**: shiftTrend が空のとき自動的にスキップされる（フォールバック自動対応）
2. **P10/P11 と同一ループ構造で書ける**: `d=2..days` の前日参照パターンは P3（L2786）と同じ
3. **点数スケールを P10/P11 と揃えやすい**: `(1 - rate) × weight` の形で weight=25 程度にすれば既存より軽い誘導に収まる
4. **Hard制約（P1, P8）を逆転しない**: 月31日 × 10名 × 25点 = 最大7,750点。P1の10,000点未満に収まる

### d=1（月初日）の前日シフト問題

`scoreShifts` は現在 `prevTail` を受け取らない。d=1 の前日（前月末）シフトは `res` 内に存在しない。

**設計判断: d=2..days のみ対象（月初日はスキップ）**

- 前月末シフトを参照するには `prevTail` を引数に追加し、呼び出し箇所4点（L2940, L2968, L2998, L3005）も変更が必要
- 月1日は31日のうち1日（3%）であり、スキップによる情報損失は軽微
- 実装コスト最小を優先するため d=2..days のみとする
- 将来的に prevTail を追加する場合は別ステップで検討

---

## 必須回答 ④ 案A・B・C 比較表

### 前提: scoreShifts は低スコアが優良。全ペナルティは `score +=` で加算。

---

### 案A（加点方式）— ユーザー記述: `score += transitionRate(prev,curr) × weight`

**注意**: そのままの式では「よく起きる遷移ほどスコアが高くなる（悪化）」という逆効果になる。

正しい実装は **逆数形式**: `score += (1 - transitionRate[prev][curr]) × weight`

これにより「珍しい遷移ほどペナルティが大きく」なり、既存の P10/P11 と同じ設計思想に揃う。

```javascript
// 案A 実装イメージ（P10/P11ブロック内に追加）
for (let d = 2; d <= days; d++) {
  const prev = res[s.id]?.[d - 1];
  const curr = res[s.id]?.[d];
  if (!prev || !curr) continue;
  const rate = trend?.transitionRate?.[prev]?.[curr];
  if (rate != null) {
    score += (1 - rate) * TRANS_WEIGHT; // TRANS_WEIGHT = 25 推奨
  }
  // rate が null（学習データなし）→ ペナルティなし（フォールバック自動）
}
```

| 項目 | 評価 |
|---|---|
| 適用範囲 | 全遷移（rate が存在する全 prev→curr）|
| フォールバック | rate=null → ペナルティ0（データなし遷移はスキップ） |
| スコール影響 | 月31日×10名≒310遷移 × 最大25点 = 最大7,750点（P1より小） |
| 実装行数 | +7行（P10/P11ループ内に追加） |
| リスク | 低：既存スケールを破壊しない |

---

### 案B（低確率のみ減点）— ユーザー記述: `if(rate < threshold){ score += penalty; }`

```javascript
// 案B 実装イメージ
const TRANS_THRESHOLD = 0.1; // 過去10%未満の遷移を「異常」とみなす
const TRANS_PENALTY = 50;

for (let d = 2; d <= days; d++) {
  const prev = res[s.id]?.[d - 1];
  const curr = res[s.id]?.[d];
  if (!prev || !curr) continue;
  const rate = trend?.transitionRate?.[prev]?.[curr];
  if (rate != null && rate < TRANS_THRESHOLD) {
    score += TRANS_PENALTY;
  }
}
```

| 項目 | 評価 |
|---|---|
| 適用範囲 | rate < threshold の遷移のみ（スパース） |
| フォールバック | rate=null → スキップ（データなし遷移は閾値未満か不明なため無罰） |
| スコア影響 | 違反件数 × 50点（不連続・離散的なペナルティ） |
| 閾値の感度 | threshold=0.1 の根拠が実測なし。施設ごとに最適値が異なる可能性 |
| 問題点 | ① rate=0（1度も発生しない遷移）と rate=null（データなし）の区別が不可能<br>② threshold のチューニングが必要 |
| 実装行数 | +8行（threshold/penalty 定数 +ループ） |

---

### 案C（順位補正）— score には加算せず、候補順位のみ補正

`scoreShifts` は「試行結果の総合評価スコア」を返す関数であり、個別セルの候補選択は行わない。
候補順位の補正（候補Aより候補Bを優先するソート）は autoGenerate の PassA/PassB で行うべき操作であり、`scoreShifts` の責務外。

**案C は scoreShifts 内では実装不可能。**

代替的に「案C相当の改善」を実現するなら Step6-B（`getShiftWeight` 拡張）として別途実装する。

| 項目 | 評価 |
|---|---|
| scoreShifts 内での実装可否 | **不可**（候補選択はすでに完了した結果を評価するだけ） |
| 代替実装場所 | autoGenerate PassB の `getShiftWeight`（Step6-B） |
| Step6-A での採用 | ❌ 対象外 |

---

### 比較表まとめ

| 評価軸 | 案A（逆数加算） | 案B（閾値超罰） | 案C（順位補正） |
|---|---|---|---|
| scoreShifts 内実装可否 | ✅ | ✅ | ❌ |
| フォールバック（データなし） | ✅ 自動スキップ | ⚠️ 区別不可 | — |
| パラメータ数 | 1（weight） | 2（threshold/penalty） | — |
| スコア連続性 | ✅ 連続値 | ❌ 離散（0 or penalty）| — |
| 既存設計との一貫性 | ✅ P10/P11 と同形 | △ 異質な不連続ペナルティ | — |
| チューニング容易性 | ✅ weight 1本 | ❌ threshold + penalty の2変数 | — |
| リスク | 低 | 中（閾値根拠なし） | — |
| 期待効果 | ★★★☆☆ | ★★☆☆☆ | — |

---

## 必須回答 ⑤ 実装難易度

| 案 | 難易度 | 根拠 |
|---|---|---|
| 案A | **低** | 既存 P10/P11 ループに +7行追加。変更関数は `scoreShifts` のみ。引数変更なし |
| 案B | **低〜中** | 行数は同等だが、threshold の根拠を実測で定める必要がある |
| 案C | **高** | scoreShifts の責務を超える。autoGenerate まで変更が必要 |

---

## 必須回答 ⑥ 変更ファイル

`src/App.jsx` のみ（1ファイル）

---

## 必須回答 ⑦ 変更関数

`scoreShifts`（L2763）のみ

---

## 必須回答 ⑧ 既存コード変更量（概算行数）

**追加: +7〜10行**（既存コードの削除・変更はゼロ）

```
追加位置: L2908 と L2909 (`return score;`) の間

[追加内容（案A採用時）]
  // P12: 遷移確率適合ペナルティ（transitionRate）
  const TRANS_WEIGHT = 25;
  if (shiftTrend && ds.length > 0) {
    for (const s of ds) {
      const tKey = trendKeys.find(k => nameMatch(k, s.name));
      const trend = tKey ? shiftTrend[tKey] : null;
      if (!trend?.transitionRate) continue;
      for (let d = 2; d <= days; d++) {
        const prev = res[s.id]?.[d - 1], curr = res[s.id]?.[d];
        if (!prev || !curr) continue;
        const rate = trend.transitionRate[prev]?.[curr];
        if (rate != null) score += (1 - rate) * TRANS_WEIGHT;
      }
    }
  }
```

実際の実装では、既存の `trendKeys` 変数が P10/P11 ブロックで既に定義されているため、そのスコープ内に組み込むことで +7行に削減可能。

---

## 必須回答 ⑨ 他部署への影響

### kaigo1 / kaigo2（介護部）

- `bestOfN` → `scoreShifts` 経由で **直接影響**
- `transitionRate` が存在するスタッフ（`totals >= 10` かつ DB に遷移データあり）のみ有効
- データなしスタッフ: 影響ゼロ（フォールバック: `trend.transitionRate` が null/undefined → スキップ）

### eiyo（栄養科）

- `generateTimeAxis` エンジンを使用。`bestOfN` / `scoreShifts` を**呼ばない**
- Step6-A の影響範囲外

### 他部署（未定義 / 将来追加）

- `engineType !== 'time'` の部署はすべて `bestOfN` 経由 → **同様に影響する**
- ただし `transitionRate` データがなければ自動スキップ

### 影響範囲サマリー

| 部署 | エンジン | Step6-A 影響 |
|---|---|---|
| kaigo1 | bestOfN | ✅ あり（transitionData 依存） |
| kaigo2 | bestOfN | ✅ あり（transitionData 依存） |
| eiyo | generateTimeAxis | ❌ なし |
| 将来追加（time以外） | bestOfN | ✅ あり（transitionData 依存） |

---

## 必須回答 ⑩ 修正セル削減への期待度（★評価）

### ★★☆☆☆（やや期待できる）

#### 根拠（実コードのみ）

**期待できる理由**:

1. `bestOfN` は n=30 試行の中から `scoreShifts` 最小を採用（L2999）。
   P12 追加後、30試行の中で「前日→当日の遷移が実績に近い」試行が相対的に低スコアになり採用されやすくなる。

2. `localSearchImprove` も `scoreShifts` を使って swap 改善する（L2968）。
   P12 が組み込まれると、swap 後に「遷移が不自然になる」組み合わせが棄却されるようになる。

3. `transitionRate` には希望休・有休・夜勤→明けを含む全シフト遷移の実績が格納されている（L570: `TRANS_KEYS = {WORK_SHIFT_KEYS, '明け','休み','希望休'}`）。
   「夜勤→休み→早番」のような特定スタッフの固有パターンが反映される余地がある。

**期待できない理由**:

1. **P12 の点数上限 (7,750点) は P1 (10,000点/1日) や P4 (1,000〜4,000/コマ) に比べて小さい。**
   shortage（人員不足）や公休数違反が存在する場合、P12 の影響は事実上ゼロになる。
   → 制約充足が完全な場合にのみ P12 の差が試行選択に効く。

2. **transitionRate はスタッフIDではなくスタッフ名でマッチする（nameMatch）。**
   名前が一致しないスタッフ（表記揺れ等）は影響ゼロ。

3. `bestOfN` の30試行は現在の実装でも高品質な解を見つけることが多い。
   P12 による差が trial 間の優劣を逆転させるケースは少ない可能性がある。

4. **「修正セル削減」の主要因は shortage・連勤違反・役職制限であり、transitionRate はそれらを解消しない。**

---

## 必須回答 ⑪ Before / After で比較すべき KPI 一覧

| # | KPI | 測定方法 | 停止条件 |
|---|---|---|---|
| K1 | **shortage（minStaff不足コマ数）/trial** | 100試行 × kaigo1/kaigo2 | 悪化（増加）→ 即停止 |
| K2 | **公休数違反スタッフ数/trial** | 同上 | 悪化 → 即停止 |
| K3 | **連勤違反スタッフ数/trial** | 同上 | 悪化 → 即停止 |
| K4 | **scoreShifts の採用試行スコア分布** | Before/After の最良スコア平均値 | — |
| K5 | **syncRate（シンクロ率）** | UI 表示値 or computeSyncRate | 改善 or 不変を確認 |
| K6 | **生成時間（ms/trial）** | performance.now() で計測 | 大幅悪化（+20%以上）→ 停止 |
| K7 | **採用試行インデックスの分布** | 何番目の試行が採用されたか | — |
| K8 | **transitionRate 適用スタッフ数** | trend.transitionRate が存在するスタッフ数 | 0のとき動作確認不能 |

### 測定用ベースライン（実施済み Step6調査より）

Step6 調査時点のベースラインは未測定。Step6-A 実装前に **100試行の Before 計測が必須**。

---

## 必須回答 ⑫ 最も採用すべき案（理由は実コードのみ）

### **案A（逆数加算方式）を採用**

#### 根拠（実コードのみ）

**理由1: P10/P11 と完全に同形の実装が可能**

L2879-L2908 の既存学習ペナルティブロックは:
```
score += (1 - predictedProb) × 30
score += (1 - restProb) × 30
```
という「予測確率が低いほどペナルティが大きい」連続値ペナルティ。
案A の `score += (1 - transitionRate[prev][curr]) × weight` は完全に同形であり、既存設計との一貫性が保たれる。

**理由2: フォールバックが自動**

`rate = trend?.transitionRate?.[prev]?.[curr]` が `undefined` の場合、
`if (rate != null)` で自動スキップ。案B の「rate=0（データあり・発生ゼロ）vs rate=null（データなし）」の区別問題が発生しない。

**理由3: パラメータが1つだけ（weight のみ）**

案B は threshold と penalty の2変数が必要。どちらも実測根拠がなければ設定できない。
案A の weight は P10/P11（×30）より少し軽い `25` を初期値とし、実測後に調整できる。

**理由4: スコア連続性が localSearchImprove に有利**

`localSearchImprove` は swap 前後の `scoreShifts` を比較して改善を判定する（L2968-L2970）。
連続値ペナルティ（案A）ならば「遷移が 0.3→0.35 に改善する swap」も正しく評価できる。
離散ペナルティ（案B）は閾値付近でのみ効果があり、大半の swap では差が出ない。

**理由5: 変更関数・変更行数が最小**

`scoreShifts` 関数のみ、+7〜10行の追加のみ。引数変更なし。呼び出し側（L2940, L2968, L2998, L3005）の変更ゼロ。

---

## 実装時の具体的な変更場所（案A）

```
変更対象: src/App.jsx
変更関数: scoreShifts (L2763)
変更位置: L2908 と L2909 の間

---変更前---
  }    ← P10/P11 ブロック末尾の } (L2907)
}      ← if (shiftTrend ...) の } (L2908)
return score;  ← L2909

---変更後---（既存コードを削除しない）
  }    ← P10/P11 ブロック末尾の }
      // P12: 遷移確率適合ペナルティ（transitionRate）
      // transitionRate が存在するスタッフ・遷移のみ適用。データなし→自動スキップ。
      const TRANS_WEIGHT = 25;
      for (const s of ds) {
        const tKey2 = trendKeys.find(k => nameMatch(k, s.name));
        const trend2 = tKey2 ? shiftTrend[tKey2] : null;
        if (!trend2?.transitionRate) continue;
        for (let d = 2; d <= days; d++) {
          const prev = res[s.id]?.[d - 1], curr = res[s.id]?.[d];
          if (!prev || !curr) continue;
          const rate = trend2.transitionRate[prev]?.[curr];
          if (rate != null) score += (1 - rate) * TRANS_WEIGHT;
        }
      }
}      ← if (shiftTrend ...) の }
return score;
```

**注意**: `trendKeys` は P10/P11 ブロック（L2884）で定義済み。
同一 `if (shiftTrend && ds.length > 0)` ブロック内に収める場合は `trendKeys` を再利用でき、+7行で済む。

---

*このドキュメントは Phase5 Step6-A の設計として作成。実装は次フェーズ（Step6-A 実装）で行う。*
