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
  // ── 制約強度 Tier 定義 ────────────────────────────────────────────────────
  // Tier1(Hard)  : 早番・遅番・夜勤 の maxStaff  → default=1, 最終保証で強制修正
  // Tier2(Soft)  : 日勤 maxStaff / minStaff / 連続勤務 → score penalty + repair 逃がし先
  // Tier3(快適性): 曜日偏り・好み → 軽い penalty のみ
  // ── Tier 判定: maxStaff[k] < 99 = Hard枠（早番・遅番・夜勤）────────────────
  const maxStaff = {};
  [...new Set(dept.shiftTypes)].forEach(k => { const cd=(dept.customShiftDefs||[]).find(d=>d.key===k);const base=cd?.baseType||k;const def=base==="日勤"?99:1;const saved=dept.maxStaff?.[k];maxStaff[k]=(saved!=null&&!(cd&&base==="日勤"&&saved===1))?saved:def; });
  const isHardMaxShift = (k) => (maxStaff[k] ?? 99) < 99; // Tier1: 早番/遅番/夜勤
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
  const debugReasons = {}; // { staffId: { day: string } } — Hard修復フェーズの変更理由ログ
  const ds = staffList.filter(s => s.dept === dept.id);
  ds.forEach(s => { res[s.id] = {}; debugReasons[s.id] = {}; });

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
  // 希望休D がある夜勤対応スタッフに対し、D-2=夜勤・D-1=明け を先行仮置きする。
  // これにより「希望休はパズルのノイズ」でなく「配置を確定させるヒント」として機能する。
  // 役職制限チェック用: dayTypes の先行計算（夜勤配置は getAllowedTypes より前に実行されるため）
  const _nonNightTypes = dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け');
  const _nightAllowed = (s) => {
    const rst = dept.roleShiftTypes?.[s.role];
    if (!rst) return true; // 制限なし
    return rst.length >= _nonNightTypes.length; // 全非夜勤シフトが許可 = 夜勤も可
  };

  if (dept.shiftTypes.includes("夜勤")) {
    const anchorPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const anchorAutoMax = Math.ceil(days / Math.max(anchorPool.length, 1));
    // kiboNightPreference が高いスタッフほど先にアンカー権を得る（学習データ反映）
    const sortedAnchorPool = [...anchorPool].sort((a, b) => (b.kiboNightPreference || 0) - (a.kiboNightPreference || 0));
    for (const s of sortedAnchorPool) {
      const kibodays = (s.kiboByMonth?.[mk] || []).map(Number).sort((a, b) => a - b);
      for (const D of kibodays) {
        const nightDay = D - 2, meakeDay = D - 1;
        if (nightDay < 1) continue; // 月頭すぎて前々日がない
        if (lockedDays[s.id].has(nightDay) || lockedDays[s.id].has(meakeDay)) continue; // どちらかが既にロック済み
        if (["夜勤", "明け"].includes(res[s.id][nightDay - 1])) continue; // 夜勤の前日が夜勤/明けは不可
        const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
        if (usedNight >= Math.max(s.nightMax || 5, anchorAutoMax)) continue; // 夜勤上限超過
        // アンカー成立: 夜勤→明け を仮置き（D の希望休は既にセット済み）
        res[s.id][nightDay] = "夜勤";
        res[s.id][meakeDay] = "明け";
        lockedDays[s.id].add(nightDay);
        lockedDays[s.id].add(meakeDay);
      }
    }
  }

  // ★ステップ2: 夜勤配置（ロック済みの日・翌日がロックの人は候補から除外）
  if (dept.shiftTypes.includes("夜勤")) {
    const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));
    for (let d = 1; d <= days; d++) {
      const already = ds.filter(s => res[s.id][d] === "夜勤").length;
      let need = (dept.minStaff["夜勤"] || 0) - already;
      if (need <= 0) continue;
      const canNight = (s) => {
        if (lockedDays[s.id].has(d)) return false; // その日がロック済み
        if (["夜勤","明け"].includes(res[s.id][d - 1])) return false;
        if (d + 1 <= days && lockedDays[s.id].has(d + 1) && res[s.id][d+1] !== "明け") return false; // 翌日がロック済み（明けを入れられない）
        if (d + 2 <= days && lockedDays[s.id].has(d + 2) && deptWork.has(res[s.id][d + 2])) return false; // 夜勤→明け→固定勤務（夜勤含む）になるのを防ぐ
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

  // ═══════════════════════════════════════════════════════════════════════════
  // 確率優先配置フェーズ（確率サンプリング主軸アーキテクチャ）
  //  Pass A: 休み日 → dowRestRate で確率的サンプリング（30試行に多様性）
  //  Pass B: 勤務日 → 全スタッフ統一処理（trend or deptAvg でサンプリング）
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
    // dowRestRate がある → 確率的非復元サンプリング（30試行間で多様性）
    // trendなし → 均等分散でランダムサンプリング
    ds.forEach(s => {
      const trend = getTrend(s);
      const freeDays = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
      const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const lockedRest = Object.values(res[s.id]).filter(v => deptRest.has(v) && v !== '明け').length;
      const restTarget = Math.max(0, totalTarget - lockedRest);

      const validDays = freeDays.filter(d => res[s.id][d - 1] !== '明け');
      if (trend?.dowRestRate) {
        // ★確率サンプリング: dowRestRate を重みにして非復元サンプリング
        const weights = validDays.map(d => {
          const dow6 = (new Date(year, month, d).getDay() + 6) % 7;
          return Math.max(0.01, trend.dowRestRate[dow6] ?? 0.01);
        });
        const picked = weightedSampleN(validDays, weights, restTarget);
        picked.forEach(d => { res[s.id][d] = '休み'; });
      } else {
        // trendなし → canRest 制約を満たす日から等確率ランダムサンプリング
        const eligible = validDays.filter(d => canRest(s.id, d));
        const shuffled = weightedSampleN(eligible, eligible.map(() => 1), restTarget);
        shuffled.forEach(d => { res[s.id][d] = '休み'; });
      }
    });

    // ── Pass B: 全スタッフの勤務シフトを確率サンプリングで配置 ──────────────
    // trend あり → dowShiftRate を重みにサンプリング（ratio指定があれば枠を先確保）
    // trend なし → deptAvgRatio fallback → 均等ランダム
    // maxStaff/minStaff 違反は後続の enforceMaxStaff / 最低配置保証で修正

    // ratioターゲット事前計算
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

      // シフト確率テーブルを取得（trend×比率ブレンド or 比率単独 or 均等）
      const getShiftWeight = (d, k) => {
        const weekday = new Date(year, month, d).getDay();
        // 比率が設定されていれば常に準備（trendとのブレンド用）
        const ratioTotal = ratio ? allowed.reduce((sum, j) => sum + (ratio[j] || 0), 0) : 0;
        const ratioW = (ratio && ratioTotal > 0) ? Math.max(0.01, (ratio[k] || 0.01) / ratioTotal) : null;
        if (trend?.dowShiftRate?.[weekday]?.[k] != null) {
          const trendW = Math.max(0.01, trend.dowShiftRate[weekday][k]);
          return ratioW ? trendW * 0.6 + ratioW * 0.4 : trendW; // trend+比率ブレンド(6:4)
        }
        if (trend && typeof trend[k] === 'number') {
          const trendW = Math.max(0.01, trend[k]);
          return ratioW ? trendW * 0.6 + ratioW * 0.4 : trendW; // trend+比率ブレンド(6:4)
        }
        if (ratioW) return ratioW; // trendなし+比率あり: 比率を直接使用
        return 1 / allowed.length; // 均等フォールバック（deptAvgRatio廃止）
      };

      if (ratio && Object.values(targetShiftCounts[s.id]).some(v => v > 0)) {
        // ★ratio指定あり: 希少シフトを確率サンプリングで日付確保 → 残りは主力シフト
        const remaining = new Set(workDays);
        allowed.filter(k => k !== '日勤').forEach(shiftType => {
          const targetCount = targetShiftCounts[s.id][shiftType] || 0;
          if (!targetCount) return;
          // maxStaff制約: その日に既にshiftType上限に達している日は除外
          const pool = [...remaining].filter(d => {
            const cnt = ds.filter(sx => res[sx.id][d] === shiftType).length;
            return cnt < (maxStaff[shiftType] ?? 99);
          });
          const weights = pool.map(d => getShiftWeight(d, shiftType));
          const picked = weightedSampleN(pool, weights, Math.min(targetCount, pool.length));
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
        // ★ratio指定なし / trendのみ / trendなし: 各日を確率サンプリングで決定
        workDays.forEach(d => {
          const dayCnts = {};
          dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
          // maxStaff制約: 上限に達したシフトは選択肢から除外し、日勤等に振り分ける
          const capAllowed = allowed.filter(k => dayCnts[k] < (maxStaff[k] ?? 99));
          const sample = capAllowed.length ? capAllowed : allowed;
          const probs = {};
          sample.forEach(k => { probs[k] = getShiftWeight(d, k); });
          // minStaff 不足シフトにブースト（minStaff充足優先）
          sample.forEach(k => {
            const deficit = Math.max(0, (dept.minStaff[k] || 0) - (dayCnts[k] || 0));
            if (deficit > 0) probs[k] = (probs[k] || 0.01) * (1 + deficit * 2);
          });
          const pick = sampleFromProbs(probs) || sample[0];
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
          if (!av.length) continue; // maxStaff上限またはisBadTransitionで振替先なし→休みのまま維持
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

  // ★enforceMaxStaff廃止: maxStaff超過はscoreShiftsのSoft-Mediumペナルティで評価
  // Hard修復フェーズはminStaff不足のみ担当。max超過はbestOfN×30試行+スコアで解消する。

  // 遅番翌日早番/日勤、日勤翌日早番 の残存違反を修正
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

  // (enforceMaxStaff廃止: max超過はscoreShiftsペナルティに委譲)

  // 最低配置保証フェーズ: minStaff未満の日にスタッフを補充
  // 優先①: 他シフト勤務中のスタッフをスライド（振替）→ 休み数は変わらない
  // 優先②: 休み→勤務は公休数が目標より多い余剰スタッフのみ対象（kyukoDays死守）
  for (let pass = 0; pass < 3; pass++) {
    let anyFixed = false;
    for (let d = 1; d <= days; d++) {
      for (const [shiftKey, minCount] of Object.entries(dept.minStaff || {})) {
        let actual = ds.filter(s => res[s.id][d] === shiftKey).length;
        if (actual >= minCount) continue;

        // ── 優先①: 他シフト勤務中のスタッフをスライド ──
        const slideCands = ds.filter(s => {
          const cur = res[s.id][d];
          if (!cur || cur === shiftKey) return false;
          if (WORK_TYPES.has(cur) === false) return false; // 勤務中のみ
          if (lockedDays[s.id].has(d)) return false;
          if (!getAllowedTypes(s).includes(shiftKey)) return false;
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          if (isBadTransition(prev, shiftKey)) return false;
          if (isBadTransition(shiftKey, next)) return false;
          // スライド元シフトのminStaffを割らないか確認
          const fromMin = dept.minStaff?.[cur] ?? 0;
          const fromActual = ds.filter(sx => res[sx.id][d] === cur).length;
          if (fromActual - 1 < fromMin) return false;
          return true;
        }).sort((a, b) => {
          // ★最小変更原則: 比率ターゲットのシフト中スタッフはスライドを最後に選ぶ
          const aRatio = a.shiftRatio || a.shiftRatioByMonth?.[mk];
          const bRatio = b.shiftRatio || b.shiftRatioByMonth?.[mk];
          const aOnTarget = aRatio && (aRatio[res[a.id][d]] || 0) > 0;
          const bOnTarget = bRatio && (bRatio[res[b.id][d]] || 0) > 0;
          if (aOnTarget && !bOnTarget) return 1;   // 比率targetを後回し
          if (!aOnTarget && bOnTarget) return -1;
          // maxStaff余裕が少ない方から先にスライド（既存ロジック）
          const cntA = ds.filter(s => res[s.id][d] === res[a.id][d]).length;
          const cntB = ds.filter(s => res[s.id][d] === res[b.id][d]).length;
          const maxA = maxStaff[res[a.id][d]] ?? 99;
          const maxB = maxStaff[res[b.id][d]] ?? 99;
          return (maxA - cntA) - (maxB - cntB);
        });
        let need = minCount - actual;
        for (const s of slideCands) {
          if (need <= 0) break;
          if (actual >= (maxStaff[shiftKey] ?? 99)) break; // maxStaff上限に達したらスライド停止
          const fromShift = res[s.id][d];
          res[s.id][d] = shiftKey; need--; anyFixed = true;
          debugReasons[s.id][d] = `[Hard①slide] ${fromShift}→${shiftKey} (minStaff不足 need=${minCount})`;
          actual++;
        }

        if (need <= 0) continue;

        // ── 優先②: 休み→勤務（公休数が目標より多い余剰スタッフのみ） ──
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
          // 公休数が目標より多い場合のみ許可（kyukoDays死守）
          const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
          const actualKyuko = Object.values(res[s.id]).filter(v => v === "休み" || v === "希望休").length;
          return actualKyuko > targetKyuko;
        }).sort((a, b) => {
          const targetA = a.kyukoDaysByMonth?.[mk] ?? a.kyukoDays ?? 8;
          const targetB = b.kyukoDaysByMonth?.[mk] ?? b.kyukoDays ?? 8;
          const surplusA = Object.values(res[a.id]).filter(v => v === "休み" || v === "希望休").length - targetA;
          const surplusB = Object.values(res[b.id]).filter(v => v === "休み" || v === "希望休").length - targetB;
          return surplusB - surplusA; // 余剰が多い人から優先
        });
        for (const s of restCands) {
          if (need <= 0) break;
          res[s.id][d] = shiftKey; need--; anyFixed = true;
          debugReasons[s.id][d] = `[Hard②rest→work] 休み→${shiftKey} (minStaff不足 need=${minCount})`;
        }
      }
    }
    if (!anyFixed) break;
  }

  // (enforceMaxStaff廃止: max超過はscoreShiftsペナルティに委譲)

  // ★公休数回復フェーズ: 目標公休数に不足しているスタッフの日勤を休みに強制変換
  // minStaff を割らない範囲で、日勤配置数が最多の日から優先して変換する
  {
    const REST_KYU = new Set(["休み","希望休"]);
    for (const s of ds) {
      const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const actualKyuko = Object.values(res[s.id]).filter(v => REST_KYU.has(v)).length;
      let shortage = targetKyuko - actualKyuko;
      if (shortage <= 0) continue;
      // 対象: ロック外の日勤日 → 日勤配置人数 降順で並べる
      const nikkinDays = Object.entries(res[s.id])
        .filter(([d, v]) => v === "日勤" && !lockedDays[s.id].has(+d))
        .map(([d]) => +d)
        .filter(d => {
          // minStaff['日勤'] を割らないか確認
          const minN = dept.minStaff?.["日勤"] ?? 0;
          const cur = ds.filter(sx => res[sx.id][d] === "日勤").length;
          if (cur - 1 < minN) return false;
          // 連続休み上限（3日まで許容）
          if (res[s.id][d - 1] === "明け") return false;
          const pr = consecRest(s.id, d - 1);
          const nx = consecRestFwd(s.id, d);
          return pr + 1 + nx <= 3;
        })
        .sort((a, b) => {
          const ca = ds.filter(sx => res[sx.id][a] === "日勤").length;
          const cb = ds.filter(sx => res[sx.id][b] === "日勤").length;
          return cb - ca; // 日勤が多い日を優先して間引く
        });
      for (const d of nikkinDays) {
        if (shortage <= 0) break;
        res[s.id][d] = "休み";
        shortage--;
      }
    }
  }

  // ★公休数超過バリデーション: 他ルールを破らない範囲で超過した休みを日勤へ変換
  // 変換できない場合は10日のまま受け入れる（無理強いしない）
  {
    const REST_OVER = new Set(["休み","希望休"]);
    for (const s of ds) {
      const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const actualKyuko = Object.values(res[s.id]).filter(v => REST_OVER.has(v)).length;
      let excess = actualKyuko - targetKyuko;
      if (excess <= 0) continue;
      const allowedForS = getAllowedTypes(s);
      // ロック外の「休み」のみ対象（希望休・有休は固定）
      const excessRestDays = Object.entries(res[s.id])
        .filter(([d, v]) => v === "休み" && !lockedDays[s.id].has(+d))
        .map(([d]) => +d)
        .filter(d => {
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          // 優先1: 夜勤・明け翌日は絶対NG
          if (prev === "明け" || prev === "夜勤") return false;
          // 連続勤務上限チェック（前後合計）
          const backW = consecWork(s.id, d - 1);
          let fwdW = 0; for (let i = d + 1; i <= days; i++) { if (deptWork.has(res[s.id][i])) fwdW++; else break; }
          if ((backW + 1 + fwdW) > maxConsec) return false;
          // シフト連続性チェック（日勤を仮ターゲットとして違反確認）
          const tgt = allowedForS.includes("日勤") ? "日勤" : (allowedForS[0] || "日勤");
          if (isBadTransition(prev, tgt)) return false;
          if (isBadTransition(tgt, next)) return false;
          // 優先3: maxStaff チェック（日勤上限を守る）
          const curCount = ds.filter(sx => res[sx.id][d] === tgt).length;
          if (curCount >= (maxStaff[tgt] ?? 99)) return false;
          return true;
        })
        .sort((a, b) => {
          // 日勤が少ない日を優先
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
        // 変換した後、残り excess を再チェック（変換で actualKyuko が変わるため）
      }
      // 変換できる枠がなければ「惜しい状態」のまま終了（スコアで後評価）
    }
  }

  // ★比率修復パス: minStaff保証後の比率乖離を実際のシフト変換で修正する
  // minStaff slide 等で A1→A に崩れたスタッフのシフトを制約内で書き戻す
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
      // 過多シフト → 過少シフトへの変換（制約チェック付き）
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
            // Tier1: toShift の maxStaff を超えない（早番・遅番・夜勤は上限1が Hard）
            const toCnt = ds.filter(sx => res[sx.id][d] === toShift).length;
            if (toCnt >= (maxStaff[toShift] ?? 99)) continue;
            res[s.id][d] = toShift;
            debugReasons[s.id][d] = `[Soft比率修復] ${fromShift}→${toShift} (目標:${targets[toShift]} 実績:${actuals[toShift]||0})`;
            actuals[fromShift]--;
            actuals[toShift] = (actuals[toShift]||0) + 1;
            converted++;
          }
        }
      }
    }
  }

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
  // ★Tier1 Hard 最終保証: 全フェーズ後の 早番・遅番・夜勤 超過を強制修正（Tier2=日勤 を逃がし先に使う）
  for (let d = 1; d <= days; d++) {
    for (const [shiftKey, limit] of Object.entries(maxStaff)) {
      if (limit >= 99) continue;
      const over = ds.filter(s => res[s.id][d] === shiftKey);
      if (over.length <= limit) continue;
      let excess = over.length - limit;
      for (const s of over) {
        if (excess <= 0) break;
        if (lockedDays[s.id].has(d)) continue;
        const prev = res[s.id][d - 1], next = res[s.id][d + 1];
        const alt = dayTypes.find(k => {
          if (k === shiftKey) return false;
          if (!getAllowedTypes(s).includes(k)) return false;
          if (isBadTransition(prev, k)) return false;
          if (isBadTransition(k, next)) return false;
          return ds.filter(sx => res[sx.id][d] === k).length < (maxStaff[k] ?? 99);
        });
        // Tier2（日勤）を逃がし先として使うが、日勤も満員なら休みへ
        const nikkinFallback = dayTypes.find(k => k !== shiftKey && k === '日勤' && ds.filter(sx => res[sx.id][d] === k).length < (maxStaff[k] ?? 99));
        res[s.id][d] = alt || nikkinFallback || '休み';
        excess--;
      }
    }
  }

  return { shifts: res, warnings, timelineWarnings, debugReasons };
}

// 生成結果のペナルティスコアを計算（低いほど良い）
export function scoreShifts(res, ds, dept, days, year, month, shiftTrend = {}) {
  let score = 0;
  const WORK = buildDeptWorkTypes(dept.customShiftDefs);
  const REST = new Set(["休み","希望休"]); // 有休は賃金支払い対象のため休日カウントから除外
  const maxConsec = dept.maxConsecutive || 5;
  const mk = monthKey(year, month);
  // maxStaff再計算（autoGenerateと同一ロジック）
  const maxStaffSc = {};
  [...new Set(dept.shiftTypes)].forEach(k => {
    const cd = (dept.customShiftDefs || []).find(d => d.key === k);
    const base = cd?.baseType || k;
    const def = base === "日勤" ? 99 : 1;
    const saved = dept.maxStaff?.[k];
    maxStaffSc[k] = (saved != null && !(cd && base === "日勤" && saved === 1)) ? saved : def;
  });
  const workShiftTypes = dept.shiftTypes.filter(k => WORK.has(k) && k !== "夜勤");
  for (const s of ds) {
    // kyukoDays 逸脱ペナルティ（ルール内で解決できない場合を許容: 1日ズレごとに10,000点）
    const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const actualKyuko = Object.values(res[s.id] || {}).filter(v => REST.has(v)).length;
    score += Math.abs(actualKyuko - targetKyuko) * 10000;

    // 連続勤務違反
    let consec = 0;
    for (let d = 1; d <= days; d++) {
      const sh = res[s.id]?.[d];
      if (WORK.has(sh) && sh !== "明け") { consec++; if (consec > maxConsec) score += 100; }
      else consec = 0;
    }
    // 遅番→早番/日勤、日勤→早番 違反
    for (let d = 2; d <= days; d++) {
      const prev = res[s.id]?.[d-1], curr = res[s.id]?.[d];
      { const th=dept.intervalThreshold??null; const bad=th!=null?shiftIntervalHours(prev,curr,dept)<th:((prev==="遅番"&&(curr==="早番"||curr==="日勤"))||(prev==="日勤"&&curr==="早番")); if(bad) score+=100; }
    }
    // 同一シフト連続ペナルティ（×3強化: 4連=1500, 5連以上=6000/日）
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
  // minStaff不足: Semi-Hard（超重ペナルティ）/ maxStaff超過: Soft-Medium
  for (let d = 1; d <= days; d++) {
    for (const [k, minC] of Object.entries(dept.minStaff || {})) {
      const actual = ds.filter(s => res[s.id]?.[d] === k).length;
      if (actual < minC) score += actual === 0 ? minC * 1000 : (minC - actual) * 300;
    }
    for (const [k, maxC] of Object.entries(maxStaffSc)) {
      if (maxC >= 99) continue;
      const actual = ds.filter(s => res[s.id]?.[d] === k).length;
      if (actual > maxC) score += (actual - maxC) * 150;
    }
  }
  // 公平性ペナルティ: 夜勤回数・土日出勤回数の分散（スタッフ間の不均衡を抑制）
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
    // 夜勤分散×500、土日分散×200（コア制約に次ぐ優先度）
    if (hasNight) score += (varN / ds.length) * 500;
    score += (varW / ds.length) * 200;
  }
  // 役職制限違反ペナルティ（ルール違反10000点級: 1件=5000点）
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
  // ★勤務比率乖離ペナルティ（1%乖離ごとに50点: 役職制限5000点より軽い誘導）
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
  // ④⑤ 学習適合ペナルティ: 勤務日も休日も含む。1人1日あたり最大100点
  // ルール違反(10000点)を逆転しない範囲で公平性ペナルティ(2000点~)を上回るスケール
  const LEARN_TYPES = new Set(dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け'));
  const LEARN_REST = new Set(['休み', '希望休']); // 休日パターンもシンクロ率に100%直結
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
            score += (1 - predictedProb) * 30; // Excel学習はSoft: 傾向補正として軽く
          } else if (LEARN_REST.has(shift)) {
            const dow6 = (dow + 6) % 7; // dowRestRateは月曜=0インデックスで格納
            const restProb = trend.dowRestRate?.[dow6] ?? null;
            if (restProb != null) score += (1 - restProb) * 30; // 同上: 軽い傾向補正
          }
        }
      }
    }
  }
  return score;
}

// 局所探索（2-opt swap）: 生成済みシフトのスコアをスワップ改善でさらに下げる
export function localSearchImprove(shifts, ds, dept, days, year, month, shiftTrend = {}) {
  if (ds.length < 2) return shifts;
  const res = {};
  for (const s of ds) res[s.id] = { ...(shifts[s.id] || {}) };

  // isBadTransition を再実装（autoGenerate 外から使えるよう）
  const th = dept.intervalThreshold ?? null;
  const badTrans = (prev, curr) => {
    if (!prev || !curr) return false;
    if (th != null) return shiftIntervalHours(prev, curr, dept) < th;
    return (prev === "遅番" && (curr === "早番" || curr === "日勤")) || (prev === "日勤" && curr === "早番");
  };

  // 固定タイプ（夜勤・明けは連鎖が複雑なためスワップ対象外）
  const FIXED = new Set(['希望休', '有休', '夜勤', '明け']);
  // ロック日（希望休・有休・希望勤務が入っている日）
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
          // 明け翌日は休みのみ許可（夜勤チェーンを壊さない）
          const p1 = res[s1.id][d-1] || '', n1 = res[s1.id][d+1] || '';
          const p2 = res[s2.id][d-1] || '', n2 = res[s2.id][d+1] || '';
          if (p1 === '明け' && v2 !== '休み') continue;
          if (p2 === '明け' && v1 !== '休み') continue;
          // 遷移ルール違反チェック
          if (badTrans(p1, v2) || badTrans(v2, n1)) continue;
          if (badTrans(p2, v1) || badTrans(v1, n2)) continue;
          // 役職制限チェック: スワップ後のシフトが相手役職に許可されているか
          const ra1 = dept.roleShiftTypes?.[s1.role];
          const ra2 = dept.roleShiftTypes?.[s2.role];
          const isRoleWork = (v) => v !== '休み' && v !== '希望休' && v !== '有休' && v !== '明け';
          if (ra1 && isRoleWork(v2) && !ra1.includes(v2)) continue;
          if (ra2 && isRoleWork(v1) && !ra2.includes(v1)) continue;
          // スワップ試行
          res[s1.id][d] = v2; res[s2.id][d] = v1;
          const newScore = scoreShifts(res, ds, dept, days, year, month, shiftTrend);
          if (newScore < curScore) { curScore = newScore; improved = true; }
          else { res[s1.id][d] = v1; res[s2.id][d] = v2; } // 戻す
        }
      }
    }
    if (!improved) break;
  }
  return res;
}

// N回試行して最もスコアが低い（違反が少ない）結果を返す
export function bestOfN(staffList, dept, year, month, prevShifts, shiftTrend, n = 30) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  let best = null, bestScore = Infinity;
  // 日勤の上限が明示設定されている場合、試行ごとに上限を変えて多様な解を探索
  const nikkinMin = dept.minStaff?.["日勤"] ?? 1;
  const nikkinMax = dept.maxStaff?.["日勤"];
  const useVariation = nikkinMax != null && nikkinMax < 99 && nikkinMax > nikkinMin;
  const range = useVariation ? nikkinMax - nikkinMin : 0;
  for (let i = 0; i < n; i++) {
    let deptVariant = dept;
    if (useVariation) {
      // 試行ごとに日勤の上限を min〜max の範囲でサイクル
      const cap = nikkinMin + (i % (range + 1));
      deptVariant = { ...dept, maxStaff: { ...dept.maxStaff, "日勤": cap } };
    }
    const { shifts, warnings, timelineWarnings, debugReasons } = autoGenerate(staffList, deptVariant, year, month, prevShifts, shiftTrend);
    // スコアリングは常に元のdeptで評価（公平な比較）
    const score = scoreShifts(shifts, ds, dept, days, year, month, shiftTrend);
    if (score < bestScore) { bestScore = score; best = { shifts, warnings, timelineWarnings, debugReasons, score }; }
    if (bestScore === 0) break; // 違反ゼロなら即採用
  }
  // 局所探索（swap改善）: 30回試行の最良案をさらにスコア改善
  if (best && bestScore > 0) {
    const improved = localSearchImprove(best.shifts, ds, dept, days, year, month, shiftTrend);
    const improvedScore = scoreShifts(improved, ds, dept, days, year, month, shiftTrend);
    if (improvedScore < bestScore) { best.shifts = improved; best.score = improvedScore; }
  }
  // 比率達成フィードバック: 実際の勤務比率 vs 目標比率の乖離を記録（次回補正用）
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
