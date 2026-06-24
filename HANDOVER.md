# しふぽん 引き継ぎ書
## 新セッション用コンテキスト

---

## リポジトリ

- GitHub: `takaibiki1980-ui/shift-app`
- 作業ブランチ: `claude/setup-supabase-client-fjCnM`
- 主ファイル: `/home/user/shift-app/src/App.jsx`（8,400行・単一ファイル構成）

---

## 絶対禁止事項（セッションを超えて適用）

- `autoGenerate` / `bestOfN` / `computeLearnedTrend` への変更禁止
- 介護エンジン・kaigo1/kaigo2 の生成ロジック変更禁止
- 他部署（kaigo1/kaigo2・jimu・kango）の公休設定変更禁止

---

## 現在の状況

### 完了済みコミット（全てpush済み）

| コミット | 内容 |
|--|--|
| 1fb6de8 | validateHardConstraints の mk/days バグ修正 |
| 516ec22 | eiyo スタッフ kyukoDays:9 修正 |
| ae64725 | [BLANK-CHECK] 追加 |
| 416e224 | [SHORTAGE-CLASSIFY] + [BLANK-CHECK-FUKUDA] 追加 |
| c0f1e9b | [SHORTAGE-ABC] 追加 |
| 3f70a05 | eiyo 勤務先配置方式新エンジン実装（runOneTrialEiyo） |
| 2341e73 | [STAFF-SNAP] + [SHORTAGE-ABC]参照元 追加 |
| d29a58a | Revert Phase1（実装前にリバート済み） |

---

## 確定済みの重要事実

### eiyo 構造的不足（確定・追跡終了）

- スタッフ2名(清水・池田) × kyukoDays9日 → 勤務42人日
- minStaff(早番1+日勤1) × 30日 → 必要60人日
- **理論最小不足: 18件（A構造不足・エンジン改善では解消不能）**
- **50,000シード全数テストで18件のみ（100%）— 確定**

### 「24件不足」について（追跡終了）

- 過去AIセッションが `ARCHITECTURE_PHASE0_DIFF.md` に「実測24件」と記載したが、
  **実測値ではなく過去AIの推定値**（18件 + B問題~6件 = ~24件 という計算）
- 実際のコンソールログに24件の記録は存在しない
- デフォルトデータ（清水・池田）では24件は再現不能と証明済み
- **この件の追跡は終了。今後は「18件」が正とする**

### 不足分類（確定）

| 分類 | 件数 | 解消手段 |
|--|--|--|
| A 構造不足 | **18件（確定）** | スタッフ増員・kyukoDays削減のみ |
| B 配置順問題 | **未測定（推定値を破棄）** | EiyoStrategy再設計で削減対象 |
| C 公休配置問題 | なし | — |
| D 学習問題 | 軽微 | — |

---

## 開発フェーズ優先順位（確定）

| フェーズ | 対象 | 状態 |
|--|--|--|
| Phase 0 | 退避 | **完了** |
| Phase 1 | DiagnosticEngine 移植 | 設計済み・**実装待ち** |
| Phase 2 | ConstraintEngine 整理 | **設計調査完了**・実装待ち |
| Phase 3 | EiyoStrategy 再設計 | 未着手 |
| Phase 4 | LearningEngine 基盤 | 未着手 |
| Phase 5 | transitionRate 利用 + scoreCandidate | 未着手 |
| Phase 6 | 月間回数学習 | 未着手 |

**scoreCandidate は Phase 3 完了まで実装しない。**
**実装は必ずユーザーから「実装してください」と明示された場合のみ着手する。**

---

## Phase 1 の実装仕様（実装待ち）

**目標:** 診断ログを generateTimeAxis の外に切り出す

**対象ログ（全て generateTimeAxis 内 L2887〜L3490）:**

| タグ | 行番号 | 限定条件 |
|--|--|--|
| [STAFF-SNAP] | L2887-2904（定義）+ L2904/L2990/L3100（3呼び出し） | eiyo のみ |
| [LEARN-PICK] | L2906-2927 | 全部署 |
| [TimeAxis-BESTOF] | L3132-3134 | 全部署 |
| [TimeAxis-CHECK] | L3160 | 全部署 |
| [TimeAxis-DIAG] | L3166-3230 | minStaff不足時 |
| [SHORTAGE-CLASSIFY] | L3233-3267 | eiyo限定 |
| [BLANK-CHECK] | L3270-3301 | eiyo + 杉本限定 |
| [BLANK-CHECK-FUKUDA] | L3304-3344 | eiyo + 福田限定 |
| [SHORTAGE-ABC] | L3346-3490 | eiyo + 不足あり時 |

**切り出し方法:**
```javascript
const ctx = {
  selectedRes, ds, dept, days, year, month,
  cleanMinStaff, cleanMaxStaff, deptWork, deptRest,
  lockedDays, getAllowed, adoptedMinStaffShortDays, maxConsec
};
runDiagnostics(ctx);
```

**Phase 1 成功条件:**
- ログ出力内容が移植前と同一
- generateTimeAxis 本体から console.error/log の直書きがゼロになる
- eiyo 以外でも DiagnosticEngine が呼べる

---

## Phase 2 ConstraintEngine — 設計調査結果（実装待ち）

### Hard制約一覧（全10種）

| # | 制約名 | 関数・行番号 | 使用エンジン |
|--|--|--|--|
| 1 | 連勤超過 | `consecWork()` L930-943 / `checkAbsolute()` v4 L2796 | 両方 |
| 2 | maxStaff超過 | `enforceMaxStaff()` L1136-1175 / `checkAbsolute()` v5 L2800-2806 | 両方 |
| 3 | minStaff不足 | `calcScore()` L2815-2820 / 保証フェーズ L1761-1837 | 両方 |
| 4 | 有休固定 | `checkAbsolute()` v2 L2782-2785 | 両方 |
| 5 | 公休数 | `checkAbsolute()` v1 L2779-2781 | 両方 |
| 6 | 職種別シフト制限 | `getAllowedTypes()` L1126-1129 / `getAllowed()` L2372-2375 | 両方（別名） |
| 7 | 許可種別 | `checkAbsolute()` v3 L2787-2791 | generateTimeAxis のみ |
| 8 | 夜勤→明け連鎖 | `isBadTransition()` L954-961 | 両方 |
| 9 | 遅番→早番禁止 | `isBadTransition()` L960 | 両方 |
| 10 | shiftInterval | `isBadTransition()` 内 L956-958 | 両方（intervalEnabled時） |

### isPlaceable候補（5パターン）

autoGenerate 側は4フェーズで各自判定（共通関数なし）:

| フェーズ | 行番号 | 判定条件数 |
|--|--|--|
| Pass A（slot-first） | L1337-1351 | 6条件 |
| Pass B（確率配置） | L1450-1454 | 4条件 |
| Pass C（連勤修正） | L1558-1568 | 3条件 |
| minStaff保証 | L1770-1816 | 7条件 |

generateTimeAxis 側は isPlaceable 関数なし（乱数配置 → checkAbsolute 事後検査）。

### ロック処理一覧（5種）

| # | 処理名 | 行番号 | 使用エンジン |
|--|--|--|--|
| 1 | 希望休・有休・希望勤務の初期ロック | L968-990 (auto) / L2383-2398 (genTA) | 両方（別実装） |
| 2 | 前月末夜勤・明けの繰越ロック | L998-1006 | autoGenerate のみ |
| 3 | 夜勤→明け→休みの連鎖ロック | L1008-1027 | autoGenerate のみ |
| 4 | 希望休アンカー配置（D-2夜勤/D-1明け） | L1050-1061 | autoGenerate のみ |
| 5 | baseRes + lockedDays の二重化管理 | L2383-2398 | generateTimeAxis のみ |

**重要**: ロック処理 #2〜#4 が autoGenerate にのみ存在し、generateTimeAxis に未実装。

### スタッフオブジェクトへの副作用一覧

| プロパティ | 書き込み行 | 計算式 | 対象 |
|--|--|--|--|
| `s._ta_totalTarget` | L2404 | `kyukoDaysByMonth?.[mk] ?? kyukoDays ?? 8` | 全スタッフ |
| `s._ta_restToPlace` | L2406 | `Math.max(0, totalTarget - lockedRest)` | 全スタッフ |
| `s._ta_workRequired` | L2414 | `Math.max(0, days - totalTarget)` | eiyo のみ |
| `s._ta_workRemaining` | L2415 | `Math.max(0, workRequired - lockedWorkCount)` | eiyo のみ |
| `s._ta_workPlaced` | L2416 | `lockedWorkCount` | eiyo のみ |

全て generateTimeAxis のみ。autoGenerate には `_ta_*` 副作用は存在しない。

### ConstraintResult 型案

```typescript
type ConstraintViolation = {
  category: 'TIER1' | 'TIER2';
  code:
    // Tier1 — 絶対制約（修正不可）
    | 'LOCKED_DAY'         // lockedDays.has(d) L995, L2397
    | 'FIXED_PAID_LEAVE'   // yukyuByMonth固定 L2783
    | 'FIXED_KIBO'         // kiboByMonth L974, L2387
    | 'NIGHT_SEQUENCE'     // 明け前日が夜勤系でない L959
    | 'PREV_SHIFT_MEAKE'   // 前日明けから勤務 L1344
    // Tier2 — ソフト制約（修正可能）
    | 'MAX_CONSECUTIVE'    // L1350, L2796
    | 'MAX_STAFF_EXCEED'   // L1165, L2804
    | 'MIN_STAFF_SHORT'    // L1486, L2818
    | 'ROLE_SHIFT_TYPE'    // L1161, L2790
    | 'BAD_TRANSITION'     // L1162, L2960
    | 'REST_TARGET_EXCEED' // L1550
    | 'SHIFT_INTERVAL';    // L956-958
  detail?: string;
};

type ConstraintResult = {
  isPlaceable: boolean;
  violations: ConstraintViolation[];
};
```

### Phase 2 設計上の要注意事項

1. **夜勤連鎖ロック（L1008-1027）が generateTimeAxis に未実装**
   — 統一時に generateTimeAxis 側の動作変更が生じる
2. **`_ta_workRemaining` は eiyo専用** — 他部署に展開しない
3. **isPlaceable の考え方が両エンジンで異なる**
   — autoGenerate: 配置前フィルタ型
   — generateTimeAxis: 配置後事後検査型
   — 統一には `isPlaceable(s, d, k, res)` の新規関数化が必要

---

## 主要なコード構造（参照用）

```
generateTimeAxis() L2336  ← eiyo / jimu / kango 用（廃止予定）
  └─ runOneTrial() L2423       ← jimu/kango 用
  └─ runOneTrialEiyo() L2629   ← eiyo 用（勤務先配置方式）
  └─ checkAbsolute() L2775     ← 5絶対条件検査
  └─ calcScore() L2814         ← スコア計算
  └─ 山登り① L2934             ← 空白→勤務補完
  └─ 山登り② L2993             ← 休み移動swap
  └─ 診断ログ群 L2887-L3490    ← Phase 1 で切り出し対象

autoGenerate() L758       ← kaigo1/2 用（変更禁止）
bestOfN() L2284           ← kaigo1/2 用（変更禁止）
computeLearnedTrend() L492 ← 学習（変更禁止）
scoreShifts() L2067       ← スコア計算
repairHardConstraints() L7634  ← eiyo限定 後処理
validateHardConstraints() L7701 ← eiyo限定 検証
```

---

## 設計書ファイル（スクラッチパッドに保存済み）

セッション間では消える可能性あり。内容は上記で代替可。

- `ARCHITECTURE_PHASE0.md` — 全体アーキテクチャ設計書
- `ARCHITECTURE_PHASE0_DIFF.md` — コード監査反映差分
- `LEARNING_ENGINE_FOUNDATION.md` — LearningEngine 基盤設計書
- `DIAGNOSTIC_ENGINE_DESIGN.md` — DiagnosticEngine 設計書（Phase 1用）
- `CONSTRAINT_ENGINE_DESIGN.md` — ConstraintEngine 設計調査報告書（Phase 2用）

---

## 学習エンジン（参考）

現在使用中:
- `freq` — 全体出現率（スプレッドでトップレベル展開）
- `dowShiftRate` — 曜日別勤務確率[7]（0=日曜・JS getDay 基準）
- `dowRestRate` — 曜日別公休確率[7]（0=月曜・(getDay+6)%7 基準）

未使用:
- `transitionRate` — 前日→当日遷移確率（計算・保存のみ、生成未使用）

既知バグ（computeLearnedTrend 変更禁止のため修正不可）:
- `da = min(1, workTot/2)` → 2日で信頼度飽和
- `ra = min(1, tot/3)` → 3日で信頼度飽和
