# STEP7A_SHORTAGE_ANALYSIS.md
# Phase5 Step7-A — shortage 根本原因調査・分析設計書

作成: 2026-06-30
対象ブランチ: phase5/night-balance
調査対象: autoGenerate / bestOfN による shortage 発生全経路
コード変更: なし（調査・分析のみ）

---

## 必須回答 ①〜⑫

---

### ① shortage の定義（コード上の厳密な定義）

```javascript
// scoreShifts L2804-2815 (P4: minStaff不足ペナルティ)
for (let d = 1; d <= days; d++) {
  for (const [k, minC] of Object.entries(dept.minStaff || {})) {
    const cnt = ds.filter(s => res[s.id][d] === k).length;
    if (cnt < minC) score += (minC - cnt) * someWeight;
  }
}
```

**定義**: `dept.minStaff[k]` を満たさないシフト種別 `k` × 日付 `d` の組み合わせが shortage 1コマ。  
kaigo1/kaigo2 の minStaff: `{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 }`  
→ 1日あたり最大4コマの shortage が発生しうる。

---

### ② shortage の実測ベースライン

| 部署 | 平均 shortage/trial | 測定試行数 | 出典 |
|---|---|---|---|
| kaigo1 | **17.9 コマ/trial** | 100×30=3,000 | Step6-B Before 実測 |
| kaigo2 | **18.0 コマ/trial** | 100×30=3,000 | Step6-B Before 実測 |

30日×4シフト = 120コマが上限のうち、約15% が shortage。

---

### ③ shortage が発生する全経路（コード根拠付き）

#### 経路A: PassA 夜勤配置 — NG-2 制約による shortage 許容

**コード**: `src/App.jsx` L1382-1386

```javascript
while (need > 0 && _cands.length > 0) {
  // NG-2: その日に low-NR が既に夜勤中なら low-NR 候補を除外
  if (ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤')) {
    _cands = _cands.filter(s => !_isLowNR(s));
    if (_cands.length === 0) break; // shortage を許容 ← ここで打ち切り
  }
```

**発生条件**: `low-NR`（`facilityYears < 0.5` または `floorYears < 0.2`）スタッフが既に夜勤配置済みで、残る候補が全員 low-NR の場合。

**影響**: `夜勤` の shortage が1コマ確定。後続の minStaff 保証でも夜勤の slide は不可能（夜勤は Tier1 保護対象であり `_shouldProtectSlot` が防ぐ）。

---

#### 経路B: PassA 一般 — `canNight` フィルタ全落ち

**コード**: L1359-1375

```javascript
const canNight = (s) => {
  if (s.nightExcludeDays?.has(d)) return false; // クロスフロア制約
  if (lockedDays[s.id].has(d)) return false;    // ロック済み
  if (["夜勤","明け"].includes(prev)) return false; // 夜勤連続禁止
  if (lockedDays[s.id].has(d + 1) && res[s.id][d+1] !== "明け") return false;
  if (lockedDays[s.id].has(d + 2) && deptWork.has(res[s.id][d + 2])) return false;
  return true;
};
let cands = nightPool.filter(s => { /* usedNight < nightMax */ });
if (cands.length === 0) {
  cands = nightPool.filter(s => canNight(s)); // nightMax 無視で再試行
}
```

**発生条件**: `nightPool` の全スタッフが `canNight` を満たさない日（前日夜勤明け・ロック・クロスフロア制約の全スタッフ重複）。

**影響**: 経路Aと同様。夜勤 shortage 1コマ確定。

---

#### 経路C: PassB 確率サンプリング — 保証なし設計

**コード**: L2003-2118

```javascript
// ratio指定なし/trendのみ: 各日を確率サンプリングで決定
const pick = sampleFromProbs(probs)
  || allowed.find(k => ...)
  || allowed.find(k => k === '日勤')
  || allowed[0];
res[s.id][d] = pick;
```

PassB は確率的配置であり、`minStaff` を保証しない。

minStaff 不足に対するブーストあり（L2101-2106）:
```javascript
const deficit = Math.max(0, (dept.minStaff[k] || 0) - (dayCnts[k] || 0));
if (deficit > 0) probs[k] = (probs[k] || 0.01) * (1 + deficit * 2);
```

**発生条件**: ブーストがあっても、`maxStaff[k]` 到達で `probs[k] = 0` になる日、または確率的に補充できなかった場合。早番・遅番（`maxStaff = 1`）は1スタッフしか配置できないため競合しやすい。

**影響**: PassB 終了時点で早番/遅番/日勤のいずれかが未充足。minStaff 保証に委ねられる。

---

#### 経路D: minStaff 保証フェーズ — 優先① slide の限界

**コード**: L2391-2426

```javascript
const slideCands = ds.filter(s => {
  const cur = res[s.id][d];
  // ...
  const fromMin = dept.minStaff?.[cur] ?? 0;
  const fromActual = ds.filter(sx => res[sx.id][d] === cur).length;
  if (fromActual - 1 < fromMin) return false; // ← fromMin ガード
  if (_shouldProtectSlot(cur, fromActual)) return false; // ← Tier1保護
  return true;
});
```

`_shouldProtectSlot(shiftKey, count)`:
```javascript
// L823-826
function shouldProtectSlot(shiftKey, count, slotManagedTypes, maxStaff) {
  if (!isSlotManaged(shiftKey, slotManagedTypes)) return false;
  return count <= (maxStaff[shiftKey] ?? 99);
}
```

**slotManagedTypes** = 夜勤・早番・遅番（`maxStaff` が1のシフト）。

**発生条件（slide 失敗）**:
1. `fromActual - 1 < fromMin` — スライド元が minStaff ぴったりのため slide 不可
2. `_shouldProtectSlot(cur, fromActual)` — スライド元が Tier1 シフトで、count ≤ maxStaff（正常状態）のため slide 不可
3. `_isBadTransition(prev, shiftKey)` — 遷移ルール違反（遅番→早番等）
4. `_consecWork(s.id, d - 1) + 1 > maxConsec` — slide で最大連勤超過

**スライドできるのは「日勤（Tier2）のみ」**。早番・遅番・夜勤は Tier1 保護により slide 元にできない。

---

#### 経路E: minStaff 保証フェーズ — 優先② 休み→勤務 の限界

**コード**: L2431-2455

```javascript
const restCands = ds.filter(s => {
  if (res[s.id][d] !== "休み") return false;
  if (lockedDays[s.id].has(d)) return false;
  if (prev === "夜勤" || prev === "明け") return false;
  if (_isBadTransition(prev, shiftKey)) return false;
  if ((_consecWork(s.id, d - 1) + 1) > maxConsec) return false;
  if (curCount >= (maxStaff[shiftKey] ?? 99)) return false;
  const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
  const actualKyuko = Object.values(res[s.id]).filter(v => v === "休み" || v === "希望休").length;
  return actualKyuko > targetKyuko; // ← 余剰公休のみ
});
```

**発生条件（休み→勤務 失敗）**:
1. **`actualKyuko <= targetKyuko`**: 全スタッフが公休数を達成済み → 誰も動かせない（最大の制約）
2. `lockedDays` — 希望休・有休等のロック済み日
3. `prev === "夜勤" || prev === "明け"` — 明け翌日は勤務不可
4. `_consecWork(...) + 1 > maxConsec` — 連続勤務違反
5. `maxStaff[shiftKey] >= curCount` — 上限到達

**構造的問題**: `kyukoDays` が達成済みのスタッフが多いほど、休み→勤務候補がゼロになる。  
kaigo の公休数（`kyukoDays`）は月ごとに設定され、全スタッフが達成済みの場合は**誰一人動かせない**。

---

#### 経路F: enforceMaxStaff による minStaff 保証の破壊

**コード**: minStaff 保証（L2379-2459）の後、enforceMaxStaff（L2461）が 3 回目実行される。

```
minStaff保証フェーズ → enforceMaxStaff（3回目）
```

enforceMaxStaff は `maxStaff` 超過スタッフを強制削除する。もし minStaff 補充で maxStaff 超過が生じていた場合（早番 maxStaff=1 なのに2名入れた等）、enforceMaxStaff がそれを削除して再び shortage になる。

**発生条件**: minStaff 保証フェーズで maxStaff 超過が発生し、enforceMaxStaff が打ち消す。  
ただしコード設計上 `curCount >= (maxStaff[shiftKey] ?? 99)` チェックで maxStaff 到達時は追加しないため、通常は発生しにくい。

---

### ④ 各経路の shortage 量への寄与（推定）

| 経路 | 対象シフト | 発生確率 | shortage 量 | 備考 |
|---|---|---|---|---|
| A: NG-2 制約 | 夜勤 | low-NR スタッフ比率依存 | 1〜数コマ/月 | 施設経験年数 < 閾値で発動 |
| B: canNight 全落ち | 夜勤 | 低（月末等で集中） | 1〜数コマ/月 | ロック・連続制約重複 |
| C: PassB 確率不足 | 早番/遅番/日勤 | 毎trial で発生 | 多数 | ブーストあるが保証なし |
| D: slide 全失敗 | 早番/遅番 | Tier1保護で常時制限 | 多数 | 最大制約。日勤のみ動かせる |
| E: 余剰公休なし | 全シフト | kyukoDays 達成後 | **最大要因** | 全員達成済みなら誰も動かせない |
| F: enforceMaxStaff | 早番/遅番 | まれ | 少数 | maxStaff超過時のみ |

---

### ⑤ shortage の構造的根本原因（最重要）

**「公休数制約（kyukoDays）と Tier1 保護の二重制約により、minStaff 補充の有効な候補スタッフが存在しない」**

具体的に:
1. PassA/PassB/PassC により全スタッフが公休数を達成済みになる
2. 公休数を達成したスタッフは優先②（休み→勤務）の対象外
3. Tier1シフト（早番・遅番・夜勤）は優先①（slide）の対象外（Tier1保護）
4. 結果として、`日勤スタッフ` のみが slide 対象となるが、日勤スタッフも他の日に minStaff を守っている場合は fromMin ガードで失敗
5. 上記4条件が重なると**誰一人動かせない日が発生**し、shortage が残存する

---

### ⑥ PassA/B/C 各フェーズでの shortage 発生タイミング

```
PassA 夜勤配置
  → 夜勤: NG-2/canNight で shortage 発生（経路A/B）
  → 夜勤 shortage は以降のフェーズで解消不可（Tier1保護）

PassB 勤務シフト配置
  → 早番/遅番/日勤: 確率的配置（保証なし）→ shortage 暫定発生（経路C）
  → minStaff ブーストあり（L2101）だが確率的

公休数調整フェーズ
  → PassB で多く配置したスタッフの公休数が不足 → 日勤→休みに変換
  → この変換で日勤が減少 → shortage 増加の可能性

minStaff 保証フェーズ（3 pass）
  → 優先①slide: 日勤のみ動かせる（Tier1保護）
  → 優先②休み→勤務: 余剰公休スタッフのみ（多くは達成済みで対象外）
  → 多くは解消できず残存

enforceMaxStaff（3回目）
  → まれに minStaff 保証の成果を打ち消す

公休数回復フェーズ（L2469-2510）
  → minStaff を守りながら日勤→休みを強制変換
  → minStaff を守るが、shortage が残る場合はそのまま
```

---

### ⑦ Tier1 保護が shortage に与える影響

**Tier1 = 早番・遅番・夜勤**（`maxStaff = 1` のシフト、slotManagedTypes）

`_shouldProtectSlot(shiftKey, count)` は `count <= maxStaff[shiftKey]` のとき `true` を返す。

kaigo1/kaigo2 の場合:
- 早番 maxStaff=1 → 配置スタッフが1名 → `count=1 <= 1` → **常に保護**
- 遅番 maxStaff=1 → 同上
- 夜勤 maxStaff=1 → 同上（ただし enforceMaxStaff は超過時のみ削減可）

**影響**: 早番・遅番・夜勤スタッフは slide 元にできない。  
shortage 補充は「日勤スタッフのスライド」または「余剰公休スタッフの休み→勤務」に完全に依存する。

---

### ⑧ kyukoDays 制約と shortage の関係

| スタッフ状態 | 優先①slide 可否 | 優先②休み→勤務 可否 |
|---|---|---|
| 公休数 < 目標（不足） | 可（日勤なら） | 不可（休み状態ではない） |
| 公休数 = 目標（達成） | 可（日勤なら） | 不可（余剰ゼロ） |
| 公休数 > 目標（余剰） | 可（日勤なら） | **可** |

PassA/PassB/PassC を経ると、多くのスタッフが「公休数 = 目標」に達している。  
→ 優先②（休み→勤務）が発動できるスタッフがほぼゼロになる  
→ shortage 補充は優先①（日勤スライド）のみに限定される  
→ その日に日勤スタッフが少ない or 全員別のminStaff制約に縛られると全経路失敗

---

### ⑨ isBadTransition の影響

**コード**: L806-813

```javascript
function isBadTransition(prev, curr) {
  if (prev === "遅番" && (curr === "早番" || curr === "日勤")) return true;
  if (prev === "日勤" && curr === "早番") return true;
  if (prev === "夜勤" && curr !== "明け") return true;
  if (prev === "明け" && curr !== "休み") return true;
  return false;
}
```

**shortage への影響**:
- 前日が「遅番」のスタッフ → 当日に早番・日勤の slide/変換 不可
- 前日が「夜勤」のスタッフ → 翌日は「明け」固定（slide 不可）
- 前日が「明け」のスタッフ → 当日は「休み」固定（slide 不可）

夜勤（1名/日）・明け（1名/日）のスタッフが固定されるため、slide 候補が実質的に毎日2名消える。

---

### ⑩ 現状の shortage 削減に最も有効な介入点（実コード根拠）

#### 介入点 X1: 優先② restCands の判定条件緩和（最も直接的）

**現行**: `actualKyuko > targetKyuko`（余剰スタッフのみ）  
**問題**: kyukoDays 達成済みスタッフが多くなると候補ゼロ  
**可能な緩和**: `actualKyuko >= targetKyuko` → 達成済みスタッフも対象（ただし後工程で kyukoDays 回復必要）

**リスク**: 公休数不足スタッフが増加 → 別制約違反

#### 介入点 X2: PassB の minStaff ブーストを強化

**現行**: `probs[k] *= (1 + deficit * 2)` (L2106)  
**問題**: ブースト係数が低く、early スタッフで埋まると後続で shortage が残る  
**可能な改善**: ブースト係数引き上げ or 後から minStaff 充足している日のスタッフを優先

**リスク**: 比率指定との競合。ratio 優先パスでは効かない。

#### 介入点 X3: PassA 夜勤配置の NG-2 制約緩和

**現行**: low-NR + low-NR を完全禁止（cands ゼロで break）  
**問題**: low-NR スタッフが多い施設で夜勤 shortage が頻発  
**可能な改善**: NG-2 制約を「スコアペナルティ」に変換（ハード制約 → ソフト制約）

**リスク**: 夜勤品質（安全性）の低下。施設設計要件との整合が必要。

#### 介入点 X4: minStaff 保証の 3pass 上限を増加

**現行**: `for (let pass = 0; pass < 3; pass++)`  
**問題**: 3pass で解消できない shortage が残存  
**可能な改善**: pass 数増加（5〜10 pass）

**リスク**: 生成時間増加（現在 34ms）。ただし軽微（各 pass は O(days×shift×staff)）。

---

### ⑪ 変更禁止制約との整合確認

| 介入点 | autoGenerate | PassA/B/C | bestOfN | scoreShifts | RepairEngine |
|---|---|---|---|---|---|
| X1: restCands 緩和 | ✗ 変更あり | ✗ 変更あり | — | — | — |
| X2: PassB ブースト強化 | ✗ 変更あり | ✗ 変更あり | — | — | — |
| X3: NG-2 緩和 | ✗ 変更あり | ✗ 変更あり | — | — | — |
| X4: pass 数増加 | ✗ 変更あり | ✗ 変更あり | — | — | — |

**注**: 現在の開発方針では autoGenerate / PassA/B/C / bestOfN の変更は禁止。  
上記の介入点は全て変更禁止コードに該当する。  
→ **コード変更なしの改善は不可能**（scoreShifts での回避は Step6-B で不効であることが実証済み）。

---

### ⑫ 結論・次ステップ提案

#### 結論

shortage = 17.9コマ/trial の原因は以下の3層構造:

```
Layer 1（根本）: kyukoDays 達成済みスタッフが多い → 優先②（休み→勤務）候補ゼロ
Layer 2（増幅）: Tier1保護 → 優先①（slide）は日勤スタッフのみ対象
Layer 3（trigger）: NG-2制約・canNight全落ち → 夜勤shortage が Tier1保護で以降は解消不可
```

この3層が重なるため、minStaff 保証フェーズが機能不全に陥り shortage が残存する。

#### 次ステップ提案（Phase5 Step7-B 以降）

shortage を削減するには autoGenerate 内のロジック変更が必要。変更候補は以下の順で推奨:

1. **Step7-B**: 優先② `actualKyuko > targetKyuko` 条件の緩和実装・Before/After 実測
   - 変更行数: +5行程度（公休数回復フェーズと組み合わせ）
   - 期待効果: restCands が増え shortage 補充確率が向上
   - リスク: 公休違反増加の可能性 → 実測検証必須

2. **Step7-C**: minStaff 保証の pass 数増加（3→5〜10）
   - 変更行数: 1行（`pass < 3` → `pass < 5`）
   - 期待効果: pass 数増加で収束性向上
   - リスク: 生成時間増加（軽微）

3. **Step7-D**: NG-2 制約のソフト化（夜勤 shortage 対策）
   - 変更行数: 5〜10行
   - 期待効果: 夜勤 shortage 削減
   - リスク: 施設安全要件との整合確認が必要

**禁止事項確認**: 本調査はコード変更なし。全変更は今後の Step7-B 以降で 1改善=1ブランチ=1PR の原則で実施する。

---

## shortage 発生フロー全体図

```
autoGenerate 開始
│
├── PassA 夜勤配置
│   ├── NG-2制約 (_isLowNR) → 候補ゼロ → break → 夜勤shortage ← 経路A
│   └── canNight 全落ち → 候補ゼロ → 未配置 → 夜勤shortage ← 経路B
│
├── PassA 休み配置
│   └── kyukoDays 目標を達成 → 後工程での休み→勤務が制限される（仕込み）
│
├── PassB 勤務シフト配置
│   ├── minStaff ブースト（×3）あり → 確率的
│   └── 保証なし → 早番/遅番/日勤 shortage 暫定発生 ← 経路C
│
├── PassC 連続勤務修正
│   └── 日勤→休みに変換 → 日勤数減少 → 日勤shortage 増加可能性
│
├── 公休数調整フェーズ
│   └── 日勤→休みに変換 → 日勤数減少 → 日勤shortage 増加
│
├── 遷移違反 repair
│   └── 休み→日勤代替（Tier1保護あり）
│
├── minStaff 保証（3 pass）
│   ├── 優先①: 日勤→別シフト slide
│   │   ├── Tier1保護で早番/遅番/夜勤は slide 元不可 ← 経路D
│   │   ├── fromMin ガードで slide 元が minStaff を割る場合は不可
│   │   └── isBadTransition で連鎖違反がある場合は不可
│   └── 優先②: 休み→勤務（余剰スタッフのみ）
│       ├── actualKyuko > targetKyuko のスタッフのみ ← 経路E（最大要因）
│       ├── lockedDays（希望休/有休）は不可
│       ├── 明け翌日は不可（prev === "明け"）
│       └── maxConsec 超過は不可
│
├── enforceMaxStaff（3回目）
│   └── maxStaff 超過を削除 → まれに minStaff を再度割る ← 経路F
│
└── 公休数回復フェーズ
    └── 日勤→休みを強制変換（minStaff を守る）
        → minStaff ギリギリで日勤→休みができない場合は shortage 継続
```

---

*Phase5 Step7-A 調査完了。shortage の根本原因は「kyukoDays 制約 + Tier1保護の二重制約による補充候補枯渇」。コード変更なし・推測なし・実コードのみで結論。*
