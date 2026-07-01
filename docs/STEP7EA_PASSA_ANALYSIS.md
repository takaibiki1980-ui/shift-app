# STEP7EA_PASSA_ANALYSIS.md
# Phase5 Step7-EA — PassA 夜勤shortage 根本原因調査設計書

作成: 2026-06-30
対象ブランチ: phase5/night-balance
対象ファイル: src/App.jsx（本番）/ src/shiftEngine.js（テスト基盤）
実測: なし（コード読み取り・静的分析のみ）

---

## 必須回答 ①〜⑫

---

### ① PassA 完全フロー図

```
autoGenerate 呼び出し
  │
  ├─ ステップ1: 希望休・有休・希望勤務の優先セット（L222〜240）
  │    └─ lockedDays = Set(既入力日) ← 夜勤配置は絶対に上書きしない
  │
  ├─ 前月末夜勤/明け繰り越し（L246〜257）
  │    ├─ prevShift='夜勤' → 1日=明け・2日=休み → lockedDaysに追加
  │    └─ prevShift='明け' → 1日=休み → lockedDaysに追加
  │
  ├─ 希望勤務（夜勤含む）の翌日/翌々日自動セット（L259〜278）
  │    └─ 希望夜勤が入った場合も lockedDays 伝播
  │
  ├─ ステップ1.5: 希望休アンカー配置（App.jsx L1261〜1319 / shiftEngine.js L280〜307）
  │    ├─ anchorPool = ds.filter(s.nightOk && _nightAllowed(s))
  │    ├─ 希望休日D → nightDay=D-2 に夜勤・meakeDay=D-1 に明けを仮置き
  │    ├─ 除外条件: nightExcludeDays.has(nightDay) [App.jsxのみ]
  │    │            前日=夜勤/明け（連続夜勤禁止）
  │    │            usedNight >= Max(nightMax||5, anchorAutoMax)
  │    │            dayNightCount >= maxStaff["夜勤"] [App.jsxのみ]
  │    └─ 配置 → lockedDays に nightDay/meakeDay を追加（以降変更不可）
  │
  └─ ステップ2: 夜勤配置（App.jsx L1322〜1407 / shiftEngine.js L309〜370）
       ├─ nightPool = ds.filter(s.nightOk && _nightAllowed(s))
       ├─ autoMax = Math.ceil(days / Max(nightPool.length, 1))
       │
       └─ for d=1..days:
             already = 既に夜勤配置済みスタッフ数
             need = minStaff["夜勤"] - already
             if need <= 0 → continue（この日は充足済み）
             │
             ├─ canNight(s) 判定（後述②参照）
             │
             ├─ 一次候補: cands = nightPool.filter(canNight && usedNight < Max(nightMax||5, autoMax))
             │              .sort(_nightCandSort)
             │
             ├─ cands.length === 0 のとき → フォールバック
             │    cands = nightPool.filter(canNight)  ← nightMax上限を無視
             │    .sort(_nightCandSort)
             │
             ├─ _cands = [...cands]
             │
             └─ while (need > 0 && _cands.length > 0):
                   ├─ [NG-2] low-NR が既存夜勤中 →
                   │    _cands = _cands.filter(!_isLowNR)
                   │    _cands.length === 0 → break ★shortage確定
                   │
                   ├─ [G-1] 外国人夜勤中・サポーター未配置 →
                   │    _cands.sort(非外国人優先)
                   │
                   ├─ s = _cands.shift()
                   ├─ res[s.id][d] = "夜勤"
                   ├─ res[s.id][d+1] = "明け"（d+1<=days のとき）
                   ├─ res[s.id][d+2] = "休み"（res空のとき）
                   └─ need--

  # while抜け後 need > 0 の場合 → その日の夜勤 shortage 確定（サイレント）
```

---

### ② candidate（nightPool）生成フロー

#### 2-A: nightPool フィルタ（ステップ2入口）

```javascript
// App.jsx L1328 / shiftEngine.js L311
const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
```

| 除外条件 | コード根拠 | 対象 |
|---|---|---|
| `s.nightOk === false` | L1328 | 夜勤非対応スタッフ（UIで「夜勤NG」設定） |
| `!_nightAllowed(s)` | L1328 | roleShiftTypes制限で夜勤不可の役職 |

#### `_nightAllowed` の判定ロジック（App.jsx L1266〜1269）

```javascript
const _nightAllowed = (s) => {
  const rst = dept.roleShiftTypes?.[s.role];
  if (!rst) return true;              // 役職制限なし → 全員OK
  return rst.length >= _nonNightTypes.length; // 役職許可シフト数 >= 非夜勤シフト数
};
```

`_nonNightTypes = dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け')` = [早番,日勤,遅番]（kaigo）

つまり: roleShiftTypes['その他'] = ['早番','日勤','遅番'] → length=3 >= 3 → 夜勤OK  
roleShiftTypes が早番だけに限定された役職（length=1）→ `1 >= 3` = false → 夜勤不可

#### 2-B: canNight(s) — 日別除外条件（App.jsx L1359〜1365）

```javascript
const canNight = (s) => {
  if (s.nightExcludeDays?.has(d)) return false;           // C1: クロスフロア夜勤禁止
  if (lockedDays[s.id].has(d)) return false;              // C2: ロック済み日
  if (["夜勤","明け"].includes(d===1 ? prevShift(s.id) : res[s.id][d-1])) return false; // C3: 連続夜勤禁止
  if (d+1<=days && lockedDays[s.id].has(d+1) && res[s.id][d+1]!=="明け") return false; // C4: 翌日ロック(非明け)
  if (d+2<=days && lockedDays[s.id].has(d+2) && deptWork.has(res[s.id][d+2])) return false; // C5: 翌々日固定勤務
  return true;
};
```

#### 2-C: nightMax 上限チェック（一次候補フィルタ）

```javascript
// L1367-1371
let cands = nightPool.filter(s => {
  if (!canNight(s)) return false;
  const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
  return usedNight < Math.max(s.nightMax || 5, autoMax); // ★上限チェック
}).sort(_nightCandSort);
```

- `s.nightMax`: スタッフ個別設定（デフォルト5/月）
- `autoMax = Math.ceil(days / nightPool.length)`: プール全体の公平分担上限
- 上限超過 → 一次候補から除外 → フォールバックへ（上限無視で再フィルタ）

#### 2-D: NG-2（loop内除外）

```javascript
// L1384-1387
if (ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤')) {
  _cands = _cands.filter(s => !_isLowNR(s));
  if (_cands.length === 0) break; // ★shortage確定
}
```

`_isLowNR(s)`: `facilityYears < 0.5 || floorYears < 0.2`

---

### ③ 候補除外理由ランキング

実本番（App.jsx）での候補除外、コードから特定した全条件を「起きやすさ」順に:

| 順位 | 除外理由 | 適用箇所 | 発生頻度推定 |
|---|---|---|---|
| **1位** | **`nightOk=false`（nightPool除外）** | 夜勤Pool生成 | 高：夜勤不可スタッフが多いほど Pool が小さくなる |
| **2位** | **`lockedDays`（C2）** | canNight | 高：希望休・有休・前月末・アンカー配置の累積で多数の日がロック |
| **3位** | **`C3`: 前日=夜勤/明け** | canNight | 高：夜勤→明け→（休み）の3日間 d+1/d+2 も間接的に塞ぐ |
| **4位** | **`nightMax`超過（一次候補除外）** | 一次候補フィルタ | 中：月後半で累積超過。フォールバックで救済可能だが全員超過なら不可 |
| **5位** | **`C4/C5`: 翌日/翌々日ロック非明け・固定勤務** | canNight | 中：希望休・アンカーが連鎖するとd+1/d+2が塞がれる |
| **6位** | **`NG-2`(low-NR low-NR ペア禁止)** | while内 | 中：low-NR スタッフが少数でもペア禁止で shortage 確定の唯一明示的 break |
| **7位** | **`nightExcludeDays`(C1)クロスフロア** | canNight（App.jsxのみ） | 低〜中：crossFloorNightEnabled部署のみ適用、shiftEngine.jsでは再現不可 |
| **8位** | **`_nightAllowed`(roleShiftTypes)役職制限** | nightPool除外 | 低：役職制限を設定していない部署では発生しない |
| **9位** | **`G-1`(外国人サポーター不在で並び替え)** | while内ソート | 低：shortage 直接原因ではない（並び替えのみ） |

---

### ④ shortage 確定までの全経路

#### 経路α: nightPool が空

```
nightOk=false 全スタッフ  →  nightPool = []
  → cands = []
  → フォールバック cands = []
  → _cands = []
  → while条件 _cands.length>0 が初回から false
  → need のまま → shortage
```

#### 経路β: canNight が全員 false（lockedDays + C3 + C4 + C5 で完全封鎖）

```
全 nightPool スタッフが:
  - lockedDays(希望休/有休/アンカー/前月末) か
  - C3（前日夜勤/明け）か
  - C4（翌日ロック非明け）か
  - C5（翌々日固定勤務）
    → canNight(s)=false 全員
  → cands = []  フォールバックも []
  → shortage
```

#### 経路γ: nightMax 超過全員 + フォールバックも空

```
nightPool全員が usedNight >= Max(nightMax||5, autoMax)
  → 一次候補 cands = []
  → フォールバック: canNight で再フィルタ
    → フォールバックも全員 canNight=false なら shortage
    → フォールバックに候補あれば rescue（nightMax無視）
```

#### 経路δ: NG-2 による break（唯一の明示的 break）

```
_cands に候補あり
  → 最初のスタッフをシフト配置（low-NR スタッフ）
  → 次の need 処理:
    → ds.some(_isLowNR && res[d]==="夜勤") = true
    → _cands.filter(!_isLowNR) → 残り全員 low-NR → 空
    → if(_cands.length===0) break ★
  → need > 0 のまま → shortage
```

#### 経路ε: 月後半で全員 nightMax 超過・フォールバック成立せず

```
月1〜15日に夜勤配置が集中
  → 月16日以降: usedNight >= autoMax 全員
  → フォールバック: canNight で再フィルタ
    → 前日夜勤/明けで C3 適用者が多い（連鎖）
    → lockedDays で希望休累積
    → 有効候補ゼロ → shortage
```

---

### ⑤ 最も支配的な原因

#### コード上の根拠

**1位: `nightOk=false` による nightPool の構造的縮小**

```javascript
// App.jsx L1328 / shiftEngine.js L311
const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));
```

nightPool.length が小さいほど autoMax が大きくなる（`days / nightPool.length`）。
例: days=30, nightPool=6人 → autoMax=5。各スタッフが月5回夜勤しないと充足できない計算だが、nightMax=5 と一致するため上限ぎりぎり。nightPool=4人ならautoMax=8（nightMax=5を超える → フォールバック常時）。

**2位: lockedDays の累積（C2 + C3 連鎖）**

希望休・有休・アンカー配置・前月末繰り越しが lockedDays を埋める。
夜勤を1日配置すると `d`, `d+1（明け）`, `d+2（休み）` の3日分のスタッフ時間を消費する。
nightPool が少ない場合、月30日 × 1名 夜勤必要 = 30スロット分の夜勤配置を nightPool 人数で分担する必要があり、lockedDays が1人当たり10日塞いでいると残り20勤務日から5夜勤を選ぶ計算になる。

**3位: NG-2 がトリガーとなる break（検証テスト環境で除外されている制約）**

Step7-B'/Step7-C のテスト環境（shiftEngine.js + vitest）では:
- `nightExcludeDays = new Set()`（クロスフロア制約なし）
- `facilityYears = 1+rand*4`, `floorYears = 1+rand*3`（low-NR: fy<0.5||fl<0.2 は低確率）

実環境では入職後間もないスタッフが増えると low-NR 比率が増加し、NG-2 によるbreak が頻発する。

---

### ⑥ 夜勤shortage 改善候補ランキング

| 順位 | 改善案 | コード上の根拠 | 期待効果 | リスク |
|---|---|---|---|---|
| **1位** | **NG-2 の緩和: low-NR+non-low ペアで break しない** | L1384-1387: `break` を `continue` 相当に変更 → 次の non-low 候補に進む | 高（NG-2 break が shortage 唯一の明示的経路） | 中（NG-2 は業務要件：新人同士夜勤禁止） |
| **2位** | **nightPool の拡張: nightOk=true スタッフ増加** | L1328: nightPool のフィルタ緩和は UI設定依存（コード変更なし） | 高（Pool拡大でautoMax低下） | 低（UIのみ変更） |
| **3位** | **autoMax 上限の引き上げ（係数変更）** | L1329: `Math.ceil(days / nightPool.length)` の分母を小さくする（全員均等より特定に集中許可） | 中（nightMax=5を超えても配置可能に） | 中（特定スタッフへの夜勤集中・負担偏り） |
| **4位** | **nightMax 上限の引き上げ（スタッフ設定値）** | L1370: `s.nightMax || 5` のデフォルト値を 6〜7 に変更 | 中（一次候補の寿命が延びる） | 中（過重労働リスク） |
| **5位** | **フォールバック除外の拡大（nightMax上限完全無視）** | L1372-1375: フォールバックは既に nightMax 無視。更に canNight の C4/C5 を部分緩和 | 低〜中 | 中（翌日/翌々日制約の緩和は他制約と競合） |
| **6位** | **_nightCandSort の改善（より均等な分散）** | L1340-1352: 三次キーまでのソート精度向上 | 低（shortage 数より shortage 日の均等化） | 低 |

---

### ⑦ 実装難易度

| 改善案 | 変更ファイル | 変更行数 | 難易度 |
|---|---|---|---|
| NG-2 の緩和（break → _cands 除外後に non-low へ続行） | App.jsx, shiftEngine.js | 各3〜5行 | **低** |
| nightMax デフォルト値変更（5→6） | App.jsx, shiftEngine.js | 各2行 | **極低** |
| autoMax 係数調整（割り算の分母に補正） | App.jsx, shiftEngine.js | 各1行 | **低** |
| C4/C5 条件の部分緩和 | App.jsx, shiftEngine.js | 各2〜4行 | **中** |

---

### ⑧ 効果期待度（コード根拠）

#### NG-2 緩和（最優先候補）

現在のコード:
```javascript
if (_cands.length === 0) break; // shortage を許容
```

これは shortage が確定する **唯一の明示的 break 文**。他の経路（経路α〜ε）はすべて `_cands` が空の状態で while ループに入れないケース（`_cands.length > 0` が初回から false）であり、NG-2 だけが「処理中に候補を能動的に除外してから break する」経路。

**改善後のコード（案）:**
```javascript
// NG-2: low + low ペア禁止。ただし候補が低NR のみの場合は最も経験豊富な low を選択
if (ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤')) {
  const nonLow = _cands.filter(s => !_isLowNR(s));
  if (nonLow.length > 0) {
    _cands = nonLow; // 非 low のみに絞り込み（NG-2 遵守）
  }
  // else: 全員 low の場合 break せず、_cands をそのまま（low+low を許容）
  // または: break のまま（業務要件を遵守しshortage許容）
}
```

#### nightMax デフォルト値変更（5→6）

```javascript
// 現行:
return usedNight < Math.max(s.nightMax || 5, autoMax);
// 変更案:
return usedNight < Math.max(s.nightMax || 6, autoMax);
```

- 効果: 月後半でのフォールバック依存が減少する
- 限界: `autoMax` が nightMax より大きい場合（nightPool 少数時）は autoMax が支配的なため変化なし

---

### ⑨ 副作用リスク

| 改善案 | 主な副作用 | コード上の根拠 |
|---|---|---|
| NG-2 緩和（low+low 許容） | **業務要件違反**: 新人同士夜勤がありうる。事故リスクが施設側の要件に依存 | NG-2 は「nightReadiness=low 同士夜勤ペア禁止」として設計。緩和は要件変更 |
| nightMax 引き上げ | 夜勤回数の特定スタッフへの集中（不公平感）、過重労働リスク | autoMax は均等化機構だが nightMax 引き上げは均等化ロジックより前段の制約 |
| autoMax 係数変更 | 一部スタッフへの夜勤集中（前半に nightMax 超過し後半に候補消滅） | autoMax は nightPool 全体の均等分担の計算式。係数変更で均等性が崩れる |
| C4/C5 緩和 | 夜勤→明け→勤務の遷移制約違反。翌々日が固定勤務でも夜勤配置 → PassC で休みへ変換 → shortage 再発 | C5: `deptWork.has(res[s.id][d+2])` = 翌々日に固定勤務があるのに夜勤 → 明け → 勤務という矛盾 |

---

### ⑩ 変更対象ファイル

| ファイル | 理由 |
|---|---|
| **src/App.jsx** | 本番 autoGenerate の実体（L1359〜1406） |
| **src/shiftEngine.js** | テスト基盤（App.jsx と同一ロジック。両方変更必須） |

---

### ⑪ 想定変更行数

| 改善案 | App.jsx | shiftEngine.js | 合計 |
|---|---|---|---|
| NG-2 完全緩和（break削除のみ） | 1行削除 | 1行削除 | **2行** |
| NG-2 条件付き緩和（low+low 許容に置換） | 4〜6行変更 | 4〜6行変更 | **8〜12行** |
| nightMax デフォルト値変更（5→6） | 2行 | 2行 | **4行** |
| autoMax 係数調整 | 1行 | 1行 | **2行** |

---

### ⑫ PassA を改善する価値があるか

**ある。**

#### コード上の3つの根拠

**根拠1: shortage の75〜81% が夜勤shortage（Step7-DA確認済み）**

Step7-C 実測より: kaigo1 夜勤shortage=0.347/trial, 早番=0.113/trial。夜勤が支配的。
PassA が夜勤 shortage の唯一の生成フェーズ（PassB は夜勤 allowed 除外）。PassA 改善が直接 shortage の主因を叩く。

**根拠2: NG-2 が shortage 確定の唯一の明示的 break 経路**

```javascript
// shiftEngine.js L349 / App.jsx L1386
if (_cands.length === 0) break; // shortage を許容
```

この `break` はコード上で1箇所のみ。他の経路（nightPool 空・全員 canNight=false）は while の入口条件が満たされないだけであり、緩和対象が異なる。NG-2 の break に着目した変更は**最小変更**で直接効果がある。

**根拠3: テスト環境と本番の乖離がNG-2で説明できる**

shiftEngine.js のテスト環境では:
- `facilityYears = 1 + Math.random()*4`（最小1年）
- `floorYears = 1 + Math.random()*3`（最小1年）

→ `_isLowNR` = `fy < 0.5 || fl < 0.2` は発生確率ゼロに近い。

実際の kaigo 部署では入職後間もないスタッフ（facilityYears < 0.5）が複数人いる可能性があり、NG-2 break がテスト環境で再現できていない shortage 発生源になっている可能性がある。

**結論**: Step7-EB（NG-2 緩和案の実装・実測）が最も効果期待度が高い。

---

## shiftEngine.js と App.jsx の PassA 実装差分

| 機能 | App.jsx | shiftEngine.js | 差分の意味 |
|---|---|---|---|
| nightExcludeDays (C1) チェック | **あり** (`s.nightExcludeDays?.has(d)`) | **なし** | テスト環境でクロスフロア制約が再現されない |
| ステップ1.5 アンカー配置 | Phase5 Step3（前後半均等交互マージ） | シンプルな sort のみ | App.jsx の方が均等性が高い |
| maxStaff["夜勤"] チェック（アンカー） | **あり** (`dayNightCount >= maxStaff["夜勤"]`) | **なし** | App.jsx ではアンカー多重配置防止 |
| _nightCandSort | 3キー（回数・前後半・間隔） | 2キー（G-2仮想夜勤数） | App.jsx の方が均等性が高い |
| _lastNightDay トラッキング | **あり** | **なし** | 間隔管理がテスト環境で働かない |
| NG-2 (_isLowNR + break) | **あり**（同一ロジック） | **あり** | 両環境で機能するが、テスト用スタッフのfacilityYears >= 1 なので発動しない |

---

## 調査まとめ表

| 調査項目 | 結論 |
|---|---|
| PassA フロー | ステップ1→1.5（アンカー）→ステップ2（夜勤配置 for d loop → while NG-2/G-1） |
| 夜勤候補生成 | nightPool = `nightOk && _nightAllowed`。canNight で5条件（C1〜C5）除外 |
| 候補除外1位 | nightOk=false（nightPool除外）→ Pool縮小・autoMax増大 |
| 候補除外2位 | lockedDays（C2）- 希望休・有休・アンカー・前月末繰り越し累積 |
| 候補除外3位 | C3（前日夜勤/明け）- 夜勤1回で連続3日消費 |
| shortage break | NG-2（low+low禁止後 _cands空）が唯一の明示的 break |
| NG-2制約 | shiftEngine.jsテスト環境では発動しない（facilityYears>=1） |
| nightExcludeDays | App.jsxのみ（shiftEngine.jsに未実装）→ 本番との乖離源 |
| 改善1位候補 | NG-2 緩和（break削除 or 条件付き許容）: 2〜12行変更 |
| 副作用 | 業務要件変更を伴う（新人ペア夜勤の許容）→ 現場確認必須 |
| 改善する価値 | **ある**（shortage 75〜81%の唯一改善可能フェーズ） |

---

*Phase5 Step7-EA 完了。PassA 夜勤配置の全除外条件・shortage確定経路を特定。NG-2 break が唯一の明示的 shortage 確定経路であり、テスト環境では再現されていない。Step7-EB は NG-2 緩和の実装・実測を推奨（業務要件確認前提）。*
