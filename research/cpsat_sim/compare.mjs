// Step B 比較ハーネス（研究用・本番非改変）:
// 合成データ(介護部2階相当)で学習→対象月を隠して「今のエンジン(bestOfN)」と
// 「CP-SAT(率ベース/頻度ベース)」を同じ入力で走らせ、既存の computeBacktestMetrics で比較する。
// 本番 core.js は読み取り利用のみ・DBやファイルへは書かない(一時JSONを /tmp 相当のこのフォルダに置くだけ)。
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { bestOfN, computeLearnedTrend, getDays } from '../../src/engine/core.js';
import { computeBacktestMetrics } from '../../src/research/backtest.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEPT = 'kaigo2';
const REST = new Set(['休み', '希望休', '有休']);

// ── 合成スタッフ: 6正社員(夜勤可・曜日で勤務種別がバラつく)+3パート(日勤のみ) ──
const mkS = (id, name, role, nightOk, hab) => ({ id, name, dept: DEPT, role, nightOk, nightMax: 5,
  kyukoDays: nightOk ? 8 : 9, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {}, hab });
// hab[dow] = 主たる勤務種別(getDay 0=日..6=土)。夜勤は特定曜日に寄せる。
const staff = [
  mkS('R0', '伊藤', '介護福祉士', true,  { 0:'夜勤', 2:'遅番', 4:'早番' }),
  mkS('R1', '柳',   '介護福祉士', true,  { 2:'夜勤', 5:'遅番', 1:'早番' }),
  mkS('R2', '高野', '介護福祉士', true,  { 3:'夜勤', 6:'早番', 4:'遅番' }),
  mkS('R3', 'テッテツカイン','介護職員', true, { 5:'夜勤', 1:'日勤', 3:'早番' }),
  mkS('R4', 'ラララビュー','介護職員', true, { 6:'夜勤', 4:'遅番', 2:'早番' }),
  mkS('R5', '佐藤', '介護職員', true,  { 1:'夜勤', 3:'遅番', 5:'早番' }),
  mkS('P0', 'パート甲', '介護補助', false, {}),
  mkS('P1', 'パート乙', '介護補助', false, {}),
  mkS('P2', 'パート丙', '介護補助', false, {}),
];
const dept = { id: DEPT, label: '介護部2階', shiftTypes: ['早番','日勤','遅番','夜勤'],
  minStaff: { 早番:1, 日勤:1, 遅番:1, 夜勤:1 }, maxStaff: { 早番:1, 日勤:99, 遅番:1, 夜勤:1 },
  defaultKyukoDays: 8, maxConsecutive: 5, customShiftDefs: [],
  roles: ['介護福祉士','介護職員','介護補助'], roleShiftTypes: { '介護補助':['日勤'] } };

const rnd = (seed) => { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; };

// 1ヶ月分を habits + minStaff充足で決定的に生成（実績・学習元の両方に使う素データ）
function genMonth(y, mo /*1..12*/, seed) {
  const dim = getDays(y, mo - 1);
  const R = rnd(seed);
  const rec = {}; staff.forEach(s => rec[s.id] = {});
  // 各人の休みをkyuko数だけランダムに置く
  for (const s of staff) {
    const days = [...Array(dim)].map((_, i) => i + 1);
    const nrest = s.kyukoDays;
    const restDays = days.sort(() => R() - 0.5).slice(0, nrest);
    restDays.forEach(d => rec[s.id][d] = '休み');
  }
  // 各日、席(早番1/遅番1/夜勤1)を habit の強い人から埋め、日勤で残りを充足
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(y, mo - 1, d).getDay();
    const avail = staff.filter(s => !rec[s.id][d] && rec[s.id][d - 1] !== '夜勤' && rec[s.id][d - 1] !== '明け');
    const taken = new Set();
    for (const seat of ['夜勤','早番','遅番']) {
      const cand = avail.filter(s => !taken.has(s.id) && (s.role !== '介護補助') &&
        (seat !== '夜勤' || s.nightOk) && s.hab[dow] === seat);
      if (cand.length) { const s = cand[0]; rec[s.id][d] = seat; taken.add(s.id);
        if (seat === '夜勤' && d + 1 <= dim) { rec[s.id][d + 1] = '明け'; } }
    }
    // 席が埋まらなければ空きから補充(日勤中心)
    for (const seat of ['夜勤','早番','遅番']) {
      if (staff.some(s => rec[s.id][d] === seat)) continue;
      const c = avail.find(s => !taken.has(s.id) && rec[s.id][d] !== '明け' && (s.role !== '介護補助' || seat === '日勤') && (seat !== '夜勤' || s.nightOk) && !rec[s.id][d]);
      if (c) { rec[c.id][d] = seat; taken.add(c.id); if (seat === '夜勤' && d + 1 <= dim) rec[c.id][d + 1] = '明け'; }
    }
    // 残りは日勤
    for (const s of staff) if (!rec[s.id][d]) rec[s.id][d] = '日勤';
  }
  return rec;
}

// ── 学習用DB: 2025-01..07、対象(正解)=2025-08 ──
const db = {};
for (let mo = 1; mo <= 7; mo++) db[`shifts_2025_${mo}_${DEPT}`] = genMonth(2025, mo, 100 + mo);
const actual = genMonth(2025, 8, 999);
const Y = 2025, M0 = 7; // 8月(0始まり7)
const dim = getDays(Y, M0);
const trend = computeLearnedTrend(db, staff);

// 対象月の希望休を実績から抽出(バックテストと同じ入力再現)、希望勤務はクリア
const mk = `2025-8`;
const btStaff = staff.map(s => {
  const kibo = []; for (const [d, v] of Object.entries(actual[s.id])) if (v === '希望休') kibo.push(+d);
  return { ...s, kiboByMonth: { ...s.kiboByMonth, [mk]: kibo }, yukyuByMonth: { ...s.yukyuByMonth, [mk]: [] }, shiftRequestsByMonth: { ...s.shiftRequestsByMonth, [mk]: {} } };
});

// ── 今のエンジン: bestOfN 30回 ──
const engineRun = bestOfN(btStaff, dept, Y, M0, {}, trend, 30, {}).shifts;

// ── CP-SAT入力(学習値付き)を組み立て ──
const WORK = ['早番','日勤','遅番','夜勤'];
function learnFor(name) {
  const t = trend[name]; const rate = {}, freq = {};
  for (let dow = 0; dow < 7; dow++) {
    const sr = t?.dowShiftRate?.[dow] || {}; rate[dow] = {}; freq[dow] = {};
    const cell = t?.dowCellObs?.[dow] || 0; const obs = t?.dowShiftObs?.[dow] || {};
    for (const k of WORK) {
      if (sr[k] != null) rate[dow][k] = sr[k];
      freq[dow][k] = cell > 0 ? (obs[k] || 0) / cell : 0;
    }
  }
  const rest = [...Array(7)].map((_, dow) => t?.dowRestRate?.[(dow + 6) % 7] ?? null);
  return { rate, freq, rest };
}
const cpInput = {
  year: Y, month: M0, days: dim, shiftTypes: WORK,
  minStaff: dept.minStaff, maxStaff: dept.maxStaff, maxConsec: 5, roleShiftTypes: dept.roleShiftTypes,
  prevTail: {}, actual,
  staff: btStaff.map(s => ({ id: s.id, name: s.name, role: s.role, nightOk: s.nightOk,
    kyukoDays: s.kyukoDays, kibo: s.kiboByMonth[mk] || [], yukyu: [], requests: {}, learn: learnFor(s.name) })),
};
const inPath = path.join(HERE, '_cmp_input.json');
fs.writeFileSync(inPath, JSON.stringify(cpInput));

function cpsat(mode) {
  const outPath = path.join(HERE, `_cmp_${mode}.json`);
  execFileSync('python3', [path.join(HERE, 'solve.py'), inPath, outPath, mode], { stdio: ['ignore','ignore','inherit'] });
  const o = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  return o;
}
const cpRate = cpsat('rate');
const cpFreq = cpsat('freq');

// ── 指標で比較 ──
function metrics(run) {
  return computeBacktestMetrics({ actual, runs: [run], staffList: btStaff, dept, trend, year: Y, month: M0 });
}
const cols = [
  ['今のエンジン(bestOfN)', metrics(engineRun)],
  ['CP-SAT 率ベース', cpRate.solution && Object.keys(cpRate.solution).length ? metrics(cpRate.solution) : null],
  ['CP-SAT 頻度ベース', cpFreq.solution && Object.keys(cpFreq.solution).length ? metrics(cpFreq.solution) : null],
];
const pc = (v) => v == null ? '—' : (v * 100).toFixed(1) + '%';
console.log('\n=== Step B 比較 (合成・介護部2階相当 9名 / 対象2025-08を隠して学習は01-07) ===');
console.log('CP-SAT status: rate=%s freq=%s', cpRate.status, cpFreq.status);
console.log('\n指標                | ' + cols.map(c => c[0].padEnd(20)).join(' | '));
const rowA = cols.map(c => c[1] ? pc(c[1].A.avg) : '—');
console.log('セル一致率A          | ' + rowA.map(v => v.padEnd(20)).join(' | '));
for (const T of ['早番','日勤','遅番','夜勤']) {
  const r = cols.map(c => { if (!c[1]) return '—'; const cc = c[1].C.find(x => x.type === T); return cc ? pc(cc.avg) : '—'; });
  console.log(`再現率C ${T.padEnd(3)}        | ` + r.map(v => v.padEnd(20)).join(' | '));
}
const rowF = cols.map(c => c[1] && c[1].fMeanAbsDiff != null ? (c[1].fMeanAbsDiff*100).toFixed(1)+'pt' : '—');
console.log('休みF 平均絶対差     | ' + rowF.map(v => v.padEnd(20)).join(' | '));

// 正社員の個別一致率(B)
console.log('\n個別セル一致率(正社員):');
const bmap = cols.map(c => { const m = {}; if (c[1]) c[1].B.forEach(b => m[b.name] = b.avg); return m; });
for (const s of btStaff.filter(s => s.role !== '介護補助')) {
  const vals = bmap.map(m => pc(m[s.name]));
  console.log(`  ${s.name.padEnd(14)} | ` + vals.map(v => v.padEnd(20)).join(' | '));
}
// 後片付け
for (const f of ['_cmp_input.json','_cmp_rate.json','_cmp_freq.json']) { try { fs.unlinkSync(path.join(HERE, f)); } catch {} }
