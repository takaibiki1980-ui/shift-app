# DiagnosticEngine Phase2 — ログ差分レビュー

レビュー日: 2026-06-24  
対象: Phase2 実装フェーズ1（直近コミット `1a3910b`）  
コード変更禁止 / 実装禁止 / コミット禁止

---

## 作業前回答

### 現在フェーズ

**Phase2 DiagnosticEngine（実装フェーズ1 完了・フェーズ2 計画中）**

---

### 最終目標

```
CommonEngine
├ ConstraintEngine  ← Phase1 完了（Step5/6/8/9 抽出済み）
├ RepairEngine       ← Phase3（設計調査済み）
├ DiagnosticEngine  ← Phase2（現在地）
├ ScoreEngine        ← Phase5
├ LearningEngine    ← 未調査
├ KaigoStrategy     ← Phase4
└ EiyoStrategy      ← Phase6（再設計）

generateTimeAxis 解体 + EiyoStrategy 再設計
```

---

### 最終目標まで残りフェーズ

```
Phase2 DiagnosticEngine（実装フェーズ1完了）
  ↓ Phase2 フェーズ2（BLANK-CHECK 統合・SHORTAGE-CLASSIFY 拡張）
Phase3 RepairEngine
  ↓
Phase4 StrategyEngine（KaigoStrategy / EiyoStrategy 分離）
  ↓
Phase5 ScoreEngine（checkAbsolute / calcScore 分離）
  ↓
Phase6 EiyoStrategy 再設計

残り: Phase2完了 + Phase3〜6 = 実質4.5フェーズ
```

---

### 今回で生成結果は変わるか

**生成結果: 変化なし**

| 理由 | 根拠 |
|---|---|
| DiagnosticEngine変更のみ | 全ブロックが `selectedRes` 参照のみ（res変更なし） |
| autoGenerate の生成ロジック変更なし | 削除したのはデバッグ `console.log/error` のみ |
| generateTimeAxis の生成ロジック変更なし | checkAbsolute(selectedRes) の呼び出し追加はログ用途のみ。trialRes選別には使用せず |
| BLANK-CHECK/FUKUDA のフィルタ変更 | 診断ログのみ。selectedRes の内容を変更しない |
| 介護エンジン変更なし | AG側の削除対象は console.log/error のみ。生成ロジック（PassC/enforceMaxStaff 等）は無変更 |

---

## 1. 削除されたログ一覧

### 1-1. AG側（autoGenerate）— 11行削除

| タグ | 旧行番号 | 削除内容 | ハードコード名 |
|---|---|---|---|
| `[公休追跡] PassB終了` | 1559 | 高野・伊藤・郡司・柳・川村 の公休状況 | 高野/伊藤/郡司/柳/川村 |
| `[公休追跡] PassC終了` | 1663 | 高野・伊藤・郡司・柳・川村 の公休状況 | 高野/伊藤/郡司/柳/川村 |
| `[day1-track] PassC後` | 1664 | `res['kaigo1_6']?.[1]` の値 | kaigo1_6 |
| `[公休追跡] 公休数調整後` | 1745 | 高野・伊藤・郡司・柳・川村 の公休状況 | 高野/伊藤/郡司/柳/川村 |
| `[day1-track] transitionFix後` | 1808 | `res['kaigo1_6']?.[1]` の値 | kaigo1_6 |
| `[day1-track] minStaff後` | 1893 | `res['kaigo1_6']?.[1]` の値 | kaigo1_6 |
| `[ララ] 公休数回復後` | 1938 | ララ の公休状況 | ララ |
| `[ララ] 超過バリデーション後` | 1991 | ララ の公休状況 | ララ |
| `[ララ] 最終出力` | 2116 | ララ の公休状況 | ララ |
| `[day1-final]` | 2117 | `res['kaigo1_6']?.[1,2,3]` の値 | kaigo1_6 |
| `[day1-track] return直前` | 2118 | `res['kaigo1_6']?.[1]` の値 | kaigo1_6 |

**小計**: 3タグ × 削除行数 — `[公休追跡]`×3 / `[day1-track]`×4 / `[ララ]`×3 / `[day1-final]`×1 = **11行削除**

### 1-2. TA側（generateTimeAxis）— 23行削除

| タグ | 変更内容 | 削除行数 |
|---|---|---|
| `[TimeAxis-CHECK]` 重複ロジック | v1〜v5 の再計算ループ削除（25行 → 2行に統合） | -23行 |

**全体削除行数合計**: 34行削除

---

## 2. 追加されたログ一覧

### 2-1. checkAbsolute(selectedRes) 呼び出し（TA側）

| 行番号 | タグ | 出力条件 | 出力内容 |
|---|---|---|---|
| L3160 | （内部計算） | 常時 | `checkAbsolute(selectedRes)` を呼び出し `_tcDetail` に格納 |
| L3161 | `[TimeAxis-CHECK]` | 常時 | `_tcDetail.v1〜v5` を使用（出力フォーマット変更なし） |

**ポイント**: 出力内容は旧実装と同一。v1〜v5の計算ロジックが `checkAbsolute` と完全に同一であるため、値の差異は発生しない。

### 2-2. BLANK-CHECK / BLANK-CHECK-FUKUDA の出力拡張

旧実装（杉本・福田の1人ずつ）と比べ、全eiyo スタッフに対して出力されるようになった。  
これは「追加されたログ」ではなく「既存ログの出力対象が拡張」された変更。

---

## 3. 出力件数増加量

### 前提: eiyo スタッフ構成（推定）

eiyo の roles = `["管理栄養士","栄養士","調理師"]`。  
minStaff: `早番:1 日勤:1` / maxStaff: `早番:1` の制約から、最低2名体制。  
理論最小不足18件の算出構造から、実際のスタッフ数は **6〜10名程度** と推定（以下では8名で試算）。

### BLANK-CHECK 出力件数

| 項目 | 変更前（杉本1名） | 変更後（全スタッフ） |
|---|---|---|
| 空白日なしの場合 | 1行 `空白日なし` | 8行（スタッフ数×`空白日なし`） |
| 空白日ありの場合（K日・M許可シフト） | K×M行 | スタッフごとに K×M行 |
| 1人が5空白日・2シフトの場合 | 10行 | 最大 8人×10行 = 80行 |

### BLANK-CHECK-FUKUDA 出力件数

| 項目 | 変更前（福田1名） | 変更後（全スタッフ） |
|---|---|---|
| 空白日なしの場合 | 1行 `空白日なし` | 8行 |
| 空白日ありの場合（K日） | 1+K+1行（ヘッダー+日別+フッター） | 8人×(1+K+1)行 |
| 1人が5空白日の場合 | 7行 | 最大 8人×7行 = 56行 |

### 最悪ケース（eiyo 全スタッフに空白日が多い場合）

| ブロック | 最悪ケース出力 | 条件 |
|---|---|---|
| BLANK-CHECK | ~130行 | 8人×5空白日×3許可シフト |
| BLANK-CHECK-FUKUDA | ~56行 | 8人×(1+5+1)行 |
| **合計** | **~186行** | 両ブロックが同じスタッフを重複処理 |

### 重要: 二重出力の発生

**現在の実装では BLANK-CHECK と BLANK-CHECK-FUKUDA が同一スタッフを2回処理する**。  
空白日がないスタッフは同じ1人に対して以下の2行が出力される：

```
[BLANK-CHECK] 氏名: 空白日なし
[BLANK-CHECK-FUKUDA] 氏名(role): 空白日なし 許可=早番/日勤
```

空白日があるスタッフは 両ブロックで分析が重複実行される。

---

## 4. BLANK-CHECK汎用化による大量ログ化リスク

### 4-1. スタッフ人数増加時

| スタッフ数 | BLANK-CHECK最大行数 | BLANK-CHECK-FUKUDA最大行数 | 合計 |
|---|---|---|---|
| 5名 | ~75行 | ~35行 | ~110行 |
| 8名（現在推定） | ~120行 | ~56行 | ~176行 |
| 15名 | ~225行 | ~105行 | ~330行 |
| 30名 | ~450行 | ~210行 | ~660行 |

スタッフが増えると線形に増加する。30名規模の部署では600行超。

### 4-2. 介護部署で実行された場合

**影響なし**。両ブロックは `if (dept.id === 'eiyo')` でガードされている（L3272, L3305）。  
kaigo1/kaigo2/jimu/kango では実行されない。

### 4-3. 栄養科（eiyo）で実行された場合

**影響あり（大量ログ）**。上記試算通り。  
ただし発動条件に注意：
- BLANK-CHECK: 空白日があるスタッフのみ詳細出力（`if (_bcBlanks.length === 0) return`）
- BLANK-CHECK-FUKUDA: 同様

空白日ゼロの運用が安定していれば、実際には `空白日なし` の2行/スタッフのみになる。  
問題が発生するのは「空白日が多い月」（生成精度が低い場合）に限定される。

### 4-4. 本番利用時のログ量

| 状況 | 出力量 | 評価 |
|---|---|---|
| 空白日0 / 全スタッフ埋め完了 | スタッフ数×2行（空白日なし×2ブロック） | 許容範囲 |
| 空白日5日以内 / 一部スタッフ | ~50行 | 許容範囲 |
| 空白日多数 / minStaff不足あり | ~180行以上 | **要注意** |
| 空白日多数 + 全スタッフ空白あり | ~660行（30名想定） | **過剰** |

---

## 5. 本番運用への影響

### 評価: ⚠️ **注意**

| 項目 | 評価 | 根拠 |
|---|---|---|
| 生成結果への影響 | **なし** | selectedRes を変更するコードは一切なし |
| 介護エンジンへの影響 | **なし** | eiyo ガードが確実に機能（L3272, L3305） |
| ログ出力量の増加 | **注意** | 変更前: 2名分 → 変更後: 全スタッフ分（最大N倍） |
| 二重出力 | **注意** | BLANK-CHECK と BLANK-CHECK-FUKUDA が同一スタッフを2回処理 |
| パフォーマンス | **軽微** | ログ出力はブラウザのDevToolsに出るのみ。生成速度に影響なし |

### 具体的な問題点

**問題1: BLANK-CHECK + BLANK-CHECK-FUKUDA の重複処理**

```javascript
// 現在の実装（L3272）
if (dept.id === 'eiyo') {
  ds.forEach(s => {  // 全スタッフ
    // BLANK-CHECK の診断
  });
}

// 現在の実装（L3305）
if (dept.id === 'eiyo') {
  ds.forEach(s => {  // 同じ全スタッフを再処理
    // BLANK-CHECK-FUKUDA の診断（より詳細）
  });
}
```

BLANK-CHECK-FUKUDA は BLANK-CHECK の上位互換（前日/翌日コンテキスト + 不足解消貢献度を追加）。  
同一スタッフを2回処理するのは冗長。

**問題2: 空白日なし時の二重出力**

空白日のないスタッフに対し毎回2行出力される（情報価値なし）：
```
[BLANK-CHECK] 田中: 空白日なし
[BLANK-CHECK-FUKUDA] 田中(管理栄養士): 空白日なし 許可=早番/日勤
```

### 推奨対応（次フェーズで実施）

BLANK-CHECK と BLANK-CHECK-FUKUDA を **単一ループに統合** する。  
FUKUDAブロックは BLANK-CHECK の上位互換のため、BLANK-CHECK を廃止して FUKUDA ロジックで統一する。

---

## 6. DiagnosticEngine化の次対象分類

### 現在残存しているログの分類

#### AG側（autoGenerate）

| タグ | 分類 | 理由 |
|---|---|---|
| `[不足] PassB終了` (L1558) | ✅ 保持 | 個人名なし。公休不足スタッフの汎用ログ |
| `[不足] PassC終了` (L1661) | ✅ 保持 | 個人名なし。汎用ログ |
| `[不足] 公休数調整後` (L1741) | ✅ 保持 | 個人名なし。汎用ログ |
| `[不足] enforceMaxStaff×3後` (L1891) | ✅ 保持 | 個人名なし。汎用ログ |
| `[prevTail-autoGenerate]` (L1013) | 🔴 注意 | `kaigo1_6` ハードコードあり（prevTail系・今回の対象外） |
| `[prevTail-bestOfN]` (L2330) | 🔴 注意 | `kaigo1_6` ハードコードあり |
| `[prevTail-build]` (L7596) | 🔴 注意 | `kaigo1_6` ハードコードあり |

**注意**: `[prevTail-...]` 系ログは今回の削除対象（[day1-track]/[公休追跡]/[ララ]）に含まれなかったが、  
`kaigo1_6` のIDハードコードが残存している。次フェーズでの確認を推奨。

#### TA側（generateTimeAxis）

| タグ | 分類 | 優先度 | 理由 |
|---|---|---|---|
| `[LEARN-PICK]` 統計ヘッダー (L2934) | ✅ 共通化候補 | 中 | 全部署共通。metrics.learnStats 候補 |
| `[LEARN-PICK]` 日別サンプル (L2946) | ❌ 削除候補 | 高 | eiyo専用デバッグ。学習完了後は不要 |
| `[TimeAxis-BESTOF]` (L3155) | ✅ 共通化候補 | 低 | 全部署共通。metrics.trialSummary 候補 |
| `[TimeAxis-CHECK]` (L3161) | ✅ 共通化候補 | 済 | checkAbsolute 再利用に統合済み ✓ |
| `[TimeAxis-DIAG]` (L3164) | ✅ 共通化候補 | 低 | 全部署共通。shortages.byDay 候補 |
| `[SHORTAGE-CLASSIFY]` (L3233) | ✅ 拡張候補 | 中 | eiyo専用→全部署拡張（Step7後） |
| `[BLANK-CHECK]` (L3271) | ⚠️ 統合候補 | **高** | BLANK-CHECK-FUKUDA と統合すべき |
| `[BLANK-CHECK-FUKUDA]` (L3304) | ✅ 保持（統合後） | **高** | 統合後に全スタッフ対象で継続 |
| `[SHORTAGE-ABC]` (L3345) | ✅ eiyo専用 | 低 | 理論最小不足の根拠。変更不要 |
| `[山登り]` (L3013等) | ✅ 保持 | 低 | RepairEngine 移動候補だが変更不急 |

---

## 必須報告

### 介護エンジン影響

**影響なし**

| 確認項目 | 結果 |
|---|---|
| autoGenerate の生成ロジック | 変更なし（console.log のみ削除） |
| kaigo1/kaigo2 の生成ロジック | 変更なし |
| 他部署の公休設定 | 変更なし |
| `s.id === 'kaigo1_6' && d === 1`（L1397） | 生成ロジックのため削除対象外・変更なし |
| `[prevTail-autoGenerate]`（L1013） | `prevShift('kaigo1_6')` はログ出力のみ。生成には影響なし（ただし残存） |

### 栄養科生成結果影響

**影響なし**

BLANK-CHECK / BLANK-CHECK-FUKUDA の変更は `selectedRes`（採用済みシフト表）を読み取るだけであり、  
`selectedRes` の内容を書き換えるコードは一切含まれていない（readonly ブロック）。  
生成品質・不足件数・配置内容は変化しない。

### 計画書との対応

| 項目 | 内容 |
|---|---|
| **現在位置** | Phase2 DiagnosticEngine — 実装フェーズ1 完了 |
| **完了率** | Phase2 全体の **60%** 完了 |

#### Phase2 タスク完了状況

| タスク | 状態 |
|---|---|
| AG側 個人名ハードコード削除（高野/ララ/kaigo1_6） | ✅ 完了 |
| [BLANK-CHECK] 杉本固定→全スタッフ汎用化 | ✅ 完了 |
| [BLANK-CHECK-FUKUDA] 福田固定→全スタッフ汎用化 | ✅ 完了 |
| [TimeAxis-CHECK] checkAbsolute 再利用統合 | ✅ 完了 |
| BLANK-CHECK + BLANK-CHECK-FUKUDA の統合（重複排除） | ❌ 未実施 |
| [LEARN-PICK] 日別サンプル行削除 | ❌ 未実施 |
| [SHORTAGE-CLASSIFY] 全部署拡張（Step7後） | ❌ 保留 |
| DiagnosticReport 構造体返却（シグネチャ確定後） | ❌ 保留 |

#### 次作業（Phase2 フェーズ2）

```
優先1: BLANK-CHECK + BLANK-CHECK-FUKUDA の単一ループ統合（冗長排除）
優先2: [LEARN-PICK] 日別サンプル行削除（eiyo専用デバッグ）
優先3: [prevTail-...] 系の kaigo1_6 残存ログの扱いを確認
保留: [SHORTAGE-CLASSIFY] 全部署拡張（Step7依存）
保留: DiagnosticReport 構造化（シグネチャ確定待ち）
```

### 最終評価

#### DiagnosticEngine 完成度: **45%**

| カテゴリ | 進捗 |
|---|---|
| AG側個人名ハードコード排除 | ✅ 完了（主要3タグ削除済み） |
| TA側個人名ハードコード排除 | ✅ 完了（杉本・福田フィルタ削除済み） |
| TA側重複ロジック排除 | ✅ 完了（TimeAxis-CHECK 統合済み） |
| 全スタッフ汎用化 | ⚠️ 50%（BLANK-CHECK統合が残存） |
| eiyo専用→全部署共通化 | ❌ 0%（Step7依存・保留） |
| DiagnosticReport 構造化 | ❌ 0%（シグネチャ未確定） |

#### 残タスク一覧

| タスク | 優先度 | 依存 |
|---|---|---|
| BLANK-CHECK + FUKUDA 統合（単一ループ化） | 高 | なし |
| [LEARN-PICK] 日別サンプル行削除 | 中 | なし |
| [prevTail-...] kaigo1_6 残存ログ確認 | 中 | なし |
| [SHORTAGE-CLASSIFY] 全部署拡張 | 低 | Step7 完了後 |
| DiagnosticReport 構造体返却 | 低 | シグネチャ確定後 |
| DiagnosticEngine 呼び出しシグネチャ確定 | 低 | 設計書追記後 |
| generateTimeAxis return値 `{ res, warnings, diagnostics }` 拡張 | 低 | 呼び出し元調査後 |

---

## 最終目標への接続

今回のレビューで明確になった **Phase2の残課題（BLANK-CHECK統合）** は、  
このまま放置すると RepairEngine・StrategyEngine の抽出時に問題を起こす。

```
Phase2（現在）: DiagnosticEngine の責務境界を確定
                    ↓
    BLANK-CHECK 統合で "全スタッフ診断の単一関数" が完成
    → これが DiagnosticEngine の関数シグネチャの雛形になる

Phase3: RepairEngine の抽出
    RepairEngine は ConstraintEngine と DiagnosticEngine の両方を使う
    DiagnosticEngine の呼び出しシグネチャが未確定では、
    RepairEngine から DiagnosticEngine を呼べない
                    ↓
Phase4: StrategyEngine（KaigoStrategy / EiyoStrategy 分離）
    EiyoStrategy は DiagnosticEngine の [SHORTAGE-ABC] 出力を見て
    "構造的不足" vs "配置改善で解消可能な不足" を判断する
    → DiagnosticReport 構造体が必要
                    ↓
Phase5: ScoreEngine（checkAbsolute / calcScore 分離）
    checkAbsolute は現在 DiagnosticEngine（[TimeAxis-CHECK]）でも利用される
    → ScoreEngine 分離後は DiagnosticEngine が ScoreEngine を呼ぶ関係になる
    → 依存の方向性（DiagnosticEngine → ScoreEngine）を確定する必要がある
                    ↓
Phase6: EiyoStrategy 再設計
    DiagnosticReport.shortages.theory.conflictCalc.minShortfall を
    EiyoStrategy の配置判断ロジックに組み込む
    → Phase2 の DiagnosticReport 設計がここで活きる
```

つまり **Phase2 DiagnosticEngine の完成度が全フェーズのインターフェース設計を決定する**。  
BLANK-CHECK 統合と DiagnosticReport 構造化を Phase2 フェーズ2 で完了させることが、  
Phase3 以降の着実な進行の前提条件となる。

---

*レビュー完了: コード変更禁止 / 実装禁止 / コミット禁止*
