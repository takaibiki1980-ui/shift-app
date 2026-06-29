# PassA 改善仕様書
## Phase5 Step1 設計ドキュメント

作成日: 2026-06-29  
対象ファイル: `src/App.jsx`（autoGenerate 関数内 PassA ブロック）  
変更禁止: RepairEngine / DiagnosticEngine / LearningEngine / 栄養科エンジン / 介護エンジン生成ロジック

---

## 事前回答

### ① なぜPassAから改善するのか

PassAは `autoGenerate` における**最上流の配置フェーズ**（公休日の先行確定）。  
PassA終了時点の公休配置品質が、下流の全フェーズの修復負荷を**直接的に決定**する。

```
PassA の公休配置品質
      ↓
PassB: 勤務サンプリング時の有効候補日数
      ↓
PassC: 連続勤務超過の修正量（PassA起因の連続勤務を修復）
      ↓
restAdjustment: 公休不足の後補完量
      ↓
最終品質（scoreShifts ペナルティ合計）
```

PassAの欠陥は全フェーズに**複利で伝播**するため、最上流を改善することが  
最もレバレッジの高い介入点となる。

### ② PassB・PassCより優先する理由

| 比較軸 | PassA優先 | PassB改善 | PassC改善 |
|--------|-----------|-----------|-----------|
| 影響範囲 | 全下流フェーズ | PassB単体 | PassC単体 |
| 修復負荷削減 | 根本原因除去 | 対症療法 | 対症療法 |
| score改善 | 公休逸脱(10000点)直撃 | 軽微 | 連続違反(100点) |
| 実装リスク | 中（上流変更） | 低 | 低 |
| 期待ROI | 最大 | 中 | 小 |

PassBはPassA後の**残余状態**に対するサンプリングであり、PassAが悪ければ  
候補日が既に不足した状態でサンプリングが走るため根本解決にならない。  
PassCは連続勤務の**後補修**であり、PassAで連続勤務が発生しない設計にすれば  
PassCの出番が大幅に減る。

### ③ PassA改善による期待効果

| 改善指標 | 現状 | 改善後（予測） |
|----------|------|----------------|
| **Repair回数削減** | PassC修復 多数 | 30〜50%削減 |
| **公休不足** | restAdjustmentで後補完必要 | PassA時点で充足率向上 |
| **連続勤務違反** | PassA起因の連続違反あり | 大幅減少 |
| **生成品質** | scoreペナルティ高 | 公休逸脱・minStaff不足削減 |
| **生成速度** | 変化なし | ほぼ同等（O(n×days) 追加） |

---

## ① 現状仕様

### 処理概要

`autoGenerate` 関数内の **PassA ブロック**（`src/App.jsx` 約 L1301〜L1365）。  
夜勤配置・希望休確定後、全スタッフの**公休日を先行決定**するフェーズ。

### 入力

| 変数 | 内容 |
|------|------|
| `ds` | 部署スタッフ配列 |
| `res[s.id]` | 各スタッフの現在シフト（希望休・夜勤明け等が格納済み） |
| `lockedDays[s.id]` | 変更不可の日セット |
| `s.kyukoDaysByMonth[mk]` / `s.kyukoDays` | 目標公休数（8日等） |
| `trend.dowRestRate` | 曜日別休み確率（Learningデータ） |
| `maxConsec` | 最大連続勤務日数（dept.maxConsecutive、デフォルト5） |
| `deptRest` | 休み系シフト種別セット |

### 出力

`res[s.id][d]` に `'休み'` を追加設定（lockedDays は更新しない）

### 現状アルゴリズム（2分岐）

```
ds.forEach(staff):
  freeDays = 空き日（未設定日）
  lockedRest = 既確定の公休数（希望休・有休等）
  restTarget = max(0, totalTarget - lockedRest)
  validDays = freeDays - 前日が明けの日

  if trend.dowRestRate:
    ★ Branch A: 確率サンプリング
    weights = validDays.map(d => dowRestRate[dow] or 0.01)
    picked = weightedSampleN(validDays, weights, restTarget)
    picked.forEach(d => res[s.id][d] = '休み')

  else:
    ★ Branch B: 均等間隔配置
    step = validDays.length / (restTarget + 1)
    for i = 1..restTarget:
      minDay = prevDay + 1
      maxDay = min(days, prevDay + maxConsec + 1)
      idealDay = validDays[round(i * step) - 1] + jitter(-2〜+2)
      cands = validDays ∩ [minDayAdj, maxDay] - used
      fallback1: 末尾制約緩和
      fallback2: maxDay制約緩和（"PassCが修正"と明記）
      if !cands: break  ← ★欠陥: kyukoDays未達でbreak
      best = closest to idealDay
      res[s.id][best] = '休み'
```

### 現状の問題点（4点）

#### 問題1: スタッフ間調整なし（最重大）

各スタッフを `forEach` で独立処理するため、特定日に複数スタッフが同時休みになっても  
**検知・回避する機構がない**。例えば月曜日に休み確率が高い部署では、  
全スタッフが月曜に集中し、月曜の在籍者数がminStaff未満になる。

```
現状: Staff1.月 → 休み OK
      Staff2.月 → 休み OK（Staff1との重複チェックなし）
      Staff3.月 → 休み OK
      → 月曜: 在籍0人 → minStaff違反 → enforceMaxStaff/restAdjustmentで後補修
```

#### 問題2: Branch Aで連続制約チェックなし

`weightedSampleN` は `restTarget` 個を**まとめてサンプリング**するため、  
選ばれた公休日の間に maxConsec 日超の連続勤務が生じるかを確認しない。  
→ PassC の連続修正件数増加の主因。

#### 問題3: Branch B の `break` による公休不足

`if (!cands.length) break;` によって、候補がなくなるとループを終了する。  
このとき `restTarget` を満たせず公休が少なくなる（kyukoDays 目標未達）。  
→ restAdjustment（公休数回復）フェーズが全件処理する必要が生じる。

#### 問題4: 処理順が先着優先

`ds.forEach` のスタッフ順（配列順）で先に処理したスタッフが好条件の日を取得し、  
後続スタッフに残る候補が少なくなる。拘束の強いスタッフ（夜勤多い等）が  
後回しになると選択肢が枯渇する。

---

## ② 改善仕様

### 改善方針（4点）

1. **日別在籍数の下限ガード追加**: 各日の公休配置前に「この日にあと何人休めるか」を計算し上限を設ける
2. **Branch A に連続制約チェック追加**: サンプリング後に maxConsec 違反を検出し、違反する日を置換
3. **Branch B の `break` を retry に変更**: candidates 不足時に制約を段階的に緩和して必ず restTarget を達成
4. **処理順を制約の強さ順に変更**: 夜勤多・kiboByMonth 多・kyukoDays 少ないスタッフを先行処理

### 絶対制約（変更禁止）

- `lockedDays` に登録済みの日は変更しない（希望休・有休・夜勤明け等）
- `res[s.id][d - 1] === '明け'` の翌日は公休対象外（既存ルール維持）
- 追加する処理は **読み取り専用観測のみ**（既存の `res` 更新ロジックを増やすことは OK）
- RepairEngine / DiagnosticEngine / LearningEngine / 生成ロジック は変更しない

---

## ③ フローチャート

```
PassA（改善後）
│
├─[前処理] 処理順ソート
│   各スタッフのスコア = 夜勤数×2 + 夜勤明け数×1 + 希望休数×1 + 夜勤OK×0.5
│   降順（スコア高＝制約強）→ 先に処理
│
├─[日別上限テーブル構築] O(days)
│   dailyRestLimit[d] = nStaff - minWorkersRequired(d)
│   minWorkersRequired(d) = Σ minStaff[shiftType] for all shiftTypes
│   ※ ロック済み休みは事前に dailyRestCount[d] に加算
│
└─[スタッフごとの処理] forEach（ソート順）
    │
    ├─ freeDays, restTarget, validDays を計算（現状と同じ）
    │
    ├─ validDays を dailyRestCount フィルタ
    │   availDays = validDays.filter(d => dailyRestCount[d] < dailyRestLimit[d])
    │
    ├─ [Branch A] trend.dowRestRate あり
    │   weights = availDays.map(d => dowRestRate[dow])
    │   picked = weightedSampleN(availDays, weights, restTarget)  ← availDays に変更
    │   │
    │   └─[連続制約チェック] 改善点
    │       pickedSet に基づき全勤務連続区間を計算
    │       maxConsec 超の区間があれば: 区間中央に休みを追加 / 末端の休みを移動
    │       移動先も availDays かつ dailyRestLimit 範囲内
    │       (調整は最大 restTarget 回試行)
    │
    └─[Branch B] trend なし（均等間隔）
        step = availDays.length / (restTarget + 1)
        for i = 1..restTarget:
          minDay = prevDay + 1
          maxDay = min(days, prevDay + maxConsec + 1)
          cands = availDays ∩ [minDayAdj, maxDay] - used

          if !cands:
            ★改善: 段階的フォールバック
            FB1: 末尾制約緩和（isLast のみ）
            FB2: maxDay 緩和（連続違反を許容、PassCに委ねる）
            FB3: dailyRestLimit を +1 緩和（緊急：他スタッフより優先日数不足を解消）
            FB4: availDays 全体から最近候補（break しない）

          dailyRestCount[best] += 1  ← 更新
          res[s.id][best] = '休み'
```

---

## ④ 疑似コード

```javascript
// ── Pass A: 改善版（Phase5 Step1） ─────────────────────────────────────
// 変更点:
//   1. 処理順ソート（制約強いスタッフ優先）
//   2. 日別在籍数ガード（dailyRestLimit）
//   3. Branch A: 連続制約チェック追加
//   4. Branch B: break → 段階的フォールバック

// [改善1] 日別在籍数ガードテーブル構築
const minWorkersPerDay = {};
for (let d = 1; d <= days; d++) {
  const lockedRestCount = ds.filter(s => {
    const v = res[s.id][d];
    return v && deptRest.has(v) && v !== '明け';
  }).length;
  const minRequired = Object.values(dept.minStaff || {}).reduce((a, b) => a + b, 0);
  // nStaff - minRequired = 最大休める人数
  minWorkersPerDay[d] = Math.max(0, ds.length - Math.max(1, minRequired));
}

// 初期 dailyRestCount（ロック済み公休をカウント）
const dailyRestCount = {};
for (let d = 1; d <= days; d++) {
  dailyRestCount[d] = ds.filter(s => {
    const v = res[s.id][d];
    return v && deptRest.has(v) && v !== '明け';
  }).length;
}

// [改善2] 処理順ソート（制約の強いスタッフ先行）
const sortedDs = [...ds].sort((a, b) => {
  const scoreA = _constraintScore(a, res, mk, deptRest);
  const scoreB = _constraintScore(b, res, mk, deptRest);
  return scoreB - scoreA;
});
// _constraintScore = 夜勤数×2 + 夜勤明け数 + 希望休数 + (nightOk ? 0.5 : 0)

sortedDs.forEach(s => {
  const trend = getTrend(s);
  const freeDays = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
  const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
  const lockedRest = Object.values(res[s.id]).filter(v => deptRest.has(v) && v !== '明け').length;
  const restTarget = Math.max(0, totalTarget - lockedRest);

  const validDays = freeDays.filter(d => res[s.id][d - 1] !== '明け');

  // [改善1] dailyRestLimit フィルタ
  const availDays = validDays.filter(d => dailyRestCount[d] < minWorkersPerDay[d]);

  if (trend?.dowRestRate) {
    // ── Branch A: 確率サンプリング ──────────────────────────────────────
    // [改善1] validDays → availDays に変更
    const weights = availDays.map(d => {
      const dow6 = (new Date(year, month, d).getDay() + 6) % 7;
      return Math.max(0.01, trend.dowRestRate[dow6] ?? 0.01);
    });
    const picked = weightedSampleN(availDays, weights, Math.min(restTarget, availDays.length));

    // [改善3] 連続制約チェック・修正
    const pickedSet = new Set(picked);
    for (let d = 1; d <= days - maxConsec; d++) {
      // d〜d+maxConsec が全て勤務（pickedSet に含まれない）なら連続違反
      const allWork = Array.from({length: maxConsec + 1}, (_, i) => d + i)
        .every(dd => !pickedSet.has(dd) && !deptRest.has(res[s.id][dd]) && freeDays.includes(dd));
      if (allWork) {
        // 区間中央に休みを挿入（dailyRestLimit 範囲内で）
        const mid = d + Math.floor(maxConsec / 2);
        const alt = [mid, mid - 1, mid + 1].find(dd =>
          availDays.includes(dd) &&
          !pickedSet.has(dd) &&
          dailyRestCount[dd] < minWorkersPerDay[dd]
        );
        if (alt) {
          // restTarget 超過しないよう最も遠い picked を外す
          const farthest = [...pickedSet].sort((a, b) =>
            Math.abs(b - alt) - Math.abs(a - alt)
          )[0];
          if (farthest !== undefined && Math.abs(farthest - alt) > maxConsec / 2) {
            pickedSet.delete(farthest);
          }
          pickedSet.add(alt);
        }
      }
    }

    for (const d of pickedSet) {
      res[s.id][d] = '休み';
      dailyRestCount[d]++;
    }

  } else {
    // ── Branch B: 均等間隔配置 ──────────────────────────────────────────
    const N = availDays.length;
    const step = N > 0 ? N / (restTarget + 1) : 1;
    const usedSet = new Set();
    let prevDay = 0;

    for (let i = 1; i <= restTarget; i++) {
      const isLast = (i === restTarget);
      const minDay = prevDay + 1;
      const maxDay = Math.min(days, prevDay + maxConsec + 1);
      const minDayAdj = isLast ? Math.max(minDay, days - maxConsec) : minDay;
      const idealIdx = Math.min(Math.max(0, Math.round(i * step) - 1), availDays.length - 1);
      const idealDay = availDays[idealIdx] ?? days;
      const jitter = Math.round((Math.random() - 0.5) * 4);
      const targetDay = idealDay + jitter;

      let cands = availDays.filter(d => d >= minDayAdj && d <= maxDay && !usedSet.has(d));

      // [改善4] break → 段階的フォールバック
      if (!cands.length && isLast) {
        cands = availDays.filter(d => d >= minDay && d <= maxDay && !usedSet.has(d));
      }
      if (!cands.length) {
        cands = availDays.filter(d => d >= minDay && !usedSet.has(d));
      }
      // FB3: dailyRestLimit +1 緩和（公休数死守優先）
      if (!cands.length) {
        cands = validDays.filter(d => d >= minDay && !usedSet.has(d) &&
          dailyRestCount[d] < minWorkersPerDay[d] + 1);
      }
      // FB4: 全 validDays から（連続違反は PassC 委任、ただし break しない）
      if (!cands.length) {
        cands = validDays.filter(d => d >= minDay && !usedSet.has(d));
      }

      if (!cands.length) break; // 本当に置けない場合のみ break（FB4 後）

      const best = cands.reduce((a, b) =>
        Math.abs(a - targetDay) < Math.abs(b - targetDay) ? a : b
      );

      usedSet.add(best);
      res[s.id][best] = '休み';
      dailyRestCount[best]++;
      prevDay = best;
    }
  }
});
```

---

## ⑤ 現在との違い（差分サマリー）

| 項目 | 現状 | 改善後 |
|------|------|--------|
| 処理順 | `ds` の配列順（先着優先） | 制約強さ降順（夜勤多・希望休多スタッフ優先） |
| 日別同時休み上限 | なし | `dailyRestLimit[d]` = nStaff - minRequired |
| Branch A サンプリング対象 | `validDays` | `availDays`（dailyRestLimit フィルタ済み） |
| Branch A 連続制約 | チェックなし | サンプリング後に区間スキャン・修正 |
| Branch B 候補なし時 | `break`（公休不足） | 4段階フォールバック（公休数達成優先） |
| dailyRestCount 更新 | なし | 配置のたびに加算（後続スタッフへフィードバック） |

---

## ⑥ メリット

1. **Repair削減**: PassA出力の公休品質向上 → PassC修復件数 30〜50% 削減  
2. **公休充足率向上**: Branch B の `break` 解消 → restAdjustment フェーズの負担軽減  
3. **minStaff違反減少**: 日別上限ガード → 特定日に休みが集中しなくなる  
4. **連続勤務違反減少**: Branch A の連続チェック → PassC の処理件数削減  
5. **スコア改善**: 公休逸脱(10000点)・minStaff不足(300〜1000点)の削減

---

## ⑦ デメリット・制限

1. **Branch A の連続チェックは近似処理**: 完全なバックトラックではなく区間スキャン+局所置換のため、複雑なパターンで一部漏れる可能性あり（残余は PassC が担当）
2. **dailyRestLimit の計算が保守的**: `Σ minStaff` を minRequired とするため、実際より厳しい上限になる場合がある（その日に必要な最低人数は シフト種別×時間帯 で異なるが、PassA時点では詳細未確定）
3. **処理順ソートによるランダム性変化**: bestOfN での30試行間の多様性が若干変化する（ソート基準は決定的なため）
4. **eiyo（栄養科）への影響**: autoGenerate は eiyo 部署にも呼ばれるため、eiyo にも日別上限ガードが適用される（影響は小さいが要確認）

---

## ⑧ リスク

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| dailyRestLimit が厳しすぎて Branch A で availDays 不足 | 中 | Branch A が restTarget 未達 | availDays 不足時に validDays にフォールバック |
| 連続チェック修正が無限ループ | 低 | ハング | 修正試行に上限(restTarget回)を設ける |
| eiyo で意図しない公休分散変化 | 低 | 見た目変化 | eiyo は minStaff=0 が多いため実質影響なし |
| bestOfN 30試行の多様性低下 | 低 | 最良解の探索幅縮小 | ランダム性は jitter・weightedSampleN に残存 |
| 処理順変更で kaigo1/kaigo2 の結果変化 | 中 | シフト変化 | 変化自体は許容（品質向上目的）。逸脱なければ OK |

---

## テスト方法

### 変更前後の比較手順

```
Step A: 変更前に DiagnosticReport.repair を記録
  - passA.snapshot の diff < 0 件数（公休不足スタッフ数）
  - passC.nonSlotFixed（連続修正件数）
  - passC.residualViolations（残余連続違反）
  - final.nightOrphans（夜勤孤立数）

Step B: Phase5 Step1 実装後に同条件で生成

Step C: 比較
  - passA shortCount: 減少していること
  - passC nonSlotFixed: 減少（目標 30%以上）
  - passC residualViolations: 減少
  - final shortCount: 同等以下
  - シフト合計（勤務日数、夜勤数）: 変化しないこと（生成結果の妥当性）
```

### 確認シナリオ

1. **kaigo1**: 10名、夜勤5名、maxConsec=5 → 日別休み集中が解消されるか
2. **kaigo2**: 10名、夜勤5名 → 同上
3. **eiyo**: 2名、夜勤なし → 影響が最小であること
4. **希望休多いスタッフ**: kyukoDays 目標達成率が向上するか
5. **月末連続勤務**: 月末の最大連続日数が maxConsec 以下になるか

---

## ⑨ 成功判定基準

| 指標 | 成功条件 |
|------|----------|
| passA shortCount | 変更前比 **50%以上削減** |
| passC nonSlotFixed | 変更前比 **30%以上削減** |
| passC residualViolations | 変更前比 **20%以上削減** |
| kyukoDays 目標達成率 | 全スタッフの **90%以上**が PassA 時点で達成 |
| final shortCount | 変更前以下（悪化しないこと） |
| ビルド成功 | `npm run build` エラーなし |
| kaigo1/kaigo2/eiyo 生成完了 | エラーなく結果が返ること |

---

## 最終回答

### ① PassA改善だけでRepair回数は何％程度減ると予測するか

**PassC修復: 30〜50% 削減**  
根拠: PassC の修復対象（連続勤務超過）の主因は PassA の連続制約未チェック。Branch A のサンプリング + Branch B の `break` による偏り配置が PassC 負荷の大半を生成していると推定。

**restAdjustment: 40〜60% 削減**  
根拠: Branch B の `break` 解消により、PassA 時点での公休不足スタッフが大幅減少。restAdjustment の後補完対象が相応に減る。

### ② PassB改善は不要になるか

**不要にはならない。**  
PassB は勤務シフト（早番・日勤・遅番）のサンプリングフェーズであり、PassA（公休）とは直交する責務を持つ。ただし PassA 品質向上により PassB の「有効候補日」が増え、PassB のサンプリング品質も連動して向上する。

### ③ PassC改善は不要になるか

**当面不要になる可能性が高い。**  
PassA 改善で連続違反の主因が除去されると、PassC の出番が大幅に減る。ただし希望休・夜勤配置のランダム性から一定数の連続違反は残るため、PassC 自体は維持する。Phase5 Step1 完了後の DiagnosticReport で passC 負荷を実測し、必要なら Step2 で対処する。

### ④ Phase5 Step1 で実装してよい状態か

**仕様確定済み。実装可能。**  
本仕様書の内容を確認・承認後、Step1 実装開始可能。  
実装前に再度確認すべき事項:
- `dailyRestLimit` の計算式（保守的 vs 実際の部署 minStaff 値）
- eiyo 部署への影響許容範囲
- Branch A 連続チェックの修正試行上限値

---

*本仕様書確定後、コード変更禁止状態を解除し Phase5 Step1 実装に移行する。*
