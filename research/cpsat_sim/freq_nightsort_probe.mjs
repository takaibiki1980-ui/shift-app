// 段階1 実データ測定(研究用・本番非改変の読み取り): 夜勤ソートの率→頻度を FREQ_BASED_LEARNING の
// ON/OFF で比較する。FREQ_BASED_LEARNING はモジュール定数のため、本スクリプトは「現在のフラグ状態」で
// bestOfN を実行し指標を出す。呼び出し側で core.js のフラグを OFF→ON に切り替えて2回実行し比較する。
// real_input.json(実名含む・gitignore)の learn から trend を再構成(rate/rest/freq + dowCellObs)。
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { bestOfN, getDays, monthKey, FREQ_BASED_LEARNING } from '../../src/engine/core.js';
import { computeBacktestMetrics } from '../../src/research/backtest.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const inp = JSON.parse(fs.readFileSync(path.join(HERE, 'real_input.json'), 'utf8'));
const Y = inp.year, M0 = inp.month, DEPT = 'kaigo2', WORK = inp.shiftTypes, mk = monthKey(Y, M0);

function buildTrend(staff) {
  const trend = { _monthCounts: {} };
  for (const s of staff) {
    const L = s.learn || {};
    const dowShiftRate = [], dowShiftFreq = [], dowCellObs = [];
    for (let dow = 0; dow < 7; dow++) {
      dowShiftRate[dow] = (L.rate && (L.rate[dow] || L.rate[String(dow)])) || {};
      dowShiftFreq[dow] = (L.freq && (L.freq[dow] || L.freq[String(dow)])) || {};
      dowCellObs[dow] = 10; // 実データの regular 職員は観測十分(>=FREQ_MIN_OBS)。頻度フォールバック閾値を通す。
    }
    const dowRestRate = [];
    for (let j = 0; j < 7; j++) dowRestRate[j] = L.rest ? L.rest[(j + 1) % 7] : null;
    trend[s.name] = { dowShiftRate, dowShiftFreq, dowRestRate, dowCellObs };
    trend._monthCounts[s.name] = 3;
  }
  return trend;
}

const staffList = inp.staff.map(s => ({ id: s.id, name: s.name, dept: DEPT, role: s.role, nightOk: !!s.nightOk,
  nightMax: 5, kyukoDays: s.kyukoDays, kiboByMonth: { [mk]: s.kibo || [] }, yukyuByMonth: { [mk]: s.yukyu || [] },
  shiftRequestsByMonth: { [mk]: s.requests || {} } }));
const dept = { id: DEPT, label: '介護部2階', shiftTypes: WORK, minStaff: inp.minStaff, maxStaff: inp.maxStaff,
  maxConsecutive: inp.maxConsec || 5, customShiftDefs: [], roleShiftTypes: inp.roleShiftTypes || {} };
const prevDays = getDays(M0 === 0 ? Y - 1 : Y, M0 === 0 ? 11 : M0 - 1);
const prevTail = {};
for (const [sid, t] of Object.entries(inp.prevTail || {})) if (t?.lastShift) prevTail[sid] = { [prevDays]: t.lastShift };
const trend = buildTrend(inp.staff), actual = inp.actual;

// 制約チェック用
const REST = new Set(['休み', '希望休', '有休']);
function constraints(run, dim) {
  let mustShort = 0, maxExcess = 0, ake = 0;
  for (let d = 1; d <= dim; d++) {
    for (const [k, mn] of Object.entries(dept.minStaff)) { const c = inp.staff.filter(s => run[s.id]?.[d] === k).length; if (c < mn) mustShort++; }
    for (const [k, mx] of Object.entries(dept.maxStaff)) { if (mx >= 99) continue; const c = inp.staff.filter(s => run[s.id]?.[d] === k).length; if (c > mx) maxExcess += c - mx; }
  }
  return { mustShort, maxExcess };
}

const dim = getDays(Y, M0);
// 30回平均で安定化
let sumA = 0, sumNight = 0, per = {}, sumMust = 0, sumMax = 0; const RUNS = 30;
for (let i = 0; i < RUNS; i++) {
  const run = bestOfN(staffList, dept, Y, M0, {}, trend, 30, prevTail).shifts;
  const m = computeBacktestMetrics({ actual, runs: [run], staffList, dept, trend, year: Y, month: M0 });
  sumA += m.A.avg;
  const nc = m.C.find(x => x.type === '夜勤'); sumNight += nc ? nc.avg : 0;
  m.B.forEach(b => { per[b.name] = (per[b.name] || 0) + (b.avg || 0); });
  const cc = constraints(run, dim); sumMust += cc.mustShort; sumMax += cc.maxExcess;
}
const pc = v => (v * 100).toFixed(1) + '%';
console.log(`\n[FREQ_BASED_LEARNING=${FREQ_BASED_LEARNING}] 実データ・${RUNS}回平均`);
console.log(`  セル一致率A       = ${pc(sumA / RUNS)}`);
console.log(`  夜勤再現率C       = ${pc(sumNight / RUNS)}`);
console.log(`  must-fill不足(計)  = ${sumMust}  maxStaff超過(計) = ${sumMax}`);
const _shown = staffList.map(s=>s.name);
for (const nm of _shown)
  console.log(`  ${nm.padEnd(14)} = ${pc((per[nm] || 0) / RUNS)}`);
