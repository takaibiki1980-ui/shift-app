/**
 * 曜日パターン（繰り返しルール）の純粋ロジック。生成・core.js には非関与。
 *
 * リーダーが「毎週○曜」「毎月第N○曜」に勤務種別を割り当てる繰り返しルールを、
 * その月の具体的な日付に展開し、希望勤務(shiftRequestsByMonth[mk]=青)へ反映する。
 *
 * v1 は「勤務種別のみ」を対象とする（希望休・有休は対象外。呼び出し側で除外し、
 * v2 で kiboByMonth/yukyuByMonth＋staff_kibo write-through として別途対応する）。
 *
 * パターンの形:
 *   { id, kind:'weekly'|'nth', nth?:1..5, dow:0..6, shift:string }
 *     dow  = 0(日)..6(土)  ※ Date.getDay() と同じ並び
 *     kind = 'weekly' 毎週その曜日 / 'nth' 毎月そのN番目のその曜日
 *
 * 設計上の要:
 *   - 純粋関数（副作用なし・入力を破壊しない）。
 *   - 冪等（同じ入力で何度展開しても結果が同じ）。
 *   - 「個別変更が勝つ」= 手動で触ったセルはパターンで上書き/復活させない。
 */

// v1 対象外（希望休/有休）。展開時にスキップする。
export const NON_WORK_SHIFTS = new Set(['希望休', '有休', '有給']);

/**
 * その曜日パターンが対象月(month は0始まり)で当たる日番号を返す。
 * 第N週がその月に存在しない場合(第5週の欠け等)は空配列。
 * @returns {number[]} 昇順の日番号
 */
export function patternDays(year, month, pattern) {
  if (!pattern || pattern.dow == null) return [];
  const { kind, nth, dow } = pattern;
  const dim = new Date(year, month + 1, 0).getDate(); // 対象月の日数
  const out = [];
  let count = 0;
  for (let d = 1; d <= dim; d++) {
    if (new Date(year, month, d).getDay() !== dow) continue;
    count++; // その曜日の月内での出現回数（=第何週のその曜日か）
    if (kind === 'weekly') out.push(d);
    else if (kind === 'nth' && count === nth) out.push(d);
  }
  return out;
}

/**
 * 当月分の希望勤務(sr)へパターンを展開する純粋関数（staff 非依存・プレーンな入出力）。
 *
 * @param {Object}  args
 * @param {number}  args.year
 * @param {number}  args.month      0始まり
 * @param {Array}   args.patterns   [{id,kind,nth,dow,shift}]
 * @param {Object}  args.sr         現在の shiftRequestsByMonth[mk]  { [day]: shift }
 * @param {Object}  args.applied    前回パターンが書いた日           { [day]: shift }
 * @param {Object}  args.overrides  手動で触った日（保護対象）        { [day]: true }
 * @returns {{ sr: Object, applied: Object }} 新しい sr と、今回パターンが書いた applied
 */
export function expandPatternsForMonth({ year, month, patterns = [], sr = {}, applied = {}, overrides = {} }) {
  const nextSr = { ...sr };
  const prevApplied = new Set(Object.keys(applied || {}));

  // 1) 前回の自作分を撤去（手動で触っていない日だけ・値が自作のままの日だけ）。
  //    → パターンを消したり変えたりしたとき、古い自作値が取り残されないようにする。
  for (const dk of prevApplied) {
    if (overrides && overrides[dk]) continue;      // 手動で触った日は残す
    if (nextSr[dk] === applied[dk]) delete nextSr[dk]; // 値が自作のままなら撤去
  }

  // 2) 当月の対象日を算出して書き込む（配列で後にあるパターンが後勝ち）。
  const nextApplied = {};
  for (const p of (patterns || [])) {
    if (!p || !p.shift) continue;
    if (NON_WORK_SHIFTS.has(p.shift)) continue;    // v1: 勤務種別のみ
    for (const day of patternDays(year, month, p)) {
      const dk = String(day);
      if (overrides && overrides[dk]) continue;    // 個別が勝つ（手動で消した/変えた日）
      // 既存の手動希望（前回自作でない値）が入っている日は尊重して上書きしない
      if (nextSr[dk] != null && !prevApplied.has(dk) && nextApplied[dk] == null) continue;
      nextSr[dk] = p.shift;
      nextApplied[dk] = p.shift;
    }
  }

  return { sr: nextSr, applied: nextApplied };
}

/**
 * staff オブジェクトへパターンを展開した新しい staff を返す（純粋・非破壊）。
 * PR-C の配線で map するだけで使える薄いラッパ。変化が無ければ同一参照を返す。
 * mk = `${year}-${month+1}`（monthKey と同一書式）。
 *
 * @param {Object} staff  { recurringPatterns, shiftRequestsByMonth, patternAppliedByMonth, patternOverridesByMonth }
 * @param {number} year
 * @param {number} month  0始まり
 * @returns {Object} 更新後 staff（変化なしなら同一参照）
 */
export function applyPatternsToStaff(staff, year, month) {
  if (!staff) return staff;
  const patterns = staff.recurringPatterns;
  const mk = `${year}-${month + 1}`;
  const applied = staff.patternAppliedByMonth?.[mk] || {};
  // パターンが無く、前回の自作分も無ければ何もしない（形を変えない）
  if ((!patterns || patterns.length === 0) && Object.keys(applied).length === 0) return staff;

  const sr = staff.shiftRequestsByMonth?.[mk] || {};
  const overrides = staff.patternOverridesByMonth?.[mk] || {};
  const res = expandPatternsForMonth({ year, month, patterns: patterns || [], sr, applied, overrides });

  // 変化判定（sr と applied の両方）
  const srSame = JSON.stringify(res.sr) === JSON.stringify(sr);
  const appliedSame = JSON.stringify(res.applied) === JSON.stringify(applied);
  if (srSame && appliedSame) return staff;

  const nextSrByMonth = { ...(staff.shiftRequestsByMonth || {}) };
  if (Object.keys(res.sr).length) nextSrByMonth[mk] = res.sr; else delete nextSrByMonth[mk];
  const nextAppliedByMonth = { ...(staff.patternAppliedByMonth || {}) };
  if (Object.keys(res.applied).length) nextAppliedByMonth[mk] = res.applied; else delete nextAppliedByMonth[mk];

  return { ...staff, shiftRequestsByMonth: nextSrByMonth, patternAppliedByMonth: nextAppliedByMonth };
}

/**
 * 手動で触った日を override として記録する純粋関数（非破壊）。
 * 右クリック/KIBOトグル/入替などで個別にセルを変更したとき呼び、
 *   - patternOverridesByMonth[mk][day] = true（以後パターンで上書き/復活させない）
 *   - patternAppliedByMonth[mk][day] を削除（自作扱いを解除＝手動が真実）
 * にする。これにより次回展開でその日は保護される。変化が無ければ同一参照を返す。
 * @param {Object} staff
 * @param {string} mk
 * @param {Array<number>} days  手動で触った日番号
 * @returns {Object} 更新後 staff
 */
export function markPatternOverrides(staff, mk, days) {
  if (!staff || !days || days.length === 0) return staff;
  const ov = { ...(staff.patternOverridesByMonth?.[mk] || {}) };
  const ap = { ...(staff.patternAppliedByMonth?.[mk] || {}) };
  let changed = false;
  for (const d of days) {
    const dk = String(d);
    if (!ov[dk]) { ov[dk] = true; changed = true; }
    if (ap[dk] != null) { delete ap[dk]; changed = true; }
  }
  if (!changed) return staff;
  const nextOv = { ...(staff.patternOverridesByMonth || {}), [mk]: ov };
  const nextAp = { ...(staff.patternAppliedByMonth || {}) };
  if (Object.keys(ap).length) nextAp[mk] = ap; else delete nextAp[mk];
  return { ...staff, patternOverridesByMonth: nextOv, patternAppliedByMonth: nextAp };
}
