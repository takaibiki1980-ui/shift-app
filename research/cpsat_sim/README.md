# CP-SAT バックテスト・シミュレーター (研究用・本番非改変)

本番のシフト生成エンジン(`src/engine/core.js`)・生成経路・DBには一切関与しない、隔離された
実験ツール。「入力は今のYEIXと同じ、配置の計算方法だけ CP-SAT(制約最適化)に変える」ことで、
今のエンジンと**フェアに比較**し「作り直す価値があるか」を本番を壊さず検証する。

## 状態: Step A (ハード制約のみ・実行可能解の確認)
学習目的(dowRestRate/dowShiftRate)はまだ入れない。全ハード制約を満たす解が出るかだけを確認する。

## セットアップ
    pip install -r requirements.txt   # ortools (CP-SAT)

## 使い方
    python3 make_sample.py                          # 合成サンプル入力を生成(実データが無い時)
    python3 solve.py sample_input.json solution.json # ハード制約のみで解く→検算
    node   verify_metrics.mjs solution.json sample_input.json  # 既存指標に通せるか確認

実データを使う場合: App のバックテストタブ(is_admin)の「⬇ CP-SAT入力JSON」ボタンで
`cpsat_input_YYYY_M_dept.json` を書き出し、それを solve.py に渡す。

## Step A 実測結果 (合成: 介護部2階相当 9名/30日)
- `status=OPTIMAL` / `verify_ok=True` / 約0.1秒 で全ハード制約を満たす実行可能解。
- 解を `computeBacktestMetrics` に投入→ 指標(A/C/F)が計算できることを確認(疎通OK)。

## 次: Step B
入力に既にある `actual`(実績) を答えに、目的関数(学習適合+夜勤公平性)を追加し、
今のエンジン(bestOfN)と**同じ指標**で一致率・夜勤再現率を比較する。

## 本番非改変の担保
- 変更は `research/cpsat_sim/*` と、App の BacktestView に**読み取り専用の書き出しボタン**のみ。
- `core.js`・生成関数・DB書き込みには一切触れない。solve.py は Python の隔離プロセス。

## Step B (学習目的 + 今のエンジンとの比較)
    node compare.mjs        # 合成データで 今のエンジン vs CP-SAT率 vs CP-SAT頻度 を同一指標で比較
    python3 solve.py in.json out.json rate   # 率ベース目的で解く
    python3 solve.py in.json out.json freq   # 頻度ベース目的で解く(今日の教訓: 率でなく頻度)

### Step B 実測(合成・介護部2階相当 9名 / 対象2025-08を隠し 01-07で学習)
| 指標 | 今のエンジン | CP-SAT率 | CP-SAT頻度 |
|---|---|---|---|
| セル一致率A | 33.7% | **39.1%** | 38.0% |
| 再現率C 早番 | 31.0% | **48.3%** | 37.9% |
| 再現率C 遅番 | 28.6% | 39.3% | **46.4%** |
| 再現率C 夜勤 | 30.0% | **36.7%** | 36.7% |
| 再現率C 日勤 | 52.6% | 50.5% | 50.5% |
| 休みF 平均絶対差 | **5.4pt** | 9.0pt | 10.6pt |

- CP-SATは YEIX が弱い **早番/遅番/夜勤の再現率で明確に改善**、全体一致率も +4〜5pt。
- 一方 **休みの曜日分布(F)は悪化**、個別では大半の正社員が改善するが伊藤は低下(要調整)。
- ＝「作り直す価値あり」の芽はあるが、休み目的の重み・個別調整が次の論点。実データでの再検証が必須。
