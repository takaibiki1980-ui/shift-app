// CP-SAT の解(solution.json)が、既存のバックテスト指標計算に「そのまま通せる」ことの確認。
// 本番エンジンは呼ばない。backtest.js(純関数)と CP-SAT の出力だけを使う。
// 使い方: node verify_metrics.mjs solution.json sample_input.json
import fs from 'fs';
import { computeBacktestMetrics } from '../../src/research/backtest.js';

const [, , solPath = 'solution.json', inPath = 'sample_input.json'] = process.argv;
const sol = JSON.parse(fs.readFileSync(solPath, 'utf8'));
const inp = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const shifts = sol.solution;

// CP-SAT の解は {sid:{day:shift}} ＝ 生成エンジンの run と同一形。runs に入れて指標へ。
const dept = {
  id: 'sim', shiftTypes: inp.shiftTypes,
  minStaff: inp.minStaff, maxStaff: inp.maxStaff, customShiftDefs: [],
};
const staffList = inp.staff.map(s => ({ id: s.id, name: s.name, dept: 'sim' }));
// 実データがある場合は actual に実績を入れる。ここでは「指標が出せる形か」の確認なので
// actual=解 として通す(=セル一致100%になるはず＝パイプライン疎通の確認)。
const actual = shifts;

const m = computeBacktestMetrics({
  actual, runs: [shifts], staffList, dept, trend: {},
  year: inp.year, month: inp.month,
});
console.log('computeBacktestMetrics 疎通OK');
console.log('  セル一致率A(平均):', (m.A.avg * 100).toFixed(1) + '%  (actual=解 なので100%が期待値)');
console.log('  種別別再現率C:', m.C.map(r => `${r.type}:${(r.avg*100).toFixed(0)}%`).join(' '));
console.log('  休み曜日F 平均絶対差:', m.fMeanAbsDiff == null ? '—' : (m.fMeanAbsDiff*100).toFixed(1)+'pt');
console.log('  → 実データを actual に入れれば、今のエンジンと同じ物差しで比較可能(Step B)。');
