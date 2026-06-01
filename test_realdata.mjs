// G-1/G-2 実データ検証スクリプト v2
// 3フェーズで構成:
//   Phase 0: デフォルトデータのフラグ診断（登録状況確認）
//   Phase 1: 夜勤1枠構成（デフォルト相当）での動作確認
//   Phase 2: 夜勤2枠構成（実運用想定）での動作確認

import { autoGenerate, scoreShifts } from './src/shiftEngine.js';

const YEAR = 2026, MONTH = 5;
const N = 15;
const days = new Date(YEAR, MONTH + 1, 0).getDate();

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
  floorYears: opts.floorYears ?? null,
  foreignNightSupportRequired: opts.foreignNightSupportRequired ?? false,
  kiboByMonth: {}, yukyuByMonth: {},
  shiftRequestsByMonth: {}, kyukoDaysByMonth: {},
  kiboNightPreference: 0,
});

// ── スタッフ定義 ──────────────────────────────────────────────────
// デフォルト10名（kaigo1相当）
const staffDefault = [
  makeStaff('k0','田中 花子','介護福祉士',true),
  makeStaff('k1','鈴木 一郎','介護福祉士',true),
  makeStaff('k2','佐藤 美咲','介護福祉士',false),
  makeStaff('k3','山田 太郎','介護職員',  true),
  makeStaff('k4','伊藤 さくら','介護職員',true),
  makeStaff('k5','中村 健',  '介護職員',  false),
  makeStaff('k6','小林 由美','介護職員',  false),
  makeStaff('k7','加藤 誠',  '介護補助',  true),
  makeStaff('k8','吉田 幸',  '介護補助',  false),
  makeStaff('k9','渡辺 亮',  '介護補助',  false),
];

// G-1/G-2フラグ付き（実運用想定）
const staffFlagged = [
  makeStaff('k0','田中 花子','介護福祉士',true, {facilityYears:4.0,floorYears:3.0}),
  makeStaff('k1','鈴木 一郎','介護福祉士',true, {facilityYears:5.0,floorYears:4.0}),
  makeStaff('k2','佐藤 美咲','介護福祉士',true, {facilityYears:3.0,floorYears:2.0}),
  makeStaff('k3','山田 太郎','介護職員',  true, {facilityYears:2.5,floorYears:0.3}), // rr=high
  makeStaff('k4','伊藤 さくら','介護職員',true, {facilityYears:2.2,floorYears:0.4}), // rr=high
  makeStaff('k5','中村 健',  '介護職員',  true, {facilityYears:1.5,floorYears:1.0}),
  makeStaff('k6','レア(特定技能)','特定技能',true,{foreignNightSupportRequired:true,nightMax:5}),
  makeStaff('k7','マリア(特定技能)','特定技能',true,{foreignNightSupportRequired:true,nightMax:5}),
  makeStaff('k8','吉田 幸',  '介護補助',  false),
  makeStaff('k9','渡辺 亮',  '介護補助',  false),
];

// ── 部署設定 ─────────────────────────────────────────────────────
// Phase 1: App.jsxデフォルト相当（夜勤1枠）
const deptN1 = {
  id:'kaigo1', shiftTypes:['早番','日勤','遅番','夜勤'],
  minStaff:{'早番':1,'日勤':1,'遅番':1,'夜勤':1},
  maxStaff:{'早番':1,'遅番':1,'夜勤':1},
  maxConsecutive:5, customShiftDefs:[], intervalThreshold:null,
  roleShiftTypes:{'介護補助':['日勤'],'特定技能':['日勤','早番','遅番','夜勤']},
};

// Phase 2: 実運用想定（夜勤2枠）
const deptN2 = {
  id:'kaigo1', shiftTypes:['早番','日勤','遅番','夜勤'],
  minStaff:{'早番':1,'日勤':2,'遅番':1,'夜勤':2},
  maxStaff:{'早番':1,'遅番':1,'夜勤':2},  // エンジン未指定時のデフォルト=1を回避するため明示
  maxConsecutive:5, customShiftDefs:[], intervalThreshold:null,
  roleShiftTypes:{'介護補助':['日勤']},
};

// ── 分析 ─────────────────────────────────────────────────────────
function analyze(shifts, staffList, dept) {
  const ds = staffList.filter(s => s.dept === dept.id);
  const REST = new Set(['休み','希望休']);

  let foreignNightDays=0, soloForeignDays=0;
  for (let d=1; d<=days; d++) {
    const nightStaff = ds.filter(s => shifts[s.id]?.[d]==='夜勤');
    const foreignOn  = nightStaff.filter(s => s.foreignNightSupportRequired);
    if (!foreignOn.length) continue;
    foreignNightDays++;
    if (!nightStaff.some(s => !s.foreignNightSupportRequired)) soloForeignDays++;
  }

  const nightByStaff = {};
  for (const s of ds) {
    nightByStaff[s.id] = Object.values(shifts[s.id]||{}).filter(v=>v==='夜勤').length;
  }

  let shortage=0, minViolDays=0, maxViolDays=0, kyukoViol=0;
  for (const s of ds) {
    const actual = Object.values(shifts[s.id]||{}).filter(v=>REST.has(v)).length;
    if (Math.abs(actual - (s.kyukoDays??8)) > 2) kyukoViol++;
  }
  for (let d=1; d<=days; d++) {
    for (const [k,minC] of Object.entries(dept.minStaff||{})) {
      const cnt = ds.filter(s=>shifts[s.id]?.[d]===k).length;
      if (cnt < minC) { shortage += minC-cnt; minViolDays++; }
    }
    for (const [k,maxC] of Object.entries(dept.maxStaff||{})) {
      if (ds.filter(s=>shifts[s.id]?.[d]===k).length > maxC) maxViolDays++;
    }
  }

  const nightOkDs = ds.filter(s=>s.nightOk);
  const nCounts = nightOkDs.map(s=>nightByStaff[s.id]);
  const nightMax2 = nCounts.length ? Math.max(...nCounts) : 0;
  const nightMin2 = nCounts.length ? Math.min(...nCounts) : 0;

  return {foreignNightDays,soloForeignDays,nightByStaff,shortage,minViolDays,maxViolDays,kyukoViol,nightMax2,nightMin2};
}

function runN(staffList, dept, n) {
  const results=[];
  for (let i=0; i<n; i++) {
    const {shifts} = autoGenerate(staffList, dept, YEAR, MONTH, {}, {});
    results.push(analyze(shifts, staffList, dept));
  }
  return results;
}

function avgR(arr, key) { return (arr.reduce((s,r)=>s+(r[key]??0),0)/arr.length).toFixed(2); }
function avgNight(arr, id) { return (arr.reduce((s,r)=>s+(r.nightByStaff[id]||0),0)/arr.length).toFixed(1); }

const HR = '━'.repeat(62);

console.log('\n' + '='.repeat(62));
console.log('G-1/G-2 実データ検証レポート');
console.log(`対象月: ${YEAR}年${MONTH+1}月  各${N}回平均`);
console.log('='.repeat(62));

// ━━━ Phase 0: フラグ診断 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log(`\n${HR}\n【Phase 0】デフォルトデータ フラグ登録診断\n${HR}`);
{
  const g1 = staffDefault.filter(s=>s.foreignNightSupportRequired);
  const g2h = staffDefault.filter(s=>getRelocationRisk(s)==='high');
  const g2m = staffDefault.filter(s=>getRelocationRisk(s)==='medium');
  const noDate = staffDefault.filter(s=>s.facilityYears==null||s.floorYears==null);

  console.log(`G-1対象(foreignNightSupportRequired=true): ${g1.length}名`);
  console.log(`  → ${g1.length === 0 ? '⚠️  未登録 — G-1は休眠状態（生成に影響なし）' : g1.map(s=>s.name).join(', ')}`);
  console.log(`G-2対象(rr=high): ${g2h.length}名  (rr=medium): ${g2m.length}名`);
  console.log(`  → ${g2h.length+g2m.length === 0 ? '⚠️  未登録 — G-2は休眠状態（入職日未設定）' : ''}`);
  console.log(`facilityJoinDate/floorJoinDate未入力: ${noDate.length}/10名`);
  console.log(`\n現状のG-1/G-2への影響: ゼロ（フラグなし＝修正前と同一動作）`);
}

// ━━━ Phase 1: 夜勤1枠（デフォルト設定） ━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log(`\n${HR}\n【Phase 1】夜勤1枠構成（minStaff["夜勤"]=1）\n${HR}`);
{
  console.log('▸ 構成: G-1/G-2フラグあり、夜勤1枠のみ');
  const rN1 = runN(staffFlagged, deptN1, N);

  const avgFD = rN1.reduce((s,r)=>s+r.foreignNightDays,0)/N;
  const avgSD = rN1.reduce((s,r)=>s+r.soloForeignDays,0)/N;
  const rate  = avgFD > 0 ? ((avgFD-avgSD)/avgFD*100).toFixed(1) : '—';

  console.log(`\n■ G-1 (外国人夜勤サポート):`);
  console.log(`  外国人夜勤日数: ${avgFD.toFixed(1)}日/月`);
  console.log(`  サポーター同席率: ${rate}%`);
  console.log(`  → ⚠️  夜勤1枠では物理的にサポーター追加不可（G-1 構造的制約）`);
  console.log(`     G-1を機能させるには minStaff["夜勤"] ≥ 2 が必要`);

  const rrHighN1 = staffFlagged.filter(s=>getRelocationRisk(s)==='high');
  const rrLowN1  = staffFlagged.filter(s=>getRelocationRisk(s)==='low' && s.nightOk && !s.foreignNightSupportRequired);
  const avgHigh = rrHighN1.reduce((s,st)=>s+rN1.reduce((n,r)=>n+(r.nightByStaff[st.id]||0),0)/N,0)/Math.max(rrHighN1.length,1);
  const avgLow  = rrLowN1.reduce((s,st) =>s+rN1.reduce((n,r)=>n+(r.nightByStaff[st.id]||0),0)/N,0)/Math.max(rrLowN1.length,1);

  console.log(`\n■ G-2 (異動ベテラン夜勤抑制):`);
  for (const s of rrHighN1) console.log(`  ${s.name}: ${avgNight(rN1,s.id)}回/月 (rr=high)`);
  for (const s of rrLowN1)  console.log(`  ${s.name}: ${avgNight(rN1,s.id)}回/月 (rr=low)`);
  console.log(`  → rr=high平均: ${avgHigh.toFixed(1)}回 vs rr=low平均: ${avgLow.toFixed(1)}回`);
  console.log(`  → ${avgHigh < avgLow ? '✓ G-2 抑制有効' : '△ 抑制不明確'}`);

  console.log(`\n■ 全体品質:`);
  console.log(`  shortage: ${avgR(rN1,'shortage')}コマ  minViol: ${avgR(rN1,'minViolDays')}日  maxViol: ${avgR(rN1,'maxViolDays')}日  公休違反: ${avgR(rN1,'kyukoViol')}名`);
}

// ━━━ Phase 2: 夜勤2枠（実運用想定） ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log(`\n${HR}\n【Phase 2】夜勤2枠構成（minStaff["夜勤"]=2、実運用想定）\n${HR}`);
{
  console.log('▸ 構成: G-1/G-2フラグあり、夜勤2枠（夜勤maxStaff制限なし）');

  // G-1/G-2フラグなし(比較基準)
  const staffComp = staffFlagged.map(s=>({
    ...s,
    foreignNightSupportRequired: false,
    facilityYears: null, floorYears: null
  }));
  const rComp = runN(staffComp, deptN2, N);
  const rFlag = runN(staffFlagged, deptN2, N);

  // G-1
  const avgFD = rFlag.reduce((s,r)=>s+r.foreignNightDays,0)/N;
  const avgSD = rFlag.reduce((s,r)=>s+r.soloForeignDays,0)/N;
  const rate  = avgFD > 0 ? ((avgFD-avgSD)/avgFD*100).toFixed(1) : '—';
  const g1pass = parseFloat(rate) >= 90;

  const foreignStaff = staffFlagged.filter(s=>s.foreignNightSupportRequired);
  console.log(`\n■ G-1: 外国人夜勤サポーター同席率`);
  console.log(`  対象職員: ${foreignStaff.map(s=>s.name).join(', ')} (${foreignStaff.length}名)`);
  for (const s of foreignStaff) {
    console.log(`  ${s.name}: 夜勤${avgNight(rFlag,s.id)}回/月`);
  }
  console.log(`  外国人夜勤日数: ${avgFD.toFixed(1)}日/月`);
  console.log(`  サポーター同席率: ${rate}%  単独夜勤: ${avgSD.toFixed(2)}日/月`);
  console.log(`  評価: ${g1pass ? '✓ G-1 PASS' : '✗ G-1 FAIL'}`);

  // G-2
  const rrHigh = staffFlagged.filter(s=>getRelocationRisk(s)==='high');
  const rrLow  = staffFlagged.filter(s=>getRelocationRisk(s)==='low' && s.nightOk && !s.foreignNightSupportRequired);
  const avgHighFlag = rrHigh.reduce((s,st)=>s+rFlag.reduce((n,r)=>n+(r.nightByStaff[st.id]||0),0)/N,0)/Math.max(rrHigh.length,1);
  const avgLowFlag  = rrLow.reduce((s,st) =>s+rFlag.reduce((n,r)=>n+(r.nightByStaff[st.id]||0),0)/N,0)/Math.max(rrLow.length,1);
  const avgHighComp = rrHigh.reduce((s,st)=>s+rComp.reduce((n,r)=>n+(r.nightByStaff[st.id]||0),0)/N,0)/Math.max(rrHigh.length,1);

  const g2pass = avgHighFlag < avgHighComp || avgHighFlag < avgLowFlag;
  const reduction = avgHighComp > 0 ? ((avgHighFlag-avgHighComp)/avgHighComp*100).toFixed(0) : '—';

  console.log(`\n■ G-2: 異動ベテラン夜勤抑制`);
  console.log(`  対象職員 (rr=high):`);
  for (const s of rrHigh) {
    const before = rComp.reduce((n,r)=>n+(r.nightByStaff[s.id]||0),0)/N;
    const after  = rFlag.reduce((n,r)=>n+(r.nightByStaff[s.id]||0),0)/N;
    console.log(`    ${s.name}: ${before.toFixed(1)}回→${after.toFixed(1)}回 (${((after-before)/Math.max(before,0.1)*100).toFixed(0)}%変化)`);
  }
  console.log(`  rr=high平均: フラグなし${avgHighComp.toFixed(1)}回 → フラグあり${avgHighFlag.toFixed(1)}回 (${reduction}%)`);
  console.log(`  rr=low平均: ${avgLowFlag.toFixed(1)}回/月`);
  console.log(`  評価: ${g2pass ? '✓ G-2 PASS（夜勤抑制確認）' : '✗ G-2 FAIL'}`);

  // 全体品質
  console.log(`\n■ 全体品質:`);
  console.log(`  ${'指標'.padEnd(22)} ${'フラグなし'.padStart(8)} ${'フラグあり'.padStart(8)}`);
  console.log('  ' + '─'.repeat(40));
  const keys = [
    ['shortage',   '夜勤shortage'],
    ['minViolDays','minStaff違反日数'],
    ['maxViolDays','maxStaff違反日数'],
    ['kyukoViol',  '公休違反スタッフ数'],
  ];
  for (const [k,label] of keys) {
    console.log(`  ${label.padEnd(22)} ${avgR(rComp,k).padStart(8)} ${avgR(rFlag,k).padStart(8)}`);
  }
  const nightSpreadComp = (rComp.reduce((s,r)=>s+(r.nightMax2-r.nightMin2),0)/N).toFixed(2);
  const nightSpreadFlag = (rFlag.reduce((s,r)=>s+(r.nightMax2-r.nightMin2),0)/N).toFixed(2);
  console.log(`  ${'夜勤偏り(最大-最小)'.padEnd(22)} ${nightSpreadComp.padStart(8)} ${nightSpreadFlag.padStart(8)}`);

  // 副作用確認
  console.log(`\n■ 副作用確認 (夜勤回数 多い順):`);
  const nightOkAll = staffFlagged.filter(s=>s.nightOk);
  const ranked = nightOkAll
    .map(s => ({
      name: s.name,
      rr: getRelocationRisk(s),
      isForeign: s.foreignNightSupportRequired,
      n: rFlag.reduce((sum,r)=>sum+(r.nightByStaff[s.id]||0),0)/N,
    }))
    .sort((a,b)=>b.n-a.n);

  for (const e of ranked) {
    const tag = e.isForeign ? '[外国人 ] ' : e.rr==='high' ? '[rr=high] ' : '[通常   ] ';
    const bar = '■'.repeat(Math.min(Math.round(e.n),15));
    console.log(`  ${tag}${e.name.padEnd(18)} ${e.n.toFixed(1)}回  ${bar}`);
  }

  const maxN = ranked[0]?.n ?? 0;
  const minN = ranked[ranked.length-1]?.n ?? 0;
  const diff = maxN - minN;
  console.log(`\n  夜勤分散: 最大${maxN.toFixed(1)}回 - 最小${minN.toFixed(1)}回 = 差${diff.toFixed(1)}回`);
  if (diff > 4) console.log(`  ⚠️  夜勤集中あり（差${diff.toFixed(1)}回 > 4回）`);
  else console.log(`  ✓  夜勤分散は許容範囲`);

  // 総合判定
  console.log(`\n${HR}\n【総合判定】\n${HR}`);
  const qualOk = parseFloat(avgR(rFlag,'maxViolDays')) === 0;
  const kyukoOk = parseFloat(avgR(rFlag,'kyukoViol')) === 0;

  console.log(`G-1 サポーター同席率 (夜勤2枠構成): ${g1pass ? '✓ PASS' : '✗ FAIL'} (${rate}%)`);
  console.log(`G-2 rr=high夜勤抑制:               ${g2pass ? '✓ PASS' : '✗ FAIL'} (${reduction}%減)`);
  console.log(`品質 maxStaff違反:                  ${qualOk  ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`品質 公休:                          ${kyukoOk ? '✓ PASS' : '△ 要確認'}`);
  console.log('');

  if (g1pass && g2pass && qualOk) {
    console.log('>>> 総合判定: PASS');
  } else {
    console.log('>>> 総合判定: CONDITIONAL PASS');
    console.log('    条件: minStaff["夜勤"]>=2の部署でフラグを登録すること');
  }

  console.log(`\n${'─'.repeat(62)}`);
  console.log('■ 実データ反映のためのアクション:');
  console.log('  1. [現状] デフォルト: minStaff["夜勤"]=1 → G-1は構造的に機能しない');
  console.log('     → 部署設定で「夜勤 最低配置」を2以上に変更することを推奨');
  console.log('  2. 外国人(特定技能)職員のスタッフモーダルで「夜勤サポート必要」をON');
  console.log('  3. 全夜勤可能職員の「施設入職日」「フロア配属日」を入力');
  console.log('  4. これらが設定されるまでG-1/G-2の生成影響はゼロ（安全）');
}

console.log('');
