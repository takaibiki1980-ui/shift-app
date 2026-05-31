// G-2 感度調整比較スクリプト
// 案A(high+2/med+1) / 案B(high+3/med+1.5) / 案C=現行(high+4/med+2) を比較
// 実装(shiftEngine.js)は変更せず、一時ファイルでパラメータを差し替えて検証

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const YEAR = 2026, MONTH = 5;
const N_RUNS = 30;
const days = new Date(YEAR, MONTH + 1, 0).getDate();

// ── 比較パラメータ ───────────────────────────────────────────────
// G-2 OFF = _rrVN={0,0,0} だが rr=high 分類は維持（正しい比較基準）
const SCENARIOS = [
  { label: 'G-2 OFF (基準)', high: 0,   medium: 0   },  // G-2無効・G-1有効
  { label: '案A',            high: 2,   medium: 1   },
  { label: '案B',            high: 3,   medium: 1.5 },
  { label: '案C (現行)',     high: 4,   medium: 2   },
];

// ── スタッフ定義（test_realdata.mjs と同一構成） ─────────────────
function getRelocationRisk(s) {
  const fy = s.facilityYears, fl = s.floorYears;
  if (fy == null || fl == null) return 'low';
  return (fy >= 2 && fl < 0.5) ? 'high' : (fy >= 1 && fl < 0.3) ? 'medium' : 'low';
}

const makeStaff = (id, name, role, nightOk, opts = {}) => ({
  id, name, dept: 'kaigo1', role,
  nightOk, nightMax: opts.nightMax ?? 8,
  kyukoDays: 8,
  facilityYears: opts.facilityYears ?? null,
  floorYears:    opts.floorYears ?? null,
  foreignNightSupportRequired: opts.foreignNightSupportRequired ?? false,
  kiboByMonth: {}, yukyuByMonth: {},
  shiftRequestsByMonth: {}, kyukoDaysByMonth: {},
  kiboNightPreference: 0,
});

const staffFlagged = [
  makeStaff('k0','田中 花子',  '介護福祉士', true,  {facilityYears:4.0, floorYears:3.0}),
  makeStaff('k1','鈴木 一郎',  '介護福祉士', true,  {facilityYears:5.0, floorYears:4.0}),
  makeStaff('k2','佐藤 美咲',  '介護福祉士', true,  {facilityYears:3.0, floorYears:2.0}),
  makeStaff('k3','山田 太郎',  '介護職員',   true,  {facilityYears:2.5, floorYears:0.3}), // rr=high
  makeStaff('k4','伊藤 さくら','介護職員',   true,  {facilityYears:2.2, floorYears:0.4}), // rr=high
  makeStaff('k5','中村 健',    '介護職員',   true,  {facilityYears:1.5, floorYears:1.0}),
  makeStaff('k6','レア(特定技能)', '特定技能', true, {foreignNightSupportRequired:true, nightMax:5}),
  makeStaff('k7','マリア(特定技能)','特定技能',true, {foreignNightSupportRequired:true, nightMax:5}),
  makeStaff('k8','吉田 幸',    '介護補助',   false),
  makeStaff('k9','渡辺 亮',    '介護補助',   false),
];

const dept = {
  id: 'kaigo1',
  shiftTypes: ['早番','日勤','遅番','夜勤'],
  minStaff:   {'早番':1,'日勤':2,'遅番':1,'夜勤':2},
  maxStaff:   {'早番':1,'遅番':1,'夜勤':2},
  maxConsecutive: 5, customShiftDefs: [], intervalThreshold: null,
  roleShiftTypes: {'介護補助':['日勤']},
};

// ── エンジン一時ファイル生成・インポート・削除 ──────────────────
const SRC = fs.readFileSync(path.join(__dirname, 'src/shiftEngine.js'), 'utf8');

async function runScenario(sc) {
  // _rrVN のみ差し替え（スタッフフラグは全シナリオで同一）
  const src = SRC.replace(
    /const _rrVN = \{low: 0, medium: [\d.]+, high: [\d.]+\}/,
    `const _rrVN = {low: 0, medium: ${sc.medium}, high: ${sc.high}}`
  );

  const tmpPath = path.join(__dirname, `_tmp_engine_${sc.label.replace(/[^a-zA-Z0-9]/g,'')}.mjs`);
  fs.writeFileSync(tmpPath, src);

  try {
    const mod = await import(`${tmpPath}?t=${Date.now()}`);
    const autoGenerate = mod.autoGenerate;
    const staffToUse = staffFlagged;  // 全シナリオ同一スタッフ

    const results = [];
    for (let i = 0; i < N_RUNS; i++) {
      const { shifts } = autoGenerate(staffToUse, dept, YEAR, MONTH, {}, {});
      results.push(analyzeOne(shifts, staffToUse));
    }
    return aggregate(results, staffToUse);
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

// ── 1回分析 ─────────────────────────────────────────────────────
function analyzeOne(shifts, staffList) {
  const ds = staffList.filter(s => s.dept === 'kaigo1');
  let totalShortage = 0, nightShortage = 0, g1Days = 0, g1Fail = 0;

  for (let d = 1; d <= days; d++) {
    for (const [k, minC] of Object.entries(dept.minStaff)) {
      const cnt = ds.filter(s => shifts[s.id]?.[d] === k).length;
      if (cnt < minC) {
        totalShortage += minC - cnt;
        if (k === '夜勤') nightShortage += minC - cnt;
      }
    }
    const nightStaff = ds.filter(s => shifts[s.id]?.[d] === '夜勤');
    const hasForeign = nightStaff.some(s => s.foreignNightSupportRequired);
    if (hasForeign) {
      g1Days++;
      if (!nightStaff.some(s => !s.foreignNightSupportRequired)) g1Fail++;
    }
  }

  const nightOkStaff = ds.filter(s => s.nightOk);
  const nightCounts  = nightOkStaff.map(s =>
    Object.values(shifts[s.id] || {}).filter(v => v === '夜勤').length
  );
  const rrHighCounts = ds.filter(s => getRelocationRisk(s) === 'high')
    .map(s => Object.values(shifts[s.id] || {}).filter(v => v === '夜勤').length);
  const rrLowCounts = ds.filter(s => getRelocationRisk(s) === 'low' && s.nightOk && !s.foreignNightSupportRequired)
    .map(s => Object.values(shifts[s.id] || {}).filter(v => v === '夜勤').length);

  return {
    totalShortage, nightShortage,
    nightMax: nightCounts.length ? Math.max(...nightCounts) : 0,
    nightMin: nightCounts.length ? Math.min(...nightCounts) : 0,
    rrHighAvg: rrHighCounts.length ? rrHighCounts.reduce((a,b)=>a+b,0)/rrHighCounts.length : 0,
    rrLowAvg:  rrLowCounts.length  ? rrLowCounts.reduce((a,b)=>a+b,0)/rrLowCounts.length   : 0,
    rrHighCounts, // per-staff detail
    g1Days, g1Fail,
    nightByStaff: Object.fromEntries(
      nightOkStaff.map(s => [s.name, Object.values(shifts[s.id]||{}).filter(v=>v==='夜勤').length])
    ),
  };
}

function aggregate(results, staffList) {
  const n = results.length;
  const avg = key => results.reduce((s,r) => s+r[key], 0) / n;
  const g1Total = results.reduce((s,r)=>s+r.g1Days, 0);
  const g1Fail  = results.reduce((s,r)=>s+r.g1Fail, 0);

  // per-staff night averages
  const ds = staffList.filter(s=>s.dept==='kaigo1' && s.nightOk);
  const perStaff = {};
  for (const s of ds) {
    perStaff[s.name] = (results.reduce((sum,r)=>sum+(r.nightByStaff[s.name]||0),0)/n);
  }

  return {
    totalShortage: avg('totalShortage'),
    nightShortage: avg('nightShortage'),
    nightSpread:   avg('nightMax') - avg('nightMin'),
    rrHighAvg:     avg('rrHighAvg'),
    rrLowAvg:      avg('rrLowAvg'),
    g1Rate:        g1Total > 0 ? ((g1Total-g1Fail)/g1Total*100) : null,
    perStaff,
  };
}

// ── メイン ──────────────────────────────────────────────────────
const f2 = v => v == null ? '—' : v.toFixed(2);
const f1 = v => v == null ? '—' : v.toFixed(1);
const fp = v => v == null ? '—' : v.toFixed(1)+'%';

console.log('\n' + '='.repeat(72));
console.log('G-2 感度調整 比較レポート');
console.log(`対象月: ${YEAR}年${MONTH+1}月  各${N_RUNS}回平均  夜勤2枠構成  外国人2名+rr=high2名`);
console.log('='.repeat(72));

process.stdout.write('\n計算中...');
const scResults = [];
for (const sc of SCENARIOS) {
  process.stdout.write(` [${sc.label}]`);
  const r = await runScenario(sc);
  scResults.push({ sc, r });
}
console.log(' 完了\n');

const HR = '─'.repeat(72);

// ── 比較表1: メイン指標 ──────────────────────────────────────────
console.log('【比較表1】メイン指標\n');
const COL = 16;
const pad = (s, n=COL) => String(s).padStart(n);
const padL = (s, n=COL) => String(s).padEnd(n);

console.log(padL('指標', 22) + SCENARIOS.map(sc=>pad(sc.label)).join(''));
console.log(HR);

const base = scResults.find(x=>x.sc.label==='G-2 OFF (基準)').r;

const rows = [
  ['rr=high 夜勤回数',     r => f1(r.rrHighAvg) + '回'],
  ['rr=low 夜勤回数',      r => f1(r.rrLowAvg)  + '回'],
  ['抑制率 (vs G-2 OFF)',   (r) => {
    if (r.rrHighAvg === base.rrHighAvg) return '—(基準)';
    const pct = ((r.rrHighAvg - base.rrHighAvg)/Math.max(base.rrHighAvg,0.01)*100);
    return (pct>=0?'+':'')+pct.toFixed(0)+'%';
  }],
  ['total shortage',       r => f2(r.totalShortage)],
  ['  うち夜勤 shortage',  r => f2(r.nightShortage)],
  ['Δshortage (vs G-2 OFF)',(r) => {
    const d = r.totalShortage - base.totalShortage;
    return (d>=0?'+':'')+d.toFixed(2);
  }],
  ['夜勤偏り (最大-最小)', r => f2(r.nightSpread) + '回'],
  ['G-1 同席率',           r => fp(r.g1Rate)],
];

for (const [label, fn] of rows) {
  const line = padL(label, 22) + scResults.map(({r},i) => pad(fn(r,i))).join('');
  console.log(line);
}

// ── 比較表2: rr=high個人別夜勤回数 ─────────────────────────────
console.log('\n\n【比較表2】rr=high 職員別 夜勤回数\n');
const rrHighStaff = staffFlagged.filter(s=>getRelocationRisk(s)==='high');
console.log(padL('職員', 22) + SCENARIOS.map(sc=>pad(sc.label)).join(''));
console.log(HR);
for (const s of rrHighStaff) {
  const line = padL(`${s.name} (rr=high)`, 22) +
    scResults.map(({r}) => pad(f1(r.perStaff[s.name]||0)+'回')).join('');
  console.log(line);
}
// rr=low 代表も表示
const rrLowStaff = staffFlagged.filter(s=>getRelocationRisk(s)==='low' && s.nightOk && !s.foreignNightSupportRequired);
for (const s of rrLowStaff) {
  const line = padL(`${s.name} (rr=low)`, 22) +
    scResults.map(({r}) => pad(f1(r.perStaff[s.name]||0)+'回')).join('');
  console.log(line);
}
const foreignStaff = staffFlagged.filter(s=>s.foreignNightSupportRequired);
for (const s of foreignStaff) {
  const line = padL(`${s.name} (外国人)`, 22) +
    scResults.map(({r}) => pad(f1(r.perStaff[s.name]||0)+'回')).join('');
  console.log(line);
}

// ── 推奨案の根拠 ────────────────────────────────────────────────
console.log('\n\n【考察】\n');
console.log('判定基準:');
console.log('  ① rr=high 抑制効果あり (base比で減少)');
console.log('  ② Δshortage ≤ +3.0 (ノイズ範囲±1を考慮)');
console.log('  ③ G-1 同席率 ≥ 95%');
console.log('  ④ 夜勤偏り ≤ 5回');
console.log('');

for (const { sc, r } of scResults) {
  if (sc.label === 'G-2 OFF (基準)') continue;
  const dS = r.totalShortage - base.totalShortage;
  const ok1 = r.rrHighAvg < base.rrHighAvg;
  const ok2 = dS <= 3.0;
  const ok3 = r.g1Rate == null || r.g1Rate >= 95;
  const ok4 = r.nightSpread <= 5;
  const pass = [ok1,ok2,ok3,ok4].filter(Boolean).length;
  const marks = [ok1?'✓':'✗', ok2?'✓':'✗', ok3?'✓':'✗', ok4?'✓':'✗'];
  console.log(`  ${sc.label.padEnd(14)}: ①${marks[0]} ②${marks[1]}(Δ${dS>=0?'+':''}${dS.toFixed(1)}) ③${marks[2]} ④${marks[3]}  → ${pass}/4 条件クリア`);
}

console.log('');
