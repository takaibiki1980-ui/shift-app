# Night Slot Optimizer 設計書 v2
## Phase5 Step4 — レビュー指摘全項目解消版

作成日: 2026-06-30  
前版: docs/NIGHT_SLOT_OPTIMIZER_DESIGN.md  
レビュー: docs/NIGHT_SLOT_OPTIMIZER_REVIEW.md  
対象: src/App.jsx — autoGenerate 内 ステップ2（L1161-1241）  
コード変更: **なし（設計書のみ）**

---

## 0. v1 からの変更点サマリ

| # | 指摘 | v1 の問題 | v2 での解決 |
|---|------|-----------|------------|
| 問題1 | C3制約×困難日優先の矛盾 | feasible を静的初期化しC3も含めた状態で困難日優先配置 → 前日未配置でC3チェック不正確 | canAssignInitial から C3を除外。C3は propagateConstraints で動的更新 |
| 問題2 | アンカー分 targetCount 誤算 | `assignment[s.id] = new Set()` から開始しアンカー配置済み夜勤をカウントしない | 初期化時にアンカー配置済み夜勤を assignment に取り込み、残余スロットで targetCount を再計算 |
| 問題3 | lockedDays 追加の差異 | NSO の res[] 書き込みで `lockedDays.add(d)` を追加する設計 → 現行ステップ2と異なる | ステップ2は lockedDays に追加しない（現行通り）。NSO も同様にしない |
| 問題4 | 未定義関数 | canAssignInitial/propagateConstraints/canSwap/computeCost の仕様が未定義 | 本書で全関数の引数・戻り値・責務を定義 |
| 問題5 | dayOrder の陳腐化 | difficulty を一回だけ計算し、配置が進んでも更新しない | 近似として初期計算で固定（理由は §3-3 参照）|

---

## 1. 前提：現行コードの確認事項

### 1-1. ステップ2が lockedDays に追加しないことの確認

現行ステップ2（L1233-1238）:
```javascript
res[s.id][d] = "夜勤";
if (d + 1 <= days) res[s.id][d + 1] = "明け";
if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
_lastNightDay[s.id] = d;
// ← lockedDays への追加なし
```

PassA（L1405-）は `res[s.id]` を直接参照し、`lockedDays` は参照しない。  
→ ステップ2が lockedDays に追加しなくても PassA 以降は正常動作する。  
→ **NSO も lockedDays への追加は行わない**（現行と完全互換）。

ただし **NSO 内部の feasible 管理には assignment オブジェクト（Set）を使う**。  
lockedDays は変更しないが、NSO 内部では「自分が配置した日」を assignment で追跡する。

### 1-2. G-1/NG-2 は kaigo1/2 では非発動の確認

現行コード（L1211-1231）:
```javascript
// NG-2: その日に low-NR が既に夜勤中なら low-NR 候補を除外（low+low 禁止）
if (ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤')) { ... }
// G-1: 外国人夜勤者がいてサポーター未配置なら非外国人を優先ソート
const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
```

いずれも「同一日に複数の夜勤者がいるとき」に発動。  
kaigo1/2 は `minStaff["夜勤"] = 1` のため、同日夜勤は1名のみ → **G-1/NG-2は実質非発動**。  
NSO では G-1/NG-2 を後処理バリデーション（shortage ペナルティに類する扱い）として記録するのみ。

---

## 2. レビュー指摘への回答

### ① C3制約と困難日優先の矛盾をどう解消するか

**方針: canAssignInitial を「静的制約のみ」に限定する。C3は propagateConstraints で管理する。**

C3（前日が夜勤/明けなら不可）は配置状態に依存する動的制約であり、  
困難日優先で d=15 を先に処理するときは d=14 がまだ未配置なので静的評価が不可能。

解決策:

```
canAssignInitial（静的）: C1, C2, C4, C5 のみ評価（ロック日・クロスフロア・翌日翌々日の固定制約）
feasible[s][d] 初期値: canAssignInitial の結果（C3は全員 true で初期化）

配置ループ（STEP 4）内:
  d 日に s を配置するとき:
    ① assignment[s.id].has(d) は false であることを確認（二重配置防止）
    ② feasible[s.id][d] が true であることを確認（静的制約クリア）
    ③ checkC3(s, d, assignment) を都度チェック（C3動的チェック）
    ④ 配置確定後 → propagateConstraints(s.id, d, ...) で隣接日の feasible を更新

checkC3(s, d, assignment):
  → d-1 が assignment[s.id] に含まれるか、
    または アンカー配置で res[s.id][d-1] が "夜勤"/"明け" であるか を確認
  → true → C3違反 → この日は配置不可
```

**効果**: feasible[s][d] は C1/C2/C4/C5（静的制約）の事前フィルタとして機能し、  
C3は配置ループ内で毎回 `checkC3` でチェックする。  
困難日優先であっても、前日の配置状態は `assignment` オブジェクトで正確に参照できる。

---

### ② アンカー分を含めた targetCount の算出方法

アンカー配置（Step1.5）済みの夜勤は `res[s.id][d] === "夜勤"` かつ  
`lockedDays[s.id].has(d) === true` で識別できる。

```javascript
// STEP 1 の前: アンカー配置済み夜勤を assignment の初期値に取り込む
nightPool.forEach(s => {
  const anchorNights = Object.entries(res[s.id])
    .filter(([d, v]) => v === '夜勤' && lockedDays[s.id].has(Number(d)))
    .map(([d]) => Number(d));
  assignment[s.id] = new Set(anchorNights);
});

// STEP 2 の targetCount 計算
const totalSlots = days * M;
const anchorTotal = nightPool.reduce((acc, s) => acc + assignment[s.id].size, 0);
const remainingSlots = totalSlots - anchorTotal;

// 残余スロットを nightPool に均等配分
const baseCount = Math.floor(remainingSlots / nightPool.length);
const extraCount = remainingSlots % nightPool.length;

// 最終的な targetCount = アンカー配置数 + 残余配分
nightPool.forEach((s, i) => {
  targetCount[s.id] = assignment[s.id].size + baseCount + (i < extraCount ? 1 : 0);
});
```

**効果**: アンカーで既に多く配置されたスタッフは targetCount が増えず過剰配置にならない。  
残余スロットのみを NSO が担当し、アンカー分はカウント済みとして扱う。

---

### ③ lockedDays の扱いを現行と完全互換にする方法

**方針: NSO は res[] と lockedDays を以下の通り変更する（現行ステップ2と同一）。**

```javascript
// NSO 実行後の res[] 書き込み（ステップ2と同一形式）
for (const s of nightPool) {
  for (const d of assignment[s.id]) {
    if (assignment[s.id].has(d) && lockedDays[s.id].has(d)) continue; // アンカー済みスキップ
    if (res[s.id][d] && res[s.id][d] !== '夜勤') continue; // 既存値保護
    res[s.id][d] = '夜勤';
    if (d + 1 <= days) res[s.id][d + 1] = '明け';
    if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = '休み';
    // lockedDays への追加なし（現行ステップ2と同一）
  }
}
```

**変更点**: v1 設計書の `lockedDays[s.id].add(d)` を削除。現行ステップ2と完全同一。  
NSO 内部では `assignment[s.id]` で配置済み日を管理するため、lockedDays は不要。

---

### ④ canAssignInitial の責務

**責務: 配置状態に依存しない「静的制約」のみを評価する。**

```javascript
/**
 * canAssignInitial(s, d, lockedDays, prevShift, deptWork, days)
 *
 * 静的制約のみ評価（配置前に一度だけ計算できる制約）
 * C1: nightExcludeDays に d が含まれるか（クロスフロア禁止日）
 * C2: lockedDays[s.id] に d が含まれるか（希望休・有休・アンカー固定）
 * C4: lockedDays[s.id] に d+1 が含まれ、res[s.id][d+1] が "明け" でない
 *     → 翌日が明け以外のロック済み日 → 明けを入れられない
 * C5: lockedDays[s.id] に d+2 が含まれ、res[s.id][d+2] が deptWork に含まれる
 *     → 夜勤→明け→固定勤務 になる → 配置不可
 *
 * C3（前日夜勤/明け禁止）は評価しない。→ checkC3 / propagateConstraints で管理。
 *
 * @returns {boolean} true = 静的制約をクリア（C3は別途チェック必要）
 */
function canAssignInitial(s, d, lockedDays, prevShift, res, deptWork, days) {
  if (s.nightExcludeDays?.has(d)) return false;                            // C1
  if (lockedDays[s.id].has(d)) return false;                               // C2
  if (d + 1 <= days
      && lockedDays[s.id].has(d + 1)
      && res[s.id][d + 1] !== '明け') return false;                        // C4
  if (d + 2 <= days
      && lockedDays[s.id].has(d + 2)
      && deptWork.has(res[s.id][d + 2])) return false;                     // C5
  return true;
}
```

**意図的に除外した制約**:
- C3（前日夜勤/明け）: 配置が進まないと確定しない → checkC3 で動的評価
- C6（autoMax上限）: targetCount に基づくソフト制約 → 配置ループのフィルタで評価

---

### ⑤ propagateConstraints の責務

**責務: d 日に s を配置確定した後、隣接日の feasible を更新して C3 伝播を実現する。**

```javascript
/**
 * propagateConstraints(staffId, d, feasible, nightPool, days)
 *
 * d 日に staffId を夜勤配置確定した後に呼ぶ。
 * C3伝播: d 日が夜勤になると d+1 日は明け（夜勤不可）になる。
 *         → 同じスタッフの feasible[staffId][d+1] を false に更新。
 *         → d 日に夜勤が入ると d-1 日に後から夜勤を入れることも不可になる
 *           （困難日優先では d-1 が後処理になることがある）。
 *         → 同じスタッフの feasible[staffId][d-1] も false に更新。
 *
 * C4/C5 の動的更新:
 *   d+1 に明けが確定するため、他のスタッフから見た「翌日明けロック」相当が発生。
 *   ただし明けは res[s.id][d+1] に書き込まれるのは最終書き込み時のみ。
 *   NSO 内では「assignment に d が含まれる = d+1 は明け確定」として扱う。
 *   → checkC4Dynamic(s, d+1, assignment) で参照。
 */
function propagateConstraints(staffId, d, feasible, nightPool, days) {
  // C3 順方向: d+1 は明けになるので、同スタッフは d+1 に夜勤不可
  if (d + 1 <= days) {
    feasible[staffId][d + 1] = false;
  }
  // C3 逆方向: d が夜勤になったので、同スタッフは d-1 に後から夜勤不可
  if (d - 1 >= 1) {
    feasible[staffId][d - 1] = false;
  }
  // 他スタッフへの影響: なし（夜勤は独立配置。minStaff=1 のため他スタッフに影響しない）
  // ※ minStaff >= 2 の部署では他スタッフへの C4/C5 伝播が必要になる（kaigo1/2 は対象外）
}
```

**注意点**: propagateConstraints は feasible を更新するが、  
dayOrder（困難日優先のソート順）は変更しない（後述 §3-3 参照）。

---

### ⑥ canSwap の責務

**責務: s1 の nightDay d1 と s2 の nightDay d2 を入れ替えたときに全制約をクリアするか確認する。**

```javascript
/**
 * canSwap(s1, s2, d1, d2, assignment, lockedDays, res, deptWork, days)
 *
 * Swap の対象:
 *   s1 の d1（夜勤）↔ s2 の d2（夜勤）を入れ替える
 *   → s1 が d2 に、s2 が d1 に配置されることになる
 *
 * チェック内容:
 *   A. s1 が d2 に配置できるか（d2 は s2 の夜勤なので「空き日扱い」で確認）
 *      - canAssignInitial(s1, d2, ...) → C1/C2/C4/C5 静的制約
 *      - checkC3(s1, d2, assignmentAfterRemoveD1) → s1から d1 を除いた状態でC3チェック
 *      - targetCount[s1.id] の上限を超えないか（swap では総数不変なので常に OK）
 *
 *   B. s2 が d1 に配置できるか（s2 から d2 を除いた状態で確認）
 *      - canAssignInitial(s2, d1, ...) → C1/C2/C4/C5 静的制約
 *      - checkC3(s2, d1, assignmentAfterRemoveD2) → s2から d2 を除いた状態でC3チェック
 *
 *   C. Swap 後に同日夜勤二重配置が起きないか
 *      → d1 == d2 の場合は swap 無意味 → false を返す
 *      → 通常 s1 != s2 かつ d1 != d2 なので問題なし
 *
 * @returns {boolean} true = swap 可能
 */
function canSwap(s1, s2, d1, d2, assignment, lockedDays, res, deptWork, days) {
  if (d1 === d2) return false;
  if (s1.id === s2.id) return false; // 同一スタッフ内のMoveはcanMoveで別途処理

  // s1 の d1 を外した状態の assignment を仮想的に作成
  const a1without = new Set(assignment[s1.id]); a1without.delete(d1);
  const a2without = new Set(assignment[s2.id]); a2without.delete(d2);

  // A: s1 が d2 に入れられるか
  if (!canAssignInitial(s1, d2, lockedDays, null, res, deptWork, days)) return false;
  if (checkC3(s1, d2, a1without, res, lockedDays)) return false; // C3違反

  // B: s2 が d1 に入れられるか
  if (!canAssignInitial(s2, d1, lockedDays, null, res, deptWork, days)) return false;
  if (checkC3(s2, d1, a2without, res, lockedDays)) return false; // C3違反

  return true;
}

/**
 * checkC3(s, d, assignmentSet, res, lockedDays)
 *
 * C3: d-1 が夜勤/明けであれば d に配置不可。
 *
 * 判定順序:
 *   1. assignmentSet に d-1 が含まれる → 「夜勤予定」→ 明け確定 → C3違反
 *   2. res[s.id][d-1] が "夜勤" または "明け" → C3違反（アンカー配置または前月繰り越し）
 *   3. d === 1 かつ prevShift(s.id) が "夜勤"/"明け" → C3違反
 *
 * @returns {boolean} true = C3違反（配置不可）
 */
function checkC3(s, d, assignmentSet, res, lockedDays, prevShiftFn, days) {
  if (d === 1) {
    const prev = prevShiftFn?.(s.id);
    if (prev === '夜勤' || prev === '明け') return true;
    return false;
  }
  // NSO 内部の assignment を参照（d-1 が配置済み）
  if (assignmentSet.has(d - 1)) return true;
  // res[] の既確定値を参照（アンカー配置・前日明け等）
  const prevVal = res[s.id][d - 1];
  if (prevVal === '夜勤' || prevVal === '明け') return true;
  return false;
}
```

---

### ⑦ difficulty-first の再計算タイミング

**方針: 初期計算値を「近似」として固定する（配置ごとの再計算は行わない）。**

**理由**:

```
① kaigo1/2 の実構成は nightPool=5名, days=30日, minStaff["夜勤"]=1
   → 合計夜勤スロット 30個, 1スタッフあたり平均6回
   → 1配置による difficulty 変化は最大1（feasible 数が1減るだけ）
   → 変化量が小さく、再計算コストと効果が釣り合わない

② 困難日優先の主な目的は「制約が厳しい日（feasible候補が少ない日）を先に処理し
   shortage 発生を防ぐこと」
   → 初期feasible計算でも「C1/C2/C4/C5で候補ゼロの日」は正確に識別できる
   → C3制約による difficulty 変化は配置後に propagateConstraints で対処済み

③ 動的再計算が効果を発揮するのは nightPool >= 10名・minStaff >= 2 の複雑部署
   → kaigo1/2 の現構成では over-engineering になる

④ 実装の複雑度を下げ、Phase4-A〜C のデバッグを容易にする
```

**将来的な拡張性**: minStaff >= 2 の部署に対応する場合は、  
配置ごとに `difficulty[d]` を1減らす差分更新（O(1)）で動的化できる。  
現時点では静的近似で十分。

---

## 3. Night Slot Optimizer 全体フロー（修正版）

### 3-1. 関数シグネチャ

```javascript
/**
 * nightSlotOptimizer(params)
 *
 * 夜勤スロット全体最適化。ステップ2の for(d=1..days) ループを置換する。
 *
 * @param {Object} params
 *   nightPool    : スタッフ配列（nightOk && _nightAllowed のみ）
 *   days         : 月の日数
 *   minStaff     : dept.minStaff（{"夜勤": 1, ...}）
 *   maxStaff     : dept.maxStaff（{"夜勤": 1, ...}）
 *   res          : シフト配列（参照渡し。アンカー配置済み）
 *   lockedDays   : Map<staffId, Set<day>>（参照渡し。変更しない）
 *   prevShiftFn  : (staffId) => string | null（前月末シフト）
 *   deptWork     : Set<shiftType>（勤務系シフトの集合）
 *   nightMax     : スタッフごとの月間夜勤上限（s.nightMax）
 *
 * @returns {void} res[] を直接更新する（現行ステップ2と同一インターフェース）
 */
function nightSlotOptimizer({ nightPool, days, minStaff, maxStaff, res,
                               lockedDays, prevShiftFn, deptWork, nightMax }) {
```

### 3-2. 完全フロー（修正版）

```javascript
  const M = minStaff['夜勤'] || 0;
  if (M === 0 || nightPool.length === 0) return;
  const halfMid = Math.floor(days / 2);
  const autoMax = Math.ceil(days / nightPool.length);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 0: アンカー配置済み夜勤を assignment に取り込む
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // lockedDays.has(d) かつ res[s.id][d]==="夜勤" → Step1.5 のアンカー配置
  const assignment = {};
  nightPool.forEach(s => {
    const anchorNights = Object.entries(res[s.id])
      .filter(([d, v]) => v === '夜勤' && lockedDays[s.id].has(Number(d)))
      .map(([d]) => Number(d));
    assignment[s.id] = new Set(anchorNights);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: 静的 feasible マトリクス構築（C3 を除く）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const feasible = {};
  nightPool.forEach(s => {
    feasible[s.id] = {};
    for (let d = 1; d <= days; d++) {
      // C3 は除外（動的に checkC3 で評価）
      feasible[s.id][d] = canAssignInitial(s, d, lockedDays, prevShiftFn, res, deptWork, days);
    }
  });
  // アンカー配置済み日は feasible=false かつ隣接日も伝播済みにする
  nightPool.forEach(s => {
    for (const d of assignment[s.id]) {
      feasible[s.id][d] = false;           // 既配置日
      propagateConstraints(s.id, d, feasible, nightPool, days);  // C3伝播
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: 目標回数計算（アンカー分を差し引いた残余スロット）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const totalSlots = days * M;
  const anchorTotal = nightPool.reduce((acc, s) => acc + assignment[s.id].size, 0);
  const remainingSlots = totalSlots - anchorTotal;

  const baseRemain = Math.floor(remainingSlots / nightPool.length);
  const extraRemain = remainingSlots % nightPool.length;
  const targetCount = {};
  nightPool.forEach((s, i) => {
    targetCount[s.id] = assignment[s.id].size + baseRemain + (i < extraRemain ? 1 : 0);
  });

  // 前後半目標（アンカー分を考慮）
  const targetFirst = {}, targetSecond = {};
  nightPool.forEach(s => {
    const anchorFirst  = [...assignment[s.id]].filter(d => d <= halfMid).length;
    const anchorSecond = assignment[s.id].size - anchorFirst;
    const remainTarget = targetCount[s.id] - assignment[s.id].size;
    const remainFirst  = Math.ceil(remainTarget / 2);
    const remainSecond = remainTarget - remainFirst;
    targetFirst[s.id]  = anchorFirst  + remainFirst;
    targetSecond[s.id] = anchorSecond + remainSecond;
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: 困難日優先 dayOrder（静的近似・一回計算）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // C3を除いた静的制約のみで feasible 数を計算（近似）
  const difficulty = {};
  for (let d = 1; d <= days; d++) {
    difficulty[d] = nightPool.filter(s => feasible[s.id][d]).length;
  }
  const dayOrder = Array.from({ length: days }, (_, i) => i + 1)
    .sort((a, b) => difficulty[a] - difficulty[b]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4: 配置ループ（困難日優先）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const dayAssigned = {};  // d → 配置済み夜勤人数
  // アンカー配置分を dayAssigned に反映
  nightPool.forEach(s => {
    for (const d of assignment[s.id]) {
      dayAssigned[d] = (dayAssigned[d] || 0) + 1;
    }
  });

  for (const d of dayOrder) {
    const alreadyCount = dayAssigned[d] || 0;
    const need = M - alreadyCount;
    if (need <= 0) continue;

    const isFirst = d <= halfMid;

    // 候補者フィルタ: 静的制約 + C3動的チェック + targetCount上限
    let cands = nightPool.filter(s => {
      if (!feasible[s.id][d]) return false;                      // C1/C2/C4/C5
      if (checkC3(s, d, assignment[s.id], res, lockedDays, prevShiftFn, days)) return false; // C3
      if (assignment[s.id].size >= Math.max(s.nightMax || 5, autoMax)) return false; // C6
      return true;
    });

    // フォールバック: targetCount 未達でなければ候補なし → 上限無視で再試行
    if (cands.length < need) {
      const fallbackCands = nightPool.filter(s => {
        if (!feasible[s.id][d]) return false;
        if (checkC3(s, d, assignment[s.id], res, lockedDays, prevShiftFn, days)) return false;
        return true;
      });
      if (fallbackCands.length > 0) cands = fallbackCands;
    }

    // スコアリング: ① targetCount残り降順 → ② 前後半バランス → ③ 最終夜勤日昇順
    cands.sort((a, b) => {
      const remA = targetCount[a.id] - assignment[a.id].size;
      const remB = targetCount[b.id] - assignment[b.id].size;
      if (remA !== remB) return remB - remA;  // 残り多い（不足）を優先

      // 前後半バランス: 当日の半月に対する「残り目標数」が多いスタッフを優先
      const halfRemA = isFirst
        ? targetFirst[a.id]  - [...assignment[a.id]].filter(dd => dd <= halfMid).length
        : targetSecond[a.id] - [...assignment[a.id]].filter(dd => dd > halfMid).length;
      const halfRemB = isFirst
        ? targetFirst[b.id]  - [...assignment[b.id]].filter(dd => dd <= halfMid).length
        : targetSecond[b.id] - [...assignment[b.id]].filter(dd => dd > halfMid).length;
      if (halfRemA !== halfRemB) return halfRemB - halfRemA;

      // 最終夜勤日が古い（間隔が長い）スタッフを優先
      const lastA = assignment[a.id].size ? Math.max(...assignment[a.id]) : 0;
      const lastB = assignment[b.id].size ? Math.max(...assignment[b.id]) : 0;
      return lastA - lastB;
    });

    const selected = cands.slice(0, need);
    for (const s of selected) {
      assignment[s.id].add(d);
      dayAssigned[d] = (dayAssigned[d] || 0) + 1;
      feasible[s.id][d] = false;  // 自分自身は配置済み
      propagateConstraints(s.id, d, feasible, nightPool, days);  // C3伝播
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 5: Hill-climbing リファイン（100イテレーション）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  let bestCost = computeCost(assignment, targetCount, targetFirst, targetSecond, nightPool, halfMid);

  for (let iter = 0; iter < 100; iter++) {
    // ランダムなスタッフペアと夜勤日を選択
    const idx1 = Math.floor(Math.random() * nightPool.length);
    let idx2 = Math.floor(Math.random() * nightPool.length);
    if (idx2 === idx1) idx2 = (idx1 + 1) % nightPool.length;
    const s1 = nightPool[idx1], s2 = nightPool[idx2];

    const nights1 = [...assignment[s1.id]];
    const nights2 = [...assignment[s2.id]];
    if (nights1.length === 0 || nights2.length === 0) continue;

    const d1 = nights1[Math.floor(Math.random() * nights1.length)];
    const d2 = nights2[Math.floor(Math.random() * nights2.length)];

    // アンカー配置日は swap しない（ロック保護）
    if (lockedDays[s1.id].has(d1) || lockedDays[s2.id].has(d2)) continue;

    if (canSwap(s1, s2, d1, d2, assignment, lockedDays, res, deptWork, days,
                prevShiftFn)) {
      // Swap 実行
      assignment[s1.id].delete(d1); assignment[s1.id].add(d2);
      assignment[s2.id].delete(d2); assignment[s2.id].add(d1);

      const newCost = computeCost(assignment, targetCount, targetFirst, targetSecond,
                                   nightPool, halfMid);
      if (newCost < bestCost) {
        bestCost = newCost;  // 採用
      } else {
        // ロールバック
        assignment[s1.id].delete(d2); assignment[s1.id].add(d1);
        assignment[s2.id].delete(d1); assignment[s2.id].add(d2);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 6: res[] への書き込み（lockedDays は変更しない）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  for (const s of nightPool) {
    for (const d of assignment[s.id]) {
      // アンカー配置済みはスキップ（既に res[] に書き込まれている）
      if (lockedDays[s.id].has(d)) continue;
      // 既存値保護（他ルートで配置済みの場合）
      if (res[s.id][d] && res[s.id][d] !== '夜勤') continue;
      // 現行ステップ2と同一形式で書き込み
      res[s.id][d] = '夜勤';
      if (d + 1 <= days) res[s.id][d + 1] = '明け';
      if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = '休み';
      // lockedDays への追加なし（現行ステップ2と同一）
    }
  }
}
```

### 3-3. computeCost の定義

```javascript
/**
 * computeCost(assignment, targetCount, targetFirst, targetSecond, nightPool, halfMid)
 *
 * コスト = CountEquity コスト + HalfBalance コスト + IntervalEquity コスト
 *
 * CountEquity: Σ_s (actual[s] - targetCount[s])²
 *   → targetCount からの偏差の二乗和（小さいほど均等）
 *
 * HalfBalance: Σ_s (|actualFirst[s] - targetFirst[s]| + |actualSecond[s] - targetSecond[s]|)
 *   → 前後半目標からの絶対偏差和
 *
 * IntervalEquity: Σ_s σ(intervals[s])（実装を簡略化するため分散で近似）
 *   → 夜勤間隔の分散の和（小さいほど均等）
 *
 * 重み: CountEquity × 100 + HalfBalance × 50 + IntervalEquity × 10
 */
function computeCost(assignment, targetCount, targetFirst, targetSecond, nightPool, halfMid) {
  let countCost = 0, halfCost = 0, intervalCost = 0;

  for (const s of nightPool) {
    const nights = [...assignment[s.id]].sort((a, b) => a - b);
    const actual = nights.length;
    const actualFirst  = nights.filter(d => d <= halfMid).length;
    const actualSecond = actual - actualFirst;

    countCost += (actual - targetCount[s.id]) ** 2;
    halfCost  += Math.abs(actualFirst  - targetFirst[s.id])
               + Math.abs(actualSecond - targetSecond[s.id]);

    // 間隔分散
    if (nights.length >= 2) {
      const intervals = [];
      for (let i = 1; i < nights.length; i++) intervals.push(nights[i] - nights[i - 1]);
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / intervals.length;
      intervalCost += variance;
    }
  }

  return countCost * 100 + halfCost * 50 + intervalCost * 10;
}
```

---

## 4. 実装計画（修正版）

### 4-1. Phase4-A: 基盤関数 + C3問題の解決検証

```
実装対象（App.jsx に追記、既存ステップ2は変更しない）:
  canAssignInitial(s, d, lockedDays, prevShiftFn, res, deptWork, days)
  checkC3(s, d, assignmentSet, res, lockedDays, prevShiftFn, days)
  propagateConstraints(staffId, d, feasible, nightPool, days)
  canSwap(s1, s2, d1, d2, assignment, lockedDays, res, deptWork, days, prevShiftFn)
  computeCost(assignment, targetCount, targetFirst, targetSecond, nightPool, halfMid)

検証スクリプト（Node.js）:
  canAssignInitial の出力 == 現行 canNight の出力（C3を除く）
  checkC3 が現行 canNight の C3条件と等値であるか
  propagateConstraints 後の feasible が期待値と一致するか
  canSwap が明らかな不正配置を false で返すか

完了条件:
  5関数すべてのユニットテストが通過
  特に「checkC3が前日アンカー夜勤を正確に検出できるか」を確認
```

### 4-2. Phase4-B: feasible matrix + targetCount 検証

```
実装対象:
  nightSlotOptimizer の STEP 0, 1, 2 のみ（配置ループなし）
  STEP 0〜2 終了後に console.log でデバッグ出力

検証:
  anchorNights が実際のアンカー配置と一致するか
  feasible[s][d] が アンカー日・隣接日で false になっているか
  targetCount の合計 == totalSlots になっているか
  targetFirst + targetSecond == targetCount になっているか

完了条件: 問題2が解消され、over/under 配置が起きないことを確認
```

### 4-3. Phase4-C: difficulty-first 配置ループ（Hill-climbing なし）

```
実装対象:
  STEP 3, 4（STEP 5 スキップ）
  STEP 6 の res[] 書き込み

検証: シミュレーションスクリプト 100試行
  比較: ①旧アルゴリズム vs ②Phase4-C
  指標: 夜勤回数σ, 前後半偏差, shortage, 生成時間

完了条件:
  shortage ≤ 旧アルゴリズム
  夜勤回数σ ≤ 旧 + 0.010（有意な悪化なし）
```

### 4-4. Phase4-D: Hill-climbing リファイン追加

```
実装対象:
  STEP 5（canSwap + computeCost を使った Swap リファイン）

検証: 100試行比較 ①旧 vs ③Phase4-D
  前後半偏差が Phase4-C から改善されるか確認

完了条件:
  前後半偏差が旧より改善（目標: p<0.05 で有意改善）
  夜勤回数σが旧を大幅に超えない
```

### 4-5. Phase4-E: 既存ステップ2の完全置換

```
実装対象:
  ステップ2の for(d=1..days) ループを nightSlotOptimizer() 呼び出しに置換
  旧コードをコメントアウト（切り戻し用）

検証: 4パターン 100試行比較
  ①旧 vs ②Step2最終(v3) vs ③Step3(アンカー均等) vs ④Phase4-E(NSO)

採用条件:
  A. 夜勤回数σ: 旧以下（または差異が統計的有意でない）
  B. 前後半偏差: -30%以上改善（p<0.05）
  C. shortage: 旧以下
  D. 生成時間増加: < 50%
  採用基準 A〜D がすべて満たされる場合のみ mainマージを検討
```

---

## 5. 最終回答

### ① レビュー指摘事項はすべて解消できたか

**はい、5項目すべて解消。**

| 問題 | 解消方法 | 状態 |
|------|---------|------|
| 問題1: C3×困難日優先の矛盾 | canAssignInitial から C3を除外。checkC3 + propagateConstraints で動的管理 | ✅ 解消 |
| 問題2: アンカー分targetCount誤算 | STEP 0 でアンカー配置済み夜勤を assignment に取り込み残余スロットで再計算 | ✅ 解消 |
| 問題3: lockedDays 差異 | NSO も lockedDays に追加しない（現行ステップ2と完全同一）| ✅ 解消 |
| 問題4: 未定義関数 | canAssignInitial/checkC3/propagateConstraints/canSwap/computeCost を完全定義 | ✅ 解消 |
| 問題5: dayOrder 陳腐化 | 静的近似として一回計算で固定（理由を明記）| ✅ 方針確定 |

### ② 未解決事項はあるか

**軽微な1点のみ**: minStaff["夜勤"] >= 2 の部署での他スタッフへの C4/C5 伝播。  
kaigo1/2 は minStaff=1 のため **現在は未解決のままで安全**。  
将来対応する場合は propagateConstraints の拡張が必要（本書の注意点に記載済み）。

### ③ Phase4-A から実装開始して安全か

**安全。**

Phase4-A は「新関数の追加のみ」であり、既存のステップ2に一切触れない。  
既存コードは完全に動作し続ける。新関数を追加後、独立したシミュレーションスクリプトで  
正確性を検証してから Phase4-B 以降に進む設計なので、デグレードリスクはない。

### ④ 実装順序

```
Phase4-A（基盤）→ Phase4-B（STEP 0-2）→ Phase4-C（STEP 3-4）→ Phase4-D（STEP 5）→ Phase4-E（置換）
```

**この順序で問題ない。**

理由:
1. Phase4-A が完了しないと Phase4-B 以降が検証不可能（基盤関数に依存）
2. Phase4-B で targetCount/feasible が正確でないと Phase4-C の配置が無意味
3. Phase4-C で配置ループが shortage なく動作することを確認後、Phase4-D でリファイン追加
4. Phase4-D の Hill-climbing は Phase4-C の assignment を入力とするため依存関係あり
5. Phase4-E（置換）は最後。それまで既存ステップ2は動き続ける

各フェーズは **独立した実行可能なスクリプトで検証** してから次に進む。  
「フェーズ内でデグレードが発覚したら即停止、設計を見直す」が大原則。
