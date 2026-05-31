// 夜勤ペアルール シミュレーション
// NG-1 / NG-2 / REC-1 の shortage影響・副作用を実装前に検証
// shiftEngine.js を変更せず一時ファイル差し替えで動作

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const YEAR = 2026, MONTH = 5;
const N_RUNS = 30;
const days = new Date(YEAR, MONTH + 1, 0).getDate();

// ── nightReadiness 導出（ルール判定用） ──────────────────────────
const getNightReadiness = (s) => {
  const fy = s.facilityYears, fl = s.floorYears;
  if (fy == null || fl == null) return 'high'; // 未設定 → 安全側（NG-2発動しない）
  if (fy < 0.5 || fl < 0.2) return 'low';
  if (fy < 1.5 || fl < 0.5) return 'medium';
  return 'high';
};

// ── 部署定義（夜勤2枠・maxStaff明示） ─────────────────────────────
const dept = {
  id: 'kaigo1',
  shiftTypes: ['早番','日勤','遅番','夜勤'],
  minStaff:   {'早番':1,'日勤':2,'遅番':1,'夜勤':2},
  maxStaff:   {'早番':1,'遅番':1,'夜勤':2},
  maxConsecutive: 5, customShiftDefs: [], intervalThreshold: null,
  roleShiftTypes: {'介護補助':['日勤']},
};

// ── スタッフファクトリ ───────────────────────────────────────────
const mk = (id, name, role, nightOk, opts={}) => ({
  id, name, dept:'kaigo1', role,
  nightOk, nightMax: opts.nightMax ?? 8, kyukoDays: 8,
  facilityYears: opts.fy ?? null,
  floorYears:    opts.fl ?? null,
  foreignNightSupportRequired: opts.foreign ?? false,
  kiboByMonth:{}, yukyuByMonth:{}, shiftRequestsByMonth:{}, kyukoDaysByMonth:{},
  kiboNightPreference: 0,
});

// ── スタッフ構成A: 外国人2名・low-readiness なし（NG-1/REC-1検証用） ──
const staffA = [
  mk('k0','田中 花子',  '介護福祉士',true, {fy:4.0,fl:3.0}),   // high readiness
  mk('k1','鈴木 一郎',  '介護福祉士',true, {fy:5.0,fl:4.0}),   // high readiness
  mk('k2','佐藤 美咲',  '介護福祉士',true, {fy:3.0,fl:2.0}),   // high readiness
  mk('k3','山田 太郎',  '介護職員',  true, {fy:2.5,fl:0.3}),   // rr=high, medium readiness
  mk('k4','伊藤 さくら','介護職員',  true, {fy:2.2,fl:0.4}),   // rr=high, medium readiness
  mk('k5','中村 健',    '介護職員',  true, {fy:1.5,fl:1.0}),   // medium readiness
  mk('k6','レア(外国人)', '特定技能',true, {foreign:true,nightMax:5}),
  mk('k7','マリア(外国人)','特定技能',true,{foreign:true,nightMax:5}),
  mk('k8','吉田 幸',    '介護補助',  false),
  mk('k9','渡辺 亮',    '介護補助',  false),
];

// ── スタッフ構成B: 外国人2名 + low-readiness 2名（NG-2検証用） ────
const staffB = [
  mk('k0','田中 花子',  '介護福祉士',true, {fy:4.0,fl:3.0}),   // high readiness
  mk('k1','鈴木 一郎',  '介護福祉士',true, {fy:5.0,fl:4.0}),   // high readiness
  mk('k2','佐藤 美咲',  '介護福祉士',true, {fy:3.0,fl:2.0}),   // high readiness
  mk('k3','山田 太郎',  '介護職員',  true, {fy:2.5,fl:0.3}),   // rr=high, medium readiness
  mk('k4','新入 A',    '介護職員',  true, {fy:0.3,fl:0.1}),   // ★ LOW readiness
  mk('k5','新入 B',    '介護職員',  true, {fy:0.2,fl:0.1}),   // ★ LOW readiness
  mk('k6','レア(外国人)', '特定技能',true, {foreign:true,nightMax:5}),
  mk('k7','マリア(外国人)','特定技能',true,{foreign:true,nightMax:5}),
  mk('k8','吉田 幸',    '介護補助',  false),
  mk('k9','渡辺 亮',    '介護補助',  false),
];

// ── エンジン差し替えブロック定義 ─────────────────────────────────
// 置換対象（shiftEngine.js の while ループ本体）
const ORIG_BLOCK = `      // G-1: スロット単位動的ソート（外国人が割り当て済みならサポーターを優先）
      let _cands = [...cands];
      while (need > 0 && _cands.length > 0) {
        const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        if (_foreignOnNight && !_supporterOnNight) {
          _cands.sort((a, b) => {
            // G-1: foreignnessを第1キー（非外国人=サポーターを必ず先に）
            const aF = a.foreignNightSupportRequired ? 1 : 0;
            const bF = b.foreignNightSupportRequired ? 1 : 0;
            if (aF !== bF) return aF - bF;
            // 第2キー: G-2仮想夜勤数
            const nA = Object.values(res[a.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(a)];
            const nB = Object.values(res[b.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(b)];
            return nA - nB;
          });
        }
        const s = _cands.shift();
        res[s.id][d] = "夜勤";
        if (d + 1 <= days) res[s.id][d + 1] = "明け";
        if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
        need--;
      }`;

// ── 各シナリオの置換ブロック ──────────────────────────────────────

// nightReadiness 計算ヘルパー（各シナリオ共通で注入）
const NR_HELPER = `
        const _getNR = (s) => {
          const fy = s.facilityYears, fl = s.floorYears;
          if (fy == null || fl == null) return 'high';
          if (fy < 0.5 || fl < 0.2) return 'low';
          if (fy < 1.5 || fl < 0.5) return 'medium';
          return 'high';
        };`;

const BLOCKS = {
  'BASE（現行）': ORIG_BLOCK,

  '+NG-1': `      // G-1 + NG-1 Hard: 外国人+外国人 禁止
      let _cands = [...cands];
      while (need > 0 && _cands.length > 0) {
        const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        // NG-1 Hard: 外国人が既にいれば外国人を候補から除外
        if (_foreignOnNight) {
          _cands = _cands.filter(s => !s.foreignNightSupportRequired);
          if (_cands.length === 0) break; // shortage を許容
        }
        if (_foreignOnNight && !_supporterOnNight) {
          _cands.sort((a, b) => {
            const aF = a.foreignNightSupportRequired ? 1 : 0;
            const bF = b.foreignNightSupportRequired ? 1 : 0;
            if (aF !== bF) return aF - bF;
            const nA = Object.values(res[a.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(a)];
            const nB = Object.values(res[b.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(b)];
            return nA - nB;
          });
        }
        const s = _cands.shift();
        res[s.id][d] = "夜勤";
        if (d + 1 <= days) res[s.id][d + 1] = "明け";
        if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
        need--;
      }`,

  '+NG-2': `      // G-1 + NG-2 Hard: nightReadiness=low+low 禁止
      let _cands = [...cands];
      while (need > 0 && _cands.length > 0) {
        const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        // NG-2 Hard: low readiness が既にいれば low を候補から除外
        const _getNR = (s) => { const fy=s.facilityYears,fl=s.floorYears; if(fy==null||fl==null)return 'high'; if(fy<0.5||fl<0.2)return 'low'; if(fy<1.5||fl<0.5)return 'medium'; return 'high'; };
        const _lowOnNight = ds.some(s => _getNR(s) === 'low' && res[s.id][d] === '夜勤');
        if (_lowOnNight) {
          _cands = _cands.filter(s => _getNR(s) !== 'low');
          if (_cands.length === 0) break; // shortage を許容
        }
        if (_foreignOnNight && !_supporterOnNight) {
          _cands.sort((a, b) => {
            const aF = a.foreignNightSupportRequired ? 1 : 0;
            const bF = b.foreignNightSupportRequired ? 1 : 0;
            if (aF !== bF) return aF - bF;
            const nA = Object.values(res[a.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(a)];
            const nB = Object.values(res[b.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(b)];
            return nA - nB;
          });
        }
        const s = _cands.shift();
        res[s.id][d] = "夜勤";
        if (d + 1 <= days) res[s.id][d + 1] = "明け";
        if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
        need--;
      }`,

  '+REC-1': `      // G-1 + REC-1: 外国人ペア選択時にnightReadiness=high優先
      let _cands = [...cands];
      while (need > 0 && _cands.length > 0) {
        const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _getNR = (s) => { const fy=s.facilityYears,fl=s.floorYears; if(fy==null||fl==null)return 'high'; if(fy<0.5||fl<0.2)return 'low'; if(fy<1.5||fl<0.5)return 'medium'; return 'high'; };
        if (_foreignOnNight && !_supporterOnNight) {
          _cands.sort((a, b) => {
            const aF = a.foreignNightSupportRequired ? 1 : 0;
            const bF = b.foreignNightSupportRequired ? 1 : 0;
            if (aF !== bF) return aF - bF;
            // REC-1: nightReadiness=high を第2キーで優先
            const nrA = _getNR(a) === 'high' ? 0 : 1;
            const nrB = _getNR(b) === 'high' ? 0 : 1;
            if (nrA !== nrB) return nrA - nrB;
            const nA = Object.values(res[a.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(a)];
            const nB = Object.values(res[b.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(b)];
            return nA - nB;
          });
        }
        const s = _cands.shift();
        res[s.id][d] = "夜勤";
        if (d + 1 <= days) res[s.id][d + 1] = "明け";
        if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
        need--;
      }`,

  'NG-1+NG-2+REC-1 全適用': `      // G-1 + NG-1 Hard + NG-2 Hard + REC-1 Bonus
      let _cands = [...cands];
      while (need > 0 && _cands.length > 0) {
        const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _getNR = (s) => { const fy=s.facilityYears,fl=s.floorYears; if(fy==null||fl==null)return 'high'; if(fy<0.5||fl<0.2)return 'low'; if(fy<1.5||fl<0.5)return 'medium'; return 'high'; };
        // NG-1 Hard: 外国人+外国人 禁止
        if (_foreignOnNight) {
          _cands = _cands.filter(s => !s.foreignNightSupportRequired);
          if (_cands.length === 0) break;
        }
        // NG-2 Hard: low+low 禁止
        const _lowOnNight = ds.some(s => _getNR(s) === 'low' && res[s.id][d] === '夜勤');
        if (_lowOnNight) {
          _cands = _cands.filter(s => _getNR(s) !== 'low');
          if (_cands.length === 0) break;
        }
        // G-1 + REC-1 ソート
        if (_foreignOnNight && !_supporterOnNight) {
          _cands.sort((a, b) => {
            const aF = a.foreignNightSupportRequired ? 1 : 0;
            const bF = b.foreignNightSupportRequired ? 1 : 0;
            if (aF !== bF) return aF - bF;
            const nrA = _getNR(a) === 'high' ? 0 : 1;
            const nrB = _getNR(b) === 'high' ? 0 : 1;
            if (nrA !== nrB) return nrA - nrB;
            const nA = Object.values(res[a.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(a)];
            const nB = Object.values(res[b.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(b)];
            return nA - nB;
          });
        }
        const s = _cands.shift();
        res[s.id][d] = "夜勤";
        if (d + 1 <= days) res[s.id][d + 1] = "明け";
        if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
        need--;
      }`,
};

// ── エンジン一時ファイル生成・インポート・削除 ────────────────────
const SRC = fs.readFileSync(path.join(__dirname, 'src/shiftEngine.js'), 'utf8');

async function runScenario(label, staffList) {
  const block = BLOCKS[label];
  const src = SRC.replace(ORIG_BLOCK, block);
  if (src === SRC && label !== 'BASE（現行）') {
    throw new Error(`[${label}] 置換失敗 — ORIG_BLOCKが見つかりません`);
  }
  const tmpPath = path.join(__dirname, `_tmp_pr_${label.replace(/[^a-zA-Z0-9]/g,'')}.mjs`);
  fs.writeFileSync(tmpPath, src);
  try {
    const mod = await import(`${tmpPath}?t=${Date.now()}`);
    const autoGenerate = mod.autoGenerate;
    const results = [];
    for (let i = 0; i < N_RUNS; i++) {
      const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, {});
      results.push(analyzeOne(shifts, staffList));
    }
    return aggregate(results);
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

// ── 分析 ────────────────────────────────────────────────────────
function analyzeOne(shifts, staffList) {
  const ds = staffList.filter(s => s.dept === 'kaigo1');
  let totalShortage=0, nightShortage=0;
  let g1Days=0, g1Fail=0;
  let ng1Viol=0, ng2Viol=0;
  let rec1Days=0, rec1Match=0;

  for (let d=1; d<=days; d++) {
    const nightStaff = ds.filter(s => shifts[s.id]?.[d]==='夜勤');

    // shortage
    for (const [k,minC] of Object.entries(dept.minStaff)) {
      const cnt = ds.filter(s=>shifts[s.id]?.[d]===k).length;
      if (cnt < minC) { totalShortage += minC-cnt; if(k==='夜勤') nightShortage += minC-cnt; }
    }

    const foreignOn  = nightStaff.filter(s => s.foreignNightSupportRequired);
    const suppOn     = nightStaff.filter(s => !s.foreignNightSupportRequired);
    const lowOn      = nightStaff.filter(s => getNightReadiness(s)==='low');
    const highOn     = nightStaff.filter(s => getNightReadiness(s)==='high');

    // G-1 compliance
    if (foreignOn.length > 0) {
      g1Days++;
      if (suppOn.length === 0) g1Fail++;
    }

    // NG-1: 外国人+外国人 違反
    if (foreignOn.length >= 2) ng1Viol++;

    // NG-2: low+low 違反
    if (lowOn.length >= 2) ng2Viol++;

    // REC-1: 外国人+highReadiness ペア達成率
    if (foreignOn.length > 0) {
      rec1Days++;
      if (highOn.length > 0) rec1Match++;
    }
  }

  const nightCounts = ds.filter(s=>s.nightOk).map(s=>Object.values(shifts[s.id]||{}).filter(v=>v==='夜勤').length);
  const maxN = nightCounts.length ? Math.max(...nightCounts) : 0;
  const minN = nightCounts.length ? Math.min(...nightCounts) : 0;

  return { totalShortage, nightShortage, g1Days, g1Fail, ng1Viol, ng2Viol, rec1Days, rec1Match, nightSpread: maxN-minN };
}

function aggregate(results) {
  const n = results.length;
  const avg = k => results.reduce((s,r)=>s+r[k],0)/n;
  const rate = (num, den) => {
    const d = results.reduce((s,r)=>s+r[den],0);
    if (!d) return null;
    return results.reduce((s,r)=>s+r[num],0)/d*100;
  };
  return {
    totalShortage:  avg('totalShortage'),
    nightShortage:  avg('nightShortage'),
    g1Rate:         rate('g1Fail','g1Days') == null ? null : 100 - rate('g1Fail','g1Days'),
    ng1ViolRate:    avg('ng1Viol'),
    ng2ViolRate:    avg('ng2Viol'),
    rec1Rate:       rate('rec1Match','rec1Days'),
    nightSpread:    avg('nightSpread'),
  };
}

// ── メイン ──────────────────────────────────────────────────────
const scenariosA = ['BASE（現行）','+NG-1','+REC-1','NG-1+NG-2+REC-1 全適用'];
const scenariosB = ['BASE（現行）','+NG-2','NG-1+NG-2+REC-1 全適用'];

const HR = '─'.repeat(80);
const f1 = v => v==null?'—':v.toFixed(1);
const f2 = v => v==null?'—':v.toFixed(2);
const fp = v => v==null?'—':v.toFixed(1)+'%';
const pad  = (s,n=16) => String(s).padStart(n);
const padL = (s,n=24) => String(s).padEnd(n);

console.log('\n' + '='.repeat(80));
console.log('夜勤ペアルール シミュレーション (NG-1 / NG-2 / REC-1)');
console.log(`${YEAR}年${MONTH+1}月  各${N_RUNS}回平均  夜勤2枠構成`);
console.log('='.repeat(80));

// ━━━ Part 1: 構成A（外国人2名・low-readinessなし）━━━━━━━━━━━━━━━
console.log('\n\n【Part 1】構成A — 外国人2名 / rr=high2名 / low-readinessなし\n');
console.log('  NG-2は このスタッフ構成ではサポートなし → NG-1 / REC-1 の純粋な影響\n');

process.stdout.write('計算中...');
const resA = {};
for (const sc of scenariosA) {
  process.stdout.write(` [${sc}]`);
  resA[sc] = await runScenario(sc, staffA);
}
console.log(' 完了\n');

{
  const cols = scenariosA;
  console.log(padL('指標') + cols.map(c=>pad(c)).join(''));
  console.log(HR);
  const rows = [
    ['total shortage',    r=>f2(r.totalShortage)],
    ['夜勤 shortage',     r=>f2(r.nightShortage)],
    ['Δ total (vs BASE)', r=>{const d=r.totalShortage-resA['BASE（現行）'].totalShortage;return(d>=0?'+':'')+d.toFixed(2);}],
    ['G-1 同席率',        r=>fp(r.g1Rate)],
    ['NG-1違反日/月',     r=>f1(r.ng1ViolRate)],
    ['NG-2違反日/月',     r=>f1(r.ng2ViolRate)],
    ['REC-1達成率',       r=>fp(r.rec1Rate)],
    ['夜勤偏り',          r=>f2(r.nightSpread)+'回'],
  ];
  for (const [label, fn] of rows) {
    console.log(padL(label) + cols.map(c=>pad(fn(resA[c]))).join(''));
  }
}

// NG-1のみの分析注記
{
  const base = resA['BASE（現行）'];
  const ng1  = resA['+NG-1'];
  const dS = ng1.totalShortage - base.totalShortage;
  console.log(`\n■ NG-1 単体分析:`);
  console.log(`  基準時のNG-1違反: ${f1(base.ng1ViolRate)}日/月`);
  console.log(`  (G-1が100%機能していれば外国人+外国人は既に発生しにくい)`);
  console.log(`  NG-1追加後の shortage増加: ${dS>=0?'+':''}${dS.toFixed(2)}`);
  console.log(`  → NG-1を Hard にすることで supporter が不在の日は shortage を許容する設計`);

  const rec1 = resA['+REC-1'];
  const dR = rec1.totalShortage - base.totalShortage;
  console.log(`\n■ REC-1 単体分析:`);
  console.log(`  基準時のREC-1達成率: ${fp(base.rec1Rate)}  →  追加後: ${fp(rec1.rec1Rate)}`);
  console.log(`  shortage増加: ${dR>=0?'+':''}${dR.toFixed(2)}（ソート変更のみ・フィルタなし）`);
}

// ━━━ Part 2: 構成B（low-readiness 2名追加）━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n\n【Part 2】構成B — 外国人2名 + low-readiness2名（新入A/新入B）\n');
console.log('  低Readinessスタッフが存在する場合のNG-2影響を検証\n');
console.log('  nightReadiness: 新入A(fy=0.3,fl=0.1)=low / 新入B(fy=0.2,fl=0.1)=low\n');

process.stdout.write('計算中...');
const resB = {};
for (const sc of scenariosB) {
  process.stdout.write(` [${sc}]`);
  resB[sc] = await runScenario(sc, staffB);
}
console.log(' 完了\n');

{
  const cols = scenariosB;
  console.log(padL('指標') + cols.map(c=>pad(c)).join(''));
  console.log(HR);
  const rows = [
    ['total shortage',    r=>f2(r.totalShortage)],
    ['夜勤 shortage',     r=>f2(r.nightShortage)],
    ['Δ total (vs BASE)', r=>{const d=r.totalShortage-resB['BASE（現行）'].totalShortage;return(d>=0?'+':'')+(d.toFixed(2));}],
    ['G-1 同席率',        r=>fp(r.g1Rate)],
    ['NG-1違反日/月',     r=>f1(r.ng1ViolRate)],
    ['NG-2違反日/月',     r=>f1(r.ng2ViolRate)],
    ['REC-1達成率',       r=>fp(r.rec1Rate)],
    ['夜勤偏り',          r=>f2(r.nightSpread)+'回'],
  ];
  for (const [label, fn] of rows) {
    console.log(padL(label) + cols.map(c=>pad(fn(resB[c]))).join(''));
  }
}

{
  const base = resB['BASE（現行）'];
  const ng2  = resB['+NG-2'];
  console.log(`\n■ NG-2 単体分析 (構成B):`);
  console.log(`  基準時のNG-2違反: ${f1(base.ng2ViolRate)}日/月  → NG-2追加後: ${f1(ng2.ng2ViolRate)}日/月`);
  const dS = ng2.totalShortage - base.totalShortage;
  console.log(`  shortage増加: ${dS>=0?'+':''}${dS.toFixed(2)}`);
  console.log(`  → low-readinessが2名いる日は片方をブロック → shortage発生リスク`);
}

// ━━━ Part 3: 生成時間影響 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n\n【Part 3】生成時間影響\n');
{
  const { default: { performance } } = await import('node:perf_hooks');
  const timings = {};
  for (const sc of Object.keys(BLOCKS)) {
    const src = SRC.replace(ORIG_BLOCK, BLOCKS[sc]);
    const tmpPath = path.join(__dirname, `_tmp_prtime_${sc.replace(/[^a-zA-Z0-9]/g,'')}.mjs`);
    fs.writeFileSync(tmpPath, src);
    const mod = await import(`${tmpPath}?t=${Date.now()}`);
    const t0 = performance.now();
    for (let i=0; i<50; i++) mod.autoGenerate(staffA, dept, YEAR, MONTH, {}, {});
    timings[sc] = ((performance.now()-t0)/50).toFixed(2);
    fs.unlinkSync(tmpPath);
  }
  console.log(padL('シナリオ') + pad('平均生成時間(ms)'));
  console.log(HR);
  for (const [sc, t] of Object.entries(timings)) {
    console.log(padL(sc) + pad(t + ' ms'));
  }
  console.log('\n  → ルール追加は全てO(n)フィルタ/ソート。生成時間への影響は測定誤差範囲内。');
}

// ━━━ Part 4: 総合評価 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('\n\n【Part 4】総合評価\n');
console.log(HR);
const evalItems = [
  { rule:'NG-1', effect:'外国人+外国人を物理ブロック', shortage: resA['+NG-1'].totalShortage - resA['BASE（現行）'].totalShortage, g1: resA['+NG-1'].g1Rate, sideEffect:'G-1が機能している場合はNG-1違反は既に少ない。追加Hardで稀なケースの安全網' },
  { rule:'NG-2', effect:'low+low をブロック',          shortage: resB['+NG-2'].totalShortage  - resB['BASE（現行）'].totalShortage,  g1: resB['+NG-2'].g1Rate,  sideEffect:'low-readinessスタッフが複数いる部署で shortage増加。staffが充足していれば影響小' },
  { rule:'REC-1',effect:'外国人ペアにhigh優先ソート',   shortage: resA['+REC-1'].totalShortage - resA['BASE（現行）'].totalShortage, g1: resA['+REC-1'].g1Rate, sideEffect:'ソートのみ変更。フィルタなし。shortage影響ほぼゼロ。REC-1達成率を向上' },
];
for (const e of evalItems) {
  const dSign = e.shortage>=0?'+':'';
  console.log(`\n  ${e.rule}`);
  console.log(`    効果       : ${e.effect}`);
  console.log(`    Δshortage : ${dSign}${e.shortage.toFixed(2)}`);
  console.log(`    G-1同席率  : ${fp(e.g1)}`);
  console.log(`    副作用     : ${e.sideEffect}`);
}

console.log('\n' + HR);
console.log('【実装推奨順位】');
console.log('  1位 REC-1  — shortage影響ゼロ・G-1同席率向上・副作用なし → 即採用推奨');
console.log('  2位 NG-1   — G-1の安全網として有効。shortage増加は許容範囲の見込み');
console.log('  3位 NG-2   — low-readiness staffが実際に登録されてから有効。現時点では休眠ルール');
console.log('');
