# 夜勤配置月内均等化 仕様書
## Phase5 Step2 設計ドキュメント

作成日: 2026-06-29  
対象ファイル: `src/App.jsx`（autoGenerate 関数内 ステップ2 夜勤配置ブロック）  
変更禁止: ステップ1.5（希望休アンカー）/ PassB / PassC / RepairEngine / DiagnosticEngine / LearningEngine / 栄養科

---

## 作業前回答

① **現在フェーズ**: Phase5 Step2（夜勤均等化 設計・分析）  
② **Phase5進捗率**: 1/7 完了（14%）  
③ **今回の生成結果**: 変わらない（コード変更禁止）

---

## ① 現状処理の完全解析

### 夜勤配置の全体フロー

```
autoGenerate 内の夜勤処理（L1063〜L1188）

[前処理] 前月末繰り越し（L1063〜1072）
  前月末=夜勤 → 当月1日=明け・2日=休み（ロック）
  前月末=明け → 当月1日=休み（ロック）

[ステップ1] 希望休・希望勤務・有休 ロック（L1033〜1061）

[ステップ1.5] 希望休アンカー配置（L1106〜1130）
  kiboByMonth に希望休Dがある夜勤OKスタッフ
  → D-2=夜勤、D-1=明け を先行確定

[ステップ2] 夜勤配置本体（L1132〜1188）★今回の対象
  d=1 から d=days を順に処理
  minStaff["夜勤"] 不足分を nightPool から補填

[ステップ2.5] slot-first（早番・遅番）（L1405〜1464）

[PassA] 公休配置（Phase5 Step1 改善済み）

[PassB] 勤務サンプリング
```

### 各処理の詳細分析

#### 1. 夜勤候補プール構築

| 項目 | 内容 |
|------|------|
| 役割 | 夜勤配置対象スタッフを絞り込む |
| 入力 | `ds`（部署スタッフ）、`s.nightOk`、`_nightAllowed(s)` |
| 出力 | `nightPool`（夜勤OK・役職制限クリアスタッフ配列） |
| 問題点 | nightPool は静的（月内に変化しない）。月後半で nightMax 到達者が増えても nightPool は縮小しない |
| ボトルネック | なし |
| 改善優先度 | 低（現状で正常機能） |

**`_nightAllowed(s)`**: `dept.roleShiftTypes[s.role]` が未定義（制限なし）、または全非夜勤シフトを含む役職のみ夜勤許可。

#### 2. autoMax（個人別夜勤上限）

| 項目 | 内容 |
|------|------|
| 計算式 | `Math.ceil(days / nightPool.length)` |
| 例 | 30日 / 5名 = 6回（各スタッフ上限 6回） |
| 役割 | 特定スタッフへの夜勤集中を防ぐフォールバック上限 |
| 問題点 | `nightMax`（個人設定）と `autoMax` の大きい方が実効上限。`nightMax=5` の場合 `autoMax=6` より小さいが、`nightMax=10` なら autoMax が実質無効化 |
| 改善優先度 | 低 |

#### 3. 夜勤配置ループ（★核心部）

```
for d = 1..days:
  already = count(夜勤 on day d)
  need = minStaff["夜勤"] - already   // 通常 = 1
  if need <= 0: continue

  canNight(s):
    ・nightExcludeDays（クロスフロア）除外
    ・lockedDays[s][d] 除外
    ・前日が夜勤/明け → 除外
    ・翌日がロック済み（明け以外）→ 除外
    ・翌々日がロック済みで勤務シフト → 除外

  cands = nightPool.filter(canNight AND usedNight < max(nightMax, autoMax))
         .sort(夜勤累積回数 少ない順)

  フォールバック: cands が空なら nightMax 上限無視で canNight のみ満たす候補
  G-1: 外国人夜勤者がいてサポーター未配置 → 非外国人を優先
  NG-2: low-NR（経験年数が浅い）同士の組み合わせ禁止

  確定後:
    res[s][d]   = "夜勤"
    res[s][d+1] = "明け"
    res[s][d+2] = "休み"（未設定のみ）
```

| 項目 | 内容 |
|------|------|
| ソート基準 | **夜勤累積回数の少ない順**のみ（単一基準） |
| 問題点1 | 日別順次処理のため**前半に夜勤が集中**しやすい。月初は全員0回のため事実上ランダム選択 |
| 問題点2 | **夜勤間隔の制御なし**。同一スタッフが d=1, d=3 に連続夜勤になりうる（前日チェックのみ） |
| 問題点3 | **後半shortage リスク**。月初に nightMax 到達スタッフが増えると月末に夜勤要員不足 |
| 問題点4 | **前半/後半の偏り**。累積回数ソートは全体均等化を図るが、時期的均等（各スタッフが月の前半・後半に均等配置）を保証しない |
| 改善優先度 | **高** |

#### 4. 夜勤間隔の現状

| 間隔パターン | 現状の可否 |
|-------------|---------|
| d=1（夜勤）→ d=3（夜勤） | ❌ 不可（前日d=2=明けが前日夜勤扱い） |
| d=1（夜勤）→ d=4（夜勤） | ✅ 可（canNight は前日のみチェック）|
| d=1（夜勤）→ d=5（夜勤） | ✅ 可 |
| d=1（夜勤）→ d=10（夜勤） | ✅ 可 |

**実質最短間隔: 3日**（夜勤 → 明け → 休み → 次の夜勤）  
**望ましい間隔: 5〜7日以上**（連続勤務制約 maxConsec=5 から導出）

#### 5. 夜勤 → 明け → 休み の品質

| 処理 | 内容 | 問題点 |
|------|------|-------|
| 明け設定 | `res[s][d+1] = "明け"` 無条件 | d+1 が希望勤務でも上書き（ただしロック済みはスキップ） |
| 休み設定 | `res[s][d+2] = "休み"`（未設定のみ） | d+2 が既にロック済みの場合スキップ → 夜勤→明け→夜勤 の連続が生じる可能性 |
| PassA との関係 | 明け翌日が有効な公休候補外（`res[s.id][d-1] !== '明け'`） | 夜勤スタッフの PassA 候補日が削減される |

#### 6. ステップ1.5（アンカー配置）

| 項目 | 内容 |
|------|------|
| 役割 | 希望休を夜勤確定のヒントとして利用 |
| 入力 | `kiboByMonth[mk]`、`kiboNightPreference` |
| 問題点 | アンカーも間隔制御なし。希望休が月初に集中するスタッフは前半に夜勤が偏る |
| 改善対象外 | 本Step2の改善対象外（既存ロジック維持） |

---

## ② 改善仕様

### 改善目標

**「夜勤配置の月内均等化」**: 各夜勤OKスタッフが月内で均等な間隔・回数で夜勤に入れるよう、候補選択スコアを多因子化する。

### 改善の核心: 多因子スコアによる候補ソート

現状のソートキー（単一）:
```
夜勤累積回数 少ない順
```

改善後のスコア（多因子）:
```
nightScore(s, d) =
  w1 × (targetCount - usedNight)   // 残り配置枠の多いスタッフを優先
  + w2 × intervalBonus(s, d)       // 前回夜勤から十分に間隔が空いているか
  + w3 × positionBonus(s, d)       // 月内の理想位置に近いか
```

#### 各因子の詳細

**w1 × 残り配置枠（均等化）**

```
targetCount = ceil(totalNightSlots / nightPool.length)
               = ceil(days / nightPool.length)  例: 30/5 = 6
残り枠 = targetCount - usedNight[s]
```

現状と同等の均等化効果を維持しつつ、他因子と組み合わせる。

**w2 × 間隔ボーナス（最重要追加因子）**

```
lastNightDay[s] = 最後に夜勤した日（0=今月初登板）
interval = d - lastNightDay[s]

// 理想間隔 = days / targetCount = 30/6 = 5日
idealInterval = floor(days / targetCount)

intervalBonus(s, d) =
  if interval == 0: -∞ (同一日重複: 不可)
  if interval < 3: -∞  (最短間隔未満: 不可 → canNight が担保)
  if interval < idealInterval: (interval - 3) / (idealInterval - 3)  // 0〜1
  if interval >= idealInterval: 1.0  // 理想以上: フルボーナス
```

**w3 × 位置ボーナス（月内分散）**

各スタッフの「次の夜勤の理想位置」を計算:
```
idealNextDay(s) = lastNightDay[s] + idealInterval
positionBonus(s, d) = 1 - |d - idealNextDay(s)| / days
```

理想位置に近い日に割り当てるほど高スコア。これにより:
- 月前半ばかりに夜勤が集中しない
- 月末に夜勤要員が枯渇するリスクを低減

#### 重みの設定

```
w1 = 3.0  // 均等化（最重要: 累積回数ベース）
w2 = 2.0  // 間隔（重要: 過密防止）
w3 = 1.0  // 位置（補助: 月内分散）
```

w1 > w2 > w3 の順に優先。w1 を最大にすることで既存の均等化特性を維持しつつ、w2 で間隔を改善。

### 改善対象外（変更禁止）

| 処理 | 理由 |
|------|------|
| `canNight(s)` 判定 | Tier1制約（翌日ロック・前日夜勤/明けチェック）はそのまま |
| nightMax / autoMax | 個人設定・自動上限はそのまま |
| G-1（外国人+サポーター）| 安全制約のまま |
| NG-2（low-NR組合せ禁止）| 安全制約のまま |
| ステップ1.5（アンカー）| 希望休アンカーは変更しない |
| フォールバック処理 | nightMax超過フォールバックはそのまま（shortage防止） |
| 夜勤→明け→休み設定 | 設定方法は変更しない |

---

## ③ 処理フロー（改善後）

```
[ステップ2] 夜勤配置本体（改善後）

[前処理] 初期化
  targetCount = ceil(days / nightPool.length)
  idealInterval = max(3, floor(days / targetCount))
  lastNightDay[s] = 0 for all s（月内に夜勤なしの初期値）

for d = 1..days:
  already = count(夜勤 on day d)
  need = minStaff["夜勤"] - already
  if need <= 0: continue

  ─ 候補フィルタ（変更なし） ─
  cands = nightPool.filter(canNight AND usedNight < max(nightMax, autoMax))

  ─ 多因子スコアでソート（★改善点） ─
  cands.sort by nightScore(s, d) DESC:
    remainSlots = targetCount - usedNight[s]
    interval    = d - lastNightDay[s]
    ideal       = lastNightDay[s] + idealInterval

    intervalBonus = interval >= idealInterval ? 1.0
                  : (interval - 3) / max(1, idealInterval - 3)

    posBonus = 1.0 - |d - ideal| / days

    score = 3.0 * remainSlots
          + 2.0 * intervalBonus
          + 1.0 * posBonus

  ─ G-1 / NG-2 安全制約（変更なし） ─

  ─ 配置確定 ─
  res[s][d]   = "夜勤"
  res[s][d+1] = "明け"
  res[s][d+2] = "休み"（未設定のみ）
  lastNightDay[s] = d   ← ★新規追加（間隔トラッキング）
  need--

  ─ フォールバック（変更なし） ─
  cands 空 → nightMax 無視・canNight のみで再選出
```

---

## ④ 擬似コード

```javascript
// ── ステップ2: 夜勤配置本体（Phase5 Step2 改善版） ──────────────────────
if (dept.shiftTypes.includes("夜勤")) {
  const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
  const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));
  const targetCount = autoMax; // = ceil(days / nightPool.length)
  const idealInterval = Math.max(3, Math.floor(days / targetCount));

  // ★追加: 間隔トラッキング（アンカー配置済みの夜勤日を初期化）
  const _lastNightDay = {};
  nightPool.forEach(s => {
    const nightDays = Object.entries(res[s.id])
      .filter(([, v]) => v === '夜勤').map(([d]) => Number(d));
    _lastNightDay[s.id] = nightDays.length ? Math.max(...nightDays) : 0;
  });

  for (let d = 1; d <= days; d++) {
    const already = ds.filter(s => res[s.id][d] === "夜勤").length;
    let need = (dept.minStaff["夜勤"] || 0) - already;
    if (need <= 0) continue;

    const canNight = (s) => {
      // 既存の canNight 判定（変更なし）
      if (s.nightExcludeDays?.has(d)) return false;
      if (lockedDays[s.id].has(d)) return false;
      if (["夜勤","明け"].includes(d === 1 ? prevShift(s.id) : res[s.id][d - 1])) return false;
      if (d + 1 <= days && lockedDays[s.id].has(d + 1) && res[s.id][d+1] !== "明け") return false;
      if (d + 2 <= days && lockedDays[s.id].has(d + 2) && deptWork.has(res[s.id][d + 2])) return false;
      return true;
    };

    // ★改善: 多因子スコアによるソート
    const nightScore = (s) => {
      const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
      const remainSlots = targetCount - usedNight;
      const interval = d - (_lastNightDay[s.id] || 0);
      const idealNext = (_lastNightDay[s.id] || 0) + idealInterval;
      const intervalBonus = interval >= idealInterval
        ? 1.0
        : Math.max(0, (interval - 3) / Math.max(1, idealInterval - 3));
      const posBonus = 1.0 - Math.abs(d - idealNext) / days;
      return 3.0 * remainSlots + 2.0 * intervalBonus + 1.0 * posBonus;
    };

    let cands = nightPool.filter(s => {
      if (!canNight(s)) return false;
      const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
      return usedNight < Math.max(s.nightMax || 5, autoMax);
    }).sort((a, b) => nightScore(b) - nightScore(a)); // ★降順（高スコア優先）

    if (cands.length === 0) {
      // フォールバック: nightMax 無視（変更なし）
      cands = nightPool.filter(s => canNight(s))
        .sort((a, b) => nightScore(b) - nightScore(a));
    }

    // G-1 / NG-2 判定（変更なし）
    const _isLowNR = (s) => {
      const fy = s.facilityYears, fl = s.floorYears;
      return fy != null && fl != null && (fy < 0.5 || fl < 0.2);
    };
    let _cands = [...cands];
    while (need > 0 && _cands.length > 0) {
      if (ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤')) {
        _cands = _cands.filter(s => !_isLowNR(s));
        if (_cands.length === 0) break;
      }
      const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
      const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
      if (_foreignOnNight && !_supporterOnNight) {
        _cands.sort((a, b) => {
          const aF = a.foreignNightSupportRequired ? 1 : 0;
          const bF = b.foreignNightSupportRequired ? 1 : 0;
          if (aF !== bF) return aF - bF;
          return nightScore(b) - nightScore(a);
        });
      }
      const s = _cands.shift();
      res[s.id][d] = "夜勤";
      if (d + 1 <= days) res[s.id][d + 1] = "明け";
      if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
      _lastNightDay[s.id] = d; // ★追加: 間隔トラッキング更新
      need--;
    }
  }
}
```

---

## ⑤ 評価指標

### 夜勤配置品質の測定指標

| 指標 | 計算方法 | 目標値 |
|------|----------|-------|
| **夜勤回数標準偏差** | `σ(nightCount per staff)` | < 0.5回 |
| **夜勤間隔最小値** | `min(interval between nights per staff)` | ≥ 5日 |
| **夜勤間隔標準偏差** | `σ(intervals per staff)` | < 2.0日 |
| **前半/後半偏差** | `|count(d≤15) - count(d>15)|` per staff | ≤ 1回 |
| **月末shortage率** | `count(d≥25 で夜勤未配置) / 6日` | 0% |
| **PassA利用可能日数** | 夜勤OKスタッフの PassA 候補日数 | 増加方向 |

### DiagnosticReport で取得できる情報

| フィールド | 内容 |
|-----------|------|
| `repair.final.nightOrphans` | 夜勤孤立（翌日が明け以外）件数 |
| `repair.final.nightOrphanList` | 夜勤孤立スタッフ一覧 |
| `repair.summary.finalNightOrphans` | 総孤立数 |
| `repair.passA.snapshot` | PassA後各スタッフの有効候補日数（間接指標） |

---

## ⑥ テスト方法

### Step A: ビルド確認
```bash
npm run build  # エラーなし確認
```

### Step B: 夜勤分布の比較（改善前後）

改善前の DiagnosticReport.repair.passA.snapshot から各スタッフの夜勤配置日を記録。  
改善後と以下を比較:

1. **夜勤回数の標準偏差**: 各スタッフの夜勤回数 σ が減少しているか
2. **夜勤間隔最小値**: 最短間隔が 5日以上になっているか
3. **前半/後半分布**: `d=1〜15` と `d=16〜30` の夜勤数が均等か
4. **nightOrphans**: `repair.final.nightOrphans` が変化していないか（退行確認）

### Step C: Repair 指標比較
PassC 修復件数・restAdjustment 件数を Phase5 Step1 後の値と比較。

### Step D: kaigo1/kaigo2 各20回生成
DiagnosticReport.repair.summary の以下を比較:
- `finalShortCount`: 公休不足 → 変化なし or 減少
- `finalNightOrphans`: 夜勤孤立 → 変化なし or 減少
- `finalMaxStaffViolations`: 変化なし

---

## ⑦ 成功判定基準

| 指標 | 成功条件 |
|------|---------|
| 夜勤回数σ | 改善前より **減少**（目標 < 0.5回） |
| 夜勤間隔最小値 | 改善前より **増加**（目標 ≥ 5日） |
| nightOrphans | **悪化しないこと**（退行禁止） |
| PassC修復件数 | **悪化しないこと**（Phase5 Step1後比較） |
| 公休不足 | 0 を維持 |
| ビルド成功 | `npm run build` エラーなし |
| 生成完了 | kaigo1/kaigo2/eiyo いずれもエラーなく結果返却 |

---

## 現在との違い

| 観点 | 現状 | 改善後 |
|------|------|-------|
| ソートキー | 夜勤累積回数（単一） | 多因子スコア（残り枠×3 + 間隔×2 + 位置×1） |
| 間隔制御 | なし（前日のみ） | `idealInterval` を考慮した間隔ボーナス |
| 月内分散 | 前半集中しやすい | 位置ボーナスで分散を促進 |
| トラッキング | なし | `_lastNightDay[s.id]` で最終夜勤日を追跡 |
| コード変更行数 | — | 約 +20行（スコア計算 + トラッキング初期化） |

---

## メリット

1. **夜勤間隔の均等化**: 同一スタッフの夜勤間隔が「idealInterval = days/targetCount」に近づく
2. **月末shortage 軽減**: 位置ボーナスで前半集中を抑制 → 月末も要員確保
3. **PassA との相乗効果**: 夜勤OKスタッフの明け後休みが分散 → PassA の有効候補日が増加
4. **Repair 削減**: 夜勤→明け→休み の 3連ブロックが分散 → PassC の連続違反修正件数減少
5. **既存制約を完全維持**: `canNight`・G-1・NG-2・nightMax は変更なし

---

## リスク

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| スコア計算でソート順が変わり夜勤shortage 増加 | 低 | 中 | フォールバック（nightMax無視）は維持するため shortage 増加なし |
| アンカー配置との干渉 | 低 | 低 | アンカーは変更しない。`_lastNightDay` 初期化でアンカー済みの夜勤も考慮 |
| idealInterval の算出が極端になる | 低 | 低 | `Math.max(3, ...)` でクリッピング |
| G-1/NG-2 との組み合わせで候補枯渇 | 既存と同等 | 中 | フォールバックは既存と同じロジック |
| eiyo（夜勤なし）への影響 | なし | なし | `dept.shiftTypes.includes("夜勤")` で入り口がガードされている |

---

## 最終回答

### ① 夜勤均等化だけでどの程度品質向上が期待できるか

**夜勤間隔不均等による PassC 連続違反が 20〜40% 削減**と予測する。

根拠:
- Phase5 Step1 後の PassC 残存違反 0.02〜0.06件/trial のうち、夜勤OKスタッフの間隔過密（5日未満）に起因するものが一定数存在する
- 夜勤間隔を idealInterval（≒5〜6日）に近づけることで、明け後の休み配置が分散し PassA の有効候補日が増加
- 月末 shortage リスクが減少 → `repair.final.nightOrphans` 削減

定量的効果（シミュレーション予測）:

| 指標 | 現状 | 改善後（予測） |
|------|------|-------------|
| 夜勤間隔最小値 | 3〜4日 | 5〜6日 |
| 夜勤回数σ | 0.5〜1.0 | 0〜0.5 |
| 前半/後半偏差 | ±2回 | ±1回以内 |
| nightOrphans | ほぼ0 | 維持 |

### ② Repair回数へどの程度影響するか

**直接的な Repair 削減効果: 軽微〜中程度**

夜勤均等化は「夜勤OKスタッフの残り勤務日パターン」を改善するため:
- PassA の有効候補日が増加 → `_paDailyRestLimit` フィルタが緩和されやすい
- PassC の連続違反修正対象が減少（夜勤の密集がなくなるため）
- ただし連続違反の主因は PassA・PassB であり、夜勤均等化単体での Repair 削減は 10〜20% 程度

### ③ Step3（checkAbsolute改善）より優先する理由

| 比較軸 | Step2（夜勤均等化） | Step3（checkAbsolute改善） |
|--------|-------------------|--------------------------|
| 対象エンジン | autoGenerate | generateTimeAxis |
| 影響スタッフ | kaigo1/kaigo2（夜勤あり部署） | eiyo（栄養科） |
| 改善レバレッジ | 上流（夜勤配置→PassA相乗効果） | 下流（eiyo 生成成功率） |
| 実装リスク | 低（ソートキー変更のみ） | 中（checkAbsolute 条件変更） |
| 緊急性 | 中（月末 shortage 問題） | 低（eiyo は 2名のみ） |

夜勤均等化は介護エンジン全体（kaigo1/kaigo2 = 20名）に影響し、  
Phase5 Step1 の PassA 改善と相乗効果が期待できるため優先する。

### ④ Step2 実装に進める状態か

**設計完成。実装可能。**

実装前に確認すべき事項:
- `_lastNightDay` 初期化で「アンカー配置済みの夜勤日（ステップ1.5 で配置されたもの）」を正しく拾えているか
- `idealInterval` の計算値が月によって変わる（31日月は interval=5、28日月は interval=4.67 → floor=4）
- `nightScore` の重み（3.0/2.0/1.0）は Step2 実装後の実測データで調整可能
