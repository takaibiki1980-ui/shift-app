# RepairEngine 設計調査書

調査日: 2026-06-24  
対象ファイル: `src/App.jsx`  
実装禁止 / コード変更禁止 / 設計調査のみ

---

## 凡例

| 記号 | 意味 |
|---|---|
| ✅ | RepairEngine移動可能 |
| ⚠️ | 条件付きで移動可能 |
| ❌ | 移動不可（TA/AG専用ロジックが深く絡む） |
| AG | autoGenerate 専用 |
| TA | generateTimeAxis 専用 |

---

## 1. Pass C（連続勤務超過修正）

**場所**: `src/App.jsx` L1579〜L1641（autoGenerate 内）

### 依存変数一覧

| 変数 | 由来 |
|---|---|
| `res` | autoGenerateローカル（生成中シフト表） |
| `ds` | autoGenerateローカル（スタッフ配列） |
| `days` | autoGenerateローカル（当月日数） |
| `deptWork` | `buildDeptWorkTypes(dept.customShiftDefs)` |
| `deptRest` | `buildDeptRestTypes(dept.customShiftDefs)` |
| `maxConsec` | `dept.maxConsecutive || 5` |
| `lockedDays` | autoGenerateローカル（ロック日Set） |
| `mk` | `monthKey(year, month)` |

### ConstraintEngine依存一覧

| 関数 | 用途 |
|---|---|
| `_consecWork(s.id, d)` | 連続勤務日数チェック（超過判定） |
| `_shouldProtectSlot(sh, count)` | Tier1保護判定（role-slot削除禁止） |
| `_isNikkinBase(k)` | 日勤優先削除ターゲット選定 |

### `res` 書き換え内容

- `res[s.id][d] = '休み'`（非slot当日を休みへ変換）
- `res[s.id][target] = '休み'`（Tier2吸収: 日勤/非slotを休みへ変換）

### 副作用一覧

- `res` ミューテート（2種類の書き換え）
- `console.error` / `console.log` / `console.table` によるDiagnosticログ（DiagnosticEngineの責務）

### エンジン分類

**AG専用 / RepairEngine候補**

- `autoGenerate` のみに存在。`generateTimeAxis` に同等のものなし。
- 連続勤務超過（`_consecWork > maxConsec`）を検知→修正するループ。
- Tier1保護（`_shouldProtectSlot`）に完全依存。
- `prevTail` 依存（`_consecWork` 経由）があるためAG専用コンテキストが必要。

### 移動可能か

**⚠️ 条件付き可能**  
引数として `(res, ds, days, dept, deptWork, deptRest, maxConsec, lockedDays, mk, slotManagedTypes, maxStaff, prevTail, prevDays, customShiftDefs)` を受け取れば移動可能。  
ただし依存変数が多く、DiagnosticログをRepairEngineに含めてよいかの設計判断が必要。

### 共通化で動作変更が起きるか

`generateTimeAxis` には連続勤務超過修正ロジックが存在しない（TAはcheckAbsolute④で検知するのみ）。  
→ **共通化対象なし。AG専用RepairEngineブロックとして移動する。**

---

## 2. enforceMaxStaff（maxStaff超過強制修正）

**場所**: `src/App.jsx` L1190〜L1241（autoGenerate 内クロージャ）  
呼び出し: 4回（L1747, L1807, L1892, L2046）

### 依存変数一覧

| 変数 | 由来 |
|---|---|
| `res` | autoGenerateローカル |
| `ds` | autoGenerateローカル |
| `days` | autoGenerateローカル |
| `maxStaff` | autoGenerateローカル（`dept.maxStaff`から構築） |
| `lockedDays` | autoGenerateローカル |
| `dayTypes` | autoGenerateローカル（AG版: 明けを含む） |
| `_agNightSet` | `buildNightSet(dept)` |

### ConstraintEngine依存一覧

| 関数 | 用途 |
|---|---|
| `getAllowedTypes(s)` | 振替先シフトの役職チェック |
| `_isBadTransition(prev, k)` | 振替先遷移バリデーション |

### `res` 書き換え内容

- `res[s.id][d] = altShift || "休み"`（超過スタッフを別シフト/休みへ振替）
- `res[s.id][d + 1] = '休み'`（夜勤→変更時、翌日の明けをカスケード削除）

### 副作用一覧

- `res` ミューテート（2箇所）
- `console.log` ログ

### エンジン分類

**AG専用 / RepairEngine候補**

- `autoGenerate` のみ。`generateTimeAxis` にはcheckAbsolute⑤で超過を検知するのみで修正ロジックなし。
- `dayTypes`（AG版: 明え含む）に依存するため、そのままでは共通化不可。

### 移動可能か

**⚠️ 条件付き可能**  
`dayTypes` を引数化すれば純粋関数に近づくが、クロージャとして4回呼び出されていることと夜勤カスケード処理の複雑さから、RepairEngine内のプライベート関数として移動が現実的。

### 共通化で動作変更が起きるか

TAに`enforceMaxStaff`相当がないため共通化対象外。ただし将来TAにも超過修正が必要になった場合のためにインターフェースを整備しておく価値はある。

---

## 3. 公休数調整

**場所**: `src/App.jsx` L1666〜L1739（autoGenerate 内インラインブロック）

### 依存変数一覧

| 変数 | 由来 |
|---|---|
| `res` | autoGenerateローカル |
| `ds` | autoGenerateローカル |
| `days` | autoGenerateローカル |
| `deptWork` | `buildDeptWorkTypes(dept.customShiftDefs)` |
| `deptRest` | `buildDeptRestTypes(dept.customShiftDefs)` |
| `maxConsec` | `dept.maxConsecutive || 5` |
| `maxStaff` | autoGenerateローカル |
| `lockedDays` | autoGenerateローカル |
| `dayTypes` | autoGenerateローカル（AG版: 明えを含む） |
| `mk` | `monthKey(year, month)` |
| `dept.minStaff` | dept設定 |
| `PRIORITY` | グローバル定数 |

### ConstraintEngine依存一覧

| 関数 | 用途 |
|---|---|
| `_consecWork(s.id, d)` | 連続勤務チェック（振替後の超過防止） |
| `_consecRest(s.id, d)` | 連続休みチェック（3日超過防止） |
| `_isBadTransition(prev, k)` | 振替先遷移バリデーション |
| `_canRest(s.id, d)` | 休み配置可否判定 |
| `_shouldProtectSlot(sh, count)` | Tier1保護（shortage補正対象外判定） |
| `getAllowedTypes(s)` | 役職チェック |

### `res` 書き換え内容

- 余剰休み → 勤務への振替: `res[s.id][d] = pick`（または `forceShift`）
- 不足休み → 休みへの変換: `res[s.id][d] = "休み"`
- 連続休み超過（3日超）→ 勤務へ変換: `res[s.id][d] = [...av].sort(...)[0]`

### 副作用一覧

- `res` ミューテート（3種の書き換え）
- DEBUG console.error（DiagnosticEngineの責務）

### エンジン分類

**AG専用 / RepairEngine候補**

- autoGenerate 専用。`kyukoDays`（公休目標）概念はTAでは`_ta_totalTarget`として別管理。
- 3つのサブフェーズ（余剰削減・不足補充・連続休み修正）が1ブロックに混在。

### 移動可能か

**⚠️ 条件付き可能**  
引数が多く、かつ3サブフェーズを分離するかどうかの設計判断が必要。  
分離する場合:
1. `repairRestExcess(...)` — 余剰休みを勤務へ振替
2. `repairRestShortage(...)` — 不足休みを追加
3. `repairRestOverconsecutive(...)` — 連続休み超過を勤務へ変換

### 共通化で動作変更が起きるか

TAの公休調整はStep2（`_ta_totalTarget`設定）+`checkAbsolute`①で担保する別アーキテクチャ。  
→ **共通化対象なし。AG専用RepairEngineブロックとして移動する。**

---

## 4. 遷移違反 repair

**場所**: `src/App.jsx` L1749〜L1805（autoGenerate 内インラインブロック）  
2部構成: 月内遷移修正（L1749〜L1781）+ 月境界修正（L1783〜L1805）

### 依存変数一覧

| 変数 | 由来 |
|---|---|
| `res` | autoGenerateローカル |
| `ds` | autoGenerateローカル |
| `days` | autoGenerateローカル |
| `maxStaff` | autoGenerateローカル |
| `lockedDays` | autoGenerateローカル |
| `dayTypes` | autoGenerateローカル（AG版） |
| `prevShift(s.id)` | autoGenerateローカル関数（prevTailから前月末シフトを取得） |

### ConstraintEngine依存一覧

| 関数 | 用途 |
|---|---|
| `_isBadTransition(prev, curr)` | 遷移違反検知・振替先バリデーション |
| `_shouldProtectSlot(sh, count)` | Tier1保護（フォールバック先決定） |
| `getAllowedTypes(s)` | 役職チェック |

### `res` 書き換え内容

- `res[s.id][target] = finalAlt`（違反当日または前日を許可シフトへ振替）
- `res[s.id][1] = alt ?? ...`（月境界: 1日目のシフトを修正）

### 副作用一覧

- `res` ミューテート
- `console.log` ログ

### エンジン分類

**AG専用 / RepairEngine候補**

- autoGenerate 専用。TAには`getAllowed`+`_isBadTransition`相当はあるが、repair専用フェーズなし。
- `prevShift(s.id)`（`prevTail`依存）を使用するため、月境界修正はAG専用コンテキストが必要。

### 移動可能か

**⚠️ 条件付き可能**  
- 月内遷移修正: `prevShift` 関数を引数化すれば移動可能
- 月境界修正: `prevTail` / `prevShift` を引数化すれば移動可能

### 共通化で動作変更が起きるか

TAに遷移repair相当なし。共通化対象外。

---

## 5. minStaff 保証

**場所**: `src/App.jsx` L1810〜L1934（autoGenerate 内インラインブロック）  
2部構成: スライド補充（L1814〜L1890）+ 公休数回復フェーズ（L1899〜L1933）

### 依存変数一覧

| 変数 | 由来 |
|---|---|
| `res` | autoGenerateローカル |
| `ds` | autoGenerateローカル |
| `days` | autoGenerateローカル |
| `maxStaff` | autoGenerateローカル |
| `lockedDays` | autoGenerateローカル |
| `mk` | `monthKey(year, month)` |
| `dept.minStaff` | dept設定 |
| `dept.shiftRatio` / `shiftRatioByMonth` | スタッフ個別設定 |
| `WORK_TYPES` | グローバル定数 |
| `prevShift(s.id)` | prevTail依存関数 |

### ConstraintEngine依存一覧

| 関数 | 用途 |
|---|---|
| `getAllowedTypes(s)` | 役職チェック |
| `_isBadTransition(prev, k)` | 遷移バリデーション |
| `_consecWork(s.id, d)` | 連続勤務チェック |
| `_consecRest(s.id, d)` | 連続休みチェック（公休数回復フェーズ） |
| `_consecRestFwd(s.id, d)` | 前方連続休みチェック（公休数回復フェーズ） |
| `_shouldProtectSlot(cur, fromActual)` | Tier1保護（スライド元選定） |

### `res` 書き換え内容

- `res[s.id][d] = shiftKey`（スライド補充: 他シフト→minStaff対象へ振替）
- `res[s.id][d] = shiftKey`（休み→勤務: 公休余剰スタッフのみ）
- `res[s.id][d] = "休み"`（公休数回復フェーズ: 日勤→休みへ変換）

### 副作用一覧

- `res` ミューテート（3種の書き換え）
- `console.log` / `console.error` ログ

### エンジン分類

**AG専用 / RepairEngine候補**

- autoGenerate 専用。TAのminStaff保証は山登り①②で担当（別アーキテクチャ）。
- `shiftRatio`参照（比率最小変更原則でのソート）があり、StrategyEngineとの境界が曖昧。

### 移動可能か

**⚠️ 条件付き可能**  
`prevShift` 関数を引数化し、他依存変数を引数に渡せば移動可能。  
公休数回復フェーズ（日勤→休み変換）はサブフェーズとして分離可能。

### 共通化で動作変更が起きるか

TAのminStaff補充は山登り①（空白→勤務）で行い、アーキテクチャが根本的に異なる。  
→ **共通化対象なし。AG専用RepairEngineブロックとして移動する。**

---

## 6. ratio 修復

**場所**: `src/App.jsx` L1993〜L2044（autoGenerate 内インラインブロック）

### 依存変数一覧

| 変数 | 由来 |
|---|---|
| `res` | autoGenerateローカル |
| `ds` | autoGenerateローカル |
| `days` | autoGenerateローカル |
| `maxStaff` | autoGenerateローカル |
| `lockedDays` | autoGenerateローカル |
| `mk` | `monthKey(year, month)` |
| `dept.minStaff` | dept設定 |
| `s.shiftRatio` / `shiftRatioByMonth` | スタッフ個別設定 |
| `deptWork` | `buildDeptWorkTypes(dept.customShiftDefs)` |

### ConstraintEngine依存一覧

| 関数 | 用途 |
|---|---|
| `getAllowedTypes(s)` | 役職チェック（allowed配列） |
| `_isBadTransition(prev, toShift)` | 遷移バリデーション |
| `_shouldProtectSlot(fromShift, fromCnt)` | Tier1保護（削減禁止） |

### `res` 書き換え内容

- `res[s.id][d] = toShift`（fromShift過多日をtoShift不足日へシフト変換）
- `actuals[fromShift]--; actuals[toShift]++`（ローカルカウント更新）

### 副作用一覧

- `res` ミューテート
- `actuals` ローカルオブジェクトのミューテート（`res` 整合性維持用）

### エンジン分類

**AG専用 / RepairEngine候補**

- autoGenerate 専用。`shiftRatio`（個人別シフト比率目標）に依存。
- TAに`shiftRatio`を使うロジックなし。

### 移動可能か

**✅ 移動可能**  
外部依存が比較的少なく、純粋なシフト変換ループ。引数化が容易。

### 共通化で動作変更が起きるか

TAに`shiftRatio`相当なし。共通化対象外。AG専用として移動する。

---

## 7. 山登り①（空白→勤務でminStaff補充）

**場所**: `src/App.jsx` L2966〜L3025（generateTimeAxis 内インラインブロック）

### 依存変数一覧

| 変数 | 由来 |
|---|---|
| `selectedRes` | generateTimeAxisローカル（最良試行結果） |
| `ds` | generateTimeAxisローカル |
| `days` | generateTimeAxisローカル |
| `cleanMinStaff` | L2399: 空キー除去済みminStaff（TA専用） |
| `cleanMaxStaff` | L2411: 空キー除去済みmaxStaff（TA専用） |
| `maxConsec` | `dept.maxConsecutive || 5` |
| `deptWork` | `buildDeptWorkTypes(dept.customShiftDefs)` |
| `lockedDays` | generateTimeAxisローカル |

### ConstraintEngine依存一覧

| 関数 | 用途 |
|---|---|
| `getAllowed(s)` | 役職チェック（TA版dayTypesを使用） |
| `calcScore(selectedRes)` | スコア評価（ScoreEngine） |

### `selectedRes` 書き換え内容

- `selectedRes[s.id][d] = k`（空白→勤務への割り当て）
- スコア改善しない場合: `delete selectedRes[s.id][d]`（元に戻す）

### 副作用一覧

- `selectedRes` ミューテート（ベストスコア採用時のみ）
- `hlDC` カウントキャッシュの更新
- `console.error` ログ

### エンジン分類

**TA専用 / RepairEngine候補（ScoreEngine依存あり）**

- generateTimeAxis 専用。`selectedRes`（N=200試行のベスト結果）に対して後処理。
- `calcScore` / `cleanMinStaff` / `cleanMaxStaff` など TA専用変数に依存。
- `getAllowed(s)`（TA版dayTypes: 明け除外）に依存。

### 移動可能か

**⚠️ 条件付き可能**  
`cleanMinStaff` / `cleanMaxStaff` / `calcScore` / `getAllowed` を引数化すれば移動可能。  
ただし `calcScore` 自体がScoreEngineなので、RepairEngineがScoreEngineを呼び出す設計になる。

### 共通化で動作変更が起きるか

AGの山登り相当は `localSearchImprove`（グローバル関数, L2269）が担当し、アルゴリズムが異なる。  
→ **共通化対象なし。TA専用RepairEngineブロックとして移動する。**

---

## 8. 山登り②（休み移動swap）

**場所**: `src/App.jsx` L3028〜L3134（generateTimeAxis 内インラインブロック）

### 依存変数一覧

| 変数 | 由来 |
|---|---|
| `selectedRes` | generateTimeAxisローカル |
| `ds` | generateTimeAxisローカル |
| `days` | generateTimeAxisローカル |
| `cleanMinStaff` | TA専用 空キー除去済みminStaff |
| `cleanMaxStaff` | TA専用 空キー除去済みmaxStaff |
| `maxConsec` | `dept.maxConsecutive || 5` |
| `deptWork` | `buildDeptWorkTypes(dept.customShiftDefs)` |
| `deptRest` | `buildDeptRestTypes(dept.customShiftDefs)` |
| `lockedDays` | generateTimeAxisローカル |
| **`s._ta_totalTarget`** | Step2でスタッフオブジェクトに付与された一時プロパティ |

### ConstraintEngine依存一覧

| 関数 | 用途 |
|---|---|
| `getAllowed(s)` | 役職チェック（TA版dayTypesを使用） |
| `calcScore(selectedRes)` | スコア評価（ScoreEngine） |

### `selectedRes` 書き換え内容

- `selectedRes[s.id][X] = k`（休み日Xを勤務kへ変換）
- `selectedRes[s.id][bestZ] = '休み'`（勤務日Zを休みへ変換: 公休数保存のためのswap）
- スコア悪化 or 公休数崩壊時: `preSwapRes` から全員分を復元（ロールバック）

### 副作用一覧

- `selectedRes` ミューテート（swap採用時）
- `preSwapRes` への事前スナップショット（ロールバック用）
- `swDC` カウントキャッシュの更新
- `console.error` ログ

### エンジン分類

**TA専用 / RepairEngine候補（ScoreEngine依存 + ロールバック機構あり）**

- generateTimeAxis 専用。
- `s._ta_totalTarget`（TA Step2付与の一時プロパティ）に依存するため、TAコンテキスト外では動作不可。
- ロールバック機構（`preSwapRes`）が内蔵されており、RepairEngineの中でも特殊な実装。

### 移動可能か

**⚠️ 条件付き可能（最も複雑）**  
`_ta_totalTarget` は `s` オブジェクトから読み取るため引数化は不要だが、前提としてStep2が完了していることを文書化する必要がある。  
`calcScore` / `cleanMinStaff` / `cleanMaxStaff` / `getAllowed` を引数化すれば移動可能。

### 共通化で動作変更が起きるか

AGに山登り②相当なし。共通化対象外。TA専用RepairEngineブロックとして移動する。

---

## 総括表

| repair ブロック | エンジン | AG/TA | 移動可否 | ConstraintEngine依存 | res書き換え | 共通化可否 |
|---|---|---|---|---|---|---|
| Pass C | RepairEngine | AG専用 | ⚠️ | consecWork, shouldProtectSlot, isNikkinBase | `res[d]='休み'` | ❌ |
| enforceMaxStaff | RepairEngine | AG専用 | ⚠️ | getAllowedTypes, isBadTransition | `res[d]=altShift\|'休み'`, カスケード | ❌ |
| 公休数調整 | RepairEngine | AG専用 | ⚠️ | consecWork/Rest/Fwd, isBadTransition, canRest, shouldProtectSlot, getAllowedTypes | `res[d]=pick\|'休み'\|勤務` | ❌ |
| 遷移違反repair | RepairEngine | AG専用 | ⚠️ | isBadTransition, shouldProtectSlot, getAllowedTypes | `res[d]=finalAlt` | ❌ |
| minStaff保証 | RepairEngine | AG専用 | ⚠️ | getAllowedTypes, isBadTransition, consecWork, consecRest/Fwd, shouldProtectSlot | `res[d]=shiftKey\|'休み'` | ❌ |
| ratio修復 | RepairEngine | AG専用 | ✅ | getAllowedTypes, isBadTransition, shouldProtectSlot | `res[d]=toShift` | ❌ |
| 山登り① | RepairEngine | TA専用 | ⚠️ | getAllowed, calcScore | `selectedRes[d]=k` / delete | ❌ |
| 山登り② | RepairEngine | TA専用 | ⚠️ | getAllowed, calcScore | swap + ロールバック | ❌ |

---

## 設計方針（確定）

### 責務境界

```
RepairEngine
  ├── AG専用ブロック（autoGenerate のRepair群）
  │     Pass C
  │     enforceMaxStaff（クロージャ→RepairEngine内プライベート関数）
  │     公休数調整（3サブフェーズ）
  │     遷移違反repair（月内 + 月境界）
  │     minStaff保証（スライド + 公休数回復）
  │     ratio修復
  │
  └── TA専用ブロック（generateTimeAxis のRepair群）
        山登り①（空白→勤務 by calcScore）
        山登り②（休み移動swap by calcScore + ロールバック）
```

### 依存方向

```
RepairEngine → ConstraintEngine（isBadTransition, shouldProtectSlot, consecWork, etc.）
RepairEngine → ScoreEngine（山登り①②のみ: calcScore）
RepairEngine → DiagnosticEngine（ログ出力の整理が必要）

RepairEngine ← AG/TA エンジン（呼び出し元）
```

### 共通化禁止事項

| 項目 | 理由 |
|---|---|
| AG/TA のrepairブロックを統合 | dayTypes差異・_ta_totalTarget依存・アルゴリズム差異 |
| 山登り①②と localSearchImprove の統合 | アルゴリズムが根本的に異なる |
| getAllowedTypes と getAllowed の共通化 | dayTypes差異（明け含む/除外）により動作変更が発生 |

### 移動前に解決が必要な前提条件

1. `getAllowedTypes`（Step7）の引数化完了が必要（全repairブロックが依存）
2. `enforceMaxStaff` の `dayTypes` 依存を引数化する
3. DiagnosticEngineへのログ分離方針を確定する
4. 山登り②の`_ta_totalTarget`前提条件をドキュメント化する

---

*調査完了: 実装禁止 / コード変更禁止*
