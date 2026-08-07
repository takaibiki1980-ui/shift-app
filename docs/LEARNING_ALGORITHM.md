# YEIX 学習傾向システム 研究用ドキュメント

> 目的：本アプリの「学習系アルゴリズム」を研究・再現できる形でまとめた資料。
> **本ドキュメントはコードのロジックを一切変更しない**（抽出・解説のみ）。
> 参照コードはすべて `src/engine/core.js`（生成エンジン）と `src/App.jsx`（呼び出し側）。
> 行番号は作成時点のもの。定数・数式は実コードから採取。

---

## 0. 用語と前提

- **shifts_YYYY_M_deptId**：保存済みシフト（月×部署）。学習の入力。
- **edits_YYYY_M_deptId**：`{staffId:[day,...]}` 人手修正セル。学習で重み1.5倍。
- **confirmed_YYYY_M_deptId**：確定フラグ。`false`（下書き保存のまま）なら学習重み0.3倍。**キー自体が無い**（旧データ・貼り付けデータ）場合は通常重み。
- **例外月(exceptionMonths)**：学習から除外する月（"YYYY-M"）。
- 曜日インデックスの2系統に注意：
  - `dowShiftRate` は **JS標準（0=日,1=月,…6=土）**。
  - `dowRestRate` は **月曜=0 … 日曜=6**（`(getDay()+6)%7`）。

---

## 1. 学習系の全体像（データフロー）

```
[保存シフト shifts_*]  [人手修正 edits_*]  [確定 confirmed_*]  [例外月]
          │                  │                  │              │
          ▼                  ▼                  ▼              ▼
   ┌───────────────────────────────────────────────────────────┐
   │ computeLearnedTrend()  … 学習値の集計（core.js:2231）      │
   │  ・recency weight（直近月ほど重い baseWeight 4→1）         │
   │  ・下書き月 ×0.3 / 人手修正セル ×1.5                        │
   │  ・部署平均ブレンド（データ薄い所を平滑化）                 │
   │  → learnedTrend = { [氏名]: {freq, dowShiftRate,           │
   │        dowRestRate, transitionRate}, _monthCounts }        │
   └───────────────────────────────────────────────────────────┘
          │
          ▼   生成時に dept 単位で参照（App.jsx が learnedTrend を autoGenerate/bestOfN に渡す）
   ┌───────────────────────────────────────────────────────────┐
   │ 生成での3つの効き方                                         │
   │  (a) scoreShifts の学習ペナルティ (1-prob)*LEARN_WEIGHT     │
   │  (b) 配置サンプリング Pass A(休み)/Pass B(勤務) の確率重み  │
   │  (c) 配置プリエンプション（強い曜日癖を公平性より優先）      │
   │      早番/遅番=DOW_STRONG / 夜勤=NIGHT_STRONG / 二次=NIGHT_LEARN│
   └───────────────────────────────────────────────────────────┘
```

学習値は「氏名」をキーに保持され（`result[staff.name]`）、生成側は `nameMatch` で
スタッフに突合して参照する。

---

## 2. 学習値の集計 — `computeLearnedTrend`（core.js:2231）

### 2.1 何を集計しているか（出力構造）

```js
result[staff.name] = { ...freq, transitionRate, dowShiftRate, dowRestRate };
result._monthCounts = monthCounts; // 氏名→観測した月数
```

| 項目 | 意味 | 曜日index |
|---|---|---|
| `freq[shift]` | スタッフ全体でのシフト種別割合（平滑後） | なし |
| `dowShiftRate[dow][shift]` | 曜日別の勤務種別割合（**生成が最も使う値**） | 0=日〜6=土 |
| `dowRestRate[dow]` | 曜日別の休み率 | 月=0〜日=6 |
| `transitionRate[prev][curr]` | 前日→当日の遷移確率（totals≥10のみ） | なし |
| `_monthCounts[name]` | 観測した「異なる月」の数（例外月除外） | — |

> ⚠️ 補足：タスク指示にある `CONF_MONTHS` という定数は**コード上に存在しない**。
> 「信頼度(conf)」に相当する概念は、独立した定数ではなく次の3つで表現されている：
> ① 観測月数 `monthCounts`（プリエンプションのゲート `STRONG_MONTHS`）
> ② 総観測量 `totals`（freqの平滑係数 `alpha=min(1,totals/10)`）
> ③ 曜日別観測量 `workTot`/`tot`（dowShiftRate/dowRestRateのブレンド係数）。

### 2.2 recency weight（直近月ほど重い）

```js
// core.js:2262-2267
const monthsAgo = Math.max(0, nowYM - (keyYear * 12 + keyMonth));
const baseWeight = Math.max(1, 4 - monthsAgo);   // 今月=4, 1ヶ月前=3, 2ヶ月前=2, 3ヶ月以前=1
const confirmedVal = allDBData['confirmed_' + parts.slice(1).join('_')];
const weight = confirmedVal === false ? baseWeight * 0.3 : baseWeight;
```

- **直近4ヶ月に事実上の減衰窓**（今月が4倍、3ヶ月以前は一律1倍）。
- **下書き（confirmed=false）**の月は `×0.3` に減衰。
- `confirmed_*` キーが**無い**場合（旧データ・貼り付けデータ）は `confirmedVal===false` が偽なので**通常 weight** で学習される（＝貼り付けた過去実績はそのまま効く）。

### 2.3 人手修正セルの重み ×1.5

```js
// core.js:2229, 2299-2302
const EDIT_WEIGHT = 1.5;
const ew = editedSet.has(`${staffId}:${dr}`) ? weight * EDIT_WEIGHT : weight;
```
人が手で直したセルは「意図的な選択」とみなし1.5倍重く数える（遷移集計はペア単位のため対象外）。

### 2.4 曜日別集計の本体

```js
// core.js: 勤務種別（dowShiftRate用の生カウント）
if (WORK_SHIFT_SET.has(shift)) {
  const dow = new Date(keyYear, keyMonth, d).getDay();       // 0=日..6=土
  dowShifts[staffId][dow][shift] = (dowShifts[staffId][dow][shift]||0) + ew;
}
// 休み（dowRestRate用・REST_DOW_SET=休み/希望休/有休）
const dow2 = (new Date(keyYear, keyMonth, dr).getDay() + 6) % 7; // 月=0..日=6
dowTotalsR[staffId][dow2] += ew;
if (REST_DOW_SET.has(shift)) dowRests[staffId][dow2] += ew;
```

### 2.5 部署平均ブレンド（薄いデータの平滑化）

**基準集団**＝データが豊富なスタッフのみ（`totals >= 10`）。

```js
// freq: alpha = min(1, totals/10)。観測が少ないほど部署平均に寄せる
const alpha = Math.min(1, totals[staff.id] / 10);
freq[k] = raw * alpha + (deptAvgFreqL[k] || 0) * (1 - alpha);

// dowShiftRate: その曜日の観測量 workTot が2で満点（da=min(1,workTot/2)）
const da = Math.min(1, workTot / 2);
rate[k] = raw * da + (deptAvgDowL[i][k] || 0) * (1 - da);

// dowRestRate: その曜日の総日数 tot が3で満点（ra=min(1,tot/3)）
const ra = Math.min(1, tot / 3);
return raw * ra + (deptAvgRestL[i] ?? raw) * (1 - ra);
```

- **da（dowShiftRate）は workTot≥2 で 1.0**＝その曜日を2回以上観測していれば生率をそのまま採用（部署平均で薄めない）。これがプリエンプションの観測ゲート `STRONG_MONTHS=2`（≒各曜日8〜9回）と噛み合う設計。
- 遷移確率 `transitionRate` は `totals>=10` のスタッフのみ算出（平滑なし）。

### 2.6 例外月の除外

```js
if (exceptionSet.has(`${keyYear}-${keyMonthRaw}`)) continue;
```
イレギュラーな月（大量欠勤・特殊対応等）を学習から外し、癖の推定を歪めない。

---

## 3. 生成での学習の利用（3つの効き方）

### (a) `scoreShifts` の学習ペナルティ（core.js:2063-2088）

```js
const LEARN_TYPES = new Set(dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け'));
const LEARN_REST  = new Set(['休み','希望休']);
...
if (LEARN_TYPES.has(shift)) {
  const dowRate = trend.dowShiftRate?.[dow] ?? null;
  const predictedProb = dowRate ? (dowRate[shift] ?? 0)
                                : (typeof trend[shift] === 'number' ? trend[shift] : 0);
  score += (1 - predictedProb) * LEARN_WEIGHT;              // 勤務種別
} else if (LEARN_REST.has(shift)) {
  const dow6 = (dow + 6) % 7;
  const restProb = trend.dowRestRate?.[dow6] ?? null;
  if (restProb != null) score += (1 - restProb) * LEARN_WEIGHT; // 休み
}
```

- **意味**：その日そのスタッフが実際に取ったシフトの「学習上の確率」が高いほど減点が小さい。`(1-prob)*250` なので、癖に沿う配置ほどスコアが良い（＝低い）。
- **対象外**：`夜勤`・`明け` は `LEARN_TYPES` から除外（＝scoreShiftsの学習ペナルティの対象外。夜勤は別途プリエンプションと二次キーで扱う／明けは夜勤従属）。
- **最大寄与**：1人1日あたり最大 `LEARN_WEIGHT=250`点。

### (b) 配置サンプリング（Pass A=休み / Pass B=勤務）

**Pass A（休み日サンプリング・core.js:1213-1221）**：`dowRestRate` を重みに確率抽出。
```js
const weights = srcDays.map(d => {
  const dow6 = (new Date(year, month, d).getDay() + 6) % 7;
  return Math.max(0.01, trend.dowRestRate[dow6] ?? 0.01);   // 下限0.01
});
const picked = weightedSampleN(srcDays, weights, ...);
```

**Pass B（勤務種別サンプリング・core.js:1398-1420）**：`dowShiftRate` を重みに確率抽出。
```js
if (trend?.dowShiftRate?.[weekday]?.[k] != null) return Math.max(0.01, trend.dowShiftRate[weekday][k]);
else if (trend?.[k] != null)                    return Math.max(0.01, trend[k]);
...
if (deficit > 0) probs[k] = (probs[k] || 0.01) * (1 + deficit * 2); // 最低人数不足は増幅
```
- **下限0.01**：確率0でも僅かに候補に残す（多様性確保・30試行のばらつき源）。
- bestOfN が30候補を生成 → `scoreShifts` で最良を選ぶため、サンプリングの偏り＝癖が結果に反映されやすい。

### (c) 配置プリエンプション（強い曜日癖を公平性より優先）

**早番/遅番（step2.5・core.js:518-533, 1340-1360）**：
```js
const isStrongHabit = (s, weekday, shift) => {
  if (!DOW_STRONG_ENABLED) return false;
  const r = getTrend(s)?.dowShiftRate?.[weekday]?.[shift];
  if (r == null || r < STRONG_RATE) return false;          // 率≥0.5
  return getMonthCount(s) >= STRONG_MONTHS;                 // 観測≥2ヶ月
};
// ソート: 片方だけstrong→strong優先（総回数公平性 ua-ub を飛び越える）
const sA = isStrongHabit(a, weekday, shiftType), sB = isStrongHabit(b, weekday, shiftType);
if (sA !== sB) return sA ? -1 : 1;
// 両方strong→率が高い順 / 両方non-strong→従来（公平性→dowShiftRate二次キー→乱数）
```

**夜勤（_nightCandSort・core.js:717-746）**：
```js
const _isStrongNight = (s, dow) => {
  if (!NIGHT_STRONG_ENABLED) return false;
  const r = getTrend(s)?.dowShiftRate?.[dow]?.['夜勤'];
  return r != null && r >= STRONG_RATE && getMonthCount(s) >= STRONG_MONTHS;
};
// ⓪ 強い夜勤癖のプリエンプション（総回数公平性より前）
// ① 夜勤総回数の公平性（must-fill・候補プールは不変＝並べ替えのみ）
// ②(NIGHT_LEARN_ENABLED) 同回数内で dowShiftRate['夜勤'][dow] の高い人を優先（二次キー）
// ③ 半月バランス ④ 間隔
```
- **must-fill 厳守**：候補プール（nightOk かつ役職可）と nightMax 救済弁は不変。**並べ替えのみ**なので夜勤が埋まらなくなることはない。

---

## 4. 制約との関係（scoreShifts の重み一覧・core.js:1984-2088）

| 制約 | 重み（点） | 備考 |
|---|---|---|
| 公休乖離 | `|actual-target| × 10000` /日 | 最上位のハード級 |
| 役職違反 | `5000` /件 | |
| 公平性（配置バランス） | `2000`級 | 学習の“上限”はここ側 |
| 同一シフト4連 / 5連以上 | `1500` / `6000` /日 | |
| **学習（勤務・休み）** | `(1-prob) × 250` /日 | **LEARN_WEIGHT=250** |
| maxStaff超過 | `(actual-max) × 150` /日 | |
| maxConsec超過・遷移違反 | `100` /件 | |

設計方針（core.js:5-10 のコメント）：
> **公休10000 > 役職5000 > 公平性2000 > 同一4連1500 > maxStaff150 ≧ 学習。**
> LEARN_WEIGHT を 30→150→250 と上げてきたが、`250>maxStaff単価150` でも、早番/遅番/夜勤は
> **Tier1「役割席」**で repair が maxStaff を別途強制するため maxStaff超過は構造的に0のまま。
> 上げすぎの上限は**公平性2000側**（学習を上げすぎると公平性が崩れる）。

### なぜ「採点」より「配置」の方が学習を強く効かせられるか（考察）

- **scoreShifts（採点）は相対比較**：学習250点は公平性2000・公休10000に容易に負ける。30候補の中で他制約が拮抗して初めて学習が効く “タイブレーカー” 的な働き。癖が中程度（例55%）だと、公平性の力（全員に均等配置しようとする力）に押し戻され、体感まで届きにくい。
- **配置プリエンプション（step2.5 / 夜勤ソート）は候補順の直接操作**：`isStrong` を満たす人を**総回数公平性の一次キーを飛び越えて**先頭に置くため、その曜日・そのシフトを**ほぼ確定的に**掴ませられる。採点の綱引きを経ずに配置段階で勝つので、癖の再現が強い。
  - 実測例：柳さんの火曜遅番は採点強化（LEARN_WEIGHT 250）では横ばい、step2.5プリエンプションで 15.5%→23.1% に上昇。夜勤プリエンプションで柳さんの火曜明け 25%→0%（月曜夜勤がカインさんへ移動）。

---

## 5. 調整可能なパラメータ一覧（core.js 冒頭・実値）

| 名前 | 実値 | 制御対象 | 上げると / 下げると |
|---|---|---|---|
| `LEARN_WEIGHT` | `250` | scoreShiftsの学習ペナルティ強度 | 上げ＝採点で癖を重視（但し公平性2000を侵すと副作用）／下げ＝癖が薄まる |
| `DOW_STRONG_ENABLED` | `true` | 早番/遅番の強癖プリエンプション | false＝従来の公平性優先へ即復帰 |
| `NIGHT_STRONG_ENABLED` | `true` | 夜勤の強癖プリエンプション | false＝夜勤は総回数公平性のみ |
| `NIGHT_LEARN_ENABLED` | `true` | 夜勤の学習二次キー（同回数内で曜日癖優先） | false＝ローテ公平性のみ |
| `STRONG_RATE` | `0.5` | 「強い癖」とみなす dowShiftRate 閾値 | 下げ＝より多くを強癖扱い（公平性緩む）／上げ＝厳選 |
| `STRONG_MONTHS` | `2` | 強癖の観測ゲート（monthCounts下限） | 上げ＝確証を要求（発動しにくい）／下げ＝早く発動（誤検出増） |
| `EDIT_WEIGHT` | `1.5` | 人手修正セルの学習倍率 | 上げ＝手修正を強く学習 |
| 減衰窓 | `baseWeight=max(1,4-monthsAgo)` | recency（直近月重視） | 窓を広げるには式を変更（本ドキュメントでは不変） |
| 下書き減衰 | `×0.3` | confirmed=false 月 | — |
| 部署平均ブレンド | `alpha=min(1,totals/10)` / `da=min(1,workTot/2)` / `ra=min(1,tot/3)` | 薄いデータの平滑度 | 分母を上げ＝平滑強（個性が出にくい） |
| サンプリング下限 | `0.01` | Pass A/B の確率下限 | — |

> ※ `dept.allowLateToEarly`（遅番→早番許可）・`TIME_FEATURES_ENABLED`（時間帯系凍結）は
> 学習ではなく制約/表示のフラグ。学習の癖の“出やすさ”に間接影響する（禁止遷移が候補を削るため）。

---

## 6. 学習の限界・特性

1. **再現度は「癖の強さ(%)」に比例する**。実績を忠実に確率反映するため、
   - 79%のような強い癖 → ほぼ忠実に再現。
   - 55%程度の中途半端な癖 → 公平性など他制約と拮抗し、体感ほど強く出ない（中途半端に再現）。
2. **忠実再現ゆえの「体感とのズレ」**。学習は「実際に起きた配置の確率」を写す。
   「本当はもっと○曜が多いはず」という体感が実データに無ければ、生成もそこまで届かない。
   → 体感に寄せたい場合は、①実績を貼り足す／手修正で `EDIT_WEIGHT` を効かせる、
   ②プリエンプション（配置段階）で押し上げる、のどちらかが必要。
3. **データが育つほど癖が固定化・再現度が上がる**。
   - `workTot≥2` でその曜日は部署平均で薄めなくなる（da=1）→ 個性が前面に出る。
   - 会議・行事など**規則的な曜日偏り**は月を重ねるほど強癖化し、`STRONG_RATE` を超えて
     プリエンプション対象になりやすい。
4. **夜勤・明けは scoreShifts の学習対象外**（`LEARN_TYPES` 除外）。夜勤はプリエンプション＋
   二次キー、明けは夜勤従属（前日夜勤の翌日）として扱われる。

---

## 付録：主要コード位置（src/engine/core.js）

| 機能 | 行 |
|---|---|
| 定数（LEARN_WEIGHT/各フラグ/STRONG_*） | 5–33 |
| `EDIT_WEIGHT` | 2229 |
| `computeLearnedTrend` | 2231–2377 |
| recency/confirmed weight | 2262–2267 |
| 部署平均ブレンド | 2320–2371 |
| scoreShifts 各制約の重み | 1984–2088 |
| scoreShifts 学習ペナルティ | 2063–2088 |
| Pass A 休みサンプリング | 1103, 1213–1221 |
| Pass B 勤務サンプリング | 1384–1420 |
| 早番/遅番プリエンプション（isStrongHabit） | 518–533, 1340–1360 |
| 夜勤ソート（_isStrongNight / NIGHT_LEARN 二次キー） | 717–746 |
