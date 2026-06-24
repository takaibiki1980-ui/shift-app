# DiagnosticEngine Phase2 設計書

調査日: 2026-06-24  
対象ファイル: `src/App.jsx`  
実装禁止 / コード変更禁止 / 設計調査のみ

---

## 凡例

| 記号 | 意味 |
|---|---|
| DE | DiagnosticEngine責務 |
| SE | ScoreEngine責務 |
| CE | ConstraintEngine責務 |
| RE | RepairEngine責務 |
| 🔴 | 個人名ハードコード（要抽象化） |
| ❌ | 削除可能ログ |
| ✅ | 永続的に残すべきログ |

---

## 1. [STAFF-SNAP]

**現状**: コード内に `[STAFF-SNAP]` タグは存在しない。  
調査結果: **タグなし（前セッションで参照した仮称か、AG側のデバッグログ名）**。

autoGenerate 内には `[公休追跡]` `[PassC-DIAG]` `[day1-track]` など個別ログが散在するが、統一された STAFF-SNAP タグはない。DiagnosticEngine設計において `staffSummary` として統合する対象。

---

## 2. [LEARN-PICK]

**場所**: `src/App.jsx` L2942〜2963（generateTimeAxis 内）

### ① 責務分類

**DE（DiagnosticEngine）**  
学習統計の観測ログ。`res` を変更しない読み取り専用。

### ② 入力依存

| 変数 | 内容 |
|---|---|
| `_ta_selectedLearnStats` | 採用試行の学習統計カウンター（learned/fallback/noData） |
| `USE_LEARN_PICK` | 学習ON/OFFフラグ |
| `selectedRes` | 採用試行の最終シフト表 |
| `ds` | スタッフ配列 |
| `days` | 当月日数 |
| `deptRest` | 休み種別Set |
| `getTrendTA(s)` | 学習傾向データ取得関数 |
| `getAllowed(s)` | 役職別許可シフト（TA版） |
| `year`, `month` | 年月 |
| `dept.id` | 部署識別 |

### ③ 出力内容

- 採用試行での学習選択件数 / フォールバック件数 / データなし件数
- eiyo + USE_LEARN_PICK=true の場合: スタッフ別・曜日別シフト選択理由（先頭5件サンプル）

### ④ eiyo専用か

**eiyo専用（サンプル出力部分）** / 統計ヘッダーは全部署共通

### ⑤ 個人名ハードコード

なし（`s.name` をループで出力）

### ⑥ 削除可能か

❌ **開発中・条件付き削除可能**  
`USE_LEARN_PICK=false` 切り替えで学習OFFにした場合は意味なし。  
本番では `learned=N` のサマリーのみ残し、日別サンプル行は削除対象。

### ⑦ 永続的に残すべき部分

✅ 統計ヘッダー（`learned/fallback/noData` の件数）はScoreEngine統計として残す価値あり。

---

## 3. [TimeAxis-BESTOF]

**場所**: `src/App.jsx` L3166〜3168（generateTimeAxis 内）

### ① 責務分類

**DE（DiagnosticEngine）+ SE（ScoreEngine）**  
試行ループの結果サマリー。スコア値（ScoreEngine出力）とpassCount（試行統計）を組み合わせて出力。

### ② 入力依存

| 変数 | 内容 |
|---|---|
| `N_TRIALS` | 試行回数（200） |
| `passCount` | checkAbsolute合格試行数 |
| `bestPassingScore` | 採用試行のcalcScoreスコア |
| `bestPassing` | 採用試行の存在有無 |
| `dept.id` | 部署識別 |
| `adoptedMinStaffShortDays` | 採用試行のminStaff不足日数 |

### ③ 出力内容

- 試行数・合格数・採用スコア
- 合格候補0件アラート
- minStaff不足日数

### ④ eiyo専用か

**全部署共通**

### ⑤ 個人名ハードコード

なし

### ⑥ 削除可能か

なし

### ⑦ 永続的に残すべき部分

✅ **永続的に残す**  
生成品質の最重要サマリー。ユーザー向けの警告生成にも使用される。

---

## 4. [TimeAxis-CHECK]

**場所**: `src/App.jsx` L3170〜3194（generateTimeAxis 内）

### ① 責務分類

**DE（DiagnosticEngine）+ SE（ScoreEngine）**  
採用結果に対する6条件チェック。`checkAbsolute` の再実行（重複あり）。

**注意**: `checkAbsolute`（L2831）はN=200試行の選別に使用済み。  
L3170〜3194 は採用後の「後方互換ログ用」として再実装されており、**ロジックの重複**がある。

### ② 入力依存

`selectedRes`, `ds`, `deptRest`, `deptWork`, `getAllowed`, `maxConsec`, `cleanMaxStaff`, `days`, `mk`, `dept.id`, `adoptedMinStaffShortDays`

### ③ 出力内容

①公休数違反 ②有休固定違反 ③許可種別違反 ④連勤超過日 ⑤maxStaff超過 ⑥minStaff不足日

### ④ eiyo専用か

**全部署共通**

### ⑤ 個人名ハードコード

なし

### ⑥ 削除可能か

**条件付き削除可能**  
`checkAbsolute` の結果を採用後にも保持すれば、L3170〜3194 のロジック重複部分は削除可能。  
DiagnosticEngineでは `checkAbsolute` の結果を受け取って出力するだけにできる。

### ⑦ 永続的に残すべき部分

✅ 出力内容（violations詳細）は永続的に必要。ただし**実装はcheckAbsolute呼び出しに統合**すべき。

---

## 5. [TimeAxis-DIAG]

**場所**: `src/App.jsx` L3197〜3264（generateTimeAxis 内）  
条件: `adoptedMinStaffShortDays > 0` の場合のみ出力

### ① 責務分類

**DE（DiagnosticEngine）**  
minStaff不足の原因分析。読み取り専用・`res` 変更なし。

### ② 入力依存

`selectedRes`, `ds`, `days`, `deptWork`, `deptRest`, `cleanMinStaff`, `getAllowed`, `lockedDays`, `maxConsec`, `dept.id`

### ③ 出力内容

- ▼職員別: 空白日数・勤務種別カウント・休み日数・許可シフト
- ▼シフト別不足: シフトごとの不足日数・日付一覧
- ▼日別詳細: 不足日の原因分類（①空白(配置可) / ①空白(④NG) / ②他シフト / ③休み移動可 / ③休みロック / ③役職NG）

### ④ eiyo専用か

**全部署共通**（条件分岐なし）

### ⑤ 個人名ハードコード

なし（`s.name` をループで出力）

### ⑥ 削除可能か

なし（デバッグに必須）

### ⑦ 永続的に残すべき部分

✅ **永続的に残す**  
不足原因の詳細分析は DiagnosticEngine の中核機能。`shortages.byDay` として構造化データ化が望ましい。

---

## 6. [SHORTAGE-CLASSIFY]

**場所**: `src/App.jsx` L3266〜3301（generateTimeAxis 内）  
条件: `dept.id === 'eiyo'` の場合のみ

### ① 責務分類

**DE（DiagnosticEngine）**  
不足日をABCD4カテゴリに分類する分析ログ。読み取り専用。

### ② 入力依存

`selectedRes`, `ds`, `days`, `cleanMinStaff`, `getAllowed`, `deptWork`, `deptRest`, `lockedDays`, `maxConsec`, `dept.id`, `adoptedMinStaffShortDays`

### ③ 出力内容

ABCD分類集計:
- A構造不足: 担当者が役職NGのみ（配置不能）
- B空白由来: 空白セルがあり、連勤OKなら配置可能
- C配置ミス: 別シフト勤務中で振替可能
- D制約由来: 連勤NG / ロック公休 / 空白連勤NG

### ④ eiyo専用か

🔴 **eiyo専用**（`dept.id === 'eiyo'` ガード）

### ⑤ 個人名ハードコード

なし

### ⑥ 削除可能か

なし

### ⑦ 永続的に残すべき部分

✅ **永続的に残す**  
A=理論的不足（人員設定変更が必要）/ B=改善余地あり / C=配置ロジック改善で解消 / D=制約緩和が必要  
という4カテゴリの分類は設計判断の根拠として不可欠。  
**eiyo専用→全部署共通に拡張**する価値がある。

---

## 7. [BLANK-CHECK]

**場所**: `src/App.jsx` L3304〜3336（generateTimeAxis 内）  
条件: `dept.id === 'eiyo'` かつ `s.name.includes('杉本')` のスタッフのみ

### ① 責務分類

**DE（DiagnosticEngine）**  
特定スタッフ（杉本）の空白日が「構造的に埋め不可」か「埋め忘れ」かを診断。読み取り専用。

### ② 入力依存

`selectedRes`, `ds`, `days`, `getAllowed`, `cleanMaxStaff`, `maxConsec`, `deptWork`, `dept.id`, `year`, `month`

### ③ 出力内容

- 杉本の各空白日ごと: 許可シフト別の制約チェック（連勤超過 / maxStaff超過）
- 結論: `⚠️埋め忘れの疑い` or `✅構造的に埋め不可`

### ④ eiyo専用か

🔴 **eiyo専用**

### ⑤ 個人名ハードコード

🔴 **「杉本」が `s.name.includes('杉本')` でハードコードされている**

### ⑥ 削除可能か

**削除可能（要抽象化）**  
個人名フィルタリングを除去し、「全スタッフの空白日診断」として汎用化できる。  
具体的には BLANK-CHECK を全スタッフ対象のループに変更し、ログ出力は空白日があるスタッフのみに絞る。

### ⑦ 永続的に残すべき部分

✅ **診断ロジック自体は永続的に必要**  
ただし「杉本限定」は削除し `staffSummary.blanks` として全スタッフ対象に汎用化する。

---

## 8. [BLANK-CHECK-FUKUDA]

**場所**: `src/App.jsx` L3338〜3378（generateTimeAxis 内）  
条件: `dept.id === 'eiyo'` かつ `s.name.includes('福田')` のスタッフのみ

### ① 責務分類

**DE（DiagnosticEngine）**  
特定スタッフ（福田）の空白日が埋め忘れか構造的不可かを診断し、さらに「空白を埋めた場合にminStaff不足が何件解消されるか」を算出。読み取り専用。

### ② 入力依存

`selectedRes`, `ds`, `days`, `getAllowed`, `cleanMaxStaff`, `cleanMinStaff`, `maxConsec`, `deptWork`, `lockedDays`, `dept.id`, `year`, `month`, `adoptedMinStaffShortDays`

### ③ 出力内容

- 福田の各空白日ごと: 前日/翌日状況・連勤チェック・許可シフト別制約
- 「埋めれば不足解消できる日数」の集計
- `不足${adoptedMinStaffShortDays}→${adoptedMinStaffShortDays - _bfImproveable}日が理論値` の推定

### ④ eiyo専用か

🔴 **eiyo専用**

### ⑤ 個人名ハードコード

🔴 **「福田」が `s.name.includes('福田')` でハードコードされている**  
BLANK-CHECK の「杉本」とは別ブロックとして実装されており、ロジックも若干異なる（不足解消貢献度の計算が追加）。

### ⑥ 削除可能か

**削除可能（要抽象化）**  
「個人名」のハードコードを除去すれば、空白日診断＋不足解消貢献度計算は全スタッフに適用できる汎用ロジック。  
DiagnosticEngine化の際は `blanks[s.id].improveable` フィールドとして全スタッフ対象に統合する。

### ⑦ 永続的に残すべき部分

✅ **「空白を埋めた場合のminStaff貢献度計算」ロジックは永続的に残す価値あり**  
ただし「福田限定」は廃止し、全スタッフ対象の汎用診断に移行する。

---

## 9. [SHORTAGE-ABC]

**場所**: `src/App.jsx` L3380〜3492（generateTimeAxis 内）  
条件: `dept.id === 'eiyo'` かつ `adoptedMinStaffShortDays > 0`

### ① 責務分類

**DE（DiagnosticEngine）** — 最も高度な分析ブロック

理論最小不足の算出・不足日のABC分類・早番/日勤競合計算を行う。読み取り専用。

### ② 入力依存

`selectedRes`, `ds`, `days`, `cleanMinStaff`, `cleanMaxStaff`, `getAllowed`, `deptWork`, `deptRest`, `lockedDays`, `maxConsec`, `dept.id`, `year`, `month`, `adoptedMinStaffShortDays`, `s._ta_totalTarget`

### ③ 出力内容

1. **▼スタッフ別**: 許可シフト・公休日数・勤務日数
2. **▼シフト別理論容量**: シフトごとの必要人日 vs 担当者最大投入人日（充足可否）
3. **▼早番/日勤 競合計算**: 両方担当可スタッフの奪い合いを考慮した理論最大値（= **理論最小不足の算出箇所**）
4. **▼不足日ABC分類**: A同日配置可 / B公休移動 / C充足不能
5. **▼日勤B詳細**: B分類の各日における公休中スタッフ・他シフトスタッフ・空白スタッフの一覧

### ④ eiyo専用か

🔴 **eiyo専用**（`dept.id === 'eiyo'` ガード）  
ただし **早番/日勤 競合計算以外は全部署共通化可能**。競合計算は `'早番'` / `'日勤'` をハードコードしているためeiyo専用。

### ⑤ 個人名ハードコード

なし（`s.name` をループで出力）  
ただし早番キー `'早番'` / 日勤キー `'日勤'` がハードコードされている（シフト名称依存）。

### ⑥ 削除可能か

なし（理論最小不足の算出がここにある）

### ⑦ 永続的に残すべき部分

✅ **全て永続的に残す**  
特に「理論最小不足算出（早番/日勤競合計算）」と「ABC分類」はEiyoStrategyの設計判断根拠。

---

## Ⅱ. 個人名ハードコード一覧

| タグ | ハードコード名 | 条件 | 抽象化方針 |
|---|---|---|---|
| `[BLANK-CHECK]` | 「杉本」（L3308） | `s.name.includes('杉本')` | 全スタッフループに変更。空白日あるスタッフのみ出力 |
| `[BLANK-CHECK-FUKUDA]` | 「福田」（L3342） | `s.name.includes('福田')` | 全スタッフループに変更。不足解消貢献度は全員計算 |
| autoGenerate 内 `[公休追跡]` | 「高野」「伊藤」「郡司」「柳」「川村」（AG L1663等） | `s.name.includes(nm)` | 削除対象（開発デバッグ用） |
| autoGenerate 内 `[day1-track]` | `res['kaigo1_6']` （AG L1664等） | IDハードコード | 削除対象（kaigo部署専用デバッグ） |
| autoGenerate 内 `[ララ]` | 「ララ」（AG L1938等） | `s.name.includes('ララ')` | 削除対象（開発デバッグ用） |
| `[BLANK-CHECK-FUKUDA]` 内 | `adoptedMinStaffShortDays - _bfImproveable` | 福田1人で算出 | 全スタッフ合算に変更 |

---

## Ⅲ. 削除可能なログ vs 永続的に残すべきログ

| ログ | 分類 | 方針 | 理由 |
|---|---|---|---|
| [LEARN-PICK] 日別サンプル | ❌削除可 | 開発完了後削除 | 学習チューニング完了後は不要 |
| [公休追跡] 個人名ハードコード行 | ❌削除可 | 削除 | 特定スタッフの開発デバッグ用 |
| [day1-track] | ❌削除可 | 削除 | kaigoスタッフIDハードコード |
| [ララ]追跡 | ❌削除可 | 削除 | 個人名デバッグ用 |
| [BLANK-CHECK] 杉本限定 | ❌削除・汎用化 | 全スタッフ対象に抽象化 | 個人名依存を解消 |
| [BLANK-CHECK-FUKUDA] 福田限定 | ❌削除・汎用化 | 全スタッフ対象に抽象化 | 個人名依存を解消 |
| [LEARN-PICK] 統計ヘッダー | ✅残す | metrics.learnStats へ | 学習品質の指標 |
| [TimeAxis-BESTOF] | ✅残す | metrics.trialSummary へ | 生成品質の最重要指標 |
| [TimeAxis-CHECK] | ✅残す | violations へ統合（重複排除） | 品質保証ログ |
| [TimeAxis-DIAG] | ✅残す | shortages.byDay へ構造化 | 不足原因分析の中核 |
| [SHORTAGE-CLASSIFY] ABCD分類 | ✅残す | shortages.classify へ | 不足カテゴリ分類 |
| [SHORTAGE-ABC] 全セクション | ✅残す | shortages.theory へ | 理論最小不足の根拠 |

---

## Ⅳ. DiagnosticReport 構造の再評価

### 現在案

```javascript
{
  metrics,
  violations,
  shortages,
  blanks,
  staffSummary
}
```

### 再評価結果: 不足なし、ただし以下の追加を推奨

```javascript
DiagnosticReport = {
  // 試行統計（ScoreEngine + 試行ループの観測）
  metrics: {
    trials: number,         // N_TRIALS
    passCount: number,      // checkAbsolute合格数
    adoptedScore: number,   // bestPassingScore
    adoptedMinStaffShort: number,  // adoptedMinStaffShortDays
    learnStats: {           // [LEARN-PICK]
      learned: number,
      fallback: number,
      noData: number,
    },
  },

  // 絶対条件違反（checkAbsolute の結果）
  violations: {
    v1_restCount: number,   // ①公休数違反
    v2_yukyu: number,       // ②有休固定違反
    v3_roleShift: number,   // ③許可種別違反
    v4_consecWork: number,  // ④連勤超過
    v5_maxStaff: number,    // ⑤maxStaff超過
    v6_minStaff: number,    // ⑥minStaff不足日数（adoptedMinStaffShort と同値）
  },

  // minStaff不足詳細（[TimeAxis-DIAG] + [SHORTAGE-CLASSIFY] + [SHORTAGE-ABC]）
  shortages: {
    total: number,
    byShift: { [shiftKey]: number },       // シフト別不足日数
    byDay: { [day]: ShortageDetail[] },    // 日別詳細（原因分類付き）
    classify: {                            // ABCD分類集計
      A: number,   // 構造不足（人員不足）
      B: number,   // 空白由来
      C: number,   // 配置ミス
      D: number,   // 制約由来
    },
    theory: {                              // [SHORTAGE-ABC] — eiyo専用
      byShiftCapacity: { [shiftKey]: { required: number, maxAvail: number } },
      conflictCalc?: {                     // 早番/日勤競合（シフト名依存のためオプション）
        earlyOnly: number,
        dayOnly: number,
        both: number,
        minShortfall: number,             // 理論最小不足件数
      },
      abcCount: { A: number, B: number, C: number },
    },
  },

  // 空白セル診断（[BLANK-CHECK] + [BLANK-CHECK-FUKUDA] の汎用化）
  blanks: {
    [staffId]: {
      count: number,
      days: number[],
      structural: number[],   // 構造的に埋め不可な日
      missable: number[],     // 埋め忘れの疑いがある日
      improveable: number,    // 埋めれば不足解消できる日数
    },
  },

  // スタッフ別サマリー（[STAFF-SNAP] 相当）
  staffSummary: {
    [staffId]: {
      name: string,
      role: string,
      targetRest: number,
      actualRest: number,
      restDiff: number,
      workByShift: { [shiftKey]: number },
      blankDays: number,
    },
  },
}
```

### 現在案に対する差分

| 項目 | 現在案 | 追加・変更 |
|---|---|---|
| `metrics` | 基本構造あり | `learnStats` を追加 |
| `violations` | 基本構造あり | フィールド名を明確化（v1〜v6） |
| `shortages` | 基本構造あり | `theory.conflictCalc.minShortfall`（理論最小不足）を追加 |
| `blanks` | 基本構造あり | `improveable`（不足解消貢献日数）を追加 |
| `staffSummary` | 基本構造あり | `blankDays` を追加 |

---

## Ⅴ. 理論最小不足18件の出力場所と管理方法

### 現在の出力場所

**`[SHORTAGE-ABC]` 内 L3425〜3427**:

```javascript
const _minShort = _dReq - _dMaxAvail;
_abcLines.push(`  → ❌日勤: 理論上不可能 (不足最小値=${_minShort}日)`);
```

早番/日勤 競合計算の結果として `_dMaxAvail < _dReq` のとき `_minShort = _dReq - _dMaxAvail` が理論最小不足件数。  
これが **18件（確定事実）** に対応する計算値。

### DiagnosticEngine移動後の管理方法

```javascript
// DiagnosticEngine が出力する DiagnosticReport の中に格納
report.shortages.theory.conflictCalc.minShortfall = 18  // 確定値

// 呼び出し元での確認
if (report.shortages.theory.conflictCalc?.minShortfall > 0) {
  // UIへの警告: 「このシフト構成は理論上 N 件の不足が発生します」
  console.warn(`[理論最小不足] ${dept.id}: ${report.shortages.theory.conflictCalc.minShortfall}件（構造的不足・人員設定変更が必要）`);
}
```

**管理方針**:
- `minShortfall` は月・人員構成が変わるたびに再計算される動的値
- 「18件」は現状の人員構成における確定値であり、人員変更・公休日数変更で変動する
- DiagnosticEngine はこの値を毎回算出し、UI 警告フラグとして返す
- 過去セッションで確認された「18件」は設計上の基準値として文書に記録するが、コードにはハードコードしない

---

## Ⅵ. DiagnosticEngine 移動時の前提条件

| 前提条件 | 内容 |
|---|---|
| `selectedRes` の確定後に実行 | 全診断ロジックが `selectedRes` を参照。試行ループ後の後処理として実行 |
| `s._ta_totalTarget` の設定後 | Step2完了が必須（staffSummary.targetRest 算出に必要） |
| `checkAbsolute` の結果を受け取る | [TimeAxis-CHECK] の重複計算を排除するため |
| `adoptedMinStaffShortDays` の確定後 | warnings構築後に診断ブロックが実行される現行順序を維持 |
| `getAllowed(s)` が利用可能 | TA版 dayTypes（明け除外）に依存 → Step7完了後に利用可能 |

---

## Ⅶ. 全ログの責務分類まとめ

| ログタグ | 責務 | eiyo専用 | 個人名HCoded | 削除可否 | DiagnosticReport格納先 |
|---|---|---|---|---|---|
| [STAFF-SNAP]（未実装） | DE | — | — | — | staffSummary |
| [LEARN-PICK] 統計 | DE/SE | 部分 | なし | 条件付き | metrics.learnStats |
| [LEARN-PICK] 日別サンプル | DE | eiyo専用 | なし | ❌削除可 | （削除） |
| [TimeAxis-BESTOF] | DE/SE | 全部署 | なし | ✅残す | metrics.trialSummary |
| [TimeAxis-CHECK] | DE/SE | 全部署 | なし | 統合（重複排除） | violations |
| [TimeAxis-DIAG] | DE | 全部署 | なし | ✅残す | shortages.byDay |
| [SHORTAGE-CLASSIFY] | DE | eiyo専用 | なし | ✅残す→全部署拡張 | shortages.classify |
| [BLANK-CHECK] | DE | eiyo専用 | 🔴杉本 | 汎用化 | blanks[s.id] |
| [BLANK-CHECK-FUKUDA] | DE | eiyo専用 | 🔴福田 | 汎用化 | blanks[s.id].improveable |
| [SHORTAGE-ABC] | DE | eiyo専用 | なし | ✅残す | shortages.theory |
| [公休追跡] 個人名 (AG) | DE | AG | 🔴高野等 | ❌削除可 | （削除） |
| [day1-track] (AG) | DE | AG | 🔴kaigo1_6 | ❌削除可 | （削除） |
| [ララ] (AG) | DE | AG | 🔴ララ | ❌削除可 | （削除） |

---

## Ⅷ. Phase2実装優先順位（設計書のみ・実装禁止）

| 優先 | タスク | 理由 |
|---|---|---|
| 1 | 個人名ハードコード削除（杉本・福田・高野等） | 技術的負債の解消・保守性向上 |
| 2 | [TimeAxis-CHECK] を checkAbsolute 結果再利用に統合 | 重複ロジック排除 |
| 3 | [BLANK-CHECK] / [BLANK-CHECK-FUKUDA] の全スタッフ汎用化 | blanks フィールド汎用化 |
| 4 | [SHORTAGE-CLASSIFY] の全部署拡張 | shortages.classify 汎用化 |
| 5 | DiagnosticReport 構造体として返却 | generateTimeAxis の戻り値拡張 |

---

*調査完了: 実装禁止 / コード変更禁止*
