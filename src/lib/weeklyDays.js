/**
 * スタッフ設定「週◯日出勤」（月曜〜日曜で数える）の純粋ロジック。
 *
 * PR-1 はこの純粋関数とテストのみ（画面入力は PR-2、生成反映は PR-3、有効化は PR-4）。
 * 既存の workDayValue・core.js・生成には非接触。ここは「週の出勤日数の数え方」と
 * 「月の出勤上限／休みの目標」を計算するだけ。
 *
 * 用語:
 *   - 週は月曜始まり（Mon=週頭）。
 *   - prevCellByDay / cellByDay は {日番号: シフト値} の形（prevTail と同じ発想）。
 */

// 出勤として数えない値（0）
const ZERO_TYPES = new Set(["休み", "希望休", "明け", ""]);
// 0.5 として数える値（半日休・午前有給+午後公休）
const HALF_TYPES = new Set(["有/休", "日/休", "休/日", "早/休", "休/遅"]);

/**
 * 1セル分の「週の出勤日数」への寄与。
 *   通常勤務=1 / 有休=1 / 早有・日有・有日・有遅=1 / 有/休=0.5 /
 *   日休・休日・早休・休遅=0.5 / 休み・希望休・明け・空=0。
 * @param {string} v セル値
 * @param {Set<string>} [restLike] 部署固有の休み種別を 0 扱いにしたい場合に渡す（任意）
 * @returns {number} 0 / 0.5 / 1
 */
export function weeklyWorkValue(v, restLike) {
  if (v == null) return 0;
  if (restLike && restLike.has(v)) return 0;
  if (ZERO_TYPES.has(v)) return 0;
  if (HALF_TYPES.has(v)) return 0.5;
  return 1; // 通常勤務・有休・半日有給(早/有 等)
}

// Monday始まりの曜日index（0=月 … 6=日）
function mondayIdx(weekday0Sun) { return (weekday0Sun + 6) % 7; }

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

/**
 * その月の週（月曜始まり）の区切りを返す。
 * @returns {Array<{current:number[], prevCount:number, prevDays:number[]}>}
 *   current  = その週に含まれる当月の日番号
 *   prevCount= その週のうち前月側に入る日数（月初の週のみ >0 になりうる）
 *   prevDays = 前月側の日番号（prevCount 日分・昇順）
 */
export function getMonthWeeks(year, month) {
  const days = daysInMonth(year, month);
  const firstMon = mondayIdx(new Date(year, month, 1).getDay()); // 月初の週で前月側に入る日数
  const weeks = [];
  const firstLen = Math.min(7 - firstMon, days);
  let prevDays = [];
  if (firstMon > 0) {
    const pmDays = daysInMonth(year, month - 1); // month-1 は Date が前年12月に正規化
    prevDays = range(pmDays - firstMon + 1, pmDays);
  }
  weeks.push({ current: range(1, firstLen), prevCount: firstMon, prevDays });
  let d = firstLen + 1;
  while (d <= days) {
    const len = Math.min(7, days - d + 1);
    weeks.push({ current: range(d, d + len - 1), prevCount: 0, prevDays: [] });
    d += len;
  }
  return weeks;
}

/**
 * 指定日を含む週で、その日より前にすでに出ている出勤日数（当月セル＋月初の週は前月側も）。
 * @param {Object} a
 * @param {number} a.day 当月の日番号
 * @param {Object<number,string>} [a.cellByDay] 当月 {日:値}
 * @param {Object<number,string>} [a.prevCellByDay] 前月 {日:値}
 * @param {number} a.year
 * @param {number} a.month 0始まり
 * @param {Set<string>} [a.restLike]
 * @returns {number}
 */
export function weeklyWorkBefore({ day, cellByDay = {}, prevCellByDay = {}, year, month, restLike }) {
  const firstMon = mondayIdx(new Date(year, month, 1).getDay());
  const wi = Math.floor((day - 1 + firstMon) / 7); // 週index（0始まり）
  const weekStart = wi * 7 - firstMon + 1;          // その週の当月側開始日（<1 もありうる）
  let sum = 0;
  for (let d = Math.max(1, weekStart); d < day; d++) sum += weeklyWorkValue(cellByDay[d], restLike);
  if (wi === 0 && firstMon > 0) {
    const pmDays = daysInMonth(year, month - 1);
    for (let i = 0; i < firstMon; i++) sum += weeklyWorkValue(prevCellByDay[pmDays - i], restLike);
  }
  return sum;
}

/**
 * その月の「出勤の上限」と「休みの目標」。週◯日が未設定なら {workCap:null, restTarget:null}。
 *   月初の週 = floor(min(cap − 前月側ですでに出た日数, 当月側の日数))（0未満は0）
 *   途中の週 = cap（＝min(cap, 7)）
 *   月末の週 = min(cap, 当月側の日数)
 *   休みの目標 = 月の日数 − 出勤の上限
 * @param {Object} a
 * @param {number|null|undefined} a.weeklyCap 週◯日（1〜6）。null/空は未設定
 * @param {number} a.year
 * @param {number} a.month 0始まり
 * @param {Object<number,string>} [a.prevCellByDay] 前月 {日:値}（月初の週の控除に使用）
 * @param {Set<string>} [a.restLike]
 * @returns {{workCap:number|null, restTarget:number|null}}
 */
export function monthlyWorkCapAndRest({ weeklyCap, year, month, prevCellByDay = {}, restLike }) {
  if (weeklyCap == null || weeklyCap === "") return { workCap: null, restTarget: null };
  const cap = Number(weeklyCap);
  const weeks = getMonthWeeks(year, month);
  let total = 0;
  for (const wk of weeks) {
    const cur = wk.current.length;
    if (wk.prevCount > 0) {
      const prevWorked = wk.prevDays.reduce((a, dn) => a + weeklyWorkValue(prevCellByDay[dn], restLike), 0);
      total += Math.max(0, Math.floor(Math.min(cap - prevWorked, cur)));
    } else {
      total += Math.min(cap, cur);
    }
  }
  return { workCap: total, restTarget: daysInMonth(year, month) - total };
}

/**
 * 生成結果の中で「週の出勤上限」を超えている箇所を数える（純粋・生成後の確認用）。
 * @param {Object} a
 * @param {Object<string,Object<number,string>>} a.cellByDayByStaff {staffId: {日:値}}（当月）
 * @param {Object<string,Object<number,string>>} [a.prevByStaff] {staffId: {日:値}}（前月・月初の週用）
 * @param {number} a.year
 * @param {number} a.month 0始まり
 * @param {Object<string,number|null>} a.capByStaff {staffId: 週上限}（null/未設定は対象外）
 * @param {Set<string>} [a.restLike]
 * @returns {Array<{staffId:string, weekStart:number, worked:number, cap:number}>}
 *   weekStart = その週の当月側の最初の日番号
 */
export function countWeeklyOverages({ cellByDayByStaff = {}, prevByStaff = {}, year, month, capByStaff = {}, restLike }) {
  const weeks = getMonthWeeks(year, month);
  const out = [];
  for (const staffId of Object.keys(capByStaff)) {
    const cap = capByStaff[staffId];
    if (cap == null) continue;
    const cells = cellByDayByStaff[staffId] || {};
    const prev = prevByStaff[staffId] || {};
    for (const wk of weeks) {
      let worked = wk.current.reduce((a, dn) => a + weeklyWorkValue(cells[dn], restLike), 0);
      if (wk.prevCount > 0) worked += wk.prevDays.reduce((a, dn) => a + weeklyWorkValue(prev[dn], restLike), 0);
      if (worked > cap) out.push({ staffId, weekStart: wk.current[0], worked, cap });
    }
  }
  return out;
}
