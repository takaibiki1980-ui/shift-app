# STEP5_CHECKABSOLUTE_ANALYSIS.md
# Phase5 Step5 — generateTimeAxis checkAbsolute 合格率向上
# 調査・分析・設計レポート

作成: 2026-06-30  
対象: `src/App.jsx` — `generateTimeAxis` / `checkAbsolute`  
フェーズ: 調査・分析・設計のみ（コード変更なし）

---

## 必須回答 ① checkAbsolute の完全フロー図

```
generateTimeAxis
│
├── ステップ1: ロック日確定（baseRes / lockedDays）※全試行共通
├── ステップ2: 休み数確定（_ta_restToPlace / _ta_totalTarget）※全試行共通
│   └── [eiyo専用] _ta_workRequired / _ta_workRemaining
│
├── for i in range(N_TRIALS=200):
│   │
│   ├── _runTrial()                          ← dept.id=eiyo ? runOneTrialEiyo : runOneTrial
│   │   │
│   │   ├── [runOneTrial — 非eiyo]
│   │   │   ├── ステップ3: 休み均等配置（±2日ジッタ + maxConsec移動）
│   │   │   ├── ステップ4: 勤務種別割り当て（学習重み付き確率選択 / maxStaffガード付き）
│   │   │   └── ステップ5: 最終連勤調整（超過ブロック中央→休み, 最遠休み→勤務 swap）
│   │   │
│   │   └── [runOneTrialEiyo — eiyo]
│   │       ├── ステップ4-5: 日別・シフト別にminStaff充足まで候補を配置（連勤チェック付き）
│   │       ├── ステップ6: 残勤務数未達の職員に空き日を割り当て（出勤率順）
│   │       └── ステップ7: 残セル処理（workRem≤0 → '休み' / workRem>0 → 空白維持）
│   │
│   ├── checkAbsolute(trialRes)              ← ★評価ポイント
│   │   ├── violations === 0 ?
│   │   │   ├── YES: passCount++, calcScore(trialRes), bestPassing更新
│   │   │   └── NO:  bestFailing更新（violations最小を保持）
│   │   └── bestPassingScore === 0 → break
│   │
│   └── [loop end]
│
├── selectedRes = bestPassing?.res ?? bestFailing?.res ?? emptyRes
├── 山登り① fill（空白→勤務 / minStaff不足削減）
├── 山登り② swap（休み移動 / minStaff不足削減）
└── checkAbsolute(selectedRes)               ← ★最終確認ログ（_tcDetail）
    └── console.error [TimeAxis-CHECK]
```

---

## 必須回答 ② false条件一覧

`checkAbsolute(res)` が false（violations > 0）となる5条件:

| 条件 | コード | 判定内容 | 粒度 |
|---|---|---|---|
| **v1: 公休数違反** | `actualRest !== s._ta_totalTarget` | 各スタッフの実際の公休日数 ≠ 目標公休日数 | 1人1違反 |
| **v2: 有休固定違反** | `res[s.id][Number(d)] !== '有休'` | yukyuByMonth に登録された日が '有休' でない | 1日1違反 |
| **v3: 許可種別違反** | `!allowed.has(v)` | roleShiftTypes で許可されていないシフトが配置された | 1日1違反 |
| **v4: 最大連勤超過** | `streak > maxConsec` | 勤務連続日数が dept.maxConsec を超えた | 1日1違反 |
| **v5: maxStaff超過** | `ds.filter(...).length > limit` | 当日のシフトk人数 > cleanMaxStaff[k] | 1日1シフト1違反 |

**注意**: `violations = v1 + v2 + v3 + v4 + v5` の合計。1つでも違反があると `violations > 0` → **checkAbsolute = false = 不合格**。

---

## 必須回答 ③ 発生頻度ランキング

コードトレースによる違反発生経路の分析（実測ログなし、コード解析のみ）:

### runOneTrialEiyo（eiyo部署）

| 順位 | 条件 | 発生経路 | 頻度予測 |
|---|---|---|---|
| **1位** | **v1: 公休数違反** | workRem>0で終了 → 空白セルが '休み' にならない → actualRest < totalTarget | **最多（毎試行の主因）** |
| 2位 | v4: 連勤超過 | step4-6の連勤チェックが通過でき ず全配置を諦めた後、残セルが空白のまま → 偶発的ケースは少ない | 稀 |
| 3位 | v5: maxStaff超過 | step4のshiftOrderがmaxStaff優先で配置するため基本回避 | 極稀 |
| — | v2, v3 | ロック日保護・getAllowed()フィルタが機能するため発生しない | 0 |

### runOneTrial（非eiyo部署）

| 順位 | 条件 | 発生経路 | 頻度予測 |
|---|---|---|---|
| **1位** | **v4: 連勤超過** | ステップ5の修復失敗: 移動可能な '休み' が存在しない（全員有休/希望休ロック）| 中程度 |
| — | v1, v2, v3, v5 | ステップ3が正確にtotalTarget件の '休み' を配置 / getAllowed()ガード / maxStaff件数ガードにより発生しない | 0 |

### 違反発生の非対称性

```
eiyo     → v1が支配的（公休数が合わない）
非eiyo   → v4が支配的（連勤調整失敗）
```

---

## 必須回答 ④ 修復される条件

### 200試行ループ内での「自然修復」

| 条件 | 自然修復の仕組み |
|---|---|
| v4 (非eiyo) | ±2日ジッタの乱数性 → 試行によっては '休み' 位置が分散し連勤超過を回避 |
| v1 (eiyo) | workRem > 0 の原因（連勤・maxStaff制約）が試行によって偶然クリアされる場合 |

### 山登り①②での事後修復

山登り①（fill）と山登り②（swap）は **checkAbsolute の合否に影響しない**。`bestPassing.res` または `bestFailing.res` が確定した後に実行されるため、200試行の合格率そのものは変化しない。

---

## 必須回答 ⑤ 修復されない条件

### eiyo v1 の構造的非修復

```
原因: _ta_workRequired = days - totalTarget
      workRem[s.id] > 0 のまま試行終了
      → step7: workRem > 0 の空白セルに '休み' を代入しない
      → actualRest = lockedRest < totalTarget
      → v1 violations++
```

**修復されない理由**:
- step 7 の条件が `workRem[s.id] <= 0` の場合のみ '休み' を代入する設計
- workRem > 0 = 「勤務を配置しきれなかった」状態であり、空白セルを '休み' にすることは意図的に回避されている
- しかしこの「意図的回避」が v1 違反を生み、200試行全試行で合格できないケースを生む

**発生条件**:
1. minStaff を充足するのに必要な人数が勤務上限（連勤制約 + maxStaff制約）を上回る場合
2. 早番専任スタッフが少ない eiyo 部署で特に発生しやすい
3. ロック日（有休・希望休）が多い月の後半に集中している場合

### 非eiyo v4 の条件的非修復

```
原因: ステップ5の修復ループ
      candidate（連勤中央の非ロック日）は存在するが
      farthest（移動可能な '休み' 日）が存在しない
      → if (farthest !== null) のガード内に入れない
      → streak違反が残ったまま試行終了
```

**修復されない理由**:
- 移動可能な '休み'（非ロック）が存在しない状態
- 全ての '休み' が yukyuByMonth / kiboByMonth でロックされている場合
- 担当スタッフの希望休や有休が月内に密集している場合

---

## 必須回答 ⑥ 改善候補一覧

| # | 改善候補 | 対象 | 対象違反 | 実装難度 | 期待改善量 | リスク |
|---|---|---|---|---|---|---|
| **A** | eiyo step7 拡張: `workRem > 0` の空白セルも '休み' 補完 | runOneTrialEiyo | v1 | ★☆☆ 低 | ★★★★★ 大 | 公休超過の逆方向違反に注意 |
| **B** | step7後に公休数補正: `actualRest < totalTarget` なら空白→'休み' を追加代入 | runOneTrialEiyo | v1 | ★★☆ 中 | ★★★★★ 大 | 厳密なカウント管理が必要 |
| **C** | ステップ5修復強化: farthestなし時に最小コストの '休み' 追加（連続区間内の非連勤位置）| runOneTrial | v4 | ★★★☆ 中高 | ★★☆☆☆ 小〜中 | v1 違反に転化するリスク（総公休数が変わる）|
| **D** | ステップ3 maxConsec調整の収束保証強化: guard を days×2 に増加 | runOneTrial | v4 | ★☆☆ 低 | ★☆☆☆☆ 微小 | 実行時間増加（200試行 × スタッフ数）|
| **E** | 試行前 feasibility check: v1発生確実な試行パラメータを事前検出してスキップ | 両方 | v1/v4 | ★★★☆ 中高 | ★★★☆☆ 中 | 複雑な前処理 |
| **F** | N_TRIALS 増加（200 → 500）| 両方 | 全条件 | ★☆☆ 低（数字変更のみ）| ★★☆☆☆ 小〜中 | 実行時間 2.5倍（体感遅延）|

---

## 必須回答 ⑦ 改善効果評価

| 改善候補 | 期待効果 | 評価 | 根拠 |
|---|---|---|---|
| **A: eiyo step7拡張** | v1違反を大幅削減 → passCount 大幅増加 | ★★★★★ | v1がeiyo唯一の主要違反。修正1箇所（step7の条件分岐）で最大効果 |
| **B: step7後公休数補正** | v1違反を確実に0に（補正後の正確なカウント）| ★★★★★ | Aより安全（事後補正のため）。ただし空白セルの補填順序が重要 |
| **C: ステップ5修復強化** | 非eiyo v4 を削減。ただし現状でも200試行中に自然解消するケースが多い | ★★☆☆☆ | v4はジッタ乱数で自然回避率が高い。修正コスト対効果は低い |
| **D: guard増加** | v4修復試行回数増加。効果は限定的（根本原因はfarthest=nullなのでguardでは解決しない）| ★☆☆☆☆ | 根本原因を解決しない |
| **E: 事前feasibility** | 理論上最効率だが実装が複雑 | ★★★☆☆ | 実装コスト高。B実装後に検討 |
| **F: N_TRIALS増加** | passCount比例増加。ただし根本原因（v1）は解消されない | ★★☆☆☆ | 根本原因回避のみ。遅延リスクあり |

**最優先推奨**: **改善候補B**（step7後公休数補正）

---

## 必須回答 ⑧ Step5を何Stepに分割するべきか

**3サブステップに分割**:

```
Step5-A: 調査・分析（今回 = このドキュメント）
Step5-B: eiyo v1修正実装・検証（公休数補正）
Step5-C: 非eiyo v4修正実装・検証（ステップ5 farthest強化）
```

### 分割理由

1. **eiyo と非eiyo の違反原因が異なる** → 別々に実装・検証
2. **Step5-B が最大効果** → 先に実装してベースライン改善を確認してから Step5-C へ
3. **Step5-C のリスクが高い**（v1に転化する可能性）→ B の実装後に別ブランチで検証

---

## 必須回答 ⑨ Step5全体ロードマップ

```
Phase5 Step5 全体ロードマップ
─────────────────────────────────────────────────────────
Step5-A: 調査・分析（コード変更なし）              ← 今回（完了）
  目的: checkAbsolute の全フロー・違反原因を整理
  成果物: docs/STEP5_CHECKABSOLUTE_ANALYSIS.md

Step5-B: eiyo v1修正
  目的: runOneTrialEiyo の step7 後に公休数補正を追加
  スコープ: runOneTrialEiyo の step7 ブロックのみ
  変更内容:
    step7 終了後、actualRest を再計算
    if (actualRest < totalTarget):
      空白セルを「連勤制約・ロック制約を破らない順」で '休み' に変換
      totalTarget - actualRest 件を追加
  検証: 100試行比較（修正前後）
    比較指標: passCount / adopted（bestPassing採用率）/ finalShortDays
    採用条件: passCount が統計的有意に増加 AND shortage が悪化しない

Step5-C: 非eiyo v4修正（Step5-B完了後に検討）
  目的: runOneTrial ステップ5 で farthest=null 時の代替修復
  スコープ: runOneTrial ステップ5の修復ループのみ
  変更内容候補:
    farthest=null の場合、連続超過区間に隣接する非ロック空き日に
    新規 '休み' を追加し、totalTarget 補正を事後に行う
  リスク: v1 に転化する可能性 → 実装は慎重に
  検証: 同様の100試行比較

Step5-D: 統合検証
  Step5-B + Step5-C 両方適用後の全体検証
  比較対象: Step5適用前 vs 適用後
  合格率（passCount/N_TRIALS）の統計的改善確認
─────────────────────────────────────────────────────────
```

---

## 必須回答 ⑩ 今回コード変更しなかった理由

以下の3点によりコード変更は行わなかった:

1. **調査・分析フェーズの明示**: ユーザーの指示が「調査・分析のみ / コード変更禁止」と明示されていた。

2. **改善候補の選定前にコードを変更すると、改善効果の測定基準（before）を汚染する**: checkAbsolute の違反原因（v1/v4）の根本を理解せずに修正すると、意図しない副作用（v1 ↔ v4 の転換、公休数の意図的ずれ）が生じるリスクがある。今回の分析で root cause が「eiyo=v1（workRem>0での空白放置）」「非eiyo=v4（farthest=null修復失敗）」と判明したため、Step5-B の実装方針（step7後の事後補正）が確定できた。

3. **1改善 = 1ブランチ = 1PR = 1効果検証** のルール遵守: 分析ドキュメント作成とコード修正を同一コミットに混在させない。

---

## 補足: DiagnosticReport の checkAbsolute 関連ログ一覧

| ログキー | 出力場所 | 内容 |
|---|---|---|
| `[TimeAxis-BESTOF]` | L3810 | `dept`, `N_TRIALS`, `passCount`, `adoptedScore`, `adopted` |
| `[TimeAxis-CHECK]` | L3816 | `_tcDetail.v1〜v5`, `adoptedMinStaffShortDays` |
| `diagnosticReport.repair.bestOf` | L4043 | `passCount`, `adopted`, `adoptedScore`, `adoptedMinStaffShortDays`, `checkDetail` |
| `diagnosticReport.repair.hillClimb` | L4062 | `fill.before/after`, `swap.before/after` |
| `[山登り] fill` | L3665 | `minStaff不足 before→after` |
| `[山登り] swap` | L3771 | `minStaff不足 before→after`, 公休数確認 |

**passCount=0 時に出力されるログ**:
```
[TimeAxis-BESTOF] dept=eiyo 試行=200 合格候補数=0 採用スコア=(合格なし)
  [TimeAxis-BESTOF] 合格候補0: 全200試行で5絶対条件を満たす候補なし
[TimeAxis-CHECK] dept=eiyo ①公休数違反=N ②...
```

**passCount > 0 かつ adopted=false は起こりえない**（`bestPassing?.res` が先に選ばれるため）。

---

## 補足: 各フェーズが checkAbsolute 合格率に与える影響

| フェーズ | 合格率への影響 | 詳細 |
|---|---|---|
| **ステップ3（runOneTrial）** | **中程度** | 休み位置のジッタが v4 発生率に影響する。良い位置に '休み' が置かれると step5 修復が不要になる |
| **ステップ4（runOneTrial）** | なし | maxStaff ガード・getAllowed() ガードにより v3/v5 = 0。連勤チェックなしだが step5 が後処理 |
| **ステップ5（runOneTrial）** | **高** | v4 修復の成否を決める。farthest=null → 合格不能 |
| **ステップ4-5（runOneTrialEiyo）** | **中程度** | workRem の解消率を決める。連勤制約が厳しいほど v1 発生率が上がる |
| **ステップ6（runOneTrialEiyo）** | **中程度** | 残勤務未達の補完。出勤率順ソートが良ければ workRem が解消される |
| **ステップ7（runOneTrialEiyo）** | **高（現状バグ的）** | workRem > 0 の空白を '休み' にしないため v1 を生む。**Step5-B の修正対象** |
| **PassA/B/C（autoGenerate）** | 無関係 | generateTimeAxis とは別エンジン |
| **Repair（autoGenerate）** | 無関係 | 同上 |
| **山登り①②** | **ゼロ** | checkAbsolute 評価後に実行されるため、合格率には影響しない |

---

*このドキュメントは Phase5 Step5-A（調査・分析）の成果物。コード変更なし。*
*次フェーズ: Step5-B（eiyo v1修正実装）*
