// Step C 実データ比較ハーネス（研究用・本番非改変）:
// real_input.json(実データ・対象月を隠して学習済み learn 入り)で、
// 段階0 今のエンジン(bestOfN) / 段階1 素CP-SAT(率・頻度) / 段階2 +休み目的 /
// 段階3 頻度ベース / 段階4 +休み100%ハード を、既存 computeBacktestMetrics で比較する。
// 本番 core.js は読み取り利用のみ。DB非改変。一時JSONはこのフォルダに置き最後に消す。
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { bestOfN, getDays, monthKey } from '../../src/engine/core.js';
import { computeBacktestMetrics } from '../../src/research/backtest.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const inp = JSON.parse(fs.readFileSync(path.join(HERE, 'real_input.json'), 'utf8'));
const Y = inp.year, M0 = inp.month, dim = inp.days, DEPT = 'kaigo2';
const WORK = inp.shiftTypes;
const mk = monthKey(Y, M0);
const REST = new Set(['休み', '希望休', '有休']);

// ── learn から bestOfN 用の trend を再構成（実エンジンが読む dowShiftRate/dowRestRate） ──
// 注: 生の観測(dowShiftObs等)は入力に無いため強癖preemptionは弱まる(近似)。学習の率自体は忠実。
function buildTrend(staff) {
  const trend = { _monthCounts: {} };
  for (const s of staff) {
    const L = s.learn || {};
    const dowShiftRate = [];
    for (let dow = 0; dow < 7; dow++) dowShiftRate[dow] = (L.rate && (L.rate[dow] || L.rate[String(dow)])) || {};
    const dowRestRate = [];               // 月=0..日=6 に戻す: dowRestRate[j] = rest[(j+1)%7]
    for (let j = 0; j < 7; j++) { const r = L.rest ? L.rest[(j + 1) % 7] : null; dowRestRate[j] = (r == null ? null : r); }
    trend[s.name] = { dowShiftRate, dowRestRate };
    trend._monthCounts[s.name] = 3;
  }
  return trend;
}

// ── bestOfN 用の staff / dept / prevTail ──
const staffList = inp.staff.map(s => ({
  id: s.id, name: s.name, dept: DEPT, role: s.role, nightOk: !!s.nightOk, nightMax: 5,
  kyukoDays: s.kyukoDays, kiboByMonth: { [mk]: s.kibo || [] }, yukyuByMonth: { [mk]: s.yukyu || [] },
  shiftRequestsByMonth: { [mk]: s.requests || {} },
}));
const dept = { id: DEPT, label: '介護部2階', shiftTypes: WORK, minStaff: inp.minStaff, maxStaff: inp.maxStaff,
  maxConsecutive: inp.maxConsec || 5, customShiftDefs: [], roles: ['介護福祉士','介護職員','特定技能','介護補助','介護助手'], roleShiftTypes: inp.roleShiftTypes || {} };
const prevDays = getDays(M0 === 0 ? Y - 1 : Y, M0 === 0 ? 11 : M0 - 1);
const prevTail = {};
for (const [sid, t] of Object.entries(inp.prevTail || {})) if (t?.lastShift) prevTail[sid] = { [prevDays]: t.lastShift };

const trend = buildTrend(inp.staff);
const actual = inp.actual;

// 段階0: 今のエンジン(bestOfN 30回)
const engineRun = bestOfN(staffList, dept, Y, M0, {}, trend, 30, prevTail).shifts;

// CP-SAT 各段階
function cpsat(mode, opts) {
  const out = path.join(HERE, `_c_${mode}_${opts || 'x'}.json`);
  execFileSync('python3', [path.join(HERE, 'solve.py'), path.join(HERE, 'real_input.json'), out, mode, opts || ''],
    { stdio: ['ignore', 'ignore', 'inherit'] });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}
const stages = [
  ['段階0 今のエンジン', engineRun],
  ['段階1 素CP-SAT率',  cpsat('rate', '')],
  ['段階1 素CP-SAT頻度', cpsat('freq', '')],
  ['段階2 率+休み目的',  cpsat('rate', 'rest')],
  ['段階3 頻度+休み目的', cpsat('freq', 'rest')],
  ['段階4 頻度+休+休100ハード', cpsat('freq', 'rest,hard100')],
].map(([name, r]) => [name, r.solution ? r : { solution: r }]); // engineRun is raw shifts

function met(run) {
  if (!run || !Object.keys(run).length) return null;
  return computeBacktestMetrics({ actual, runs: [run], staffList, dept, trend, year: Y, month: M0 });
}
const cols = stages.map(([name, r]) => [name, met(r.solution)]);
const pc = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
const pad = (s, n) => String(s).padEnd(n);
const NW = 26;

console.log('\n=== Step C 実データ比較 (介護部2階・2026-08を隠して検証・9名) ===');
console.log('CP-SAT status:', stages.slice(1).map(([n, r]) => `${n.replace('段階','').slice(0,10)}=${r.status}/${r.verify?.ok}`).join('  '));
const header = '指標'.padEnd(16) + '| ' + cols.map(c => pad(c[0], NW)).join('| ');
console.log('\n' + header);
console.log('セル一致率A'.padEnd(16) + '| ' + cols.map(c => pad(c[1] ? pc(c[1].A.avg) : '—', NW)).join('| '));
for (const T of WORK) console.log(('再現率C ' + T).padEnd(16) + '| ' + cols.map(c => { const cc = c[1]?.C.find(x => x.type === T); return pad(cc ? pc(cc.avg) : '—', NW); }).join('| '));
console.log('休みF平均絶対差'.padEnd(16) + '| ' + cols.map(c => pad(c[1] && c[1].fMeanAbsDiff != null ? (c[1].fMeanAbsDiff*100).toFixed(1)+'pt' : '—', NW)).join('| '));

console.log('\n個別セル一致率:');
const bm = cols.map(c => { const m = {}; c[1]?.B.forEach(b => m[b.name] = b.avg); return m; });
// 個別行のスタッフ名は入力(real_input.json・gitignore)から実行時に参照する。ソースに実名を書かない。
const shown = staffList.map(s => s.name);
for (const nm of shown) console.log(('  ' + nm).padEnd(16) + '| ' + bm.map(m => pad(pc(m[nm]), NW)).join('| '));

for (const f of fs.readdirSync(HERE)) if (f.startsWith('_c_')) { try { fs.unlinkSync(path.join(HERE, f)); } catch {} }
