# Phase4 Repair DiagnosticEngine 設計書

作成日: 2026-06-29  
対象: `src/App.jsx` の autoGenerate（kaigo系） および generateTimeAxis（eiyo系）内の Repair/診断 console.log 群

---

## 1. Repair関連ログ一覧

### 1.1 autoGenerate 内（kaigo系・全部署）

| # | 行 | ラベル | 出力内容 | デバッグ専用? | 運用診断として必要? | DiagnosticReport移管? | 削除候補? |
|---|---|---|---|---|---|---|---|
| A1 | L877 | `[AG-v7d] start` | dept/year/month/staff数開始ログ | ◎ | × | × | ◎ |
| A2 | L1206 | `[AG-v7] enforceMaxStaff` | day/shift/超過人数/上限 | ◎ | △ | △ | △ |
| A3 | L1222 | `[Night-Sequence-EnforceMax]` | 翌日明けロック済→スキップ理由 | ◎ | × | × | ◎ |
| A4 | L1240 | `[Night-Sequence-EnforceMax]` | 夜勤cascade: 明け→休み変換完了 | ◎ | △ | △ | △ |
| A5 | L1382-1383 | `[DIAG-PassA]` | eiyo限定: 目標/実公休/最大連勤 table | ◎ | ◎ | ◎ | × |
| A6 | L1386 | `[PassA-MEASURE]` | 全部署: 目標/実公休/最大連勤 table | ◎ | ◎ | ◎ | × |
| A7 | L1394 | `[AG-v7] slotFirstTypes` | slot種別/maxStaff設定確認 | ◎ | × | × | ◎ |
| A8 | L1409 | `[day1-check]` | kaigo1_6固有: 月初遷移違反チェック | ◎ | × | × | ◎（削除必須） |
| A9 | L1447 | `[AG-Phase1] slot-first完了` | maxConsec除外数/未充足slot数 | ◎ | × | × | ◎ |
| A10 | L1568 | `PassB終了 スナップショット` | 目標/実公休/種別別休み数/明け数 table | ◎ | ◎ | ◎ | × |
| A11 | L1569 | `[不足] PassB終了` | 不足職員名/target/actual/diff 一覧 | ◎ | ◎ | ◎ | × |
| A12 | L1571 | `[PassB-連続チェック]` | 超過職員数/超過日数合計/最大連続 | ◎ | ◎ | ◎ | × |
| A13 | L1585-1586 | `[DIAG-PassB]` | eiyo限定: 目標/実公休/最大連勤 table | ◎ | ◎ | ◎ | × |
| A14 | L1616 | `[PassC-GUARD]` | PassCガード発火: スタッフ名/公休数/理由 | ◎ | △ | △ | △ |
| A15 | L1637 | `[PassC-Tier2休み追加]` | Tier2 streak切断: スタッフ/day/変換前 | ◎ | △ | △ | △ |
| A16 | L1644 | `[PassC-非slot休み追加]` | 非slot→休み変換: スタッフ/day/連続数 | ◎ | △ | △ | △ |
| A17 | L1668 | `[AG-Phase1] PassC後 連続違反: ゼロ` | 連続違反解消確認 | ◎ | △ | △ | △ |
| A18 | L1751-1752 | `公休数調整後` | 目標/実公休/diff table + 不足者一覧 | ◎ | ◎ | ◎ | × |
| A19 | L1901-1902 | `enforceMaxStaff×3後` | 目標/実公休/diff table + 不足者一覧 | ◎ | ◎ | ◎ | × |
| A20 | L1942 | `公休数回復後` | 目標/実公休/diff table | ◎ | ◎ | ◎ | × |
| A21 | L1994 | `超過バリデーション後` | 目標/実公休/diff table | ◎ | ◎ | ◎ | × |
| A22 | L2059 | `[AG-v7] FINAL VIOLATION` | maxStaff違反残存: day/shift/cnt/limit | ◎ | ◎ | ◎ | × |
| A23 | L2064-2065 | `[AG-v7] FINAL` | 違反ゼロ確認 or 残存件数 | ◎ | ◎ | ◎ | × |
| A24 | L2089 | `[Night-Sequence-Final]` | 明け孤立ゼロ確認 | ◎ | ◎ | ◎ | × |
| A25 | L2091 | `[Night-Sequence-Final]` | 明け孤立件数/詳細 | ◎ | ◎ | ◎ | × |
| A26 | L2118 | `最終出力 スナップショット` | 目標/実公休/種別別休み数/明け数 table | ◎ | ◎ | ◎ | × |

### 1.2 generateTimeAxis 内（eiyo専用）

| # | 行 | ラベル | 出力内容 | デバッグ専用? | 運用診断として必要? | DiagnosticReport移管? | 削除候補? |
|---|---|---|---|---|---|---|---|
| B1 | L2414 | `[MINSTAFF-CHECK]` | dept.minStaff raw + 空文字キー検出 | ◎ | △ | × | △ |
| B2 | L2977 | `_lpLines` (局所探索①) | minStaff不足改善: before→after | ◎ | ◎ | ◎ | × |
| B3 | L3038 | `[山登り]` 局所探索① | minStaff不足 before→after | ◎ | ◎ | ◎ | × |
| B4 | L3139,3142,3145 | `[山登り]` 局所探索② | swap前/採用/棄却 結果 | ◎ | ◎ | ◎ | × |
| B5 | L3180-3182 | `[TimeAxis-BESTOF]` | 試行数/合格候補数/採用スコア | ◎ | ◎ | ◎ | × |
| B6 | L3186 | `[TimeAxis-CHECK]` | 6条件違反集計 | ◎ | ◎ | ◎ | × |
| B7 | L3256 | `_diagLines` ([TimeAxis-DIAG]) | minStaff不足原因分析（職員別/シフト別/日別） | ◎ | ◎ | ◎ | × |
| B8 | L3288 | `[SHORTAGE-CLASSIFY]` | ABCD分類集計（eiyo専用） | ◎ | ◎ | ◎ | × |
| B9 | L3409 | `[SHORTAGE-ABC]` | 理論容量計算・早番/日勤競合分析（eiyo専用） | ◎ | ◎ | ◎ | × |

### 1.3 _runGenerateCore 内（UI層）

| # | 行 | ラベル | 出力内容 | デバッグ専用? | 運用診断として必要? | DiagnosticReport移管? | 削除候補? |
|---|---|---|---|---|---|---|---|
| C1 | L8067 | `[公休保証] リトライ結果` | 公休保証リトライ: 全員一致 T/F | ◎ | ◎ | ◎ | × |

---

## 2. DiagnosticReport への分類案

### 2.1 `diagnosticReport.repair` 構造（提案）

```javascript
diagnosticReport.repair = {
  // ── PassA 後スナップショット ──────────────────────────────
  passA: {
    // 全スタッフ: 目標公休/実公休/最大連勤/diff
    // 対象: autoGenerate 全部署 (A5=eiyo, A6=全部署)
    rows: [
      { name, targetRest, actualRest, longestStreak, diff }
    ],
  },

  // ── PassB 後スナップショット ──────────────────────────────
  passB: {
    // 全スタッフ: 目標/実公休/種別別/明け数 (A10)
    snapshot: [
      { name, targetKyuko, actualKyuko, 休み, 希望休, 有休, 明け }
    ],
    // 不足職員のみ詳細 (A11)
    shortage: [
      { name, target, actual, diff, 明け, 休み日s: [days] }
    ],
    // 連続勤務チェック (A12)
    consecCheck: {
      maxConsec,
      violatingStaffCount,
      totalViolationDays,
      maxStreak,
      rows: [{ name, 最大連続, 超過日数 }],
    },
  },

  // ── PassC 修復サマリ ──────────────────────────────────────
  passC: {
    // ガード発火一覧 (A14)
    guards: [{ name, actualRest, targetRest, reason }],
    // Tier2 streak切断一覧 (A15)
    tier2Changes: [{ name, day, before }],
    // 非slot→休み変換一覧 (A16)
    nonSlotChanges: [{ name, day, consecWork }],
    // PassC後 連続違反残存数 (A17)
    residualViolations: 0,
  },

  // ── 公休数フェーズ追跡 ────────────────────────────────────
  restAdjustment: {
    // 各フェーズ後スナップショット (A18/A19/A20/A21)
    afterPassC:           [{ name, target, actual, diff }],
    afterEnforceMax3:     [{ name, target, actual, diff }],
    afterRestRecovery:    [{ name, target, actual, diff }],
    afterExcessValidation:[{ name, target, actual, diff }],
    // 各フェーズ後不足者 (A18/A19 の「[不足]」ライン)
    shortageAfterPassC:      [{ name, target, actual, diff, 明け, 休み日s }],
    shortageAfterEnforceMax: [{ name, target, actual, diff, 明け, 休み日s }],
  },

  // ── 最終出力検証 ─────────────────────────────────────────
  final: {
    // maxStaff違反残存 (A22/A23)
    maxStaffViolations: [{ day, shift, cnt, limit }],
    totalViolations: 0,
    // 明け孤立 (A24/A25)
    nightOrphans: 0,
    nightOrphanList: ['スタッフ名 dN(prev=xxx)'],
    // 最終公休スナップショット (A26)
    snapshot: [{ name, targetKyuko, actualKyuko, diff, 休み, 希望休, 有休, 明け }],
  },

  // ── 夜勤シーケンス修復 (enforceMaxStaff中) ──────────────
  nightSequence: {
    // EnforceMax中 cascade変換 (A4)
    cascades: [{ day, name, from, to, cascadeDay }],
    // スキップ (A3) — 削除候補のため移管しない
  },

  // ── enforceMaxStaff 発火ログ ─────────────────────────────
  enforceMaxStaff: {
    // day/shift/超過人数/上限 (A2)
    events: [{ day, shift, count, limit }],
  },
};
```

### 2.2 `diagnosticReport.timeAxis` 構造（eiyo専用）

```javascript
diagnosticReport.timeAxis = {
  // 山登り①: minStaff改善 (B2/B3)
  hillClimbShiftFill: {
    before: 0,  // 不足日数
    after:  0,
    improved: 0,
  },

  // 山登り②: swap改善 (B4)
  hillClimbSwap: {
    before: 0,
    after:  0,
    improved: 0,
  },

  // bestOf試行結果 (B5)
  bestOf: {
    trials: 0,
    passCount: 0,
    adoptedScore: null,
    noPassingCandidate: false,
    adoptedMinStaffShortDays: 0,
  },

  // 6条件チェック (B6)
  absoluteCheck: {
    v1_restCount: 0,
    v2_paidLeave: 0,
    v3_allowedShift: 0,
    v4_consec: 0,
    v5_maxStaff: 0,
    v6_minStaffShortDays: 0,
  },

  // minStaff不足原因分析 (B7)
  shortage: {
    staffRows: [{ name, role, blank, work, rest, allowed }],
    shiftShortage: [{ shift, minStaff, shortDays: [days] }],
    dayDetail: [{ day, shift, actual, minStaff, c1ok, c1v4, c2, c3move, c3lock, c3role }],
  },

  // ABCD分類 (B8, eiyo専用)
  shortageClassify: {
    A_structural: 0,
    B_blank: 0,
    C_misplaced: 0,
    D_constrained: 0,
    detail: [{ day, shift, actual, minStaff, category }],
  },

  // 理論容量 (B9, eiyo専用)
  shortageABC: {
    staffCapacity: [{ name, role, allowed, totalTarget, workDays }],
    shiftCapacity: [{ shift, minStaff, required, eligibleStaff, maxInput, sufficient }],
    earlyDayConflict: { eOnly, dOnly, both, eOnlyW, dOnlyW, bothW },
  },
};
```

### 2.3 `diagnosticReport.kyukoRetry`（UI層）

```javascript
diagnosticReport.kyukoRetry = {
  // 公休保証リトライ (C1)
  triggered: true,
  allMatch: true,
  retryCount: 0,  // 何回目で一致したか（将来拡張）
};
```

---

## 3. 削除候補一覧

| # | 行 | ラベル | 削除理由 |
|---|---|---|---|
| D1 | L877 | `[AG-v7d] start` | 生成開始の確認のみ。DiagnosticReport.dept/year/monthで代替 |
| D2 | L1222 | `[Night-Sequence-EnforceMax]` スキップ | スキップ理由は診断不要。enforce後の状態はfinal.nightOrphansで確認 |
| D3 | L1394 | `[AG-v7] slotFirstTypes` | slot設定の確認ログ。設定値確認はdept objectで可能 |
| D4 | L1409 | `[day1-check]` | **kaigo1_6固有ハードコード**。他部署への影響リスクあり。削除必須 |
| D5 | L1447 | `[AG-Phase1] slot-first完了` | slot-first完了確認のみ。maxConsecExcluded数はPassB連続チェックで代替 |
| D6 | L2414 | `[MINSTAFF-CHECK]` | minStaff設定の空文字キー検出。設定バリデーションはUI側で実施済みのため不要 |

---

## 4. Phase4 実装計画

### 前提制約（厳守）
- autoGenerate / bestOfN / computeLearnedTrend への変更禁止
- 生成ロジック（PassA/B/C の判定・処理順）変更禁止
- RepairEngine の判定・評価ロジック変更禁止
- LearningEngine 変更禁止
- DiagnosticReport への情報収集のみ（読み取り専用、副作用なし）

### Step1: `diagnosticReport.repair.final` 追加（autoGenerate）
- 対象ログ: A22/A23（maxStaff違反）, A24/A25（明け孤立）, A26（最終スナップショット）
- 変更範囲: autoGenerate 末尾の diagnosticReport 初期化ブロック（L2119〜）
- console.log 削除: A22/A23/A24/A25/A26
- 影響範囲: 戻り値の diagnosticReport フィールド追加のみ

### Step2: `diagnosticReport.repair.restAdjustment` 追加（autoGenerate）
- 対象ログ: A18/A19/A20/A21（公休数フェーズ追跡4点）+ 不足者ライン
- 変更範囲: L1750〜L1994 の各フェーズ追跡ブロック
- 方針: 各フェーズで一時変数に格納 → autoGenerate末尾でdiagnosticReportに集約
- console.log 削除: A18/A19/A20/A21

### Step3: `diagnosticReport.repair.passB` 追加（autoGenerate）
- 対象ログ: A10/A11/A12/A13（PassBスナップショット + 連続チェック）
- 変更範囲: L1567〜L1587
- console.log 削除: A10/A11/A12/A13

### Step4: `diagnosticReport.repair.passA` 追加（autoGenerate）
- 対象ログ: A5/A6（PassAスナップショット）
- 変更範囲: L1381〜L1386
- console.log 削除: A5/A6

### Step5: 削除候補の console.log 削除（autoGenerate）
- 対象: D1(L877), D2(L1222), D3(L1394), D4(L1409), D5(L1447)
- D4 は kaigo1_6 固有ハードコードのため最優先削除

### Step6: `diagnosticReport.timeAxis` 追加（generateTimeAxis）
- 対象ログ: B5/B6（bestOf/6条件チェック）
- 変更範囲: L3177〜L3186
- console.log 削除: B5/B6

### Step7: `diagnosticReport.timeAxis.shortage` 追加（generateTimeAxis）
- 対象ログ: B7/B8/B9（minStaff不足原因分析・ABCD分類・理論容量）
- 変更範囲: L3189〜L3409
- console.log 削除: B7/B8/B9（adoptedMinStaffShortDays > 0 の条件分岐ブロック全体）

### Step8: `diagnosticReport.timeAxis.hillClimb` 追加（generateTimeAxis）
- 対象ログ: B2/B3/B4（山登り局所探索①②）
- 変更範囲: L2977, L3038, L3139/3142/3145
- console.log 削除: B2/B3/B4

### Step9: `diagnosticReport.kyukoRetry` 追加（_runGenerateCore）
- 対象ログ: C1（公休保証リトライ）
- 変更範囲: L8067付近
- console.log 削除: C1

### Step10: `diagnosticReport.repair.nightSequence` + `enforceMaxStaff` 追加（任意）
- 対象ログ: A2/A4（enforceMaxStaff発火、夜勤cascade）
- 移管後 console.log 削除
- 情報量が少ないため Step1〜9 完了後に判断

---

## 5. 生成ロジックへ影響がない根拠

Phase4 の全変更は以下の原則に従い実施する：

1. **読み取り専用**  
   `res` / `selectedRes` / `ds` 等の生成中間データを読み取るだけで、書き換えない。

2. **console.log の置き換え**  
   既存の console.log 計算コードを変数に格納するだけで、計算ロジック自体は変更しない。  
   例: `console.error('...')` → `_repairFinal.maxStaffViolations.push({...})`

3. **diagnosticReport は戻り値フィールドのみ**  
   diagnosticReport は `return { shifts, warnings, timelineWarnings, diagnosticReport }` の追加フィールドとして返すだけ。  
   caller の bestOfN / _runGenerateCore は既に diagnosticReport を pass-through している（Phase3 Step2〜4 完了済み）。

4. **条件分岐の追加なし**  
   既存の `if (dept.id === 'eiyo')` 等の条件分岐は変更せず、その中で収集するだけ。

5. **パフォーマンス影響なし**  
   console.log は既に実行されていた計算を削除するため、むしろ削除後の方が高速。

---

## 6. Phase4 最終回答

### ① Phase4 は何ステップになるか
**10ステップ**（Step1〜10）。Step10は任意（情報量が少ないため後回し可）。  
実質的な必須実装は **Step1〜9 の9ステップ**。

### ② 最優先で構造化すべきRepair診断
**`diagnosticReport.repair.final`（Step1）**  
理由: maxStaff違反残存・明け孤立・最終公休スナップショットは、生成品質の最終判定に最も重要。  
bestOfN での採用判定ロジックへの組み込み候補として価値が高い。

次点: **`diagnosticReport.repair.restAdjustment`（Step2）**  
4フェーズ追跡を構造化することで「どのフェーズで公休数が崩れたか」が一目でわかり、修正効果の定量評価が可能になる。

### ③ Phase4 完了後に何ができるようになるか
1. **生成品質の定量評価 UI**  
   diagnosticReport を読んで「最終違反数0件」「明け孤立0件」「公休達成率100%」を画面表示できる。

2. **ステップ別デバッグの劇的な高速化**  
   console.log を開発者ツールで追うのではなく、diagnosticReport をオブジェクトとして検査できる。  
   例: `lastDiagnosticRef.current['eiyo'].repair.restAdjustment.shortageAfterEnforceMax`

3. **bestOfN の採用基準拡張**  
   現在はスコアのみで採用。将来的に `final.totalViolations === 0` を追加条件にできる。

4. **生成ログの完全サイレント化**  
   全 Repair console.log を移管後に削除することで、本番環境での console 汚染がゼロになる。

5. **SHORTAGE-CLASSIFY / SHORTAGE-ABC の定期モニタリング**  
   「A構造不足」が多い月は人員補強が必要と判断できる運用診断として活用できる。

### ④ 生成ロジックへの影響
**なし（ゼロ）**。  
Phase4 は全てのフェーズで「既存 console.log の計算結果を変数に格納するだけ」であり、  
生成アルゴリズム（PassA/B/C・enforceMaxStaff・minStaff保証・公休数回復・ratio修復）の  
実行順序・条件分岐・変換ロジックは一切変更しない。

---

*このドキュメントは Phase4 実装前の調査・設計フェーズの成果物です。実装は別 Phase として進めます。*
