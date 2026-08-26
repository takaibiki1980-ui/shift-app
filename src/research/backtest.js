/**
 * 学習バックテスト（答え合わせ）指標計算 — 研究用・読み取り専用。
 *
 * この モジュールは「生成結果 vs 実績」を突合して指標A〜Fを計算する純粋関数のみ。
 * 生成（bestOfN）・学習集計（computeLearnedTrend）・保存は行わない（呼び出し側=App.jsxが実施）。
 * core.js のロジックには一切依存/変更しない（getDays/nameMatch の読み取り利用のみ）。
 *
 * 用語:
 *  - actual: 対象月の実績シフト { [staffId]: { [day]: shift } }（＝正解）
 *  - runs:   生成結果の配列（5回分）各要素 { [staffId]: { [day]: shift } }
 *  - fixed:  希望休/有休セル（入力）。A/B/C の分母から除外する
 */
import { getDays, nameMatch, wilsonLower } from '../engine/core.js';

const REST_INPUT = new Set(['希望休', '有休']);       // 入力（申請）＝答え合わせ対象外
const REST_ANY   = new Set(['休み', '希望休', '有休']); // 休み系（指標F用）
const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

function stat(arr) {
  if (!arr.length) return { avg: null, min: null, max: null };
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { avg, min: Math.min(...arr), max: Math.max(...arr) };
}
const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');

// trend は氏名キー。staff.name を nameMatch で突合して学習値を引く。
function trendForStaff(trend, staff) {
  if (!trend) return null;
  if (trend[staff.name]) return trend[staff.name];
  const key = Object.keys(trend).find(k => k !== '_monthCounts' && k !== '_months' && nameMatch(k, staff.name));
  return key ? trend[key] : null;
}
function monthCountForStaff(trend, staff) {
  const mc = trend?._monthCounts;
  if (!mc) return 0;
  if (mc[staff.name] != null) return mc[staff.name];
  const key = Object.keys(mc).find(k => nameMatch(k, staff.name));
  return key ? (mc[key] || 0) : 0;
}

/**
 * 指標A〜Fを計算する。
 * @param {{actual, runs, staffList, dept, trend, year, month}} p
 * @returns 指標オブジェクト
 */
export function computeBacktestMetrics({ actual, runs, staffList, dept, trend, year, month }) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  const shiftTypes = [...new Set(dept.shiftTypes)];
  // 突合対象の種別（明け・休みも含める）
  const compareTypes = [...new Set([...shiftTypes, '明け', '休み'])];

  const cell = (obj, sid, d) => obj?.[sid]?.[d] ?? '';
  const isFixed = (sid, d) => REST_INPUT.has(cell(actual, sid, d));

  // ── 指標A: セル一致率（全体・固定セル除外） ──
  const aPer = runs.map(run => {
    let match = 0, total = 0;
    for (const s of ds) for (let d = 1; d <= days; d++) {
      const av = cell(actual, s.id, d);
      if (av === '' || isFixed(s.id, d)) continue;
      total++;
      if (cell(run, s.id, d) === av) match++;
    }
    return total > 0 ? match / total : 0;
  });
  const A = stat(aPer);

  // ── 指標B: スタッフ別一致率（平均） ──
  const B = ds.map(s => {
    const per = runs.map(run => {
      let match = 0, total = 0;
      for (let d = 1; d <= days; d++) {
        const av = cell(actual, s.id, d);
        if (av === '' || isFixed(s.id, d)) continue;
        total++;
        if (cell(run, s.id, d) === av) match++;
      }
      return total > 0 ? match / total : null;
    }).filter(v => v != null);
    return { id: s.id, name: s.name, ...stat(per) };
  }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  // ── 指標C: シフト種別ごとの一致率（実績==Tのセルのうち生成==Tの率＝再現率） ──
  const C = compareTypes.map(T => {
    const per = runs.map(run => {
      let match = 0, total = 0;
      for (const s of ds) for (let d = 1; d <= days; d++) {
        const av = cell(actual, s.id, d);
        if (av !== T || isFixed(s.id, d)) continue;
        total++;
        if (cell(run, s.id, d) === T) match++;
      }
      return total > 0 ? match / total : null;
    }).filter(v => v != null);
    return { type: T, ...stat(per) };
  }).filter(r => r.avg != null);

  // ── 指標D/E: 強癖(≥0.5)・中癖(0.3〜0.5)セルの再現率 ──
  // (staff, dow, shift) ごとに、対象月の該当曜日での 実績出現率 と 生成出現率 を並べる。
  const dowDaysActual = {}; // sid -> [7] その曜日の"値ありセル"数（実績）
  const strongRows = [], midRows = [];
  for (const s of ds) {
    const t = trendForStaff(trend, s);
    if (!t?.dowShiftRate) continue;
    const mc = monthCountForStaff(trend, s);
    for (let dow = 0; dow < 7; dow++) {
      const rateMap = t.dowShiftRate[dow];
      if (!rateMap) continue;
      // 対象月のこの曜日の日リスト
      const dowDays = [];
      for (let d = 1; d <= days; d++) if (new Date(year, month, d).getDay() === dow) dowDays.push(d);
      if (dowDays.length === 0) continue;
      for (const shift of Object.keys(rateMap)) {
        const learnRate = rateMap[shift];
        if (learnRate == null) continue;
        const isStrong = learnRate >= 0.5 && mc >= 2;
        const isMid = learnRate >= 0.3 && learnRate < 0.5;
        if (!isStrong && !isMid) continue;
        // 実績出現率
        const actDen = dowDays.filter(d => cell(actual, s.id, d) !== '').length;
        const actHit = dowDays.filter(d => cell(actual, s.id, d) === shift).length;
        const actualRate = actDen > 0 ? actHit / actDen : null;
        // 生成出現率（5回平均）
        const genPer = runs.map(run => {
          const den = dowDays.filter(d => cell(run, s.id, d) !== '').length;
          const hit = dowDays.filter(d => cell(run, s.id, d) === shift).length;
          return den > 0 ? hit / den : null;
        }).filter(v => v != null);
        // Wilson下限（重みなし生カウントから算出・判定と同じ指標）
        const kObs = t.dowShiftObs?.[dow]?.[shift] ?? 0;
        const nObs = t.dowWorkObs?.[dow] ?? 0;
        const wilson = nObs > 0 ? wilsonLower(kObs, nObs) : null;
        const row = {
          name: s.name, dow: DOW_JA[dow], shift,
          learnRate, monthCount: mc,
          wilson, obs: `${kObs}/${nObs}`,
          actualRate, gen: stat(genPer),
        };
        (isStrong ? strongRows : midRows).push(row);
      }
    }
  }
  const byLearnDesc = (a, b) => b.learnRate - a.learnRate;
  strongRows.sort(byLearnDesc); midRows.sort(byLearnDesc);

  // ── 指標F: 休み曜日の一致（曜日別の休み率 実績 vs 生成） ──
  // dow(0=日..6=土) ごとに 休み系セル率 を比較し、L1差の平均を出す。
  const F = [];
  let fL1 = [];
  for (let dow = 0; dow < 7; dow++) {
    const dowDays = [];
    for (let d = 1; d <= days; d++) if (new Date(year, month, d).getDay() === dow) dowDays.push(d);
    const den = ds.length * dowDays.length;
    if (den === 0) continue;
    const actRest = ds.reduce((sum, s) => sum + dowDays.filter(d => REST_ANY.has(cell(actual, s.id, d))).length, 0);
    const actualRate = actRest / den;
    const genPer = runs.map(run =>
      ds.reduce((sum, s) => sum + dowDays.filter(d => REST_ANY.has(cell(run, s.id, d))).length, 0) / den
    );
    const g = stat(genPer);
    F.push({ dow: DOW_JA[dow], actualRate, gen: g });
    if (g.avg != null) fL1.push(Math.abs(actualRate - g.avg));
  }
  const fMeanAbsDiff = fL1.length ? fL1.reduce((a, b) => a + b, 0) / fL1.length : null;

  // 固定セル数（参考）
  let fixedCount = 0;
  for (const s of ds) for (let d = 1; d <= days; d++) if (isFixed(s.id, d)) fixedCount++;

  return {
    days, runsCount: runs.length, fixedCount,
    A, B, C, strongRows, midRows, F, fMeanAbsDiff,
    _fmt: { pct }, // 表示ヘルパー
  };
}

/**
 * 指標G「変化追随率」— 概念漂流（役割変更）への追随を測る。研究用・読み取り専用。
 * A〜Fの計算とは独立（既存指標に一切影響しない・追加のみ）。
 *
 * 学習ウィンドウ（対象月を除く月別実績）を前半(old)/後半(直近recentCount月, new)に分け、
 * スタッフ×曜日ごとに最頻種別が old≠new に入れ替わった「変化セル」を抽出し、
 * 生成が new/old のどちらに従ったか、実績(対象月)が new だったかを並べる。
 *
 * @param {{actual, runs, staffList, dept, monthlyShifts, year, month, recentCount?, minNewObs?}} p
 *   monthlyShifts: [{ y, m0(0始まり月), shifts:{[sid]:{[day]:shift}} }] （対象月・例外月は除外済み）
 *   year/month: 対象月（month は 0始まり）
 * @returns {{available, reason?, changeCells, followNew, stayOld, actualNew, summary:{changeCells,followNew,stayOld,actualNew}, rows, olderMonths, recentMonths}}
 */
export function computeDriftMetric({ actual, runs, staffList, dept, monthlyShifts, year, month, recentCount = 2, minNewObs = 2 }) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  const cell = (obj, sid, d) => obj?.[sid]?.[d] ?? obj?.[sid]?.[String(d)] ?? '';
  // 入力(申請)・派生は除外。役割変更は勤務種別/休みの最頻遷移で捉える。
  const EXCLUDE = new Set(['', '明け', '希望休', '有休']);
  const months = [...(monthlyShifts || [])].sort((a, b) => (a.y * 12 + a.m0) - (b.y * 12 + b.m0));
  const emptySummary = { changeCells: 0, followNew: null, stayOld: null, actualNew: null };
  if (months.length < 2) return { available: false, reason: `学習に使える月が${months.length}ヶ月（前半/後半に分けられません）`, changeCells: 0, followNew: null, stayOld: null, actualNew: null, summary: emptySummary, rows: [], olderMonths: months.length, recentMonths: 0 };
  const recent = months.slice(-recentCount);
  const older = months.slice(0, months.length - recent.length);
  if (older.length === 0 || recent.length === 0) return { available: false, reason: '前半または後半の月が不足しています', changeCells: 0, followNew: null, stayOld: null, actualNew: null, summary: emptySummary, rows: [], olderMonths: older.length, recentMonths: recent.length };

  const collect = (arr, sid, dow) => {
    const cnt = {}; let n = 0;
    for (const { y, m0, shifts } of arr) {
      const dim = getDays(y, m0);
      for (let d = 1; d <= dim; d++) {
        if (new Date(y, m0, d).getDay() !== dow) continue;
        const v = shifts?.[sid]?.[d] ?? shifts?.[sid]?.[String(d)] ?? '';
        if (EXCLUDE.has(v)) continue;
        cnt[v] = (cnt[v] || 0) + 1; n++;
      }
    }
    return { cnt, n };
  };
  const topOf = (cnt) => { let best = null, bc = -1; for (const [k, c] of Object.entries(cnt)) if (c > bc) { bc = c; best = k; } return best; };
  const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const rows = [];
  for (const s of ds) {
    for (let dow = 0; dow < 7; dow++) {
      const dowDays = [];
      for (let d = 1; d <= days; d++) if (new Date(year, month, d).getDay() === dow) dowDays.push(d);
      if (dowDays.length === 0) continue;
      const O = collect(older, s.id, dow), N = collect(recent, s.id, dow);
      if (O.n === 0 || N.n === 0) continue;
      const old = topOf(O.cnt), nw = topOf(N.cnt);
      if (!old || !nw || old === nw) continue;
      if ((N.cnt[nw] || 0) < minNewObs) continue; // 後半で new が minNewObs 回以上
      const actDen = dowDays.filter(d => cell(actual, s.id, d) !== '').length;
      const actualNewRate = actDen > 0 ? dowDays.filter(d => cell(actual, s.id, d) === nw).length / actDen : null;
      const genRate = (target) => mean(runs.map(run => {
        const den = dowDays.filter(d => cell(run, s.id, d) !== '').length;
        return den > 0 ? dowDays.filter(d => cell(run, s.id, d) === target).length / den : null;
      }).filter(v => v != null));
      rows.push({
        name: s.name, dow: DOW_JA[dow], old, new: nw,
        oldObs: `${O.cnt[old] || 0}/${O.n}`, newObs: `${N.cnt[nw] || 0}/${N.n}`,
        actualNewRate, genNewRate: genRate(nw), genOldRate: genRate(old),
      });
    }
  }
  const followNew = mean(rows.map(r => r.genNewRate).filter(v => v != null));
  const stayOld = mean(rows.map(r => r.genOldRate).filter(v => v != null));
  const actualNew = mean(rows.map(r => r.actualNewRate).filter(v => v != null));
  return {
    available: true, changeCells: rows.length, followNew, stayOld, actualNew,
    // サマリー（表上部表示用）: 変化セル総件数・生成new率(追随)平均・生成old率平均・実績new率平均。
    // 明細 rows・指標A〜F・既存フラット値には影響しない集計表示の追加。
    summary: { changeCells: rows.length, followNew, stayOld, actualNew },
    rows, olderMonths: older.length, recentMonths: recent.length,
  };
}

/**
 * 指標H「表示確率 vs 実現率」— UIに表示している確率が、実際の生成でどれだけ実現しているか。
 * 研究用・読み取り専用。A〜G・生成ロジックに一切影響しない（純粋関数・追加のみ）。
 *
 * 「表示確率」= LearnStatusView / セルツールチップ等でユーザーに見せている学習確率。
 *   - 休み率: trend.dowRestRate（月=0..日=6 インデックス）
 *   - 勤務種別率: trend.dowShiftRate（0=日..6=土 インデックス）
 * 「実現率」= まっさら状態（希望休/希望勤務なし）で生成した runs における、対象月の
 *   その曜日での 該当セル出現率（非空セル分母・5回平均）。
 *
 * 各 (staff, dow) を確率帯にビニングし、帯ごとに「表示確率平均 vs 実現率平均」を並べる。
 * 特に「表示100%（=1.0）」が実際に何%実現しているかを別枠で出す（金を払う価値がある誠実さの核）。
 *
 * @param {{runs, staffList, dept, trend, year, month, minObs?}} p
 *   runs: まっさら生成の結果配列（各 {[sid]:{[day]:shift}}）
 *   minObs: この生観測数(dowWorkObs / dowCellObs)未満の (staff,dow) は薄すぎる表示として集計から除外
 * @returns {{available, reason?, rest, shift, _fmt}}
 *   rest/shift それぞれ { bands:[{label,lo,hi,n,dispAvg,realAvg,gap}], full:{n,dispAvg,realAvg,gap}, rows:[...] }
 */
export function computeDisplayVsRealizedMetric({ runs, staffList, dept, trend, year, month, minObs = 3 }) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  const cell = (obj, sid, d) => obj?.[sid]?.[d] ?? obj?.[sid]?.[String(d)] ?? '';
  if (!runs?.length) return { available: false, reason: '生成結果(runs)がありません', rest: null, shift: null, _fmt: { pct } };
  if (!trend) return { available: false, reason: '学習データ(trend)がありません', rest: null, shift: null, _fmt: { pct } };

  const dowDaysOf = (dow) => {
    const arr = [];
    for (let d = 1; d <= days; d++) if (new Date(year, month, d).getDay() === dow) arr.push(d);
    return arr;
  };
  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  // 生成runsでの (staff,dow,判定) 実現率（非空セル分母・5回平均）。matchFn(shiftValue)=>bool
  const realizedRate = (sid, dowDays, matchFn) => mean(runs.map(run => {
    const den = dowDays.filter(d => cell(run, sid, d) !== '').length;
    if (den === 0) return null;
    return dowDays.filter(d => matchFn(cell(run, sid, d))).length / den;
  }).filter(v => v != null));

  // 確率帯ビニング（0-20 / 20-40 / 40-60 / 60-80 / 80-100）。100%(=1.0)は full 別枠にも入れる。
  const BANDS = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0]];
  const bandLabel = ([lo, hi]) => `${Math.round(lo * 100)}〜${Math.round(hi * 100)}%`;
  const summarize = (rows) => {
    const bands = BANDS.map(([lo, hi]) => {
      const inb = rows.filter(r => r.disp >= lo && (hi >= 1.0 ? r.disp <= hi : r.disp < hi) && r.real != null);
      return {
        label: bandLabel([lo, hi]), lo, hi, n: inb.length,
        dispAvg: mean(inb.map(r => r.disp)), realAvg: mean(inb.map(r => r.real)),
        gap: inb.length ? mean(inb.map(r => Math.abs(r.disp - r.real))) : null,
      };
    });
    // 表示100%（>=0.999）別枠
    const fullRows = rows.filter(r => r.disp >= 0.999 && r.real != null);
    const full = {
      n: fullRows.length, dispAvg: mean(fullRows.map(r => r.disp)),
      realAvg: mean(fullRows.map(r => r.real)),
      gap: fullRows.length ? mean(fullRows.map(r => Math.abs(r.disp - r.real))) : null,
    };
    // 全体の平均絶対差（キャリブレーション誤差）
    const withReal = rows.filter(r => r.real != null);
    const meanAbsGap = withReal.length ? mean(withReal.map(r => Math.abs(r.disp - r.real))) : null;
    return { bands, full, meanAbsGap, count: withReal.length };
  };

  // ── 休み率（dowRestRate） ──
  const restRows = [];
  for (const s of ds) {
    const t = trendForStaff(trend, s);
    if (!t?.dowRestRate) continue;
    for (let dow = 0; dow < 7; dow++) {
      const dowDays = dowDaysOf(dow);
      if (!dowDays.length) continue;
      const nObs = t.dowCellObs?.[dow] ?? 0;         // getDay基準の生観測数
      if (nObs < minObs) continue;
      const disp = t.dowRestRate[(dow + 6) % 7];     // dowRestRateは月=0..日=6
      if (disp == null) continue;
      const real = realizedRate(s.id, dowDays, (v) => REST_ANY.has(v));
      restRows.push({ name: s.name, dow: DOW_JA[dow], disp, real, obs: nObs });
    }
  }

  // ── 勤務種別率（dowShiftRate） ──
  const shiftRows = [];
  for (const s of ds) {
    const t = trendForStaff(trend, s);
    if (!t?.dowShiftRate) continue;
    for (let dow = 0; dow < 7; dow++) {
      const rateMap = t.dowShiftRate[dow];
      if (!rateMap) continue;
      const dowDays = dowDaysOf(dow);
      if (!dowDays.length) continue;
      const nObs = t.dowWorkObs?.[dow] ?? 0;
      if (nObs < minObs) continue;
      for (const shift of Object.keys(rateMap)) {
        const disp = rateMap[shift];
        if (disp == null || disp < 0.05) continue;   // ほぼ0%の種別は表示対象外
        const real = realizedRate(s.id, dowDays, (v) => v === shift);
        shiftRows.push({ name: s.name, dow: DOW_JA[dow], shift, disp, real, obs: nObs });
      }
    }
  }

  const byDispDesc = (a, b) => b.disp - a.disp;
  restRows.sort(byDispDesc); shiftRows.sort(byDispDesc);

  return {
    available: true,
    rest: { ...summarize(restRows), rows: restRows },
    shift: { ...summarize(shiftRows), rows: shiftRows },
    _fmt: { pct },
  };
}

export { pct as formatPct, DOW_JA };
