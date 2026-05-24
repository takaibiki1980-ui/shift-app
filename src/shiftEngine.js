// Pure shift engine functions - no React/Supabase dependencies

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

export function autoGenerate(staffList, dept, year, month, prevShifts, shiftTrend = {}) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
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

  const consecWork = (id, d) => { let c = 0; for (let i = d; i >= 1; i--) { if (deptWork.has(res[id][i])) c++; else break; } return c; };
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
        if (["夜勤", "明け"].includes(res[s.id][nightDay - 1])) continue;
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
      for (const s of cands) {
        if (need <= 0) break;
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
        const cands = slotPool.filter(s => {
          if (lockedDays[s.id].has(d)) return false;  // 希望休・夜勤アンカー等でロック
          if (res[s.id][d]) return false;              // 既に何か割り当て済み
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          if (prev === '明け') return false;
          if (isBadTransition(prev, shiftType)) return false;
          if (isBadTransition(shiftType, next)) return false;
          return true;
        }).sort((a, b) => {
          // ①今月の担当回数が少ない人を優先（公平配分）
          const ua = Object.values(res[a.id]).filter(v => v === shiftType).length;
          const ub = Object.values(res[b.id]).filter(v => v === shiftType).length;
          if (ua !== ub) return ua - ub;
          // ②trend がある場合は当日曜の割り当て確率を加味
          const weekday = new Date(year, month, d).getDay();
          const tA = getTrend(a), tB = getTrend(b);
          const wA = tA?.dowShiftRate?.[weekday]?.[shiftType] ?? tA?.[shiftType] ?? 0.5;
          const wB = tB?.dowShiftRate?.[weekday]?.[shiftType] ?? tB?.[shiftType] ?? 0.5;
          if (Math.abs(wA - wB) > 0.05) return wB - wA;
          return Math.random() - 0.5;
        });
        let filled = 0;
        for (const s of cands) {
          if (filled >= need) break;
          res[s.id][d] = shiftType;
          filled++;
        }
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
        const weights = validDays.map(d => {
          const dow6 = (new Date(year, month, d).getDay() + 6) % 7;
          return Math.max(0.01, trend.dowRestRate[dow6] ?? 0.01);
        });
        const picked = weightedSampleN(validDays, weights, restTarget);
        picked.forEach(d => { res[s.id][d] = '休み'; });
      } else {
        const eligible = validDays.filter(d => canRest(s.id, d));
        const shuffled = weightedSampleN(eligible, eligible.map(() => 1), restTarget);
        shuffled.forEach(d => { res[s.id][d] = '休み'; });
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
        if (trend?.dowShiftRate?.[weekday]?.[k] != null) return Math.max(0.01, trend.dowShiftRate[weekday][k]);
        if (trend && typeof trend[k] === 'number') return Math.max(0.01, trend[k]);
        if (!trend && ratio) {
          const ratioTotal = allowed.reduce((sum, j) => sum + (ratio[j] || 0), 0);
          if (ratioTotal > 0) return Math.max(0.01, (ratio[k] || 0.01) / ratioTotal);
        }
        if (!trend && dept.roleShiftTypes?.[s.role]) return 1 / allowed.length;
        if (deptAvgRatio?.[k] != null) return Math.max(0.01, deptAvgRatio[k]);
        return 1 / allowed.length;
      };

      if (ratio && Object.values(targetShiftCounts[s.id]).some(v => v > 0)) {
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
        workDays.forEach(d => {
          const probs = {};
          allowed.forEach(k => { probs[k] = getShiftWeight(d, k); });
          const dayCnts = {};
          dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
          allowed.forEach(k => {
            const deficit = Math.max(0, (dept.minStaff[k] || 0) - (dayCnts[k] || 0));
            if (deficit > 0) probs[k] = (probs[k] || 0.01) * (1 + deficit * 2);
            if ((dayCnts[k] || 0) >= (maxStaff[k] ?? 99)) probs[k] = 0;
          });
          const pick = sampleFromProbs(probs)
            || allowed.find(k => (dayCnts[k]||0) < (maxStaff[k]??99))
            || allowed.find(k => k === '日勤')
            || allowed[0];
          res[s.id][d] = pick;
          assignedShiftCounts[s.id][pick] = (assignedShiftCounts[s.id][pick] || 0) + 1;
        });
      }
    });

    // ── Pass C: 連続勤務超過の修正 ────────────────────────────────────────────
    ds.forEach(s => {
      for (let d = 1; d <= days; d++) {
        if (!deptWork.has(res[s.id][d]) || res[s.id][d] === '明け') continue;
        if (consecWork(s.id, d) <= maxConsec) continue;
        if (lockedDays[s.id].has(d) || res[s.id][d - 1] === '明け') continue;
        res[s.id][d] = '休み';
      }
    });

    // ── 公休数調整 ────────────────────────────────────────────────────────────
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
  }

  // ★設定絶対優先: maxStaff超過を強制修正（他シフトへ振替→無理なら休み）
  const enforceMaxStaff = () => {
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
  };
  enforceMaxStaff(); // 1回目: 調整フェーズ後の超過を除去

  const isViolation = (prev, curr) => isBadTransition(prev, curr);
  for (const s of ds) {
    for (let d = 2; d <= days; d++) {
      if (!isViolation(res[s.id][d - 1], res[s.id][d])) continue;
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
        return true;
      };
      if (!fixDay(d)) fixDay(d - 1);
    }
  }

  enforceMaxStaff(); // 2回目

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

  enforceMaxStaff(); // 3回目

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
export function bestOfN(staffList, dept, year, month, prevShifts, shiftTrend, n = 30) {
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
    const { shifts, warnings, timelineWarnings } = autoGenerate(staffList, deptVariant, year, month, prevShifts, shiftTrend);
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