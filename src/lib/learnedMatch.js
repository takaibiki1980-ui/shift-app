/**
 * 学習一致度（生成した瞬間に分かる先行指標）の計測ロジック。
 *
 * computeLearnedTrend が返す各スタッフの dowShiftRate（曜日×シフト種別の出現率）を
 * 読み取るだけで、生成・学習ロジックには一切関与しない独立モジュール。
 *
 * 生成された各配置セル（FIXED〔希望休・有休・夜勤・明け〕と空白・休みを除いた
 * 実質の勤務配置）について、「そのスタッフが・その曜日に・そのシフト種別に入る
 * 学習上の確率」= dowShiftRate[曜日][シフト種別] を参照し、その平均を%で返す。
 * 高いほど「過去の癖に沿った生成」を意味する。
 *
 * 【集約に単純平均を採る理由】
 *   参照する確率は各セル 0〜1 に有界のため、1セルが平均に与える影響も
 *   最大 1/count に抑えられ、極端な外れ値で数字が暴れることがない。
 *   まず解釈の容易な単純平均で開始する（中央値等への差し替えは将来検討可）。
 *
 * 学習データ不足（trend が無い / 対象セルが少なすぎる）の月は null を返し、
 * 誤解を招く数字を出さず「—（学習データ不足）」表示に委ねる。
 */
import { nameMatch, getDays } from '../engine/core.js';

const FIXED_CELLS = new Set(['希望休', '有休', '夜勤', '明け']);
const MIN_CELLS = 5; // これ未満は母数不足として null

/**
 * @param {Object} shifts      { staffId: { day: shift } } 生成されたシフト
 * @param {Array}  staffList   スタッフ配列
 * @param {Object} dept        部署（customShiftDefs 参照）
 * @param {number} year
 * @param {number} month       0始まり
 * @param {Object|null} learnedTrend computeLearnedTrend の戻り値（name→trend）
 * @returns {number|null} 0〜100 の整数（%）、計測不能なら null
 */
export function computeLearnedMatch(shifts, staffList, dept, year, month, learnedTrend) {
  if (!learnedTrend || Object.keys(learnedTrend).length === 0) return null;
  const ds = staffList.filter(s => s.dept === dept.id);
  const customKeys = (dept?.customShiftDefs || []).map(cd => cd.key).filter(Boolean);
  // 学習の曜日別確率で評価する勤務種別（夜勤・明けはFIXEDとして除外）
  const WORK_EVAL = new Set(['早番', '日勤', '遅番', ...customKeys].filter(k => !FIXED_CELLS.has(k)));
  const days = getDays(year, month);

  let sum = 0;
  let count = 0;
  for (const s of ds) {
    const tKey = Object.keys(learnedTrend).find(
      k => k !== '_months' && k !== '_monthCounts' && nameMatch(k, s.name)
    );
    const trend = tKey ? learnedTrend[tKey] : null;
    if (!trend?.dowShiftRate) continue; // 学習データが無いスタッフはスキップ
    for (let d = 1; d <= days; d++) {
      const v = shifts[s.id]?.[d];
      if (!v || FIXED_CELLS.has(v) || !WORK_EVAL.has(v)) continue; // 実質配置のみ
      const dow = new Date(year, month, d).getDay(); // 0=日〜6=土（dowShiftRateと同一体系）
      const rateMap = trend.dowShiftRate[dow];
      if (!rateMap) continue; // その曜日のデータ薄→評価対象外
      sum += (rateMap[v] || 0); // 学習上その曜日にその種別に入る確率
      count++;
    }
  }
  if (count < MIN_CELLS) return null;
  return Math.round((sum / count) * 100);
}
