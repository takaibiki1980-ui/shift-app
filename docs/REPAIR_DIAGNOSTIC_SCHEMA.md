# DiagnosticReport.repair 最終スキーマ定義

作成日: 2026-06-29  
ステータス: **確定版（Phase4実装はこのスキーマから変更しない）**  
対応設計書: `docs/REPAIR_DIAGNOSTIC_DESIGN.md`

---

## 1. repair 最終スキーマ

```javascript
/**
 * diagnosticReport.repair — 最終スキーマ（確定版）
 *
 * 格納元:
 *   autoGenerate    → passA / passB / passC / restAdjustment / final / nightSequence / maxStaff
 *   generateTimeAxis→ bestOf / shortage / hillClimb / final（共通）
 *   _runGenerateCore→ kyukoRetry
 *   Step10合成      → summary / repairHistory
 *
 * エンジン非対象のキーは null で初期化する。
 * 追加フィールドは将来タグの下に追記する（既存フィールド変更禁止）。
 */
diagnosticReport.repair = {

  // ══════════════════════════════════════════════════════════════════
  // ① summary  — 品質サマリ（Step10で合成・UI表示最優先）
  // ══════════════════════════════════════════════════════════════════
  summary: {
    engine: 'autoGenerate' | 'generateTimeAxis',   // 実行エンジン種別
    quality: {
      maxStaffViolations : 0,   // maxStaff超過残存件数（0が正常）
      nightOrphans       : 0,   // 明け孤立残存件数（0が正常）
      restShortageStaff  : 0,   // 公休未達成スタッフ数（0が正常）
      minStaffShortDays  : 0,   // minStaff不足日数（eiyo。0が正常）
      kyukoRetryTriggered: false, // 公休保証リトライ発火有無
    },
    // Step10完了後に全フェーズから集約して入れる
  },

  // ══════════════════════════════════════════════════════════════════
  // ② passA  — PassA後スナップショット（autoGenerate専用、Step4）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: A5=[DIAG-PassA](eiyo) / A6=[PassA-MEASURE](全部署)
  passA: {
    rows: [
      // 全スタッフ1行
      {
        name        : '',   // スタッフ名
        targetRest  : 0,    // 目標公休数
        actualRest  : 0,    // 実際の公休数
        longestStreak: 0,   // PassA後の最大連続勤務日数
        diff        : 0,    // actualRest - targetRest（負=不足）
      }
    ],
  },
  // kaigo系以外（generateTimeAxis）: null

  // ══════════════════════════════════════════════════════════════════
  // ③ passB  — PassB後スナップショット（autoGenerate専用、Step3）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: A10=PassB終了スナップショット / A11=[不足]PassB / A12=[PassB-連続チェック] / A13=[DIAG-PassB](eiyo)
  passB: {
    snapshot: [
      // 全スタッフ1行（公休・種別内訳）
      {
        name        : '',
        targetKyuko : 0,
        actualKyuko : 0,
        kyumi       : 0,   // 休み（通常）
        kibosyu     : 0,   // 希望休
        yuyuu       : 0,   // 有休
        ake         : 0,   // 明け
      }
    ],
    shortage: [
      // 公休不足スタッフのみ
      {
        name    : '',
        target  : 0,
        actual  : 0,
        diff    : 0,    // actual - target（負=不足）
        ake     : 0,
        restDays: [],   // 実際の休み日番号配列
      }
    ],
    consecCheck: {
      maxConsec           : 0,
      violatingStaffCount : 0,   // 連続超過スタッフ数
      totalViolationDays  : 0,   // 超過日数合計
      maxStreak           : 0,   // 全スタッフ中の最大連続値
      rows: [
        // 超過者のみ
        { name: '', maxStreak: 0, violationDays: 0 }
      ],
    },
  },
  // generateTimeAxis: null

  // ══════════════════════════════════════════════════════════════════
  // ④ passC  — PassC修復サマリ（autoGenerate専用、Step3に統合）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: A14=[PassC-GUARD] / A15=[PassC-Tier2休み追加] / A16=[PassC-非slot休み追加]
  //          L1644=[AG-Phase1]PassCサマリ / L1645=[PassC-TYPE-DIAG] / A17=連続違反残存
  //          L1666=PassC終了スナップショット / L1667=[不足]PassC終了
  passC: {
    summary: {
      nonSlotFixed   : 0,   // 非slot→休み変換件数
      tier2Absorbed  : 0,   // Tier2(日勤層)吸収件数
      totalRestAdded : 0,   // 合計追加休み件数
    },
    typeBreakdown: [
      // 元シフト別集計（PassC-TYPE-DIAG）
      { shift: '', count: 0, ratio: '' }   // ratio='12.3%'形式
    ],
    guards: [
      // PassC-GUARD発火一覧（公休上限ガード）
      { name: '', actualRest: 0, targetRest: 0 }
    ],
    tier2Changes: [
      // Tier2 streak切断一覧
      { name: '', day: 0, origShift: '', streakBefore: 0, streakAfter: 0 }
    ],
    nonSlotChanges: [
      // 非slot→休み変換一覧
      { name: '', day: 0, origShift: '', consecWork: 0 }
    ],
    residualViolations   : 0,   // PassC後の連続違反残存数
    residualSlotProtected: 0,   // うちslot保護で修正不可だった件数
    snapshot: [
      // PassC終了時点の全スタッフ公休スナップショット
      {
        name        : '',
        targetKyuko : 0,
        actualKyuko : 0,
        kyumi       : 0,
        kibosyu     : 0,
        yuyuu       : 0,
        ake         : 0,
      }
    ],
    shortage: [
      // PassC終了時点の不足スタッフ
      { name: '', target: 0, actual: 0, diff: 0, ake: 0, restDays: [] }
    ],
  },
  // generateTimeAxis: null

  // ══════════════════════════════════════════════════════════════════
  // ⑤ restAdjustment  — 公休数フェーズ追跡（autoGenerate専用、Step2）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: A18=公休数調整後(L1751) / A19=enforceMaxStaff×3後(L1901)
  //          A20=公休数回復後(L1942) / A21=超過バリデーション後(L1994)
  restAdjustment: {
    phases: {
      // フェーズ①: PassC後の公休数調整（excess休み→勤務変換）後
      afterRestAdj: {
        rows    : [{ name: '', target: 0, actual: 0, diff: 0 }],
        shortage: [{ name: '', target: 0, actual: 0, diff: 0, ake: 0, restDays: [] }],
      },
      // フェーズ②: enforceMaxStaff×3 + minStaff保証後
      afterEnforceMax3: {
        rows    : [{ name: '', target: 0, actual: 0, diff: 0 }],
        shortage: [{ name: '', target: 0, actual: 0, diff: 0, ake: 0, restDays: [] }],
      },
      // フェーズ③: 公休数回復フェーズ（日勤→休み変換）後
      afterRestRecovery: {
        rows: [{ name: '', target: 0, actual: 0, diff: 0 }],
        // shortageはフェーズ④で確認するため省略
      },
      // フェーズ④: 公休数超過バリデーション（余剰休み→日勤変換）後
      afterExcessVal: {
        rows: [{ name: '', target: 0, actual: 0, diff: 0 }],
      },
    },
  },
  // generateTimeAxis: null

  // ══════════════════════════════════════════════════════════════════
  // ⑥ final  — 最終出力検証（全エンジン共通、Step1）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: A22/A23=[AG-v7]FINAL VIOLATION/FINAL
  //          A24/A25=[Night-Sequence-Final]
  //          A26=最終出力スナップショット
  final: {
    // maxStaff超過残存
    maxStaffViolations: [
      { day: 0, shift: '', cnt: 0, limit: 0 }
    ],
    totalViolations: 0,           // 違反件数合計（0が正常）
    // 明け孤立残存
    nightOrphans   : 0,           // 孤立件数（0が正常）
    nightOrphanList: [],          // ['スタッフ名 dN(prev=xxx)', ...]
    // 最終公休スナップショット
    snapshot: [
      {
        name        : '',
        targetKyuko : 0,
        actualKyuko : 0,
        diff        : 0,
        kyumi       : 0,
        kibosyu     : 0,
        yuyuu       : 0,
        ake         : 0,
      }
    ],
  },

  // ══════════════════════════════════════════════════════════════════
  // ⑦ shortage  — minStaff不足分析（generateTimeAxis/eiyo専用、Step7）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: B7=[TimeAxis-DIAG] / B8=[SHORTAGE-CLASSIFY] / B9=[SHORTAGE-ABC]
  shortage: {
    // 職員別サマリ
    staffRows: [
      { name: '', role: '', blank: 0, work: {}, rest: 0, allowed: [] }
      // work: { '日勤': 5, '早番': 3, ... }
    ],
    // シフト別不足日
    shiftShortage: [
      { shift: '', minStaff: 0, shortDays: [] }
    ],
    // 日別詳細（不足日のみ）
    dayDetail: [
      {
        day    : 0,
        shift  : '',
        actual : 0,
        minStaff: 0,
        c1ok   : [],   // 配置可能スタッフ
        c1v4   : [],   // 連勤超過で配置不可
        c2     : [],   // 既に別シフト配置済み
        c3move : [],   // 休み移動可能候補
        c3lock : [],   // 休みロック中
        c3role : [],   // 役職NGで配置不可
      }
    ],
    // ABCD分類（eiyo専用）
    classify: {
      A_structural : 0,   // 担当者不足・構造的欠如
      B_blank      : 0,   // 空白セル由来
      C_misplaced  : 0,   // 配置ミス（別シフト割当済み）
      D_constrained: 0,   // 制約（連勤上限・ロック）由来
      detail: [
        { day: 0, shift: '', actual: 0, minStaff: 0, category: '' }
        // category: 'A構造不足' | 'B空白由来' | 'C配置ミス' | 'D制約由来'
      ],
    },
    // 理論容量分析（eiyo専用）
    theory: {
      staffCapacity: [
        { name: '', role: '', allowed: [], totalTarget: 0, workDays: 0 }
      ],
      shiftCapacity: [
        {
          shift    : '',
          minStaff : 0,
          required : 0,      // minStaff × days
          eligible : 0,      // 担当可能スタッフ数
          maxInput : 0,      // 最大投入可能人日
          sufficient: true,  // 充足可能か
          surplus  : 0,      // 余裕人日（負=理論不足）
        }
      ],
      // 早番/日勤競合分析（両方minStaff設定がある場合のみ）
      earlyDayConflict: {
        eOnly : [],    // 早番専任スタッフ
        dOnly : [],    // 日勤専任スタッフ
        both  : [],    // 両方可スタッフ
        eOnlyWorkDays: 0,
        dOnlyWorkDays: 0,
        bothWorkDays : 0,
      } | null,
    },
  },
  // autoGenerate（kaigo系）: null

  // ══════════════════════════════════════════════════════════════════
  // ⑧ bestOf  — bestOf試行結果（generateTimeAxis/eiyo専用、Step6）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: B5=[TimeAxis-BESTOF] / B6=[TimeAxis-CHECK]
  bestOf: {
    trials             : 0,      // 総試行回数
    passCount          : 0,      // 5絶対条件クリア候補数
    adoptedScore       : null,   // 採用スコア（null=合格なし）
    noPassingCandidate : false,  // true=全試行で合格候補なし
    shortDays          : 0,      // 採用候補のminStaff不足日数
    absoluteCheck: {
      v1_restCount    : 0,   // 公休数違反
      v2_paidLeave    : 0,   // 有休固定違反
      v3_allowedShift : 0,   // 許可種別違反
      v4_consec       : 0,   // 連勤超過日
      v5_maxStaff     : 0,   // maxStaff超過
      v6_minStaffShortDays: 0,  // minStaff不足日
    },
  },
  // autoGenerate（kaigo系）: null

  // ══════════════════════════════════════════════════════════════════
  // ⑨ hillClimb  — 山登り局所探索（generateTimeAxis/eiyo専用、Step8）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: B2/B3=[山登り]局所探索①(シフト充填) / B4=[山登り]局所探索②(swap)
  hillClimb: {
    shiftFill: {
      before  : 0,   // 探索前minStaff不足日数
      after   : 0,   // 探索後minStaff不足日数
      improved: 0,   // 改善日数（before - after）
    },
    swap: {
      before        : 0,
      after         : 0,
      improved      : 0,
      scoreImproved : 0,   // スコア改善量
    },
  },
  // autoGenerate（kaigo系）: null

  // ══════════════════════════════════════════════════════════════════
  // ⑩ kyukoRetry  — 公休保証リトライ（_runGenerateCore、Step9）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: C1=[公休保証]リトライ結果
  kyukoRetry: {
    triggered  : false,   // リトライが発火したか
    allMatch   : true,    // 全員の公休数が目標に一致したか
    retryCount : 0,       // 採用までのリトライ回数（将来: 何回目で一致したか）
  } | null,
  // リトライなし（公休保証リトライフロー非発動）: null

  // ══════════════════════════════════════════════════════════════════
  // ⑪ nightSequence  — 夜勤シーケンス修復（autoGenerate、Step10/任意）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: A4=[Night-Sequence-EnforceMax]cascade変換
  nightSequence: {
    cascades: [
      // enforceMaxStaff中の夜勤cascade変換（翌日明け→休み）
      { day: 0, name: '', from: '', to: '', cascadeDay: 0 }
    ],
  } | null,
  // Step10未実装時: null

  // ══════════════════════════════════════════════════════════════════
  // ⑫ maxStaff  — enforceMaxStaff発火ログ（autoGenerate、Step10/任意）
  // ══════════════════════════════════════════════════════════════════
  // 対象ログ: A2=[AG-v7]enforceMaxStaff
  maxStaff: {
    events: [
      // maxStaff超過を検出して削除した全イベント
      { day: 0, shift: '', count: 0, limit: 0 }
    ],
  } | null,
  // Step10未実装時: null

  // ══════════════════════════════════════════════════════════════════
  // ⑬ minStaff  — minStaff保証フェーズ記録（将来拡張用）
  // ══════════════════════════════════════════════════════════════════
  // 現在対応するconsole.logなし。Phase4完了後に必要性を評価する。
  minStaff: null,
  // 将来追加候補: { enforceRounds: number, fixedCells: [...] }

  // ══════════════════════════════════════════════════════════════════
  // ⑭ repairHistory  — 全フェーズ時系列サマリ（Step10で合成）
  // ══════════════════════════════════════════════════════════════════
  repairHistory: [
    // autoGenerate例（kaigo系）
    { phase: 'PassA',          restShortage: 0, maxStreak: 0 },
    { phase: 'PassB',          restShortage: 0, consecViolators: 0 },
    { phase: 'PassC',          nonSlotFixed: 0, tier2Absorbed: 0, residualViolations: 0 },
    { phase: 'restAdjustment', restShortage: 0 },
    { phase: 'enforceMax3',    restShortage: 0 },
    { phase: 'restRecovery',   restShortage: 0 },
    { phase: 'excessVal',      restShortage: 0 },
    { phase: 'final',          maxStaffViolations: 0, nightOrphans: 0, restShortage: 0 },
    // generateTimeAxis例（eiyo系）
    // { phase: 'hillClimbFill', improved: 0 },
    // { phase: 'hillClimbSwap', improved: 0 },
    // { phase: 'bestOf',        passCount: 0, shortDays: 0 },
    // { phase: 'final',         maxStaffViolations: 0, nightOrphans: 0, restShortage: 0 },
  ],
};
```

---

## 2. 各Stepが格納される場所

| Step | 格納キー | 対象ログ | エンジン |
|---|---|---|---|
| Step1 | `repair.final` | A22-A26 | autoGenerate / generateTimeAxis |
| Step2 | `repair.restAdjustment` | A18-A21（+ passC終了スナップ） | autoGenerate |
| Step3 | `repair.passB` + `repair.passC` | A10-A17, L1644/1645/1666/1667 | autoGenerate |
| Step4 | `repair.passA` | A5/A6 | autoGenerate |
| Step5 | （削除のみ・格納先なし） | D1-D5 | autoGenerate |
| Step6 | `repair.bestOf` | B5/B6 | generateTimeAxis |
| Step7 | `repair.shortage` | B7/B8/B9 | generateTimeAxis |
| Step8 | `repair.hillClimb` | B2/B3/B4 | generateTimeAxis |
| Step9 | `repair.kyukoRetry` | C1 | _runGenerateCore |
| Step10 | `repair.summary` + `repair.repairHistory` + `repair.nightSequence` + `repair.maxStaff` | A2/A4 + 集約 | autoGenerate |

> **Step3補足**: PassCのデータ量が多いため passB と passC を同一Stepで実装する。  
> Step2でrestAdjustmentを先に実装（最終品質に最も近い情報から優先）し、  
> Step3で中間フェーズ（passB/passC）を遡及実装する。

---

## 3. 初期値（空コンテナ）

autoGenerate 冒頭に設置する空コンテナ（Phase4実装時にStep1〜5で埋める）:

```javascript
// ── DiagnosticEngine Phase4: repair 空コンテナ ──────────────────
const _repair = {
  summary      : { engine: 'autoGenerate', quality: { maxStaffViolations:0, nightOrphans:0, restShortageStaff:0, minStaffShortDays:0, kyukoRetryTriggered:false } },
  passA        : { rows: [] },
  passB        : { snapshot: [], shortage: [], consecCheck: { maxConsec, violatingStaffCount:0, totalViolationDays:0, maxStreak:0, rows:[] } },
  passC        : { summary:{nonSlotFixed:0,tier2Absorbed:0,totalRestAdded:0}, typeBreakdown:[], guards:[], tier2Changes:[], nonSlotChanges:[], residualViolations:0, residualSlotProtected:0, snapshot:[], shortage:[] },
  restAdjustment: { phases: { afterRestAdj:{rows:[],shortage:[]}, afterEnforceMax3:{rows:[],shortage:[]}, afterRestRecovery:{rows:[]}, afterExcessVal:{rows:[]} } },
  final        : { maxStaffViolations:[], totalViolations:0, nightOrphans:0, nightOrphanList:[], snapshot:[] },
  shortage     : null,   // generateTimeAxis専用
  bestOf       : null,   // generateTimeAxis専用
  hillClimb    : null,   // generateTimeAxis専用
  kyukoRetry   : null,   // _runGenerateCore で設定
  nightSequence: null,   // Step10
  maxStaff     : null,   // Step10
  minStaff     : null,   // 将来拡張
  repairHistory: [],     // Step10で合成
};
```

generateTimeAxis 冒頭の空コンテナ（Phase4 Step6〜8で埋める）:

```javascript
const _repair = {
  summary      : { engine: 'generateTimeAxis', quality: { maxStaffViolations:0, nightOrphans:0, restShortageStaff:0, minStaffShortDays:0, kyukoRetryTriggered:false } },
  passA        : null,
  passB        : null,
  passC        : null,
  restAdjustment: null,
  final        : { maxStaffViolations:[], totalViolations:0, nightOrphans:0, nightOrphanList:[], snapshot:[] },
  shortage     : { staffRows:[], shiftShortage:[], dayDetail:[], classify:{A_structural:0,B_blank:0,C_misplaced:0,D_constrained:0,detail:[]}, theory:{staffCapacity:[],shiftCapacity:[],earlyDayConflict:null} },
  bestOf       : { trials:0, passCount:0, adoptedScore:null, noPassingCandidate:false, shortDays:0, absoluteCheck:{v1_restCount:0,v2_paidLeave:0,v3_allowedShift:0,v4_consec:0,v5_maxStaff:0,v6_minStaffShortDays:0} },
  hillClimb    : { shiftFill:{before:0,after:0,improved:0}, swap:{before:0,after:0,improved:0,scoreImproved:0} },
  kyukoRetry   : null,
  nightSequence: null,
  maxStaff     : null,
  minStaff     : null,
  repairHistory: [],
};
```

---

## 4. 将来追加予定の項目

以下は Phase4 完了後に評価・追加するフィールド。**スキーマ上は予約済みキーとして null 初期値を持つ**。

| キー | 追加タイミング | 内容 |
|---|---|---|
| `repair.minStaff` | Phase5候補 | minStaff保証フェーズの発火回数・修正セル一覧 |
| `repair.kyukoRetry.retryCount` | Phase5候補 | 公休保証リトライが何回目で一致したか |
| `repair.hillClimb.swap.swapLog` | Phase5候補 | 採用されたswap詳細（Y日X日→Zと交換）一覧 |
| `repair.shortage.theory.tripleCoverage` | Phase5候補 | 夜勤・早番・日勤の3シフト同時充足理論解析 |
| `repair.summary.quality.score` | Phase5候補 | bestOfN採用スコア（generateTimeAxisのみ） |

---

## 5. UI利用イメージ

### 5.1 生成品質バッジ（最高優先）

```jsx
// repair.summary.quality から1行で品質を表示
const q = diagnosticReport.repair.summary.quality;
<div>
  {q.maxStaffViolations === 0 ? '✅ maxStaff正常' : `⚠️ maxStaff違反 ${q.maxStaffViolations}件`}
  {q.nightOrphans === 0 ? '✅ 明け正常' : `⚠️ 明け孤立 ${q.nightOrphans}件`}
  {q.restShortageStaff === 0 ? '✅ 公休達成' : `⚠️ 公休未達 ${q.restShortageStaff}名`}
  {q.minStaffShortDays === 0 ? '✅ 人員充足' : `⚠️ 人員不足 ${q.minStaffShortDays}日`}
</div>
```

### 5.2 フェーズ別収束グラフ（autoGenerate）

```jsx
// repair.restAdjustment.phases から収束を可視化
const phases = diagnosticReport.repair.restAdjustment.phases;
const shortageByPhase = [
  { label: 'PassC後',        count: phases.afterRestAdj.shortage.length },
  { label: 'EnforceMax3後',  count: phases.afterEnforceMax3.shortage.length },
  { label: '公休回復後',      count: phases.afterRestRecovery.rows.filter(r => r.diff < 0).length },
  { label: '超過検証後',      count: phases.afterExcessVal.rows.filter(r => r.diff < 0).length },
  { label: '最終',           count: diagnosticReport.repair.final.snapshot.filter(r => r.diff < 0).length },
];
// → ステップチャート表示
```

### 5.3 minStaff不足原因ドリルダウン（eiyo）

```jsx
// repair.shortage.classify から円グラフ
const { A_structural, B_blank, C_misplaced, D_constrained } = diagnosticReport.repair.shortage.classify;
// A=構造的問題（人員補強が必要）/ B=空白（修正余地あり）/ C=配置ミス / D=制約

// repair.shortage.theory でなぜ理論上不足するかを表示
diagnosticReport.repair.shortage.theory.shiftCapacity.forEach(sc => {
  if (!sc.sufficient) {
    console.warn(`${sc.shift}: 理論不足 ${-sc.surplus}人日`);
  }
});
```

### 5.4 repairHistory タイムライン

```jsx
// repair.repairHistory から生成工程タイムラインを表示
diagnosticReport.repair.repairHistory.forEach(h => {
  console.log(`[${h.phase}] 不足: ${h.restShortage ?? '-'}名`);
});
```

---

## 6. JSON出力イメージ

実際の生成結果（eiyo、2026年7月）の想定JSON:

```json
{
  "dept": "eiyo",
  "year": 2026,
  "month": 6,
  "prevTail": { "loaded": true, "staffCount": 8, "dayCount": 32 },
  "blankCheck": null,
  "repair": {
    "summary": {
      "engine": "generateTimeAxis",
      "quality": {
        "maxStaffViolations": 0,
        "nightOrphans": 0,
        "restShortageStaff": 0,
        "minStaffShortDays": 2,
        "kyukoRetryTriggered": false
      }
    },
    "passA": null,
    "passB": null,
    "passC": null,
    "restAdjustment": null,
    "final": {
      "maxStaffViolations": [],
      "totalViolations": 0,
      "nightOrphans": 0,
      "nightOrphanList": [],
      "snapshot": [
        { "name": "山田", "targetKyuko": 9, "actualKyuko": 9, "diff": 0, "kyumi": 7, "kibosyu": 2, "yuyuu": 0, "ake": 0 },
        { "name": "田中", "targetKyuko": 8, "actualKyuko": 8, "diff": 0, "kyumi": 6, "kibosyu": 2, "yuyuu": 0, "ake": 0 }
      ]
    },
    "shortage": {
      "staffRows": [
        { "name": "山田", "role": "管理", "blank": 0, "work": { "早番": 5, "日勤": 13 }, "rest": 9, "allowed": ["早番", "日勤"] }
      ],
      "shiftShortage": [
        { "shift": "日勤", "minStaff": 2, "shortDays": [3, 17] }
      ],
      "dayDetail": [
        { "day": 3, "shift": "日勤", "actual": 1, "minStaff": 2, "c1ok": [], "c1v4": ["田中"], "c2": [], "c3move": ["佐藤"], "c3lock": [], "c3role": [] }
      ],
      "classify": {
        "A_structural": 0, "B_blank": 0, "C_misplaced": 1, "D_constrained": 1,
        "detail": [
          { "day": 3, "shift": "日勤", "actual": 1, "minStaff": 2, "category": "C配置ミス" },
          { "day": 17, "shift": "日勤", "actual": 1, "minStaff": 2, "category": "D制約由来" }
        ]
      },
      "theory": {
        "staffCapacity": [
          { "name": "山田", "role": "管理", "allowed": ["早番", "日勤"], "totalTarget": 9, "workDays": 22 }
        ],
        "shiftCapacity": [
          { "shift": "日勤", "minStaff": 2, "required": 62, "eligible": 6, "maxInput": 120, "sufficient": true, "surplus": 58 }
        ],
        "earlyDayConflict": {
          "eOnly": ["山田"], "dOnly": [], "both": ["田中", "佐藤"],
          "eOnlyWorkDays": 22, "dOnlyWorkDays": 0, "bothWorkDays": 44
        }
      }
    },
    "bestOf": {
      "trials": 20, "passCount": 18, "adoptedScore": 8.3, "noPassingCandidate": false, "shortDays": 2,
      "absoluteCheck": { "v1_restCount": 0, "v2_paidLeave": 0, "v3_allowedShift": 0, "v4_consec": 0, "v5_maxStaff": 0, "v6_minStaffShortDays": 2 }
    },
    "hillClimb": {
      "shiftFill": { "before": 4, "after": 2, "improved": 2 },
      "swap": { "before": 2, "after": 2, "improved": 0, "scoreImproved": 0 }
    },
    "kyukoRetry": null,
    "nightSequence": null,
    "maxStaff": null,
    "minStaff": null,
    "repairHistory": [
      { "phase": "hillClimbFill", "improved": 2 },
      { "phase": "hillClimbSwap", "improved": 0 },
      { "phase": "bestOf", "passCount": 18, "shortDays": 2 },
      { "phase": "final", "maxStaffViolations": 0, "nightOrphans": 0, "restShortage": 0 }
    ]
  }
}
```

---

## 7. スキーマ変更ルール（Phase4実装時の禁止事項）

1. **既存キーのリネーム禁止** — `passA`→`phaseA` 等の変更は過去コミットとの不整合を生む
2. **既存フィールドの型変更禁止** — `totalViolations: 0`（number）→配列への変更禁止
3. **親オブジェクトの追加禁止** — `repair` の直下に新しいトップキーを追加しない（将来拡張は上記「将来追加予定」に記載し、null予約済みキーを使う）
4. **フィールド追加は末尾のみ** — 既存フィールドの後ろに追記する。既存フィールドの間に挿入しない

---

## 最終回答

### ① このスキーマでPhase4最後まで変更不要と言えるか

**言える（条件付き）。**

14のトップキー（summary〜repairHistory）は全ログ（A1〜C1、B1〜B9）を過不足なくカバーしている。Step10の任意項目（nightSequence/maxStaff）もnull予約済みキーとして初期化する設計のため、Step追加で親オブジェクトが増えることはない。

唯一の例外は「将来追加予定」欄の項目だが、これらは既存フィールド末尾への追記（スキーマ拡張）であり、既存フィールドの変更ではない。

### ② Step1〜Step10で新しい親オブジェクトが増えないか

**増えない。**

Step1〜10で格納するキーはすべて `repair` 直下の14キーに収まる：
- Step1→`final`、Step2→`restAdjustment`、Step3→`passB`+`passC`、Step4→`passA`
- Step5→削除のみ（格納先なし）
- Step6→`bestOf`、Step7→`shortage`、Step8→`hillClimb`、Step9→`kyukoRetry`
- Step10→`summary`+`repairHistory`+`nightSequence`+`maxStaff`

### ③ この構造でRepairEngine診断の完成形と言えるか

**完成形と言える（Phase4スコープ内で）。**

- autoGenerateの全フェーズ（PassA→PassB→PassC→公休調整×4フェーズ→最終検証）が `passA/passB/passC/restAdjustment/final` で網羅される
- generateTimeAxisの全フェーズ（山登り→bestOf→不足分析→最終検証）が `hillClimb/bestOf/shortage/final` で網羅される
- UIに必要な品質数値が `summary.quality` に1箇所集約されている
- AI解析に必要な時系列が `repairHistory` に要約されている
- JSON保存可能（循環参照なし・プリミティブ型のみ）

Phase5以降の拡張（minStaff詳細・swap詳細ログ等）は `minStaff: null` 等の予約済みキーに後から値を入れるだけで対応できる。
