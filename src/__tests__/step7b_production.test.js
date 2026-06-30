/**
 * Phase5 Step7-B' 本番autoGenerate Before/After 比較テスト
 *
 * shiftEngine.js の bestOfN（本番autoGenerateを呼ぶ）を使用。
 * Before: git stash で actualKyuko > targetKyuko の状態
 * After:  現在の actualKyuko >= targetKyuko の状態
 *
 * このファイルは After 側の計測のみ実施。
 * Before 計測は step7b_production_before.test.js で実施（同一シード・条件）。
 */

import { describe, test, expect } from 'vitest';
import { bestOfN, scoreShifts, getDays, monthKey } from '../shiftEngine.js';

// ─── 統計ユーティリティ ─────────────────────────────────────────────────────
const mean   = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const stddev = a => { const m=mean(a); return a.length ? Math.sqrt(a.map(x=>(x-m)**2).reduce((s,v)=>s+v,0)/a.length) : 0; };

// ─── 定数 ──────────────────────────────────────────────────────────────────
const SIMS = 100;
const YEAR = 2026, MONTH = 5; // 2026年6月(0-indexed)
const DAYS = getDays(YEAR, MONTH); // 30日
const MK   = monthKey(YEAR, MONTH);

// ─── 部署定義（kaigo1/kaigo2 本番相当） ──────────────────────────────────────
function makeDept(id) {
  return {
    id,
    shiftTypes: ['早番','日勤','遅番','夜勤','明け','休み'],
    minStaff: { '早番':1, '日勤':1, '遅番':1, '夜勤':1 },
    maxStaff: { '早番':1, '日勤':99, '遅番':1, '夜勤':1 },
    maxConsecutive: 5,
    customShiftDefs: [],
    roleShiftTypes: {},
    shiftTimes: {},
  };
}

// ─── 乱数（決定論的）────────────────────────────────────────────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

// ─── スタッフ生成（本番相当）──────────────────────────────────────────────
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
      kyukoDays:       kyuko,
      kyukoDaysByMonth: {},
      kiboByMonth:     kibo.length ? {[MK]: kibo} : {},
      yukyuByMonth:    {},
      shiftRequestsByMonth: {},
      shiftRatio:      null,
      shiftRatioByMonth: null,
      facilityYears:   1 + rng()*4,
      floorYears:      1 + rng()*3,
      nightMax:        5,
      foreignNightSupportRequired: false,
      nightExcludeDays: new Set(),
      shiftRatioCorrection: {},
    };
  });
}

// ─── KPI 計測 ─────────────────────────────────────────────────────────────
const REST_SET = new Set(['休み','希望休']);
const WORK_TYPES = new Set(['早番','日勤','遅番','夜勤']);

function measureKPI(res, ds, dept) {
  let shortage=0, nightShort=0, nikkinShort=0, hayaShort=0, osoShort=0;
  let kyukoViol=0, kyukoDeficit=0;

  for (let d=1; d<=DAYS; d++) {
    for (const [k,minC] of Object.entries(dept.minStaff||{})) {
      const actual = ds.filter(s=>res[s.id]?.[d]===k).length;
      const def = Math.max(0, minC - actual);
      shortage += def;
      if (k==='夜勤') nightShort  += def;
      else if (k==='日勤') nikkinShort += def;
      else if (k==='早番') hayaShort   += def;
      else if (k==='遅番') osoShort    += def;
    }
  }
  for (const s of ds) {
    const tgt = s.kyukoDaysByMonth?.[MK] ?? s.kyukoDays ?? 8;
    const act = Object.values(res[s.id]||{}).filter(v=>REST_SET.has(v)).length;
    if (act !== tgt) kyukoViol++;
    if (act < tgt) kyukoDeficit += (tgt - act);
  }
  return { shortage, nightShort, nikkinShort, hayaShort, osoShort, kyukoViol, kyukoDeficit };
}

// ─── メイン計測ループ ────────────────────────────────────────────────────────

describe('Phase5 Step7-B After: bestOfN 100試行×kaigo1/kaigo2 (shiftEngine.js >= 条件)', () => {
  const afterResults = { kaigo1:[], kaigo2:[] };

  test('100試行 実測', { timeout: 300000 }, () => {
    for (let sim=0; sim<SIMS; sim++) {
      for (const deptId of ['kaigo1','kaigo2']) {
        const dept = makeDept(deptId);
        const staffList = makeStaff(deptId, sim);
        const ds = staffList.filter(s=>s.dept===deptId);

        const t0 = Date.now();
        const { shifts } = bestOfN(staffList, dept, YEAR, MONTH, {}, {}, 30, {});
        const elapsed = Date.now() - t0;
        const score   = scoreShifts(shifts, ds, dept, DAYS, YEAR, MONTH, {});
        const kpi     = measureKPI(shifts, ds, dept);

        afterResults[deptId].push({ kpi, score, elapsed });
      }
    }

    // ── 集計出力 ───────────────────────────────────────────────────────────
    for (const deptId of ['kaigo1','kaigo2']) {
      const A = afterResults[deptId];
      const fmt = (key, sub) => {
        const vals = A.map(r => sub ? r[key][sub] : r[key]);
        return { m:mean(vals), s:stddev(vals) };
      };
      console.log(`\n=== AFTER: ${deptId} (n=${SIMS}) ===`);
      console.log(`shortage/trial:   μ=${fmt('kpi','shortage').m.toFixed(3)}  σ=${fmt('kpi','shortage').s.toFixed(3)}`);
      console.log(`夜勤shortage:     μ=${fmt('kpi','nightShort').m.toFixed(3)}`);
      console.log(`日勤shortage:     μ=${fmt('kpi','nikkinShort').m.toFixed(3)}`);
      console.log(`早番shortage:     μ=${fmt('kpi','hayaShort').m.toFixed(3)}`);
      console.log(`遅番shortage:     μ=${fmt('kpi','osoShort').m.toFixed(3)}`);
      console.log(`公休数違反数:     μ=${fmt('kpi','kyukoViol').m.toFixed(3)}  σ=${fmt('kpi','kyukoViol').s.toFixed(3)}`);
      console.log(`公休数不足日計:   μ=${fmt('kpi','kyukoDeficit').m.toFixed(3)}`);
      console.log(`score平均:        μ=${fmt('score',null).m.toFixed(1)}  σ=${fmt('score',null).s.toFixed(1)}`);
      console.log(`生成時間(ms):     μ=${fmt('elapsed',null).m.toFixed(1)}`);
    }

    // 最低限の sanity check
    expect(afterResults.kaigo1.length).toBe(SIMS);
    expect(afterResults.kaigo2.length).toBe(SIMS);
  });
});
