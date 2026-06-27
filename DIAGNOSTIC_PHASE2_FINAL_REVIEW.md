# DIAGNOSTIC_PHASE2_FINAL_REVIEW

作成日: 2026-06-27  
対象: App.jsx (DiagnosticEngine関連ログのみ)  
生成ロジック変更: なし

---

## 0. 前提回答

| 項目 | 判定 |
|---|---|
| 現在フェーズ | Phase 2 |
| 残りフェーズ | Phase 3（DiagnosticReport構造化） = 残り1フェーズ |
| 生成結果への影響 | なし（全対象はreadonly分析 / debug log） |

---

## 1. BLANK-CHECK vs BLANK-CHECK-FUKUDA 差分分析

### 1-1. 対象コード位置

| ブロック | 行 | 部署制限 |
|---|---|---|
| BLANK-CHECK | L3282〜L3313 | eiyo のみ |
| BLANK-CHECK-FUKUDA | L3315〜L3354 | eiyo のみ |

### 1-2. 出力内容の差分

| 項目 | BLANK-CHECK | BLANK-CHECK-FUKUDA |
|---|---|---|
| 出力単位 | スタッフ × 空白日 ごとに1行 | スタッフ単位で1グループ（複数行） |
| 連続勤務計算 | ウィンドウスキャン（±maxConsec範囲） | 前後を1日ずつ走査（より正確） |
| チェック項目 | ④連勤超過 ⑤maxStaff超過 | ④⑤ に加え **minStaff不足解消可否** |
| 前後日コンテキスト | なし | あり（前日・翌日・連勤前後数） |
| 改善可能日数サマリ | なし | あり（「埋めれば不足解消できる日数: N日」） |

### 1-3. 統合可否

**✅ 統合可能。BLANK-CHECK-FUKUDA は BLANK-CHECK の完全上位互換。**

- BLANK-CHECK を削除しても情報欠損なし
- FUKUDA の方が連勤計算精度が高く、かつ shortage 情報も持つ
- BLANK-CHECK 削除により console.log 出力数を約 **N_blank × N_staff 行** 削減

### 1-4. 統合後の想定ログ形式

現行 BLANK-CHECK-FUKUDA の出力をそのまま残す。
ただし Phase 3 で DiagnosticReport 構造体へ移管する。

```
[BLANK-CHECK-FUKUDA] 福田xxx(栄養士): 空白3日 許可=日勤/早番/遅番
  5日(月) 前日=日勤 翌日=休み 連勤前1後0 | 日勤=○ 早番=○ 遅番=○ → ⚠️埋め忘れ | 日勤不足解消
  12日(月) 前日=日勤 翌日=日勤 連勤前2後1 | 日勤=[④連勤超過(4+1+1>5)] 早番=○ → ⚠️埋め忘れ | 早番不足解消
  20日(火) 前日=休み 翌日=休み 連勤前0後0 | 日勤=○ 早番=○ 遅番=○ → ⚠️埋め忘れ | 不足解消なし
  → 埋めれば不足解消できる日数: 2日 (不足3→1日が理論値)
```

### 1-5. 出力件数削減量

| 条件例（スタッフ5名 × 平均3空白日） | BLANK-CHECK | BLANK-CHECK-FUKUDA |
|---|---|---|
| console.log 呼び出し数 | 15回 | 5回（+空白なし即return分） |
| 削減率 | — | 約 **67%削減** |

### 1-6. DiagnosticReport構造への反映方法（Phase 3 計画）

```javascript
// Phase 3 で実装予定のイメージ
diagnosticReport.eiyo = {
  blankCheck: ds.map(s => ({
    staffId: s.id,
    name: s.name,
    blankDays: [...],      // {day, canPlace, conclusion, helps}[]
    improveableDays: N,
  }))
};
```

現段階（Phase 2）では BLANK-CHECK を削除し、FUKUDA の console.log をそのまま維持。

---

## 2. prevTail ログ分析

### 2-1. 対象ログ一覧

| ラベル | 行 | 関数 | 内容 |
|---|---|---|---|
| `[prevTail-autoGenerate]` | L1024 | autoGenerate() | `prevShift('kaigo1_6')` の値を1行出力 |
| `[prevTail-bestOfN]` | L2341 | bestOfN() | `prevTail['kaigo1_6']` を出力（N=30回試行のたびに実行） |
| `[prevTail]` | L7874/7876 | _runGenerateCore | 前月キー・職員数・格納日数（データあり/なし分岐） |
| `[prevTail-build]` | L7878 | _runGenerateCore | `builtPrevTail['kaigo1_6']` を出力 |

### 2-2. 各ログの判定

**L1024 `[prevTail-autoGenerate]`**  
```javascript
console.log('[prevTail-autoGenerate]', '宇賀神', prevShift('kaigo1_6'));
```
- スタッフID `kaigo1_6`・氏名 `宇賀神` をハードコード
- autoGenerate 内部で prevTail が正しく受け取れているかの一時確認
- **判定: 削除候補（デバッグ専用・kaigo1 固有）**

**L2341 `[prevTail-bestOfN]`**  
```javascript
console.log('[prevTail-bestOfN]', Object.keys(prevTail || {}).length, prevTail['kaigo1_6']);
```
- bestOfN は n=30 回ループする → **1回の生成で30行出力される**
- `kaigo1_6` をハードコード
- **判定: 削除候補（デバッグ専用・30行ノイズ）**

**L7874/7876 `[prevTail]`**  
```javascript
console.log(`[prevTail] 前月キー=${prevMonthKey} 職員数=${staffCount} 格納日数=${dayCount}`);
console.log(`[prevTail] 前月キー=${prevMonthKey} データなし（前月シフト未保存）`);
```
- ハードコードなし
- 初月利用時・前月未保存時の運用確認に有用
- **判定: DiagnosticEngine移管候補（Phase 3 で DiagnosticReport に含める）**
- 現段階は console.log のまま維持

**L7878 `[prevTail-build]`**  
```javascript
console.log('[prevTail-build]', targetDept.id, Object.keys(builtPrevTail).length, builtPrevTail['kaigo1_6']);
```
- `kaigo1_6` をハードコード
- L7874 と重複情報（職員数は同じ）
- **判定: 削除候補**

### 2-3. 介護運用・栄養科への影響

- L1024/L2341/L7878 を削除しても生成結果に影響なし（readonly出力のみ）
- L7874/7876 は全部署共通ログ。削除すると初月確認が困難になるため維持推奨

---

## 3. 実装可否判定

### 今すぐ実施（A）

| 対象 | 操作 |
|---|---|
| BLANK-CHECK ブロック（L3282-3313） | **削除**（FUKUDA が上位互換） |
| L1024 `[prevTail-autoGenerate]` | **削除**（kaigo1_6 ハードコード・デバッグ専用） |
| L2341 `[prevTail-bestOfN]` | **削除**（30回ループノイズ・kaigo1_6 ハードコード） |
| L7878 `[prevTail-build]` | **削除**（kaigo1_6 ハードコード） |

### Phase 3 で実施（B）

| 対象 | 操作 |
|---|---|
| BLANK-CHECK-FUKUDA | DiagnosticReport 構造体に移管 |
| L7874/7876 `[prevTail]` | DiagnosticReport に組み込む |

---

## 4. 必須回答

| 項目 | 判定 |
|---|---|
| 介護エンジン影響 | **なし**（削除対象は全て readonly / debug log。生成ロジック変更なし） |
| 栄養科影響 | **なし**（BLANK-CHECK 削除後も FUKUDA が同等以上の出力を継続） |
| Phase 2 完了率 | **60%**（分析完了・実装未着手） |
| Phase 2 完了条件 | A判定の4箇所を削除し、生成動作が変わらないことを確認 |
| Phase 3 へ進めるか | **A判定実装後に進める**（現状は未実装のため待機） |

---

## 5. Phase 2 実施チェックリスト

- [ ] BLANK-CHECK ブロック削除（L3282-3313）
- [ ] L1024 削除（autoGenerate 内 prevTail-autoGenerate）
- [ ] L2341 削除（bestOfN 内 prevTail-bestOfN）
- [ ] L7878 削除（_runGenerateCore 内 prevTail-build）
- [ ] ビルド確認
- [ ] 生成動作確認（kaigo1・kaigo2・eiyo 各1回）
