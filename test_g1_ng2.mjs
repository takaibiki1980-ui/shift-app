// test_g1_ng2.mjs — T1〜T15 verification for G-1/NG-2 production port to App.jsx
// Tests the exact logic added to autoGenerate Step2 (lines 1149-1183)

// ── Utility stubs (mirrors App.jsx standalone functions) ───────────────────────
const getDays = (y, m) => new Date(y, m + 1, 0).getDate();
const buildDeptWorkTypes = (customDefs = []) => {
  const WORK = new Set(["早番", "日勤", "遅番", "夜勤"]);
  (customDefs || []).filter(d => WORK.has(d.baseType)).forEach(d => WORK.add(d.key));
  return WORK;
};

// ── Minimal Step2 replica (exact copy of modified App.jsx lines 1125-1183) ────
// Step1 (lock) + Step2 (night assign) only. Step1.5 has an optional pre-seed hook.
function runStep2(dept, staffList, year, month, prevShiftsInput = {}, preSeedFn = null) {
  const days = getDays(year, month);
  const mk = `${year}-${month + 1}`;
  const deptWork = buildDeptWorkTypes(dept.customShiftDefs);
  const maxStaff = {};
  [...new Set(dept.shiftTypes)].forEach(k => {
    const cd = (dept.customShiftDefs || []).find(d => d.key === k);
    const base = cd?.baseType || k;
    const def = base === "日勤" ? 99 : 1;
    const saved = dept.maxStaff?.[k];
    maxStaff[k] = (saved != null && !(cd && base === "日勤" && saved === 1)) ? saved : def;
  });

  const ds = staffList.filter(s => s.dept === dept.id);
  const res = {};
  ds.forEach(s => { res[s.id] = {}; });

  // Step 1: lock 希望休/有休
  ds.forEach(s => {
    Object.entries(prevShiftsInput[s.id] || {}).forEach(([d, v]) => {
      if (v === "有休") res[s.id][Number(d)] = v;
    });
    (s.kiboByMonth?.[mk] || []).forEach(d => { res[s.id][Number(d)] = "希望休"; });
  });
  const lockedDays = {};
  ds.forEach(s => { lockedDays[s.id] = new Set(Object.keys(res[s.id]).map(Number)); });

  // Optional pre-seed (simulate Step1.5 anchor or manual pre-assignment)
  if (preSeedFn) preSeedFn(res, lockedDays, ds, days);

  const _nonNightTypes = dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け');
  const _nightAllowed = (s) => {
    const rst = dept.roleShiftTypes?.[s.role];
    if (!rst) return true;
    return rst.length >= _nonNightTypes.length;
  };

  // ── Step2 EXACT COPY from App.jsx lines 1125-1183 ──────────────────────────
  if (dept.shiftTypes.includes("夜勤")) {
    const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));
    for (let d = 1; d <= days; d++) {
      const already = ds.filter(s => res[s.id][d] === "夜勤").length;
      let need = (dept.minStaff["夜勤"] || 0) - already;
      if (need <= 0) continue;
      const canNight = (s) => {
        if (lockedDays[s.id].has(d)) return false;
        if (["夜勤","明け"].includes(res[s.id][d - 1])) return false;
        if (d + 1 <= days && lockedDays[s.id].has(d + 1) && res[s.id][d+1] !== "明け") return false;
        if (d + 2 <= days && lockedDays[s.id].has(d + 2) && deptWork.has(res[s.id][d + 2])) return false;
        return true;
      };
      let cands = nightPool.filter(s => {
        if (!canNight(s)) return false;
        const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
        return usedNight < Math.max(s.nightMax || 5, autoMax);
      }).sort((a, b) => Object.values(res[a.id]).filter(v => v === "夜勤").length - Object.values(res[b.id]).filter(v => v === "夜勤").length);
      if (cands.length === 0) {
        cands = nightPool.filter(s => canNight(s))
          .sort((a, b) => Object.values(res[a.id]).filter(v => v === "夜勤").length - Object.values(res[b.id]).filter(v => v === "夜勤").length);
      }
      // G-1/NG-2: スロット単位動的判定（配置ごとに夜勤状況を再評価）
      const _isLowNR = (s) => {
        const fy = s.facilityYears, fl = s.floorYears;
        return fy != null && fl != null && (fy < 0.5 || fl < 0.2);
      };
      let _cands = [...cands];
      while (need > 0 && _cands.length > 0) {
        // NG-2: その日に low-NR が既に夜勤中なら low-NR 候補を除外（low+low 禁止）
        if (ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤')) {
          _cands = _cands.filter(s => !_isLowNR(s));
          if (_cands.length === 0) break;
        }
        // G-1: 外国人夜勤者がいてサポーター未配置なら非外国人を優先ソート
        const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        if (_foreignOnNight && !_supporterOnNight) {
          _cands.sort((a, b) => {
            const aF = a.foreignNightSupportRequired ? 1 : 0;
            const bF = b.foreignNightSupportRequired ? 1 : 0;
            if (aF !== bF) return aF - bF;
            return Object.values(res[a.id]).filter(v => v === '夜勤').length
                 - Object.values(res[b.id]).filter(v => v === '夜勤').length;
          });
        }
        const s = _cands.shift();
        res[s.id][d] = "夜勤";
        if (d + 1 <= days) res[s.id][d + 1] = "明け";
        if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
        need--;
      }
    }
  }
  return { res, ds, days };
}

// ── Assertion helpers ─────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function nightsFor(res, id) {
  return Object.values(res[id] || {}).filter(v => v === '夜勤').length;
}
function nightStaffOnDay(res, ds, d) {
  return ds.filter(s => res[s.id][d] === '夜勤');
}
function hasLowLowPair(res, ds, days) {
  const isLow = s => s.facilityYears != null && s.floorYears != null && (s.facilityYears < 0.5 || s.floorYears < 0.2);
  for (let d = 1; d <= days; d++) {
    const onNight = ds.filter(s => res[s.id][d] === '夜勤');
    if (onNight.filter(isLow).length >= 2) return true;
  }
  return false;
}
function hasForeignWithoutSupporter(res, ds, days) {
  for (let d = 1; d <= days; d++) {
    const onNight = ds.filter(s => res[s.id][d] === '夜勤');
    if (onNight.length >= 2
      && onNight.some(s => s.foreignNightSupportRequired)
      && !onNight.some(s => !s.foreignNightSupportRequired)) return true;
  }
  return false;
}
function shortageCount(res, ds, dept, days) {
  let cnt = 0;
  const minN = dept.minStaff['夜勤'] || 0;
  for (let d = 1; d <= days; d++) {
    const actual = ds.filter(s => res[s.id][d] === '夜勤').length;
    if (actual < minN) cnt++;
  }
  return cnt;
}

// ── Base fixtures ──────────────────────────────────────────────────────────────
const baseDept = (overrides = {}) => ({
  id: 'dept1',
  shiftTypes: ['夜勤', '明け', '早番', '日勤', '遅番'],
  minStaff: { '夜勤': 1 },
  maxStaff: { '夜勤': 2, '早番': 1, '遅番': 1 },
  maxConsecutive: 5,
  customShiftDefs: [],
  ...overrides,
});
const Y = 2025, M = 0; // January 2025 = 31 days

const mkStaff = (id, overrides = {}) => ({
  id, name: id, dept: 'dept1', role: '職員',
  nightOk: true, nightMax: 5,
  facilityYears: 3, floorYears: 2,
  foreignNightSupportRequired: false,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// T1: 外国人スタッフ不在部署 → G-1 非発動、既存動作と差なし
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T1: 外国人スタッフ不在部署 ───');
{
  const dept = baseDept();
  const staffList = [
    mkStaff('A', { facilityYears: 3, floorYears: 2 }),
    mkStaff('B', { facilityYears: 4, floorYears: 3 }),
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  const totalNights = ds.reduce((s, x) => s + nightsFor(res, x.id), 0);
  assert('T1: 夜勤が生成される', totalNights > 0);
  assert('T1: low/low ペアなし', !hasLowLowPair(res, ds, days));
  assert('T1: 外国人サポート問題なし', !hasForeignWithoutSupporter(res, ds, days));
}

// ─────────────────────────────────────────────────────────────────────────────
// T2: 外国人(high) + サポーター(high)、minStaff=2 → 外国人入り後サポーター優先
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T2: 外国人+サポーター(high)、外国人→サポーター優先確認 ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  // staffList の並び: A=外国人(nightCount少→先頭), B=外国人(2人目), C=サポーター
  // nightCount ソートで A→B→C の初期順になるよう、全員0からスタート
  const staffList = [
    mkStaff('A', { foreignNightSupportRequired: true,  facilityYears: 2, floorYears: 1 }),
    mkStaff('B', { foreignNightSupportRequired: true,  facilityYears: 2, floorYears: 1 }),
    mkStaff('C', { foreignNightSupportRequired: false, facilityYears: 3, floorYears: 2 }),
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  assert('T2: low/low ペアなし', !hasLowLowPair(res, ds, days));
  // G-1 効果: 外国人だけが入った後はサポーターが優先されるため foreign×2 の日は生じにくい
  let foreignPairCount = 0;
  for (let d = 1; d <= days; d++) {
    const on = nightStaffOnDay(res, ds, d);
    if (on.length === 2 && on.every(s => s.foreignNightSupportRequired)) foreignPairCount++;
  }
  assert('T2: 外国人2人ペアが削減されている（0日またはサポーターあり）',
    !hasForeignWithoutSupporter(res, ds, days),
    `foreign-only pair days: ${foreignPairCount}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// T3: 外国人のみ（サポーターなし） → クラッシュなし・生成完了
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T3: 外国人のみ（サポーターなし） ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 1 } });
  const staffList = [
    mkStaff('A', { foreignNightSupportRequired: true, facilityYears: 2, floorYears: 1 }),
    mkStaff('B', { foreignNightSupportRequired: true, facilityYears: 2, floorYears: 1 }),
  ];
  let error = null;
  let result = null;
  try {
    result = runStep2(dept, staffList, Y, M);
  } catch (e) {
    error = e;
  }
  assert('T3: クラッシュなし', error === null, error?.message);
  assert('T3: 夜勤が生成される', result && result.ds.reduce((s, x) => s + nightsFor(result.res, x.id), 0) > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// T4: low-NR × 2人のみ、minStaff=2 → 2人目がNG-2で除外 → shortage
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T4: low-NR×2のみ、minStaff=2 → NG-2でshortage ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  const staffList = [
    mkStaff('A', { facilityYears: 0.3, floorYears: 0.1 }),
    mkStaff('B', { facilityYears: 0.3, floorYears: 0.1 }),
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  assert('T4: low/low ペアなし（NG-2有効）', !hasLowLowPair(res, ds, days));
  const shortage = shortageCount(res, ds, dept, days);
  assert('T4: shortage が発生する（low+low を組まない代償）', shortage > 0, `shortage days: ${shortage}`);
  // 各日の夜勤人数は最大1人（low1人+low1人にならない）
  let maxOnNight = 0;
  for (let d = 1; d <= days; d++) {
    maxOnNight = Math.max(maxOnNight, nightStaffOnDay(res, ds, d).length);
  }
  assert('T4: 1日の夜勤人数が最大1人（low+low禁止）', maxOnNight <= 1, `maxOnNight: ${maxOnNight}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// T5: low-NR + high-NR 混在、minStaff=2 → high が2人目に配置される
// 6人構成(夜勤→明け→休みの3日サイクルで6人あれば shortage なし)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T5: low-NR + high-NR 混在、minStaff=2 ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  const staffList = [
    mkStaff('A', { facilityYears: 0.3, floorYears: 0.1, nightMax: 20 }), // low
    mkStaff('B', { facilityYears: 0.3, floorYears: 0.1, nightMax: 20 }), // low
    mkStaff('C', { facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // high
    mkStaff('D', { facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // high
    mkStaff('E', { facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // high
    mkStaff('F', { facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // high
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  assert('T5: low/low ペアなし', !hasLowLowPair(res, ds, days));
  const shortage = shortageCount(res, ds, dept, days);
  assert('T5: shortage なし（high が2人目に入る）', shortage === 0, `shortage days: ${shortage}`);
  // low-NR + high-NR の同日ペアが存在すること（low が排除されていないこと）
  const isLow = s => s.facilityYears < 0.5 || s.floorYears < 0.2;
  let mixedPairExists = false;
  for (let d = 1; d <= days; d++) {
    const on = nightStaffOnDay(res, ds, d);
    if (on.some(isLow) && on.some(s => !isLow(s))) { mixedPairExists = true; break; }
  }
  assert('T5: low+high のペアが存在する（low が入れる）', mixedPairExists);
}

// ─────────────────────────────────────────────────────────────────────────────
// T6: 外国人(low) + サポーター(high) → G-1でサポーター優先、shortage なし
// 6人構成で structural shortage を排除
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T6: 外国人(low)+サポーター(high)、G-1優先・shortage なし ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  const staffList = [
    mkStaff('A', { foreignNightSupportRequired: true,  facilityYears: 0.3, floorYears: 0.1, nightMax: 20 }), // foreign+low
    mkStaff('B', { foreignNightSupportRequired: true,  facilityYears: 0.3, floorYears: 0.1, nightMax: 20 }), // foreign+low
    mkStaff('C', { foreignNightSupportRequired: false, facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // supporter+high
    mkStaff('D', { foreignNightSupportRequired: false, facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // supporter+high
    mkStaff('E', { foreignNightSupportRequired: false, facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // supporter+high
    mkStaff('F', { foreignNightSupportRequired: false, facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // supporter+high
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  assert('T6: shortage なし', shortageCount(res, ds, dept, days) === 0,
    `shortage: ${shortageCount(res, ds, dept, days)}`);
  assert('T6: low/low ペアなし', !hasLowLowPair(res, ds, days));
  assert('T6: 外国人のみペアなし（G-1有効）', !hasForeignWithoutSupporter(res, ds, days));
}

// ─────────────────────────────────────────────────────────────────────────────
// T7: 外国人(low) + サポーター(low) → NG-2優先 → shortage
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T7: 外国人(low)+サポーター(low)、NG-2優先→shortage ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  const staffList = [
    mkStaff('A', { foreignNightSupportRequired: true,  facilityYears: 0.3, floorYears: 0.1 }), // foreign+low
    mkStaff('B', { foreignNightSupportRequired: false, facilityYears: 0.3, floorYears: 0.1 }), // supporter+low
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  assert('T7: low/low ペアなし（NG-2が G-1より優先）', !hasLowLowPair(res, ds, days));
  const shortage = shortageCount(res, ds, dept, days);
  assert('T7: shortage が発生する', shortage > 0, `shortage days: ${shortage}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// T8: nightMax=2 で上限達したスタッフはフォールバック対象外
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T8: nightMax=2 上限スタッフは過配置されない ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 1 } });
  const staffList = [
    mkStaff('A', { nightMax: 2, facilityYears: 3, floorYears: 2 }),
    mkStaff('B', { nightMax: 2, facilityYears: 3, floorYears: 2 }),
    mkStaff('C', { nightMax: 8, facilityYears: 3, floorYears: 2 }),
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  const nightsA = nightsFor(res, 'A');
  const nightsB = nightsFor(res, 'B');
  assert('T8: スタッフA の夜勤 ≤ nightMax(2) またはautoMax許容範囲', nightsA <= Math.max(2, Math.ceil(days / 3)));
  assert('T8: スタッフB の夜勤 ≤ nightMax(2) またはautoMax許容範囲', nightsB <= Math.max(2, Math.ceil(days / 3)));
  assert('T8: クラッシュなし', true);
}

// ─────────────────────────────────────────────────────────────────────────────
// T9: 全スタッフの全日ロック済み → shortage・無限ループなし
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T9: 全員全日ロック済み → shortage・クラッシュなし ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 1 } });
  // 全31日を希望休でロック
  const kiboAll = Array.from({ length: 31 }, (_, i) => i + 1);
  const mk = `${Y}-${M + 1}`;
  const staffList = [
    mkStaff('A', { kiboByMonth: { [mk]: kiboAll } }),
    mkStaff('B', { kiboByMonth: { [mk]: kiboAll } }),
  ];
  let error = null, result = null;
  try {
    result = runStep2(dept, staffList, Y, M);
  } catch (e) { error = e; }
  assert('T9: クラッシュなし', error === null, error?.message);
  const totalNights = result?.ds.reduce((s, x) => s + nightsFor(result.res, x.id), 0) ?? -1;
  assert('T9: 夜勤が強制配置されない', totalNights === 0, `totalNights: ${totalNights}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// T10: minStaff=2、混在構成 → 2人目の NG-2 チェックが機能する
// 6人構成で structural shortage を排除
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T10: need=2 で2人目にも NG-2 が機能する ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  const staffList = [
    mkStaff('A', { facilityYears: 0.3, floorYears: 0.1, nightMax: 20 }), // low
    mkStaff('B', { facilityYears: 0.3, floorYears: 0.1, nightMax: 20 }), // low
    mkStaff('C', { facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // high
    mkStaff('D', { facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // high
    mkStaff('E', { facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // high
    mkStaff('F', { facilityYears: 3,   floorYears: 2,   nightMax: 20 }), // high
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  assert('T10: low/low ペアなし（2人目でもNG-2が機能）', !hasLowLowPair(res, ds, days));
  assert('T10: shortage なし（C/D/E/F が2人目に入る）', shortageCount(res, ds, dept, days) === 0,
    `shortage: ${shortageCount(res, ds, dept, days)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// T11: Step1.5 アンカー(low) → Step2 で NG-2 発動
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T11: Step1.5アンカー(low)後 Step2でNG-2発動 ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  const staffList = [
    mkStaff('A', { facilityYears: 0.3, floorYears: 0.1 }), // low (アンカー対象)
    mkStaff('B', { facilityYears: 0.3, floorYears: 0.1 }), // low
    mkStaff('C', { facilityYears: 3,   floorYears: 2   }), // high
  ];
  // preSeedFn で day=5 に A をアンカー(Step1.5相当)
  const preSeed = (res, lockedDays, ds, days) => {
    res['A'][5] = '夜勤';
    if (6 <= days) res['A'][6] = '明け';
    lockedDays['A'].add(5);
    lockedDays['A'].add(6);
  };
  const { res, ds, days } = runStep2(dept, staffList, Y, M, {}, preSeed);
  assert('T11: day5 にアンカーが入っている', res['A'][5] === '夜勤');
  assert('T11: day5 の low/low ペアなし（NG-2でBが除外→Cが入るかshortage）',
    !hasLowLowPair(res, ds, days));
}

// ─────────────────────────────────────────────────────────────────────────────
// T12: bestOfN 相当 — 複数試行で NG-2 安全な解が選択される
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T12: 複数試行で NG-2 safe な解が常に得られる ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  const staffList = [
    mkStaff('A', { facilityYears: 0.3, floorYears: 0.1 }), // low
    mkStaff('B', { facilityYears: 3,   floorYears: 2   }), // high
    mkStaff('C', { facilityYears: 3,   floorYears: 2   }), // high
  ];
  let anyLowLow = false;
  for (let i = 0; i < 30; i++) {
    const { res, ds, days } = runStep2(dept, staffList, Y, M);
    if (hasLowLowPair(res, ds, days)) { anyLowLow = true; break; }
  }
  assert('T12: 30回試行すべてで low/low ペアなし', !anyLowLow);
}

// ─────────────────────────────────────────────────────────────────────────────
// T13: G-1 が 30 回試行すべてで外国人ペアを防ぐ
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T13: 30回試行すべてで G-1 が外国人×2を防ぐ ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 2 } });
  const staffList = [
    mkStaff('A', { foreignNightSupportRequired: true,  facilityYears: 2, floorYears: 1 }),
    mkStaff('B', { foreignNightSupportRequired: true,  facilityYears: 2, floorYears: 1 }),
    mkStaff('C', { foreignNightSupportRequired: false, facilityYears: 3, floorYears: 2 }),
  ];
  let anyForeignPair = false;
  for (let i = 0; i < 30; i++) {
    const { res, ds, days } = runStep2(dept, staffList, Y, M);
    if (hasForeignWithoutSupporter(res, ds, days)) { anyForeignPair = true; break; }
  }
  assert('T13: 30回試行すべてで外国人×2日なし（G-1有効）', !anyForeignPair);
}

// ─────────────────────────────────────────────────────────────────────────────
// T14: 外国人スタッフが nightOk=false → G-1 非発動
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T14: 外国人 nightOk=false → nightPool に含まれず G-1 非発動 ───');
{
  const dept = baseDept({ minStaff: { '夜勤': 1 } });
  const staffList = [
    mkStaff('A', { foreignNightSupportRequired: true,  nightOk: false, facilityYears: 2, floorYears: 1 }),
    mkStaff('B', { foreignNightSupportRequired: false, nightOk: true,  facilityYears: 3, floorYears: 2 }),
    mkStaff('C', { foreignNightSupportRequired: false, nightOk: true,  facilityYears: 3, floorYears: 2 }),
  ];
  const { res, ds, days } = runStep2(dept, staffList, Y, M);
  const nightsA = nightsFor(res, 'A');
  assert('T14: 外国人(nightOk=false)が夜勤に配置されない', nightsA === 0, `nightsA: ${nightsA}`);
  assert('T14: クラッシュなし', true);
  assert('T14: 通常スタッフが夜勤に配置される',
    nightsFor(res, 'B') + nightsFor(res, 'C') > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// T15: 夜勤なし部署 → G-1/NG-2 ブロック全体がスキップされる
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── T15: 夜勤なし部署 → Step2 全体スキップ ───');
{
  const dept = baseDept({
    shiftTypes: ['早番', '日勤', '遅番'],
    minStaff: {},
    maxStaff: { '早番': 1, '遅番': 1 },
  });
  const staffList = [
    mkStaff('A', { facilityYears: 0.3, floorYears: 0.1 }), // low
    mkStaff('B', { facilityYears: 0.3, floorYears: 0.1 }), // low
  ];
  let error = null, result = null;
  try {
    result = runStep2(dept, staffList, Y, M);
  } catch (e) { error = e; }
  assert('T15: クラッシュなし', error === null, error?.message);
  const totalNights = result?.ds.reduce((s, x) => s + nightsFor(result.res, x.id), 0) ?? -1;
  assert('T15: 夜勤が生成されない', totalNights === 0, `totalNights: ${totalNights}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`結果: ${passed} PASS / ${failed} FAIL / ${passed + failed} TOTAL`);
if (failed === 0) {
  console.log('✅ T1〜T15 全件 PASS');
} else {
  console.log(`❌ ${failed} 件 FAIL`);
  process.exit(1);
}
