/**
 * Phase5 Step7-C 本番autoGenerate Before/After 比較
 *
 * minStaff保証 pass回数: Before(pass<3) vs After(pass<5)
 * shiftEngine.js の bestOfN を直接使用。
 * このファイルは "現在の shiftEngine.js 状態" で実行する（Before or After 両用）。
 * 出力ラベルは実行時の環境変数 STEP7C_LABEL で切り替え。
 *
 * Usage:
 *   STEP7C_LABEL=AFTER  npx vitest run src/__tests__/step7c_production.test.js
 *   STEP7C_LABEL=BEFORE npx vitest run src/__tests__/step7c_production.test.js
 */

import { describe, test, expect } from 'vitest';
import { bestOfN, scoreShifts, getDays, monthKey } from '../shiftEngine.js';

const mean   = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const stddev = a => { const m=mean(a); return a.length ? Math.sqrt(a.map(x=>(x-m)**2).reduce((s,v)=>s+v,0)/a.length) : 0; };

const LABEL = process.env.STEP7C_LABEL ?? 'UNKNOWN';
const SIMS  = 150;
const YEAR  = 2026, MONTH = 5;
const DAYS  = getDays(YEAR, MONTH);
const MK    = monthKey(YEAR, MONTH);

function makeDept(id) {
  return {
    id,
    shiftTypes:       ['早番','日勤','遅番','夜勤','明け','休み'],
    minStaff:         { '早番':1, '日勤':1, '遅番':1, '夜勤':1 },
    maxStaff:         { '早番':1, '日勤':99, '遅番':1, '夜勤':1 },
    maxConsecutive:   5,
    customShiftDefs:  [],
    roleShiftTypes:   {},
    shiftTimes:       {},
  };
}

function makePRNG(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

function makeStaff(deptId, sim) {
  const rng = makePRNG(sim * 73 + (deptId === 'kaigo2' ? 50000 : 0));
  return Array.from({length:10}, (_,i) => {
    const idx = i+1;
    const nightOk = idx <= 6;
    const kyuko = Math.floor(rng()*3)+7;
    const kiboCount = rng()<0.4 ? (rng()<0.5?1:2) : 0;
    const kibo = [];
    for (let k=0; k<kiboCount; k++) {
      const d = Math.floor(rng()*28)+1;
      if (!kibo.includes(d)) kibo.push(d);
    }
    return {
      id:   `${deptId}_s${idx}`,
      name: `Staff${deptId}${idx}`,
      dept:  deptId,
      role:  'その他',
      nightOk,
      kyukoDays:        kyuko,
      kyukoDaysByMonth: {},
      kiboByMonth:      kibo.length ? {[MK]: kibo} : {},
      yukyuByMonth:     {},
      shiftRequestsByMonth: {},
      shiftRatio:       null,
      shiftRatioByMonth: null,
      facilityYears:    1 + rng()*4,
      floorYears:       1 + rng()*3,
      nightMax:         5,
      foreignNightSupportRequired: false,
      nightExcludeDays: new Set(),
      shiftRatioCorrection: {},
    };
  });
}

const REST_SET  = new Set(['休み','希望休']);
const WORK_SET  = new Set(['早番','日勤','遅番','夜勤']);

function measureKPI(res, ds) {
  let shortage=0, nightShort=0, nikkinShort=0, hayaShort=0, osoShort=0, maxStaffViol=0;
  let kyukoViol=0, consecViol=0;
  const minStaff = { '早番':1, '日勤':1, '遅番':1, '夜勤':1 };
  const maxStaff = { '早番':1, '日勤':99, '遅番':1, '夜勤':1 };

  for (let d=1; d<=DAYS; d++) {
    for (const [k,minC] of Object.entries(minStaff)) {
      const actual = ds.filter(s=>res[s.id]?.[d]===k).length;
      const def = Math.max(0, minC - actual);
      shortage += def;
      if (k==='夜勤') nightShort  += def;
      else if (k==='日勤') nikkinShort += def;
      else if (k==='早番') hayaShort   += def;
      else if (k==='遅番') osoShort    += def;
    }
    for (const [k,maxC] of Object.entries(maxStaff)) {
      if (maxC >= 99) continue;
      const actual = ds.filter(s=>res[s.id]?.[d]===k).length;
      if (actual > maxC) maxStaffViol += actual - maxC;
    }
  }

  for (const s of ds) {
    const tgt = s.kyukoDaysByMonth?.[MK] ?? s.kyukoDays ?? 8;
    const act = Object.values(res[s.id]||{}).filter(v=>REST_SET.has(v)).length;
    if (act !== tgt) kyukoViol++;
    let consec = 0;
    for (let d=1; d<=DAYS; d++) {
      const sh = res[s.id]?.[d];
      if (WORK_SET.has(sh)) { consec++; if (consec > 5) consecViol++; }
      else consec = 0;
    }
  }

  return { shortage, nightShort, nikkinShort, hayaShort, osoShort, kyukoViol, consecViol, maxStaffViol };
}

describe(`Phase5 Step7-C ${LABEL}: bestOfN 150試行×kaigo1/kaigo2`, () => {
  const allResults = { kaigo1:[], kaigo2:[] };

  test('150試行 実測', { timeout: 600000 }, () => {
    for (let sim=0; sim<SIMS; sim++) {
      for (const deptId of ['kaigo1','kaigo2']) {
        const dept      = makeDept(deptId);
        const staffList = makeStaff(deptId, sim);
        const ds        = staffList.filter(s=>s.dept===deptId);

        const t0      = Date.now();
        const { shifts } = bestOfN(staffList, dept, YEAR, MONTH, {}, {}, 30, {});
        const elapsed = Date.now() - t0;
        const score   = scoreShifts(shifts, ds, dept, DAYS, YEAR, MONTH, {});
        const kpi     = measureKPI(shifts, ds);

        allResults[deptId].push({ kpi, score, elapsed });
      }
    }

    for (const deptId of ['kaigo1','kaigo2']) {
      const R = allResults[deptId];
      const f = (key, sub) => {
        const v = R.map(r => sub ? r[key][sub] : r[key]);
        return `μ=${mean(v).toFixed(3)}  σ=${stddev(v).toFixed(3)}`;
      };
      console.log(`\n=== ${LABEL}: ${deptId} (n=${SIMS}) ===`);
      console.log(`① shortage/trial:  ${f('kpi','shortage')}`);
      console.log(`② 夜勤shortage:    μ=${mean(R.map(r=>r.kpi.nightShort)).toFixed(3)}`);
      console.log(`③ 早番shortage:    μ=${mean(R.map(r=>r.kpi.hayaShort)).toFixed(3)}`);
      console.log(`④ 遅番shortage:    μ=${mean(R.map(r=>r.kpi.osoShort)).toFixed(3)}`);
      console.log(`⑤ 日勤shortage:    μ=${mean(R.map(r=>r.kpi.nikkinShort)).toFixed(3)}`);
      console.log(`⑥ 公休数違反:      ${f('kpi','kyukoViol')}`);
      console.log(`⑦ 連勤違反:        ${f('kpi','consecViol')}`);
      console.log(`⑧ score:          ${f('score',null)}`);
      console.log(`⑩ 生成時間(ms):   ${f('elapsed',null)}`);
      console.log(`⑫ maxStaff違反:   μ=${mean(R.map(r=>r.kpi.maxStaffViol)).toFixed(3)}`);
    }

    expect(allResults.kaigo1.length).toBe(SIMS);
    expect(allResults.kaigo2.length).toBe(SIMS);
  });
});
