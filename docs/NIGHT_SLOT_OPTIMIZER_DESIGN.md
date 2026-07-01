# Night Slot Optimizer 設計書
## Phase5 Step4

作成日: 2026-06-30  
対象: src/App.jsx — autoGenerate 内 ステップ1.5 / ステップ2  
前提: Step2（比較関数）・Step3（アンカー順序）の検証で「逐次貪欲法の構造的限界」が確認済み

---

## 1. 現方式の時系列解析

### 1-1. 処理全体フロー（夜勤配置に関わる部分）

```
autoGenerate 開始
│
├── ① 前処理（L1022-1093）
│    ├── prevTail 繰り越し: 前月末が夜勤/明けなら d=1,2 に夜勤連鎖セット
│    ├── 希望休・有休・shiftRequests を res[] にセット
│    └── lockedDays[] 初期化（セット済み日をロック）
│
├── ② ステップ1.5 アンカー配置（L1106-1154）  ←【固定配置①】
│    ├── anchorPool = nightOk && _nightAllowed なスタッフ
│    ├── anchorAutoMax = ceil(days / anchorPool.length)
│    ├── 候補収集: 全スタッフの kiboByMonth 希望休D → nightDay=D-2, meakeDay=D-1
│    ├── 前後半キューに分類 → 交互マージ順（Step3変更済み）
│    └── 配置: res[s.id][nightDay]="夜勤", res[s.id][meakeDay]="明け", lockedDays更新
│
├── ③ ステップ2 夜勤貪欲配置（L1161-1241）  ←【固定配置②: 本稿の主対象】
│    ├── nightPool = nightOk && _nightAllowed なスタッフ
│    ├── autoMax = ceil(days / nightPool.length)
│    ├── _lastNightDay 初期化（アンカー配置済み夜勤日を反映）
│    └── d=1 から days まで日付順ループ:
│         ├── already = 当日既配置夜勤数
│         ├── need = minStaff["夜勤"] - already
│         ├── need <= 0 → skip
│         ├── canNight(s) フィルタ（6条件後述）
│         ├── usedNight < autoMax フィルタ
│         ├── _nightCandSort でソート（v3: count→halfCount→lastNightDay）
│         ├── フォールバック: autoMaxなし候補がなければ上限無視で再試行
│         ├── G-1/NG-2 動的判定ループ（need 減算するまで繰り返し）
│         │    ├── NG-2: low-NR が既配置なら low-NR 候補を除外
│         │    └── G-1: 外国人夜勤がいてサポーター未配置なら非外国人優先ソート
│         └── 配置: res[]="夜勤", res[d+1]="明け", res[d+2]="休み", _lastNightDay更新
│
└── ④ PassA以降（L1371以降）
     ※ 夜勤は lockedDays で保護され、PassA以降では変更されない
```

### 1-2. canNight(s) の6条件（L1193-1199）

| # | 条件 | 内容 | 性質 |
|---|------|------|------|
| C1 | `nightExcludeDays?.has(d)` | クロスフロア夜勤禁止日 | ハード制約 |
| C2 | `lockedDays[s.id].has(d)` | ロック済み日（希望休・有休・アンカー）| ハード制約 |
| C3 | `res[s.id][d-1] ∈ {夜勤,明け}` | 昨日が夜勤/明けなら不可 | ハード制約（連続夜勤禁止）|
| C4 | `lockedDays[s.id].has(d+1) && res[s.id][d+1] !== 明け` | 翌日がロック済み（明け以外）| ハード制約（明けが入れられない）|
| C5 | `lockedDays[s.id].has(d+2) && deptWork.has(res[s.id][d+2])` | 翌々日がロック勤務 | ハード制約（夜勤→明け→固定勤務禁止）|
| C6 | `usedNight < max(nightMax, autoMax)` | 月間上限 | ソフト制約（フォールバックで除外解除）|

### 1-3. 現アルゴリズムの根本的性質

```
処理方向: d=1 → days（一方向）
決定タイミング: 各日 d において「その日限り」の局所最適選択
ロールバック: なし（一度配置したら変更不可）
将来情報: 使用しない（d+1以降の制約状況を考慮しない）
```

**これは「逐次貪欲法（Sequential Greedy）」である。**

### 1-4. なぜ前半後半偏差が生じるか（根本原因）

```
d=1..15（前半）:
  → 全スタッフが候補として自由に参加できる
  → count-only sort → S0,S1,S2,S3,S4 がラウンドロビンで選ばれる
  → 前半にほぼ均等に配置される

d=16..30（後半）:
  → 一部スタッフがC4/C5制約（前半夜勤の翌日/翌々日）で参加不可
  → 前半に多く配置されたスタッフほど後半に制約が多い
  → 後半の配置が偏りやすい

加えて:
  アンカー配置（Step1.5）が特定日を固定し、
  Step2がアンカー配置を「既成事実」として扱うため補正不可
```

---

## 2. Night Slot Optimizer 設計

### 2-1. 設計思想

現在の「日付順に1スロットずつ決定」を廃止し、  
**全夜勤スロット（days × minStaff["夜勤"] 個）を事前にスケジューリングしてから一括確定**する。

```
現方式（Sequential Greedy）:
  slot_1 → assign → slot_2 → assign → ... → slot_N → assign
  各ステップで将来情報なし → 局所最適が全体最適にならない

NSO（Night Slot Optimizer）:
  全スロットを可視化 → 全候補を収集 → 大域制約を満たす配置を一括決定
  → 夜勤回数・前後半・間隔をすべてコスト関数で同時最適化
```

### 2-2. 入力・出力

**入力**:
```
nightPool   : 夜勤可能スタッフ一覧
days        : 月の日数
minStaff["夜勤"] : 1日あたり必要夜勤人数 M
maxStaff["夜勤"] : 1日あたり上限夜勤人数
lockedDays  : スタッフごとの固定日集合（希望休・有休・アンカー）
prevShift   : 前月末シフト（夜勤連鎖繰り越し）
nightMax    : スタッフごとの月間上限
nightExcludeDays : クロスフロア禁止日
G-1 / NG-2 制約パラメータ
```

**出力**:
```
assignments : Map<staffId, Set<nightDay>>
  → 各スタッフが担当する夜勤日の集合
  → 夜勤→明け→(休み)の連鎖は autoGenerate 側で後処理
```

### 2-3. アルゴリズム設計（2フェーズ）

#### Phase A: 実行可能配置の事前計算

```
for each staff s ∈ nightPool:
  for each day d = 1..days:
    feasible[s][d] = canAssign(s, d, currentAssignment)
```

`canAssign(s, d, A)` は現方式の canNight に相当するが、  
**A（配置中の全アサイン）を参照して動的に計算**する点が異なる。

#### Phase B: 配置最適化（割り当て問題）

**目的関数 Cost(A)**:

```
Cost(A) = w1 × CountEquity(A)
        + w2 × HalfBalance(A)
        + w3 × IntervalEquity(A)
        + w4 × Shortage(A) × M_penalty
        + w5 × G1NG2Violation(A)
```

| 項目 | 定義 | 重み案 |
|------|------|--------|
| CountEquity | σ(スタッフごとの夜勤回数) | w1=100 |
| HalfBalance | mean(|前半回数 - 後半回数|) per staff | w2=50 |
| IntervalEquity | σ(夜勤間隔) per staff | w3=20 |
| Shortage | 日別 minStaff 未達日数 | w4=10000 |
| G1NG2Violation | G-1/NG-2 違反数 | w5=1000 |

**制約**:
```
Hard: ∀d: M ≤ Σ_s A[s][d] ≤ maxStaff["夜勤"]   (日別必要人数)
Hard: ∀s,d: A[s][d]=1 → canAssign(s,d,A)=true   (feasibility)
Hard: ∀s: Σ_d A[s][d] ≤ max(nightMax, autoMax)   (月間上限)
Soft: G-1, NG-2（コストに組み込み）
```

### 2-4. 最適化アルゴリズム選択

#### 選択肢A: Column Generation（推奨）

```
各スタッフのシフトパターン（月間夜勤日集合）を「列」として扱い、
カバリング制約（各日のminStaff充足）を満たす列の組み合わせを選択する。

実装:
  1. 初期解を貪欲法（現アルゴリズム）で生成
  2. コスト削減が期待できる列（シフトパターン）を動的に生成
  3. LP緩和 → 整数丸め で実現可能解を得る

メリット: 理論的に最適解に収束
デメリット: LP ソルバー実装が必要（ブラウザ環境では重い）
```

#### 選択肢B: Simulated Annealing（実用的推奨）

```
アルゴリズム:
  1. 初期解: 現アルゴリズム（貪欲法）で生成
  2. 近傍操作:
     - Swap: スタッフA の日d1 とスタッフB の日d2 を入れ替え
     - Move: スタッフA の夜勤を日d1 → d2 に移動
     - Insert/Delete: 夜勤を追加/削除（shortage がある日のみ）
  3. コスト計算: ΔCost = Cost(A') - Cost(A)
  4. 採用基準: ΔCost < 0 なら採用、ΔCost >= 0 なら exp(-ΔCost/T) の確率で採用
  5. 温度T: 初期=100, 冷却率=0.95, 最終=0.1

ブラウザ実装可能。bestOfN 30回の各試行内で実行（試行あたり50〜200イテレーション）。
```

#### 選択肢C: Constraint Propagation + Backtracking（堅実推奨）

```
アルゴリズム:
  1. 全スロット (s, d) の実行可能性を事前計算（feasibility matrix）
  2. 各日 d について「最も制約が厳しい日」から順に配置（fail-first原則）
  3. バックトラッキングで全体整合を取る
  4. 前後半バランスを優先度として組み込む

現アルゴリズムとの差異:
  ・配置順が d=1..days（時系列）でなく「困難な日優先」
  ・バックトラッキングにより局所最適からの脱出が可能
  ・前後半バランスを事前に目標として設定し逆算配置

実装難度: 中
速度: 高（バックトラック深度が浅ければ最悪ケースにならない）
```

### 2-5. 推奨設計（選択肢C: CP+Backtracking）

実際の運用上の制約（ブラウザ実行・30試行×bestOfN・レスポンス1秒以内）を考慮し、
**選択肢C（CP+Backtracking）をベースに選択肢B（SA）でのリファインを組み合わせる**ハイブリッド設計を推奨。

#### 2-5-1. NSOアルゴリズム詳細

```
STEP 1: 実行可能マトリクス構築
  feasible[s][d] = true/false (O(N×D) = 5×30 = 150演算)

STEP 2: 目標回数の計算
  targetCount[s] = floor(totalSlots / nightPool.length) または ceil
  targetFirst[s] = floor(targetCount[s] / 2)   (前半目標)
  targetSecond[s] = targetCount[s] - targetFirst[s] (後半目標)

STEP 3: 「困難な日」優先スケジューリング
  difficulty[d] = feasible なスタッフ数（少ないほど困難）
  dayOrder = sort(d) by difficulty ascending

STEP 4: 配置ループ（困難日から順に）
  for d in dayOrder:
    candidates = feasible なスタッフ × autoMax未満
    if shortage_risk[d] > 0:
      優先: targetCount が未達のスタッフを優先
      次点: 前後半バランスが悪いスタッフを優先
    assign = select best M candidates
    update feasible matrix（翌日/翌々日の制約反映）

STEP 5: SA リファイン（100イテレーション）
  現解のCostを計算
  近傍操作（Swap/Move）を試行
  ΔCost < 0 なら採用（温度なし版: hill-climbing）
  最終解を return
```

#### 2-5-2. 前後半バランスの組み込み方

```javascript
// 各スタッフに「次の夜勤を前半/後半どちらに入れるべきか」を動的計算
function getHalfPriority(s, currentAssignment, days) {
  const halfMid = Math.floor(days / 2);
  const firstCount = currentAssignment[s.id].filter(d => d <= halfMid).length;
  const secondCount = currentAssignment[s.id].filter(d => d > halfMid).length;
  const targetFirst = Math.ceil(targetCount[s.id] / 2);
  // 前半が不足していれば前半を優先（後半の日には低スコア）
  return firstCount < targetFirst ? 'FIRST_HALF' : 'SECOND_HALF';
}

// dayのスコア計算（候補選択で使用）
function dayScore(s, d, halfPriority, days) {
  const halfMid = Math.floor(days / 2);
  const isFirstHalf = d <= halfMid;
  // halfPriority と一致する日は高スコア
  return halfPriority === 'FIRST_HALF' && isFirstHalf ? 1.0
    : halfPriority === 'SECOND_HALF' && !isFirstHalf ? 1.0
    : 0.3; // 一致しない日は低スコア（でも 0 ではない: 制約で仕方ない場合がある）
}
```

#### 2-5-3. G-1/NG-2 制約の組み込み

現方式と同様にスロット単位で動的判定するが、  
**事前に G-1/NG-2 制約を考慮したペアリング可能性を計算**してから割り当てる。

```
G-1: 外国人スタッフが割り当てられる日は、同日に非外国人も必要
     → 同日に複数スロットある場合のみ発動
     → minStaff["夜勤"] = 1 の場合は発動しない（現在の kaigo1/kaigo2）

NG-2: low-NR スタッフ同士が同日に配置されない
     → 同日に複数スロットある場合のみ発動
     → minStaff["夜勤"] = 1 の場合は発動しない
```

**kaigo1/kaigo2 は minStaff["夜勤"]=1 のため、G-1/NG-2 は実質的に非発動**。  
NSO実装では G-1/NG-2 を後処理バリデーション（cost加算のみ）として簡略化可能。

### 2-6. 疑似コード（実装レベル）

```javascript
function nightSlotOptimizer(nightPool, days, minStaff, maxStaff, lockedDays,
                             prevShift, nightMax, nightExcludeDays, deptWork) {
  const M = minStaff["夜勤"] || 0;
  const halfMid = Math.floor(days / 2);
  const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));

  // ── STEP 1: 実行可能マトリクス ──────────────────────────────────
  // feasible[s.id][d] = true: 制約上配置可能（未配置前提）
  const feasible = {};
  nightPool.forEach(s => {
    feasible[s.id] = {};
    for (let d = 1; d <= days; d++) {
      feasible[s.id][d] = canAssignInitial(s, d, lockedDays, prevShift, deptWork, days);
    }
  });

  // ── STEP 2: 目標回数 ────────────────────────────────────────────
  const totalSlots = days * M;
  const baseCount = Math.floor(totalSlots / nightPool.length);
  const extraCount = totalSlots % nightPool.length;
  const targetCount = {};
  nightPool.forEach((s, i) => { targetCount[s.id] = baseCount + (i < extraCount ? 1 : 0); });

  // ── STEP 3: 日別配置困難度でソート ──────────────────────────────
  const difficulty = {};
  for (let d = 1; d <= days; d++) {
    difficulty[d] = nightPool.filter(s => feasible[s.id][d]).length;
  }
  const dayOrder = Array.from({length: days}, (_, i) => i + 1)
    .sort((a, b) => difficulty[a] - difficulty[b]);

  // ── STEP 4: 配置 ────────────────────────────────────────────────
  const assignment = {};
  nightPool.forEach(s => { assignment[s.id] = new Set(); });
  const dayAssigned = {}; // day → assigned count

  for (const d of dayOrder) {
    dayAssigned[d] = dayAssigned[d] || 0;
    const need = M - dayAssigned[d];
    if (need <= 0) continue;

    const isFirst = d <= halfMid;
    const cands = nightPool.filter(s => {
      if (!feasible[s.id][d]) return false;
      if (assignment[s.id].size >= Math.max(s.nightMax || 5, autoMax)) return false;
      return true;
    });

    // スコアリング: targetCount不足 > 前後半バランス > 間隔
    cands.sort((a, b) => {
      const remA = targetCount[a.id] - assignment[a.id].size;
      const remB = targetCount[b.id] - assignment[b.id].size;
      if (remA !== remB) return remB - remA; // 残り多い（不足）を優先

      const halfGoalA = isFirst
        ? Math.ceil(targetCount[a.id] / 2) - [...assignment[a.id]].filter(dd => dd <= halfMid).length
        : Math.floor(targetCount[a.id] / 2) - [...assignment[a.id]].filter(dd => dd > halfMid).length;
      const halfGoalB = isFirst
        ? Math.ceil(targetCount[b.id] / 2) - [...assignment[b.id]].filter(dd => dd <= halfMid).length
        : Math.floor(targetCount[b.id] / 2) - [...assignment[b.id]].filter(dd => dd > halfMid).length;
      if (halfGoalA !== halfGoalB) return halfGoalB - halfGoalA;

      // 間隔: 最後の夜勤日が古い順
      const lastA = assignment[a.id].size ? Math.max(...assignment[a.id]) : 0;
      const lastB = assignment[b.id].size ? Math.max(...assignment[b.id]) : 0;
      return lastA - lastB;
    });

    const selected = cands.slice(0, need);
    for (const s of selected) {
      assignment[s.id].add(d);
      dayAssigned[d] = (dayAssigned[d] || 0) + 1;
      // feasible マトリクス更新（d-1, d+1, d+2 の制約伝播）
      propagateConstraints(s.id, d, feasible, nightPool, days, deptWork);
    }
  }

  // ── STEP 5: Hill-climbing リファイン ────────────────────────────
  let bestCost = computeCost(assignment, nightPool, days, halfMid, M);
  for (let iter = 0; iter < 100; iter++) {
    const [s1, s2] = randomPair(nightPool);
    const d1 = randomFrom(assignment[s1.id]);
    const d2 = randomFrom(assignment[s2.id]);
    if (!d1 || !d2 || d1 === d2) continue;
    // Swap: s1のd1とs2のd2を入れ替え
    if (canSwap(s1, s2, d1, d2, feasible, assignment)) {
      trySwap(s1, s2, d1, d2, assignment);
      const newCost = computeCost(assignment, nightPool, days, halfMid, M);
      if (newCost < bestCost) { bestCost = newCost; }
      else { trySwap(s2, s1, d2, d1, assignment); } // ロールバック
    }
  }

  return assignment;
}
```

### 2-7. res[] への展開（既存コードとの統合）

```javascript
// NSO実行後、assignment を res[] と lockedDays に書き込む
for (const s of nightPool) {
  for (const d of assignment[s.id]) {
    if (res[s.id][d] && res[s.id][d] !== '夜勤') continue; // 既存値保護
    res[s.id][d] = '夜勤';
    if (d + 1 <= days) res[s.id][d + 1] = '明け';
    if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = '休み';
    lockedDays[s.id].add(d);
    if (d + 1 <= days) lockedDays[s.id].add(d + 1);
  }
}
// 以降の PassA・PassB・PassC は変更なし
```

---

## 3. 現方式との構造的違い

| 項目 | 現方式（逐次貪欲） | Night Slot Optimizer |
|------|------------------|----------------------|
| 処理方向 | d=1 → days（時系列一方向） | 困難日優先（制約強い日から）|
| 将来情報 | 使用しない | feasible マトリクスで全日可視化 |
| ロールバック | なし | hill-climbing で局所改善 |
| 目標値 | なし（autoMax上限のみ）| targetCount / targetFirst / targetSecond を明示 |
| 前後半制御 | halfCount二次キー（v3）→効果あるが副作用あり | targetFirst/Second を事前計算して逆算配置 |
| アンカーとの関係 | アンカー後に残余を貪欲 | アンカー配置済み日を feasible=false として初期反映 |
| G-1/NG-2 | スロット単位動的判定 | 後処理バリデーション（minStaff=1では実質不要）|
| shortage 対処 | フォールバック（autoMax除外） | difficulty-first で shortage 発生を事前回避 |

---

## 4. 実装計画

### 4-1. 変更範囲（最小限）

```
変更対象: autoGenerate 内 ステップ2（L1161-1241）のみ
変更禁止: ステップ1.5・PassA・PassB・PassC・RepairEngine・scoreShifts・bestOfN
インターフェース: res[] / lockedDays への書き込み形式は現行と同一
```

### 4-2. 実装ステップ

```
1. canAssignInitial()  関数を追加（feasible 初期化用）
2. propagateConstraints() 関数を追加（制約伝播）
3. computeCost() 関数を追加（最適化コスト計算）
4. nightSlotOptimizer() 本体を追加
5. ステップ2の for(d=1..days) ループを NSO 呼び出しに置換
```

### 4-3. 検証計画

```
旧（count-only） vs Step2最終（v3） vs Step3（アンカー均等）vs Step4（NSO）
同一乱数 × 100試行
比較項目: 夜勤回数σ・前後半偏差・間隔σ・shortage・Repair・生成時間
採用条件:
  ① 3指標すべて有意改善（p<0.05以上）
  ② shortage ≤ 旧
  ③ 生成時間増加 < 50%（bestOfN 30試行全体で許容範囲内）
```

---

## 5. 最終回答

### ① 現方式との違い

**本質的な違いは「局所決定 vs 大域最適化」。**

現方式は d=1 から順に「今日の最善」を選択する。NSO は全30日のスロットを同時に考慮し、「月全体の最善配置」を求める。これにより：

- 前半で使いすぎた候補が後半に不足する問題を根本解消
- 目標回数（targetCount）を事前に設定して逆算配置するため、count equityを制約として保証できる
- 前後半目標（targetFirst/Second）を明示的に設定するため、比較関数の副作用なしに前後半均等を達成できる

### ② 実装難易度

**中〜高。**

- feasible マトリクス: 低（単純な制約チェック）
- 困難日優先ソート: 低
- targetCount 逆算: 低
- propagateConstraints: 中（制約伝播のロジックが現方式より複雑）
- hill-climbing リファイン: 中
- 既存コードとの統合テスト: 高（G-1/NG-2・アンカー・lockedDays との整合確認が必要）

総合: 1〜2週の実装・テスト期間を想定。

### ③ 生成速度への影響

**軽微（許容範囲内）。**

- feasible マトリクス構築: O(N×D) = 5×30 = 150演算（無視できる）
- 困難日ソート: O(D log D)（無視できる）
- hill-climbing 100回: O(100 × N × D) = 15,000演算（< 1ms）
- 現方式の for(d) ループ: O(D × N × D) = 4,500演算（comparable）

bestOfN 30試行全体への影響: **+5〜10ms 程度**（許容範囲）

### ④ 改善期待度

**高（★★★）。**

Step2（v3）が達成した前後半改善（-53%）を、**count equityへの副作用なしに実現できる見込みが高い**。

理由:
- count equity はtargetCountを等分することで保証（ハード制約化）
- 前後半均等はtargetFirst/Secondで事前設定（比較関数の副作用なし）
- 間隔均等はスコアリング三次キーで引き続き考慮

Step2の問題（count σ微増）とStep3の問題（アンカー順序の効果なし）を同時に解消できる可能性がある。

### ⑤ Step4だけで完結するか、Phase6が必要か

**Step4単独で完結する可能性が高い。**

NSO が正常に機能すれば：
- 夜勤回数均等: ✅ targetCount でハード保証
- 前後半均等: ✅ targetFirst/Second で事前設計
- 間隔均等: ✅ スコアリングで最適化

ただし以下の場合は Phase6 が必要になる：
- G-1/NG-2 制約が強い部署（minStaff["夜勤"] ≥ 2）での動作
- nightPool 数が少なく実行不可能解が多発する場合の backtracking 深度問題
- bestOfN との組み合わせでの多様性確保（NSO が収束しすぎると bestOfN の探索が同質化）

kaigo1/kaigo2 の現構成（minStaff=1, nightPool=5）では Phase6 不要と見込まれる。
