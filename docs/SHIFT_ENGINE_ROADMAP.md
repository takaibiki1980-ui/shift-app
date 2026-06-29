# SHIFT_ENGINE_ROADMAP.md
# しふぽん シフトエンジン改善ロードマップ

作成: 2026-06-29  
対象: src/App.jsx（介護エンジン autoGenerate/bestOfN + 栄養科エンジン generateTimeAxis）  
フェーズ: Phase5 設計文書（コード変更なし）

---

## ① 現在のエンジン構成図

```
handleGenerate / _runGenerateCore
│
├── [介護系: kaigo1 / kaigo2]
│   └── bestOfN (n=30)
│       ├── autoGenerate × 30回
│       │   ├── ステップ1: 希望休・希望勤務・有休・前月繰り越し セット
│       │   ├── ステップ1.5: 希望休アンカー配置（夜勤前々日=夜勤、前日=明け 仮置き）
│       │   ├── ステップ2: 夜勤配置（minStaff["夜勤"]を満たすまで日付順）
│       │   ├── Pass A: 公休日を確率サンプリングで先行確定（dowRestRate / 均等分散）
│       │   ├── Pass B: 早番・遅番 slot-first 配置（slotFirstTypes）
│       │   ├── Pass B': 残り全スタッフの勤務シフトを確率サンプリングで配置
│       │   ├── Pass C: 連続勤務超過 修正（非slot→休み / slot→Tier2吸収）
│       │   ├── enforceMaxStaff (1回目)
│       │   ├── 遷移違反 repair
│       │   ├── enforceMaxStaff (2回目)
│       │   ├── minStaff 保証（不足→空きスタッフ slide / 余剰スタッフ休み→勤務）
│       │   ├── enforceMaxStaff (3回目)
│       │   ├── 公休数回復フェーズ（日勤→休み変換で目標公休数補完）
│       │   ├── 公休数超過バリデーション（余剰休み→日勤変換）
│       │   ├── ratio 修復（比率乖離 fromShift→toShift 変換）
│       │   ├── enforceMaxStaff (4回目)
│       │   └── 最終検証（maxStaff違反残存チェック / Night-Sequence-Final）
│       ├── scoreShifts (各試行)
│       ├── 最良解 選択
│       └── localSearchImprove（2-opt swap × 3パス）
│
├── [公休保証リトライ: kaigo系のみ]
│   └── kyukoRetry (最大50試行)
│
└── [栄養科: eiyo]
    └── generateTimeAxis (N_TRIALS=200)
        ├── ステップ1: ロック日確定（全試行共通 baseRes）
        ├── ステップ2: 休み数確定（全試行共通）
        └── runOneTrial × 200回
            ├── ステップ3: 休みを均等配置（乱数ジッタ + maxConsec調整）
            ├── ステップ4: 残り空き日に勤務種別割り当て（学習重み付き確率選択）
            ├── ステップ5: 最終連勤調整
            ├── ステップ4-5: 日ごとに minStaff 充足まで配置
            ├── checkAbsolute（5絶対条件判定）
            ├── calcScore（スコア計算）
            └── bestPassing / bestFailing 更新
        └── 山登り① 空白→勤務 (fill)
        └── 山登り② 休み移動 swap
```

---

## ② 処理フロー（全処理・責務・入出力）

### A. autoGenerate（介護型エンジン核心）

| # | 処理名 | 役割 | 入力 | 出力 | 問題点 | ボトルネック | 改善優先度 | DiagnosticReport取得情報 |
|---|---|---|---|---|---|---|---|---|
| 1 | 希望休/有休 セット | Tier1ロック確定 | kiboByMonth, yukyuByMonth, shiftRequests | res[] / lockedDays[] | なし | 低 | 低 | — |
| 2 | 前月繰り越し | 夜勤→明け/明け→休み | prevTail | res[] | なし | 低 | 低 | prevTail |
| 3 | 希望休アンカー | 希望休前々日=夜勤 仮置き | kibodays, nightOk | res[] | kiboNightPreferenceが高いスタッフ優先のため、複数アンカーが競合すると後続が配置できない | 中 | 中 | — |
| 4 | 夜勤配置（Step2） | minStaff["夜勤"]を日付順に充足 | nightPool, nightMax | res[] | 月初から日付順に埋めるため月末が不足しやすい / G-1外国人ルール・NG-2 low-NR ルールの複雑度 | **高** | **高** | repair.final.nightOrphans |
| 5 | Pass A: 公休配置 | 目標公休日数を先行確定 | dowRestRate / 均等間隔 | res[]（公休確定） | trendなしスタッフは均等間隔のみ。月末に公休が集中しやすい。連続公休ガード（PassC後）が必要になる原因 | 高 | **最高** | repair.passA.snapshot |
| 6 | slot-first 配置 | 早番・遅番を maxStaff上限まで先確保 | slotFirstTypes, maxStaff | res[] | slot-first後に PassB'でさらに上書きされる可能性 / slotMaxConsecExcluded（連勤除外）が多いと充足できない | 中 | 高 | — |
| 7 | Pass B': 残シフト配置 | 全スタッフの空き日に確率サンプリング | trend.dowShiftRate / deptAvgRatio | res[] | minStaff不足シフトをブーストするが、slot枠（早番・遅番）への過剰配置が起きる | 中 | 中 | repair.passB.snapshot |
| 8 | Pass C: 連続修正 | maxConsec超過を休み/Tier2吸収で修正 | res[], maxConsec | res[]（連続解消） | Tier2吸収が多いと公休数が増加しすぎる / 修復が増えるほど後段での shortage補正が増加 | 高 | **高** | repair.passC.nonSlotFixed, tier2Absorbed, residualViolations |
| 9 | enforceMaxStaff ×4 | maxStaff超過を他シフトへ振替・休み化 | res[], maxStaff | res[]（超過解消） | 4回繰り返しはほぼ同じロジック。1・2回目が適切なら3・4回目は空振り多い | 低 | 低 | repair.final.maxStaffViolations |
| 10 | 遷移違反 repair | 遅番→早番等の違反を修正 | res[] | res[] | 遷移違反がゼロならこのパスは不要（Pass B設計が良ければ不要になる） | 低 | 低 | — |
| 11 | minStaff 保証 | 不足シフトに余剰スタッフを配置 | res[], minStaff | res[] | 「余剰スタッフ（公休超過）の休み→勤務変換」のみ対象。構造的不足は解消できない | 高 | 高 | repair.shortage |
| 12 | 公休数回復 | 公休不足スタッフの日勤→休み変換 | res[] | res[] | minStaff保証と公休回復が相反するループに陥ることがある | 中 | 中 | repair.restAdjustment.afterRestRecovery |
| 13 | 公休超過バリデーション | 公休過剰スタッフの休み→日勤変換 | res[] | res[] | 変換できない場合そのまま終了（スコアで評価） | 中 | 低 | repair.restAdjustment.afterExcessVal |
| 14 | ratio 修復 | シフト比率乖離を fromShift→toShift変換 | res[], shiftRatio | res[] | Tier1 slot を削らない制約付き。それ以外の乖離は補正されるが、変換可能日が少ないと効かない | 中 | 低 | — |
| 15 | scoreShifts | ペナルティスコア計算 | res[] | score(number) | 30回試行の評価関数。O(n×days) ループが多く、试行数増加時のボトルネックになる | 低 | 低 | — |
| 16 | localSearchImprove | 2-opt swap でスコア改善 | res[], score | res_improved | O(n² × days × 3pass) の計算量。n が大きいと遅い | 低 | 低 | — |

### B. bestOfN（介護系）

| 項目 | 詳細 |
|---|---|
| 試行数 | n=30（デフォルト）|
| 多様性機構 | useVariation（日勤 maxStaff を min〜max でサイクル）|
| 採用基準 | scoreShifts が最小の結果 |
| 局所探索 | localSearchImprove（2-opt swap, 3パス）|
| 問題点 | n=30 固定。試行数に対してスコア改善の飽和を確認できない。最良解の score=0 で即 break するが 0 にならないケースが多い |

### C. generateTimeAxis（栄養科エンジン）

| # | 処理名 | 役割 | 問題点 | 改善優先度 |
|---|---|---|---|---|
| 1 | ロック日確定 | 全試行共通 baseRes | なし | 低 |
| 2 | 休み数確定 | _ta_restToPlace | なし | 低 |
| 3 | runOneTrial × 200 | 休み均等配置 + 勤務割り当て | ジッタ幅±2日が固定。月の長さ・公休数によって調整が必要なケースがある | 中 |
| 4 | checkAbsolute | 5絶対条件合否判定 | 合格率が低いと bestPassing=null になりbestFailing採用 | **高** |
| 5 | calcScore | スコア計算（minStaff不足×100 + 勤務ブロック分散 + 休み間隔分散）| minStaff不足を最優先するが、勤務ブロック分散・休み間隔分散の重みが曖昧 | 中 |
| 6 | 山登り① fill | 空白→勤務 でminStaff不足削減 | 空白セルが残る原因分析がない（blankCheck は診断済み）| 中 |
| 7 | 山登り② swap | 休み移動でminStaff不足削減 | 安全装置（公休数不変）の破棄条件が厳しく、改善幅が小さい | 中 |
| 8 | shortage分析 | minStaff不足原因ABCD分類 | 分析のみ。修正ロジックは持たない | — |

### D. scoreShifts ペナルティ構成

| ペナルティ | スコア | 優先度 |
|---|---|---|
| 公休数逸脱（1日） | 10,000点 | 最高 |
| 役職制限違反（1件） | 5,000点 | 高 |
| 連続勤務違反（1日超過） | 100点 | 高 |
| 遷移違反（1件） | 100点 | 高 |
| 同一シフト4連続 | 1,500点 | 中 |
| 同一シフト5連続以上（1日） | 6,000点 | 中 |
| minStaff不足（全員0人） | minC×1,000点 | 中 |
| minStaff不足（部分） | (minC-actual)×300点 | 中 |
| maxStaff超過（1人） | 150点 | 低 |
| 夜勤回数分散（分散×500） | 変動 | 中 |
| 土日出勤分散（分散×200） | 変動 | 低 |
| 学習適合（1日×30点） | 変動 | 低 |
| 比率乖離（1%×50点） | 変動 | 低 |

### E. computeLearnedTrend（学習エンジン）

| 項目 | 詳細 |
|---|---|
| 学習対象 | シフト頻度（全月）、曜日別シフト率（dowShiftRate）、曜日別休み率（dowRestRate）、前日→当日遷移確率 |
| 重み付け | 直近ほど重く（今月=4倍、3ヶ月前以降=1倍）|
| 使用箇所 | autoGenerate: PassA公休サンプリング、PassB/PassB' 勤務サンプリング（weight boost）/ generateTimeAxis: ステップ4 dowShiftRate 確率選択 |
| 問題点 | 遷移確率（transitions）は学習しているが生成には未使用。使われていない計算コストがある |

---

## ③ 問題点一覧

### 優先度: 最高

| ID | 問題 | 影響 | 発生条件 |
|---|---|---|---|
| P01 | **PassA公休配置の品質が低い（trendなし時）** | 月末公休集中 → PassC修復増 → Repair多用の連鎖 | trend未学習スタッフ（新人・データ少）|
| P02 | **夜勤配置が月初集中しやすい** | 月末夜勤不足 → minStaff shortage多発 | 夜勤可能スタッフ数が少ない場合 |
| P03 | **PassC修復（tier2Absorbed）が多いと公休数が増加しすぎる** | 公休超過 → 公休数調整で日勤化 → minStaff不足再発のループ | 夜勤多め・連続勤務しやすいシフト構成 |

### 優先度: 高

| ID | 問題 | 影響 | 発生条件 |
|---|---|---|---|
| P04 | **generateTimeAxis の checkAbsolute 合格率が低い** | bestPassing=null → bestFailing採用 → minStaff不足が残る | eiyo スタッフ数が少ない / 早番専任スタッフのみ |
| P05 | **localSearchImprove が O(n²×days×3)** | スタッフ数10人以上で体感遅延 | 大規模部署 |
| P06 | **enforceMaxStaff が4回実行される** | 1・2回目で解消できれば3・4回目は空振り | 超過が少ない場合の無駄な計算 |
| P07 | **学習遷移確率（transitions）が生成に未使用** | 「遅番→翌日早番」のような遷移パターンが学習されない | 学習データが豊富なスタッフ |

### 優先度: 中

| ID | 問題 | 影響 | 発生条件 |
|---|---|---|---|
| P08 | **bestOfN n=30 固定** | スコア改善の飽和点が不明。30回で最良解に到達しているか保証がない | 複雑な制約の部署 |
| P09 | **比率修復（ratio repair）の効果が小さい** | Tier1保護の制約が強く、変換可能日が少ない | 早番・遅番が多いスタッフ |
| P10 | **generateTimeAxis ジッタ幅±2日が固定** | 日数が少ない月（2月）では調整幅が大きすぎる可能性 | 31日月 vs 28日月 |
| P11 | **scoreShifts が O(n×days) を複数回実行** | bestOfN 30回 × scoreShifts 呼び出し回数が多い | 全部署 |
| P12 | **kyukoRetry retryCount が 49 固定（近似値）** | DiagnosticReport での実際のリトライ回数が不正確 | リトライが途中で成功した場合 |

### 優先度: 低

| ID | 問題 | 影響 | 発生条件 |
|---|---|---|---|
| P13 | **コードの可読性**: enforceMaxStaff が 45行 のインライン関数 | 修正・デバッグが困難 | 保守時 |
| P14 | **PassB' で minStaff 不足シフトをブーストするが slot枠への過剰配置も起きる** | 早番・遅番が maxStaff以上になりうる（enforceMaxStaffで後処理）| slot枠スタッフ数が少ない部署 |
| P15 | **localSearchImprove が autoGenerate と _isBadTransition を再実装** | 同じロジックが2箇所に存在 | 遷移ルール変更時の二重修正リスク |

---

## ④ 優先順位

```
【最優先】Pass A 公休配置改善（P01）
         → 公休品質が上がると PassC が減り、以降の全 Repair フェーズの負荷が下がる

【次点①】夜勤配置の月内均等化（P02）
         → minStaff shortage の最大原因。月初集中が解消されると generateTimeAxis の合格率も向上

【次点②】generateTimeAxis checkAbsolute 合格率向上（P04）
         → eiyo の生成品質に直結

【並行可】遷移確率を生成に活用（P07）
         → 既に学習済みデータがあり、追加コストなしで品質向上

【余裕で】bestOfN 試行数の適応的制御（P08）
         → スコア=0 で即 break は既存。「改善なし N 回で打ち切り」追加で速度改善
```

---

## ⑤ 改善候補 評価一覧

| 改善候補 | 現状 | 改善内容 | 期待効果 | リスク | 実装難度 |
|---|---|---|---|---|---|
| **Slot First化（強化）** | slot-first は早番・遅番に限定 | 夜勤も含めた事前確定 | minStaff不足を先行解消 | 夜勤配置と競合する可能性 | 中 |
| **PassB改善** | 確率サンプリング（minStaff boost）| dowShiftRate に加えて minStaff deficit を重みとして組み合わせる | PassC修復 減少 | 既存 boost ロジックとの整合 | 低〜中 |
| **Repair削減** | PassC で最大 nonSlotFixed+tier2Absorbed件の修正 | PassA/PassB品質向上で上流から削減 | Repair不要なケースが増加 | PassAを変更するとbestOfNの多様性に影響する可能性 | 中 |
| **Repair成功率** | PassC 残存違反 residualViolations | _shouldProtectSlot の条件を診断データで再チェック | 残存ゼロ達成率向上 | Tier1制約を緩めることは禁止 | 高 |
| **score改善** | 公休逸脱10000点が支配的 | 公休品質向上でスコア全体が下がる | bestOfN の best がより良い解になる | なし | 低（PassA改善で連動）|
| **bestOfN改善** | n=30 固定 / スコア0で即break | 「N回連続改善なし」で打ち切り + 早期 break で速度改善 | 実行時間 短縮 | bestScore=0 のケースが稀な場合は効果薄 | 低 |
| **Learning改善** | 遷移確率学習済みだが生成に未使用 | transitions を PassB' のシフト選択重みとして使用 | 遷移パターンの再現率向上 | 実装複雑度が増す。最初は dowShiftRate のみで十分 | 中 |
| **夜勤配置改善** | 日付順 / autoMax比較 | 月内均等間隔で夜勤候補を事前スケジューリング | 月末夜勤不足 解消 | アンカー（Step1.5）との競合調整が必要 | 中 |
| **公休配置改善** | trendなし→均等間隔 | 連続勤務違反が起きにくい位置を事前計算して候補を絞る | PassC修復 大幅減少 | PassA変更はbestOfNの多様性に影響する | **高（最優先）** |
| **速度改善** | localSearchImprove O(n²×days) | スタッフペアのソート順最適化 or early break 強化 | 実行時間 20〜30% 短縮 | 最適解の探索空間が狭まる | 低 |
| **可読性改善** | enforceMaxStaff がインライン定義 | 関数を autoGenerate の外に切り出し | 保守性向上 | 変数スコープの移動（lockedDays等） | 低（設計整理）|

---

## ⑥ Phase5 Step1〜StepN

### Step1: PassA 公休配置 改善（最優先）
**目的**: trendなし時の公休配置品質を向上させ、PassC修復を削減する

**現状の問題**:
- trendなし→均等間隔 ±2日ジッタのみ
- maxConsec違反が起きやすい位置（月初繰り越し明け後・月末）を考慮しない
- 「連続勤務違反が起きにくい位置に公休を配置する」という逆算ロジックがない

**改善内容**:
- 公休を配置する際、「前後の勤務連続日数が maxConsec を超えない」を優先的に考慮した候補絞り込みを PassA 内に追加
- 「夜勤→明け→休み」の連鎖で既に公休が確定している日の前後を公休候補から除外して均等性を改善
- 勤務ブロック長のヒューリスティック事前計算で「最長連勤を最小化する」休み位置を選択する

**スコープ**: autoGenerate の PassA ブロックのみ  
**生成ロジックへの影響**: PassA は公休配置のみ。勤務シフト割当（PassB以降）には影響しない  
**期待効果**: PassC nonSlotFixed 30〜50% 削減 → 全体的な公休数精度向上

---

### Step2: 夜勤配置 月内均等化
**目的**: 月初集中を防ぎ月末夜勤不足を解消する

**現状の問題**:
- 日付順（d=1〜days）に minStaff["夜勤"] を充足する貪欲法
- 夜勤可能スタッフが少ない場合、月初に全員使い切って月末が shortage になる
- autoMax = ceil(days / nightPool.length) で上限を設けているが、局所的な集中を防げない

**改善内容**:
- 月内を均等ブロック（days / nightPool.length 間隔）に分割し、各ブロックで夜勤をスケジューリングする事前計画フェーズを追加
- 各スタッフの「次に夜勤できる最早日（前回夜勤 + 最低間隔）」を動的に追跡

**スコープ**: autoGenerate のステップ2（夜勤配置ループ）のみ  
**期待効果**: 月末夜勤 shortage 解消 / nightOrphans 削減

---

### Step3: generateTimeAxis checkAbsolute 合格率向上
**目的**: eiyo の合格候補ゼロ（bestPassing=null）を減らす

**現状の問題**:
- N_TRIALS=200 でも合格候補がゼロになる（5絶対条件を1つでも違反すると不合格）
- ①公休数違反 が最も多い合格失敗原因（`_tcDetail.v1` で確認可能）
- ステップ3（休み均等配置）のジッタが公休数精度に影響

**改善内容**:
- ステップ3のジッタ後に「実際の公休数を再検証 → 足りない場合は追加 / 多い場合は削除」するパスを追加
- 公休数が絶対条件（v1=0）を満たすことを runOneTrial 内で保証してから checkAbsolute に渡す

**スコープ**: generateTimeAxis の runOneTrial 内部のみ  
**期待効果**: 合格率向上（repair.bestOf.passCount 増加）/ bestPassing 採用率 向上

---

### Step4: 学習遷移確率を PassB' に活用
**目的**: computeLearnedTrend で学習済みの遷移確率を生成に使う

**現状の問題**:
- `transitions[staffId][prev][curr]` が学習されているが、PassB'（勤務サンプリング）では `dowShiftRate` のみ参照
- 前日シフトと当日シフトの遷移確率が高いパターンを採用できていない

**改善内容**:
- PassB' の `sampleFromProbs` で使う重みに `transitions[prev][curr]` を乗算（dowShiftRate との組み合わせ）
- フォールバック: transitions データがない場合は現行の dowShiftRate のみ

**スコープ**: autoGenerate の PassB'（サンプリング重み計算）のみ  
**期待効果**: 学習再現率（syncRate）向上 / scoreShifts の学習適合ペナルティ削減

---

### Step5: bestOfN 適応的試行数制御
**目的**: 早期収束時の無駄な試行を省いて速度を改善する

**現状の問題**:
- `bestScore === 0` で即break はあるが、「N回連続でスコア改善なし」は判定していない
- 30回試行が全て同程度のスコアで終わる場合でも30回実行する

**改善内容**:
- `let noImproveCount = 0; const NO_IMPROVE_LIMIT = 10;` を追加
- bestScore が更新されなかった連続回数が NO_IMPROVE_LIMIT に達したら break

**スコープ**: bestOfN のループのみ  
**期待効果**: 収束済みの場合に 10〜20回分の autoGenerate 省略 → 速度 20〜30% 改善

---

### Step6: score改善・ペナルティバランス調整
**目的**: scoreShifts のペナルティ重みを診断データで根拠立てて調整する

**現状の問題**:
- 同一シフト4連続=1,500点 / 5連続以上=6,000点 の根拠が曖昧
- minStaff不足（全員0人）= minC×1,000点 だが minC=1 なら 1,000点で連続勤務違反（100点×n日）より軽い可能性
- repair.passB.consecCheck のデータでペナルティ現実との乖離を検証できる

**改善内容**:
- DiagnosticReport（repair.passB.consecCheck / repair.shortage）のデータを根拠に「実際に問題になっているペナルティ」を特定してから重みを調整
- 調整後は bestOfN で同じ条件で実行して改善量を確認

**スコープ**: scoreShifts のペナルティ係数のみ（ロジック変更なし）  
**期待効果**: bestOfN が選ぶ「最良解」の品質が実運用に即した評価になる

---

### Step7: コード整理（可読性・保守性）
**目的**: 将来の修正コストを下げる

**改善内容**:
- `localSearchImprove` 内の `badTrans` を `isBadTransition` グローバル関数で置換（重複排除）
- `enforceMaxStaff` を autoGenerate の外に切り出し（または別ファイルへ）
- DiagnosticReport の型定義（JSDoc）を追加

**スコープ**: リファクタリングのみ。ロジック変更なし  
**期待効果**: 保守性向上 / バグ混入リスク低下

---

## ⑦ 生成品質向上効果（ステップ別）

| Step | 対象エンジン | 改善項目 | 期待される定量的効果 |
|---|---|---|---|
| Step1 | autoGenerate | PassA公休配置 | PassC修復件数 30〜50% 削減 / 公休目標達成率 向上 |
| Step2 | autoGenerate | 夜勤均等化 | 月末夜勤 shortage ゼロ化 / nightOrphans 削減 |
| Step3 | generateTimeAxis | 合格率向上 | passCount 増加 / bestPassing 採用率 向上 |
| Step4 | autoGenerate | 遷移確率活用 | syncRate（学習再現率）5〜15% 向上 |
| Step5 | bestOfN | 適応的試行数 | 実行時間 20〜30% 短縮 |
| Step6 | scoreShifts | ペナルティ調整 | bestOfN選択の「見かけ最良」と「実運用最良」の一致率向上 |
| Step7 | 全体 | コード整理 | バグ混入リスク低下 / 保守コスト 削減 |

---

## ⑧ リスク

| リスク | 対象Step | 内容 | 対策 |
|---|---|---|---|
| bestOfNの多様性低下 | Step1 | PassA公休配置が deterministic に近づくと30試行が同じ結果になる可能性 | 乱数性（ランダムジッタ）を残す設計にする |
| アンカーと夜勤均等化の競合 | Step2 | 希望休アンカー（Step1.5）が夜勤事前スケジュールと干渉する可能性 | アンカー確定後に夜勤スケジュールを実行する順序を維持 |
| PassA変更による既存テスト失敗 | Step1 | パラメータ変更で一部ケースの公休配置結果が変わる | 変更前後で同じ条件で10回実行して平均スコアを比較 |
| 遷移確率フォールバック漏れ | Step4 | transitions データがないスタッフでエラー | `?.` チェーンで安全アクセス / フォールバックは dowShiftRate に |
| scoreペナルティ変更でbestOfN評価が変わる | Step6 | 同じシフトに対するスコアが変わるため最良解が変わる | 変更前後でscoreShifts結果を並べて検証してからコミット |

---

## ⑨ 絶対変更禁止事項（Phase5全体を通じて）

- autoGenerate / bestOfN / computeLearnedTrend への既存ロジック変更禁止（Step単位で追加のみ）
- 介護エンジン・kaigo1/kaigo2 の生成ロジック変更禁止（Phase5では扱わない）
- RepairEngine の判定・処理順・評価ロジック変更禁止
- LearningEngine 変更禁止
- DiagnosticEngine 変更禁止（読み取りのみ）
- 各Stepは単独でビルド成功・生成結果比較を行ってから次Stepに進む

---

## 最終回答

### ① 最優先で改善すべき処理

**Pass A 公休配置（Step1）**

理由: autoGenerate の全 Repair フェーズの負荷は PassA の品質に依存している。PassA で連続違反を起こさない公休を配置できれば PassC・enforceMaxStaff・公休数回復フェーズがすべて軽くなる。「上流品質向上が下流 Repair を不要にする」最もレバレッジの大きい改善。

### ② 最も生成品質が向上する改善

**Step1（PassA）+ Step2（夜勤均等化）の組み合わせ**

PassA改善で公休品質が上がり、夜勤均等化で月末 shortage が解消されると、最終出力の「minStaff未達日数」と「公休数逸脱」の両方が同時に改善される。scoreShifts の上位ペナルティ（公休逸脱10,000点、minStaff不足1,000〜300点）が下がるため bestOfN が選ぶ解の品質が大きく向上する。

### ③ 最もコードが簡潔になる改善

**Step7（コード整理）**

`localSearchImprove` の `badTrans` 再実装を `isBadTransition` で置換すると重複が排除され、遷移ルール変更時の修正箇所が1箇所になる。`enforceMaxStaff` の外部切り出しも保守性を大きく改善する。

### ④ Phase5は何ステップ必要か

**7ステップ**（Step1〜Step7）

推奨実行順: Step1 → Step2 → Step3 → Step5 → Step4 → Step6 → Step7  
Step3〜Step5 は相互に独立しているため並行検討可能。

### ⑤ Phase5完了後に何が改善されるか

| 項目 | 現状 | Phase5完了後 |
|---|---|---|
| PassC修復件数 | 毎回数件〜10件以上 | 30〜50% 削減 |
| 月末夜勤 shortage | 発生あり | ほぼ解消 |
| eiyo passCount | 200試行中 passCount が低い場合あり | 合格率 向上 |
| 学習再現率（syncRate）| 現行水準 | 5〜15% 向上 |
| 実行時間 | 現行水準 | 20〜30% 短縮（Step5効果）|
| 保守性 | badTrans 重複 / enforceMaxStaff インライン | 重複排除・可読性向上 |
