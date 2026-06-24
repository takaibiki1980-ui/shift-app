# DiagnosticEngine Phase2 設計レビュー

レビュー日: 2026-06-24  
対象: `docs/DIAGNOSTIC_ENGINE_PHASE2.md`  
実装禁止 / コード変更禁止 / レビューのみ

---

## レビュー総評

| 項目 | 評価 | 備考 |
|---|---|---|
| 責務境界の明確さ | ⚠️ 要注意点あり | SE/DE 境界が一部曖昧 |
| DiagnosticReport構造 | ✅ 十分 | 軽微な追加推奨あり |
| 理論最小不足件数の管理 | ✅ 設計済み | 実装時に注意点あり |
| eiyo専用/全部署共通の分類 | ✅ 適切 | 拡張方針も明記済み |
| 個人名ハードコード排除設計 | ⚠️ 不完全 | AG側の削除方針が曖昧 |
| 削除/残存ログの最終分類 | ✅ ほぼ確定 | 1件追加判断が必要 |
| CommonEngine移行の完全性 | ⚠️ 不足あり | 前提条件が未記載の項目あり |

---

## 1. DiagnosticEngine の責務は明確か

### 1-1. 責務境界 — 判定

**ConstraintEngine との境界**: ✅ 明確

DiagnosticEngine は `res` を変更しない（読み取り専用）という原則が設計書で一貫している。  
ConstraintEngine（判定のみ）との境界は問題なし。

**RepairEngine との境界**: ✅ 明確

DiagnosticEngine のログはすべて `selectedRes`（採用後の確定シフト表）を参照しており、
repair フェーズ中のループ内には介入しない設計。境界は明確。

**ScoreEngine との境界**: ⚠️ 要注意

下記 2 ブロックが DE と SE の二重責務を持つと設計書に記載されている。

| ログ | 現在の分類 | 問題点 |
|---|---|---|
| [TimeAxis-BESTOF] | DE/SE | `bestPassingScore`（SE出力）を受け取って表示するだけなら DE 単体で成立 |
| [TimeAxis-CHECK] | DE/SE | `checkAbsolute` の再実行はSEの重複。統合後は DE 単体になる |

**判定**: [TimeAxis-BESTOF] は SE の「出力を受け取る」という意味で DE/SE 二重責務ではなく  
「SE が計算した値を DE が出力する」という正常な依存関係。  
分類表現を `DE（SE出力を利用）` と明示することで曖昧さを解消できる。

**StrategyEngine との境界**: ✅ 明確

DiagnosticEngine は EiyoStrategy（TA専用）の出力である `selectedRes` を診断対象とするだけで、
StrategyEngine 内部の選択ロジックには干渉しない。境界は明確。

### 1-2. 懸念事項: [SHORTAGE-ABC] の `getAllowed` 依存

[SHORTAGE-ABC] が `getAllowed(s)`（TA版・Step7依存）を使用している。  
Step 7 が未完了の現状では DiagnosticEngine 移動の前提条件を満たさない。  
設計書のⅥ「移動時の前提条件」に `getAllowed(s)` の Step7 依存は記載済み。  
**実装順序の誤りを防ぐため、Step7 完了前の Phase2 実装開始を禁止する判定を明記すべき。**

---

## 2. DiagnosticReport 構造の評価

### 2-1. 現在の構造案

```javascript
{
  metrics,        // 試行統計
  violations,     // 絶対条件違反
  shortages,      // minStaff不足詳細
  blanks,         // 空白セル診断
  staffSummary    // スタッフ別サマリー
}
```

### 2-2. フィールド充足評価

| フィールド | 評価 | コメント |
|---|---|---|
| `metrics.trials / passCount / adoptedScore` | ✅ | [TimeAxis-BESTOF] の全情報を網羅 |
| `metrics.learnStats` | ✅ | [LEARN-PICK] の統計部分を吸収 |
| `violations.v1〜v6` | ✅ | checkAbsolute の6条件に1対1対応 |
| `shortages.total / byShift / byDay` | ✅ | [TimeAxis-DIAG] の出力を構造化 |
| `shortages.classify` (ABCD) | ✅ | [SHORTAGE-CLASSIFY] を吸収 |
| `shortages.theory.conflictCalc.minShortfall` | ✅ | 理論最小不足を格納 |
| `blanks[s.id].structural / missable / improveable` | ✅ | 杉本・福田ロジックの汎用化 |
| `staffSummary[s.id]` | ✅ | [STAFF-SNAP] 相当を吸収 |

### 2-3. 不足していると判断される項目

| 項目 | 理由 | 追加提案 |
|---|---|---|
| `metrics.adoptedMinStaffShort` と `violations.v6_minStaff` の重複 | 同じ値が2か所に格納される設計になっている | `violations.v6_minStaff` を canonical とし、`metrics` では参照のみとするか、どちらかを削除 |
| `shortages.theory` の eiyo 専用フラグ | `shortages.theory` は eiyo 専用だが、構造上 null になる部署での扱いが未定義 | `shortages.theory: null \| TheorySection` と明示し、null チェックを呼び出し元に課す |
| `staffSummary[s.id].blankDays` の定義 | `blanks[s.id].count` と重複の可能性 | `blanks` が存在する場合は `staffSummary.blankDays` への参照で済む。独立フィールドとして残すなら明示的に「重複許容・可読性のため」と注記すること |

---

## 3. 理論最小不足件数の管理

### 3-1. 現在の設計

- 算出箇所: `[SHORTAGE-ABC]` L3425 `const _minShort = _dReq - _dMaxAvail;`
- 格納先: `report.shortages.theory.conflictCalc.minShortfall`
- 管理方針: 毎回再計算（ハードコードしない）

### 3-2. レビュー判定: ✅ 設計は適切

「18件」という確定値はコードにハードコードせず毎回算出する設計は正しい。  
人員構成・公休日数が変われば値は変動するため、動的算出が必須。

### 3-3. 実装時の注意点（未記載）

以下の点が Phase2.md に記載されていないため、実装前に確認が必要：

**① `_minShort` は `_dMaxAvail < _dReq` の場合のみ計算される**  
充足できている月は `_minShort` が算出されない（`conflictCalc` が生成されない）。  
→ `conflictCalc` フィールドをオプション型 `?` として設計済み（OK）。  
→ ただし `minShortfall` が 0 の場合も `conflictCalc` を生成すべきか否かを明示すること。

**② `_ta_totalTarget` 依存**  
[SHORTAGE-ABC] は `s._ta_totalTarget`（Step2で設定）を参照する。  
DiagnosticEngine が CommonEngine として独立する際に、この値をどう受け取るかが未定義。  
→ DiagnosticEngine への入力として `staffTargets: { [id]: number }` を明示的に渡す設計が必要。

---

## 4. eiyo専用ログ / 全部署共通ログの分類

### 4-1. 分類表の確認

| ログ | 設計書の分類 | 評価 |
|---|---|---|
| [LEARN-PICK] 統計 | 「部分的に全部署共通」 | ✅ 適切（USE_LEARN_PICK=false の部署では空になる） |
| [TimeAxis-BESTOF] | 全部署共通 | ✅ 適切 |
| [TimeAxis-CHECK] | 全部署共通 | ✅ 適切 |
| [TimeAxis-DIAG] | 全部署共通 | ✅ 適切 |
| [SHORTAGE-CLASSIFY] | eiyo専用→拡張 | ✅ 適切。拡張方針も明記 |
| [BLANK-CHECK] | eiyo専用→汎用化 | ✅ 適切 |
| [BLANK-CHECK-FUKUDA] | eiyo専用→汎用化 | ✅ 適切 |
| [SHORTAGE-ABC] 競合計算 | eiyo専用（`'早番'`/`'日勤'` ハードコード） | ✅ 適切。オプション型で対応 |

### 4-2. 追加指摘: `[SHORTAGE-CLASSIFY]` の拡張基準が未定義

「全部署共通に拡張する価値がある」と記載されているが、  
**拡張するための条件**（`cleanMinStaff` が設定されていること、など）が明記されていない。

推奨: 以下の条件が揃う部署でのみ有効化する設計を追記すること。
- `Object.keys(dept.cleanMinStaff ?? {}).length > 0`（minStaff設定あり）
- `adoptedMinStaffShortDays > 0`（実際に不足が発生）

---

## 5. 個人名ハードコードの排除設計

### 5-1. TA側（generateTimeAxis内）の評価

| 名前 | 箇所 | 設計書の方針 | 評価 |
|---|---|---|---|
| 杉本 | [BLANK-CHECK] L3308 | 全スタッフループに変更 | ✅ |
| 福田 | [BLANK-CHECK-FUKUDA] L3342 | 全スタッフループに変更 | ✅ |

### 5-2. AG側（autoGenerate内）の評価

| 名前/ID | 箇所 | 設計書の方針 | 評価 |
|---|---|---|---|
| 高野・伊藤・郡司・柳・川村 | [公休追跡] AG | 削除対象 | ⚠️ 削除範囲が不明確 |
| `kaigo1_6` | [day1-track] AG | 削除対象 | ⚠️ 削除範囲が不明確 |
| ララ | [ララ] AG | 削除対象 | ⚠️ 削除範囲が不明確 |

**問題点**: AG側の削除対象ログについて、  
削除する**行の範囲（開始行〜終了行）** が設計書に記載されていない。

実装時に間違って autoGenerate の別ロジックを削除するリスクがある。  
**Phase2 実装前に AG側の対象行を確認・記録するステップを設けること。**

### 5-3. 「個人名完全排除」の達成可否

| 条件 | 達成見込み |
|---|---|
| TA側（杉本・福田）の排除 | ✅ 設計通りに実装すれば達成可能 |
| AG側（高野等・kaigo1_6・ララ）の削除 | ⚠️ 対象行の事前特定が必要 |
| 将来の新規ハードコード防止 | ❌ 設計書に言及なし。レビュー基準の追加を推奨 |

**追加推奨**: `s.name.includes(` を禁止パターンとして CLAUDE.md またはコードコメントに記録し、  
将来の実装者が誤って個人名ハードコードを追加しないよう防止策を明示すること。

---

## 6. 削除可能ログ / 残すべきログの最終分類

### 最終確定分類表

| ログ | 最終分類 | 根拠 |
|---|---|---|
| [LEARN-PICK] 日別サンプル行 | ❌ **削除** | 学習チューニング完了後は不要。デバッグ用途のみ |
| [公休追跡] 個人名行（AG） | ❌ **削除** | `s.name.includes(nm)` 型のデバッグログ |
| [day1-track]（AG） | ❌ **削除** | `res['kaigo1_6']` IDハードコード。kaigo専用デバッグ |
| [ララ]追跡（AG） | ❌ **削除** | 個人名デバッグログ |
| [BLANK-CHECK] 杉本限定部分 | ❌ **削除**（ロジックは汎用化して保持） | 個人名フィルタを除去 |
| [BLANK-CHECK-FUKUDA] 福田限定部分 | ❌ **削除**（ロジックは汎用化して保持） | 個人名フィルタを除去 |
| [LEARN-PICK] 統計ヘッダー | ✅ **保持** → `metrics.learnStats` | 学習品質の指標として必要 |
| [TimeAxis-BESTOF] | ✅ **保持** → `metrics.trialSummary` | 生成品質の最重要指標 |
| [TimeAxis-CHECK] | ✅ **保持・統合** → `violations` | checkAbsolute 結果を再利用して重複排除 |
| [TimeAxis-DIAG] | ✅ **保持** → `shortages.byDay` | 不足原因分析の中核 |
| [SHORTAGE-CLASSIFY] | ✅ **保持・拡張** → `shortages.classify` | 全部署共通化後も必要 |
| [BLANK-CHECK] 診断ロジック | ✅ **保持・汎用化** → `blanks[s.id]` | 空白日診断は全スタッフで有用 |
| [BLANK-CHECK-FUKUDA] 貢献度ロジック | ✅ **保持・汎用化** → `blanks[s.id].improveable` | 不足解消貢献度は全スタッフで有用 |
| [SHORTAGE-ABC] 全セクション | ✅ **保持** → `shortages.theory` | 理論最小不足の算出根拠として必要 |

### 追加判断が必要な項目

| ログ | 状況 | 判断が必要な理由 |
|---|---|---|
| [LEARN-PICK] eiyo専用サンプル行 | 「削除可」とされているが閾値未定 | 「学習チューニング完了」の定義がない。`USE_LEARN_PICK` フラグを削除基準とするか、別フラグを立てるか |
| [SHORTAGE-ABC] 早番/日勤ハードコード | eiyo専用として保持 | 他部署で類似競合が発生した場合の対応方針（シフトキーを `dept.conflictPair` として設定値化するか）が未定義 |

---

## 7. CommonEngine 移行時に不足している情報

### 7-1. 現在の前提条件（設計書Ⅵ）の評価

| 前提条件 | 評価 |
|---|---|
| `selectedRes` の確定後に実行 | ✅ 明確 |
| `s._ta_totalTarget` の設定後 | ✅ 明確（Step2依存） |
| `checkAbsolute` の結果を受け取る | ✅ 明確 |
| `adoptedMinStaffShortDays` の確定後 | ✅ 明確 |
| `getAllowed(s)` が利用可能（Step7依存） | ✅ 明確 |

### 7-2. 設計書に記載されていない不足情報

以下の情報が CommonEngine 移行時に必要だが設計書に明記されていない：

#### ① DiagnosticEngine の呼び出しシグネチャが未定義

DiagnosticEngine を CommonEngine のサブモジュールとして分離する際、  
どの関数から呼び出され、どの引数を受け取るかが未定義。

**必要な定義**:
```javascript
// 暫定シグネチャ案
function runDiagnosticEngine({
  dept,
  ds,
  days,
  selectedRes,
  checkAbsoluteResult,    // { v1, v2, v3, v4, v5, v6 }
  adoptedMinStaffShortDays,
  learnStats,             // { learned, fallback, noData }
  trialSummary,           // { trials, passCount, bestScore }
  staffTargets,           // { [id]: _ta_totalTarget }
  // TA環境変数
  cleanMinStaff,
  cleanMaxStaff,
  getAllowed,
  deptWork,
  deptRest,
  lockedDays,
  maxConsec,
}): DiagnosticReport
```

#### ② `generateTimeAxis` から DiagnosticEngine への切り出しポイントが未定義

現在 generateTimeAxis 内に散在するログブロックをどの行で切り出すかが未定義。  
設計書には「採用後の後処理として実行」とあるが、具体的な抽出開始行・終了行が未記載。

**補足**: L3166〜L3492 が DiagnosticEngine の抽出対象範囲と推定されるが、  
`warnings` 配列の構築（L3xxx）との依存関係を確認する必要がある。

#### ③ AG側のログをどう扱うか方針が未記載

AG側の削除対象ログ（[公休追跡]/[day1-track]/[ララ]）は  
DiagnosticEngine には移動せず単純削除する方針と理解しているが、  
「autoGenerate 内に DiagnosticEngine を呼ぶ設計にするか否か」が明示されていない。

**推奨方針案**:  
autoGenerate は TA に比べてシンプルな生成（試行なし）のため、  
DiagnosticEngine をそのまま適用するのではなく、  
AG専用の簡易診断（violations のみ）として別関数にするか、  
あるいは AG には DiagnosticEngine を適用しない（ログのみ削除）かを確定すること。

#### ④ 返却した DiagnosticReport の利用側（UI・警告）が未定義

`report.shortages.theory.conflictCalc.minShortfall` を UI に表示する設計は示されているが、  
呼び出し元（generateTimeAxis の return 値）にどう組み込むかが未定義。

現在 generateTimeAxis は `{ res, warnings }` 形式（推定）を返している。  
`{ res, warnings, diagnostics: DiagnosticReport }` への拡張が必要だが、  
この変更が呼び出し元（App コンポーネント側）に与える影響の調査が未実施。

---

## 8. 実装可否の総合判定

### 判定: ⚠️ 条件付き実装可

以下の条件をすべて確認・解消してから Phase2 実装を開始すること。

| 条件 | 状態 | 対応 |
|---|---|---|
| Step7（getAllowedTypes 引数化）の完了 | ❌ 未完了（保留中） | [SHORTAGE-ABC] 等が Step7 依存。Step7 前に実装する場合は `getAllowed` を直接参照するままとし、Step7 完了後にリファクタ |
| AG側削除対象行の特定 | ❌ 未調査 | 実装前に対象行番号を確認 |
| DiagnosticEngine 呼び出しシグネチャの確定 | ❌ 未定義 | 実装前に設計書へ追記 |
| `generateTimeAxis` の return 値拡張の影響調査 | ❌ 未調査 | App コンポーネント側の呼び出し箇所を確認 |
| 個人名ハードコード再発防止策 | ❌ 未記載 | CLAUDE.md または設計書に禁止パターンを追記 |

### 段階実装の推奨順序（条件付き）

Step7 未完了を前提とした場合、以下の順序であれば実装可能：

| 優先 | タスク | Step7 依存 | 実装可否 |
|---|---|---|---|
| 1 | AG側の個人名ハードコード削除（高野等・kaigo1_6・ララ） | なし | ✅ 今すぐ可能 |
| 2 | [BLANK-CHECK] 杉本 → 全スタッフ汎用化 | なし | ✅ 今すぐ可能 |
| 3 | [BLANK-CHECK-FUKUDA] 福田 → 全スタッフ汎用化 | なし | ✅ 今すぐ可能 |
| 4 | [TimeAxis-CHECK] を checkAbsolute 結果再利用に統合 | なし | ✅ 今すぐ可能 |
| 5 | [SHORTAGE-CLASSIFY] の全部署拡張 | あり（`getAllowed` 依存） | ⚠️ Step7 後推奨 |
| 6 | DiagnosticReport 構造体として返却 | あり（シグネチャ定義後） | ⚠️ 最後 |

---

## 9. 設計書への追記推奨事項

| 項目 | 追記内容 |
|---|---|
| Ⅰ. 各ログブロック | [TimeAxis-BESTOF] の責務を `DE（SE出力を利用）` に修正 |
| Ⅱ. 個人名ハードコード | AG側削除対象の行番号範囲を追記 |
| Ⅵ. 移動時の前提条件 | Step7 未完了時の代替方針（`getAllowed` 直接参照を暫定とする旨）を追記 |
| （新Ⅸ） | DiagnosticEngine 呼び出しシグネチャ案を追記 |
| （新Ⅹ） | `generateTimeAxis` return 値拡張の影響範囲を追記 |
| （新Ⅺ） | AG側に DiagnosticEngine を適用するか否かの方針を明記 |
| （新Ⅻ） | `s.name.includes(` 禁止パターンの注記を追記 |

---

*レビュー完了: 実装禁止 / コード変更禁止*
