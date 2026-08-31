# CP-SATシミュレーター 入力スキーマ

`solve.py` が読む入力JSON。App の BacktestView の「⬇ CP-SAT入力JSON」ボタン（is_admin）で
実データから書き出せる。`make_sample.py` は同形式の合成サンプルを生成する。

```jsonc
{
  "year": 2025,          // 西暦
  "month": 8,            // 0始まり月 (8 = 9月)
  "days": 30,            // 当月日数
  "shiftTypes": ["早番","日勤","遅番","夜勤"],
  "minStaff": {"早番":1,"日勤":1,"遅番":1,"夜勤":1},
  "maxStaff": {"早番":1,"日勤":99,"遅番":1,"夜勤":1},   // 99=上限なし
  "maxConsec": 5,        // 連勤上限
  "roleShiftTypes": {"介護補助":["日勤"]},              // 役職→許可勤務種別(記載なしは全種別可)
  "prevTail": {"R0":{"lastShift":"夜勤"}},              // 前月末最終日のシフト(月境界の明け/遷移用)
  "actual": {"R0":{"1":"日勤", ...}},                   // 実績(答え合わせ用・Step Bの比較で使用/Step Aは任意)
  "staff": [
    {
      "id":"R0","name":"正0","role":"介護福祉士",
      "nightOk": true,          // 夜勤可否
      "kyukoDays": 8,           // 当月の公休数(=休み系セル数と一致させる)
      "kibo": [5,6],            // 希望休(日)
      "yukyu": [],              // 有休(日)
      "requests": {"10":"早番"} // 希望勤務(日→種別)
    }
  ]
}
```

## ハード制約（Step A で solve.py が課すもの）
- 各(スタッフ,日)ちょうど1カテゴリ（勤務種別 + 明け + 休み）
- 希望休/有休/希望勤務を固定
- `minStaff ≤ その日その種別の人数 ≤ maxStaff`
- 夜勤 → 翌日「明け」／「明け」は必ず前日夜勤（孤立明け禁止・前月末prevTail接続）
- 連勤 ≤ maxConsec
- 遷移禁止: 遅番→翌早番/日勤・日勤→翌早番（前月末も接続）
- 公休数 = kyukoDays（休み系セル数で一致）
- 役職/資格: roleShiftTypes 外の種別は不可・夜勤はnightOkのみ

## 出力
`{"status","solveSec","verify":{"ok","problems"},"solution":{sid:{day:shift}}}`。
`solution` は生成エンジンの run と同一形＝`computeBacktestMetrics` にそのまま渡せる。

## Step B: 学習値 `learn`（各スタッフ）と目的関数
各 staff に `learn` を付与すると `solve.py <in> <out> rate|freq` で学習目的が有効になる。
```jsonc
"learn": {
  "rate": {"0":{"早番":0.6,...}, ...},   // dowShiftRate(働いた日の率) getDay 0=日..6=土
  "freq": {"0":{"夜勤":0.3,...}, ...},   // 頻度(その種別の観測/その曜日の総観測=休み含む)
  "rest": [0.2,0.1,...]                   // dowRestRate を getDay基準(0=日..6=土)に並べ替え
}
```
- `rate` = 「働いた日のうちその種別の率」（条件付き）。`freq` = 「その曜日の全出現のうちその種別」（頻度）。
- 目的 = `Σ(1-prob)·w_learn·x + (max夜勤-min夜勤)·w_fair` を最小化。ハード制約は不変。
- モード `none`(Step A) / `rate` / `freq`。比較は `compare.mjs`（合成）または実データ書き出しJSONで。
