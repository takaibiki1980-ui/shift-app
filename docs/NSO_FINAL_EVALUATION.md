# NSO_FINAL_EVALUATION.md
# Night Slot Optimizer (NSO) 最終評価レポート

作成: 2026-06-30  
対象ブランチ: phase5/night-balance  
評価者: Phase5 Step4-A〜D 検証チーム  
判定: **不採用（difficulty-first 方式 中止）**

---

## ① 実装期間・実装内容

### 実装期間
Phase5 Step4-A〜D（同一セッション内で完結）

### 実装フェーズ一覧

| フェーズ | 内容 | ファイル変更 |
|---|---|---|
| Step4-A | NSO 基盤関数群を App.jsx に追加 | `src/App.jsx` L875〜L1037 |
| Step4-B | feasibility matrix / difficulty scoring 構築 | `src/App.jsx` L1405〜L1500 |
| Step4-C | difficulty-first 配置ループ（_nsoAssignment 書き込み）| `src/App.jsx` L1500〜L1648 |
| Step4-D | C3違反バグ修正 × 3箇所（検証 × 3回）| `src/App.jsx` L897, L906, L924-L927 |

### 実装した主要関数

| 関数名 | 役割 | 行数 |
|---|---|---|
| `NSO_canAssignInitial` | C1/C2/C4/C5 feasibility チェック | L897 |
| `NSO_checkC3` | C3 動的チェック（assignSet.has + res[]）| L906 |
| `NSO_propagateConstraints` | 夜勤配置後の周辺日ブロック | L924 |
| `NSO_computeCost` | コスト関数（CountEquity/HalfBalance/Interval）| L937 |
| `NSO_canSwap` | 2-opt swap 可否判定 | L985 |
| STEP 0〜4 (autoGenerate 内) | NSO 本体（_nsoAssignment 書き込みのみ）| L1405〜L1648 |

**注意**: NSO は `_nsoAssignment` にのみ書き込む。`res[]` は一切変更しない。本番生成には影響なし。

---

## ② 検証回数・検証条件

### 検証一覧

| 回 | スクリプト | 対象 | 試行数 |
|---|---|---|---|
| 第1回 | `nso_d_compare.mjs` | NSO修正前 vs Step2 | 100試行 × kaigo1/kaigo2 |
| 第2回 | `nso_d2_compare.mjs` | d+2修正後 vs Step2 | 100試行 × kaigo1/kaigo2 |
| 第3回 | `nso_c3_trace.mjs` | C3違反の内訳分析（詳細トレース）| 50試行 × kaigo1 |
| 第4回 | `nso_d3_compare.mjs` | d+2+d-2+checkC3修正後 vs Step2 | 100試行 × kaigo1/kaigo2 |

### 評価指標

| 指標 | 意味 | Step2（ベースライン）|
|---|---|---|
| C3違反数/trial | 夜勤翌日または翌々日への再配置違反 | 0.010 |
| shortage/trial | minStaff 未充足コマ数 | 0.190 |
| 夜勤回数σ | スタッフ間夜勤回数の標準偏差 | 0.502 |
| maxDiff | 最大回数差（max−min）| 1.040 |
| halfDev | 前半後半夜勤数の偏差 | 0.757 |
| intSig | 夜勤間隔の均等性スコア | 1.179 |

---

## ③ 検証結果サマリー

### 3-way 比較（最終版: Step4-D d+2+d-2+checkC3修正後）

| 指標 | Step2 | NSO(最終) | 差分 | 判定 |
|---|---|---|---|---|
| C3違反/trial | 0.010 | 0.010 | ±0 | ✅ 同等 |
| shortage/trial | 0.190 | 0.530 | **+0.340 (+178.9%)** | ❌ 大幅悪化 |
| 夜勤回数σ | 0.502 | 0.783 | **+0.281 (+56.0%)** | ❌ 大幅悪化 |
| maxDiff | 1.040 | 1.850 | **+0.810 (+77.9%)** | ❌ 大幅悪化 |
| halfDev | 0.757 | 0.613 | -0.144 (-19.1%★★) | ✅ 改善 |
| intSig | 1.179 | 1.056 | -0.123 (-10.5%★★) | ✅ 改善 |

★★: t検定 p<0.01

### 修正サイクルごとの推移

| 修正 | C3/trial | shortage/trial | σ |
|---|---|---|---|
| NSO修正前 | 3.030 | 0.030 | 0.608 |
| d+2修正後 | 1.020 | — | 0.775 |
| d+2+d-2+checkC3修正後 | **0.010** | **0.530** | **0.783** |
| Step2（目標）| 0.010 | 0.190 | 0.502 |

---

## ④ 不採用理由

### 主因: difficulty-first + 広域除外ゾーン のトレードオフが構造的

1. **C3制約を正しく守るには 5日除外ゾーン [d-2, d-1, d, d+1, d+2] が必要**
   - 夜勤を day d に配置すると、翌日(d+1)は明け、翌々日(d+2)は休みが必要 → C3 forward
   - day d に配置すると day d-1 は夜勤不可（C3 backward）
   - day d-1 に夜勤を置かないためには day d-2 も除外が必要（C3 backward + forward の連鎖）

2. **difficulty-first は 「配置が困難な日を先に処理する」**
   - 5日除外ゾーンを設けると、近傍の多くの日が `feasible=false` になる
   - feasibleな候補が少ない日が次々と「困難」と判定される
   - 結果: 後半日程で feasible=true の候補がほぼ枯渇 → shortage 爆発

3. **3回の修正サイクルで解消不可能**
   - 修正① d+2追加: C3 1.020 → 1.020（不十分）/ σ悪化
   - 修正② d-2追加: C3 0.010 達成 / shortage +178.9%（トレードオフ発生）
   - 修正③ checkC3追加: C3維持 / shortage変わらず（根本原因は除外ゾーン幅）

4. **除外ゾーンを縮小すればC3が再発、維持すればshortageが増加**
   - これは設計上の二律背反であり、比較関数・コスト関数の調整では解消できない
   - 根本的なアーキテクチャ変更（globally-feasible placement 等）が必要

---

## ⑤ 改善できた指標（部分的効果）

| 指標 | 改善率 | 意義 |
|---|---|---|
| halfDev（前半後半偏差）| -19.1%★★ | difficulty-first の分散効果 |
| intSig（夜勤間隔均等性）| -10.5%★★ | グローバル最適化の部分的成功 |

**評価**: halfDev/intSig の改善は確認できたが、shortage・σ・maxDiff の悪化が大きく、総合評価では Step2 を下回る。

---

## ⑥ 再利用可能な基盤関数

以下の関数は NSO固有のロジックを含まず、将来の別手法での再利用が可能。

| 関数 | 再利用可能な理由 |
|---|---|
| `NSO_canAssignInitial` | C1/C2/C4/C5（前月繰り越し・ロック・明け・連休）の feasibility チェック。夜勤配置の前処理として汎用的 |
| `NSO_computeCost` | CountEquity/HalfBalance/IntervalEquity のコスト計算。別配置アルゴリズムのスコアリングに転用可 |
| `NSO_canSwap` | 2-opt swap の可否判定。局所探索を使う手法全般で再利用可 |

**再利用が困難な関数**:
- `NSO_propagateConstraints`: 5日除外ゾーンは今回の問題の主因。別手法では除外幅の再設計が必要
- `NSO_checkC3`: difficulty-first 専用の動的チェック。別手法では不要になる可能性が高い

---

## ⑦ 今後 NSO（difficulty-first）を利用しない理由

1. **構造的トレードオフの証明**: 3回の修正サイクルで「C3制約 vs shortage」のトレードオフが数学的に確認された。修正パラメータの調整ではなく、アーキテクチャの変更なしには解消できない。

2. **Step2（日付順 stable sort）との性能差**: Step2 は C3=0.010, shortage=0.190 を達成しており、NSO が Step2 を全指標で上回ることは difficulty-first 方式では不可能と判断。

3. **コードの複雑度**: NSO は feasibility matrix（O(n×days)）+ difficulty ordering + 配置ループ の3層構造で、Step2（単純な日付ループ）に比べてコード量が大幅に増加。バグが発生しやすく、修正コストが高い。

4. **代替手法の存在**: halfDev・intSig の改善ニーズは Step3（夜勤アンカー配置最適化）でより軽量に達成できる見込み。

---

## ⑧ 結論

**Phase5 Step4 Night Slot Optimizer（difficulty-first 方式）= 検証完了・不採用**

- WIPコード（NSO基盤関数 + STEP 0〜4）はブランチ `phase5/night-balance` に残存
- `main` へのマージは行わない
- 削除は将来のブランチ整理フェーズで実施する
- 関連ドキュメント: `docs/NIGHT_SLOT_OPTIMIZER_DESIGN.md`, `docs/NIGHT_SLOT_OPTIMIZER_REVIEW.md`, `docs/NIGHT_SLOT_OPTIMIZER_DESIGN_v2.md`, `docs/NSO_C3_ROOTCAUSE.md`

---

*このドキュメントは Phase5 Step4 の最終評価として作成。次のステップは Step3（夜勤アンカー配置最適化）または Step5 以降の番号調整後のステップ。*
