import { useState, useCallback, useRef, useEffect } from "react";

// ─────────────────────────────────────────────
//  SHIFT DEFINITIONS
// ─────────────────────────────────────────────
const SHIFTS = {
  早番: { short:"早", color:"#fbbf24", bg:"#451a03", border:"#d97706", time:"7:00〜16:00" },
  日勤: { short:"日", color:"#60a5fa", bg:"#0c2340", border:"#2563eb", time:"9:00〜18:00" },
  遅番: { short:"遅", color:"#c084fc", bg:"#1e0a40", border:"#7c3aed", time:"11:30〜20:30" },
  夜勤: { short:"夜", color:"#7dd3fc", bg:"#071528", border:"#1d4ed8", time:"16:30〜翌9:30" },
  明け: { short:"明", color:"#94a3b8", bg:"#131e2e", border:"#334155", time:"夜勤明け" },
  休み: { short:"休", color:"#4ade80", bg:"#022c22", border:"#16a34a", time:"－" },
  希望休: { short:"希", color:"#f87171", bg:"#3b0a0a", border:"#dc2626", time:"希望休" },
  有休: { short:"有", color:"#e879f9", bg:"#2e0a40", border:"#a21caf", time:"有給" },
  "": { short:"－", color:"#1e3a5f", bg:"transparent", border:"transparent", time:"" },
};
const SHIFT_KEYS = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休",""];
const REST_TYPES = new Set(["休み","希望休","有休","明け"]);
const WORK_TYPES = new Set(["早番","日勤","遅番","夜勤"]);

// ─────────────────────────────────────────────
//  DEPARTMENTS
// ─────────────────────────────────────────────
const DEFAULT_DEPTS = [
  { id:"kaigo1", label:"介護部 1階", icon:"🏠",
    shiftTypes:["早番","日勤","遅番","夜勤"],
    minStaff:{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 },
    defaultKyukoDays:8, maxConsecutive:5 },
  { id:"kaigo2", label:"介護部 2階", icon:"🏢",
    shiftTypes:["早番","日勤","遅番","夜勤"],
    minStaff:{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 },
    defaultKyukoDays:8, maxConsecutive:5 },
  { id:"jimu",   label:"事務所",     icon:"📋",
    shiftTypes:["日勤"],
    minStaff:{ 日勤:1 },
    defaultKyukoDays:8, maxConsecutive:5 },
  { id:"kango",  label:"看護部",     icon:"💉",
    shiftTypes:["日勤"],
    minStaff:{ 日勤:1 },
    defaultKyukoDays:8, maxConsecutive:5 },
  { id:"eiyo",   label:"栄養科",     icon:"🍱",
    shiftTypes:["早番","日勤"],
    minStaff:{ 早番:1, 日勤:1 },
    defaultKyukoDays:8, maxConsecutive:5 },
];

const ROLES_BY_DEPT = {
  kaigo1:["介護福祉士","介護職員","介護補助","介護助手","特定技能"],
  kaigo2:["介護福祉士","介護職員","介護補助","介護助手","特定技能"],
  jimu:  ["事務員","主任"],
  kango: ["看護師","准看護師"],
  eiyo:  ["管理栄養士","栄養士","調理師"],
};

// ─────────────────────────────────────────────
//  DEFAULT DATA
// ─────────────────────────────────────────────
const NAMES_K = ["田中 花子","鈴木 一郎","佐藤 美咲","山田 太郎","伊藤 さくら","中村 健","小林 由美","加藤 誠","吉田 幸","渡辺 亮"];
const buildStaff = () => {
  const out = [];
  ["kaigo1","kaigo2"].forEach(dept => {
    NAMES_K.forEach((name,i) => out.push({
      id:`${dept}_${i}`, dept, name,
      role: i<3?"介護福祉士":i<7?"介護職員":"介護補助",
      nightOk: [0,1,3,5,7].includes(i),
      nightMax: 5,
      targetWork: 20,
      kyukoDays: 8,
      kiboByMonth: {},
      shiftRequestsByMonth: {},
      kyukoDaysByMonth: {},
    }));
  });
  [
    {id:"jimu_0",dept:"jimu",name:"松本 恵子",role:"事務員"},
    {id:"jimu_1",dept:"jimu",name:"藤田 隆",  role:"主任"},
    {id:"kango_0",dept:"kango",name:"高橋 直美",role:"看護師"},
    {id:"kango_1",dept:"kango",name:"岡田 美里",role:"准看護師"},
    {id:"kango_2",dept:"kango",name:"森 香織",  role:"看護師"},
    {id:"eiyo_0",dept:"eiyo",name:"清水 優子",role:"管理栄養士"},
    {id:"eiyo_1",dept:"eiyo",name:"池田 恵",  role:"調理師"},
  ].forEach(s => out.push({ nightOk:false, nightMax:0, targetWork:20, kyukoDays:8, kiboByMonth:{}, shiftRequestsByMonth:{}, kyukoDaysByMonth:{}, ...s }));
  return out;
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
const getDays  = (y,m) => new Date(y,m+1,0).getDate();
const getWD    = (y,m,d) => ["日","月","火","水","木","金","土"][new Date(y,m,d).getDay()];
const isWE     = (y,m,d) => { const w=new Date(y,m,d).getDay(); return w===0||w===6; };
const monthKey = (y,m) => `${y}-${m+1}`;

// 連続勤務日数を計算（d日目を含めて何日連続か）
function calcConsecutive(sShifts, d) {
  let cnt = 0;
  for (let i = d; i >= 1; i--) {
    if (WORK_TYPES.has(sShifts[i])) cnt++;
    else break;
  }
  return cnt;
}

function autoGenerate(staffList, dept, year, month, prevShifts, shiftTrend = {}) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
  const maxStaff = { 早番:1, 日勤:4, 遅番:1, 夜勤:1 };
  const PRIORITY = { 早番:1, 遅番:1, 日勤:2 };

  // 傾向スコアを取得（名前が完全一致または部分一致）
  const getTrend = (s) => {
    if (!shiftTrend || Object.keys(shiftTrend).length === 0) return null;
    if (shiftTrend[s.name] && s.name !== '_months') return shiftTrend[s.name];
    const key = Object.keys(shiftTrend).filter(k => k !== '_months')
      .find(k => k.includes(s.name) || s.name.includes(k));
    return key ? shiftTrend[key] : null;
  };

  // 傾向を考慮したpick選択（傾向スコアが高いシフトを優先）
  const pickWithTrend = (s, available, cnts) => {
    const trend = getTrend(s);
    return [...available].sort((a, b) => {
      const dA = Math.max(0, (dept.minStaff[a]||0) - cnts[a]);
      const dB = Math.max(0, (dept.minStaff[b]||0) - cnts[b]);
      if (dA !== dB) return dB - dA; // 不足シフト最優先
      const pA = PRIORITY[a]??3, pB = PRIORITY[b]??3;
      if (pA !== pB) return pA - pB; // 優先度次
      // 傾向スコアで比較（スコアが高いシフトを優先）
      const tA = trend ? (trend[a] || 0) : 0;
      const tB = trend ? (trend[b] || 0) : 0;
      if (Math.abs(tA - tB) > 0.05) return tB - tA; // 5%以上差があれば傾向を反映
      return cnts[a] - cnts[b]; // 同程度なら人数が少ない方
    })[0];
  };

  const res = {};
  const ds = staffList.filter(s => s.dept === dept.id);

  // 初期化：希望休・有休のみ引き継ぎ
  ds.forEach(s => {
    res[s.id] = {};
    Object.entries(prevShifts[s.id] || {}).forEach(([d, v]) => {
      if (v === "希望休" || v === "有休") res[s.id][+d] = v;
    });
  });

  // ── ヘルパー ──────────────────────────────
  // d日目を含む前方向の連続勤務日数
  const consecWork = (id, d) => {
    let c = 0;
    for (let i = d; i >= 1; i--) {
      if (WORK_TYPES.has(res[id][i])) c++; else break;
    }
    return c;
  };
  // d日目を含む前方向の連続休み日数（明け除く）
  const consecRest = (id, d) => {
    let c = 0;
    for (let i = d; i >= 1; i--) {
      if (REST_TYPES.has(res[id][i]) && res[id][i] !== "明け") c++; else break;
    }
    return c;
  };
  // d日後方向の連続休み日数（明け除く）
  const consecRestFwd = (id, d) => {
    let c = 0;
    for (let i = d + 1; i <= days; i++) {
      if (REST_TYPES.has(res[id][i]) && res[id][i] !== "明け") c++; else break;
    }
    return c;
  };
  // この日に休みを入れたとき前後合算が2以下か
  const canRest = (id, d) => {
    if (res[id][d - 1] === "明け") return false; // 明け翌日は変更不可
    const fwd = consecRest(id, d - 1); // d-1までの連続休み
    const bwd = consecRestFwd(id, d);  // d+1以降の連続休み
    return (fwd + 1 + bwd) <= 2;       // この日含めて2以下
  };

  // Step 1: 希望休・シフト希望を確定
  ds.forEach(s => {
    (s.kiboByMonth?.[mk] || []).forEach(d => {
      if (d >= 1 && d <= days && res[s.id][d - 1] !== "夜勤")
        res[s.id][d] = "希望休";
    });
    Object.entries(s.shiftRequestsByMonth?.[mk] || {}).forEach(([day, shiftKey]) => {
      const d = +day;
      if (d >= 1 && d <= days && !res[s.id][d] && res[s.id][d - 1] !== "夜勤")
        res[s.id][d] = shiftKey;
    });
  });

  // Step 2: 夜勤を確保（均等分散・月末まで必ず1名保証）
  if (dept.shiftTypes.includes("夜勤")) {
    const nightPool = ds.filter(s => s.nightOk);
    // 夜勤可スタッフの月間上限を「days ÷ 人数」で自動計算し nightMax と取り小さい方を使う
    // 例：30日 ÷ 5人 = 6回が理論上限だが実際は明け・休みで約10日拘束→5回が現実的
    const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));

    for (let d = 1; d <= days; d++) {
      const already = ds.filter(s => res[s.id][d] === "夜勤").length;
      let need = (dept.minStaff["夜勤"] || 0) - already;
      if (need <= 0) continue;

      // 候補①：通常条件（nightMax以内・前日夜勤明けでない・空きまたは休みの日）
      let cands = nightPool.filter(s => {
        if (res[s.id][d] && res[s.id][d] !== "休み") return false;
        if (["夜勤","明け"].includes(res[s.id][d - 1])) return false;
        const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
        const limit = Math.max(s.nightMax || 5, autoMax);
        return usedNight < limit;
      }).sort((a, b) =>
        Object.values(res[a.id]).filter(v => v === "夜勤").length -
        Object.values(res[b.id]).filter(v => v === "夜勤").length
      );

      // 候補②：nightMax超えフォールバック（前日夜勤・明けでなければ）
      if (cands.length === 0) {
        cands = nightPool.filter(s => {
          if (res[s.id][d] && res[s.id][d] !== "休み") return false;
          if (["夜勤","明け"].includes(res[s.id][d - 1])) return false;
          return true; // 上限無視
        }).sort((a, b) =>
          Object.values(res[a.id]).filter(v => v === "夜勤").length -
          Object.values(res[b.id]).filter(v => v === "夜勤").length
        );
      }

      for (const s of cands) {
        if (need <= 0) break;
        res[s.id][d] = "夜勤";
        if (d + 1 <= days && !res[s.id][d + 1]) res[s.id][d + 1] = "明け";
        if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
        need--;
      }
    }
  }

  // Step 2.5: 各スタッフの休みを確定（5連勤上限を絶対に守る）
  const dayTypes = dept.shiftTypes.filter(s => s !== "夜勤");
  ds.forEach(s => {
    const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const kiboCount = Object.values(res[s.id]).filter(v => v === "希望休" || v === "有休").length;
    const restTarget = Math.max(0, totalTarget - kiboCount);

    // === フェーズA：空き日を「仮に勤務」として連続日数を計算し5連勤超えを防ぐ ===
    for (let d = 1; d <= days; d++) {
      if (res[s.id][d]) continue;
      // 目標休み数に達していたら追加しない
      const alreadyRest = Object.values(res[s.id]).filter(v => REST_TYPES.has(v) && v !== "明け").length;
      if (alreadyRest >= restTarget) continue; // breakではなくcontinue → 後半の連超も必ずチェック

      // d日目の前方連続日数（空き=勤務と仮定）
      let streak = 0;
      for (let i = d - 1; i >= 1; i--) {
        if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break;
        streak++;
      }
      if (streak >= maxConsec) {
        res[s.id][d] = "休み";
      }
    }

    // === フェーズB：残りのrestTargetをバランス良く配置 ===
    const alreadyRest = Object.values(res[s.id]).filter(v => REST_TYPES.has(v) && v !== "明け").length;
    let need = restTarget - alreadyRest;
    if (need <= 0) return;

    // 空き日数と残り日数から「均等に休みを入れるべきインターバル」を計算
    const freeDaysAll = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
    const interval = Math.max(1, Math.floor(freeDaysAll.length / (need + 1)));

    // 曜日別休み傾向を取得
    const trend = getTrend(s);
    const dowRestRate = trend?.dowRestRate || null;

    const candidates = freeDaysAll
      .filter(d => canRest(s.id, d))
      .sort((a, b) => {
        // ① 前方の連続勤務が長い日を優先
        let sa = 0, sb = 0;
        for (let i = a - 1; i >= 1; i--) {
          if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break;
          sa++;
        }
        for (let i = b - 1; i >= 1; i--) {
          if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break;
          sb++;
        }
        if (sb !== sa) return sb - sa;
        // ② 曜日別休み傾向スコアが高い日を優先（同連続勤務の場合）
        if (dowRestRate) {
          const dowA = (new Date(year, month, a).getDay() + 6) % 7;
          const dowB = (new Date(year, month, b).getDay() + 6) % 7;
          const rA = dowRestRate[dowA] ?? 0;
          const rB = dowRestRate[dowB] ?? 0;
          if (Math.abs(rA - rB) > 0.05) return rB - rA;
        }
        return a - b; // 同じなら早い日
      });

    // インターバルを考慮してなるべく均等に配置
    let lastRest = 0;
    for (const d of candidates) {
      if (need <= 0) break;
      if (res[s.id][d] || !canRest(s.id, d)) continue;
      let streak = 0;
      for (let i = d - 1; i >= 1; i--) {
        if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break;
        streak++;
      }
      const isUrgent = streak >= maxConsec - 1; // 4連勤手前は強制
      // 残り候補数がneed以下なら必ず入れる（スキップすると目標に届かない）
      const remainCands = candidates.filter(fd => fd > d && !res[s.id][fd] && canRest(s.id, fd)).length;
      const mustInsert = isUrgent || remainCands < need;
      if (!mustInsert && (d - lastRest) < interval) continue;
      res[s.id][d] = "休み";
      lastRest = d;
      need--;
    }
  });

  // Step 3: 日勤系シフトを配分
  // Step2.5で全員の休みは確定済み。ここでは「空き日＝シフト」として割り当てるのみ。
  // 休みは絶対に追加しない（2連休超えの強制勤務もここで処理）
  if (dayTypes.length === 0) {
    ds.forEach(s => {
      for (let d = 1; d <= days; d++) {
        if (!res[s.id][d]) res[s.id][d] = "休み";
      }
    });
  } else {
    for (let d = 1; d <= days; d++) {
      const cnts = {};
      dayTypes.forEach(k => { cnts[k] = ds.filter(s => res[s.id][d] === k).length; });

      // 空き日のスタッフ（Step2.5未割り当て）を連続勤務が少ない順に処理
      const freeStaff = ds
        .filter(s => !res[s.id][d])
        .sort((a, b) => consecWork(a.id, d - 1) - consecWork(b.id, d - 1));

      for (const s of freeStaff) {
        // 5連勤超えは強制休み（ただしここで休みを追加するのはこの場合のみ）
        if ((consecWork(s.id, d - 1) + 1) > maxConsec) {
          res[s.id][d] = "休み"; continue;
        }

        let available = dayTypes.filter(k => cnts[k] < (maxStaff[k] ?? 99));
        if (s.role === "介護補助" || s.role === "介護助手")
          available = available.filter(k => k === "日勤");
        if (res[s.id][d - 1] === "遅番")
          available = available.filter(k => k !== "早番");

        if (available.length === 0) {
          // シフト上限到達 → この日は休み（やむを得ず）
          res[s.id][d] = "休み"; continue;
        }

        const pick = pickWithTrend(s, available, cnts);
        res[s.id][d] = pick; cnts[pick] = (cnts[pick]||0) + 1;
      }

      // 未割り当て（全シフト上限到達で埋められなかった場合）は休み
      ds.forEach(s => { if (!res[s.id][d]) res[s.id][d] = "休み"; });
    }

    // Step3後の修正パス：
    // ① 休みが目標より多い → シフトに戻す
    // ② 休みが目標より少ない → 追加（2連休制限を守る）
    // ③ 2連休超えが発生していたら勤務に戻す
    ds.forEach(s => {
      const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const kiboCount = Object.values(res[s.id]).filter(v => v === "希望休" || v === "有休").length;
      // 明け翌日の自動休みもkyukoDays内にカウント（target計算から除外しない）
      const target = Math.max(0, totalTarget - kiboCount);

      // ① 過多分をシフトに戻す（5連勤になる場合のみ保護）
      {
        const restDays = Object.entries(res[s.id])
          .filter(([, v]) => v === "休み")
          .map(([d]) => +d)
          .sort((a, b) => a - b);
        let excess = restDays.length - target;
        for (const d of restDays) {
          if (excess <= 0) break;
          if (res[s.id][d - 1] === "明け") continue;
          // この休みを削除すると5連勤超えになるなら保護
          const actualBefore = consecWork(s.id, d - 1);
          let actualAfter = 0;
          for (let i = d + 1; i <= days; i++) {
            if (WORK_TYPES.has(res[s.id][i])) actualAfter++; else break;
          }
          if (actualBefore + 1 + actualAfter > maxConsec) continue;
          const dayCnts = {};
          dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
          // まず通常の上限内で候補を探す
          let av = dayTypes.filter(k => dayCnts[k] < (maxStaff[k] ?? 99));
          if (s.role === "介護補助" || s.role === "介護助手") av = av.filter(k => k === "日勤");
          if (res[s.id][d - 1] === "遅番") av = av.filter(k => k !== "早番");
          // 上限内に候補がなければ日勤を強制（上限+1で割り当て）
          if (!av.length) {
            const forceShift = (s.role === "介護補助" || s.role === "介護助手") ? "日勤" :
              dayTypes.find(k => res[s.id][d - 1] !== "遅番" || k !== "早番") || "日勤";
            res[s.id][d] = forceShift; excess--;
            continue;
          }
          const pick = [...av].sort((a, b) => {
            const dA = Math.max(0, (dept.minStaff[a]||0) - dayCnts[a]);
            const dB = Math.max(0, (dept.minStaff[b]||0) - dayCnts[b]);
            if (dA !== dB) return dB - dA;
            return (PRIORITY[a]??3) - (PRIORITY[b]??3);
          })[0];
          res[s.id][d] = pick; excess--;
        }
      }

      // ② 不足分を追加（2連休制限・5連勤制限を守る）
      {
        // "休み"のみカウント（希望休・有休はtarget計算時に除外済み）
        const currentRest = Object.values(res[s.id]).filter(v => v === "休み").length;
        let shortage = target - currentRest;
        if (shortage > 0) {  // returnではなくifブロックで囲む → ③が必ず実行される
          const workDays = Object.entries(res[s.id])
            .filter(([, v]) => WORK_TYPES.has(v))
            .map(([d]) => +d)
            .filter(d => {
              if (res[s.id][d - 1] === "明け") return false;
              return canRest(s.id, d);
            })
            .sort((a, b) => {
              const sa = consecWork(s.id, a - 1);
              const sb = consecWork(s.id, b - 1);
              return sb - sa;
            });
          for (const d of workDays) {
            if (shortage <= 0) break;
            if (!canRest(s.id, d)) continue;
            res[s.id][d] = "休み"; shortage--;
          }
        }
      }

      // ③ 2連休超えを勤務に戻す
      for (let d = 1; d <= days; d++) {
        if (res[s.id][d] !== "休み") continue;
        if (res[s.id][d - 1] === "明け") continue;
        if (consecRest(s.id, d) <= 2) continue;
        if ((consecWork(s.id, d - 1) + 1) > maxConsec) continue;
        const fixCnts = {};
        dayTypes.forEach(k => { fixCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
        let av = dayTypes.filter(k => fixCnts[k] < (maxStaff[k] ?? 99));
        if (s.role === "介護補助" || s.role === "介護助手") av = av.filter(k => k === "日勤");
        if (!av.length) continue;
        const pick = [...av].sort((a, b) => fixCnts[a] - fixCnts[b])[0];
        res[s.id][d] = pick;
      }
    });
  }

  // 警告収集
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
  return { shifts: res, warnings };
}

// ─────────────────────────────────────────────
//  EXPORT HELPERS（共通データ生成）
// ─────────────────────────────────────────────
function buildCSV(depts, staffList, allShifts, year, month, selectedDepts) {
  const days = getDays(year, month);
  const rows = [];
  const header = ["部署","氏名","役職", ...Array.from({length:days},(_,i)=>i+1+"日"), "勤務計","夜勤","休日"];
  rows.push(header.join(","));
  depts.filter(d=>selectedDepts.includes(d.id)).forEach(dept => {
    const shifts = allShifts[dept.id] || {};
    staffList.filter(s=>s.dept===dept.id).forEach(s => {
      const cells = [dept.label, s.name, s.role];
      let workCnt=0, nightCnt=0, restCnt=0;
      for(let d=1;d<=days;d++){
        const v = shifts[s.id]?.[d]||"";
        cells.push(v);
        if(WORK_TYPES.has(v)) workCnt++;
        if(v==="夜勤") nightCnt++;
        if(REST_TYPES.has(v) && v !== "明け") restCnt++;
      }
      cells.push(workCnt, nightCnt, restCnt);
      rows.push(cells.map(c=>`"${c}"`).join(","));
    });
    rows.push("");
  });
  return "\uFEFF" + rows.join("\n");
}

function buildJSON(depts, staffList, allShifts, year, month, selectedDepts) {
  return JSON.stringify({
    year, month: month+1,
    exportedAt: new Date().toISOString(),
    depts: depts.filter(d=>selectedDepts.includes(d.id)).map(dept => ({
      id: dept.id, label: dept.label,
      staff: staffList.filter(s=>s.dept===dept.id).map(s => ({
        id: s.id, name: s.name, role: s.role,
        shifts: allShifts[dept.id]?.[s.id] || {}
      }))
    }))
  }, null, 2);
}

function buildPrintHTML(depts, staffList, allShifts, year, month, selectedDepts) {
  const days = getDays(year, month);
  const WD = ["日","月","火","水","木","金","土"];
  let html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>シフト表 ${year}年${month+1}月</title>
<style>
body{font-family:'Noto Sans JP',sans-serif;font-size:10px;margin:16px;color:#111;}
h2{font-size:13px;margin:14px 0 5px;}
table{border-collapse:collapse;width:100%;margin-bottom:20px;}
th,td{border:1px solid #ccc;padding:2px 3px;text-align:center;font-size:9px;white-space:nowrap;}
th{background:#e8f0fe;font-weight:bold;} .name{text-align:left;min-width:70px;}
.we{background:#fff0f6;} .早番{background:#fef3c7;color:#92400e;} .日勤{background:#dbeafe;color:#1e40af;}
.遅番{background:#ede9fe;color:#5b21b6;} .夜勤{background:#1e3a8a;color:#93c5fd;}
.明け{background:#f1f5f9;color:#64748b;} .休み{background:#dcfce7;color:#166534;}
.希望休{background:#fee2e2;color:#991b1b;} .有休{background:#fae8ff;color:#86198f;}
@media print{body{margin:4px;}h2{font-size:10px;}th,td{font-size:8px;padding:1px 2px;}}
</style></head><body>`;
  depts.filter(d=>selectedDepts.includes(d.id)).forEach(dept => {
    const shifts = allShifts[dept.id] || {};
    html += `<h2>${dept.icon} ${dept.label}　${year}年${month+1}月</h2><table><thead><tr><th class="name">氏名</th>`;
    for(let d=1;d<=days;d++){
      const wd=WD[new Date(year,month,d).getDay()];
      html += `<th class="${(wd==="日"||wd==="土")?"we":""}">${d}<br>${wd}</th>`;
    }
    html += `<th>勤務</th><th>夜勤</th><th>休</th></tr></thead><tbody>`;
    staffList.filter(s=>s.dept===dept.id).forEach(s => {
      let w=0,n=0,r=0;
      html += `<tr><td class="name">${s.name}</td>`;
      for(let d=1;d<=days;d++){
        const v=shifts[s.id]?.[d]||"";
        if(WORK_TYPES.has(v)) w++; if(v==="夜勤") n++; if(REST_TYPES.has(v) && v !== "明け") r++;
        html += `<td class="${v||""}">${SHIFTS[v]?.short||"－"}</td>`;
      }
      html += `<td>${w}</td><td>${n||"－"}</td><td>${r}</td></tr>`;
    });
    html += `</tbody></table>`;
  });
  return html + `</body></html>`;
}

function triggerDownload(content, filename, type) {
  // Artifact環境ではBlob URLダウンロードがブロックされるため
  // 新タブで開いて手動保存できるようにする
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    // ポップアップブロック時はdata URIで試みる
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// File System Access API を使ってOS標準の「名前を付けて保存」ダイアログを開く
// USB・任意フォルダへの直接保存が可能（Chrome/Edge対応、非対応ブラウザはフォールバック）
async function saveToFileSystem(content, suggestedName, type, ext) {
  // File System Access API が使えるか確認（Chrome/Edge対応）
  if (typeof window.showSaveFilePicker === "function") {
    const MIME_TO_ACCEPT = {
      "text/csv;charset=utf-8": { "text/csv": [".csv"] },
      "application/json":       { "application/json": [".json"] },
      "text/html;charset=utf-8": { "text/html": [".html"] },
    };
    const EXT_LABEL = { csv: "CSV ファイル", json: "JSON ファイル", html: "HTML ファイル" };
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: EXT_LABEL[ext] || "ファイル",
          accept: MIME_TO_ACCEPT[type] || { "text/plain": [`.${ext}`] },
        }],
      });
      const blob = new Blob([content], { type });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      // キャンセル時はエラー無視
      if (e.name === "AbortError") return false;
      throw e;
    }
  }
  // フォールバック：通常ダウンロード
  triggerDownload(content, suggestedName, type);
  return true;
}


// ─────────────────────────────────────────────
//  EXCEL SHIFT TREND IMPORT
// ─────────────────────────────────────────────
// Excelのシフト表を読み込んでスタッフごとのシフト傾向を解析する
// 期待フォーマット：1列目=氏名, 2列目以降=日付ごとのシフト（早番/日勤/遅番/夜勤/休み等）

function parseShiftExcel(workbook) {
  const SHIFT_MAP = {
    "早":"早番","早番":"早番","日":"日勤","日勤":"日勤",
    "遅":"遅番","遅番":"遅番","夜":"夜勤","夜勤":"夜勤",
    "明":"明け","明け":"明け","休":"休み","休み":"休み",
    "公":"休み","公休":"休み","有":"有休","有休":"有休","有給":"有休",
    "希":"希望休","希望休":"希望休",
    "E":"早番","D":"日勤","L":"遅番","N":"夜勤",
  };
  const REST_SET = new Set(["休み","有休","希望休"]);
  const SHIFT_SET = new Set(Object.keys(SHIFT_MAP));
  const COUNT_KEYS = ["早番","日勤","遅番","夜勤"];
  const trendMap = {};

  const processedYearMonths = new Set(); // 処理済みの「年-月」を記録して重複を防ぐ

  workbook.SheetNames.forEach(sheetName => {
    if (/祝日|holidays|calendar|カレンダー/i.test(sheetName)) return;

    // cellDates:true でDate型として取得（日付行検出用）
    const wsDates = workbook.Sheets[sheetName];
    const dataCellDates = window.XLSX.utils.sheet_to_json(wsDates, {
      header: 1, defval: "", cellDates: true, raw: false
    });
    const dataRaw = window.XLSX.utils.sheet_to_json(wsDates, {
      header: 1, defval: "", raw: true
    });

    if (!dataRaw || dataRaw.length < 3) return;

    // ① シフト値が5個以上ある行をデータ行として検出
    const sampleDataRows = dataRaw.filter(row =>
      row && row.filter(c => SHIFT_SET.has(String(c ?? "").trim())).length >= 5
    );
    if (sampleDataRows.length === 0) return;

    // ② シフト列の開始インデックスを検出
    let detectedShiftStart = -1;
    sampleDataRows.forEach(row => {
      row.forEach((cell, ci) => {
        if (SHIFT_SET.has(String(cell ?? "").trim()))
          if (detectedShiftStart === -1 || ci < detectedShiftStart)
            detectedShiftStart = ci;
      });
    });
    if (detectedShiftStart < 0) return;

    // ③ 氏名列を多数決で検出
    const nameColVotes = {};
    sampleDataRows.slice(0, 10).forEach(row => {
      for (let ci = 0; ci < detectedShiftStart; ci++) {
        const val = String(row[ci] ?? "").trim();
        if (val.length >= 2 && !/^\d/.test(val) && !SHIFT_SET.has(val))
          nameColVotes[ci] = (nameColVotes[ci] || 0) + 1;
      }
    });
    const votedNameCol = Object.entries(nameColVotes).sort((a,b) => b[1]-a[1])[0];
    if (!votedNameCol) return;
    const detectedNameCol = +votedNameCol[0];

    // ④ 列インデックス → 曜日（0=月〜6=日）のマップを構築
    // 方法A: dataCellDates から Date型セルが多い行を日付行として検出
    const colToDow = {};
    let sheetYearMonth = null;

    // まず行1から年月を取得（確実な情報源）
    let sy = null, sm = null;
    const row1Raw = dataRaw[0] || [];
    for (let ci = 0; ci < Math.min(row1Raw.length, 12); ci++) {
      const v = row1Raw[ci];
      if (typeof v === "number" && v >= 2000 && v <= 2100) sy = v;
      if (typeof v === "number" && v >= 1 && v <= 12 && sy && ci > 0) { sm = v; break; }
    }

    // 方法A: cellDates でDate型の行を探す
    let dateRowFound = false;
    for (const row of dataCellDates) {
      if (!row) continue;
      const dateCells = row
        .map((v, ci) => ({ ci, v }))
        .filter(({ v }) => v instanceof Date && !isNaN(v) && v.getFullYear() > 2000);
      if (dateCells.length >= 5) {
        dateCells.forEach(({ ci, v }) => {
          colToDow[ci] = (v.getDay() + 6) % 7;
        });
        const firstDate = dateCells[0].v;
        sheetYearMonth = `${firstDate.getFullYear()}-${firstDate.getMonth() + 1}`;
        dateRowFound = true;
        break;
      }
    }

    // 方法B: Date型が見つからない場合、年月 + 各列の日付を数値シリアル値から逆算
    if (!dateRowFound) {
      // SheetJSのシリアル値行（数値が45000〜50000程度の範囲）を探す
      for (const row of dataRaw) {
        if (!row) continue;
        const serialCells = row
          .map((v, ci) => ({ ci, v }))
          .filter(({ v }) => typeof v === "number" && v > 40000 && v < 55000);
        if (serialCells.length >= 5) {
          // ExcelシリアルをJSのDateに変換（Excel基準日: 1900/1/0 = JS -2209075200000ms）
          serialCells.forEach(({ ci, v }) => {
            const jsDate = new Date(Math.round((v - 25569) * 86400 * 1000));
            if (!isNaN(jsDate) && jsDate.getFullYear() > 2000) {
              colToDow[ci] = (jsDate.getDay() + 6) % 7;
              if (!sheetYearMonth) {
                sheetYearMonth = `${jsDate.getFullYear()}-${jsDate.getMonth() + 1}`;
              }
            }
          });
          if (Object.keys(colToDow).length >= 5) { dateRowFound = true; break; }
        }
      }
    }

    // 方法C: 年月情報から1日目の曜日を計算し、シフト開始列を1日目として割り当て
    if (!dateRowFound && sy && sm) {
      const startDow = (new Date(sy, sm - 1, 1).getDay() + 6) % 7;
      // 日付行の列位置を特定するため、行1-10で最も早い列（シフト開始列の近く）を探す
      // シフト開始列が1日目と仮定してマッピング
      for (let i = 0; i < 31; i++) {
        const col = detectedShiftStart + i;
        const d = new Date(sy, sm - 1, i + 1);
        if (d.getMonth() === sm - 1) { // 月をまたがない範囲
          colToDow[col] = (d.getDay() + 6) % 7;
        }
      }
      sheetYearMonth = `${sy}-${sm}`;
    }

    // 年月キーで重複チェック
    if (sheetYearMonth) {
      if (processedYearMonths.has(sheetYearMonth)) return;
      processedYearMonths.add(sheetYearMonth);
    } else {
      return; // 年月が特定できないシートはスキップ
    }

    // ⑤ データ行をパース
    dataRaw.forEach(row => {
      if (!row || row.length < detectedShiftStart + 3) return;
      const nameCell = String(row[detectedNameCol] ?? "").trim();
      if (!nameCell || nameCell.length < 2) return;
      if (/^[\d\s★\-＝=①②③◎●▲]/.test(nameCell)) return;
      if (["職員","名前","氏名","スタッフ","役職","担当"].includes(nameCell)) return;
      if (!isNaN(Number(nameCell))) return;
      if (/^\d{1,2}[\/月日]/.test(nameCell)) return;

      const counts = { 早番:0, 日勤:0, 遅番:0, 夜勤:0 };
      const dowRest = [0,0,0,0,0,0,0];
      const dowTotal = [0,0,0,0,0,0,0];
      let total = 0;

      for (let c = detectedShiftStart; c < Math.min(row.length, detectedShiftStart + 35); c++) {
        const cell = String(row[c] ?? "").trim();
        if (!cell) continue;
        const normalized = SHIFT_MAP[cell];
        if (!normalized) continue;

        // 列インデックスから曜日を取得（マップにない場合はスキップ）
        const dow = colToDow[c];
        if (dow !== undefined) {
          dowTotal[dow]++;
          if (REST_SET.has(normalized)) dowRest[dow]++;
        }

        if (COUNT_KEYS.includes(normalized)) { counts[normalized]++; total++; }
      }
      if (total < 3) return;

      if (!trendMap[nameCell])
        trendMap[nameCell] = {
          早番:0, 日勤:0, 遅番:0, 夜勤:0, total:0,
          dowRest:[0,0,0,0,0,0,0], dowTotal:[0,0,0,0,0,0,0]
        };
      COUNT_KEYS.forEach(k => { trendMap[nameCell][k] += counts[k]; });
      trendMap[nameCell].total += total;
      for (let i = 0; i < 7; i++) {
        trendMap[nameCell].dowRest[i] += dowRest[i];
        trendMap[nameCell].dowTotal[i] += dowTotal[i];
      }
    });
  });

  const result = {};
  Object.entries(trendMap).forEach(([name, counts]) => {
    if (counts.total < 3) return;
    const shiftTrend = {};
    COUNT_KEYS.forEach(k => { shiftTrend[k] = counts.total > 0 ? counts[k] / counts.total : 0; });
    const dowRestRate = counts.dowTotal.map((tot, i) =>
      tot > 0 ? counts.dowRest[i] / tot : null
    );
    result[name] = {
      ...shiftTrend,
      dowRestRate,
      _workTotal: counts.total,
    };
  });
  // 読み込んだ月一覧を付与（UIで表示するため）
  result._months = Array.from(processedYearMonths).sort();
  return result;
}



function ExcelImportModal({ onImport, onClose, currentTrend }) {
  const [status, setStatus] = useState("idle"); // idle | parsing | done | error
  const [preview, setPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("parsing");
    setErrorMsg("");
    try {
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: "array" });
      const trend = parseShiftExcel(wb);
      if (Object.keys(trend).length === 0) {
        setErrorMsg("シフトデータを読み取れませんでした。\n1列目に氏名、2列目以降に早番/日勤/遅番/夜勤などのシフトが入ったExcelを使用してください。");
        setStatus("error");
        return;
      }
      setPreview(trend);
      setStatus("done");
    } catch(err) {
      setErrorMsg("ファイルの読み込みに失敗しました: " + err.message);
      setStatus("error");
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#091525",border:"1px solid #1e3a5f",borderRadius:14,
        padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",
        boxShadow:"0 30px 80px #000"}}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{fontSize:15,fontWeight:900,color:"#e2e8f0",fontFamily:"'Noto Sans JP',sans-serif"}}>
              📊 過去シフトから傾向を学習
            </div>
            <div style={{fontSize:11,color:"#475569",marginTop:3}}>
              過去のExcelシフト表を読み込んで自動生成に反映
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:20}}>✕</button>
        </div>

        {/* 説明 */}
        <div style={{background:"#0d1a2e",borderRadius:8,padding:"10px 14px",
          border:"1px solid #1e293b",marginBottom:16,fontSize:11,color:"#64748b",lineHeight:1.7}}>
          <div style={{color:"#60a5fa",fontWeight:700,marginBottom:4}}>📋 対応Excelフォーマット</div>
          <div>• <b style={{color:"#94a3b8"}}>1列目</b>：スタッフ氏名</div>
          <div>• <b style={{color:"#94a3b8"}}>2列目以降</b>：シフト値（早番・日勤・遅番・夜勤・休み）</div>
          <div>• 複数シート・複数月のデータも一括読み込み可能</div>
          <div style={{marginTop:6,color:"#334155"}}>学習した傾向は「そのスタッフが多く入っていたシフト」を優先配置するヒントとして使用します。</div>
        </div>

        {/* 現在の傾向データ */}
        {currentTrend && Object.keys(currentTrend).length > 0 && (
          <div style={{background:"#0a2010",border:"1px solid #14532d",borderRadius:8,
            padding:"8px 12px",marginBottom:14,fontSize:11}}>
            <div style={{color:"#4ade80",fontWeight:700,marginBottom:4}}>
              ✅ 現在 {Object.keys(currentTrend).length} 名分の傾向データを保持中
            </div>
            <div style={{color:"#166534",fontSize:10}}>新しいファイルを読み込むと上書きされます</div>
          </div>
        )}

        {/* ファイル選択 */}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
          onChange={handleFile} style={{display:"none"}}/>
        <button onClick={()=>fileRef.current?.click()} style={{
          width:"100%",background:"linear-gradient(135deg,#1e40af,#6d28d9)",
          color:"#fff",border:"none",borderRadius:9,padding:"13px 0",
          cursor:"pointer",fontSize:14,fontWeight:800,
          fontFamily:"'Noto Sans JP',sans-serif",marginBottom:14,
          display:"flex",alignItems:"center",justifyContent:"center",gap:8
        }}>
          📂 Excelファイルを選択
        </button>

        {/* ステータス */}
        {status === "parsing" && (
          <div style={{textAlign:"center",color:"#60a5fa",padding:"16px 0",fontSize:13}}>
            ⏳ 解析中...
          </div>
        )}
        {status === "error" && (
          <div style={{background:"#3b0a0a",border:"1px solid #dc2626",borderRadius:8,
            padding:"10px 14px",color:"#f87171",fontSize:12,marginBottom:14,whiteSpace:"pre-wrap"}}>
            ❌ {errorMsg}
          </div>
        )}
        {status === "done" && preview && (
          <div>
            <div style={{color:"#4ade80",fontSize:13,fontWeight:700,marginBottom:6}}>
              ✅ {Object.keys(preview).filter(k=>k!=='_months').length} 名分のデータを読み込みました
            </div>
            {/* 読み込んだ月一覧 */}
            {preview._months && preview._months.length > 0 && (
              <div style={{
                background:"#0a2010",border:"1px solid #14532d",borderRadius:7,
                padding:"6px 12px",marginBottom:10,
                display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"
              }}>
                <span style={{fontSize:11,color:"#4ade80",fontWeight:700}}>📅 対象月:</span>
                {preview._months.map(ym => {
                  const [y, m] = ym.split("-");
                  return (
                    <span key={ym} style={{
                      background:"#14532d",borderRadius:5,padding:"2px 8px",
                      fontSize:11,color:"#86efac",fontWeight:700
                    }}>{y}年{m}月</span>
                  );
                })}
              </div>
            )}
            <div style={{maxHeight:240,overflowY:"auto",marginBottom:14}}>
              {Object.entries(preview).filter(([k]) => k !== '_months').map(([name, scores]) => {
                const WEEK = ["月","火","水","木","金","土","日"];
                const WEEK_COLOR = ["#94a3b8","#94a3b8","#94a3b8","#94a3b8","#94a3b8","#60a5fa","#f87171"];
                // 休み率が高い曜日トップ3を抽出
                const topRestDays = (scores.dowRestRate || [])
                  .map((rate, i) => ({ dow: i, rate: rate ?? 0, label: WEEK[i] }))
                  .filter(d => d.rate > 0)
                  .sort((a, b) => b.rate - a.rate)
                  .slice(0, 3);
                return (
                  <div key={name} style={{
                    background:"#0d1a2e",borderRadius:7,padding:"8px 12px",
                    marginBottom:6,border:"1px solid #1e293b"
                  }}>
                    <div style={{color:"#e2e8f0",fontSize:12,fontWeight:700,marginBottom:5}}>
                      {name}
                    </div>
                    {/* シフト傾向 */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:5}}>
                      {["早番","日勤","遅番","夜勤"].map(k => {
                        const pct = Math.round((scores[k]||0)*100);
                        if (pct === 0) return null;
                        const col = SHIFTS[k]?.color || "#94a3b8";
                        return (
                          <div key={k} style={{
                            background:`${col}18`,border:`1px solid ${col}40`,
                            borderRadius:5,padding:"2px 8px",
                            color:col,fontSize:11,fontWeight:700
                          }}>{k} {pct}%</div>
                        );
                      })}
                    </div>
                    {/* 曜日別休み傾向 */}
                    {topRestDays.length > 0 && (
                      <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,color:"#334155"}}>休み多い曜日:</span>
                        {topRestDays.map(d => (
                          <div key={d.dow} style={{
                            background:`${WEEK_COLOR[d.dow]}20`,
                            border:`1px solid ${WEEK_COLOR[d.dow]}50`,
                            borderRadius:5,padding:"1px 7px",
                            color:WEEK_COLOR[d.dow],fontSize:11,fontWeight:700
                          }}>{d.label} {Math.round(d.rate*100)}%</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>onImport(preview)} style={{
                flex:1,background:"linear-gradient(135deg,#065f46,#0f766e)",
                color:"#fff",border:"none",borderRadius:8,padding:"11px 0",
                cursor:"pointer",fontSize:14,fontWeight:800,
                fontFamily:"'Noto Sans JP',sans-serif"
              }}>✅ この傾向データを適用する</button>
              <button onClick={onClose} style={{
                flex:1,background:"#0d1a2e",color:"#475569",
                border:"1px solid #1e3a5f",borderRadius:8,padding:"11px 0",
                cursor:"pointer",fontSize:14
              }}>キャンセル</button>
            </div>
          </div>
        )}
        {status === "idle" && (
          <button onClick={onClose} style={{
            width:"100%",background:"#0d1a2e",color:"#475569",
            border:"1px solid #1e3a5f",borderRadius:8,padding:"11px 0",
            cursor:"pointer",fontSize:14
          }}>閉じる</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  BULK KYUKO MODAL（部署別一括休み設定）
// ─────────────────────────────────────────────
function BulkKyukoModal({ depts, staffList, year, month, onApply, onClose }) {
  const mk = monthKey(year, month);

  // 部署ごとのデフォルト値を現在のスタッフから取得
  const initValues = () => {
    const vals = {};
    depts.forEach(d => {
      const ds = staffList.filter(s => s.dept === d.id);
      if (ds.length === 0) return;
      // 部署の代表値（最初のスタッフの当月設定 or kyukoDays）
      const first = ds[0];
      vals[d.id] = first.kyukoDaysByMonth?.[mk] ?? first.kyukoDays ?? 8;
    });
    return vals;
  };
  const [values, setValues] = useState(initValues);

  const setVal = (deptId, v) =>
    setValues(prev => ({ ...prev, [deptId]: Math.max(0, Math.min(20, +v || 0)) }));

  return (
    <div style={{
      position:"fixed", inset:0, background:"#000000cc", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", padding:16
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background:"#091525", border:"1px solid #1e3a5f", borderRadius:14,
        padding:24, width:"100%", maxWidth:400,
        boxShadow:"0 30px 80px #000"
      }}>
        {/* ヘッダー */}
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
          <div>
            <div style={{fontSize:15, fontWeight:900, color:"#e2e8f0",
              fontFamily:"'Noto Sans JP',sans-serif"}}>📅 休み日数 一括設定</div>
            <div style={{fontSize:11, color:"#475569", marginTop:2}}>
              {year}年{month+1}月　※夜勤明け翌日の休みを含むカウント
            </div>
          </div>
          <button onClick={onClose} style={{background:"none", border:"none",
            color:"#475569", cursor:"pointer", fontSize:20}}>✕</button>
        </div>

        <div style={{fontSize:11, color:"#334155", marginBottom:16, marginTop:8,
          background:"#0d1a2e", borderRadius:7, padding:"8px 12px",
          border:"1px solid #1e293b"}}>
          💡 部署ごとに設定した日数を、その部署の全スタッフに一括適用します。
          個人設定は上書きされますが、後からスタッフ個別に変更可能です。
        </div>

        {/* 部署ごとの設定 */}
        <div style={{display:"flex", flexDirection:"column", gap:10, marginBottom:20}}>
          {depts.map(d => {
            const cnt = staffList.filter(s => s.dept === d.id).length;
            if (cnt === 0) return null;
            return (
              <div key={d.id} style={{
                display:"flex", alignItems:"center", gap:12,
                background:"#0d1a2e", borderRadius:9, padding:"10px 14px",
                border:"1px solid #1e3a5f"
              }}>
                <span style={{fontSize:20}}>{d.icon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13, fontWeight:800, color:"#e2e8f0",
                    fontFamily:"'Noto Sans JP',sans-serif"}}>{d.label}</div>
                  <div style={{fontSize:10, color:"#334155"}}>{cnt}名</div>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:6}}>
                  <button onClick={() => setVal(d.id, (values[d.id] || 8) - 1)}
                    style={{
                      background:"#1e293b", border:"1px solid #334155", borderRadius:6,
                      color:"#94a3b8", cursor:"pointer", width:28, height:28,
                      fontSize:16, fontWeight:800, lineHeight:1
                    }}>−</button>
                  <input
                    type="number" value={values[d.id] ?? 8} min={0} max={20}
                    onChange={e => setVal(d.id, e.target.value)}
                    style={{
                      width:48, background:"#060d18", border:"1px solid #1e3a5f",
                      borderRadius:6, color:"#60a5fa", fontSize:16, fontWeight:800,
                      textAlign:"center", padding:"4px 0",
                      fontFamily:"'Noto Sans JP',sans-serif", outline:"none"
                    }}
                  />
                  <button onClick={() => setVal(d.id, (values[d.id] || 8) + 1)}
                    style={{
                      background:"#1e293b", border:"1px solid #334155", borderRadius:6,
                      color:"#94a3b8", cursor:"pointer", width:28, height:28,
                      fontSize:16, fontWeight:800, lineHeight:1
                    }}>＋</button>
                  <span style={{fontSize:11, color:"#334155", minWidth:14}}>日</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{display:"flex", gap:10}}>
          <button onClick={() => onApply(values, mk)} style={{
            flex:1, background:"linear-gradient(135deg,#1e40af,#6d28d9)",
            color:"#fff", border:"none", borderRadius:8, padding:"11px 0",
            cursor:"pointer", fontSize:14, fontWeight:800,
            fontFamily:"'Noto Sans JP',sans-serif"
          }}>✅ 適用する</button>
          <button onClick={onClose} style={{
            flex:1, background:"#0d1a2e", color:"#475569",
            border:"1px solid #1e3a5f", borderRadius:8, padding:"11px 0",
            cursor:"pointer", fontSize:14
          }}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
function DownloadModal({ depts, staffList, allShifts, year, month, activeDeptId, onClose }) {
  const [selectedDepts, setSelectedDepts] = useState([activeDeptId]);
  const [step, setStep] = useState("app"); // "app" | "format"
  const [selectedApp, setSelectedApp] = useState(null);

  const toggleDept = (id) => setSelectedDepts(prev =>
    prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]
  );
  const noSelection = selectedDepts.length === 0;
  const fname = `シフト表_${year}年${month+1}月`;

  // アプリ定義
  const APPS = [
    {
      id:"usb", icon:"💾", label:"USB・ファイルに保存",
      sub:"USBや任意フォルダに直接保存（名前を付けて保存）", color:"#fbbf24", border:"#78350f", bg:"#1c1008",
      formats:[
        {id:"csv", label:"CSV (.csv) ― Excelで開ける",  ext:"csv",  type:"text/csv;charset=utf-8"},
        {id:"json",label:"JSON (.json) ― バックアップ用", ext:"json", type:"application/json"},
        {id:"html",label:"印刷用HTML (.html)",           ext:"html", type:"text/html;charset=utf-8"},
      ]
    },
    {
      id:"excel", icon:"📗", label:"Excel",
      sub:"Windowsのエクセルで開く", color:"#34d399", border:"#064e3b", bg:"#022c22",
      formats:[{id:"csv",label:"CSV (.csv)",ext:"csv",type:"text/csv;charset=utf-8"}]
    },
    {
      id:"gsheet", icon:"📊", label:"Googleスプレッドシート",
      sub:"ブラウザのスプレッドシートで開く", color:"#4ade80", border:"#14532d", bg:"#052e16",
      formats:[{id:"csv",label:"CSV (.csv)",ext:"csv",type:"text/csv;charset=utf-8"}]
    },
    {
      id:"print", icon:"🖨️", label:"印刷（紙のシフト表）",
      sub:"ブラウザで開いてそのまま印刷", color:"#60a5fa", border:"#1e3a5f", bg:"#0c2340",
      formats:[{id:"html",label:"HTML (.html)",ext:"html",type:"text/html;charset=utf-8"}]
    },
    {
      id:"kintone", icon:"🔵", label:"kintone / 勤怠システム",
      sub:"CSV取り込みに対応したシステム向け", color:"#38bdf8", border:"#0c4a6e", bg:"#082f49",
      formats:[{id:"csv",label:"CSV (.csv)",ext:"csv",type:"text/csv;charset=utf-8"}]
    },
    {
      id:"backup", icon:"💾", label:"バックアップ／他アプリ連携",
      sub:"JSONデータとして保存・Phase 3連携用", color:"#a78bfa", border:"#2e1065", bg:"#1e0a40",
      formats:[{id:"json",label:"JSON (.json)",ext:"json",type:"application/json"}]
    },
    {
      id:"custom", icon:"⚙️", label:"その他（形式を選ぶ）",
      sub:"CSV・HTML・JSONから選択", color:"#94a3b8", border:"#334155", bg:"#0f172a",
      formats:[
        {id:"csv",label:"CSV (.csv)",ext:"csv",type:"text/csv;charset=utf-8"},
        {id:"html",label:"印刷用HTML (.html)",ext:"html",type:"text/html;charset=utf-8"},
        {id:"json",label:"JSON (.json)",ext:"json",type:"application/json"},
      ]
    },
  ];

  const handleDownload = (fmt) => {
    if (noSelection) return;
    let content = "";
    if (fmt.ext==="csv")  content = buildCSV(depts, staffList, allShifts, year, month, selectedDepts);
    if (fmt.ext==="json") content = buildJSON(depts, staffList, allShifts, year, month, selectedDepts);
    if (fmt.ext==="html") content = buildPrintHTML(depts, staffList, allShifts, year, month, selectedDepts);
    const filename = `${fname}.${fmt.ext}`;
    if (selectedApp === "usb") {
      saveToFileSystem(content, filename, fmt.type, fmt.ext);
    } else {
      triggerDownload(content, filename, fmt.type);
    }
  };

  const app = APPS.find(a=>a.id===selectedApp);

  return (
    <div style={{
      position:"fixed",inset:0,background:"#000000cc",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16
    }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{
        background:"#0a1525",border:"1px solid #1e3a5f",borderRadius:14,
        padding:24,width:"100%",maxWidth:440,
        boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"
      }}>
        {/* ヘッダー */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {step==="format" && (
              <button onClick={()=>setStep("app")} style={{
                background:"#0d1a2e",border:"1px solid #1e3a5f",borderRadius:6,
                color:"#64748b",cursor:"pointer",fontSize:13,padding:"3px 8px"
              }}>◀</button>
            )}
            <div>
              <div style={{fontSize:15,fontWeight:900,color:"#e2e8f0",
                fontFamily:"'Noto Sans JP',sans-serif"}}>
                {step==="app" ? "📤 シフトを使う" : `📤 ${app?.label}`}
              </div>
              <div style={{fontSize:11,color:"#475569",marginTop:2}}>{year}年{month+1}月</div>
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",
            color:"#475569",cursor:"pointer",fontSize:20}}>✕</button>
        </div>

        {/* 部署選択（常時表示） */}
        <div style={{fontSize:11,color:"#1e3a5f",fontWeight:700,marginBottom:8,letterSpacing:"0.08em"}}>
          ▍ 対象部署
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:18}}>
          {depts.map(d => {
            const sel = selectedDepts.includes(d.id);
            return (
              <button key={d.id} onClick={()=>toggleDept(d.id)} style={{
                background:sel?"#1e3a5f":"transparent",
                color:sel?"#60a5fa":"#334155",
                border:`1px solid ${sel?"#3b82f6":"#1e293b"}`,
                borderRadius:7,padding:"4px 10px",cursor:"pointer",
                fontSize:11,fontWeight:sel?700:400,
                display:"flex",alignItems:"center",gap:4,
              }}>
                <span>{d.icon}</span><span>{d.label}</span>
              </button>
            );
          })}
        </div>
        {noSelection && (
          <div style={{fontSize:11,color:"#ef4444",marginBottom:10}}>⚠ 部署を1つ以上選択してください</div>
        )}

        {/* STEP 1: アプリ選択 */}
        {step==="app" && (
          <>
            <div style={{fontSize:11,color:"#1e3a5f",fontWeight:700,marginBottom:10,letterSpacing:"0.08em"}}>
              ▍ どのアプリで使いますか？
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {APPS.map(a => (
                <button key={a.id} onClick={()=>{
                  if(noSelection) return;
                  setSelectedApp(a.id);
                  // 形式が1つしかない場合はそのままダウンロード
                  if(a.formats.length===1){ handleDownload(a.formats[0]); }
                  else setStep("format");
                }} style={{
                  background:a.bg, border:`1px solid ${a.border}`,
                  borderRadius:10, padding:"11px 14px", cursor:noSelection?"not-allowed":"pointer",
                  display:"flex",alignItems:"center",gap:12,textAlign:"left",
                  opacity:noSelection?0.4:1, transition:"opacity 0.15s",
                }}
                  onMouseEnter={e=>{ if(!noSelection) e.currentTarget.style.opacity="0.75"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.opacity=noSelection?"0.4":"1"; }}
                >
                  <span style={{fontSize:22,lineHeight:1}}>{a.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:800,color:a.color,
                      fontFamily:"'Noto Sans JP',sans-serif"}}>{a.label}</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:1}}>{a.sub}</div>
                  </div>
                  <span style={{color:a.color,fontSize:14}}>
                    {a.formats.length===1?"↓":"▶"}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* STEP 2: 形式選択（custom or 複数形式のアプリのみ） */}
        {step==="format" && app && (
          <>
            <div style={{fontSize:11,color:"#1e3a5f",fontWeight:700,marginBottom:10,letterSpacing:"0.08em"}}>
              ▍ ファイル形式を選択
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {app.formats.map(fmt => (
                <button key={fmt.id} onClick={()=>handleDownload(fmt)} style={{
                  background:"#0d1a2e", border:`1px solid ${app.border}`,
                  borderRadius:10, padding:"12px 16px", cursor:"pointer",
                  display:"flex",alignItems:"center",gap:12,textAlign:"left",
                  transition:"opacity 0.15s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.opacity="0.75"}
                  onMouseLeave={e=>e.currentTarget.style.opacity="1"}
                >
                  <span style={{fontSize:20}}>
                    {fmt.ext==="csv"?"📊":fmt.ext==="html"?"🖨️":"💾"}
                  </span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:800,color:app.color,
                      fontFamily:"'Noto Sans JP',sans-serif"}}>{fmt.label}</div>
                  </div>
                  <span style={{color:app.color,fontSize:14}}>↓</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  GENERATE WARNING MODAL
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  CLEAR MODAL（シフトクリア確認）
// ─────────────────────────────────────────────
function ClearModal({ deptLabel, onClearDept, onClearAll, onClose }) {
  return (
    <div style={{
      position:"fixed",inset:0,background:"#000000cc",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16
    }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{
        background:"#091525",border:"1px solid #450a0a",borderRadius:14,
        padding:24,width:"100%",maxWidth:360,
        boxShadow:"0 30px 80px #000"
      }}>
        <div style={{fontSize:15,fontWeight:900,color:"#f87171",marginBottom:6}}>
          🗑 シフトのクリア
        </div>
        <div style={{fontSize:12,color:"#64748b",marginBottom:20}}>
          クリアする範囲を選んでください。この操作は元に戻せません。
        </div>

        {/* このフロアのみ */}
        <button onClick={onClearDept} style={{
          width:"100%",background:"#1a0a0a",border:"1px solid #7f1d1d",
          borderRadius:9,padding:"14px 16px",cursor:"pointer",marginBottom:10,
          display:"flex",alignItems:"center",gap:12,textAlign:"left"
        }}>
          <span style={{fontSize:22}}>🏠</span>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#fca5a5"}}>
              {deptLabel} のみクリア
            </div>
            <div style={{fontSize:11,color:"#7f1d1d",marginTop:2}}>
              現在表示中のフロアのシフトだけ削除
            </div>
          </div>
        </button>

        {/* 全部署 */}
        <button onClick={onClearAll} style={{
          width:"100%",background:"#1a0808",border:"1px solid #991b1b",
          borderRadius:9,padding:"14px 16px",cursor:"pointer",marginBottom:18,
          display:"flex",alignItems:"center",gap:12,textAlign:"left"
        }}>
          <span style={{fontSize:22}}>🏢</span>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#ef4444"}}>
              全部署をクリア
            </div>
            <div style={{fontSize:11,color:"#991b1b",marginTop:2}}>
              すべてのフロアのシフトを削除
            </div>
          </div>
        </button>

        <button onClick={onClose} style={{
          width:"100%",background:"#0d1a2e",color:"#475569",
          border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 0",
          cursor:"pointer",fontSize:13
        }}>キャンセル</button>
      </div>
    </div>
  );
}

function GenerateWarningModal({ warnings, deptLabel, year, month, onClose }) {
  const entries = Object.entries(warnings);
  const days = new Date(year, month + 1, 0).getDate();

  return (
    <div style={{
      position:"fixed", inset:0, background:"#000000cc", zIndex:300,
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
    }}>
      <div style={{
        background:"#0d1525", border:"1px solid #7f1d1d",
        borderRadius:14, padding:28, width:"100%", maxWidth:440,
        boxShadow:"0 30px 80px #000, 0 0 0 1px #ef444420",
      }}>
        {/* ヘッダー */}
        <div style={{display:"flex", alignItems:"flex-start", gap:14, marginBottom:22}}>
          <div style={{
            width:44, height:44, borderRadius:10, flexShrink:0,
            background:"#3b0a0a", border:"1px solid #ef4444",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
          }}>⚠️</div>
          <div>
            <div style={{fontSize:15, fontWeight:900, color:"#fca5a5",
              fontFamily:"'Noto Sans JP',sans-serif", marginBottom:4}}>
              人員不足の警告
            </div>
            <div style={{fontSize:12, color:"#64748b", fontFamily:"'Noto Sans JP',sans-serif"}}>
              {deptLabel} ／ {year}年{month+1}月
            </div>
          </div>
        </div>

        {/* 説明 */}
        <div style={{
          background:"#1a0808", border:"1px solid #7f1d1d", borderRadius:8,
          padding:"10px 14px", marginBottom:18, fontSize:12,
          color:"#fca5a5", fontFamily:"'Noto Sans JP',sans-serif", lineHeight:1.7,
        }}>
          以下のシフト種別で、設定した最低配置人数を達成できない日が発生しました。
          スタッフ数または最低人数の設定を見直してください。
        </div>

        {/* 不足シフト一覧 */}
        <div style={{display:"flex", flexDirection:"column", gap:8, marginBottom:22}}>
          {entries.map(([shiftKey, info]) => {
            const s = SHIFTS[shiftKey] || {};
            const pct = Math.round(info.days / days * 100);
            return (
              <div key={shiftKey} style={{
                background:"#0a1525", border:`1px solid ${s.border||"#334155"}`,
                borderRadius:9, padding:"10px 14px",
                display:"flex", alignItems:"center", gap:12,
              }}>
                <ShiftBadge type={shiftKey} />
                <div style={{flex:1}}>
                  <div style={{
                    fontSize:13, fontWeight:800, color:s.color||"#94a3b8",
                    fontFamily:"'Noto Sans JP',sans-serif",
                  }}>
                    {shiftKey}
                  </div>
                  <div style={{fontSize:11, color:"#475569", marginTop:2}}>
                    不足日数：<span style={{color:"#f87171", fontWeight:700}}>{info.days}日</span>
                    　最大 <span style={{color:"#f87171", fontWeight:700}}>−{info.maxShort}名</span> 不足
                  </div>
                </div>
                {/* 棒グラフ */}
                <div style={{width:80}}>
                  <div style={{
                    height:6, background:"#1e293b", borderRadius:3, overflow:"hidden",
                  }}>
                    <div style={{
                      height:"100%", borderRadius:3,
                      width:`${pct}%`,
                      background: pct > 50 ? "#ef4444" : pct > 20 ? "#f59e0b" : "#f87171",
                      transition:"width 0.4s",
                    }}/>
                  </div>
                  <div style={{fontSize:10, color:"#475569", marginTop:3, textAlign:"right"}}>
                    {pct}%の日で不足
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 対策メモ */}
        <div style={{
          fontSize:11, color:"#334155", fontFamily:"'Noto Sans JP',sans-serif",
          lineHeight:1.8, marginBottom:20,
        }}>
          💡 対策：① スタッフを追加する　② 部署設定の最低人数を下げる<br/>
          　　　　　③ 自動生成後に手動で調整する
        </div>

        <button onClick={onClose} style={{
          width:"100%", background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",
          color:"#fff", border:"none", borderRadius:8, padding:"11px 0",
          cursor:"pointer", fontSize:14, fontWeight:800,
          fontFamily:"'Noto Sans JP',sans-serif",
        }}>
          確認しました（シフト表を確認する）
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  CONTEXT MENU
// ─────────────────────────────────────────────
function ContextMenu({ x, y, onSelect, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if(ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Clamp to viewport
  const [pos, setPos] = useState({x,y});
  useEffect(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    setPos({ x: Math.min(x, vw-200), y: Math.min(y, vh-320) });
  }, [x,y]);

  return (
    <div ref={ref} style={{
      position:"fixed", left:pos.x, top:pos.y, zIndex:999,
      background:"#0d1e35", border:"1px solid #1e3a5f", borderRadius:10,
      padding:6, boxShadow:"0 12px 40px #000a",
      display:"grid", gridTemplateColumns:"1fr 1fr", gap:3, minWidth:170,
    }}>
      {SHIFT_KEYS.map(k => {
        const s = SHIFTS[k];
        return (
          <button key={k||"empty"} onClick={()=>onSelect(k)} style={{
            background:s.bg||"#0d1e35", color:s.color, border:`1px solid ${s.border}`,
            borderRadius:6, padding:"5px 8px", cursor:"pointer",
            fontSize:12, fontWeight:700, fontFamily:"'Noto Sans JP',sans-serif",
            display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap",
          }}>
            <span style={{
              minWidth:18, height:18, background:k?s.bg:"transparent",
              borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:11, fontWeight:800
            }}>{s.short}</span>
            <span style={{fontSize:11, color:"#94a3b8"}}>{k||"クリア"}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
//  SHIFT BADGE (table cell)
// ─────────────────────────────────────────────
function ShiftBadge({ type }) {
  const s = SHIFTS[type]||SHIFTS[""];
  if (!type) return <span style={{color:"#1e3a5f",fontSize:10}}>－</span>;
  return (
    <span style={{
      background:s.bg, color:s.color, border:`1px solid ${s.border}`,
      borderRadius:3, padding:"1px 4px", fontSize:10, fontWeight:800,
      fontFamily:"'Noto Sans JP',sans-serif", display:"inline-block",
      minWidth:22, textAlign:"center", lineHeight:"18px",
    }}>{s.short}</span>
  );
}

// ─────────────────────────────────────────────
//  KIBO CALENDAR（希望休 ＋ シフト希望）
//  selected      : [day, ...]           希望休の日付リスト
//  shiftRequests : { day: shiftKey }    シフト希望 { 5:"早番", 12:"夜勤" }
// ─────────────────────────────────────────────
const SHIFT_REQ_TYPES = ["早番","日勤","遅番","夜勤","休み","有休"];

function KiboCalendar({ year, month, selected, onChange, shiftRequests, onShiftRequests, deptId }) {
  const days = getDays(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i=0; i<firstDow; i++) cells.push(null);
  for (let d=1; d<=days; d++) cells.push(d);

  // 部署で使えるシフト種別のみ表示
  const dept = DEFAULT_DEPTS.find(d=>d.id===deptId);
  const availableReqTypes = SHIFT_REQ_TYPES.filter(k => k === "休み" || k === "有休" || dept?.shiftTypes.includes(k));

  const toggleKibo = (d) => {
    if (!d) return;
    // 希望休にすると同日のシフト希望は消す
    const isKibo = selected.includes(d);
    const next = isKibo ? selected.filter(x=>x!==d) : [...selected, d];
    if (!isKibo) {
      const newReq = { ...shiftRequests };
      delete newReq[d];
      onShiftRequests(newReq);
    }
    onChange(next);
  };

  const setShiftReq = (d, shiftKey) => {
    // シフト希望を設定したら希望休から外す
    const newKibo = selected.filter(x => x !== d);
    if (newKibo.length !== selected.length) onChange(newKibo);
    const newReq = { ...shiftRequests };
    if (newReq[d] === shiftKey) {
      delete newReq[d]; // 同じシフトをもう一度押したらキャンセル
    } else {
      newReq[d] = shiftKey;
    }
    onShiftRequests(newReq);
  };

  const clearAll = () => { onChange([]); onShiftRequests({}); };

  const kiboCount = selected.length;
  const reqCount = Object.keys(shiftRequests).length;

  return (
    <div>
      {/* カレンダーグリッド */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["日","月","火","水","木","金","土"].map((w,i)=>(
          <div key={w} style={{textAlign:"center",fontSize:10,
            color:i===0?"#f87171":i===6?"#60a5fa":"#475569",padding:"2px 0"}}>{w}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:10}}>
        {cells.map((d,i) => {
          if (!d) return <div key={i}/>;
          const isKibo = selected.includes(d);
          const reqShift = shiftRequests[d];
          const dow = (firstDow+d-1)%7;
          const we = dow===0||dow===6;
          const s = reqShift ? SHIFTS[reqShift] : null;
          return (
            <button key={d} onClick={()=>toggleKibo(d)} style={{
              background: isKibo?"#3b0a0a": reqShift ? s.bg : "transparent",
              border: isKibo?"1px solid #dc2626": reqShift ? `1px solid ${s.border}` : "1px solid #1e3a5f",
              borderRadius:5, padding:"3px 1px", cursor:"pointer",
              color: isKibo?"#f87171": reqShift ? s.color : we?"#60a5fa":"#64748b",
              fontSize:10, fontWeight:(isKibo||reqShift)?800:400,
              fontFamily:"'Noto Sans JP',sans-serif",
              display:"flex",flexDirection:"column",alignItems:"center",gap:1,
              minHeight:32,
            }}>
              <span>{d}</span>
              {isKibo && <span style={{fontSize:8,lineHeight:1}}>希休</span>}
              {reqShift && <span style={{fontSize:8,lineHeight:1}}>{SHIFTS[reqShift].short}</span>}
            </button>
          );
        })}
      </div>

      {/* シフト希望セクション */}
      {availableReqTypes.length > 0 && (
        <div style={{borderTop:"1px solid #1e3a5f",paddingTop:10,marginTop:2}}>
          <div style={{fontSize:11,color:"#475569",marginBottom:8,fontFamily:"'Noto Sans JP',sans-serif"}}>
            シフト希望：日付をタップ→シフトを選択
          </div>

          {/* シフト希望リスト */}
          {Object.keys(shiftRequests).length > 0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
              {Object.entries(shiftRequests)
                .sort(([a],[b])=>+a-+b)
                .map(([day, shiftKey]) => {
                  const s = SHIFTS[shiftKey];
                  return (
                    <div key={day} style={{
                      display:"flex",alignItems:"center",gap:4,
                      background:s.bg, border:`1px solid ${s.border}`,
                      borderRadius:6, padding:"3px 8px",
                    }}>
                      <span style={{fontSize:11,color:"#94a3b8"}}>{day}日</span>
                      <ShiftBadge type={shiftKey}/>
                      <button onClick={()=>setShiftReq(+day, shiftKey)} style={{
                        background:"none",border:"none",color:"#475569",
                        cursor:"pointer",fontSize:12,lineHeight:1,padding:0
                      }}>✕</button>
                    </div>
                  );
                })}
            </div>
          )}

          {/* 日付ごとにシフト選択ボタン */}
          <div style={{
            background:"#080f1c",borderRadius:8,padding:10,
            border:"1px solid #1e293b",
          }}>
            <div style={{fontSize:10,color:"#334155",marginBottom:8}}>
              希望シフトを追加：日付を選んでシフト種別をタップ
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
              {availableReqTypes.map(k=>{
                const s=SHIFTS[k];
                return (
                  <span key={k} style={{
                    background:s.bg,color:s.color,border:`1px solid ${s.border}`,
                    borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:800,
                  }}>{k}</span>
                );
              })}
              <span style={{fontSize:10,color:"#334155"}}>← 下のボタンで追加</span>
            </div>
            {/* 日付ごとのシフト選択行 */}
            <div style={{maxHeight:160,overflowY:"auto"}}>
              {Array.from({length:getDays(year,month)},(_,i)=>i+1).map(d=>{
                const isKibo = selected.includes(d);
                const cur = shiftRequests[d];
                if (isKibo) return null; // 希望休の日はスキップ
                return (
                  <div key={d} style={{
                    display:"flex",alignItems:"center",gap:6,
                    padding:"3px 0",borderBottom:"1px solid #0d1525"
                  }}>
                    <span style={{
                      fontSize:11,color:"#475569",minWidth:32,
                      fontFamily:"'Noto Sans JP',sans-serif"
                    }}>{d}日</span>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {availableReqTypes.map(k=>{
                        const s=SHIFTS[k];
                        const active = cur===k;
                        return (
                          <button key={k} onClick={()=>setShiftReq(d,k)} style={{
                            background:active?s.bg:"transparent",
                            color:active?s.color:"#334155",
                            border:`1px solid ${active?s.border:"#1e293b"}`,
                            borderRadius:4,padding:"2px 7px",cursor:"pointer",
                            fontSize:10,fontWeight:active?800:400,
                            fontFamily:"'Noto Sans JP',sans-serif",
                          }}>{k}</button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 集計 */}
      <div style={{marginTop:10,fontSize:11,color:"#475569",display:"flex",gap:12,alignItems:"center"}}>
        <span>希望休：<span style={{color:"#f87171",fontWeight:700}}>{kiboCount}日</span></span>
        <span>シフト希望：<span style={{color:"#60a5fa",fontWeight:700}}>{reqCount}件</span></span>
        {(kiboCount>0||reqCount>0) && (
          <button onClick={clearAll} style={{
            background:"none",border:"none",color:"#ef4444",
            cursor:"pointer",fontSize:11,marginLeft:"auto"
          }}>全クリア</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  STAFF MODAL
// ─────────────────────────────────────────────
function StaffModal({ data, deptId, year, month, onSave, onClose }) {
  const isNew = !data;
  const mk = monthKey(year, month);
  const [form, setForm] = useState(() => {
    const base = data ? { ...data } : {
      name:"", role:(ROLES_BY_DEPT[deptId]||["職員"])[0],
      nightOk:["kaigo1","kaigo2"].includes(deptId),
      nightMax:5, targetWork:20, kyukoDays:8,
      kiboByMonth:{}, shiftRequestsByMonth:{},
    };
    // 既存スタッフにshiftRequestsByMonthがない場合の安全対策
    if (!base.kiboByMonth) base.kiboByMonth = {};
    if (!base.shiftRequestsByMonth) base.shiftRequestsByMonth = {};
    if (!base.kyukoDaysByMonth) base.kyukoDaysByMonth = {};
    return base;
  });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const kiboSelected = form.kiboByMonth?.[mk] || [];
  const setKibo = (days) => set("kiboByMonth",{...(form.kiboByMonth||{}),[mk]:days});
  const shiftRequests = form.shiftRequestsByMonth?.[mk] || {};
  const setShiftRequests = (reqs) => set("shiftRequestsByMonth",{...(form.shiftRequestsByMonth||{}),[mk]:reqs});
  // 当月の休み日数（月別設定 → なければデフォルト値を使用）
  const kyukoThisMonth = form.kyukoDaysByMonth?.[mk] ?? form.kyukoDays ?? 8;
  const setKyukoThisMonth = (v) => set("kyukoDaysByMonth", {...(form.kyukoDaysByMonth||{}), [mk]: +v});

  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{
        background:"#091525",border:"1px solid #1e3a5f",borderRadius:14,
        padding:24,width:"100%",maxWidth:460,
        boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#e2e8f0",fontSize:15,fontWeight:900,
            fontFamily:"'Noto Sans JP',sans-serif"}}>
            {isNew?"スタッフ追加":"スタッフ編集"}
          </h3>
          <button onClick={onClose} style={{background:"none",border:"none",
            color:"#475569",cursor:"pointer",fontSize:20,lineHeight:1}}>✕</button>
        </div>

        {/* 基本情報 */}
        <div style={{fontSize:11,color:"#1e3a5f",fontWeight:700,marginBottom:10,letterSpacing:"0.1em"}}>
          ▍ 基本情報
        </div>
        {[["氏名","name","text"],["役職","role","select"]].map(([label,key,type])=>(
          <div key={key} style={{marginBottom:12}}>
            <div style={{color:"#475569",fontSize:11,marginBottom:4}}>{label}</div>
            {type==="select"
              ? <select value={form[key]} onChange={e=>set(key,e.target.value)} style={INPUT_STYLE}>
                  {(ROLES_BY_DEPT[deptId]||["職員"]).map(r=><option key={r}>{r}</option>)}
                </select>
              : <input type="text" value={form[key]} onChange={e=>set(key,e.target.value)}
                  style={INPUT_STYLE} placeholder={`例：田中 花子`}/>
            }
          </div>
        ))}

        {/* 勤務設定 */}
        <div style={{fontSize:11,color:"#1e3a5f",fontWeight:700,marginBottom:10,
          marginTop:16,letterSpacing:"0.1em"}}>▍ 勤務設定</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div>
            <div style={{color:"#475569",fontSize:11,marginBottom:4}}>目標勤務日数</div>
            <input type="number" value={form.targetWork} min={1} max={31}
              onChange={e=>set("targetWork",+e.target.value)} style={INPUT_STYLE}/>
          </div>
          <div>
            <div style={{color:"#60a5fa",fontSize:11,marginBottom:4,fontWeight:700}}>
              {year}年{month+1}月の休み日数
            </div>
            <input type="number" value={kyukoThisMonth} min={0} max={20}
              onChange={e=>setKyukoThisMonth(e.target.value)}
              style={{...INPUT_STYLE, color:"#60a5fa", fontWeight:800}}/>
            <div style={{fontSize:10,color:"#334155",marginTop:3}}>
              夜勤明け翌日の休みも含むカウント
            </div>
          </div>
        </div>

        {/* 夜勤設定 */}
        {["kaigo1","kaigo2"].includes(deptId) && (
          <div style={{marginBottom:14}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:10}}>
              <input type="checkbox" checked={!!form.nightOk}
                onChange={e=>set("nightOk",e.target.checked)}
                style={{width:15,height:15,accentColor:"#3b82f6"}}/>
              <span style={{color:"#94a3b8",fontSize:13,fontFamily:"'Noto Sans JP',sans-serif"}}>
                夜勤対応可
              </span>
            </label>
            {form.nightOk && (
              <div>
                <div style={{color:"#475569",fontSize:11,marginBottom:4}}>夜勤 月間上限回数</div>
                <input type="number" value={form.nightMax} min={0} max={15}
                  onChange={e=>set("nightMax",+e.target.value)} style={{...INPUT_STYLE,width:80}}/>
              </div>
            )}
          </div>
        )}

        {/* 希望休 ＆ シフト希望カレンダー */}
        <div style={{fontSize:11,color:"#1e3a5f",fontWeight:700,marginBottom:10,
          marginTop:4,letterSpacing:"0.1em"}}>▍ {year}年{month+1}月 希望休 ／ シフト希望</div>
        <div style={{background:"#0d1a2e",borderRadius:8,padding:12,border:"1px solid #1e3a5f"}}>
          <KiboCalendar
            year={year} month={month}
            selected={kiboSelected} onChange={setKibo}
            shiftRequests={shiftRequests} onShiftRequests={setShiftRequests}
            deptId={deptId}
          />
        </div>

        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={()=>form.name&&onSave(form)} style={{
            flex:1,background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",
            color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",
            fontSize:14,fontWeight:800,fontFamily:"'Noto Sans JP',sans-serif"
          }}>保存</button>
          <button onClick={onClose} style={{
            flex:1,background:"#0d1a2e",color:"#475569",
            border:"1px solid #1e3a5f",borderRadius:8,padding:"11px 0",
            cursor:"pointer",fontSize:14,fontFamily:"'Noto Sans JP',sans-serif"
          }}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  SHIFT TABLE
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
//  ZOOM WRAPPER（自動フィット・ピンチ・±ボタン対応）
// ─────────────────────────────────────────────
function ZoomWrapper({ zoom, onZoomChange, children }) {
  const innerRef = useRef(null);
  const outerRef = useRef(null);
  const scale = zoom / 100;

  // 外側コンテナの高さをscale後のサイズに合わせる（余白除去）
  useEffect(() => {
    if (!innerRef.current || !outerRef.current) return;
    const inner = innerRef.current;
    const outer = outerRef.current;
    const updateHeight = () => {
      outer.style.height = `${Math.round(inner.offsetHeight * scale)}px`;
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [zoom]);

  // ピンチ操作（タッチイベント）
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    let startDist = null;
    let startZoom = zoom;

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        startDist = Math.hypot(dx, dy);
        startZoom = zoom;
        e.preventDefault();
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && startDist !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / startDist;
        // 5%刻みにスナップ
        const raw = Math.round(startZoom * ratio / 5) * 5;
        const clamped = Math.min(100, Math.max(40, raw));
        if (clamped !== zoom) onZoomChange(clamped);
        e.preventDefault();
      }
    };
    const onTouchEnd = () => { startDist = null; };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("touchend",   onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
      el.removeEventListener("touchend",   onTouchEnd);
    };
  }, [zoom, onZoomChange]);

  return (
    <div ref={outerRef} style={{overflowX:"auto", overflowY:"visible", position:"relative"}}>
      <div
        ref={innerRef}
        style={{
          transformOrigin:"top left",
          transform:`scale(${scale})`,
          width: scale < 1 ? `${Math.round(100 / scale)}%` : "100%",
          display:"inline-block", minWidth:"max-content",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ShiftTable({ staffList, shifts, dept, year, month, onLeftClick, onRightClick }) {
  const days = getDays(year, month);
  const ds = staffList.filter(s=>s.dept===dept.id);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;

  const isAlert = (d) => {
    for (const [sh, min] of Object.entries(dept.minStaff||{})) {
      const cnt = ds.filter(s=>(shifts[s.id]?.[d]||"")=== sh).length;
      if (cnt < min) return true;
    }
    return false;
  };

  // 連続勤務違反チェック：d日目を含めた連続日数が上限超過
  const isConsecViolation = (sShifts, d) => {
    if (!WORK_TYPES.has(sShifts[d])) return false;
    return calcConsecutive(sShifts, d) > maxConsec;
  };

  return (
    <div style={{overflowX:"auto",overflowY:"visible"}}>
      <table style={{borderCollapse:"collapse",minWidth:"max-content",fontSize:12}}>
        <thead>
          <tr>
            <th style={TH({sticky:true,w:148})}>
              <span style={{color:"#334155",fontSize:10}}>氏名</span>
            </th>
            {Array.from({length:days},(_,i)=>i+1).map(d=>{
              const wd=getWD(year,month,d), we=isWE(year,month,d), alert=isAlert(d);
              return (
                <th key={d} style={{...TH({}),background:we?"#0e1830":"#080f1c",minWidth:30,width:30,padding:"3px 1px"}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                    <span style={{fontSize:10,fontWeight:700,color:we?"#f472b6":"#64748b"}}>{d}</span>
                    <span style={{fontSize:9,color:we?"#f472b6":"#334155"}}>{wd}</span>
                    <span style={{fontSize:8}}>{alert?"⚠️":"　"}</span>
                  </div>
                </th>
              );
            })}
            <th style={TH({w:44})}><span style={{fontSize:10,color:"#334155"}}>勤務</span></th>
            <th style={TH({w:36})}><span style={{fontSize:10,color:"#334155"}}>夜勤</span></th>
            <th style={TH({w:36})}><span style={{fontSize:10,color:"#334155"}}>休日</span></th>
          </tr>
        </thead>
        <tbody>
          {ds.map((s,si)=>{
            const sShifts = shifts[s.id]||{};
            const kibodays = s.kiboByMonth?.[mk]||[];
            const workCnt  = Object.values(sShifts).filter(v=>WORK_TYPES.has(v)).length;
            const nightCnt = Object.values(sShifts).filter(v=>v==="夜勤").length;
            const restCnt  = Object.values(sShifts).filter(v=>REST_TYPES.has(v) && v !== "明け").length;
            const nightOver = s.nightOk && nightCnt > (s.nightMax||5);
            return (
              <tr key={s.id} style={{background:si%2===0?"#060d1a":"#080e20"}}>
                <td style={{
                  position:"sticky",left:0,zIndex:2,
                  background:si%2===0?"#060d1a":"#080e20",
                  padding:"4px 10px",borderRight:"1px solid #1e3a5f",
                  borderBottom:"1px solid #0f172a",minWidth:148,
                }}>
                  <div style={{fontWeight:700,fontSize:12,color:"#e2e8f0",whiteSpace:"nowrap"}}>{s.name}</div>
                  <div style={{fontSize:10,color:"#334155",display:"flex",gap:6,alignItems:"center"}}>
                    <span>{s.role}</span>
                    {s.nightOk&&<span style={{color:nightOver?"#ef4444":"#2563eb",fontSize:9}}>
                      🌙{nightCnt}/{s.nightMax}
                    </span>}
                  </div>
                </td>
                {Array.from({length:days},(_,i)=>i+1).map(d=>{
                  const type = sShifts[d]||"";
                  const isKibo = kibodays.includes(d) && !type;
                  const consecViol = isConsecViolation(sShifts, d);
                  return (
                    <td key={d} style={{
                      padding:"2px 1px",textAlign:"center",
                      borderRight:"1px solid #080f1c",borderBottom:"1px solid #0f172a",
                      background:consecViol?"#2d0808":isKibo?"#1a0505":undefined,
                      cursor:"pointer",
                      outline:consecViol?"1px solid #ef444460":undefined,
                    }}
                      onClick={(e)=>onLeftClick(s.id,d,e)}
                      onContextMenu={(e)=>{e.preventDefault();onRightClick(s.id,d,e);}}>
                      {isKibo
                        ? <span style={{fontSize:9,color:"#4b1010"}}>希</span>
                        : <ShiftBadge type={type}/>
                      }
                      {consecViol && <span style={{fontSize:7,color:"#ef4444",display:"block",lineHeight:1}}>連超</span>}
                    </td>
                  );
                })}
                <td style={TD}><span style={{color:workCnt<(s.targetWork-2)?"#f59e0b":workCnt>(s.targetWork+2)?"#ef4444":"#60a5fa",fontWeight:800,fontSize:12}}>{workCnt}</span></td>
                <td style={TD}><span style={{color:nightOver?"#ef4444":"#7dd3fc",fontWeight:700,fontSize:12}}>{nightCnt||"－"}</span></td>
                <td style={TD}><span style={{color:"#4ade80",fontWeight:700,fontSize:12}}>{restCnt}</span></td>
              </tr>
            );
          })}
          {/* count rows */}
          {dept.shiftTypes.map(shKey=>(
            <tr key={shKey} style={{background:"#050a14"}}>
              <td style={{
                position:"sticky",left:0,zIndex:2,background:"#050a14",
                padding:"3px 10px",borderRight:"1px solid #1e3a5f",borderBottom:"1px solid #0f172a"
              }}>
                <ShiftBadge type={shKey}/>
              </td>
              {Array.from({length:days},(_,i)=>i+1).map(d=>{
                const cnt=ds.filter(s=>(shifts[s.id]?.[d]||"")=== shKey).length;
                const min=dept.minStaff?.[shKey]||0;
                return (
                  <td key={d} style={{
                    textAlign:"center",fontSize:11,fontWeight:800,padding:"3px 0",
                    color:cnt===0?"#ef4444":cnt>=min?"#4ade80":"#f59e0b",
                    borderRight:"1px solid #080f1c",borderBottom:"1px solid #0f172a",
                  }}>{cnt||"0"}</td>
                );
              })}
              <td colSpan={3}/>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TH = ({sticky,w}={}) => ({
  position:sticky?"sticky":"static", left:sticky?0:"auto", zIndex:sticky?3:1,
  background:"#080f1c", padding:"5px 3px",
  borderBottom:"2px solid #1e3a5f", borderRight:"1px solid #0f172a",
  fontSize:11, fontWeight:700, color:"#334155", textAlign:"center", whiteSpace:"nowrap",
  width:w||"auto", minWidth:w||"auto",
});
const TD = { textAlign:"center", padding:"4px 2px",
  borderBottom:"1px solid #0f172a", borderRight:"1px solid #0f172a" };
const INPUT_STYLE = {
  width:"100%", background:"#0d1a2e", border:"1px solid #1e3a5f",
  borderRadius:7, color:"#e2e8f0", padding:"8px 10px", fontSize:13,
  fontFamily:"'Noto Sans JP',sans-serif", boxSizing:"border-box", outline:"none",
};

// ─────────────────────────────────────────────
//  SUMMARY VIEW
// ─────────────────────────────────────────────
function SummaryView({ staffList, shifts, dept, year, month }) {
  const ds = staffList.filter(s=>s.dept===dept.id);
  const mk = monthKey(year, month);
  const shownKeys = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休"];
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",minWidth:"max-content"}}>
        <thead>
          <tr style={{background:"#080f1c"}}>
            <th style={TH({sticky:true,w:148})}><span style={{color:"#334155",fontSize:10}}>スタッフ</span></th>
            {shownKeys.map(k=><th key={k} style={TH({})}><ShiftBadge type={k}/></th>)}
            <th style={TH({w:50})}><span style={{fontSize:10,color:"#334155"}}>勤務計</span></th>
            <th style={TH({w:50})}><span style={{fontSize:10,color:"#334155"}}>希望休</span></th>
          </tr>
        </thead>
        <tbody>
          {ds.map((s,i)=>{
            const sv = shifts[s.id]||{};
            const cnt = {};
            shownKeys.forEach(k=>{ cnt[k]=Object.values(sv).filter(v=>v===k).length; });
            const work = ["早番","日勤","遅番","夜勤"].reduce((a,k)=>a+(cnt[k]||0),0);
            const kiboSel = (s.kiboByMonth?.[mk]||[]).length;
            return (
              <tr key={s.id} style={{background:i%2===0?"#060d1a":"#080e20"}}>
                <td style={{...TD,position:"sticky",left:0,zIndex:1,
                  background:i%2===0?"#060d1a":"#080e20",
                  padding:"5px 10px",borderRight:"1px solid #1e3a5f"}}>
                  <div style={{fontWeight:700,fontSize:12,color:"#e2e8f0"}}>{s.name}</div>
                  <div style={{fontSize:10,color:"#334155"}}>{s.role}</div>
                </td>
                {shownKeys.map(k=>(
                  <td key={k} style={{...TD,
                    color:cnt[k]>0?SHIFTS[k].color:"#1e3a5f",
                    fontWeight:800,fontSize:13}}>
                    {cnt[k]||"－"}
                  </td>
                ))}
                <td style={{...TD,color:"#60a5fa",fontWeight:800,fontSize:14}}>{work}</td>
                <td style={{...TD,color:"#f87171",fontWeight:700,fontSize:13}}>{kiboSel||"－"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────
//  STAFF LIST
// ─────────────────────────────────────────────
function StaffList({ staffList, dept, year, month, onEdit, onDelete, onAdd }) {
  const ds = staffList.filter(s=>s.dept===dept.id);
  return (
    <div style={{maxWidth:680}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:"#60a5fa",fontWeight:800}}>
          {dept.icon} {dept.label} — {ds.length}名
        </div>
        <button onClick={onAdd} style={{
          background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",color:"#fff",
          border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",
          fontSize:13,fontWeight:800,fontFamily:"'Noto Sans JP',sans-serif"
        }}>＋ 追加</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {ds.map((s,i)=>{
          const mk = monthKey(year,month);
          const kibo = (s.kiboByMonth?.[mk]||[]).length;
          return (
            <div key={s.id} style={{
              background:"#0a1525",border:"1px solid #1e3a5f",borderRadius:10,
              padding:"10px 14px",display:"flex",alignItems:"center",
              justifyContent:"space-between",gap:10
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{
                  width:36,height:36,borderRadius:"50%",flexShrink:0,
                  background:`hsl(${(i*53+180)%360},55%,30%)`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:14,color:"#fff",fontWeight:800
                }}>{s.name.charAt(0)}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:13,color:"#e2e8f0"}}>{s.name}</div>
                  <div style={{fontSize:10,color:"#334155",display:"flex",gap:8,flexWrap:"wrap"}}>
                    <span>{s.role}</span>
                    <span>目標{s.targetWork}日</span>
                    <span>休み{s.kyukoDaysByMonth?.[monthKey(year,month)] ?? s.kyukoDays ?? 8}日</span>
                    {s.nightOk&&<span style={{color:"#2563eb"}}>🌙夜勤×{s.nightMax}回</span>}
                    {kibo>0&&<span style={{color:"#dc2626"}}>希望休{kibo}日選択済</span>}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>onEdit(s)} style={ICON_BTN("#3b82f6")}>✏️</button>
                <button onClick={()=>onDelete(s.id)} style={ICON_BTN("#ef4444")}>🗑</button>
              </div>
            </div>
          );
        })}
        {ds.length===0&&(
          <div style={{
            background:"#0a1525",border:"1px dashed #1e3a5f",borderRadius:10,
            padding:32,textAlign:"center",color:"#1e3a5f",fontSize:13
          }}>スタッフが登録されていません</div>
        )}
      </div>
    </div>
  );
}
const ICON_BTN = (color) => ({
  background:`${color}18`,border:`1px solid ${color}40`,
  borderRadius:7,padding:"5px 9px",cursor:"pointer",fontSize:13
});

// ─────────────────────────────────────────────
//  LEGEND
// ─────────────────────────────────────────────
function Legend() {
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:"8px 0 6px",
      borderBottom:"1px solid #0f172a",marginBottom:10}}>
      {Object.entries(SHIFTS).filter(([k])=>k).map(([key,def])=>(
        <div key={key} style={{display:"flex",alignItems:"center",gap:3}}>
          <ShiftBadge type={key}/>
          <span style={{fontSize:9,color:"#334155"}}>{def.time||key}</span>
        </div>
      ))}
      <span style={{fontSize:9,color:"#1e3a5f",marginLeft:4}}>
        左クリック：順番切替 ／ 右クリック：メニュー選択
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
//  APP
// ─────────────────────────────────────────────
export default function App() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [depts] = useState(DEFAULT_DEPTS);
  const [activeDeptId, setActiveDeptId] = useState("kaigo1");
  const [innerTab, setInnerTab] = useState("shift");
  const [staffList, setStaffList] = useState(buildStaff());
  // SheetJS（XLSX）を動的ロード
  useEffect(() => {
    if (window.XLSX) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    document.head.appendChild(script);
  }, []);

  // シフトデータをlocalStorageから復元
  const [allShifts, setAllShifts] = useState(() => {
    try {
      const saved = localStorage.getItem("shiftNavi_allShifts");
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      // キーをint変換（JSON化でstring化されたdayキーを戻す）
      const restored = {};
      for (const [deptId, deptShifts] of Object.entries(parsed)) {
        restored[deptId] = {};
        for (const [staffId, dayMap] of Object.entries(deptShifts)) {
          restored[deptId][staffId] = {};
          for (const [d, v] of Object.entries(dayMap)) {
            restored[deptId][staffId][+d] = v;
          }
        }
      }
      return restored;
    } catch { return {}; }
  });
  const [saveStatus, setSaveStatus] = useState("saved"); // "saved" | "saving" | "unsaved"
  const saveTimer = useRef(null);

  // allShifts変更時に自動保存（1秒デバウンス）
  useEffect(() => {
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem("shiftNavi_allShifts", JSON.stringify(allShifts));
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unsaved");
      }
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [allShifts]);
  const [generating, setGenerating] = useState(false);
  const [generateWarnings, setGenerateWarnings] = useState(null);
  const [downloadModal, setDownloadModal] = useState(false);
  const [bulkKyukoModal, setBulkKyukoModal] = useState(false);
  const [tableZoom, setTableZoom] = useState(() => {
    try { return Number(localStorage.getItem("shiftTableZoom")) || 100; } catch { return 100; }
  });

  // ズーム変更（stateとlocalStorage両方更新）
  const handleZoomChange = useCallback((v) => {
    const clamped = Math.min(100, Math.max(40, Math.round(v / 5) * 5));
    setTableZoom(clamped);
    try { localStorage.setItem("shiftTableZoom", clamped); } catch {}
  }, []);

  // 自動フィット：画面幅に合わせてズームを自動計算
  // スタッフ列148px + 日付列30px×days + 集計列116px 程度
  const autoFitZoom = useCallback((staffCount, days) => {
    const vw = window.innerWidth - 24; // 左右padding分引く
    const tableEstWidth = 148 + 30 * days + 116;
    const fit = Math.floor((vw / tableEstWidth) * 100);
    return Math.min(100, Math.max(40, Math.round(fit / 5) * 5));
  }, []);

  // 初回マウント時 & 部署切替時に自動フィットを適用
  // ただしユーザーが手動でズームを変えた場合は上書きしない
  const autoFitApplied = useRef(false);
  useEffect(() => {
    if (autoFitApplied.current) return; // 手動変更後はスキップ
    // localStorageに保存済みの値があればそちらを優先
    try {
      const saved = localStorage.getItem("shiftTableZoom");
      if (saved) return; // 保存済みあり → 自動フィット不要
    } catch {}
    const days = getDays(year, month);
    const ds = staffList.filter(s => s.dept === activeDeptId).length;
    const fit = autoFitZoom(ds, days);
    setTableZoom(fit);
  }, []); // 初回のみ
  const [excelImportModal, setExcelImportModal] = useState(false);
  const [clearModal, setClearModal] = useState(false);
  const [shiftTrend, setShiftTrend] = useState({}); // 過去シフト傾向データ
  const [ctxMenu, setCtxMenu] = useState(null);
  const [staffModal, setStaffModal] = useState(null);

  const dept = depts.find(d=>d.id===activeDeptId);
  const deptShifts = allShifts[activeDeptId]||{};

  const setDeptShifts = useCallback(updater => {
    setAllShifts(prev=>({
      ...prev,
      [activeDeptId]: typeof updater==="function"?updater(prev[activeDeptId]||{}):updater
    }));
  },[activeDeptId]);

  // 自動生成
  const handleGenerate = useCallback(() => {
    // 最新のstaffList・dept・deptShiftsをクロージャではなく直接参照するため
    // setAllShifts/setStaffListの最新値を使う
    setGenerating(true);
    // staffListとdeptの最新値を明示的にキャプチャ
    const currentStaff = staffList;
    const currentDept = dept;
    const currentTrend = shiftTrend;
    setTimeout(() => {
      setAllShifts(prevAll => {
        const currentShifts = prevAll[currentDept.id] || {};
        const { shifts: result, warnings } = autoGenerate(
          currentStaff, currentDept, year, month, currentShifts, currentTrend
        );
        // warningsは非同期で設定
        if (Object.keys(warnings).length > 0) {
          setTimeout(() => setGenerateWarnings({ warnings, deptLabel: currentDept.label }), 0);
        }
        return { ...prevAll, [currentDept.id]: result };
      });
      setGenerating(false);
    }, 700);
  }, [staffList, dept, year, month, shiftTrend]);

  // 左クリック：順番切替
  const handleLeftClick = useCallback((staffId, day) => {
    setDeptShifts(prev=>{
      const cur = prev[staffId]?.[day]||"";
      const idx = SHIFT_KEYS.indexOf(cur);
      const next = SHIFT_KEYS[(idx+1)%SHIFT_KEYS.length];
      return {...prev,[staffId]:{...(prev[staffId]||{}),[day]:next}};
    });
  },[setDeptShifts]);

  // 右クリック：コンテキストメニュー
  const handleRightClick = useCallback((staffId, day, e) => {
    setCtxMenu({ staffId, day, x:e.clientX+4, y:e.clientY+4 });
  },[]);

  const handleMenuSelect = (shiftKey) => {
    if (!ctxMenu) return;
    const {staffId, day} = ctxMenu;
    setDeptShifts(prev=>({
      ...prev, [staffId]:{...(prev[staffId]||{}),[day]:shiftKey}
    }));
    setCtxMenu(null);
  };

  // Staff ops
  const saveStaff = (form) => {
    setStaffList(prev => {
      const idx = prev.findIndex(s=>s.id===form.id);
      if (idx>=0) return prev.map((s,i)=>i===idx?form:s);
      return [...prev, {...form, id:`${activeDeptId}_${Date.now()}`, dept:activeDeptId}];
    });
    setStaffModal(null);
  };
  const deleteStaff = (id) => {
    if (confirm("このスタッフを削除しますか？")) setStaffList(s=>s.filter(x=>x.id!==id));
  };

  // 一括休み日数適用
  const handleBulkKyuko = (values, mk) => {
    setStaffList(prev => prev.map(s => {
      if (values[s.dept] === undefined) return s;
      return {
        ...s,
        kyukoDaysByMonth: { ...(s.kyukoDaysByMonth || {}), [mk]: values[s.dept] }
      };
    }));
    setBulkKyukoModal(false);
  };

  const prevMonth = ()=>{ if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextMonth = ()=>{ if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };

  return (
    <div style={{
      width:"100%", minHeight:"100vh", boxSizing:"border-box",
      background:"#060c18", fontFamily:"'Noto Sans JP',sans-serif", color:"#f1f5f9",
      // Viteデフォルトの#root max-width/paddingを打ち消す
      maxWidth:"none", margin:0, padding:0, textAlign:"left",
    }}>
      {/* TOPBAR */}
      <div style={{
        background:"#06101f",borderBottom:"1px solid #1e3a5f",
        padding:"10px 14px",position:"sticky",top:0,zIndex:50,
        display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{
            width:36,height:36,borderRadius:9,
            background:"linear-gradient(135deg,#1e40af,#6d28d9)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18
          }}>🏥</div>
          <div>
            <div style={{fontSize:15,fontWeight:900,color:"#e2e8f0",letterSpacing:"0.05em"}}>
              SHIFT NAVI
            </div>
            <div style={{fontSize:9,color:"#1e3a5f",letterSpacing:"0.08em"}}>
              介護施設シフト管理 — Phase 1
            </div>
          </div>
        </div>

        {/* Month nav */}
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={prevMonth} style={MNAV}>◀</button>
          <div style={{
            fontSize:14,fontWeight:800,color:"#60a5fa",minWidth:104,textAlign:"center",
            background:"#0a1830",border:"1px solid #1e3a5f",borderRadius:8,padding:"5px 10px"
          }}>{year}年 {month+1}月</div>
          <button onClick={nextMonth} style={MNAV}>▶</button>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          {/* 保存インジケーター */}
          <div style={{
            fontSize:10,fontWeight:700,
            color: saveStatus==="saved" ? "#4ade80" : saveStatus==="saving" ? "#fbbf24" : "#94a3b8",
            display:"flex",alignItems:"center",gap:3,minWidth:60,
          }}>
            {saveStatus==="saved"  && <><span>💾</span><span>保存済</span></>}
            {saveStatus==="unsaved"&& <><span>⏳</span><span>未保存</span></>}
          </div>

          <button onClick={handleGenerate} disabled={generating} style={{
            background:generating?"#0d1a2e":"linear-gradient(135deg,#1e40af,#6d28d9)",
            color:generating?"#334155":"#fff",border:"none",borderRadius:8,
            padding:"7px 14px",cursor:generating?"not-allowed":"pointer",
            fontSize:12,fontWeight:800,display:"flex",alignItems:"center",gap:5,
          }}>
            {generating?"⏳ 生成中...":"⚡ 自動生成"}
          </button>
          <button onClick={()=>setDownloadModal(true)} style={{
            background:"#0a1830",color:"#34d399",border:"1px solid #064e3b",
            borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,
            position:"relative",zIndex:60,
          }}>📤 書き出し</button>
          <button onClick={()=>setBulkKyukoModal(true)} style={{
            background:"#0a1830",color:"#60a5fa",border:"1px solid #1e3a5f",
            borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,
          }}>📅 休み設定</button>
          <button onClick={()=>setExcelImportModal(true)} style={{
            background: Object.keys(shiftTrend).filter(k=>k!=='_months').length > 0 ? "#0a2010" : "#0a1830",
            color: Object.keys(shiftTrend).filter(k=>k!=='_months').length > 0 ? "#4ade80" : "#94a3b8",
            border: Object.keys(shiftTrend).filter(k=>k!=='_months').length > 0 ? "1px solid #16a34a" : "1px solid #1e3a5f",
            borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,
          }}>
            {Object.keys(shiftTrend).filter(k=>k!=='_months').length > 0 ? `📊 傾向ON(${Object.keys(shiftTrend).filter(k=>k!=='_months').length}名)` : "📊 傾向学習"}
          </button>
          <button onClick={()=>setClearModal(true)}
          style={{
            background:"#0a1830",color:"#ef4444",border:"1px solid #450a0a",
            borderRadius:8,padding:"7px 10px",cursor:"pointer",fontSize:12,fontWeight:700,
            display:"flex",alignItems:"center",gap:4,
          }}>🗑 クリア</button>
        </div>
      </div>

      {/* DEPT TABS */}
      <div style={{background:"#040a14",borderBottom:"1px solid #1e3a5f",
        display:"flex",overflowX:"auto",padding:"0 6px"}}>
        {depts.map(d=>{
          const cnt = staffList.filter(s=>s.dept===d.id).length;
          const act = d.id===activeDeptId;
          return (
            <button key={d.id} onClick={()=>setActiveDeptId(d.id)} style={{
              padding:"9px 14px",background:"transparent",border:"none",
              color:act?"#60a5fa":"#334155",
              borderBottom:act?"2px solid #3b82f6":"2px solid transparent",
              cursor:"pointer",fontSize:12,fontWeight:act?800:400,
              whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5,
            }}>
              <span>{d.icon}</span>
              <span>{d.label}</span>
              <span style={{
                background:act?"#1e3a5f":"#0d1525",color:act?"#60a5fa":"#334155",
                borderRadius:8,padding:"1px 6px",fontSize:10,fontWeight:700
              }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* INNER TABS */}
      <div style={{background:"#04090f",borderBottom:"1px solid #1e293b",
        display:"flex",padding:"0 12px",gap:2,alignItems:"center"}}>
        {[["shift","📅 シフト表"],["summary","📊 集計"],["staff","👥 スタッフ"]].map(([k,l])=>(
          <button key={k} onClick={()=>setInnerTab(k)} style={{
            padding:"7px 13px",background:"transparent",border:"none",
            color:innerTab===k?"#93c5fd":"#1e3a5f",
            borderBottom:innerTab===k?"2px solid #3b82f6":"2px solid transparent",
            cursor:"pointer",fontSize:12,fontWeight:innerTab===k?700:400,
          }}>{l}</button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {/* ズームコントロール（シフト表タブのみ表示） */}
          {innerTab==="shift" && (
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              {/* − ボタン */}
              <button
                onClick={() => handleZoomChange(tableZoom - 5)}
                disabled={tableZoom <= 40}
                style={{
                  width:22,height:22,borderRadius:4,border:"1px solid #1e3a5f",
                  background:"#0a1830",color:tableZoom<=40?"#1e3a5f":"#60a5fa",
                  cursor:tableZoom<=40?"not-allowed":"pointer",
                  fontSize:14,fontWeight:900,lineHeight:1,padding:0,
                  display:"flex",alignItems:"center",justifyContent:"center"
                }}>−</button>

              {/* スライダー */}
              <input
                type="range" min={40} max={100} step={5}
                value={tableZoom}
                onChange={e => handleZoomChange(Number(e.target.value))}
                style={{width:72,accentColor:"#3b82f6",cursor:"pointer"}}
              />

              {/* + ボタン */}
              <button
                onClick={() => handleZoomChange(tableZoom + 5)}
                disabled={tableZoom >= 100}
                style={{
                  width:22,height:22,borderRadius:4,border:"1px solid #1e3a5f",
                  background:"#0a1830",color:tableZoom>=100?"#1e3a5f":"#60a5fa",
                  cursor:tableZoom>=100?"not-allowed":"pointer",
                  fontSize:14,fontWeight:900,lineHeight:1,padding:0,
                  display:"flex",alignItems:"center",justifyContent:"center"
                }}>＋</button>

              {/* ズーム率表示 */}
              <span style={{fontSize:11,fontWeight:700,color:"#60a5fa",minWidth:34,textAlign:"right"}}>
                {tableZoom}%
              </span>

              {/* 自動フィット／100%リセットボタン */}
              <button
                onClick={() => {
                  const days = getDays(year, month);
                  const ds = staffList.filter(s => s.dept === activeDeptId).length;
                  const fit = autoFitZoom(ds, days);
                  handleZoomChange(fit);
                }}
                title="画面幅に自動フィット"
                style={{
                  background:"#0a1830",border:"1px solid #1e3a5f",borderRadius:4,
                  color:"#60a5fa",fontSize:10,padding:"2px 6px",cursor:"pointer",
                  whiteSpace:"nowrap"
                }}
              >⊞ フィット</button>
            </div>
          )}
          <div style={{fontSize:10,color:"#1e3a5f",padding:"0 4px"}}>
            最低配置：{Object.entries(dept.minStaff||{}).map(([k,v])=>`${k}×${v}`).join(" / ")}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{padding:"10px 8px",minHeight:"calc(100vh - 180px)"}}>
        {innerTab==="shift" && (
          <>
            <Legend/>
            {/* ズームラッパー
                transform:scaleはビジュアルのみ縮小し、DOMスペースは元サイズのまま残る。
                外側divのheightをscale後の値に合わせて余白を除去する。 */}
            <ZoomWrapper zoom={tableZoom} onZoomChange={handleZoomChange}>
              <ShiftTable
                staffList={staffList} shifts={deptShifts}
                dept={dept} year={year} month={month}
                onLeftClick={handleLeftClick}
                onRightClick={handleRightClick}
              />
            </ZoomWrapper>
          </>
        )}
        {innerTab==="summary" && (
          <SummaryView staffList={staffList} shifts={deptShifts}
            dept={dept} year={year} month={month}/>
        )}
        {innerTab==="staff" && (
          <StaffList
            staffList={staffList} dept={dept} year={year} month={month}
            onEdit={s=>setStaffModal({data:s})}
            onDelete={deleteStaff}
            onAdd={()=>setStaffModal({data:null})}
          />
        )}
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y}
          onSelect={handleMenuSelect}
          onClose={()=>setCtxMenu(null)}/>
      )}

      {/* Staff Modal */}
      {staffModal !== null && (
        <StaffModal
          data={staffModal.data}
          deptId={activeDeptId}
          year={year} month={month}
          onSave={saveStaff}
          onClose={()=>setStaffModal(null)}
        />
      )}

      {/* Clear Modal */}
      {clearModal && (
        <ClearModal
          deptLabel={dept.label}
          onClearDept={() => {
            setDeptShifts({});
            setClearModal(false);
          }}
          onClearAll={() => {
            setAllShifts({});
            setClearModal(false);
          }}
          onClose={() => setClearModal(false)}
        />
      )}

      {/* Excel Import Modal */}
      {excelImportModal && (
        <ExcelImportModal
          currentTrend={shiftTrend}
          onImport={(trend) => { setShiftTrend(trend); setExcelImportModal(false); }}
          onClose={() => setExcelImportModal(false)}
        />
      )}

      {/* Bulk Kyuko Modal */}
      {bulkKyukoModal && (
        <BulkKyukoModal
          depts={depts} staffList={staffList}
          year={year} month={month}
          onApply={handleBulkKyuko}
          onClose={()=>setBulkKyukoModal(false)}
        />
      )}

      {/* Download Modal */}
      {downloadModal && (
        <DownloadModal
          depts={depts} staffList={staffList} allShifts={allShifts}
          year={year} month={month} activeDeptId={activeDeptId}
          onClose={()=>setDownloadModal(false)}
        />
      )}

      {/* Generate Warning Modal */}
      {generateWarnings && (
        <GenerateWarningModal
          warnings={generateWarnings.warnings}
          deptLabel={generateWarnings.deptLabel}
          year={year} month={month}
          onClose={() => setGenerateWarnings(null)}
        />
      )}

      {/* Phase badge */}
      <div style={{
        position:"fixed",bottom:12,right:12,
        background:"#04090f",border:"1px solid #1e3a5f",borderRadius:16,
        padding:"5px 12px",fontSize:10,color:"#1e3a5f",
        display:"flex",gap:6,alignItems:"center"
      }}>
        <span style={{color:"#3b82f6",fontWeight:700}}>Phase 1</span>
        <span>手動編集 ＋ ルールベース自動生成</span>
      </div>
    </div>
  );
}

const MNAV = {
  background:"#0a1830",color:"#475569",border:"1px solid #1e3a5f",
  borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:11,
  display:"flex",alignItems:"center",justifyContent:"center"
};