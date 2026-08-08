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
import { getDays, nameMatch } from '../engine/core.js';

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
        const row = {
          name: s.name, dow: DOW_JA[dow], shift,
          learnRate, monthCount: mc,
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

export { pct as formatPct, DOW_JA };
