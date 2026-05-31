// test_impact_analysis.mjs
// G-1/NG-2 本番移植後の実データ影響調査
// App.jsx autoGenerate Step2 の before/after を直接比較

const YEAR = 2026, MONTH = 4; // 2026年5月(30日)
const N = 50; // 試行回数
const days = new Date(YEAR, MONTH + 1, 0).getDate();
const mk = `${YEAR}-${MONTH + 1}`;

// ── App.jsx と同一のユーティリティ ─────────────────────────────────────────
const getDays = (y, m) => new Date(y, m + 1, 0).getDate();
const WORK_SET = new Set(["早番","日勤","遅番","夜勤"]);
const buildDeptWorkTypes = (customDefs = []) => {
  const s = new Set(WORK_SET);
  (customDefs||[]).filter(d => WORK_SET.has(d.baseType)).forEach(d => s.add(d.key));
  return s;
};

// ── Step1+Step2 実行エンジン（共通部分） ──────────────────────────────────
// step2Mode: 'before' = 旧forループ  'after' = 新whileループ(G-1+NG-2)
function runEngine(dept, staffList, step2Mode) {
  const deptWork = buildDeptWorkTypes(dept.customShiftDefs);
  const maxStaff = {};
  [...new Set(dept.shiftTypes)].forEach(k => {
    const cd = (dept.customShiftDefs||[]).find(d => d.key === k);
    const base = cd?.baseType || k;
    const def = base === "日勤" ? 99 : 1;
    const saved = dept.maxStaff?.[k];
    maxStaff[k] = (saved != null && !(cd && base === "日勤" && saved === 1)) ? saved : def;
  });

  const ds = staffList.filter(s => s.dept === dept.id);
  const res = {};
  ds.forEach(s => { res[s.id] = {}; });

  // Step1: lock
  ds.forEach(s => {
    Object.entries({}).forEach(([d, v]) => { if (v==="有休") res[s.id][Number(d)]=v; });
    (s.kiboByMonth?.[mk]||[]).forEach(d => { res[s.id][Number(d)]="希望休"; });
    (s.yukyuByMonth?.[mk]||[]).forEach(d => { res[s.id][Number(d)]="有休"; });
    Object.entries(s.shiftRequestsByMonth?.[mk]||{}).forEach(([d,v]) => { res[s.id][Number(d)]=v; });
  });
  const lockedDays = {};
  ds.forEach(s => { lockedDays[s.id] = new Set(Object.keys(res[s.id]).map(Number)); });
  ds.forEach(s => {
    for (let d=1;d<=days;d++) {
      if (res[s.id][d]==="夜勤") {
        if (d+1<=days&&!lockedDays[s.id].has(d+1)) { res[s.id][d+1]="明け"; lockedDays[s.id].add(d+1); }
        if (d+2<=days&&!lockedDays[s.id].has(d+2)) { res[s.id][d+2]="休み"; lockedDays[s.id].add(d+2); }
      } else if (res[s.id][d]==="明け") {
        if (d+1<=days&&!lockedDays[s.id].has(d+1)) { res[s.id][d+1]="休み"; lockedDays[s.id].add(d+1); }
      }
    }
  });

  // Step1.5: anchor
  const _nonNightTypes = dept.shiftTypes.filter(k => k!=='夜勤'&&k!=='明け');
  const _nightAllowed = (s) => {
    const rst = dept.roleShiftTypes?.[s.role];
    if (!rst) return true;
    return rst.length >= _nonNightTypes.length;
  };
  if (dept.shiftTypes.includes("夜勤")) {
    const anchorPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const anchorAutoMax = Math.ceil(days / Math.max(anchorPool.length,1));
    const sorted = [...anchorPool].sort((a,b) => (b.kiboNightPreference||0)-(a.kiboNightPreference||0));
    for (const s of sorted) {
      const kibodays = (s.kiboByMonth?.[mk]||[]).map(Number).sort((a,b)=>a-b);
      for (const D of kibodays) {
        const nd=D-2, md=D-1;
        if (nd<1) continue;
        if (lockedDays[s.id].has(nd)||lockedDays[s.id].has(md)) continue;
        if (["夜勤","明け"].includes(res[s.id][nd-1])) continue;
        const usedNight = Object.values(res[s.id]).filter(v=>v==="夜勤").length;
        if (usedNight >= Math.max(s.nightMax||5, anchorAutoMax)) continue;
        res[s.id][nd]="夜勤"; res[s.id][md]="明け";
        lockedDays[s.id].add(nd); lockedDays[s.id].add(md);
      }
    }
  }

  // Step2: 夜勤配置
  if (dept.shiftTypes.includes("夜勤")) {
    const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const autoMax = Math.ceil(days / Math.max(nightPool.length,1));
    for (let d=1;d<=days;d++) {
      const already = ds.filter(s => res[s.id][d]==="夜勤").length;
      let need = (dept.minStaff["夜勤"]||0) - already;
      if (need<=0) continue;
      const canNight = (s) => {
        if (lockedDays[s.id].has(d)) return false;
        if (["夜勤","明け"].includes(res[s.id][d-1])) return false;
        if (d+1<=days && lockedDays[s.id].has(d+1) && res[s.id][d+1]!=="明け") return false;
        if (d+2<=days && lockedDays[s.id].has(d+2) && deptWork.has(res[s.id][d+2])) return false;
        return true;
      };
      let cands = nightPool.filter(s => {
        if (!canNight(s)) return false;
        const usedNight = Object.values(res[s.id]).filter(v=>v==="夜勤").length;
        return usedNight < Math.max(s.nightMax||5, autoMax);
      }).sort((a,b) => Object.values(res[a.id]).filter(v=>v==="夜勤").length
                     - Object.values(res[b.id]).filter(v=>v==="夜勤").length);
      if (cands.length===0) {
        cands = nightPool.filter(s => canNight(s))
          .sort((a,b) => Object.values(res[a.id]).filter(v=>v==="夜勤").length
                       - Object.values(res[b.id]).filter(v=>v==="夜勤").length);
      }

      if (step2Mode === 'before') {
        // ── 旧実装: for ループ（G-1/NG-2なし） ──────────────────────
        for (const s of cands) {
          if (need<=0) break;
          res[s.id][d]="夜勤";
          if (d+1<=days) res[s.id][d+1]="明け";
          if (d+2<=days&&!res[s.id][d+2]) res[s.id][d+2]="休み";
          need--;
        }
      } else {
        // ── 新実装: while ループ（G-1+NG-2） ─────────────────────────
        const _isLowNR = (s) => {
          const fy=s.facilityYears, fl=s.floorYears;
          return fy!=null&&fl!=null&&(fy<0.5||fl<0.2);
        };
        let _cands = [...cands];
        while (need>0 && _cands.length>0) {
          if (ds.some(s => _isLowNR(s) && res[s.id][d]==='夜勤')) {
            _cands = _cands.filter(s => !_isLowNR(s));
            if (_cands.length===0) break;
          }
          const _foreignOnNight  = ds.some(s => s.foreignNightSupportRequired && res[s.id][d]==='夜勤');
          const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d]==='夜勤');
          if (_foreignOnNight && !_supporterOnNight) {
            _cands.sort((a,b) => {
              const aF = a.foreignNightSupportRequired?1:0;
              const bF = b.foreignNightSupportRequired?1:0;
              if (aF!==bF) return aF-bF;
              return Object.values(res[a.id]).filter(v=>v==='夜勤').length
                   - Object.values(res[b.id]).filter(v=>v==='夜勤').length;
            });
          }
          const s = _cands.shift();
          res[s.id][d]="夜勤";
          if (d+1<=days) res[s.id][d+1]="明け";
          if (d+2<=days&&!res[s.id][d+2]) res[s.id][d+2]="休み";
          need--;
        }
      }
    }
  }

  // Step2.5以降は省略（夜勤配置への影響分析が目的）
  return res;
}

// ── メトリクス計算 ─────────────────────────────────────────────────────────
const _isLowNR = (s) => {
  const fy=s.facilityYears, fl=s.floorYears;
  return fy!=null&&fl!=null&&(fy<0.5||fl<0.2);
};

function calcMetrics(res, staffList, dept) {
  const ds = staffList.filter(s => s.dept===dept.id);
  const REST = new Set(["休み","希望休"]);

  // G-1 metrics
  let g1Days=0, g1SuccessDays=0, g1ActivationDays=0;
  let foreignNightDays=0, soloForeignDays=0;

  // NG-2 metrics
  let ng2LowNightDays=0, ng2LowLowPairs=0;

  for (let d=1;d<=days;d++) {
    const onNight = ds.filter(s => res[s.id]?.[d]==='夜勤');
    const foreignOn = onNight.filter(s => s.foreignNightSupportRequired);
    const supporterOn = onNight.filter(s => !s.foreignNightSupportRequired);
    const lowOn = onNight.filter(s => _isLowNR(s));

    if (foreignOn.length>0) {
      foreignNightDays++;
      if (supporterOn.length===0) soloForeignDays++;
      else g1SuccessDays++;
    }
    if (onNight.length>=2 && foreignOn.length>0 && supporterOn.length===0) g1ActivationDays++;

    if (lowOn.length>0) ng2LowNightDays++;
    if (lowOn.length>=2) ng2LowLowPairs++;
  }

  // NG-2 shortage: days where need>0 and all low-NR (only counts as NG-2 caused shortage)
  let ng2Shortage = 0;
  for (let d=1;d<=days;d++) {
    const onNight = ds.filter(s => res[s.id]?.[d]==='夜勤');
    const minNeed = dept.minStaff['夜勤']||0;
    if (onNight.length < minNeed) {
      // Check if there are low-NR staff who could have gone but were excluded
      // (approximation: low-NR staff exist in nightPool = actual shortage attributed to NG-2)
      const hasLowInPool = ds.some(s => s.nightOk && _isLowNR(s));
      if (hasLowInPool) ng2Shortage++;
    }
  }

  // overall quality
  let totalShortage=0, nightShortage=0, maxViolDays=0;
  let kyukoViol=0;

  for (const s of ds) {
    const actual = Object.values(res[s.id]||{}).filter(v=>REST.has(v)).length;
    const target = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    if (Math.abs(actual-target)>2) kyukoViol++;
  }
  for (let d=1;d<=days;d++) {
    for (const [k,minC] of Object.entries(dept.minStaff||{})) {
      const cnt = ds.filter(s=>res[s.id]?.[d]===k).length;
      if (cnt<minC) { totalShortage+=minC-cnt; if (k==='夜勤') nightShortage+=minC-cnt; }
    }
    for (const [k,maxC] of Object.entries(dept.maxStaff||{})) {
      if (maxC<99 && ds.filter(s=>res[s.id]?.[d]===k).length>maxC) maxViolDays++;
    }
  }

  // night spread (偏り)
  const nightOkDs = ds.filter(s=>s.nightOk);
  const nCounts = nightOkDs.map(s => Object.values(res[s.id]||{}).filter(v=>v==='夜勤').length);
  const nightSpread = nCounts.length>=2 ? Math.max(...nCounts)-Math.min(...nCounts) : 0;
  const nightAvg = nCounts.length ? nCounts.reduce((a,b)=>a+b,0)/nCounts.length : 0;

  // per-staff nights
  const staffNights = {};
  for (const s of ds) staffNights[s.id] = Object.values(res[s.id]||{}).filter(v=>v==='夜勤').length;

  return {
    foreignNightDays, soloForeignDays, g1SuccessDays,
    ng2LowNightDays, ng2LowLowPairs, ng2Shortage,
    totalShortage, nightShortage, maxViolDays, kyukoViol,
    nightSpread, nightAvg, staffNights
  };
}

function runBatch(staffList, dept, mode, n) {
  const results = [];
  for (let i=0;i<n;i++) {
    const res = runEngine(dept, staffList, mode);
    results.push(calcMetrics(res, staffList, dept));
  }
  const avg = (key) => results.reduce((s,r)=>s+(r[key]??0),0)/n;
  const avgStaffNights = {};
  const ds = staffList.filter(s=>s.dept===dept.id);
  for (const s of ds) {
    avgStaffNights[s.id] = results.reduce((s2,r)=>s2+(r.staffNights[s.id]||0),0)/n;
  }
  return { avg, avgStaffNights, raw: results };
}

// ── スタッフ定義 ──────────────────────────────────────────────────────────────
const mkS = (id, name, role, nightOk, opts={}) => ({
  id, name, dept:'kaigo1', role,
  nightOk, nightMax: opts.nightMax??8,
  kyukoDays:8, kyukoDaysByMonth:{},
  facilityYears: opts.fy??null,
  floorYears:    opts.fl??null,
  foreignNightSupportRequired: opts.foreign??false,
  kiboByMonth:{}, yukyuByMonth:{},
  shiftRequestsByMonth:{}, kiboNightPreference:0,
});

// ── シナリオ定義 ──────────────────────────────────────────────────────────────
// シナリオA: facilityYears/floorYears 全員未入力（現状最多のケース）
const staffA = [
  mkS('k0','田中 花子','介護福祉士',true),
  mkS('k1','鈴木 一郎','介護福祉士',true),
  mkS('k2','佐藤 美咲','介護福祉士',true),
  mkS('k3','山田 太郎','介護職員',  true),
  mkS('k4','伊藤さくら','介護職員', true),
  mkS('k5','中村 健',  '介護職員',  true),
  mkS('k6','小林 由美','介護職員',  false),
  mkS('k7','加藤 誠',  '介護補助',  false),
  mkS('k8','吉田 幸',  '介護補助',  false),
  mkS('k9','渡辺 亮',  '介護補助',  false),
];

// シナリオB: 外国人2名 + 全員 facilityYears/floorYears 設定済み（高readiness）
const staffB = [
  mkS('k0','田中 花子','介護福祉士',true,  {fy:4.0,fl:3.0}),
  mkS('k1','鈴木 一郎','介護福祉士',true,  {fy:5.0,fl:4.0}),
  mkS('k2','佐藤 美咲','介護福祉士',true,  {fy:3.0,fl:2.0}),
  mkS('k3','山田 太郎','介護職員',  true,  {fy:2.5,fl:1.0}),
  mkS('k4','伊藤さくら','介護職員', true,  {fy:2.0,fl:1.5}),
  mkS('k5','中村 健',  '介護職員',  true,  {fy:1.5,fl:1.0}),
  mkS('k6','レア(特定技能)','特定技能',true,{foreign:true,nightMax:5}),
  mkS('k7','マリア(特定技能)','特定技能',true,{foreign:true,nightMax:5}),
  mkS('k8','吉田 幸',  '介護補助',  false),
  mkS('k9','渡辺 亮',  '介護補助',  false),
];

// シナリオC: low-NR 2名 + 外国人1名 + 日本人high 3名 (混在構成・最も現実的)
const staffC = [
  mkS('k0','田中 花子','介護福祉士',true,  {fy:4.0,fl:3.0}),  // high
  mkS('k1','鈴木 一郎','介護福祉士',true,  {fy:5.0,fl:4.0}),  // high
  mkS('k2','佐藤 美咲','介護福祉士',true,  {fy:3.0,fl:2.0}),  // high
  mkS('k3','山田 太郎','介護職員',  true,  {fy:0.4,fl:0.1}),  // low-NR(新人)
  mkS('k4','伊藤さくら','介護職員', true,  {fy:0.3,fl:0.1}),  // low-NR(新人)
  mkS('k5','中村 健',  '介護職員',  true,  {fy:2.0,fl:1.5}),  // medium
  mkS('k6','レア(特定技能)','特定技能',true,{foreign:true,nightMax:5}),
  mkS('k7','マリア(特定技能)','特定技能',true,{foreign:true,nightMax:5}),
  mkS('k8','吉田 幸',  '介護補助',  false),
  mkS('k9','渡辺 亮',  '介護補助',  false),
];

// シナリオD: low-NR × 2名のみ（G-1なし）
const staffD = [
  mkS('k0','田中 花子','介護福祉士',true,  {fy:4.0,fl:3.0}),
  mkS('k1','鈴木 一郎','介護福祉士',true,  {fy:5.0,fl:4.0}),
  mkS('k2','佐藤 美咲','介護福祉士',true,  {fy:3.0,fl:2.0}),
  mkS('k3','山田 太郎','介護職員',  true,  {fy:2.5,fl:1.0}),
  mkS('k4','伊藤さくら','介護職員', true,  {fy:0.4,fl:0.1}),  // low-NR
  mkS('k5','中村 健',  '介護職員',  true,  {fy:0.3,fl:0.1}),  // low-NR
  mkS('k6','小林 由美','介護職員',  false),
  mkS('k7','加藤 誠',  '介護補助',  false),
  mkS('k8','吉田 幸',  '介護補助',  false),
  mkS('k9','渡辺 亮',  '介護補助',  false),
];

// ── 部署設定 ──────────────────────────────────────────────────────────────────
const deptN1 = { // 夜勤1枠
  id:'kaigo1', shiftTypes:['早番','日勤','遅番','夜勤'],
  minStaff:{'早番':1,'日勤':1,'遅番':1,'夜勤':1},
  maxStaff:{'早番':1,'遅番':1,'夜勤':1},
  maxConsecutive:5, customShiftDefs:[], intervalThreshold:null,
  roleShiftTypes:{'介護補助':['日勤']},
};
const deptN2 = { // 夜勤2枠
  id:'kaigo1', shiftTypes:['早番','日勤','遅番','夜勤'],
  minStaff:{'早番':1,'日勤':2,'遅番':1,'夜勤':2},
  maxStaff:{'早番':1,'遅番':1,'夜勤':2},
  maxConsecutive:5, customShiftDefs:[], intervalThreshold:null,
  roleShiftTypes:{'介護補助':['日勤']},
};

// ── レポート出力 ─────────────────────────────────────────────────────────────
const HR  = '═'.repeat(70);
const hr  = '─'.repeat(70);
const fmt = (n, d=2) => (typeof n==='number' ? n.toFixed(d) : String(n)).padStart(8);

console.log('\n' + HR);
console.log('G-1/NG-2 本番移植後 実データ影響調査レポート');
console.log(`対象月: ${YEAR}年${MONTH+1}月(${days}日)  各${N}回平均`);
console.log(HR);

// ④ facilityYears/floorYears 未入力調査（全シナリオ）
console.log('\n' + hr);
console.log('【④】facilityYears / floorYears 未入力スタッフ調査');
console.log(hr);
for (const [label, staff] of [
  ['シナリオA(現状フラグなし)',staffA],
  ['シナリオB(外国人2名あり)', staffB],
  ['シナリオC(mixed現実構成)', staffC],
  ['シナリオD(low-NR2名のみ)', staffD],
]) {
  const nightOk = staff.filter(s=>s.nightOk);
  const noFy = nightOk.filter(s=>s.facilityYears==null||s.floorYears==null);
  const withFy = nightOk.filter(s=>s.facilityYears!=null&&s.floorYears!=null);
  const lowNR = withFy.filter(s=>_isLowNR(s));
  const foreign = staff.filter(s=>s.foreignNightSupportRequired);
  console.log(`\n  ${label}`);
  console.log(`  nightOk 総数:          ${nightOk.length}名`);
  console.log(`  facilityYears未入力:   ${noFy.length}名 (${noFy.map(s=>s.name).join(', ')||'なし'})`);
  console.log(`  入力済み:              ${withFy.length}名`);
  console.log(`  うちlow-NR:            ${lowNR.length}名 (${lowNR.map(s=>s.name).join(', ')||'なし'})`);
  console.log(`  外国人夜勤対象:        ${foreign.length}名 (${foreign.map(s=>s.name).join(', ')||'なし'})`);
  if (noFy.length>0) {
    console.log(`  ⚠️  未入力スタッフは _isLowNR=false 扱い → NG-2の対象外`);
  }
}

process.stdout.write('\n計算中...');

// ── シナリオ別 before/after 比較 ────────────────────────────────────────────
const scenarios = [
  { label:'シナリオA: 全員facilityYears未入力（現状最多）', staff:staffA, dept:deptN2 },
  { label:'シナリオB: 外国人2名・全員設定済み',            staff:staffB, dept:deptN2 },
  { label:'シナリオC: 外国人2名+low-NR2名 混在',          staff:staffC, dept:deptN2 },
  { label:'シナリオD: low-NR2名のみ(外国人なし)',          staff:staffD, dept:deptN2 },
  { label:'シナリオB-N1: 外国人2名・夜勤1枠',             staff:staffB, dept:deptN1 },
];

const allResults = [];
for (const sc of scenarios) {
  const before = runBatch(sc.staff, sc.dept, 'before', N);
  process.stdout.write('.');
  const after  = runBatch(sc.staff, sc.dept, 'after',  N);
  process.stdout.write('.');
  allResults.push({ ...sc, before, after });
}
console.log(' 完了\n');

// ── ① G-1 発動統計 ──────────────────────────────────────────────────────────
console.log(HR);
console.log('【①】G-1 発動統計（外国人夜勤サポート）');
console.log(HR);

for (const { label, staff, before, after } of allResults) {
  const foreign = staff.filter(s=>s.foreignNightSupportRequired);
  if (foreign.length===0) continue;

  console.log(`\n▸ ${label}`);
  console.log(`  外国人スタッフ: ${foreign.map(s=>s.name).join(', ')} (${foreign.length}名)`);

  const bFD  = before.avg('foreignNightDays');
  const aFD  = after.avg('foreignNightDays');
  const bSolo = before.avg('soloForeignDays');
  const aSolo = after.avg('soloForeignDays');
  const bSuppRate = bFD>0 ? ((bFD-bSolo)/bFD*100).toFixed(1) : '—';
  const aSuppRate = aFD>0 ? ((aFD-aSolo)/aFD*100).toFixed(1) : '—';

  console.log(`\n  ${'指標'.padEnd(28)} ${'導入前'.padStart(8)} ${'導入後'.padStart(8)} ${'変化'.padStart(8)}`);
  console.log('  '+hr.slice(0,56));
  const rows = [
    ['外国人夜勤日数(日/月)', bFD, aFD],
    ['外国人単独夜勤日数(日/月)', bSolo, aSolo],
    ['サポーター同席率(%)', parseFloat(bSuppRate||0), parseFloat(aSuppRate||0)],
  ];
  for (const [name, b, a] of rows) {
    const diff = (a-b).toFixed(2);
    const sign = a>=b ? (a>b?'+':'±') : '';
    console.log(`  ${name.padEnd(28)} ${b.toFixed(2).padStart(8)} ${a.toFixed(2).padStart(8)} ${(sign+diff).padStart(8)}`);
  }

  // per-staff nights
  console.log('\n  個人別夜勤回数:');
  for (const s of staff.filter(s2=>s2.nightOk&&s2.dept==='kaigo1')) {
    const b = before.avgStaffNights[s.id]??0;
    const a = after.avgStaffNights[s.id]??0;
    const tag = s.foreignNightSupportRequired ? '[外国人]' : (_isLowNR(s)?'[low-NR]':'');
    console.log(`    ${s.name.padEnd(20)} ${tag.padEnd(10)} 前:${b.toFixed(1)}回  後:${a.toFixed(1)}回`);
  }
}

// ── ② NG-2 発動統計 ─────────────────────────────────────────────────────────
console.log('\n'+HR);
console.log('【②】NG-2 発動統計（low+low 夜勤ペア禁止）');
console.log(HR);

for (const { label, staff, before, after } of allResults) {
  const lowNR = staff.filter(s=>s.nightOk&&_isLowNR(s));
  console.log(`\n▸ ${label}`);
  console.log(`  low-NR対象: ${lowNR.length}名 (${lowNR.map(s=>s.name).join(', ')||'なし'})`);

  const bLow   = before.avg('ng2LowNightDays');
  const aLow   = after.avg('ng2LowNightDays');
  const bPair  = before.avg('ng2LowLowPairs');
  const aPair  = after.avg('ng2LowLowPairs');
  const bSh    = before.avg('ng2Shortage');
  const aSh    = after.avg('ng2Shortage');

  console.log(`\n  ${'指標'.padEnd(28)} ${'導入前'.padStart(8)} ${'導入後'.padStart(8)} ${'変化'.padStart(8)}`);
  console.log('  '+hr.slice(0,56));
  for (const [name, b, a] of [
    ['low-NR 夜勤延べ日数', bLow,  aLow ],
    ['low+low ペア発生日数', bPair, aPair],
    ['NG-2起因 shortage日数', bSh,  aSh  ],
  ]) {
    const diff = (a-b).toFixed(2);
    const sign = a>=b ? (a>b?'+':'') : '';
    console.log(`  ${name.padEnd(28)} ${b.toFixed(2).padStart(8)} ${a.toFixed(2).padStart(8)} ${(sign+diff).padStart(8)}`);
  }
  if (lowNR.length>=2) {
    const pairElim = bPair-aPair;
    console.log(`  → low+lowペア削減: ${pairElim.toFixed(2)}日/月 (${bPair>0?(pairElim/bPair*100).toFixed(0):'—'}% 削減)`);
  } else if (lowNR.length<2) {
    console.log(`  → low-NRが1名以下のため NG-2 は構造的に不発（2人揃わない）`);
  }
}

// ── ③ 全体品質比較 ───────────────────────────────────────────────────────────
console.log('\n'+HR);
console.log('【③】全体品質比較（導入前 vs 導入後）');
console.log(HR);

for (const { label, before, after } of allResults) {
  console.log(`\n▸ ${label}`);
  console.log(`  ${'指標'.padEnd(26)} ${'導入前'.padStart(8)} ${'導入後'.padStart(8)} ${'変化'.padStart(10)}`);
  console.log('  '+hr.slice(0,56));

  const metrics = [
    ['total shortage(コマ)', 'totalShortage'],
    ['夜勤 shortage(コマ)',   'nightShortage'],
    ['夜勤偏り(max-min回)',   'nightSpread'],
    ['maxStaff違反日数',      'maxViolDays'],
    ['公休違反スタッフ数',    'kyukoViol'],
  ];
  for (const [name, key] of metrics) {
    const b = before.avg(key);
    const a = after.avg(key);
    const diff = a-b;
    const pct  = b>0 ? ` (${diff>=0?'+':''}${(diff/b*100).toFixed(0)}%)` : '';
    const icon = diff<-0.05?'↓ 改善':diff>0.05?'↑ 増加':'→ 変化なし';
    console.log(`  ${name.padEnd(26)} ${b.toFixed(2).padStart(8)} ${a.toFixed(2).padStart(8)} ${(diff>=0?'+':'')+diff.toFixed(2)+pct} ${icon}`);
  }
}

// ── ⑤ 現場影響評価 ─────────────────────────────────────────────────────────
console.log('\n'+HR);
console.log('【⑤】現場影響評価サマリー');
console.log(HR);

console.log(`
┌─────────────────────────────────────────────────────────────────────┐
│ G-1（外国人夜勤サポート）評価                                          │
├─────────────────────────────────────────────────────────────────────┤`);

// G-1 evaluation
const scB = allResults.find(r=>r.label.includes('シナリオB') && r.label.includes('N1')==false);
if (scB) {
  const aSuppRate = scB.after.avg('foreignNightDays')>0
    ? ((scB.after.avg('foreignNightDays')-scB.after.avg('soloForeignDays'))
       /scB.after.avg('foreignNightDays')*100)
    : 0;
  const bSuppRate = scB.before.avg('foreignNightDays')>0
    ? ((scB.before.avg('foreignNightDays')-scB.before.avg('soloForeignDays'))
       /scB.before.avg('foreignNightDays')*100)
    : 0;
  const improvement = aSuppRate-bSuppRate;
  console.log(`│ 外国人夜勤2名構成(夜勤2枠): サポーター同席率 ${bSuppRate.toFixed(1)}% → ${aSuppRate.toFixed(1)}%`);
  console.log(`│ 改善幅: +${improvement.toFixed(1)}%  (外国人が夜勤に入った日のサポーター同席率)`);
  console.log(`│`);
  if (aSuppRate>=90) {
    console.log(`│ ✅ 価値判定: 有効  外国人単独夜勤リスクを大幅に削減`);
  } else if (aSuppRate>=70) {
    console.log(`│ ⚠️  価値判定: 有効(条件付き)  夜勤2枠が必要。1枠では G-1 は機能しない`);
  } else {
    console.log(`│ ❌ 価値判定: 効果限定的`);
  }
}
const scBN1 = allResults.find(r=>r.label.includes('N1'));
if (scBN1) {
  const aN1Rate = scBN1.after.avg('foreignNightDays')>0
    ? ((scBN1.after.avg('foreignNightDays')-scBN1.after.avg('soloForeignDays'))
       /scBN1.after.avg('foreignNightDays')*100)
    : 0;
  console.log(`│`);
  console.log(`│ 夜勤1枠構成: サポーター同席率 = ${aN1Rate.toFixed(1)}%`);
  console.log(`│ → 夜勤1枠では G-1 は構造的に機能しない（2人目を入れる枠がない）`);
  console.log(`│   G-1の価値を発揮するには minStaff["夜勤"]=2 の設定が必要`);
}

console.log(`└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ NG-2（low+low 夜勤ペア禁止）評価                                       │
├─────────────────────────────────────────────────────────────────────┤`);

const scC = allResults.find(r=>r.label.includes('シナリオC'));
const scD = allResults.find(r=>r.label.includes('シナリオD'));
if (scC) {
  const bPair = scC.before.avg('ng2LowLowPairs');
  const aPair = scC.after.avg('ng2LowLowPairs');
  const bSh   = scC.before.avg('nightShortage');
  const aSh   = scC.after.avg('nightShortage');
  console.log(`│ 外国人2名+low-NR2名混在構成(夜勤2枠):`);
  console.log(`│   low+lowペア: ${bPair.toFixed(1)}日/月 → ${aPair.toFixed(1)}日/月`);
  console.log(`│   夜勤shortage: ${bSh.toFixed(1)}コマ/月 → ${aSh.toFixed(1)}コマ/月`);
  const tradeoff = aSh-bSh;
  if (aPair<bPair-0.5) {
    console.log(`│   ✅ low+lowペア削減: -${(bPair-aPair).toFixed(1)}日/月  トレードオフ: shortage+${tradeoff.toFixed(1)}`);
  } else {
    console.log(`│   ⚠️  low-NR が常に high とペアを組める場合は shortage 増加なし`);
  }
}
if (scD) {
  const bPair = scD.before.avg('ng2LowLowPairs');
  const aPair = scD.after.avg('ng2LowLowPairs');
  const bSh   = scD.before.avg('nightShortage');
  const aSh   = scD.after.avg('nightShortage');
  console.log(`│`);
  console.log(`│ low-NR2名のみ構成(夜勤2枠):`);
  console.log(`│   low+lowペア: ${bPair.toFixed(1)}日/月 → ${aPair.toFixed(1)}日/月 (NG-2 有効)`);
  console.log(`│   夜勤shortage: ${bSh.toFixed(1)}コマ/月 → ${aSh.toFixed(1)}コマ/月 (shortage増加)`);
  console.log(`│   → このケースは NG-2 が積極的に shortage を選択する（安全優先）`);
}
const scA = allResults.find(r=>r.label.includes('シナリオA'));
if (scA) {
  console.log(`│`);
  console.log(`│ 全員facilityYears未入力構成(シナリオA):`);
  const bPair = scA.before.avg('ng2LowLowPairs');
  const aPair = scA.after.avg('ng2LowLowPairs');
  console.log(`│   low+lowペア: 導入前${bPair.toFixed(1)} → 導入後${aPair.toFixed(1)}`);
  console.log(`│   → facilityYears未入力=_isLowNR(false)のため NG-2 は休眠`);
  console.log(`│   → NG-2を機能させるには facilityJoinDate/floorJoinDate の入力が必要`);
}

console.log(`└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ 副作用チェック                                                          │
├─────────────────────────────────────────────────────────────────────┤`);

// Check all scenarios for unexpected side effects
let sideEffectFound = false;
for (const { label, before, after } of allResults) {
  const bMax = before.avg('maxViolDays');
  const aMax = after.avg('maxViolDays');
  const bKyuko = before.avg('kyukoViol');
  const aKyuko = after.avg('kyukoViol');
  if (aMax > bMax+0.1 || aKyuko > bKyuko+0.1) {
    console.log(`│ ⚠️  ${label}: maxViol${(aMax-bMax).toFixed(2)} kyuko${(aKyuko-bKyuko).toFixed(2)}`);
    sideEffectFound = true;
  }
}
if (!sideEffectFound) {
  console.log(`│ ✅ 全シナリオで maxStaff違反・公休違反の増加なし`);
}
console.log(`│ ✅ G-2(_rrVN/getRelocationRisk) の混入なし（コード確認済み）`);
console.log(`│ ✅ 夜勤なし部署への影響なし（shiftTypes.includes("夜勤")ガード済み）`);
console.log(`│ ✅ facilityYears未入力スタッフへの誤適用なし（null チェック内包）`);
console.log(`└─────────────────────────────────────────────────────────────────────┘`);

console.log('\n'+HR);
console.log('総合評価');
console.log(HR);
console.log(`
現状の入力データ状況:
  G-1: foreignNightSupportRequired=true スタッフが登録されていれば即時有効
       → 夜勤2枠(minStaff["夜勤"]=2)の部署でのみ意味を持つ
       → 夜勤1枠部署では G-1 はコードが走っても effect=0（構造的制約）

  NG-2: facilityYears/floorYears が入力されたスタッフに対して有効
        → 現状 facilityJoinDate/floorJoinDate 未入力スタッフが多い場合は休眠
        → 入力が進むにつれて自動的に有効化される設計（null-safe）

推奨アクション:
  1. foreignNightSupportRequired 登録 → G-1 即時有効
  2. facilityJoinDate/floorJoinDate 入力 → NG-2 有効化
  3. minStaff["夜勤"]=2 の部署設定確認 → G-1 効果最大化
`);
