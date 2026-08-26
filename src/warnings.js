/**
 * 生成結果の警告（直されそうなセル）判定 — 表示レイヤー用の純粋関数。
 *
 * 生成結果・保存データ・生成/学習ロジックには一切影響しない（判定して警告リストを返すだけ）。
 * 学習値（Wilson下限・観測回数）は computeLearnedTrend の出力（dowShiftObs/dowWorkObs/_monthCounts）
 * と wilsonLower を流用する。新しいアルゴリズムは追加しない。
 *
 * レベル1「癖違反」（強・赤）：確定癖(wilsonLower(k,n)>=STRONG_RATE かつ monthCounts>=STRONG_MONTHS)が
 *   あるのに生成が別の勤務を置いた。生成が休み系は対象外／明けは前日夜勤従属のため対象外。
 * レベル2「異例配置」（弱・薄黄）：生成の勤務種別kが dowShiftObs[dow][k]===0 かつ dowWorkObs[dow]>=4
 *   （前例なし・データ不足でない）。勤務のみ。レベル1と重複時はレベル1優先。1人あたり最大3件。
 *
 * 出力: [{ staffId, name, day, level, dow, reason, k, n, wilsonLower, expected?, actual }]
 */
import { getDays, nameMatch, wilsonLower, STRONG_RATE, STRONG_MONTHS, WILSON_Z, HARD_REST_MIN_OBS } from './engine/core.js';

const REST_SET = new Set(['休み', '希望休', '有休']);
const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];
const L2_MAX_PER_STAFF = 3;

function trendFor(trend, name) {
  if (!trend) return null;
  if (trend[name]) return trend[name];
  const key = Object.keys(trend).find(k => k !== '_monthCounts' && k !== '_months' && nameMatch(k, name));
  return key ? trend[key] : null;
}
function monthCountFor(trend, name) {
  const mc = trend?._monthCounts;
  if (!mc) return 0;
  if (mc[name] != null) return mc[name];
  const key = Object.keys(mc).find(k => nameMatch(k, name));
  return key ? (mc[key] || 0) : 0;
}

/**
 * @param {{shifts, staffList, dept, trend, year, month}} p
 *   shifts: { [staffId]: { [day]: shift } }（生成結果・表示値）
 * @returns 警告リスト
 */
export function computeWarnings({ shifts, staffList, dept, trend, year, month }) {
  const days = getDays(year, month);
  const ds = (staffList || []).filter(s => s.dept === dept.id);
  const out = [];
  for (const s of ds) {
    const t = trendFor(trend, s.name);
    if (!t) continue;
    const mc = monthCountFor(trend, s.name);
    const l2 = [];
    for (let d = 1; d <= days; d++) {
      const v = shifts?.[s.id]?.[d];
      if (!v) continue;
      const dow = new Date(year, month, d).getDay();
      const nObs = t.dowWorkObs?.[dow] ?? 0;
      const obs = t.dowShiftObs?.[dow] || {};

      // ── レベル3: 「本物の100%休み」の曜日に勤務が置かれた（D-1安全弁で人員確保のため解除された日） ──
      // 実績が十分あり(該当曜日 >= HARD_REST_MIN_OBS 回)、その全てが休み系(一度も出勤なし)なのに勤務。
      // 隠さず明示する警告（生成ロジックには影響しない・表示のみ）。
      const cellObs = t.dowCellObs?.[dow] ?? 0;
      const restObs = t.dowRestObs?.[dow] ?? 0;
      const isHardRest100 = cellObs >= HARD_REST_MIN_OBS && restObs === cellObs;
      if (isHardRest100 && !REST_SET.has(v) && v !== '明け') {
        out.push({
          staffId: s.id, name: s.name, day: d, level: 3, dow, hardRest100: true,
          reason: `${s.name}さんの${DOW_JA[dow]}曜は実績${cellObs}回すべて休み（本物の100%）。この日は人員確保のため通常休みの職員を配置しています`,
          k: restObs, n: cellObs, wilsonLower: null, expected: '休み', actual: v,
        });
        continue; // レベル3優先
      }

      // ── レベル1: 確定癖と違う勤務が置かれた ──
      let strongShift = null, sk = 0, sw = 0;
      if (mc >= STRONG_MONTHS && nObs > 0) {
        for (const [sh, k] of Object.entries(obs)) {
          const w = wilsonLower(k, nObs, WILSON_Z);
          if (w >= STRONG_RATE) { strongShift = sh; sk = k; sw = w; break; } // 過半数は1種のみ
        }
      }
      if (strongShift && v !== strongShift && !REST_SET.has(v) && v !== '明け') {
        out.push({
          staffId: s.id, name: s.name, day: d, level: 1, dow,
          reason: `${s.name}さんの${DOW_JA[dow]}曜は${strongShift}の癖（${sk}/${nObs}回・Wilson下限${(sw * 100).toFixed(1)}%）。生成は${v}`,
          k: sk, n: nObs, wilsonLower: sw, expected: strongShift, actual: v,
        });
        continue; // レベル1優先
      }

      // ── レベル2: 勤務のみ・その曜日で前例ゼロ（データは十分ある） ──
      if (REST_SET.has(v) || v === '明け') continue;
      const kObs = obs[v] ?? 0;
      if (kObs === 0 && nObs >= 4) {
        const rate = t.dowShiftRate?.[dow]?.[v] ?? 0;
        l2.push({
          staffId: s.id, name: s.name, day: d, level: 2, dow,
          reason: `${s.name}さんの${DOW_JA[dow]}曜に${v}の前例なし（${DOW_JA[dow]}曜観測${nObs}回中0回）`,
          k: 0, n: nObs, wilsonLower: null, actual: v, _rate: rate,
        });
      }
    }
    // レベル2は1人あたり最大3件（学習上の確率が低い順）
    l2.sort((a, b) => a._rate - b._rate).slice(0, L2_MAX_PER_STAFF).forEach(w => { delete w._rate; out.push(w); });
  }
  return out;
}
