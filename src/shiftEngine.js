// Pure shift engine functions - no React/Supabase dependencies

// ── [診断] 学習影響度カウンタ ─────────────────────────────────────────────
let _diag = null;
export function enableDiag()  { _diag = {
  passA:   { usedTrend: 0, noTrend: 0, highWeightDayPicked: 0, highWeightDayMissed: 0 },
  step25:  {
    resolvedByCount: 0, resolvedByTrend: 0, resolvedByRandom: 0, singleCand: 0, total: 0,
    randWdiffEq0: 0, randWdiff0to005: 0, randWdiffSum: 0,
  },
  passBWeight: { usedDowShiftRate: 0, usedFreqTrend: 0, usedRatio: 0, usedDeptAvg: 0, usedUniform: 0 },
  passBDecision: { trendTopPicked: 0, trendTopOverridden: 0, deficitOverride: 0, capacityZero: 0 },
  passBPath: { pathA: 0, pathB: 0 },
  topTrend: {
    passA:  { proposals: 0, adopted: 0, rejectedNotValid: 0, rejectedBySampling: 0, noTrend: 0 },
    step25: {
      proposals: 0, adopted: 0,
      rejectedLocked: 0,              // lockedDays 該当（希望休/夜勤アンカー/明け翌日ロック）
      rejectedAlreadyAssigned: 0,     // res[d] 既入力・合計
      rejectedAssigned_nightShift: 0, // res[d]==='夜勤'（Step2配置済み）
      rejectedAssigned_meake: 0,      // res[d]==='明け'（夜勤翌日）
      rejectedAssigned_rest: 0,       // res[d]==='休み'（夜勤翌々日 or prevShifts休み）
      rejectedAssigned_kiboKyu: 0,    // res[d]==='希望休'/'有休'（locked漏れ）
      rejectedAssigned_other: 0,      // 上記以外の既割当シフト
      rejectedBadTransition: 0,       // 遷移制約（明け前後 or isBadTransition）
      rejectedByFairness: 0, rejectedByRandom: 0, tieNoSignal: 0,
    },
    passB:  { proposals: 0, adopted: 0, rejectedByCapacity: 0, rejectedByDeficit: 0, rejectedBySampling: 0, noTrend: 0 },
    passC:  { changed: 0, changedFromAdopted: 0 },
    tierIV: { changed: 0, changedFromAdopted: 0 },
    tier4: {
      restAdjust:    { changed: 0, changedFromAdopted: 0 },
      enforceMax:    { changed: 0, changedFromAdopted: 0 },
      transitionFix: { changed: 0, changedFromAdopted: 0 },
      minStaff:      { changed: 0, changedFromAdopted: 0 },
      events: [],
    },
  },
}; }
export function disableDiag() { _diag = null; }
export function getDiag()     { return _diag ? JSON.parse(JSON.stringify(_diag)) : null; }
// ──────────────────────────────────────────────────────────────────────────

export const REST_TYPES  = new Set(["休み","希望休","有休","明け","日/休","休/日","早/休","休/遅"]);
export const HALF_REST_TYPES = new Set(["日/休","休/日","早/休","休/遅"]);
export const WORK_TYPES  = new Set(["早番","日勤","遅番","夜勤"]);

export function buildDeptWorkTypes(customDefs) {
  const s = new Set(WORK_TYPES);
  (customDefs || []).filter(d => WORK_TYPES.has(d.baseType)).forEach(d => s.add(d.key));
  return s;
}
export function buildDeptRestTypes(customDefs) {
  const s = new Set(REST_TYPES);
  (customDefs || []).filter(d => REST_TYPES.has(d.baseType)).forEach(d => s.add(d.key));
  return s;
}
// ── 必須運営時間モード（カスタム時間部署）向けヘルパー ────────────────────
export function isCustomTimeDept(dept) { return !!(dept?.requiredStart && dept?.requiredEnd); }
export function timeToMins(t) { if (!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; }
export function minsToTimeStr(m) { const h=Math.floor(m/60)%24,mn=m%60; return `${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}`; }
export function buildDayIntervals(shiftKeys, dept) {
  const iv=[];
  for (const sk of (shiftKeys||[])) {
    if(!sk)continue;
    const ss=getShiftStartTime(sk,dept),es=getShiftEndTime(sk,dept);
    if(!ss||!es)continue;
    const s0=timeToMins(ss),e0=timeToMins(es);
    iv.push({start:s0,end:e0<=s0?e0+1440:e0});
  }
  return iv;
}
export function coverageGaps(intervals,reqStart,reqEnd,minStaff=1,step=15) {
  const gaps=[];let gs=null;
  for(let m=reqStart;m<=reqEnd;m+=step){
    const cnt=intervals.filter(iv=>m>=iv.start&&m<iv.end).length;
    if(cnt<minStaff){if(gs==null)gs=m;}
    else if(gs!=null){gaps.push({start:gs,end:m});gs=null;}
  }
  if(gs!=null)gaps.push({start:gs,end:reqEnd});
  return gaps;
}
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_SHIFT_TIMES = {
  "早番": { start: "07:00", end: "16:00" },
  "日勤": { start: "09:00", end: "18:00" },
  "遅番": { start: "11:30", end: "20:30" },
  "夜勤": { start: "16:30", end: "09:30" },
};
export function getShiftEndTime(key, dept) {
  const st = dept?.shiftTimes?.[key];
  if (st?.end) return st.end;
  const cd = (dept?.customShiftDefs||[]).find(d=>d.key===key);
  if (cd?.endTime) return cd.endTime;
  return DEFAULT_SHIFT_TIMES[key]?.end || null;
}
export function getShiftStartTime(key, dept) {
  const st = dept?.shiftTimes?.[key];
  if (st?.start) return st.start;
  const cd = (dept?.customShiftDefs||[]).find(d=>d.key===key);
  if (cd?.startTime) return cd.startTime;
  return DEFAULT_SHIFT_TIMES[key]?.start || null;
}
export function shiftIntervalHours(prevKey, nextKey, dept) {
  const endStr = getShiftEndTime(prevKey, dept);
  const startStr = getShiftStartTime(nextKey, dept);
  if (!endStr || !startStr) return 24;
  const [eh, em] = endStr.split(":").map(Number);
  const [sh, sm] = startStr.split(":").map(Number);
  return (sh * 60 + sm + 1440 - (eh * 60 + em)) / 60;
}

export const getDays  = (y,m) => new Date(y,m+1,0).getDate();
export const monthKey = (y,m) => `${y}-${m+1}`;

// 名前正規化：スペース(半角・全角)・中点(・･)・ピリオドを除去して小文字化
// 「田中 花子」「田中　花子」「田中花子」「ジョン・スミス」「ジョン スミス」を統一比較
export const normName = (s) => String(s||'').replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[\s　・･．.\-ー－]/g,'').toLowerCase();
export const nameMatch = (a, b) => { const na=normName(a), nb=normName(b); return na===nb||na.includes(nb)||nb.includes(na); };

export function autoGenerate(staffList, dept, year, month, prevShifts, shiftTrend = {}, options = {}, prevTail = {}) {
  // 配列 items から n件を確率 weights で非復元サンプリング
  const weightedSampleN = (items, weights, n) => {
    const pool = items.map((item, i) => ({ item, w: weights[i] ?? 1 }));
    const result = [];
    while (result.length < n && pool.length) {
      const total = pool.reduce((s, x) => s + x.w, 0);
      if (total <= 0) { result.push(...pool.slice(0, n - result.length).map(x => x.item)); break; }
      let r = Math.random() * total;
      const idx = pool.findIndex(x => { r -= x.w; return r <= 0; });
      const picked = idx >= 0 ? idx : pool.length - 1;
      result.push(pool[picked].item);
      pool.splice(picked, 1);
    }
    return result;
  };

  // learning proposal tracking (only allocated when topTrend diagnostics enabled)
  const _trendTopMap = _diag?.topTrend ? new Map() : null;  // key: `${sid}:${d}`, value: proposedShift
  let _snapPostPassB = null;   // snapshot of res after PassB
  let _snapPostPassC = null;   // snapshot of res after PassC

  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
  // 前月末日数と「前月最終日のシフト」参照ヘルパー（res への負数キー格納なし）
  const prevMonthYear = month === 0 ? year - 1 : year;
  const prevMonthIdx  = month === 0 ? 11 : month - 1;
  const prevDays = getDays(prevMonthYear, prevMonthIdx);
  const prevShift = (id) => prevTail[id]?.[prevDays] ?? null;
  const deptWork = buildDeptWorkTypes(dept.customShiftDefs);
  const deptRest = buildDeptRestTypes(dept.customShiftDefs);
  const maxStaff = {};
  [...new Set(dept.shiftTypes)].forEach(k => { const cd=(dept.customShiftDefs||[]).find(d=>d.key===k);const base=cd?.baseType||k;const def=base==="日勤"?99:1;const saved=dept.maxStaff?.[k];maxStaff[k]=(saved!=null&&!(cd&&base==="日勤"&&saved===1))?saved:def; });
  const PRIORITY = { 早番:1, 遅番:1, 日勤:2 };
  (dept.customShiftDefs||[]).forEach(cd => { if (cd.key && PRIORITY[cd.key]==null) PRIORITY[cd.key] = PRIORITY[cd.baseType]??2; });

  const getTrend = (s) => {
    if (!shiftTrend || Object.keys(shiftTrend).length === 0) return null;
    const key = Object.keys(shiftTrend).filter(k => k !== '_months').find(k => nameMatch(k, s.name));
    return key ? shiftTrend[key] : null;
  };

  const getRelocationRisk = (s) => {
    const fy = s.facilityYears, fl = s.floorYears;
    if (fy == null || fl == null) return 'low';
    return (fy >= 2 && fl < 0.5) ? 'high' : (fy >= 1 && fl < 0.3) ? 'medium' : 'low';
  };

  const pickWithTrend = (s, available, cnts) => {
    const trend = getTrend(s);
    return [...available].sort((a, b) => {
      // 1. 設定優先: 最低配置の不足分を先に埋める
      const dA = Math.max(0, (dept.minStaff[a]||0) - cnts[a]);
      const dB = Math.max(0, (dept.minStaff[b]||0) - cnts[b]);
      if (dA !== dB) return dB - dA;
      // 2. シフト種別の優先度
      const pA = PRIORITY[a]??3, pB = PRIORITY[b]??3;
      if (pA !== pB) return pA - pB;
      // 3. 配置バランス（少ない方を優先）
      if (cnts[a] !== cnts[b]) return cnts[a] - cnts[b];
      // 4. 学習データ（最後の補助）
      const tA = trend ? (trend[a] || 0) : 0;
      const tB = trend ? (trend[b] || 0) : 0;
      if (Math.abs(tA - tB) > 0.05) return tB - tA;
      // 5. 同点時はランダムで毎回異なる結果に
      return Math.random() - 0.5;
    })[0];
  };

  const res = {};
  const ds = staffList.filter(s => s.dept === dept.id);
  ds.forEach(s => { res[s.id] = {}; });

  const consecWork = (id, d) => {
    let c = 0;
    for (let i = d; i >= 1; i--) {
      if (deptWork.has(res[id][i])) c++;
      else return c;          // 勤務外で途切れた → 前月参照不要
    }
    // d=0 またはd=1..day0 が全て勤務日だった場合のみ前月末へ遡る
    if (prevTail[id]) {
      for (let i = prevDays; i >= Math.max(1, prevDays - 4); i--) {
        if (deptWork.has(prevTail[id][i])) c++;
        else break;
      }
    }
    return c;
  };
  const consecRest = (id, d) => { let c = 0; for (let i = d; i >= 1; i--) { if (deptRest.has(res[id][i]) && res[id][i] !== "明け") c++; else break; } return c; };
  const consecRestFwd = (id, d) => { let c = 0; for (let i = d + 1; i <= days; i++) { if (deptRest.has(res[id][i]) && res[id][i] !== "明け") c++; else break; } return c; };
  const intervalThreshold = dept.intervalThreshold ?? null;
  const isBadTransition = (prev, curr) => {
    if (!prev || !curr) return false;
    // ★インターバル特例部署（栄養科等）: 時間インターバルのみで判定、文字ルールは不使用
    if (intervalThreshold != null) return shiftIntervalHours(prev, curr, dept) < intervalThreshold;
    // ★通常部署（介護職等）: 現場防衛のため3パターンを完全禁止
    //   遅番→早番（11時間）、遅番→日勤（12.5時間）、日勤→早番（13.5時間）
    return (prev === "遅番" && (curr === "早番" || curr === "日勤")) || (prev === "日勤" && curr === "早番");
  };
  const canRest = (id, d) => {
    if (res[id][d - 1] === "明け") return false;
    return (consecRest(id, d - 1) + 1 + consecRestFwd(id, d)) <= 2;
  };

  // ★ステップ1: 希望休・希望勤務を最初にセット（最優先・絶対変更しない）
  ds.forEach(s => {
    // prevShiftsから有休のみ引き継ぎ（希望休はprevShiftsから引き継がない＝手動入力の希望休は再生成で消える）
    Object.entries(prevShifts[s.id] || {}).forEach(([d, v]) => {
      if (v === "有休") res[s.id][Number(d)] = v;
    });
    // kiboByMonthの希望休 → 希望休として設定（スタッフがポータルで申請したもの）
    (s.kiboByMonth?.[mk] || []).forEach(d => {
      res[s.id][Number(d)] = "希望休";
    });
    // yukyuByMonthの有休（希望休より優先度は同等・後勝ち）
    (s.yukyuByMonth?.[mk] || []).forEach(d => {
      res[s.id][Number(d)] = "有休";
    });
    // shiftRequestsByMonthの希望勤務（早番・日勤・遅番・夜勤指定）
    Object.entries(s.shiftRequestsByMonth?.[mk] || {}).forEach(([day, shiftKey]) => {
      res[s.id][Number(day)] = shiftKey;
    });
  });

  // 希望休・希望勤務が入っている日をロック（夜勤配置で絶対に上書きしない）
  const lockedDays = {};
  ds.forEach(s => { lockedDays[s.id] = new Set(Object.keys(res[s.id]).map(Number)); });

  // 前月末夜勤/明けの当月繰り越し（正キーへの書き込み・res への負数格納なし）
  ds.forEach(s => {
    const ps = prevShift(s.id);
    if (ps === '夜勤') {
      // 前月末が夜勤 → 当月1日=明け、2日=休み を確定
      if (!lockedDays[s.id].has(1)) { res[s.id][1] = '明け'; lockedDays[s.id].add(1); }
      if (days >= 2 && !lockedDays[s.id].has(2)) { res[s.id][2] = '休み'; lockedDays[s.id].add(2); }
    } else if (ps === '明け') {
      // 前月末が明け（前月29日が夜勤）→ 当月1日=休み を確定
      if (!lockedDays[s.id].has(1)) { res[s.id][1] = '休み'; lockedDays[s.id].add(1); }
    }
  });

  // 勤務指定の夜勤・明けに連鎖して翌日を自動セット
  ds.forEach(s => {
    for (let d = 1; d <= days; d++) {
      if (res[s.id][d] === "夜勤") {
        if (d + 1 <= days && !lockedDays[s.id].has(d + 1)) {
          res[s.id][d + 1] = "明け";
          lockedDays[s.id].add(d + 1);
        }
        if (d + 2 <= days && !lockedDays[s.id].has(d + 2)) {
          res[s.id][d + 2] = "休み";
          lockedDays[s.id].add(d + 2);
        }
      } else if (res[s.id][d] === "明け") {
        if (d + 1 <= days && !lockedDays[s.id].has(d + 1)) {
          res[s.id][d + 1] = "休み";
          lockedDays[s.id].add(d + 1);
        }
      }
    }
  });

  // ★ステップ1.5: 希望休アンカー配置
  const _nonNightTypes = dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け');
  const _nightAllowed = (s) => {
    const rst = dept.roleShiftTypes?.[s.role];
    if (!rst) return true;
    return rst.length >= _nonNightTypes.length;
  };

  if (dept.shiftTypes.includes("夜勤")) {
    const anchorPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const anchorAutoMax = Math.ceil(days / Math.max(anchorPool.length, 1));
    const sortedAnchorPool = [...anchorPool].sort((a, b) => (b.kiboNightPreference || 0) - (a.kiboNightPreference || 0));
    for (const s of sortedAnchorPool) {
      const kibodays = (s.kiboByMonth?.[mk] || []).map(Number).sort((a, b) => a - b);
      for (const D of kibodays) {
        const nightDay = D - 2, meakeDay = D - 1;
        if (nightDay < 1) continue;
        if (lockedDays[s.id].has(nightDay) || lockedDays[s.id].has(meakeDay)) continue;
        if (["夜勤", "明け"].includes(nightDay === 1 ? prevShift(s.id) : res[s.id][nightDay - 1])) continue;
        const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
        if (usedNight >= Math.max(s.nightMax || 5, anchorAutoMax)) continue;
        res[s.id][nightDay] = "夜勤";
        res[s.id][meakeDay] = "明け";
        lockedDays[s.id].add(nightDay);
        lockedDays[s.id].add(meakeDay);
      }
    }
  }

  // ★ステップ2: 夜勤配置
  if (dept.shiftTypes.includes("夜勤")) {
    const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));
    for (let d = 1; d <= days; d++) {
      const already = ds.filter(s => res[s.id][d] === "夜勤").length;
      let need = (dept.minStaff["夜勤"] || 0) - already;
      if (need <= 0) continue;
      const canNight = (s) => {
        if (lockedDays[s.id].has(d)) return false;
        // d=1 のとき前月末シフトを参照（res[s.id][0] は存在しない）
        if (["夜勤","明け"].includes(d === 1 ? prevShift(s.id) : res[s.id][d - 1])) return false;
        if (d + 1 <= days && lockedDays[s.id].has(d + 1) && res[s.id][d+1] !== "明け") return false;
        if (d + 2 <= days && lockedDays[s.id].has(d + 2) && deptWork.has(res[s.id][d + 2])) return false;
        return true;
      };
      // G-2: rr=high に仮想夜勤数を加算（完全排除せず"後回し"に留める）
      const _rrVN = {low: 0, medium: 2, high: 4};
      const _nightSort = (a, b) => {
        const nA = Object.values(res[a.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(a)];
        const nB = Object.values(res[b.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(b)];
        return nA - nB;
      };
      let cands = nightPool.filter(s => {
        if (!canNight(s)) return false;
        const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
        return usedNight < Math.max(s.nightMax || 5, autoMax);
      }).sort(_nightSort);
      if (cands.length === 0) {
        cands = nightPool.filter(s => canNight(s)).sort(_nightSort);
      }
      // G-1: スロット単位動的ソート（外国人が割り当て済みならサポーターを優先）
      const _isLowNR = (s) => { const fy=s.facilityYears,fl=s.floorYears; return fy!=null&&fl!=null&&(fy<0.5||fl<0.2); };
      let _cands = [...cands];
      while (need > 0 && _cands.length > 0) {
        const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        // NG-2: nightReadiness=low 同士の夜勤ペア禁止（low が既にいれば low を候補から除外）
        if (ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤')) {
          _cands = _cands.filter(s => !_isLowNR(s));
          if (_cands.length === 0) break; // shortage を許容
        }
        if (_foreignOnNight && !_supporterOnNight) {
          _cands.sort((a, b) => {
            // G-1: foreignnessを第1キー（非外国人=サポーターを必ず先に）
            const aF = a.foreignNightSupportRequired ? 1 : 0;
            const bF = b.foreignNightSupportRequired ? 1 : 0;
            if (aF !== bF) return aF - bF;
            // 第2キー: G-2仮想夜勤数
            const nA = Object.values(res[a.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(a)];
            const nB = Object.values(res[b.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(b)];
            return nA - nB;
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

  const dayTypes = [...new Set(dept.shiftTypes.filter(s => s !== "夜勤"))];
  const isCtd = isCustomTimeDept(dept);
  const getAllowedTypes = (s) => {
    const allowed = dept.roleShiftTypes?.[s.role];
    return allowed ? dayTypes.filter(k => allowed.includes(k)) : dayTypes;
  };

  // ★ステップ2.5: 早番・遅番 slot-first 配置（maxStaff<99 の「役割席」シフト）
  // 夜勤と同じ slot-first アーキテクチャ：「席へ人を配置する」介護型の核心。
  // maxStaff≥99（日勤等）は後続 Pass B の buffer として従来通り扱う。
  // これにより「早番2人・遅番2人」を構造的・事前的に防止する。
  {
    const slotFirstTypes = [...new Set(dept.shiftTypes)].filter(k =>
      k !== '夜勤' && k !== '明け' && (maxStaff[k] ?? 99) < 99
    );
    for (const shiftType of slotFirstTypes) {
      const limit      = maxStaff[shiftType];
      const minFill    = dept.minStaff?.[shiftType] || 0;
      const fillTarget = Math.min(limit, minFill); // min=max=1 → 1枠/日
      if (fillTarget <= 0) continue;
      const slotPool = ds.filter(s => getAllowedTypes(s).includes(shiftType));
      for (let d = 1; d <= days; d++) {
        const already = ds.filter(s => res[s.id][d] === shiftType).length;
        const need = fillTarget - already;
        if (need <= 0) continue;
        const eligible = slotPool.filter(s => {
          if (lockedDays[s.id].has(d)) return false;
          if (res[s.id][d]) return false;
          // d=1 のとき前月末シフトを参照（res[s.id][0] は存在しない）
          const prev = d === 1 ? prevShift(s.id) : res[s.id][d - 1];
          const next = res[s.id][d + 1];
          if (prev === '明け') return false;
          if (isBadTransition(prev, shiftType)) return false;
          if (isBadTransition(shiftType, next)) return false;
          return true;
        });

        // Track top trend candidate before sort
        if (_diag?.topTrend) {
          const weekday = new Date(year, month, d).getDay();
          // Find globally top-weight person from slotPool (not just eligible)
          let topPerson = null, topW = -1;
          slotPool.forEach(s => {
            const tr = getTrend(s);
            const w = tr?.dowShiftRate?.[weekday]?.[shiftType] ?? tr?.[shiftType] ?? 0;
            if (w > topW) { topW = w; topPerson = s; }
          });
          // Check if all weights are equal (no signal)
          const allEqual = slotPool.every(s => {
            const tr = getTrend(s);
            const w = tr?.dowShiftRate?.[weekday]?.[shiftType] ?? tr?.[shiftType] ?? 0;
            return Math.abs(w - topW) < 0.001;
          });
          if (topPerson && !allEqual && topW > 0) {
            _diag.topTrend.step25.proposals++;
            const inEligible = eligible.some(s => s.id === topPerson.id);
            if (!inEligible) {
              // 棄却理由を分解: eligible フィルタの実際の分岐条件と同じ順序で判定
              if (lockedDays[topPerson.id].has(d)) {
                // ① lockedDays: 希望休/有休/夜勤アンカー/夜勤明け翌日ロック
                _diag.topTrend.step25.rejectedLocked++;
              } else if (res[topPerson.id][d]) {
                // ② res[d] に値がある: Step2 配置の 夜勤/明け/翌日休み 等
                _diag.topTrend.step25.rejectedAlreadyAssigned++;
                const v = res[topPerson.id][d];
                if      (v === '夜勤')                        _diag.topTrend.step25.rejectedAssigned_nightShift++;
                else if (v === '明け')                        _diag.topTrend.step25.rejectedAssigned_meake++;
                else if (v === '休み')                        _diag.topTrend.step25.rejectedAssigned_rest++;
                else if (v === '希望休' || v === '有休')      _diag.topTrend.step25.rejectedAssigned_kiboKyu++;
                else                                          _diag.topTrend.step25.rejectedAssigned_other++;
              } else {
                // ③ 遷移違反 (prev==='明け' or isBadTransition)
                _diag.topTrend.step25.rejectedBadTransition++;
              }
            } else {
              // Will check adoption after pick is determined — store for later
              // Use a temporary variable in the scope
              _diag.topTrend.step25._pendingTopPerson = topPerson;
              _diag.topTrend.step25._pendingShiftType = shiftType;
              _diag.topTrend.step25._pendingDay = d;
            }
          } else if (allEqual) {
            _diag.topTrend.step25.tieNoSignal++;
          }
        }

        let picked;
        if (options.step25Mode === 'weighted') {
          // 重み付きサンプリングモード:
          // 公平重み(1/(count+1)) × trend重み を合成してサンプリング
          const weekday = new Date(year, month, d).getDay();
          const wts = eligible.map(s => {
            const cnt = Object.values(res[s.id]).filter(v => v === shiftType).length;
            const tr = getTrend(s);
            const tw = Math.max(0.01, tr?.dowShiftRate?.[weekday]?.[shiftType] ?? tr?.[shiftType] ?? 0.5);
            return (1 / (cnt + 1)) * tw;
          });
          picked = weightedSampleN(eligible, wts, need);
        } else {
          // デフォルト: ソートベース（公平カウント→trend閾値→ランダム）
          const cands = [...eligible].sort((a, b) => {
            const ua = Object.values(res[a.id]).filter(v => v === shiftType).length;
            const ub = Object.values(res[b.id]).filter(v => v === shiftType).length;
            if (ua !== ub) return ua - ub;
            const weekday = new Date(year, month, d).getDay();
            const tA = getTrend(a), tB = getTrend(b);
            const wA = tA?.dowShiftRate?.[weekday]?.[shiftType] ?? tA?.[shiftType] ?? 0.5;
            const wB = tB?.dowShiftRate?.[weekday]?.[shiftType] ?? tB?.[shiftType] ?? 0.5;
            if (Math.abs(wA - wB) > 0.05) return wB - wA;
            return Math.random() - 0.5;
          });
          if (_diag && cands.length > 0) {
            _diag.step25.total++;
            if (cands.length === 1) {
              _diag.step25.singleCand++;
            } else {
              const a = cands[0], b = cands[1];
              const ua = Object.values(res[a.id]).filter(v => v === shiftType).length;
              const ub = Object.values(res[b.id]).filter(v => v === shiftType).length;
              if (ua !== ub) {
                _diag.step25.resolvedByCount++;
              } else {
                const weekday = new Date(year, month, d).getDay();
                const tA = getTrend(a), tB = getTrend(b);
                const wA = tA?.dowShiftRate?.[weekday]?.[shiftType] ?? tA?.[shiftType] ?? 0.5;
                const wB = tB?.dowShiftRate?.[weekday]?.[shiftType] ?? tB?.[shiftType] ?? 0.5;
                if (Math.abs(wA - wB) > 0.05) {
                  _diag.step25.resolvedByTrend++;
                } else {
                  _diag.step25.resolvedByRandom++;
                  const diff = Math.abs(wA - wB);
                  _diag.step25.randWdiffSum += diff;
                  if (diff === 0) _diag.step25.randWdiffEq0++;
                  else            _diag.step25.randWdiff0to005++;
                }
              }
            }
          }
          picked = cands.slice(0, need);
        }

        if (_diag?.topTrend && _diag.topTrend.step25._pendingTopPerson) {
          const { _pendingTopPerson: topPerson, _pendingShiftType: st, _pendingDay: pd } = _diag.topTrend.step25;
          if (pd === d && st === shiftType) {
            const wasAdopted = picked.some(s => s.id === topPerson.id);
            if (wasAdopted) {
              _diag.topTrend.step25.adopted++;
              _trendTopMap?.set(`${topPerson.id}:${d}`, shiftType);
            } else {
              // Was in eligible, but not picked — determine why
              const weekday = new Date(year, month, d).getDay();
              const topCount = Object.values(res[topPerson.id]).filter(v => v === shiftType).length;
              const pickedMinCount = picked.length > 0
                ? Math.min(...picked.map(s => Object.values(res[s.id]).filter(v => v === shiftType).length))
                : Infinity;
              if (topCount > pickedMinCount) {
                _diag.topTrend.step25.rejectedByFairness++;
              } else {
                _diag.topTrend.step25.rejectedByRandom++;
              }
            }
          }
          delete _diag.topTrend.step25._pendingTopPerson;
          delete _diag.topTrend.step25._pendingShiftType;
          delete _diag.topTrend.step25._pendingDay;
        }

        for (const s of picked) res[s.id][d] = shiftType;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 確率優先配置フェーズ（slot-first後の残スタッフへ 日勤/休み を配分）
  //  Pass A: 休み日 → dowRestRate で確率的サンプリング（30試行に多様性）
  //  Pass B: 勤務日 → 早番/遅番配置済スタッフを除く（主に日勤 buffer 配置）
  //  Pass C: 連続勤務超過の修正
  //  以降の enforceMaxStaff / minStaff保証 で残違反を修正
  // ═══════════════════════════════════════════════════════════════════════════

  // 確率テーブル probs:{key->weight} から1件サンプリング（多様性確保）
  const sampleFromProbs = (probs) => {
    const entries = Object.entries(probs).filter(([, w]) => w > 0);
    if (!entries.length) return null;
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
    return entries[entries.length - 1][0];
  };

  // 部署全体の平均シフト比率（trendなしスタッフの fallback）
  const deptAvgRatio = (() => {
    const all = ds.map(s => getTrend(s)).filter(Boolean);
    if (!all.length) return null;
    const avg = {};
    dayTypes.forEach(k => {
      const vals = all.map(t => typeof t[k] === 'number' ? t[k] : 0);
      avg[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    return avg;
  })();

  const getShiftRatioOf = (s) => s.shiftRatio || s.shiftRatioByMonth?.[mk] || null;
  const targetShiftCounts = {};
  const assignedShiftCounts = {};

  if (dayTypes.length === 0) {
    ds.forEach(s => { for (let d = 1; d <= days; d++) { if (!res[s.id][d]) res[s.id][d] = "休み"; } });
  } else {

    // ── Pass A: 休み日を確率サンプリングで全スタッフに先行確定 ──────────────
    ds.forEach(s => {
      const trend = getTrend(s);
      const freeDays = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
      const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const lockedRest = Object.values(res[s.id]).filter(v => deptRest.has(v) && v !== '明け').length;
      const restTarget = Math.max(0, totalTarget - lockedRest);

      const validDays = freeDays.filter(d => res[s.id][d - 1] !== '明け');
      if (trend?.dowRestRate) {
        if (_diag) _diag.passA.usedTrend++;
        const weights = validDays.map(d => {
          const dow6 = (new Date(year, month, d).getDay() + 6) % 7;
          return Math.max(0.01, trend.dowRestRate[dow6] ?? 0.01);
        });
        const picked = weightedSampleN(validDays, weights, restTarget);
        if (_diag && validDays.length > 0) {
          // "高確率日" = 全バリデート日の重み上位1/3
          const sorted = [...weights].sort((a,b) => b-a);
          const threshold = sorted[Math.floor(sorted.length / 3)] ?? 0;
          const pickedSet = new Set(picked);
          validDays.forEach((d, i) => {
            if (weights[i] >= threshold) {
              if (pickedSet.has(d)) _diag.passA.highWeightDayPicked++;
              else                  _diag.passA.highWeightDayMissed++;
            }
          });
        }
        picked.forEach(d => { res[s.id][d] = '休み'; });
        if (_diag?.topTrend) {
          // Find top-weight day across ALL free days (not just validDays)
          const allFreeDays = freeDays;
          let topDay = null, topW = -1;
          allFreeDays.forEach(d => {
            const dow6 = (new Date(year, month, d).getDay() + 6) % 7;
            const w = trend.dowRestRate[dow6] ?? 0;
            if (w > topW) { topW = w; topDay = d; }
          });
          if (topDay !== null) {
            _diag.topTrend.passA.proposals++;
            if (!validDays.includes(topDay)) {
              _diag.topTrend.passA.rejectedNotValid++;
            } else if (res[s.id][topDay] === '休み') {
              _diag.topTrend.passA.adopted++;
              _trendTopMap?.set(`${s.id}:${topDay}`, '休み');
            } else {
              _diag.topTrend.passA.rejectedBySampling++;
            }
          }
        }
      } else {
        if (_diag) _diag.passA.noTrend++;
        const eligible = validDays.filter(d => canRest(s.id, d));
        const shuffled = weightedSampleN(eligible, eligible.map(() => 1), restTarget);
        shuffled.forEach(d => { res[s.id][d] = '休み'; });
        if (_diag?.topTrend) _diag.topTrend.passA.noTrend++;
      }
    });

    // ── Pass B: 全スタッフの勤務シフトを確率サンプリングで配置 ──────────────
    ds.forEach(s => {
      assignedShiftCounts[s.id] = {};
      dayTypes.forEach(k => { assignedShiftCounts[s.id][k] = 0; });
      const ratio = getShiftRatioOf(s);
      const workDayCount = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]).length;
      targetShiftCounts[s.id] = {};
      if (ratio) {
        const dayShiftTypes = dayTypes.filter(k => k !== "夜勤");
        const ratioTotal = dayShiftTypes.reduce((sum, k) => sum + (ratio[k] || 0), 0);
        if (ratioTotal > 0) {
          const corr = s.shiftRatioCorrection || {};
          const adj = {};
          dayShiftTypes.forEach(k => { adj[k] = Math.max(0, (ratio[k] || 0) - (corr[k] || 0) * 0.5); });
          const adjTotal = dayShiftTypes.reduce((sum, k) => sum + adj[k], 0) || ratioTotal;
          let alloc = 0;
          dayShiftTypes.filter(k => k !== "日勤").forEach(k => {
            const t = Math.round(workDayCount * adj[k] / adjTotal);
            targetShiftCounts[s.id][k] = t; alloc += t;
          });
          targetShiftCounts[s.id]["日勤"] = Math.max(0, workDayCount - alloc);
        } else {
          dayTypes.forEach(k => { targetShiftCounts[s.id][k] = 0; });
        }
      } else {
        dayTypes.forEach(k => { targetShiftCounts[s.id][k] = 0; });
      }
    });

    ds.forEach(s => {
      const trend = getTrend(s);
      const ratio = getShiftRatioOf(s);
      const workDays = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
      const allowed = getAllowedTypes(s).filter(k => k !== '夜勤' && k !== '明け');
      if (!allowed.length) return;

      const getShiftWeight = (d, k) => {
        const weekday = new Date(year, month, d).getDay();
        if (trend?.dowShiftRate?.[weekday]?.[k] != null) {
          if (_diag) _diag.passBWeight.usedDowShiftRate++;
          return Math.max(0.01, trend.dowShiftRate[weekday][k]);
        }
        if (trend && typeof trend[k] === 'number') {
          if (_diag) _diag.passBWeight.usedFreqTrend++;
          return Math.max(0.01, trend[k]);
        }
        if (!trend && ratio) {
          const ratioTotal = allowed.reduce((sum, j) => sum + (ratio[j] || 0), 0);
          if (ratioTotal > 0) {
            if (_diag) _diag.passBWeight.usedRatio++;
            return Math.max(0.01, (ratio[k] || 0.01) / ratioTotal);
          }
        }
        if (!trend && dept.roleShiftTypes?.[s.role]) {
          if (_diag) _diag.passBWeight.usedDeptAvg++;
          return 1 / allowed.length;
        }
        if (deptAvgRatio?.[k] != null) {
          if (_diag) _diag.passBWeight.usedDeptAvg++;
          return Math.max(0.01, deptAvgRatio[k]);
        }
        if (_diag) _diag.passBWeight.usedUniform++;
        return 1 / allowed.length;
      };

      if (ratio && Object.values(targetShiftCounts[s.id]).some(v => v > 0)) {
        if (_diag) _diag.passBPath.pathA++;
        const remaining = new Set(workDays);
        allowed.filter(k => k !== '日勤').forEach(shiftType => {
          // slot-first 済み（maxStaff<99）のシフトは Pass B では扱わない
          if ((maxStaff[shiftType] ?? 99) < 99) return;
          const targetCount = targetShiftCounts[s.id][shiftType] || 0;
          if (!targetCount) return;
          const pool = [...remaining].filter(d => {
            const cnt = ds.filter(sx => res[sx.id][d] === shiftType).length;
            return cnt < (maxStaff[shiftType] ?? 99);
          });
          const weights = pool.map(d => getShiftWeight(d, shiftType));
          const picked = weightedSampleN(pool, weights, targetCount);
          picked.forEach(d => {
            res[s.id][d] = shiftType;
            assignedShiftCounts[s.id][shiftType] = (assignedShiftCounts[s.id][shiftType] || 0) + 1;
            remaining.delete(d);
          });
        });
        const nikkin = allowed.includes('日勤') ? '日勤' : (allowed.find(k => k !== '夜勤' && k !== '明け') || allowed[0]);
        remaining.forEach(d => {
          res[s.id][d] = nikkin;
          assignedShiftCounts[s.id][nikkin] = (assignedShiftCounts[s.id][nikkin] || 0) + 1;
        });
      } else {
        if (_diag) _diag.passBPath.pathB++;
        workDays.forEach(d => {
          const probs = {};
          allowed.forEach(k => { probs[k] = getShiftWeight(d, k); });
          const trendTop = Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0];
          const dayCnts = {};
          dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
          let hasDeficit = false, hasCapacity = false;
          allowed.forEach(k => {
            const deficit = Math.max(0, (dept.minStaff[k] || 0) - (dayCnts[k] || 0));
            if (deficit > 0) { probs[k] = (probs[k] || 0.01) * (1 + deficit * 2); hasDeficit = true; }
            if ((dayCnts[k] || 0) >= (maxStaff[k] ?? 99)) { probs[k] = 0; hasCapacity = true; }
          });
          if (_diag) {
            if (hasDeficit)  _diag.passBDecision.deficitOverride++;
            if (hasCapacity) _diag.passBDecision.capacityZero++;
          }
          const pick = sampleFromProbs(probs)
            || allowed.find(k => (dayCnts[k]||0) < (maxStaff[k]??99))
            || allowed.find(k => k === '日勤')
            || allowed[0];
          if (_diag) {
            if (pick === trendTop) {
              _diag.passBDecision.trendTopPicked++;
            } else {
              _diag.passBDecision.trendTopOverridden++;
            }
            if (_diag.topTrend) {
              _diag.topTrend.passB.proposals++;
              if (pick === trendTop) {
                _diag.topTrend.passB.adopted++;
                _trendTopMap?.set(`${s.id}:${d}`, trendTop);
              } else if (probs[trendTop] === 0) {
                _diag.topTrend.passB.rejectedByCapacity++;
              } else if (hasDeficit) {
                _diag.topTrend.passB.rejectedByDeficit++;
              } else {
                _diag.topTrend.passB.rejectedBySampling++;
              }
            }
          }
          res[s.id][d] = pick;
          assignedShiftCounts[s.id][pick] = (assignedShiftCounts[s.id][pick] || 0) + 1;
        });
      }
    });

    // Snapshot for PassC/TierIV change tracking
    if (_diag?.topTrend) {
      _snapPostPassB = {};
      for (const s of ds) _snapPostPassB[s.id] = { ...res[s.id] };
    }

    // ── Pass C: 連続勤務超過の修正 ────────────────────────────────────────────
    ds.forEach(s => {
      for (let d = 1; d <= days; d++) {
        if (!deptWork.has(res[s.id][d]) || res[s.id][d] === '明け') continue;
        if (consecWork(s.id, d) <= maxConsec) continue;
        if (lockedDays[s.id].has(d) || res[s.id][d - 1] === '明け') continue;
        res[s.id][d] = '休み';
      }
    });

    if (_diag?.topTrend && _snapPostPassB) {
      for (const s of ds) {
        for (let d = 1; d <= days; d++) {
          const before = _snapPostPassB[s.id]?.[d];
          const after = res[s.id][d];
          if (before !== after) {
            _diag.topTrend.passC.changed++;
            const proposed = _trendTopMap?.get(`${s.id}:${d}`);
            if (proposed && proposed === before) _diag.topTrend.passC.changedFromAdopted++;
          }
        }
      }
      _snapPostPassC = {};
      for (const s of ds) _snapPostPassC[s.id] = { ...res[s.id] };
    }

    // ── 公休数調整 ────────────────────────────────────────────────────────────
    const _snapRestAdj = _diag?.topTrend?.tier4
      ? Object.fromEntries(ds.map(s => [s.id, { ...res[s.id] }]))
      : null;
    ds.forEach(s => {
      const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const kiboCount = Object.values(res[s.id]).filter(v => v === "希望休").length;
      const target = Math.max(0, totalTarget - kiboCount);
      {
        const restDays = Object.entries(res[s.id]).filter(([, v]) => v === "休み").map(([d]) => +d).sort((a, b) => a - b);
        let excess = restDays.length - target;
        for (const d of restDays) {
          if (excess <= 0) break;
          if (lockedDays[s.id].has(d)) continue;
          if (res[s.id][d - 1] === "明け") continue;
          if (res[s.id][d - 1] === "夜勤") continue;
          const actualBefore = consecWork(s.id, d - 1);
          let actualAfter = 0;
          for (let i = d + 1; i <= days; i++) { if (deptWork.has(res[s.id][i])) actualAfter++; else break; }
          if (actualBefore + 1 + actualAfter > maxConsec) continue;
          const dayCnts = {};
          dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
          let av = dayTypes.filter(k => dayCnts[k] < (maxStaff[k] ?? 99));
          av = av.filter(k => getAllowedTypes(s).includes(k));
          { const p=res[s.id][d-1],nx=res[s.id][d+1]; if(p) av=av.filter(k=>!isBadTransition(p,k)); if(nx) av=av.filter(k=>!isBadTransition(k,nx)); }
          if (!av.length) {
            const prevShift = res[s.id][d - 1]; const nextShift = res[s.id][d + 1];
            const roleAllowed = getAllowedTypes(s);
            const forceShift = roleAllowed.length < dayTypes.length
              ? (roleAllowed.find(k => {
                  if (isBadTransition(prevShift,k)||isBadTransition(k,nextShift)) return false;
                  return ds.filter(sx=>res[sx.id][d]===k).length < (maxStaff[k]??99);
                }) || roleAllowed[0])
              : (dayTypes.find(k => {
                  if (isBadTransition(prevShift, k)) return false;
                  if (isBadTransition(k, nextShift)) return false;
                  return ds.filter(sx=>res[sx.id][d]===k).length < (maxStaff[k]??99);
                }) || "日勤");
            res[s.id][d] = forceShift; excess--; continue;
          }
          const pick = [...av].sort((a, b) => { const dA=Math.max(0,(dept.minStaff[a]||0)-dayCnts[a]),dB=Math.max(0,(dept.minStaff[b]||0)-dayCnts[b]); if(dA!==dB)return dB-dA; return (PRIORITY[a]??3)-(PRIORITY[b]??3); })[0];
          res[s.id][d] = pick; excess--;
        }
      }
      {
        const currentRest = Object.values(res[s.id]).filter(v => v === "休み").length;
        let shortage = target - currentRest;
        if (shortage > 0) {
          const workDays2 = Object.entries(res[s.id]).filter(([, v]) => deptWork.has(v)).map(([d]) => +d)
            .filter(d => res[s.id][d - 1] !== "明け" && res[s.id][d + 1] !== "明け" && canRest(s.id, d))
            .sort((a, b) => consecWork(s.id, b - 1) - consecWork(s.id, a - 1));
          for (const d of workDays2) { if (shortage <= 0) break; if (!canRest(s.id, d)) continue; res[s.id][d] = "休み"; shortage--; }
        }
      }
      for (let d = 1; d <= days; d++) {
        if (res[s.id][d] !== "休み") continue;
        if (lockedDays[s.id].has(d)) continue;
        if (res[s.id][d - 1] === "明け") continue;
        if (res[s.id][d + 1] === "明け") continue;
        if (consecRest(s.id, d) <= 3) continue;
        if ((consecWork(s.id, d - 1) + 1) > maxConsec) continue;
        const fixCnts = {};
        dayTypes.forEach(k => { fixCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
        let av = dayTypes.filter(k => fixCnts[k] < (maxStaff[k] ?? 99));
        av = av.filter(k => getAllowedTypes(s).includes(k));
        { const p=res[s.id][d-1],nx=res[s.id][d+1]; if(p) av=av.filter(k=>!isBadTransition(p,k)); if(nx) av=av.filter(k=>!isBadTransition(k,nx)); }
        if (!av.length) continue;
        res[s.id][d] = [...av].sort((a, b) => fixCnts[a] - fixCnts[b])[0];
      }
    });
    if (_snapRestAdj && _diag?.topTrend?.tier4) {
      const tier = _diag.topTrend.tier4.restAdjust;
      for (const s of ds) {
        for (let d = 1; d <= days; d++) {
          const before = _snapRestAdj[s.id][d], after = res[s.id][d];
          if (before !== after) {
            tier.changed++;
            const proposed = _trendTopMap?.get(`${s.id}:${d}`);
            if (proposed && proposed === before) {
              tier.changedFromAdopted++;
              _diag.topTrend.tier4.events.push({ staff: s.name || s.id, day: d, before, after, reason: 'restAdjust' });
            }
          }
        }
      }
    }
  }

  // ★設定絶対優先: maxStaff超過を強制修正（他シフトへ振替→無理なら休み）
  const enforceMaxStaff = () => {
    const _snap = _diag?.topTrend?.tier4
      ? Object.fromEntries(ds.map(s => [s.id, { ...res[s.id] }]))
      : null;
    for (let d = 1; d <= days; d++) {
      for (const [shiftKey, limit] of Object.entries(maxStaff)) {
        const overStaff = ds.filter(s => res[s.id][d] === shiftKey);
        if (overStaff.length <= limit) continue;
        const toFix = [
          ...overStaff.filter(s => !lockedDays[s.id].has(d)),
          ...overStaff.filter(s =>  lockedDays[s.id].has(d)),
        ];
        let excess = overStaff.length - limit;
        for (const s of toFix) {
          if (excess <= 0) break;
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          const altShift = dayTypes.find(k => {
            if (k === shiftKey) return false;
            if (!getAllowedTypes(s).includes(k)) return false;
            if (isBadTransition(prev, k)) return false;
            if (isBadTransition(k, next)) return false;
            const cnt = ds.filter(sx => res[sx.id][d] === k).length;
            return cnt < (maxStaff[k] ?? 99);
          });
          res[s.id][d] = altShift || "休み";
          excess--;
        }
      }
    }
    if (_snap && _diag?.topTrend?.tier4) {
      const tier = _diag.topTrend.tier4.enforceMax;
      for (const s of ds) {
        for (let d = 1; d <= days; d++) {
          const before = _snap[s.id][d], after = res[s.id][d];
          if (before !== after) {
            tier.changed++;
            const proposed = _trendTopMap?.get(`${s.id}:${d}`);
            if (proposed && proposed === before) {
              tier.changedFromAdopted++;
              _diag.topTrend.tier4.events.push({ staff: s.name || s.id, day: d, before, after, reason: 'enforceMax' });
            }
          }
        }
      }
    }
  };
  enforceMaxStaff(); // 1回目: 調整フェーズ後の超過を除去

  {
    const _snapTransFix = _diag?.topTrend?.tier4
      ? Object.fromEntries(ds.map(s => [s.id, { ...res[s.id] }]))
      : null;
    // key: "sid:d" → 違反ルール名（fixDay実行時に記録）
    const _transfixRuleMap = _diag?.topTrend?.tier4 ? new Map() : null;
    const isViolation = (prev, curr) => isBadTransition(prev, curr);
    for (const s of ds) {
      for (let d = 2; d <= days; d++) {
        const vPrev = res[s.id][d - 1], vCurr = res[s.id][d];
        if (!isViolation(vPrev, vCurr)) continue;
        let rule = 'その他';
        if (vPrev === '遅番' && vCurr === '早番') rule = '遅番→早番禁止';
        else if (vPrev === '遅番' && vCurr === '日勤') rule = '遅番→日勤禁止';
        else if (vPrev === '日勤' && vCurr === '早番') rule = '日勤→早番禁止';
        const fixDay = (target) => {
          if (lockedDays[s.id].has(target)) return false;
          const p = res[s.id][target - 1];
          const n = res[s.id][target + 1];
          const cnts = {};
          dayTypes.forEach(k => { cnts[k] = ds.filter(sx => sx.id !== s.id && res[sx.id][target] === k).length; });
          const alt = dayTypes.find(k => {
            if (!getAllowedTypes(s).includes(k)) return false;
            if (isBadTransition(p, k)) return false;
            if (isBadTransition(k, n)) return false;
            return cnts[k] < (maxStaff[k] ?? 99);
          }) || "休み";
          res[s.id][target] = alt;
          if (_transfixRuleMap) _transfixRuleMap.set(`${s.id}:${target}`, rule);
          return true;
        };
        if (!fixDay(d)) fixDay(d - 1);
      }
    }
    if (_snapTransFix && _diag?.topTrend?.tier4) {
      const tier = _diag.topTrend.tier4.transitionFix;
      for (const s of ds) {
        for (let d = 1; d <= days; d++) {
          const before = _snapTransFix[s.id][d], after = res[s.id][d];
          if (before !== after) {
            tier.changed++;
            const proposed = _trendTopMap?.get(`${s.id}:${d}`);
            if (proposed && proposed === before) {
              tier.changedFromAdopted++;
              const rule     = _transfixRuleMap?.get(`${s.id}:${d}`) ?? 'その他';
              const prevSnap = _snapTransFix[s.id][d - 1];
              const nextSnap = _snapTransFix[s.id][d + 1];
              _diag.topTrend.tier4.events.push({
                staff: s.name || s.id, day: d,
                before, after,
                prevSnap, nextSnap,
                rule, reason: 'transitionFix',
              });
            }
          }
        }
      }
    }
  }

  enforceMaxStaff(); // 2回目

  {
    const _snapMinStaff = _diag?.topTrend?.tier4
      ? Object.fromEntries(ds.map(s => [s.id, { ...res[s.id] }]))
      : null;
    for (let pass = 0; pass < 3; pass++) {
    let anyFixed = false;
    for (let d = 1; d <= days; d++) {
      for (const [shiftKey, minCount] of Object.entries(dept.minStaff || {})) {
        let actual = ds.filter(s => res[s.id][d] === shiftKey).length;
        if (actual >= minCount) continue;
        const slideCands = ds.filter(s => {
          const cur = res[s.id][d];
          if (!cur || cur === shiftKey) return false;
          if (WORK_TYPES.has(cur) === false) return false;
          if (lockedDays[s.id].has(d)) return false;
          if (!getAllowedTypes(s).includes(shiftKey)) return false;
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          if (isBadTransition(prev, shiftKey)) return false;
          if (isBadTransition(shiftKey, next)) return false;
          const fromMin = dept.minStaff?.[cur] ?? 0;
          const fromActual = ds.filter(sx => res[sx.id][d] === cur).length;
          if (fromActual - 1 < fromMin) return false;
          return true;
        }).sort((a, b) => {
          const cntA = ds.filter(s => res[s.id][d] === res[a.id][d]).length;
          const cntB = ds.filter(s => res[s.id][d] === res[b.id][d]).length;
          const maxA = maxStaff[res[a.id][d]] ?? 99;
          const maxB = maxStaff[res[b.id][d]] ?? 99;
          return (maxA - cntA) - (maxB - cntB);
        });
        let need = minCount - actual;
        for (const s of slideCands) {
          if (need <= 0) break;
          res[s.id][d] = shiftKey; need--; anyFixed = true;
          actual++;
        }
        if (need <= 0) continue;
        const restCands = ds.filter(s => {
          if (res[s.id][d] !== "休み") return false;
          if (lockedDays[s.id].has(d)) return false;
          if (!getAllowedTypes(s).includes(shiftKey)) return false;
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          if (prev === "夜勤" || prev === "明け") return false;
          if (isBadTransition(prev, shiftKey)) return false;
          if (isBadTransition(shiftKey, next)) return false;
          if ((consecWork(s.id, d - 1) + 1) > maxConsec) return false;
          const curCount = ds.filter(sx => res[sx.id][d] === shiftKey).length;
          if (curCount >= (maxStaff[shiftKey] ?? 99)) return false;
          const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
          const actualKyuko = Object.values(res[s.id]).filter(v => v === "休み" || v === "希望休").length;
          return actualKyuko > targetKyuko;
        }).sort((a, b) => {
          const targetA = a.kyukoDaysByMonth?.[mk] ?? a.kyukoDays ?? 8;
          const targetB = b.kyukoDaysByMonth?.[mk] ?? b.kyukoDays ?? 8;
          const surplusA = Object.values(res[a.id]).filter(v => v === "休み" || v === "希望休").length - targetA;
          const surplusB = Object.values(res[b.id]).filter(v => v === "休み" || v === "希望休").length - targetB;
          return surplusB - surplusA;
        });
        for (const s of restCands) {
          if (need <= 0) break;
          res[s.id][d] = shiftKey; need--; anyFixed = true;
        }
      }
    }
    if (!anyFixed) break;
  }
    if (_snapMinStaff && _diag?.topTrend?.tier4) {
      const tier = _diag.topTrend.tier4.minStaff;
      for (const s of ds) {
        for (let d = 1; d <= days; d++) {
          const before = _snapMinStaff[s.id][d], after = res[s.id][d];
          if (before !== after) {
            tier.changed++;
            const proposed = _trendTopMap?.get(`${s.id}:${d}`);
            if (proposed && proposed === before) {
              tier.changedFromAdopted++;
              _diag.topTrend.tier4.events.push({ staff: s.name || s.id, day: d, before, after, reason: 'minStaff' });
            }
          }
        }
      }
    }
  }

  enforceMaxStaff(); // 3回目

  const _snapRestAdj2 = _diag?.topTrend?.tier4
    ? Object.fromEntries(ds.map(s => [s.id, { ...res[s.id] }]))
    : null;
  {
    const REST_KYU = new Set(["休み","希望休"]);
    for (const s of ds) {
      const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const actualKyuko = Object.values(res[s.id]).filter(v => REST_KYU.has(v)).length;
      let shortage = targetKyuko - actualKyuko;
      if (shortage <= 0) continue;
      const nikkinDays = Object.entries(res[s.id])
        .filter(([d, v]) => v === "日勤" && !lockedDays[s.id].has(+d))
        .map(([d]) => +d)
        .filter(d => {
          const minN = dept.minStaff?.["日勤"] ?? 0;
          const cur = ds.filter(sx => res[sx.id][d] === "日勤").length;
          if (cur - 1 < minN) return false;
          if (res[s.id][d - 1] === "明け") return false;
          const pr = consecRest(s.id, d - 1);
          const nx = consecRestFwd(s.id, d);
          return pr + 1 + nx <= 3;
        })
        .sort((a, b) => {
          const ca = ds.filter(sx => res[sx.id][a] === "日勤").length;
          const cb = ds.filter(sx => res[sx.id][b] === "日勤").length;
          return cb - ca;
        });
      for (const d of nikkinDays) {
        if (shortage <= 0) break;
        res[s.id][d] = "休み";
        shortage--;
      }
    }
  }

  {
    const REST_OVER = new Set(["休み","希望休"]);
    for (const s of ds) {
      const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const actualKyuko = Object.values(res[s.id]).filter(v => REST_OVER.has(v)).length;
      let excess = actualKyuko - targetKyuko;
      if (excess <= 0) continue;
      const allowedForS = getAllowedTypes(s);
      const excessRestDays = Object.entries(res[s.id])
        .filter(([d, v]) => v === "休み" && !lockedDays[s.id].has(+d))
        .map(([d]) => +d)
        .filter(d => {
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          if (prev === "明け" || prev === "夜勤") return false;
          const backW = consecWork(s.id, d - 1);
          let fwdW = 0; for (let i = d + 1; i <= days; i++) { if (deptWork.has(res[s.id][i])) fwdW++; else break; }
          if ((backW + 1 + fwdW) > maxConsec) return false;
          const tgt = allowedForS.includes("日勤") ? "日勤" : (allowedForS[0] || "日勤");
          if (isBadTransition(prev, tgt)) return false;
          if (isBadTransition(tgt, next)) return false;
          const curCount = ds.filter(sx => res[sx.id][d] === tgt).length;
          if (curCount >= (maxStaff[tgt] ?? 99)) return false;
          return true;
        })
        .sort((a, b) => {
          const tgt = allowedForS.includes("日勤") ? "日勤" : (allowedForS[0] || "日勤");
          const ca = ds.filter(sx => res[sx.id][a] === tgt).length;
          const cb = ds.filter(sx => res[sx.id][b] === tgt).length;
          return ca - cb;
        });
      for (const d of excessRestDays) {
        if (excess <= 0) break;
        const tgt = allowedForS.includes("日勤") ? "日勤" : (allowedForS[0] || "日勤");
        res[s.id][d] = tgt;
        excess--;
      }
    }
  }

  {
    for (const s of ds) {
      const sratio = s.shiftRatio || s.shiftRatioByMonth?.[mk];
      if (!sratio) continue;
      const ratioTotal = Object.values(sratio).reduce((sum, v) => sum + (v||0), 0);
      if (ratioTotal <= 0) continue;
      const allowed = getAllowedTypes(s);
      const workDaysArr = Array.from({length:days},(_,i)=>i+1)
        .filter(d => deptWork.has(res[s.id][d]) && res[s.id][d] !== '明け' && !lockedDays[s.id].has(d));
      const totalWork = workDaysArr.length;
      if (totalWork === 0) continue;
      const targets = {}, actuals = {};
      for (const [k, v] of Object.entries(sratio)) {
        if (v > 0 && allowed.includes(k)) {
          targets[k] = Math.round(totalWork * v / ratioTotal);
          actuals[k] = workDaysArr.filter(d => res[s.id][d] === k).length;
        }
      }
      console.log('[比率修復]', s.name, '目標:', JSON.stringify(targets), '実績:', JSON.stringify(actuals));
      const fromShifts = Object.keys(targets).filter(k => (actuals[k]||0) > targets[k])
        .sort((a,b) => (actuals[b]||0)-targets[b] - ((actuals[a]||0)-targets[a]));
      for (const fromShift of fromShifts) {
        const fromDays = workDaysArr.filter(d => res[s.id][d] === fromShift);
        const toShifts = Object.keys(targets).filter(k => k !== fromShift && targets[k] > (actuals[k]||0))
          .sort((a,b) => targets[b]-(actuals[b]||0) - (targets[a]-(actuals[a]||0)));
        for (const toShift of toShifts) {
          const canConvert = Math.min((actuals[fromShift]||0)-targets[fromShift], targets[toShift]-(actuals[toShift]||0));
          let converted = 0;
          for (const d of fromDays) {
            if (converted >= canConvert) break;
            if (res[s.id][d] !== fromShift) continue;
            const prev = res[s.id][d-1], next = res[s.id][d+1];
            if (isBadTransition(prev, toShift)) continue;
            if (isBadTransition(toShift, next)) continue;
            const fromCnt = ds.filter(sx => res[sx.id][d] === fromShift).length;
            if (fromCnt - 1 < (dept.minStaff?.[fromShift] ?? 0)) continue;
            const toCnt = ds.filter(sx => res[sx.id][d] === toShift).length;
            if (toCnt >= (maxStaff[toShift] ?? 99)) continue;
            res[s.id][d] = toShift;
            actuals[fromShift]--;
            actuals[toShift] = (actuals[toShift]||0) + 1;
            converted++;
          }
        }
      }
      console.log('[比率修復] 完了', s.name, '実績:', JSON.stringify(actuals));
    }
    if (_snapRestAdj2 && _diag?.topTrend?.tier4) {
      const tier = _diag.topTrend.tier4.restAdjust;
      for (const s of ds) {
        for (let d = 1; d <= days; d++) {
          const before = _snapRestAdj2[s.id][d], after = res[s.id][d];
          if (before !== after) {
            tier.changed++;
            const proposed = _trendTopMap?.get(`${s.id}:${d}`);
            if (proposed && proposed === before) {
              tier.changedFromAdopted++;
              _diag.topTrend.tier4.events.push({ staff: s.name || s.id, day: d, before, after, reason: 'restAdjust' });
            }
          }
        }
      }
    }
  }

  enforceMaxStaff(); // 4回目: 比率修復パス後の最終確認

  const warnings = {};
  for (let d = 1; d <= days; d++) {
    for (const [shiftKey, minCount] of Object.entries(dept.minStaff || {})) {
      const actual = ds.filter(s => res[s.id][d] === shiftKey).length;
      if (actual < minCount) {
        if (!warnings[shiftKey]) warnings[shiftKey] = { days: 0, maxShort: 0 };
        warnings[shiftKey].days++;
        warnings[shiftKey].maxShort = Math.max(warnings[shiftKey].maxShort, minCount - actual);
      }
    }
  }
  const timelineWarnings = [];
  if (isCtd) {
    const reqS = timeToMins(dept.requiredStart), reqE = timeToMins(dept.requiredEnd);
    if (reqS != null && reqE != null) {
      for (let d = 1; d <= days; d++) {
        const dayKeys = ds.filter(s => deptWork.has(res[s.id][d]) && res[s.id][d] !== "明け").map(s => res[s.id][d]);
        const gaps = coverageGaps(buildDayIntervals(dayKeys, dept), reqS, reqE);
        if (gaps.length > 0) timelineWarnings.push({ day: d, gaps });
      }
    }
  }
  if (_diag?.topTrend && _snapPostPassC) {
    for (const s of ds) {
      for (let d = 1; d <= days; d++) {
        const before = _snapPostPassC[s.id]?.[d];
        const after = res[s.id][d];
        if (before !== after) {
          _diag.topTrend.tierIV.changed++;
          const proposed = _trendTopMap?.get(`${s.id}:${d}`);
          if (proposed && proposed === before) _diag.topTrend.tierIV.changedFromAdopted++;
        }
      }
    }
  }
  return { shifts: res, warnings, timelineWarnings };
}

// 生成結果のペナルティスコアを計算（低いほど良い）
export function scoreShifts(res, ds, dept, days, year, month, shiftTrend = {}) {
  let score = 0;
  const WORK = buildDeptWorkTypes(dept.customShiftDefs);
  const REST = new Set(["休み","希望休"]);
  const maxConsec = dept.maxConsecutive || 5;
  const mk = monthKey(year, month);
  const workShiftTypes = dept.shiftTypes.filter(k => WORK.has(k) && k !== "夜勤");
  for (const s of ds) {
    const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const actualKyuko = Object.values(res[s.id] || {}).filter(v => REST.has(v)).length;
    score += Math.abs(actualKyuko - targetKyuko) * 10000;
    let consec = 0;
    for (let d = 1; d <= days; d++) {
      const sh = res[s.id]?.[d];
      if (WORK.has(sh) && sh !== "明け") { consec++; if (consec > maxConsec) score += 100; }
      else consec = 0;
    }
    for (let d = 2; d <= days; d++) {
      const prev = res[s.id]?.[d-1], curr = res[s.id]?.[d];
      { const th=dept.intervalThreshold??null; const bad=th!=null?shiftIntervalHours(prev,curr,dept)<th:((prev==="遅番"&&(curr==="早番"||curr==="日勤"))||(prev==="日勤"&&curr==="早番")); if(bad) score+=100; }
    }
    for (const t of workShiftTypes) {
      let sc = 0;
      for (let d = 1; d <= days; d++) {
        if (res[s.id]?.[d] === t) {
          sc++;
          if (sc === 4) score += 1500;
          else if (sc > 4) score += 6000;
        } else {
          sc = 0;
        }
      }
    }
  }
  // minStaff不足
  for (let d = 1; d <= days; d++) {
    for (const [k, minC] of Object.entries(dept.minStaff || {})) {
      const actual = ds.filter(s => res[s.id]?.[d] === k).length;
      if (actual < minC) score += actual === 0 ? (minC - actual) * 30 : (minC - actual) * 10;
    }
  }
  // maxStaff超過ペナルティ
  {
    const ms = {};
    [...new Set(dept.shiftTypes)].forEach(k => {
      const cd = (dept.customShiftDefs||[]).find(d=>d.key===k);
      const base = cd?.baseType || k;
      const def = base === "日勤" ? 99 : 1;
      const saved = dept.maxStaff?.[k];
      ms[k] = (saved != null && !(cd && base === "日勤" && saved === 1)) ? saved : def;
    });
    for (let d = 1; d <= days; d++) {
      for (const [k, limit] of Object.entries(ms)) {
        if (limit >= 99) continue;
        const cnt = ds.filter(s => res[s.id]?.[d] === k).length;
        if (cnt > limit) score += (cnt - limit) * 10000;
      }
    }
  }
  if (ds.length > 1) {
    const hasNight = dept.shiftTypes.includes('夜勤');
    const REST_F = new Set(['休み', '希望休', '有休', '公休', '休', '明け']);
    let totalNight = 0, totalWeekend = 0;
    const nc = {}, wc = {};
    for (const s of ds) {
      let n = 0, w = 0;
      for (let d = 1; d <= days; d++) {
        const t = res[s.id]?.[d] || '';
        if (hasNight && t === '夜勤') n++;
        const dow = new Date(year, month, d).getDay();
        if ((dow === 0 || dow === 6) && t && !REST_F.has(t)) w++;
      }
      nc[s.id] = n; wc[s.id] = w;
      totalNight += n; totalWeekend += w;
    }
    const avgN = totalNight / ds.length, avgW = totalWeekend / ds.length;
    let varN = 0, varW = 0;
    for (const s of ds) {
      varN += (nc[s.id] - avgN) ** 2;
      varW += (wc[s.id] - avgW) ** 2;
    }
    if (hasNight) score += (varN / ds.length) * 500;
    score += (varW / ds.length) * 200;
  }
  // G-1: 外国人夜勤サポート不在ペナルティ
  if (dept.shiftTypes.includes('夜勤')) {
    for (let d = 1; d <= days; d++) {
      const nightStaff = ds.filter(s => res[s.id]?.[d] === '夜勤');
      if (nightStaff.some(s => s.foreignNightSupportRequired) && !nightStaff.some(s => !s.foreignNightSupportRequired)) {
        score += 5000;
      }
    }
  }
  // G-2: 異動ベテラン夜勤ペナルティ
  for (const s of ds) {
    const fy = s.facilityYears, fl = s.floorYears;
    if (fy == null || fl == null) continue;
    const rr = (fy >= 2 && fl < 0.5) ? 'high' : (fy >= 1 && fl < 0.3) ? 'medium' : 'low';
    if (rr === 'low') continue;
    const nightCnt = Object.values(res[s.id] || {}).filter(v => v === '夜勤').length;
    score += nightCnt * (rr === 'high' ? 200 : 100);
  }
  if (dept.roleShiftTypes) {
    for (const s of ds) {
      const ra = dept.roleShiftTypes[s.role];
      if (!ra) continue;
      for (let d = 1; d <= days; d++) {
        const sh = res[s.id]?.[d];
        if (!sh || !WORK.has(sh) || sh === '明け') continue;
        if (!ra.includes(sh)) score += 5000;
      }
    }
  }
  for (const s of ds) {
    const ratio = s.shiftRatio || s.shiftRatioByMonth?.[mk];
    if (!ratio) continue;
    const ratioTotal = Object.values(ratio).reduce((sum, v) => sum + (v || 0), 0);
    if (ratioTotal <= 0) continue;
    const workCounts = {};
    let totalWork = 0;
    for (let d = 1; d <= days; d++) {
      const sh = res[s.id]?.[d];
      if (!sh || !WORK.has(sh) || sh === '明け') continue;
      workCounts[sh] = (workCounts[sh] || 0) + 1;
      totalWork++;
    }
    if (totalWork === 0) continue;
    Object.entries(ratio).forEach(([k, targetRate]) => {
      if (!targetRate || targetRate <= 0) return;
      const targetRatio = targetRate / ratioTotal;
      const actualRatio = (workCounts[k] || 0) / totalWork;
      score += Math.abs(actualRatio - targetRatio) * 100 * 50;
    });
  }
  const LEARN_TYPES = new Set(dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け'));
  const LEARN_REST = new Set(['休み', '希望休']);
  if (shiftTrend && ds.length > 0) {
    const trendKeys = Object.keys(shiftTrend).filter(k => k !== '_months' && k !== '_monthCounts');
    if (trendKeys.length > 0) {
      for (const s of ds) {
        const tKey = trendKeys.find(k => nameMatch(k, s.name));
        const trend = tKey ? shiftTrend[tKey] : null;
        if (!trend) continue;
        for (let d = 1; d <= days; d++) {
          const shift = res[s.id]?.[d];
          if (!shift) continue;
          const dow = new Date(year, month, d).getDay();
          if (LEARN_TYPES.has(shift)) {
            const dowRate = trend.dowShiftRate?.[dow] ?? null;
            const predictedProb = dowRate
              ? (dowRate[shift] ?? 0)
              : (typeof trend[shift] === 'number' ? trend[shift] : 0);
            score += (1 - predictedProb) * 100;
          } else if (LEARN_REST.has(shift)) {
            const dow6 = (dow + 6) % 7;
            const restProb = trend.dowRestRate?.[dow6] ?? null;
            if (restProb != null) score += (1 - restProb) * 100;
          }
        }
      }
    }
  }
  return score;
}

// 局所探索（2-opt swap）
export function localSearchImprove(shifts, ds, dept, days, year, month, shiftTrend = {}) {
  if (ds.length < 2) return shifts;
  const res = {};
  for (const s of ds) res[s.id] = { ...(shifts[s.id] || {}) };
  const th = dept.intervalThreshold ?? null;
  const badTrans = (prev, curr) => {
    if (!prev || !curr) return false;
    if (th != null) return shiftIntervalHours(prev, curr, dept) < th;
    return (prev === "遅番" && (curr === "早番" || curr === "日勤")) || (prev === "日勤" && curr === "早番");
  };
  const FIXED = new Set(['希望休', '有休', '夜勤', '明け']);
  const mk = monthKey(year, month);
  const locked = {};
  for (const s of ds) {
    const lk = new Set();
    (s.kiboByMonth?.[mk] || []).forEach(d => lk.add(Number(d)));
    (s.yukyuByMonth?.[mk] || []).forEach(d => lk.add(Number(d)));
    Object.keys(s.shiftRequestsByMonth?.[mk] || {}).forEach(d => lk.add(Number(d)));
    locked[s.id] = lk;
  }
  let curScore = scoreShifts(res, ds, dept, days, year, month, shiftTrend);
  for (let pass = 0; pass < 3 && curScore > 0; pass++) {
    let improved = false;
    for (let i = 0; i < ds.length - 1; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const s1 = ds[i], s2 = ds[j];
        for (let d = 1; d <= days; d++) {
          const v1 = res[s1.id][d] || '', v2 = res[s2.id][d] || '';
          if (v1 === v2) continue;
          if (FIXED.has(v1) || FIXED.has(v2)) continue;
          if (locked[s1.id].has(d) || locked[s2.id].has(d)) continue;
          const p1 = res[s1.id][d-1] || '', n1 = res[s1.id][d+1] || '';
          const p2 = res[s2.id][d-1] || '', n2 = res[s2.id][d+1] || '';
          if (p1 === '明け' && v2 !== '休み') continue;
          if (p2 === '明け' && v1 !== '休み') continue;
          if (badTrans(p1, v2) || badTrans(v2, n1)) continue;
          if (badTrans(p2, v1) || badTrans(v1, n2)) continue;
          const ra1 = dept.roleShiftTypes?.[s1.role];
          const ra2 = dept.roleShiftTypes?.[s2.role];
          const isRoleWork = (v) => v !== '休み' && v !== '希望休' && v !== '有休' && v !== '明け';
          if (ra1 && isRoleWork(v2) && !ra1.includes(v2)) continue;
          if (ra2 && isRoleWork(v1) && !ra2.includes(v1)) continue;
          res[s1.id][d] = v2; res[s2.id][d] = v1;
          const newScore = scoreShifts(res, ds, dept, days, year, month, shiftTrend);
          if (newScore < curScore) { curScore = newScore; improved = true; }
          else { res[s1.id][d] = v1; res[s2.id][d] = v2; }
        }
      }
    }
    if (!improved) break;
  }
  return res;
}

// N回試行して最もスコアが低い結果を返す
export function bestOfN(staffList, dept, year, month, prevShifts, shiftTrend, n = 30, prevTail = {}) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  let best = null, bestScore = Infinity;
  const nikkinMin = dept.minStaff?.["日勤"] ?? 1;
  const nikkinMax = dept.maxStaff?.["日勤"];
  const useVariation = nikkinMax != null && nikkinMax < 99 && nikkinMax > nikkinMin;
  const range = useVariation ? nikkinMax - nikkinMin : 0;
  for (let i = 0; i < n; i++) {
    let deptVariant = dept;
    if (useVariation) {
      const cap = nikkinMin + (i % (range + 1));
      deptVariant = { ...dept, maxStaff: { ...dept.maxStaff, "日勤": cap } };
    }
    const { shifts, warnings, timelineWarnings } = autoGenerate(staffList, deptVariant, year, month, prevShifts, shiftTrend, {}, prevTail);
    const score = scoreShifts(shifts, ds, dept, days, year, month, shiftTrend);
    if (score < bestScore) { bestScore = score; best = { shifts, warnings, timelineWarnings, score }; }
    if (bestScore === 0) break;
  }
  if (best && bestScore > 0) {
    const improved = localSearchImprove(best.shifts, ds, dept, days, year, month, shiftTrend);
    const improvedScore = scoreShifts(improved, ds, dept, days, year, month, shiftTrend);
    if (improvedScore < bestScore) { best.shifts = improved; best.score = improvedScore; }
  }
  const mk2 = monthKey(year, month);
  const ratioFeedback = {};
  const dayShiftTypesForFb = dept.shiftTypes.filter(k => k !== '夜勤');
  for (const s of ds) {
    const ratio = s.shiftRatio || s.shiftRatioByMonth?.[mk2] || null;
    if (!ratio || !best?.shifts[s.id]) continue;
    const staffShifts = best.shifts[s.id];
    const workDays = Object.values(staffShifts).filter(v => WORK_TYPES.has(v) && v !== '明け').length;
    if (workDays === 0) continue;
    const correction = {};
    for (const k of dayShiftTypesForFb) {
      const targetRate = ratio[k] ?? 0;
      if (targetRate === 0) continue;
      correction[k] = (Object.values(staffShifts).filter(v => v === k).length / workDays) - targetRate;
    }
    if (Object.keys(correction).length > 0) ratioFeedback[s.id] = correction;
  }
  if (best) best.ratioFeedback = ratioFeedback;
  return best;
}