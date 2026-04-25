import { useState, useCallback, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const LOGO_CHARS = [
  { char: "し", color: "#F4847E" },
  { char: "ふ", color: "#7BC8C0" },
  { char: "ぽ", color: "#F5C355" },
  { char: "ん", color: "#A48FD0" },
];
const LOGO_STYLE = {
  fontFamily: "'M PLUS Rounded 1c', sans-serif",
  fontWeight: 900,
  textShadow: "-2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 2px 0 #fff, 2px 0 0 #fff, 0 -2px 0 #fff, -2px 0 0 #fff",
  letterSpacing: "0.05em",
  lineHeight: 1,
};
function ShifuponLogo({ size = 22 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      <span style={{ fontSize: size * 0.6, marginBottom: size * 0.3 }}>✦</span>
      {LOGO_CHARS.map(({ char, color }) => (
        <span key={char} style={{ ...LOGO_STYLE, fontSize: size, color }}>{char}</span>
      ))}
      <span style={{ fontSize: size * 0.5, marginBottom: -size * 0.1, color: "#F4A7B9" }}>✦</span>
    </span>
  );
}

function ShifuponIcon({ size = 48, radius = 12 }) {
  const rx = Math.round((radius / size) * 100);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="sp-body" cx="38%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ffffff"/>
          <stop offset="60%" stopColor="#f8f4f0"/>
          <stop offset="100%" stopColor="#d5edec"/>
        </radialGradient>
        <linearGradient id="sp-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F9D4C8"/>
          <stop offset="50%" stopColor="#C9EAE7"/>
          <stop offset="100%" stopColor="#D4C5F0"/>
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx={rx} fill="url(#sp-bg)"/>
      <ellipse cx="20" cy="64" rx="11" ry="15" fill="url(#sp-body)" transform="rotate(-22 20 64)"/>
      <ellipse cx="80" cy="64" rx="11" ry="15" fill="url(#sp-body)" transform="rotate(22 80 64)"/>
      <ellipse cx="50" cy="50" rx="30" ry="33" fill="url(#sp-body)"/>
      <ellipse cx="38" cy="83" rx="12" ry="8" fill="url(#sp-body)"/>
      <ellipse cx="62" cy="83" rx="12" ry="8" fill="url(#sp-body)"/>
      <ellipse cx="33" cy="55" rx="8" ry="5.5" fill="#F4A0A0" fillOpacity="0.38"/>
      <ellipse cx="67" cy="55" rx="8" ry="5.5" fill="#F4A0A0" fillOpacity="0.38"/>
      <circle cx="41" cy="44" r="3.8" fill="#1a1a1a"/>
      <circle cx="59" cy="44" r="3.8" fill="#1a1a1a"/>
      <path d="M 43 54 Q 50 62 57 54" stroke="#1a1a1a" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      <rect x="35" y="60" width="30" height="23" rx="3.5" fill="white" fillOpacity="0.92" stroke="#ddd4cc" strokeWidth="0.8"/>
      <rect x="35" y="60" width="30" height="5.5" rx="3.5" fill="#ede5da" fillOpacity="0.9"/>
      <rect x="35" y="64" width="30" height="1.5" fill="#ede5da" fillOpacity="0.9"/>
      <line x1="45" y1="65.5" x2="45" y2="83" stroke="#ddd4cc" strokeWidth="0.7"/>
      <line x1="55" y1="65.5" x2="55" y2="83" stroke="#ddd4cc" strokeWidth="0.7"/>
      <line x1="35" y1="71" x2="65" y2="71" stroke="#ddd4cc" strokeWidth="0.7"/>
      <line x1="35" y1="77" x2="65" y2="77" stroke="#ddd4cc" strokeWidth="0.7"/>
      <path d="M 48 69.5 L 51.5 73.5 L 59 66" stroke="#7BC8C0" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─────────────────────────────────────────────
//  SUPABASE
// ─────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─────────────────────────────────────────────
//  LOGIN PAGE
// ─────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [mode, setMode]       = useState("login");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [msg, setMsg]         = useState("");

  const handleSubmit = async () => {
    if (!email || !password) { setError("メールアドレスとパスワードを入力してください"); return; }
    setLoading(true); setError(""); setMsg("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLogin();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("確認メールを送信しました。メールのリンクをクリックしてアカウントを有効化してください。");
      }
    } catch (e) {
      const msg = e.message || "";
      if (msg.includes("Invalid login credentials")) setError("メールアドレスまたはパスワードが正しくありません");
      else if (msg.includes("User already registered")) setError("このメールアドレスはすでに登録されています");
      else if (msg.includes("Password should be at least")) setError("パスワードは6文字以上で入力してください");
      else setError(msg || "エラーが発生しました");
    } finally { setLoading(false); }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSubmit(); };

  return (
    <div style={{
      minHeight:"100vh", background:"linear-gradient(135deg,#f0fbfa 0%,#d4f1ef 100%)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Noto Sans JP',sans-serif", padding:16,
    }}>
      <div style={{
        background:"#f5fffe", border:"1px solid #90cbc8", borderRadius:18,
        padding:36, width:"100%", maxWidth:400,
        boxShadow:"0 20px 60px rgba(0,0,0,0.12)",
      }}>
        <div style={{textAlign:"center", marginBottom:28}}>
          <div style={{margin:"0 auto 12px", width:56, height:56}}><ShifuponIcon size={56} radius={14}/></div>
          <ShifuponLogo size={28} />
          <div style={{fontSize:11, color:"#6ab5b2", marginTop:6}}>介護施設シフト管理システム</div>
        </div>

        <div style={{display:"flex", background:"#d5edeb", borderRadius:10, padding:3, marginBottom:22}}>
          {[["login","ログイン"],["signup","新規登録"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setMode(k);setError("");setMsg("");}} style={{
              flex:1, background:mode===k?"#fff":"transparent",
              border:"none", borderRadius:8, padding:"8px 0",
              fontSize:13, fontWeight:mode===k?800:400,
              color:mode===k?"#2BBFBA":"#3a8a87",
              cursor:"pointer",
              boxShadow:mode===k?"0 1px 4px rgba(0,0,0,0.1)":"none",
              transition:"all 0.15s",
            }}>{l}</button>
          ))}
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:11, color:"#3a8a87", marginBottom:5}}>メールアドレス</div>
          <input
            type="email" value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="example@email.com"
            style={{
              width:"100%", background:"#f0fffe", border:"1px solid #90cbc8",
              borderRadius:8, color:"#1a3635", padding:"10px 12px", fontSize:13,
              boxSizing:"border-box", outline:"none",
            }}
          />
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11, color:"#3a8a87", marginBottom:5}}>パスワード{mode==="signup"&&<span style={{color:"#6ab5b2"}}>（6文字以上）</span>}</div>
          <input
            type="password" value={password}
            onChange={e=>setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="••••••••"
            style={{
              width:"100%", background:"#f0fffe", border:"1px solid #90cbc8",
              borderRadius:8, color:"#1a3635", padding:"10px 12px", fontSize:13,
              boxSizing:"border-box", outline:"none",
            }}
          />
        </div>

        {error && (
          <div style={{
            background:"#fff0f0", border:"1px solid #fca5a5", borderRadius:8,
            padding:"9px 12px", fontSize:12, color:"#dc2626", marginBottom:14,
          }}>⚠ {error}</div>
        )}
        {msg && (
          <div style={{
            background:"#e8f5ee", border:"1px solid #5cb87a", borderRadius:8,
            padding:"9px 12px", fontSize:12, color:"#166534", marginBottom:14,
          }}>✅ {msg}</div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{
          width:"100%",
          background:loading?"#b8deda":"linear-gradient(135deg,#2BBFBA,#45B7D1)",
          color:"#fff", border:"none", borderRadius:10,
          padding:"13px 0", fontSize:14, fontWeight:800,
          cursor:loading?"not-allowed":"pointer",
          letterSpacing:"0.05em",
        }}>
          {loading ? "⏳ 処理中…" : mode==="login" ? "ログイン" : "アカウントを作成"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  SHIFT DEFINITIONS
// ─────────────────────────────────────────────
const SHIFTS = {
  早番:  { short:"早", color:"#c45c35", bg:"#fff0e8", border:"#e0894f", time:"7:00〜16:00" },
  日勤:  { short:"日", color:"#3b6eea", bg:"#eef3ff", border:"#6b96f5", time:"9:00〜18:00" },
  遅番:  { short:"遅", color:"#8b5cc4", bg:"#f5eeff", border:"#b07fd4", time:"11:30〜20:30" },
  夜勤:  { short:"夜", color:"#2a7a9a", bg:"#e8f6fb", border:"#4ba8c8", time:"16:30〜翌9:30" },
  明け:  { short:"明", color:"#9e8d80", bg:"#f5f0eb", border:"#c8b8a8", time:"夜勤明け" },
  休み:  { short:"休", color:"#3a9659", bg:"#edf7f0", border:"#5cb87a", time:"－" },
  希望休: { short:"希", color:"#c44b4b", bg:"#fff0f0", border:"#e07070", time:"希望休" },
  有休:  { short:"有", color:"#9b4db5", bg:"#faf0ff", border:"#c07ad5", time:"有給" },
  "日/休": { short:"日休", color:"#3b6eea", bg:"#f0f5ff", border:"#93b4f5", time:"午前日勤／午後休" },
  "休/日": { short:"休日", color:"#3a9659", bg:"#f0faf4", border:"#8fcfa8", time:"午前休／午後日勤" },
  "早/休": { short:"早休", color:"#c45c35", bg:"#fff5ee", border:"#f0a882", time:"早番半日／午後休" },
  "休/遅": { short:"休遅", color:"#8b5cc4", bg:"#faf5ff", border:"#c4a0e0", time:"午前休／遅番半日" },
  "": { short:"－", color:"#c8b8a8", bg:"transparent", border:"transparent", time:"" },
};
const SHIFT_KEYS = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休",""];
const SHIFT_KEYS_MANUAL = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休","日/休","休/日","早/休","休/遅",""];
const REST_TYPES  = new Set(["休み","希望休","有休","明け","日/休","休/日","早/休","休/遅"]);
const WORK_TYPES  = new Set(["早番","日勤","遅番","夜勤"]);

const DEFAULT_DEPTS = [
  { id:"kaigo1", label:"介護部 1階", icon:"🏠", shiftTypes:["早番","日勤","遅番","夜勤"], minStaff:{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["介護福祉士","介護職員","介護補助","介護助手","特定技能"] },
  { id:"kaigo2", label:"介護部 2階", icon:"🏢", shiftTypes:["早番","日勤","遅番","夜勤"], minStaff:{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["介護福祉士","介護職員","介護補助","介護助手","特定技能"] },
  { id:"jimu",   label:"事務所",     icon:"📋", shiftTypes:["日勤"], minStaff:{ 日勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["事務員","主任"] },
  { id:"kango",  label:"看護部",     icon:"💉", shiftTypes:["日勤"], minStaff:{ 日勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["看護師","准看護師"] },
  { id:"eiyo",   label:"栄養科",     icon:"🍱", shiftTypes:["早番","日勤"], minStaff:{ 早番:1, 日勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["管理栄養士","栄養士","調理師"] },
];

const getDeptRoles = (depts, deptId) => { const d = depts.find(x => x.id === deptId); return d?.roles || ["職員"]; };

const NAMES_K = ["田中 花子","鈴木 一郎","佐藤 美咲","山田 太郎","伊藤 さくら","中村 健","小林 由美","加藤 誠","吉田 幸","渡辺 亮"];
const buildStaff = () => {
  const out = [];
  ["kaigo1","kaigo2"].forEach(dept => {
    NAMES_K.forEach((name,i) => out.push({ id:`${dept}_${i}`, dept, name, role: i<3?"介護福祉士":i<7?"介護職員":"介護補助", nightOk: [0,1,3,5,7].includes(i), nightMax: 5, targetWork: 20, kyukoDays: 8, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {} }));
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

const getDays  = (y,m) => new Date(y,m+1,0).getDate();
const getWD    = (y,m,d) => ["日","月","火","水","木","金","土"][new Date(y,m,d).getDay()];
const isWE     = (y,m,d) => { const w=new Date(y,m,d).getDay(); return w===0||w===6; };
const monthKey = (y,m) => `${y}-${m+1}`;

function calcConsecutive(sShifts, d) {
  let cnt = 0;
  for (let i = d; i >= 1; i--) { if (WORK_TYPES.has(sShifts[i])) cnt++; else break; }
  return cnt;
}

function autoGenerate(staffList, dept, year, month, prevShifts, shiftTrend = {}) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
  const maxStaff = { 早番:1, 日勤:4, 遅番:1, 夜勤:1 };
  const PRIORITY = { 早番:1, 遅番:1, 日勤:2 };

  const getTrend = (s) => {
    if (!shiftTrend || Object.keys(shiftTrend).length === 0) return null;
    if (shiftTrend[s.name] && s.name !== '_months') return shiftTrend[s.name];
    const key = Object.keys(shiftTrend).filter(k => k !== '_months').find(k => k.includes(s.name) || s.name.includes(k));
    return key ? shiftTrend[key] : null;
  };

  const pickWithTrend = (s, available, cnts) => {
    const trend = getTrend(s);
    return [...available].sort((a, b) => {
      const dA = Math.max(0, (dept.minStaff[a]||0) - cnts[a]);
      const dB = Math.max(0, (dept.minStaff[b]||0) - cnts[b]);
      if (dA !== dB) return dB - dA;
      const pA = PRIORITY[a]??3, pB = PRIORITY[b]??3;
      if (pA !== pB) return pA - pB;
      const tA = trend ? (trend[a] || 0) : 0;
      const tB = trend ? (trend[b] || 0) : 0;
      if (Math.abs(tA - tB) > 0.05) return tB - tA;
      return cnts[a] - cnts[b];
    })[0];
  };

  const res = {};
  const ds = staffList.filter(s => s.dept === dept.id);
  ds.forEach(s => { res[s.id] = {}; });

  const consecWork = (id, d) => { let c = 0; for (let i = d; i >= 1; i--) { if (WORK_TYPES.has(res[id][i])) c++; else break; } return c; };
  const consecRest = (id, d) => { let c = 0; for (let i = d; i >= 1; i--) { if (REST_TYPES.has(res[id][i]) && res[id][i] !== "明け") c++; else break; } return c; };
  const consecRestFwd = (id, d) => { let c = 0; for (let i = d + 1; i <= days; i++) { if (REST_TYPES.has(res[id][i]) && res[id][i] !== "明け") c++; else break; } return c; };
  const canRest = (id, d) => {
    if (res[id][d - 1] === "明け") return false;
    return (consecRest(id, d - 1) + 1 + consecRestFwd(id, d)) <= 2;
  };

  // ★ステップ1: 希望休・希望勤務を最初にセット（最優先・絶対変更しない）
  ds.forEach(s => {
    // prevShiftsから希望休・有休を引き継ぎ
    Object.entries(prevShifts[s.id] || {}).forEach(([d, v]) => {
      if (v === "希望休" || v === "有休") res[s.id][Number(d)] = v;
    });
    // kiboByMonthの希望休
    (s.kiboByMonth?.[mk] || []).forEach(d => {
      res[s.id][Number(d)] = "希望休";
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

  // ★ステップ2: 夜勤配置（ロック済みの日・翌日がロックの人は候補から除外）
  if (dept.shiftTypes.includes("夜勤")) {
    const nightPool = ds.filter(s => s.nightOk);
    const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));
    for (let d = 1; d <= days; d++) {
      const already = ds.filter(s => res[s.id][d] === "夜勤").length;
      let need = (dept.minStaff["夜勤"] || 0) - already;
      if (need <= 0) continue;
      const canNight = (s) => {
        if (lockedDays[s.id].has(d)) return false; // その日がロック済み
        if (["夜勤","明け"].includes(res[s.id][d - 1])) return false;
        if (d + 1 <= days && lockedDays[s.id].has(d + 1) && res[s.id][d+1] !== "明け") return false; // 翌日がロック済み（明けを入れられない）
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

  const dayTypes = dept.shiftTypes.filter(s => s !== "夜勤");
  ds.forEach(s => {
    const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const kiboCount = Object.values(res[s.id]).filter(v => v === "希望休" || v === "有休").length;
    const restTarget = Math.max(0, totalTarget - kiboCount);
    for (let d = 1; d <= days; d++) {
      if (res[s.id][d]) continue;
      const alreadyRest = Object.values(res[s.id]).filter(v => REST_TYPES.has(v) && v !== "明け").length;
      if (alreadyRest >= restTarget) continue;
      let streak = 0;
      for (let i = d - 1; i >= 1; i--) { if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break; streak++; }
      if (streak >= maxConsec) res[s.id][d] = "休み";
    }
    const alreadyRest = Object.values(res[s.id]).filter(v => REST_TYPES.has(v) && v !== "明け").length;
    let need = restTarget - alreadyRest;
    if (need <= 0) return;
    const freeDaysAll = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
    const interval = Math.max(1, Math.floor(freeDaysAll.length / (need + 1)));
    const trend = getTrend(s);
    const dowRestRate = trend?.dowRestRate || null;
    const candidates = freeDaysAll.filter(d => canRest(s.id, d)).sort((a, b) => {
      let sa = 0, sb = 0;
      for (let i = a - 1; i >= 1; i--) { if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break; sa++; }
      for (let i = b - 1; i >= 1; i--) { if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break; sb++; }
      if (sb !== sa) return sb - sa;
      if (dowRestRate) {
        const rA = dowRestRate[(new Date(year, month, a).getDay() + 6) % 7] ?? 0;
        const rB = dowRestRate[(new Date(year, month, b).getDay() + 6) % 7] ?? 0;
        if (Math.abs(rA - rB) > 0.05) return rB - rA;
      }
      return a - b;
    });
    let lastRest = 0;
    for (const d of candidates) {
      if (need <= 0) break;
      if (res[s.id][d] || !canRest(s.id, d)) continue;
      let streak = 0;
      for (let i = d - 1; i >= 1; i--) { if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break; streak++; }
      const isUrgent = streak >= maxConsec - 1;
      const remainCands = candidates.filter(fd => fd > d && !res[s.id][fd] && canRest(s.id, fd)).length;
      if (!isUrgent && remainCands >= need && (d - lastRest) < interval) continue;
      res[s.id][d] = "休み"; lastRest = d; need--;
    }
  });

  if (dayTypes.length === 0) {
    ds.forEach(s => { for (let d = 1; d <= days; d++) { if (!res[s.id][d]) res[s.id][d] = "休み"; } });
  } else {
    for (let d = 1; d <= days; d++) {
      const cnts = {};
      dayTypes.forEach(k => { cnts[k] = ds.filter(s => res[s.id][d] === k).length; });
      const freeStaff = ds.filter(s => !res[s.id][d]).sort((a, b) => consecWork(a.id, d - 1) - consecWork(b.id, d - 1));
      for (const s of freeStaff) {
        if (res[s.id][d-1] === "夜勤") { res[s.id][d] = "明け"; continue; }
        if ((consecWork(s.id, d - 1) + 1) > maxConsec) { res[s.id][d] = "休み"; continue; }
        let available = dayTypes.filter(k => cnts[k] < (maxStaff[k] ?? 99));
        if (s.role === "介護補助" || s.role === "介護助手") available = available.filter(k => k === "日勤");
        if (res[s.id][d - 1] === "遅番") available = available.filter(k => k !== "早番");
        if (available.length === 0) { res[s.id][d] = "休み"; continue; }
        const pick = pickWithTrend(s, available, cnts);
        res[s.id][d] = pick; cnts[pick] = (cnts[pick]||0) + 1;
      }
      ds.forEach(s => { if (!res[s.id][d]) res[s.id][d] = "休み"; });
    }
    ds.forEach(s => {
      const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const kiboCount = Object.values(res[s.id]).filter(v => v === "希望休" || v === "有休").length;
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
          for (let i = d + 1; i <= days; i++) { if (WORK_TYPES.has(res[s.id][i])) actualAfter++; else break; }
          if (actualBefore + 1 + actualAfter > maxConsec) continue;
          const dayCnts = {};
          dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
          let av = dayTypes.filter(k => dayCnts[k] < (maxStaff[k] ?? 99));
          if (s.role === "介護補助" || s.role === "介護助手") av = av.filter(k => k === "日勤");
          if (res[s.id][d - 1] === "遅番") av = av.filter(k => k !== "早番");
          if (!av.length) {
            const forceShift = (s.role === "介護補助" || s.role === "介護助手") ? "日勤" : dayTypes.find(k => res[s.id][d - 1] !== "遅番" || k !== "早番") || "日勤";
            res[s.id][d] = forceShift; excess--; continue;
          }
          const pick = [...av].sort((a, b) => { const dA = Math.max(0,(dept.minStaff[a]||0)-dayCnts[a]); const dB = Math.max(0,(dept.minStaff[b]||0)-dayCnts[b]); if (dA!==dB) return dB-dA; return (PRIORITY[a]??3)-(PRIORITY[b]??3); })[0];
          res[s.id][d] = pick; excess--;
        }
      }
      {
        const currentRest = Object.values(res[s.id]).filter(v => v === "休み").length;
        let shortage = target - currentRest;
        if (shortage > 0) {
          const workDays = Object.entries(res[s.id]).filter(([, v]) => WORK_TYPES.has(v)).map(([d]) => +d)
            .filter(d => res[s.id][d - 1] !== "明け" && res[s.id][d + 1] !== "明け" && canRest(s.id, d))
            .sort((a, b) => consecWork(s.id, b - 1) - consecWork(s.id, a - 1));
          for (const d of workDays) { if (shortage <= 0) break; if (!canRest(s.id, d)) continue; res[s.id][d] = "休み"; shortage--; }
        }
      }
      for (let d = 1; d <= days; d++) {
        if (res[s.id][d] !== "休み") continue;
        if (lockedDays[s.id].has(d)) continue;
        if (res[s.id][d - 1] === "明け") continue;
        if (res[s.id][d + 1] === "明け") continue;
        if (consecRest(s.id, d) <= 2) continue;
        if ((consecWork(s.id, d - 1) + 1) > maxConsec) continue;
        const fixCnts = {};
        dayTypes.forEach(k => { fixCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
        let av = dayTypes.filter(k => fixCnts[k] < (maxStaff[k] ?? 99));
        if (s.role === "介護補助" || s.role === "介護助手") av = av.filter(k => k === "日勤");
        if (!av.length) continue;
        res[s.id][d] = [...av].sort((a, b) => fixCnts[a] - fixCnts[b])[0];
      }
    });
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
  return { shifts: res, warnings };
}

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
      for(let d=1;d<=days;d++){ const v=shifts[s.id]?.[d]||""; cells.push(v); if(WORK_TYPES.has(v)) workCnt++; if(v==="夜勤") nightCnt++; if(REST_TYPES.has(v)&&v!=="明け") restCnt++; }
      cells.push(workCnt, nightCnt, restCnt);
      rows.push(cells.map(c=>`"${c}"`).join(","));
    });
    rows.push("");
  });
  return "\uFEFF" + rows.join("\n");
}

function buildPrintHTML(depts, staffList, allShifts, year, month, selectedDepts) {
  const days = getDays(year, month);
  const WD = ["日","月","火","水","木","金","土"];
  const TAG = (t) => '<' + t + '>';
  const CTAG = (t) => '</' + t + '>';
  let html = TAG('!DOCTYPE html')+TAG('html lang="ja"')+TAG('head')+TAG('meta charset="UTF-8"')+TAG('title')+`シフト表 ${year}年${month+1}月`+CTAG('title')+TAG('style')+`body{font-family:'Noto Sans JP',sans-serif;font-size:10px;margin:16px;color:#111;}h2{font-size:13px;margin:14px 0 5px;}table{border-collapse:collapse;width:100%;margin-bottom:20px;}th,td{border:1px solid #ccc;padding:2px 3px;text-align:center;font-size:9px;white-space:nowrap;}th{background:#e8f0fe;font-weight:bold;}.name{text-align:left;min-width:70px;}.we{background:#fff0f6;}@media print{body{margin:4px;}h2{font-size:10px;}th,td{font-size:8px;padding:1px 2px;}}`+CTAG('style')+CTAG('head')+TAG('body');
  depts.filter(d=>selectedDepts.includes(d.id)).forEach(dept => {
    const shifts = allShifts[dept.id] || {};
    html += TAG('h2')+`${dept.icon} ${dept.label}　${year}年${month+1}月`+CTAG('h2');
    html += TAG('table')+TAG('thead')+TAG('tr')+TAG('th class="name"')+'氏名'+CTAG('th');
    for(let d=1;d<=days;d++){ const wd=WD[new Date(year,month,d).getDay()]; html += TAG(`th class="${(wd==="日"||wd==="土")?"we":""}"`)+''+d+'<br>'+wd+CTAG('th'); }
    html += TAG('th')+'勤務'+CTAG('th')+TAG('th')+'夜勤'+CTAG('th')+TAG('th')+'休'+CTAG('th')+CTAG('tr')+CTAG('thead')+TAG('tbody');
    staffList.filter(s=>s.dept===dept.id).forEach(s => {
      let w=0,n=0,r=0;
      html += TAG('tr')+TAG('td class="name"')+s.name+CTAG('td');
      for(let d=1;d<=days;d++){ const v=shifts[s.id]?.[d]||""; if(WORK_TYPES.has(v)) w++; if(v==="夜勤") n++; if(REST_TYPES.has(v)&&v!=="明け") r++; html += TAG('td')+(SHIFTS[v]?.short||"－")+CTAG('td'); }
      html += TAG('td')+w+CTAG('td')+TAG('td')+(n||"－")+CTAG('td')+TAG('td')+r+CTAG('td')+CTAG('tr');
    });
    html += CTAG('tbody')+CTAG('table');
  });
  return html + CTAG('body')+CTAG('html');
}

function triggerDownload(content, filename, type) {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (e) {
    const a = document.createElement("a"); a.href=`data:${type},${encodeURIComponent(content)}`; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

function parseShiftExcel(workbook) {
  const SHIFT_MAP = {"早":"早番","早番":"早番","日":"日勤","日勤":"日勤","遅":"遅番","遅番":"遅番","夜":"夜勤","夜勤":"夜勤","明":"明け","明け":"明け","休":"休み","休み":"休み","公":"休み","公休":"休み","有":"有休","有休":"有休","有給":"有休","希":"希望休","希望休":"希望休","E":"早番","D":"日勤","L":"遅番","N":"夜勤"};
  const REST_SET = new Set(["休み","有休","希望休"]);
  const SHIFT_SET = new Set(Object.keys(SHIFT_MAP));
  const COUNT_KEYS = ["早番","日勤","遅番","夜勤"];
  const trendMap = {};
  const processedYearMonths = new Set();
  workbook.SheetNames.forEach(sheetName => {
    if (/祝日|holidays|calendar|カレンダー/i.test(sheetName)) return;
    const wsDates = workbook.Sheets[sheetName];
    const dataCellDates = window.XLSX.utils.sheet_to_json(wsDates, { header: 1, defval: "", cellDates: true, raw: false });
    const dataRaw = window.XLSX.utils.sheet_to_json(wsDates, { header: 1, defval: "", raw: true });
    if (!dataRaw || dataRaw.length < 3) return;
    const sampleDataRows = dataRaw.filter(row => row && row.filter(c => SHIFT_SET.has(String(c ?? "").trim())).length >= 5);
    if (sampleDataRows.length === 0) return;
    let detectedShiftStart = -1;
    sampleDataRows.forEach(row => { row.forEach((cell, ci) => { if (SHIFT_SET.has(String(cell ?? "").trim()) && (detectedShiftStart === -1 || ci < detectedShiftStart)) detectedShiftStart = ci; }); });
    if (detectedShiftStart < 0) return;
    const nameColVotes = {};
    sampleDataRows.slice(0, 10).forEach(row => { for (let ci = 0; ci < detectedShiftStart; ci++) { const val = String(row[ci] ?? "").trim(); if (val.length >= 2 && !/^\d/.test(val) && !SHIFT_SET.has(val)) nameColVotes[ci] = (nameColVotes[ci] || 0) + 1; } });
    const votedNameCol = Object.entries(nameColVotes).sort((a,b) => b[1]-a[1])[0];
    if (!votedNameCol) return;
    const detectedNameCol = +votedNameCol[0];
    const colToDow = {};
    let sheetYearMonth = null, sy = null, sm = null;
    const row1Raw = dataRaw[0] || [];
    for (let ci = 0; ci < Math.min(row1Raw.length, 12); ci++) { const v = row1Raw[ci]; if (typeof v === "number" && v >= 2000 && v <= 2100) sy = v; if (typeof v === "number" && v >= 1 && v <= 12 && sy && ci > 0) { sm = v; break; } }
    let dateRowFound = false;
    for (const row of dataCellDates) {
      if (!row) continue;
      const dateCells = row.map((v, ci) => ({ ci, v })).filter(({ v }) => v instanceof Date && !isNaN(v) && v.getFullYear() > 2000);
      if (dateCells.length >= 5) { dateCells.forEach(({ ci, v }) => { colToDow[ci] = (v.getDay() + 6) % 7; }); const firstDate = dateCells[0].v; sheetYearMonth = `${firstDate.getFullYear()}-${firstDate.getMonth() + 1}`; dateRowFound = true; break; }
    }
    if (!dateRowFound) {
      for (const row of dataRaw) {
        if (!row) continue;
        const serialCells = row.map((v, ci) => ({ ci, v })).filter(({ v }) => typeof v === "number" && v > 40000 && v < 55000);
        if (serialCells.length >= 5) { serialCells.forEach(({ ci, v }) => { const jsDate = new Date(Math.round((v - 25569) * 86400 * 1000)); if (!isNaN(jsDate) && jsDate.getFullYear() > 2000) { colToDow[ci] = (jsDate.getDay() + 6) % 7; if (!sheetYearMonth) sheetYearMonth = `${jsDate.getFullYear()}-${jsDate.getMonth() + 1}`; } }); if (Object.keys(colToDow).length >= 5) { dateRowFound = true; break; } }
      }
    }
    if (!dateRowFound && sy && sm) { for (let i = 0; i < 31; i++) { const col = detectedShiftStart + i; const d = new Date(sy, sm - 1, i + 1); if (d.getMonth() === sm - 1) colToDow[col] = (d.getDay() + 6) % 7; } sheetYearMonth = `${sy}-${sm}`; }
    if (sheetYearMonth) { if (processedYearMonths.has(sheetYearMonth)) return; processedYearMonths.add(sheetYearMonth); } else return;
    dataRaw.forEach(row => {
      if (!row || row.length < detectedShiftStart + 3) return;
      const nameCell = String(row[detectedNameCol] ?? "").trim();
      if (!nameCell || nameCell.length < 2) return;
      if (/^[\d\s★\-＝=①②③◎●▲]/.test(nameCell)) return;
      if (["職員","名前","氏名","スタッフ","役職","担当"].includes(nameCell)) return;
      if (!isNaN(Number(nameCell))) return;
      if (/^\d{1,2}[/月日]/.test(nameCell)) return;
      const counts = { 早番:0, 日勤:0, 遅番:0, 夜勤:0 };
      const dowRest = [0,0,0,0,0,0,0], dowTotal = [0,0,0,0,0,0,0];
      let total = 0;
      for (let c = detectedShiftStart; c < Math.min(row.length, detectedShiftStart + 35); c++) {
        const cell = String(row[c] ?? "").trim(); if (!cell) continue;
        const normalized = SHIFT_MAP[cell]; if (!normalized) continue;
        const dow = colToDow[c]; if (dow !== undefined) { dowTotal[dow]++; if (REST_SET.has(normalized)) dowRest[dow]++; }
        if (COUNT_KEYS.includes(normalized)) { counts[normalized]++; total++; }
      }
      if (total < 3) return;
      if (!trendMap[nameCell]) trendMap[nameCell] = { 早番:0, 日勤:0, 遅番:0, 夜勤:0, total:0, dowRest:[0,0,0,0,0,0,0], dowTotal:[0,0,0,0,0,0,0] };
      COUNT_KEYS.forEach(k => { trendMap[nameCell][k] += counts[k]; });
      trendMap[nameCell].total += total;
      for (let i = 0; i < 7; i++) { trendMap[nameCell].dowRest[i] += dowRest[i]; trendMap[nameCell].dowTotal[i] += dowTotal[i]; }
    });
  });
  const result = {};
  Object.entries(trendMap).forEach(([name, counts]) => {
    if (counts.total < 3) return;
    const shiftTrend = {};
    COUNT_KEYS.forEach(k => { shiftTrend[k] = counts.total > 0 ? counts[k] / counts.total : 0; });
    result[name] = { ...shiftTrend, dowRestRate: counts.dowTotal.map((tot, i) => tot > 0 ? counts.dowRest[i] / tot : null), _workTotal: counts.total };
  });
  result._months = Array.from(processedYearMonths).sort();
  return result;
}

function ShiftBadge({ type }) {
  const s = SHIFTS[type]||SHIFTS[""];
  if (!type) return <span style={{color:"#8ecece",fontSize:10}}>－</span>;
  return <span style={{background:s.bg,color:s.color,border:`1px solid ${s.border}`,borderRadius:3,padding:"1px 4px",fontSize:10,fontWeight:800,display:"inline-block",minWidth:22,textAlign:"center",lineHeight:"18px"}}>{s.short}</span>;
}

function ContextMenu({ x, y, onSelect, onClose }) {
  const ref = useRef();
  useEffect(() => { const h = (e) => { if(ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [onClose]);
  const [pos, setPos] = useState({x,y});
  useEffect(() => { setPos({ x: Math.min(x, window.innerWidth-200), y: Math.min(y, window.innerHeight-320) }); }, [x,y]);
  return (
    <div ref={ref} style={{position:"fixed",left:pos.x,top:pos.y,zIndex:999,background:"#ffffff",border:"1px solid #90cbc8",borderRadius:10,padding:6,boxShadow:"0 12px 40px #000a",display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,minWidth:170}}>
      {SHIFT_KEYS_MANUAL.map(k => { const s=SHIFTS[k]; return <button key={k||"empty"} onClick={()=>onSelect(k)} style={{background:s.bg||"#ffffff",color:s.color,border:`1px solid ${s.border}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}><span style={{minWidth:18,height:18,background:k?s.bg:"transparent",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>{s.short}</span><span style={{fontSize:11,color:"#6ab5b2"}}>{k||"クリア"}</span></button>; })}
    </div>
  );
}

const SHIFT_REQ_TYPES = ["早番","日勤","遅番","夜勤","明け","休み","有休"];
function KiboCalendar({ year, month, selected, onChange, shiftRequests, onShiftRequests, deptId }) {
  const days = getDays(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i=0; i<firstDow; i++) cells.push(null);
  for (let d=1; d<=days; d++) cells.push(d);
  const dept = DEFAULT_DEPTS.find(d=>d.id===deptId);
  const availableReqTypes = SHIFT_REQ_TYPES.filter(k => k==="休み"||k==="有休"||k==="明け"||dept?.shiftTypes.includes(k));
  const [selectedDay, setSelectedDay] = useState(null);

  const toggleKibo = (d) => {
    if (!d) return;
    if (shiftRequests[d]) return; // シフト希望が入っている日は希望休トグル不可
    const isKibo = selected.includes(d);
    const next = isKibo ? selected.filter(x=>x!==d) : [...selected,d];
    onChange(next);
  };
  const setShiftReq = (d, shiftKey) => {
    // 希望休から外す
    onChange(selected.filter(x=>x!==d));
    const nr = {...shiftRequests};
    if (nr[d] === shiftKey) delete nr[d];
    else nr[d] = shiftKey;
    onShiftRequests(nr);
    setSelectedDay(null);
  };
  const clearDay = (d) => {
    onChange(selected.filter(x=>x!==d));
    const nr = {...shiftRequests}; delete nr[d]; onShiftRequests(nr);
    setSelectedDay(null);
  };
  const clearAll = () => { onChange([]); onShiftRequests({}); setSelectedDay(null); };

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["日","月","火","水","木","金","土"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:10,color:i===0?"#f87171":i===6?"#2BBFBA":"#3a8a87",padding:"2px 0"}}>{w}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
        {cells.map((d,i) => {
          if (!d) return <div key={i}/>;
          const isKibo=selected.includes(d), reqShift=shiftRequests[d], dow=(firstDow+d-1)%7, we=dow===0||dow===6, s=reqShift?SHIFTS[reqShift]:null;
          const isSelected = selectedDay===d;
          return <button key={d} onClick={()=>{ if(reqShift){setSelectedDay(isSelected?null:d);}else if(isKibo){toggleKibo(d);}else{setSelectedDay(isSelected?null:d);} }} style={{background:isSelected?"#ffe0b2":isKibo?"#fff0f0":reqShift?s.bg:"transparent",border:isSelected?"2px solid #2BBFBA":isKibo?"1px solid #dc2626":reqShift?`1px solid ${s.border}`:"1px solid #0e3a38",borderRadius:5,padding:"3px 1px",cursor:"pointer",color:isKibo?"#f87171":reqShift?s.color:we?"#2BBFBA":"#5a9e9b",fontSize:10,fontWeight:(isKibo||reqShift||isSelected)?800:400,display:"flex",flexDirection:"column",alignItems:"center",gap:1,minHeight:32}}><span>{d}</span>{isKibo&&<span style={{fontSize:8,lineHeight:1}}>希休</span>}{reqShift&&<span style={{fontSize:8,lineHeight:1}}>{SHIFTS[reqShift].short}</span>}{!isKibo&&!reqShift&&isSelected&&<span style={{fontSize:7,lineHeight:1}}>選択</span>}</button>;
        })}
      </div>
      {/* 選択中の日のシフト指定UI */}
      {selectedDay&&(
        <div style={{background:"#ffffff",border:"1px solid #90cbc8",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
          <div style={{fontSize:11,color:"#3a8a87",marginBottom:6,fontWeight:700}}>{selectedDay}日の設定</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
            <button onClick={()=>{ onChange(selected.includes(selectedDay)?selected:[...selected,selectedDay]); const nr={...shiftRequests};delete nr[selectedDay];onShiftRequests(nr);setSelectedDay(null); }} style={{background:"#fff0f0",border:"1px solid #e07070",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#c44b4b"}}>希 希望休</button>
            {availableReqTypes.map(k=>{const s=SHIFTS[k];return<button key={k} onClick={()=>setShiftReq(selectedDay,k)} style={{background:shiftRequests[selectedDay]===k?"#8ecece":s.bg,border:`1px solid ${s.border}`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700,color:s.color}}>{s.short} {k}</button>;})}
            {(selected.includes(selectedDay)||shiftRequests[selectedDay])&&<button onClick={()=>clearDay(selectedDay)} style={{background:"#d5edeb",border:"1px solid #90cbc8",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#3a8a87"}}>クリア</button>}
          </div>
        </div>
      )}
      <div style={{marginTop:4,fontSize:11,color:"#3a8a87",display:"flex",gap:12,alignItems:"center"}}>
        <span>希望休：<span style={{color:"#f87171",fontWeight:700}}>{selected.length}日</span></span>
        <span>シフト希望：<span style={{color:"#2BBFBA",fontWeight:700}}>{Object.keys(shiftRequests).length}件</span></span>
        {(selected.length>0||Object.keys(shiftRequests).length>0)&&<button onClick={clearAll} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:11,marginLeft:"auto"}}>全クリア</button>}
      </div>
      <div style={{fontSize:10,color:"#6ab5b2",marginTop:4}}>※ 日付タップ→種別を選択。希望休・シフト希望は自動生成で最優先されます。</div>
    </div>
  );
}

const INPUT_STYLE = { width:"100%", background:"#f0fffe", border:"1px solid #90cbc8", borderRadius:7, color:"#1a3635", padding:"8px 10px", fontSize:13, fontFamily:"'Noto Sans JP',sans-serif", boxSizing:"border-box", outline:"none" };

function StaffModal({ data, deptId, depts, year, month, onSave, onClose }) {
  const isNew = !data;
  const mk = monthKey(year, month);
  const deptRoles = getDeptRoles(depts, deptId);
  const [form, setForm] = useState(() => {
    const base = data ? {...data} : { name:"", role:deptRoles[0]||"職員", nightOk:false, nightMax:5, targetWork:20, kyukoDays:8, kiboByMonth:{}, shiftRequestsByMonth:{} };
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
  const kyukoThisMonth = form.kyukoDaysByMonth?.[mk] ?? form.kyukoDays ?? 8;
  const setKyukoThisMonth = (v) => set("kyukoDaysByMonth",{...(form.kyukoDaysByMonth||{}),[mk]:+v});
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:460,boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#1a3635",fontSize:15,fontWeight:900}}>{isNew?"スタッフ追加":"スタッフ編集"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        <div style={{marginBottom:12}}><div style={{color:"#3a8a87",fontSize:11,marginBottom:4}}>氏名</div><input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={INPUT_STYLE} placeholder="例：田中 花子"/></div>
        <div style={{marginBottom:12}}><div style={{color:"#3a8a87",fontSize:11,marginBottom:4}}>役職</div><select value={form.role} onChange={e=>set("role",e.target.value)} style={INPUT_STYLE}>{deptRoles.map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><div style={{color:"#3a8a87",fontSize:11,marginBottom:4}}>目標勤務日数</div><input type="number" value={form.targetWork} min={1} max={31} onChange={e=>set("targetWork",+e.target.value)} style={INPUT_STYLE}/></div>
          <div><div style={{color:"#2BBFBA",fontSize:11,marginBottom:4,fontWeight:700}}>{year}年{month+1}月の休み日数</div><input type="number" value={kyukoThisMonth} min={0} max={20} onChange={e=>setKyukoThisMonth(e.target.value)} style={{...INPUT_STYLE,color:"#2BBFBA",fontWeight:800}}/></div>
        </div>
        {["kaigo1","kaigo2"].includes(deptId)&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:10}}><input type="checkbox" checked={!!form.nightOk} onChange={e=>set("nightOk",e.target.checked)} style={{width:15,height:15,accentColor:"#2BBFBA"}}/><span style={{color:"#6ab5b2",fontSize:13}}>夜勤対応可</span></label>
            {form.nightOk&&<div><div style={{color:"#3a8a87",fontSize:11,marginBottom:4}}>夜勤 月間上限回数</div><input type="number" value={form.nightMax} min={0} max={15} onChange={e=>set("nightMax",+e.target.value)} style={{...INPUT_STYLE,width:80}}/></div>}
          </div>
        )}
        <div style={{fontSize:11,color:"#8ecece",fontWeight:700,marginBottom:10}}>▍ {year}年{month+1}月 希望休</div>
        <div style={{background:"#d5edeb",borderRadius:8,padding:12,border:"1px solid #90cbc8"}}>
          <KiboCalendar year={year} month={month} selected={kiboSelected} onChange={setKibo} shiftRequests={shiftRequests} onShiftRequests={setShiftRequests} deptId={deptId}/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={()=>form.name&&onSave(form)} style={{flex:1,background:"linear-gradient(135deg,#2BBFBA,#b07fd4)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>保存</button>
          <button onClick={onClose} style={{flex:1,background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

const SHIFT_TYPE_OPTIONS = ["早番","日勤","遅番","夜勤"];
const DEPT_ICONS = ["🏠","🏢","🏥","💉","📋","🍱","🌸","⭐","🔵","🟢","🟡","🟠","🔴","💜"];
function DeptSettingModal({ dept, onSave, onDelete, onClose, isNew, onConfirm }) {
  const [label,setLabel]=useState(dept?.label||""), [icon,setIcon]=useState(dept?.icon||"🏠"), [shiftTypes,setShiftTypes]=useState(dept?.shiftTypes||["日勤"]), [minStaff,setMinStaff]=useState(dept?.minStaff||{日勤:1}), [maxConsec,setMaxConsec]=useState(dept?.maxConsecutive||5), [defKyuko,setDefKyuko]=useState(dept?.defaultKyukoDays||8), [rolesText,setRolesText]=useState((dept?.roles||["職員"]).join("\n"));
  const toggleShiftType = (k) => { setShiftTypes(prev => { const next=prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]; setMinStaff(p=>{const n={};next.forEach(s=>{n[s]=p[s]||1;});return n;}); return next; }); };
  const handleSave = () => { if(!label.trim()){alert("部署名を入力してください");return;} if(shiftTypes.length===0){alert("シフト種別を選択してください");return;} const roles=rolesText.split("\n").map(r=>r.trim()).filter(Boolean); onSave({id:dept?.id||`dept_${Date.now()}`,label:label.trim(),icon,shiftTypes,minStaff,maxConsecutive:maxConsec,defaultKyukoDays:defKyuko,roles:roles.length>0?roles:["職員"]}); };
  const LS = { fontSize:11, color:"#3a8a87", fontWeight:700, marginBottom:5, display:"block" };
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:210,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>{isNew?"➕ 部署を追加":"✏️ 部署を編集"}</div><button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button></div>
        <label style={LS}>アイコン</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>{DEPT_ICONS.map(ic=><button key={ic} onClick={()=>setIcon(ic)} style={{width:36,height:36,borderRadius:8,fontSize:20,border:"none",cursor:"pointer",background:icon===ic?"#8ecece":"#d5edeb",outline:icon===ic?"2px solid #2BBFBA":"none"}}>{ic}</button>)}</div>
        <label style={LS}>部署名</label>
        <input style={{...INPUT_STYLE,marginBottom:14}} value={label} onChange={e=>setLabel(e.target.value)} placeholder="例：介護部 3階"/>
        <label style={LS}>シフト種別</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{SHIFT_TYPE_OPTIONS.map(k=>{const s=SHIFTS[k],checked=shiftTypes.includes(k);return <button key={k} onClick={()=>toggleShiftType(k)} style={{background:checked?s.bg:"#d5edeb",border:`1px solid ${checked?s.border:"#b8deda"}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",color:checked?s.color:"#2a5a57",fontSize:13,fontWeight:checked?700:400,display:"flex",alignItems:"center",gap:6}}><span>{checked?"✅":"○"}</span>{k}</button>;})}</div>
        {shiftTypes.length>0&&<div style={{background:"#d5edeb",border:"1px solid #0e3a38",borderRadius:8,padding:"10px 12px",marginBottom:14}}><div style={{fontSize:11,color:"#3a8a87",marginBottom:8}}>最低配置人数</div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.map(k=><div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:SHIFTS[k]?.color,fontWeight:700}}>{k}</span><input type="number" min={0} max={10} value={minStaff[k]||0} onChange={e=>setMinStaff(p=>({...p,[k]:+e.target.value}))} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:11,color:"#2a5a57"}}>名</span></div>)}</div></div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><label style={LS}>最大連続勤務日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><input type="number" min={3} max={7} value={maxConsec} onChange={e=>setMaxConsec(+e.target.value)} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:12,color:"#2a5a57"}}>日</span></div></div>
          <div><label style={LS}>デフォルト公休日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><input type="number" min={4} max={15} value={defKyuko} onChange={e=>setDefKyuko(+e.target.value)} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:12,color:"#2a5a57"}}>日</span></div></div>
        </div>
        <label style={LS}>役職一覧（1行に1つ）</label>
        <textarea value={rolesText} onChange={e=>setRolesText(e.target.value)} rows={4} placeholder={"介護福祉士\n介護職員\n介護補助"} style={{...INPUT_STYLE,resize:"vertical",lineHeight:1.7,marginBottom:18}}/>
        <div style={{display:"flex",gap:10}}>
          <button onClick={handleSave} style={{flex:1,background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",border:"none",borderRadius:9,padding:"12px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>{isNew?"➕ 追加する":"💾 保存する"}</button>
          {!isNew&&onDelete&&<button onClick={()=>onConfirm(`「${label}」を削除します。この部署のスタッフとシフトデータもすべて削除されます。`,()=>onDelete(dept.id),"削除する")} style={{background:"#fff0f0",border:"1px solid #e07070",borderRadius:9,padding:"12px 14px",cursor:"pointer",color:"#c44b4b",fontSize:12,fontWeight:700}}>🗑 削除</button>}
          <button onClick={onClose} style={{background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:9,padding:"12px 16px",cursor:"pointer",fontSize:13}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onOk, onCancel, okLabel="削除" }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#00000099",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{background:"#f5fffe",border:"1px solid #b0e0de",borderRadius:14,padding:24,width:"100%",maxWidth:340,boxShadow:"0 20px 60px #0003"}}>
        <div style={{fontSize:14,color:"#1a3635",lineHeight:1.7,marginBottom:20,whiteSpace:"pre-wrap"}}>{message}</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onOk} style={{flex:1,background:"#fff0f0",border:"1px solid #e07070",borderRadius:9,padding:"12px 0",cursor:"pointer",color:"#c44b4b",fontSize:14,fontWeight:800}}>{okLabel}</button>
          <button onClick={onCancel} style={{flex:1,background:"#ffffff",border:"1px solid #90cbc8",borderRadius:9,padding:"12px 0",cursor:"pointer",color:"#3a8a87",fontSize:14}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

function ClearModal({ deptLabel, onClearDept, onClearAll, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #450a0a",borderRadius:14,padding:24,width:"100%",maxWidth:360,boxShadow:"0 30px 80px #000"}}>
        <div style={{fontSize:15,fontWeight:900,color:"#f87171",marginBottom:6}}>🗑 シフトのクリア</div>
        <div style={{fontSize:12,color:"#5a9e9b",marginBottom:20}}>クリアする範囲を選んでください。この操作は元に戻せません。</div>
        <button onClick={onClearDept} style={{width:"100%",background:"#fff0f0",border:"1px solid #7f1d1d",borderRadius:9,padding:"14px 16px",cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",gap:12,textAlign:"left"}}><span style={{fontSize:22}}>🏠</span><div><div style={{fontSize:13,fontWeight:800,color:"#fca5a5"}}>{deptLabel} のみクリア</div><div style={{fontSize:11,color:"#7f1d1d",marginTop:2}}>現在表示中のフロアのシフトだけ削除</div></div></button>
        <button onClick={onClearAll} style={{width:"100%",background:"#fff0f0",border:"1px solid #991b1b",borderRadius:9,padding:"14px 16px",cursor:"pointer",marginBottom:18,display:"flex",alignItems:"center",gap:12,textAlign:"left"}}><span style={{fontSize:22}}>🏢</span><div><div style={{fontSize:13,fontWeight:800,color:"#ef4444"}}>全部署をクリア</div><div style={{fontSize:11,color:"#991b1b",marginTop:2}}>すべてのフロアのシフトを削除</div></div></button>
        <button onClick={onClose} style={{width:"100%",background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"10px 0",cursor:"pointer",fontSize:13}}>キャンセル</button>
      </div>
    </div>
  );
}

function ExcelImportModal({ onImport, onReset, onClose, currentTrend, onConfirm }) {
  const [status, setStatus] = useState("idle"), [preview, setPreview] = useState(null), [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef(null);
  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!window.XLSX) { setErrorMsg("ライブラリ読み込み中…"); setStatus("error"); return; }
    setStatus("parsing"); setErrorMsg("");
    try { const buf=await file.arrayBuffer(); const wb=window.XLSX.read(buf,{type:"array"}); const trend=parseShiftExcel(wb); if(Object.keys(trend).length===0){setErrorMsg("シフトデータを読み取れませんでした。");setStatus("error");if(fileRef.current)fileRef.current.value="";return;} setPreview(trend); setStatus("done"); }
    catch(err) { setErrorMsg("読み込み失敗: "+err.message); setStatus("error"); }
    finally { if(fileRef.current)fileRef.current.value=""; }
  };
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div><div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>📊 過去シフトから傾向を学習</div><div style={{fontSize:11,color:"#3a8a87",marginTop:3}}>過去のExcelシフト表を読み込んで自動生成に反映</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button></div>
        {currentTrend&&Object.keys(currentTrend).filter(k=>k!=='_months').length>0&&(<div style={{background:"#e8f5ee",border:"1px solid #14532d",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11}}><div style={{color:"#5cb87a",fontWeight:700,marginBottom:4}}>✅ 現在 {Object.keys(currentTrend).filter(k=>k!=='_months').length} 名分の傾向データを保持中</div><button onClick={()=>onConfirm('傾向データをリセットします。よろしいですか？',()=>{try{localStorage.removeItem('shiftNavi_shiftTrend');}catch{}onReset();},'リセット')} style={{background:'#fff0f0',border:'1px solid #e07070',borderRadius:5,color:'#c44b4b',fontSize:10,padding:'2px 8px',cursor:'pointer'}}>🗑 リセット</button></div>)}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{display:"none"}}/>
        <button onClick={()=>fileRef.current?.click()} style={{width:"100%",background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",border:"none",borderRadius:9,padding:"13px 0",cursor:"pointer",fontSize:14,fontWeight:800,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>📂 Excelファイルを選択</button>
        {status==="parsing"&&<div style={{textAlign:"center",color:"#2BBFBA",padding:"16px 0"}}>⏳ 解析中…</div>}
        {status==="error"&&<div style={{background:"#fff0f0",border:"1px solid #dc2626",borderRadius:8,padding:"10px 14px",color:"#f87171",fontSize:12,marginBottom:14}}>{errorMsg}</div>}
        {status==="done"&&preview&&(<div><div style={{color:"#5cb87a",fontSize:13,fontWeight:700,marginBottom:6}}>✅ {Object.keys(preview).filter(k=>k!=='_months').length} 名分のデータを読み込みました</div><div style={{display:"flex",gap:10}}><button onClick={()=>onImport(preview)} style={{flex:1,background:"linear-gradient(135deg,#2d8a52,#2a7a6e)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>✅ 適用する</button><button onClick={onClose} style={{flex:1,background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button></div></div>)}
        {status==="idle"&&<button onClick={onClose} style={{width:"100%",background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>閉じる</button>}
      </div>
    </div>
  );
}

function BulkKyukoModal({ depts, staffList, year, month, onApply, onClose }) {
  const mk = monthKey(year, month);
  const initValues = () => { const vals={}; depts.forEach(d=>{const ds=staffList.filter(s=>s.dept===d.id);if(ds.length===0)return;const first=ds[0];vals[d.id]=first.kyukoDaysByMonth?.[mk]??first.kyukoDays??8;}); return vals; };
  const [values, setValues] = useState(initValues);
  const setVal = (deptId, v) => setValues(prev=>({...prev,[deptId]:Math.max(0,Math.min(20,+v||0))}));
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:400,boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div><div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>📅 休み日数 一括設定</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>{year}年{month+1}月</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button></div>
        <div style={{fontSize:11,color:"#2a5a57",marginBottom:16,marginTop:8,background:"#d5edeb",borderRadius:7,padding:"8px 12px",border:"1px solid #0e3a38"}}>💡 部署ごとに設定した日数を、その部署の全スタッフに一括適用します。</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {depts.map(d=>{const cnt=staffList.filter(s=>s.dept===d.id).length;if(cnt===0)return null;return(<div key={d.id} style={{display:"flex",alignItems:"center",gap:12,background:"#d5edeb",borderRadius:9,padding:"10px 14px",border:"1px solid #90cbc8"}}><span style={{fontSize:20}}>{d.icon}</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:"#1a3635"}}>{d.label}</div><div style={{fontSize:10,color:"#2a5a57"}}>{cnt}名</div></div><div style={{display:"flex",alignItems:"center",gap:6}}><button onClick={()=>setVal(d.id,(values[d.id]||8)-1)} style={{background:"#b8deda",border:"1px solid #1a4040",borderRadius:6,color:"#6ab5b2",cursor:"pointer",width:28,height:28,fontSize:16,fontWeight:800}}>−</button><input type="number" value={values[d.id]??8} min={0} max={20} onChange={e=>setVal(d.id,e.target.value)} style={{width:48,background:"#f0fffe",border:"1px solid #90cbc8",borderRadius:6,color:"#2BBFBA",fontSize:16,fontWeight:800,textAlign:"center",padding:"4px 0",outline:"none"}}/><button onClick={()=>setVal(d.id,(values[d.id]||8)+1)} style={{background:"#b8deda",border:"1px solid #1a4040",borderRadius:6,color:"#6ab5b2",cursor:"pointer",width:28,height:28,fontSize:16,fontWeight:800}}>＋</button><span style={{fontSize:11,color:"#2a5a57"}}>日</span></div></div>);})}
        </div>
        <div style={{display:"flex",gap:10}}><button onClick={()=>onApply(values,mk)} style={{flex:1,background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>✅ 適用する</button><button onClick={onClose} style={{flex:1,background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button></div>
      </div>
    </div>
  );
}

function DownloadModal({ depts, staffList, allShifts, year, month, activeDeptId, onClose }) {
  const [selectedDepts, setSelectedDepts] = useState([activeDeptId]);
  const noSelection = selectedDepts.length === 0;
  const fname = `シフト表_${year}年${month+1}月`;
  const toggleDept = (id) => setSelectedDepts(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const doDownload = (ext) => { if(noSelection)return; let content="",type=""; if(ext==="csv"){content=buildCSV(depts,staffList,allShifts,year,month,selectedDepts);type="text/csv;charset=utf-8";} if(ext==="html"){content=buildPrintHTML(depts,staffList,allShifts,year,month,selectedDepts);type="text/html;charset=utf-8";} triggerDownload(content,`${fname}.${ext}`,type); };
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:400,boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div><div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>📤 書き出し</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>{year}年{month+1}月</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button></div>
        <div style={{fontSize:11,color:"#3a8a87",fontWeight:700,marginBottom:7}}>対象部署</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:16}}>{depts.map(d=>{const sel=selectedDepts.includes(d.id);return<button key={d.id} onClick={()=>toggleDept(d.id)} style={{background:sel?"#8ecece":"transparent",color:sel?"#2BBFBA":"#2a5a57",border:`1px solid ${sel?"#2BBFBA":"#b8deda"}`,borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:sel?700:400}}>{d.icon} {d.label}</button>;})}</div>
        {noSelection&&<div style={{fontSize:11,color:"#ef4444",marginBottom:10}}>⚠ 部署を1つ以上選択してください</div>}
        <button onClick={()=>doDownload("csv")} disabled={noSelection} style={{width:"100%",background:noSelection?"#d5edec":"#e8f5ee",border:"1px solid #2d8a52",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1,marginBottom:8}}><span style={{fontSize:24}}>📊</span><div><div style={{fontSize:13,fontWeight:800,color:"#34d399"}}>CSV（Excel・スプレッドシート）</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>Excel・Googleスプレッドシートで開けます</div></div></button>
        <button onClick={()=>doDownload("html")} disabled={noSelection} style={{width:"100%",background:noSelection?"#d5edec":"#e8f8f7",border:"1px solid #8ecece",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1}}><span style={{fontSize:24}}>🖨️</span><div><div style={{fontSize:13,fontWeight:800,color:"#2BBFBA"}}>印刷用HTML</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>ブラウザで開いてそのまま印刷できます</div></div></button>
      </div>
    </div>
  );
}

function GenerateWarningModal({ warnings, deptLabel, year, month, onClose }) {
  const entries = Object.entries(warnings);
  const days = new Date(year, month + 1, 0).getDate();
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff5f5",border:"1px solid #7f1d1d",borderRadius:14,padding:28,width:"100%",maxWidth:440,boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:22}}><div style={{width:44,height:44,borderRadius:10,flexShrink:0,background:"#fff0f0",border:"1px solid #ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>⚠️</div><div><div style={{fontSize:15,fontWeight:900,color:"#fca5a5",marginBottom:4}}>人員不足の警告</div><div style={{fontSize:12,color:"#5a9e9b"}}>{deptLabel} ／ {year}年{month+1}月</div></div></div>
        <div style={{background:"#fff0f0",border:"1px solid #7f1d1d",borderRadius:8,padding:"10px 14px",marginBottom:18,fontSize:12,color:"#fca5a5",lineHeight:1.7}}>以下のシフト種別で、設定した最低配置人数を達成できない日が発生しました。</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>{entries.map(([shiftKey,info])=>{const s=SHIFTS[shiftKey]||{},pct=Math.round(info.days/days*100);return(<div key={shiftKey} style={{background:"#f3fffe",border:`1px solid ${s.border||"#2a5a57"}`,borderRadius:9,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}><ShiftBadge type={shiftKey}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:s.color||"#6ab5b2"}}>{shiftKey}</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>不足日数：<span style={{color:"#f87171",fontWeight:700}}>{info.days}日</span>　最大 <span style={{color:"#f87171",fontWeight:700}}>−{info.maxShort}名</span></div></div><div style={{width:80}}><div style={{height:6,background:"#b8deda",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${pct}%`,background:pct>50?"#ef4444":pct>20?"#f59e0b":"#f87171"}}/></div><div style={{fontSize:10,color:"#3a8a87",marginTop:3,textAlign:"right"}}>{pct}%</div></div></div>);})}</div>
        <button onClick={onClose} style={{width:"100%",background:"linear-gradient(135deg,#2BBFBA,#b07fd4)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>確認しました</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  ★ ZoomWrapper（空白バグ修正済み）
// ─────────────────────────────────────────────
function ZoomWrapper({ zoom, onZoomChange, children }) {
  const innerRef = useRef(null), outerRef = useRef(null);
  const scale = zoom / 100;

  // ★ 修正箇所: setTimeout二段階追加で初回描画後に高さを再計算
  useEffect(() => {
    if (!innerRef.current || !outerRef.current) return;
    const inner = innerRef.current, outer = outerRef.current;
    const updateHeight = () => {
      outer.style.height = `${Math.round(inner.offsetHeight * scale)}px`;
    };
    updateHeight();
    const t1 = setTimeout(updateHeight, 100);
    const t2 = setTimeout(updateHeight, 500);
    const ro = new ResizeObserver(updateHeight);
    ro.observe(inner);
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [zoom]);

  useEffect(() => {
    const el = outerRef.current; if (!el) return;
    let startDist = null, startZoom = zoom;
    const onTouchStart = (e) => { if(e.touches.length===2){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;startDist=Math.hypot(dx,dy);startZoom=zoom;e.preventDefault();} };
    const onTouchMove = (e) => { if(e.touches.length===2&&startDist!==null){const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;const dist=Math.hypot(dx,dy),ratio=dist/startDist;const raw=Math.round(startZoom*ratio/5)*5,clamped=Math.min(100,Math.max(40,raw));if(clamped!==zoom)onZoomChange(clamped);e.preventDefault();} };
    const onTouchEnd = () => { startDist = null; };
    el.addEventListener("touchstart",onTouchStart,{passive:false}); el.addEventListener("touchmove",onTouchMove,{passive:false}); el.addEventListener("touchend",onTouchEnd);
    return () => { el.removeEventListener("touchstart",onTouchStart); el.removeEventListener("touchmove",onTouchMove); el.removeEventListener("touchend",onTouchEnd); };
  }, [zoom, onZoomChange]);

  return (
    <div ref={outerRef} style={{overflowX:"auto",overflowY:"visible",position:"relative"}}>
      <div ref={innerRef} style={{transformOrigin:"top left",transform:`scale(${scale})`,width:scale<1?`${Math.round(100/scale)}%`:"100%",display:"inline-block",minWidth:"max-content"}}>{children}</div>
    </div>
  );
}

const TH = ({sticky,w}={}) => ({ position:sticky?"sticky":"static", left:sticky?0:"auto", zIndex:sticky?3:1, background:"#ffffff", padding:"5px 3px", borderBottom:"2px solid #90cbc8", borderRight:"1px solid #b0e0de", fontSize:11, fontWeight:700, color:"#2a7a77", textAlign:"center", whiteSpace:"nowrap", width:w||"auto", minWidth:w||"auto" });
const TD = { textAlign:"center", padding:"4px 2px", borderBottom:"1px solid #c8ecea", borderRight:"1px solid #c8ecea" };

function ShiftTable({ staffList, shifts, dept, year, month, onLeftClick, onRightClick }) {
  const days = getDays(year, month);
  const ds = staffList.filter(s=>s.dept===dept.id);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
  const isAlert = (d) => { for(const [sh,min] of Object.entries(dept.minStaff||{})){const cnt=ds.filter(s=>(shifts[s.id]?.[d]||"")===sh).length;if(cnt<min)return true;} return false; };
  const isConsecViolation = (sShifts, d) => { if(!WORK_TYPES.has(sShifts[d]))return false; return calcConsecutive(sShifts,d)>maxConsec; };
  return (
    <div style={{overflowX:"auto",overflowY:"visible"}}>
      <table style={{borderCollapse:"collapse",minWidth:"max-content",fontSize:12}}>
        <thead>
          <tr>
            <th style={TH({sticky:true,w:148})}><span style={{color:"#2a5a57",fontSize:10}}>氏名</span></th>
            {Array.from({length:days},(_,i)=>i+1).map(d=>{const wd=getWD(year,month,d),we=isWE(year,month,d),alert=isAlert(d);return(<th key={d} style={{...TH({}),background:we?"#edf8f7":"#f8fffe",minWidth:30,width:30,padding:"3px 1px"}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><span style={{fontSize:10,fontWeight:700,color:we?"#f472b6":"#5a9e9b"}}>{d}</span><span style={{fontSize:9,color:we?"#f472b6":"#2a5a57"}}>{wd}</span><span style={{fontSize:8}}>{alert?"⚠️":"　"}</span></div></th>);})}
            <th style={TH({w:44})}><span style={{fontSize:10,color:"#2a5a57"}}>勤務</span></th>
            <th style={TH({w:36})}><span style={{fontSize:10,color:"#2a5a57"}}>夜勤</span></th>
            <th style={TH({w:36})}><span style={{fontSize:10,color:"#2a5a57"}}>休日</span></th>
          </tr>
        </thead>
        <tbody>
          {ds.map((s,si)=>{
            const sShifts=shifts[s.id]||{}, kibodays=s.kiboByMonth?.[mk]||[];
            const workCnt=Object.values(sShifts).filter(v=>WORK_TYPES.has(v)).length;
            const nightCnt=Object.values(sShifts).filter(v=>v==="夜勤").length;
            const restCnt=Object.values(sShifts).filter(v=>REST_TYPES.has(v)&&v!=="明け").length;
            const nightOver=s.nightOk&&nightCnt>(s.nightMax||5);
            return (
              <tr key={s.id} style={{background:si%2===0?"#ffffff":"#fafeff"}}>
                <td style={{position:"sticky",left:0,zIndex:2,background:si%2===0?"#ffffff":"#fafeff",padding:"4px 10px",borderRight:"1px solid #90cbc8",borderBottom:"1px solid #b8deda",minWidth:148}}>
                  <div style={{fontWeight:700,fontSize:12,color:"#1a3635",whiteSpace:"nowrap"}}>{s.name}</div>
                  <div style={{fontSize:10,color:"#2a5a57",display:"flex",gap:6,alignItems:"center"}}><span>{s.role}</span>{s.nightOk&&<span style={{color:nightOver?"#ef4444":"#c45c35",fontSize:9}}>🌙{nightCnt}/{s.nightMax}</span>}</div>
                </td>
                {Array.from({length:days},(_,i)=>i+1).map(d=>{
                  const type=sShifts[d]||"", isKibo=kibodays.includes(d)&&!type, consecViol=isConsecViolation(sShifts,d);
                  return <td key={d} style={{padding:"2px 1px",textAlign:"center",borderRight:"1px solid #b8deda",borderBottom:"1px solid #b8deda",background:consecViol?"#ffe8e8":isKibo?"#fff5f5":undefined,cursor:"pointer",outline:consecViol?"1px solid #e0707060":undefined}} onClick={(e)=>onLeftClick(s.id,d,e)} onContextMenu={(e)=>{e.preventDefault();onRightClick(s.id,d,e);}}>{isKibo?<span style={{fontSize:9,color:"#c44b4b"}}>希</span>:<ShiftBadge type={type}/>}{consecViol&&<span style={{fontSize:7,color:"#c44b4b",display:"block",lineHeight:1}}>連超</span>}</td>;
                })}
                <td style={TD}><span style={{color:workCnt<(s.targetWork-2)?"#f59e0b":workCnt>(s.targetWork+2)?"#ef4444":"#2BBFBA",fontWeight:800,fontSize:12}}>{workCnt}</span></td>
                <td style={TD}><span style={{color:nightOver?"#ef4444":"#1a9e9a",fontWeight:700,fontSize:12}}>{nightCnt||"－"}</span></td>
                <td style={TD}><span style={{color:"#5cb87a",fontWeight:700,fontSize:12}}>{restCnt}</span></td>
              </tr>
            );
          })}
          {dept.shiftTypes.map(shKey=>(
            <tr key={shKey} style={{background:"#f0fffe"}}>
              <td style={{position:"sticky",left:0,zIndex:2,background:"#f0fffe",padding:"3px 10px",borderRight:"1px solid #90cbc8",borderBottom:"1px solid #b8deda"}}><ShiftBadge type={shKey}/></td>
              {Array.from({length:days},(_,i)=>i+1).map(d=>{const cnt=ds.filter(s=>(shifts[s.id]?.[d]||"")===shKey).length,min=dept.minStaff?.[shKey]||0;return<td key={d} style={{textAlign:"center",fontSize:11,fontWeight:800,padding:"3px 0",color:cnt===0?"#ef4444":cnt>=min?"#5cb87a":"#f59e0b",borderRight:"1px solid #b8deda",borderBottom:"1px solid #b8deda"}}>{cnt||"0"}</td>;})}
              <td colSpan={3}/>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryView({ staffList, shifts, dept, year, month }) {
  const ds = staffList.filter(s=>s.dept===dept.id);
  const mk = monthKey(year, month);
  const shownKeys = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休"];
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",minWidth:"max-content"}}>
        <thead><tr style={{background:"#d5edec"}}><th style={TH({sticky:true,w:148})}><span style={{color:"#2a5a57",fontSize:10}}>スタッフ</span></th>{shownKeys.map(k=><th key={k} style={TH({})}><ShiftBadge type={k}/></th>)}<th style={TH({w:50})}><span style={{fontSize:10,color:"#2a5a57"}}>勤務計</span></th><th style={TH({w:50})}><span style={{fontSize:10,color:"#2a5a57"}}>希望休</span></th></tr></thead>
        <tbody>{ds.map((s,i)=>{const sv=shifts[s.id]||{},cnt={};shownKeys.forEach(k=>{cnt[k]=Object.values(sv).filter(v=>v===k).length;});const work=["早番","日勤","遅番","夜勤"].reduce((a,k)=>a+(cnt[k]||0),0),kiboSel=(s.kiboByMonth?.[mk]||[]).length;return(<tr key={s.id} style={{background:i%2===0?"#ffffff":"#fafeff"}}><td style={{...TD,position:"sticky",left:0,zIndex:1,background:i%2===0?"#ffffff":"#fafeff",padding:"5px 10px",borderRight:"1px solid #90cbc8"}}><div style={{fontWeight:700,fontSize:12,color:"#1a3635"}}>{s.name}</div><div style={{fontSize:10,color:"#2a5a57"}}>{s.role}</div></td>{shownKeys.map(k=><td key={k} style={{...TD,color:cnt[k]>0?SHIFTS[k].color:"#8ecece",fontWeight:800,fontSize:13}}>{cnt[k]||"－"}</td>)}<td style={{...TD,color:"#2BBFBA",fontWeight:800,fontSize:14}}>{work}</td><td style={{...TD,color:"#f87171",fontWeight:700,fontSize:13}}>{kiboSel||"－"}</td></tr>);})}</tbody>
      </table>
    </div>
  );
}

const ICON_BTN = (color) => ({ background:`${color}18`, border:`1px solid ${color}40`, borderRadius:7, padding:"5px 9px", cursor:"pointer", fontSize:13 });

function StaffList({ staffList, dept, year, month, onEdit, onDelete, onAdd }) {
  const ds = staffList.filter(s=>s.dept===dept.id);
  return (
    <div style={{maxWidth:680}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:"#2BBFBA",fontWeight:800}}>{dept.icon} {dept.label} — {ds.length}名</div>
        <button onClick={onAdd} style={{background:"linear-gradient(135deg,#2BBFBA,#b07fd4)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:800}}>＋ 追加</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {ds.map((s,i)=>{const mk=monthKey(year,month),kibo=(s.kiboByMonth?.[mk]||[]).length;return(<div key={s.id} style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,background:`hsl(${(i*53+180)%360},55%,30%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:800}}>{s.name.charAt(0)}</div><div><div style={{fontWeight:800,fontSize:13,color:"#1a3635"}}>{s.name}</div><div style={{fontSize:10,color:"#2a5a57",display:"flex",gap:8,flexWrap:"wrap"}}><span>{s.role}</span><span>目標{s.targetWork}日</span><span>休み{s.kyukoDaysByMonth?.[monthKey(year,month)]??s.kyukoDays??8}日</span>{s.nightOk&&<span style={{color:"#c45c35"}}>🌙夜勤×{s.nightMax}回</span>}{kibo>0&&<span style={{color:"#dc2626"}}>希望休{kibo}日選択済</span>}</div></div></div><div style={{display:"flex",gap:6}}><button onClick={()=>onEdit(s)} style={ICON_BTN("#2BBFBA")}>✏️</button><button onClick={()=>onDelete(s.id)} style={ICON_BTN("#ef4444")}>🗑</button></div></div>);})}
        {ds.length===0&&<div style={{background:"#f3fffe",border:"1px dashed #0e3a38",borderRadius:10,padding:32,textAlign:"center",color:"#8ecece",fontSize:13}}>スタッフが登録されていません</div>}
      </div>
    </div>
  );
}

function Legend() {
  const normalShifts=["早番","日勤","遅番","夜勤","明け","休み","希望休","有休"], halfShifts=["日/休","休/日","早/休","休/遅"];
  return (
    <div style={{padding:"6px 0 6px",borderBottom:"1px solid #b8deda",marginBottom:10}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:4}}>{normalShifts.map(key=><div key={key} style={{display:"flex",alignItems:"center",gap:3}}><ShiftBadge type={key}/><span style={{fontSize:9,color:"#2a5a57"}}>{SHIFTS[key].time||key}</span></div>)}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,alignItems:"center"}}><span style={{fontSize:9,color:"#8ecece",fontWeight:700}}>半休:</span>{halfShifts.map(key=><div key={key} style={{display:"flex",alignItems:"center",gap:3}}><ShiftBadge type={key}/><span style={{fontSize:9,color:"#2a5a57"}}>{SHIFTS[key].time}</span></div>)}<span style={{fontSize:9,color:"#8ecece",marginLeft:4}}>左クリック：順番切替 ／ 右クリック：メニュー選択</span></div>
    </div>
  );
}

const MNAV = { background:"#ffffff", color:"#2BBFBA", border:"1px solid #90cbc8", borderRadius:6, width:28, height:28, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center" };

// ─────────────────────────────────────────────
//  YOTEI (職員予定表)
// ─────────────────────────────────────────────
const YOTEI_SHIFT_ORDER = ["明け","早番","日勤","遅番","夜勤"];
const YOTEI_SHIFT_COLORS = { 明け:"#9e8d80", 早番:"#c45c35", 日勤:"#3b6eea", 遅番:"#8b5cc4", 夜勤:"#2a7a9a" };

function buildYoteiHTML(dept, staffList, shifts, year, month, yoteiDeptData, floorSettings) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  const WD_NAMES = ["日","月","火","水","木","金","土"];
  const getDayGroups = (d) => {
    const assign = (yoteiDeptData || {})[String(d)] || {};
    return YOTEI_SHIFT_ORDER.map(st => ({
      st, color: YOTEI_SHIFT_COLORS[st]||'#333',
      staff: ds.filter(s=>(shifts[s.id]?.[d]||"")===st).map(s=>({ name:s.name, assignment:assign[s.id]||"" }))
    })).filter(g=>g.staff.length>0);
  };
  const dayCards = Array.from({length:days},(_,i)=>i+1).map(d => {
    const date=new Date(year,month,d), wd=WD_NAMES[date.getDay()], isWE=date.getDay()===0||date.getDay()===6;
    const groups=getDayGroups(d);
    const memo=(yoteiDeptData||{})[String(d)]?.["_memo"]||"";
    const hBg=isWE?'#ffe0e6':'#e0f4f2', hColor=isWE?'#c0392b':'#1a3635';
    let ri=0, rows='';
    groups.forEach(g=>{g.staff.forEach((s,si)=>{const bg=ri++%2===0?'#ffffff':'#f5fffe';rows+=`<tr style="background:${bg};"><td style="color:${g.color};font-weight:bold;font-size:10px;padding:2px 5px;white-space:nowrap;vertical-align:middle;">${si===0?g.st:''}</td><td style="padding:2px 5px;font-size:10px;">${s.name}</td><td style="padding:2px 5px;font-size:10px;color:#1a9e9a;font-weight:bold;">${s.assignment}</td></tr>`;});});
    if(!rows)rows=`<tr><td colspan="3" style="color:#b8deda;text-align:center;padding:6px;font-size:9px;">勤務なし</td></tr>`;
    if(memo)rows+=`<tr><td colspan="3" style="background:#fffbea;color:#92400e;font-size:9px;padding:3px 5px;border-top:1px dashed #fde68a;">📝 ${memo}</td></tr>`;
    return `<div style="border:1px solid #90cbc8;border-radius:6px;overflow:hidden;break-inside:avoid;"><div style="background:${hBg};color:${hColor};padding:4px 8px;font-weight:bold;font-size:11px;">${month+1}月${d}日（${wd}）</div><table style="width:100%;border-collapse:collapse;">${rows}</table></div>`;
  });
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>職員予定表 ${year}年${month+1}月 ${dept.label}</title><style>@media print{@page{size:A4 portrait;margin:10mm;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}body{font-family:'Noto Sans JP','ヒラギノ角ゴ ProN',Meiryo,sans-serif;margin:0;padding:10px;}h2{font-size:14px;border-bottom:2px solid #2BBFBA;padding-bottom:6px;margin:0 0 10px;color:#1a3635;}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}</style></head><body><h2>📋 職員予定表　${year}年${month+1}月　${dept.label}</h2><div class="grid">${dayCards.join('')}</div></body></html>`;
}

function autoAssignDay(d, dept, staffList, shifts, rules, floorSettings) {
  const ds = staffList.filter(s => s.dept === dept.id);
  const assign = {};
  YOTEI_SHIFT_ORDER.forEach(shiftType => {
    const rule = (rules||[]).find(r => r.shiftType === shiftType);
    if (!rule || !rule.assignment) return;
    const staff = ds.filter(s => (shifts[s.id]?.[d]||"") === shiftType);
    if (staff.length === 0) return;
    if (rule.assignment === "auto") {
      const floors = floorSettings.floors;
      if (floors.length === 0) return;
      staff.forEach((s, i) => { assign[s.id] = floors[i % floors.length].name; });
    } else {
      staff.forEach(s => { assign[s.id] = rule.assignment; });
    }
  });
  return assign;
}

function FloorSettingsModal({ floorSettings, onSave, onClose }) {
  const [floors, setFloors] = useState(() => floorSettings.floors.map(f=>f.name));
  const [duties, setDuties] = useState(() => (floorSettings.duties||[{name:"入浴"},{name:"フリー"}]).map(d=>d.name));
  const [rules, setRules] = useState(() => {
    const existing = floorSettings.rules || [];
    return YOTEI_SHIFT_ORDER.map(st => ({ shiftType:st, assignment:(existing.find(x=>x.shiftType===st)?.assignment)||"" }));
  });
  const updateFloor = (i, v) => setFloors(p=>{const n=[...p];n[i]=v;return n;});
  const deleteFloor = (i) => setFloors(p=>p.filter((_,j)=>j!==i));
  const updateDuty = (i, v) => setDuties(p=>{const n=[...p];n[i]=v;return n;});
  const deleteDuty = (i) => setDuties(p=>p.filter((_,j)=>j!==i));
  const setRule = (st, v) => setRules(p=>p.map(r=>r.shiftType===st?{...r,assignment:v}:r));
  const validFloors = floors.filter(n=>n.trim());
  const validDuties = duties.filter(n=>n.trim());
  const assignOptions = [
    {value:"", label:"なし（未設定）"},
    {value:"auto", label:"⚡ 自動分配（フロアを均等割り）"},
    ...validFloors.map(n=>({value:n, label:`🏠 ${n}（固定）`})),
    ...validDuties.map(n=>({value:n, label:`🎯 ${n}（固定）`})),
  ];
  const handleSave = () => {
    if(validFloors.length===0){alert("フロア名を1つ以上設定してください");return;}
    onSave({floors:validFloors.map(n=>({name:n})), duties:validDuties.map(n=>({name:n})), rules});
    onClose();
  };
  const LS = {fontSize:11,color:"#3a8a87",fontWeight:700,marginBottom:6,display:"block"};
  const EditList = ({items, onUpdate, onDelete, onAdd, addLabel, placeholder}) => (
    <div style={{background:"#d5edeb",borderRadius:9,padding:"10px 12px",marginBottom:18,border:"1px solid #90cbc8"}}>
      {items.map((name,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
          <input value={name} onChange={e=>onUpdate(i,e.target.value)} style={{...INPUT_STYLE,flex:1,marginBottom:0,padding:"6px 10px"}} placeholder={placeholder(i)}/>
          <button onClick={()=>onDelete(i)} disabled={items.length<=1}
            style={{background:"#fff0f0",border:"1px solid #e07070",borderRadius:6,color:"#c44b4b",cursor:items.length<=1?"not-allowed":"pointer",padding:"5px 9px",fontSize:13,opacity:items.length<=1?0.4:1}}>✕</button>
        </div>
      ))}
      <button onClick={onAdd} style={{background:"#2BBFBA",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800}}>{addLabel}</button>
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:210,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>⚙️ 予定表 設定</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        <label style={LS}>🏠 フロア名</label>
        <EditList items={floors} onUpdate={updateFloor} onDelete={deleteFloor} onAdd={()=>setFloors(p=>[...p,""])} addLabel="＋ フロアを追加" placeholder={i=>`フロア${i+1}`}/>
        <label style={LS}>🎯 役割・業務</label>
        <div style={{fontSize:10,color:"#6ab5b2",marginBottom:8}}>入浴・フリーなどの業務担当。フロアとは別に自由に追加できます。</div>
        <EditList items={duties} onUpdate={updateDuty} onDelete={deleteDuty} onAdd={()=>setDuties(p=>[...p,""])} addLabel="＋ 役割を追加" placeholder={i=>`役割${i+1}`}/>
        <label style={LS}>⚡ 自動配置ルール</label>
        <div style={{fontSize:10,color:"#6ab5b2",marginBottom:10}}>「自動配置」ボタンで全日程に一括適用されるルールです。「自動分配」はフロアを均等に振り分けます。</div>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>
          {rules.map(({shiftType,assignment})=>{
            const sh=SHIFTS[shiftType];
            return(
              <div key={shiftType} style={{display:"flex",alignItems:"center",gap:10,background:"#d5edeb",borderRadius:8,padding:"8px 12px",border:"1px solid #90cbc8"}}>
                <ShiftBadge type={shiftType}/>
                <span style={{fontSize:12,fontWeight:700,color:sh.color,minWidth:34}}>{shiftType}</span>
                <select value={assignment} onChange={e=>setRule(shiftType,e.target.value)} style={{...INPUT_STYLE,flex:1,marginBottom:0,padding:"5px 8px",fontSize:12}}>
                  {assignOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={handleSave} style={{flex:1,background:"linear-gradient(135deg,#2BBFBA,#b07fd4)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>保存</button>
          <button onClick={onClose} style={{flex:1,background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

function DayYoteiModal({ day, year, month, dept, staffList, shifts, assignments, floorSettings, onSave, onClose }) {
  const wd = getWD(year, month, day);
  const ds = staffList.filter(s => s.dept === dept.id);
  const workingGroups = YOTEI_SHIFT_ORDER.map(st=>({ st, staff:ds.filter(s=>(shifts[s.id]?.[day]||"")===st) })).filter(g=>g.staff.length>0);
  const floorOptions = ["", ...floorSettings.floors.map(f=>f.name), ...(floorSettings.duties||[]).map(d=>d.name)];
  const [local, setLocal] = useState(() => ({...assignments}));
  const [memo, setMemo] = useState(() => assignments["_memo"]||"");
  const set = (staffId, val) => setLocal(prev=>({...prev, [staffId]:val}));
  const handleSave = () => onSave({...local, _memo:memo});
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:460,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>{month+1}月{day}日（{wd}）担当配置</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        {workingGroups.length===0&&<div style={{color:"#8ecece",fontSize:13,textAlign:"center",padding:"16px 0"}}>この日の勤務者がいません</div>}
        {workingGroups.map(({st,staff})=>{
          const sh=SHIFTS[st];
          return(
            <div key={st} style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><ShiftBadge type={st}/><span style={{fontSize:11,color:sh.color,fontWeight:700}}>{st}</span></div>
              {staff.map(s=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,background:"#d5edeb",borderRadius:8,padding:"8px 12px"}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#1a3635",flex:1}}>{s.name}</span>
                  <select value={local[s.id]||""} onChange={e=>set(s.id,e.target.value)} style={{...INPUT_STYLE,width:120,marginBottom:0,padding:"5px 8px"}}>
                    {floorOptions.map(opt=><option key={opt} value={opt}>{opt||"（未設定）"}</option>)}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
        <div style={{marginTop:14}}>
          <div style={{fontSize:11,color:"#3a8a87",marginBottom:5,fontWeight:700}}>📝 メモ・追加記入</div>
          <textarea value={memo} onChange={e=>setMemo(e.target.value)}
            placeholder="例）午後から外部研修あり、浴室清掃担当あり"
            style={{...INPUT_STYLE,minHeight:56,resize:"vertical",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={handleSave} style={{flex:1,background:"linear-gradient(135deg,#2BBFBA,#b07fd4)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>保存</button>
          <button onClick={onClose} style={{flex:1,background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

function YoteiView({ dept, staffList, shifts, year, month, yoteiDeptData, onUpdateYotei, onBatchUpdateYotei, floorSettings, onUpdateFloorSettings }) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  const [editDay, setEditDay] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const getDayAssignments = (d) => (yoteiDeptData||{})[String(d)]||{};

  const handlePrint = () => {
    const html = buildYoteiHTML(dept,staffList,shifts,year,month,yoteiDeptData,floorSettings);
    const w = window.open('','_blank');
    if(!w){alert("ポップアップをブロックしています。許可してから再試行してください。");return;}
    w.document.write(html); w.document.close();
    setTimeout(()=>w.print(),400);
  };

  const handleAutoAssign = () => {
    const rules = floorSettings.rules||[];
    const hasRule = rules.some(r=>r.assignment);
    if(!hasRule){alert("⚙️ 設定でシフト種別ごとの配置ルールを設定してから実行してください。");return;}
    if(!window.confirm(`${month+1}月の全日程に自動配置ルールを適用します。\n既存の配置は上書きされます（メモは保持）。\nよろしいですか？`))return;
    const dayMap = {};
    for(let d=1;d<=days;d++){
      const auto = autoAssignDay(d,dept,staffList,shifts,rules,floorSettings);
      const existing = getDayAssignments(d);
      dayMap[String(d)] = {...existing, ...auto};
    }
    onBatchUpdateYotei(dayMap);
  };

  return (
    <div style={{maxWidth:960}}>
      {/* ツールバー */}
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:800,color:"#2BBFBA",whiteSpace:"nowrap"}}>🏠 フロア</span>
        {floorSettings.floors.map((f,i)=><span key={i} style={{background:"#d5edeb",borderRadius:6,padding:"3px 9px",fontSize:11,color:"#1a3635",fontWeight:700}}>{f.name}</span>)}
        <button onClick={()=>setSettingsOpen(true)} style={{background:"#2BBFBA",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>⚙️ 設定</button>
        <button onClick={handleAutoAssign} style={{background:"linear-gradient(135deg,#f5b942,#e07b30)",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>⚡ 自動配置</button>
        <button onClick={handlePrint} style={{marginLeft:"auto",background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>🖨️ 印刷プレビュー</button>
      </div>
      {/* 月カレンダー */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:7}}>
        {Array.from({length:days},(_,i)=>i+1).map(d=>{
          const wd=getWD(year,month,d), we=isWE(year,month,d);
          const assign=getDayAssignments(d);
          const assignedCnt=Object.keys(assign).filter(k=>k!=="__memo"&&assign[k]).length;
          const memo=assign["_memo"]||"";
          const workCount=YOTEI_SHIFT_ORDER.reduce((acc,st)=>acc+ds.filter(s=>(shifts[s.id]?.[d]||"")===st).length,0);
          return(
            <div key={d} onClick={()=>setEditDay(d)} style={{background:"#ffffff",border:`1px solid ${we?"#fca5a5":"#90cbc8"}`,borderRadius:9,padding:"8px 10px",cursor:"pointer",boxShadow:"0 1px 4px #0001"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:13,fontWeight:800,color:we?"#e53e3e":"#1a3635"}}>{d}<span style={{fontSize:10,marginLeft:3,fontWeight:400,color:we?"#e53e3e":"#5a9e9b"}}>({wd})</span></span>
                <div style={{display:"flex",gap:3,alignItems:"center"}}>
                  {assignedCnt>0&&<span style={{fontSize:9,background:"#d5edeb",color:"#2BBFBA",borderRadius:8,padding:"1px 5px",fontWeight:700}}>{assignedCnt}</span>}
                  {memo&&<span style={{fontSize:9}}>📝</span>}
                </div>
              </div>
              {YOTEI_SHIFT_ORDER.map(st=>{
                const group=ds.filter(s=>(shifts[s.id]?.[d]||"")===st);
                if(group.length===0)return null;
                const sh=SHIFTS[st];
                return(
                  <div key={st} style={{display:"flex",alignItems:"flex-start",gap:3,marginBottom:2}}>
                    <span style={{fontSize:9,fontWeight:800,color:sh.color,minWidth:20,textAlign:"center",background:sh.bg,borderRadius:2,flexShrink:0,lineHeight:"16px",padding:"0 2px"}}>{sh.short}</span>
                    <div style={{fontSize:9,color:"#2a5a57",lineHeight:1.5,display:"flex",flexWrap:"wrap",gap:"2px 4px"}}>
                      {group.map(s=>{const a=assign[s.id],short=s.name.replace(/\s/g,"").slice(-2);return<span key={s.id}>{short}{a&&<span style={{color:"#1a9e9a",fontWeight:700}}>({a.slice(0,3)})</span>}</span>;})}
                    </div>
                  </div>
                );
              })}
              {workCount===0&&<div style={{fontSize:9,color:"#b8deda",textAlign:"center",paddingTop:4}}>勤務なし</div>}
              {memo&&<div style={{fontSize:8,color:"#92400e",background:"#fffbea",borderRadius:3,padding:"2px 4px",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{memo.slice(0,18)}{memo.length>18?"…":""}</div>}
            </div>
          );
        })}
      </div>
      {editDay!==null&&(
        <DayYoteiModal day={editDay} year={year} month={month} dept={dept} staffList={staffList} shifts={shifts} assignments={getDayAssignments(editDay)} floorSettings={floorSettings} onSave={a=>{onUpdateYotei(editDay,a);setEditDay(null);}} onClose={()=>setEditDay(null)}/>
      )}
      {settingsOpen&&<FloorSettingsModal floorSettings={floorSettings} onSave={onUpdateFloorSettings} onClose={()=>setSettingsOpen(false)}/>}
    </div>
  );
}

// ─────────────────────────────────────────────
//  APP（メイン）
// ─────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => { await supabase.auth.signOut(); };

  if (authLoading) {
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#f0fbfa,#d4f1ef)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans JP',sans-serif"}}>
        <div style={{textAlign:"center"}}>
          <div style={{margin:"0 auto 12px"}}><ShifuponIcon size={48} radius={12}/></div>
          <div style={{color:"#6ab5b2",fontSize:13}}>読み込み中…</div>
        </div>
      </div>
    );
  }

  if (!session) { return <LoginPage onLogin={() => {}} />; }

  return <MainApp session={session} onLogout={handleLogout} />;
}

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
function MainApp({ session, onLogout }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const isInitializing = useRef(true);
  const [dbLoading, setDbLoading] = useState(true);

  const [depts, setDepts] = useState(() => { try { const s=localStorage.getItem("shiftNavi_depts"); if(s) return JSON.parse(s); } catch {} return DEFAULT_DEPTS; });
  useEffect(() => {
    try { localStorage.setItem("shiftNavi_depts",JSON.stringify(depts)); } catch {}
    if (!isInitializing.current) {
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'depts', data_value:depts, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' })
        .then(({ error }) => { if (error) console.error('[sync] depts upsert失敗:', error); else console.log('[sync] depts 保存OK'); });
    }
  }, [depts]); // eslint-disable-line react-hooks/exhaustive-deps

  const [deptSettingModal, setDeptSettingModal] = useState(null);
  const [activeDeptId, setActiveDeptId] = useState("kaigo1");
  const [innerTab, setInnerTab] = useState("shift");

  const [staffList, setStaffList] = useState(() => { try { const s=localStorage.getItem("shiftNavi_staffList"); if(s) return JSON.parse(s); } catch {} return buildStaff(); });
  useEffect(() => {
    try { localStorage.setItem("shiftNavi_staffList",JSON.stringify(staffList)); } catch {}
    if (!isInitializing.current) {
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'staffList', data_value:staffList, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' })
        .then(({ error }) => { if (error) console.error('[sync] staffList upsert失敗:', error); else console.log('[sync] staffList 保存OK'); });
    }
  }, [staffList]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if(window.XLSX)return; const script=document.createElement("script"); script.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; document.head.appendChild(script); }, []);

  const SAVE_KEY = (y, m) => `shiftNavi_shifts_${y}_${m+1}`;
  const restoreShifts = (parsed) => { const r={}; for(const [dId,ds] of Object.entries(parsed||{})){r[dId]={};for(const [sId,dm] of Object.entries(ds)){r[dId][sId]={};for(const [d,v] of Object.entries(dm))r[dId][sId][+d]=v;}} return r; };
  const [allShifts, setAllShifts] = useState(() => {
    try { const key=`shiftNavi_shifts_${new Date().getFullYear()}_${new Date().getMonth()+1}`; const saved=localStorage.getItem(key); if(!saved) return {}; return restoreShifts(JSON.parse(saved)); } catch { return {}; }
  });

  const [saveStatus, setSaveStatus] = useState("saved");
  const saveStatusRef = useRef("saved");
  useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
  const saveTimer = useRef(null);
  const isLoadingMonth = useRef(false);

  // ── 初回: Supabase から全データを一括ロード ──
  useEffect(() => {
    const loadAll = async () => {
      try {
        const { data, error } = await supabase
          .from('shift_data')
          .select('data_key,data_value')
          .eq('user_id', session.user.id);
        if (error) throw error;
        const byKey = Object.fromEntries((data||[]).map(r=>[r.data_key, r.data_value]));
        if (byKey['depts']) {
          setDepts(byKey['depts']);
        } else {
          supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'depts', data_value:depts, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(()=>{});
        }
        if (byKey['staffList']) {
          setStaffList(byKey['staffList']);
        } else {
          supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'staffList', data_value:staffList, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(()=>{});
        }
        if (byKey['shiftTrend']) setShiftTrend(byKey['shiftTrend']);
        if (byKey['floorSettings']) setFloorSettings(byKey['floorSettings']);
        const shiftKey = `shifts_${now.getFullYear()}_${now.getMonth()+1}`;
        if (byKey[shiftKey]) {
          isLoadingMonth.current = true;
          setAllShifts(restoreShifts(byKey[shiftKey]));
          setTimeout(() => { isLoadingMonth.current = false; }, 100);
        }
        const yoteiKey = `yotei_${now.getFullYear()}_${now.getMonth()+1}`;
        if (byKey[yoteiKey]) setAllYotei(byKey[yoteiKey]);
      } catch(e) { console.error('Supabase初期ロードエラー:', e); }
      finally {
        setDbLoading(false);
        // effects より先に false にすると書き戻しループが発生するため遅延する
        setTimeout(() => { isInitializing.current = false; }, 300);
      }
    };
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── リアルタイム同期: 他デバイスの変更を即座に反映 ──
  useEffect(() => {
    if (dbLoading) return;

    const reloadFromRemote = async () => {
      if (saveStatusRef.current === 'unsaved') return; // 未保存の変更があれば上書きしない
      isInitializing.current = true; // 受信データが再保存されるのを防ぐ
      try {
        const { data, error } = await supabase
          .from('shift_data')
          .select('data_key,data_value')
          .eq('user_id', session.user.id);
        if (error) throw error;
        const byKey = Object.fromEntries((data||[]).map(r=>[r.data_key, r.data_value]));
        if (byKey['depts'])      setDepts(byKey['depts']);
        if (byKey['staffList'])  setStaffList(byKey['staffList']);
        if (byKey['shiftTrend']) setShiftTrend(byKey['shiftTrend']);
        const shiftKey = `shifts_${year}_${month+1}`;
        if (byKey[shiftKey]) {
          isLoadingMonth.current = true;
          setAllShifts(restoreShifts(byKey[shiftKey]));
          setTimeout(() => { isLoadingMonth.current = false; }, 100);
        }
      } catch(e) { console.warn('リモート同期エラー:', e); }
      finally { setTimeout(() => { isInitializing.current = false; }, 300); }
    };

    // スマホでアプリを切り替えて戻ったとき同期
    const onVisibility = () => { if (!document.hidden) reloadFromRemote(); };
    document.addEventListener('visibilitychange', onVisibility);

    // Supabase Realtime: 他デバイスが保存した瞬間に同期
    const channel = supabase.channel(`shift-sync-${session.user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shift_data', filter: `user_id=eq.${session.user.id}` },
        () => reloadFromRemote()
      )
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, [dbLoading, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 月切替: Supabase から当月シフトをロード ──
  useEffect(() => {
    if (isInitializing.current) return;
    isLoadingMonth.current = true;
    const key = `shifts_${year}_${month+1}`;
    supabase.from('shift_data').select('data_value')
      .eq('user_id', session.user.id).eq('data_key', key).maybeSingle()
      .then(({ data, error }) => {
        if (!error && data?.data_value) {
          setAllShifts(restoreShifts(data.data_value));
        } else {
          try { const saved=localStorage.getItem(SAVE_KEY(year,month)); setAllShifts(saved ? restoreShifts(JSON.parse(saved)) : {}); } catch { setAllShifts({}); }
        }
        setTimeout(() => { isLoadingMonth.current = false; }, 100);
        // Load yotei for new month
        const yKey=`yotei_${year}_${month+1}`;
        supabase.from('shift_data').select('data_value').eq('user_id',session.user.id).eq('data_key',yKey).maybeSingle()
          .then(({data})=>{ if(data?.data_value)setAllYotei(data.data_value);else{try{const s=localStorage.getItem(`shiftNavi_${yKey}`);setAllYotei(s?JSON.parse(s):{});}catch{setAllYotei({});}} });
      });
  }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── シフト変更: Supabase へ自動保存（1秒デバウンス）──
  const saveFailCountRef = useRef(0);
  useEffect(() => {
    if (isLoadingMonth.current || isInitializing.current) return;
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (isLoadingMonth.current) return;
      const key = `shifts_${year}_${month+1}`;
      try {
        const { error } = await supabase.from('shift_data').upsert(
          { user_id:session.user.id, data_key:key, data_value:allShifts, updated_at:new Date().toISOString() },
          { onConflict:'user_id,data_key' }
        );
        if (error) {
          // 認証エラー検知
          if (error.code === "PGRST301" || error.message?.includes("JWT") || error.message?.includes("token")) {
            console.error("[save] 認証トークン切れ:", error.message);
            alert("セッションが切れました。再ログインしてください。");
            await supabase.auth.signOut();
            return;
          }
          throw error;
        }
        try { localStorage.setItem(SAVE_KEY(year,month),JSON.stringify(allShifts)); } catch {}
        saveFailCountRef.current = 0;
        setSaveStatus("saved");
        console.log("[save] Supabase保存OK:", key);
      } catch(e) {
        try { localStorage.setItem(SAVE_KEY(year,month),JSON.stringify(allShifts)); } catch {}
        saveFailCountRef.current += 1;
        console.error("[save] Supabase保存失敗(" + saveFailCountRef.current + "回目):", e?.message || e);
        setSaveStatus("unsaved");
        // 3回連続失敗でユーザーに通知
        if (saveFailCountRef.current >= 3) {
          alert("クラウド保存が" + saveFailCountRef.current + "回失敗しています。\nネット接続を確認してください。\n（ローカルには保存済み）");
          saveFailCountRef.current = 0;
        }
      }
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [allShifts, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const [generating, setGenerating] = useState(false);
  const [generateWarnings, setGenerateWarnings] = useState(null);
  const [downloadModal, setDownloadModal] = useState(false);
  const [bulkKyukoModal, setBulkKyukoModal] = useState(false);
  const [tableZoom, setTableZoom] = useState(() => { try { return Number(localStorage.getItem("shiftTableZoom")) || 100; } catch { return 100; } });
  const handleZoomChange = useCallback((v) => { const c=Math.min(100,Math.max(40,Math.round(v/5)*5)); setTableZoom(c); try{localStorage.setItem("shiftTableZoom",c);}catch{} }, []);
  const autoFitZoom = useCallback((staffCount, days) => { const vw=window.innerWidth-24; const tableEstWidth=148+30*days+116; return Math.min(100,Math.max(40,Math.round(Math.floor(vw/tableEstWidth*100)/5)*5)); }, []);
  const autoFitApplied = useRef(false);
  useEffect(() => { if(autoFitApplied.current)return; try{const s=localStorage.getItem("shiftTableZoom");if(s){autoFitApplied.current=true;return;}}catch{} setTableZoom(autoFitZoom(staffList.filter(s=>s.dept===activeDeptId).length,getDays(now.getFullYear(),now.getMonth()))); autoFitApplied.current=true; }, []);

  const [excelImportModal, setExcelImportModal] = useState(false);
  const [clearModal, setClearModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [shiftTrend, setShiftTrend] = useState(() => { try{const s=localStorage.getItem("shiftNavi_shiftTrend");if(s)return JSON.parse(s);}catch{} return {}; });
  const [aiMode, setAiMode] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  useEffect(() => {
    try { localStorage.setItem("shiftNavi_shiftTrend",JSON.stringify(shiftTrend)); } catch {}
    if (!isInitializing.current) {
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'shiftTrend', data_value:shiftTrend, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' });
    }
  }, [shiftTrend]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ctxMenu, setCtxMenu] = useState(null);
  const [staffModal, setStaffModal] = useState(null);

  const [floorSettings, setFloorSettings] = useState(() => { try{const s=localStorage.getItem("shiftNavi_floorSettings");if(s){const p=JSON.parse(s);if(!p.duties)p.duties=[{name:"入浴"},{name:"フリー"}];return p;}}catch{} return {floors:[{name:"りんどう"},{name:"ぼたん"}],duties:[{name:"入浴"},{name:"フリー"}]}; });
  useEffect(() => {
    try{localStorage.setItem("shiftNavi_floorSettings",JSON.stringify(floorSettings));}catch{}
    if(!isInitializing.current){supabase.from('shift_data').upsert({user_id:session.user.id,data_key:'floorSettings',data_value:floorSettings,updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'}).then(()=>{});}
  }, [floorSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const [allYotei, setAllYotei] = useState({});
  const YOTEI_SAVE_KEY = (y, m) => `yotei_${y}_${m+1}`;
  useEffect(() => {
    if(isLoadingMonth.current||isInitializing.current)return;
    const key=YOTEI_SAVE_KEY(year,month);
    try{localStorage.setItem(`shiftNavi_${key}`,JSON.stringify(allYotei));}catch{}
    supabase.from('shift_data').upsert({user_id:session.user.id,data_key:key,data_value:allYotei,updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'}).then(()=>{});
  }, [allYotei, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const dept = depts.find(d=>d.id===activeDeptId) || depts[0];
  const deptShifts = allShifts[activeDeptId]||{};
  const setDeptShifts = useCallback(updater => { setAllShifts(prev=>({...prev,[activeDeptId]:typeof updater==="function"?updater(prev[activeDeptId]||{}):updater})); }, [activeDeptId]);

  const deptYotei = allYotei[activeDeptId]||{};
  const handleUpdateYotei = useCallback((day, assignments) => {
    setAllYotei(prev=>({...prev,[activeDeptId]:{...(prev[activeDeptId]||{}),[String(day)]:assignments}}));
  }, [activeDeptId]);
  const handleBatchUpdateYotei = useCallback((dayMap) => {
    setAllYotei(prev=>({...prev,[activeDeptId]:{...(prev[activeDeptId]||{}),...dayMap}}));
  }, [activeDeptId]);
  const handleUpdateFloorSettings = useCallback((newSettings) => {
    setFloorSettings(newSettings);
  }, []);

  const handleAiAdjust = useCallback(async () => {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    try {
      const fnUrl = "/api/ai-shift-adjust";
      console.log("[AI] 呼び出しURL:", fnUrl);
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts: deptShifts, staffList, dept, instruction: aiInstruction, year, month: month + 1 }),
      });
      console.log("[AI] レスポンスステータス:", res.status);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      if (data.changes && data.changes.length > 0) {
        setDeptShifts(prev => {
          const next = { ...prev };
          for (const c of data.changes) {
            next[c.staffId] = { ...(next[c.staffId] || {}), [c.day]: c.shift };
          }
          return next;
        });
        alert(`✨ AI調整完了\n\n${data.explanation}\n\n変更: ${data.changes.length}件`);
      } else {
        alert(`✨ AIからの回答\n\n${data.explanation}`);
      }
    } catch (e) {
      alert("AI調整エラー: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }, [aiInstruction, deptShifts, staffList, dept, year, month, setDeptShifts]);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    const cs=staffList, cd=dept, ct=shiftTrend;
    setTimeout(() => {
      try { setAllShifts(prevAll=>{const cs2=prevAll[cd.id]||{};const{shifts:result,warnings}=autoGenerate(cs,cd,year,month,cs2,ct);if(Object.keys(warnings).length>0)setTimeout(()=>setGenerateWarnings({warnings,deptLabel:cd.label}),0);return{...prevAll,[cd.id]:result};}); }
      catch(e){console.error(e);alert("自動生成エラー: "+e.message);}
      finally{setGenerating(false);}
    },700);
  }, [staffList,dept,year,month,shiftTrend]);

  const handleLeftClick = useCallback((staffId, day) => {
    setDeptShifts(prev=>{const cur=prev[staffId]?.[day]||"";const HALF=new Set(["日/休","休/日","早/休","休/遅"]);if(HALF.has(cur))return prev;const idx=SHIFT_KEYS.indexOf(cur);const next=SHIFT_KEYS[(idx+1)%SHIFT_KEYS.length];return{...prev,[staffId]:{...(prev[staffId]||{}),[day]:next}};});
  }, [setDeptShifts]);

  const handleRightClick = useCallback((staffId, day, e) => { setCtxMenu({staffId,day,x:e.clientX+4,y:e.clientY+4}); }, []);
  const handleMenuSelect = (shiftKey) => { if(!ctxMenu)return; const{staffId,day}=ctxMenu; setDeptShifts(prev=>({...prev,[staffId]:{...(prev[staffId]||{}),[day]:shiftKey}})); setCtxMenu(null); };

  const saveStaff = (form) => { setStaffList(prev=>{const idx=prev.findIndex(s=>s.id===form.id);if(idx>=0)return prev.map((s,i)=>i===idx?form:s);return[...prev,{...form,id:`${activeDeptId}_${Date.now()}`,dept:activeDeptId}];}); setStaffModal(null); };
  const deleteStaff = (id) => { const s=staffList.find(x=>x.id===id); setConfirmDialog({message:`「${s?.name||'このスタッフ'}」を削除します。\nよろしいですか？`,onOk:()=>setStaffList(prev=>prev.filter(x=>x.id!==id)),okLabel:"削除する"}); };
  const handleBulkKyuko = (values, mk) => { setStaffList(prev=>prev.map(s=>{if(values[s.dept]===undefined)return s;return{...s,kyukoDaysByMonth:{...(s.kyukoDaysByMonth||{}),[mk]:values[s.dept]}};})); setBulkKyukoModal(false); };

  const prevMonth = ()=>{ if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextMonth = ()=>{ if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };

  const handleSaveDept = (deptData) => { const isNew=!depts.find(d=>d.id===deptData.id); setDepts(prev=>{const idx=prev.findIndex(d=>d.id===deptData.id);if(idx>=0)return prev.map((d,i)=>i===idx?deptData:d);return[...prev,deptData];}); if(isNew)setActiveDeptId(deptData.id); setDeptSettingModal(null); };
  const handleDeleteDept = (deptId) => { if(depts.length<=1){alert("部署は最低1つ必要です。");return;} if(activeDeptId===deptId){const next=depts.find(d=>d.id!==deptId);if(next)setActiveDeptId(next.id);} setDepts(prev=>prev.filter(d=>d.id!==deptId)); setStaffList(prev=>prev.filter(s=>s.dept!==deptId)); setAllShifts(prev=>{const n={...prev};delete n[deptId];return n;}); setDeptSettingModal(null); };

  if (dbLoading) return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#f0fbfa,#d4f1ef)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans JP',sans-serif"}}><div style={{textAlign:"center"}}><div style={{margin:"0 auto 12px"}}><ShifuponIcon size={48} radius={12}/></div><div style={{color:"#6ab5b2",fontSize:13}}>データを同期中…</div></div></div>;
  if (!dept) return <div style={{minHeight:"100vh",background:"#f0fbfa",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#c8b8a8",fontSize:14}}>読み込み中…</div></div>;

  return (
    <div style={{width:"100%",minHeight:"100vh",boxSizing:"border-box",background:"#f0fbfa",fontFamily:"'Noto Sans JP',sans-serif",color:"#1a3635",maxWidth:"none",margin:0,padding:0,textAlign:"left"}}>
      {/* TOPBAR */}
      <div style={{background:"#f0fffe",borderBottom:"1px solid #90cbc8",padding:"10px 14px",position:"sticky",top:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <ShifuponIcon size={36} radius={9}/>
          <div>
            <ShifuponLogo size={18}/>
            <div style={{fontSize:9,color:"#8ecece",letterSpacing:"0.08em"}}>介護施設シフト管理</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={prevMonth} style={MNAV}>◀</button>
          <div style={{fontSize:14,fontWeight:800,color:"#2BBFBA",minWidth:104,textAlign:"center",background:"#ffffff",border:"1px solid #90cbc8",borderRadius:8,padding:"5px 10px"}}>{year}年 {month+1}月</div>
          <button onClick={nextMonth} style={MNAV}>▶</button>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{fontSize:10,fontWeight:700,color:saveStatus==="saved"?"#5cb87a":"#6ab5b2",display:"flex",alignItems:"center",gap:3,minWidth:60}}>
            {saveStatus==="saved"&&<><span>💾</span><span>保存済</span></>}
            {saveStatus==="unsaved"&&<><span>⏳</span><span>未保存</span></>}
          </div>
          <button onClick={handleGenerate} disabled={generating} style={{background:generating?"#d5edeb":"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:generating?"#2a5a57":"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:generating?"not-allowed":"pointer",fontSize:12,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>{generating?"⏳ 生成中…":"⚡ 自動生成"}</button>
          <button onClick={()=>setDownloadModal(true)} style={{background:"#ffffff",color:"#34d399",border:"1px solid #064e3b",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>📤 書き出し</button>
          <button onClick={()=>setBulkKyukoModal(true)} style={{background:"#ffffff",color:"#2BBFBA",border:"1px solid #90cbc8",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>📅 休み設定</button>
          <button onClick={()=>setExcelImportModal(true)} style={{background:Object.keys(shiftTrend).filter(k=>k!=='_months').length>0?"#e8f5ee":"#ffffff",color:Object.keys(shiftTrend).filter(k=>k!=='_months').length>0?"#5cb87a":"#2a6a67",border:Object.keys(shiftTrend).filter(k=>k!=='_months').length>0?"1px solid #16a34a":"1px solid #90cbc8",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>{Object.keys(shiftTrend).filter(k=>k!=='_months').length>0?`📊 傾向ON`:"📊 傾向学習"}</button>
          <button onClick={()=>setAiMode(v=>!v)} style={{background:aiMode?"#ede9fe":"#ffffff",color:aiMode?"#7c3aed":"#2a6a67",border:aiMode?"1px solid #7c3aed":"1px solid #90cbc8",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>{aiMode?"🤖 AI ON":"🤖 AI"}</button>
          <button onClick={()=>setClearModal(true)} style={{background:"#ffffff",color:"#ef4444",border:"1px solid #450a0a",borderRadius:8,padding:"7px 10px",cursor:"pointer",fontSize:12,fontWeight:700}}>🗑 クリア</button>
          <button onClick={onLogout} style={{background:"#ffffff",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"7px 10px",cursor:"pointer",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
            <span>👤</span>
            <span style={{fontSize:9,color:"#6ab5b2",maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.user?.email}</span>
            <span>ログアウト</span>
          </button>
        </div>
      </div>

      {/* AI PANEL */}
      {aiMode&&(
        <div style={{background:"#f3f0ff",borderBottom:"1px solid #c4b5fd",padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:12,fontWeight:700,color:"#7c3aed",display:"flex",alignItems:"center",gap:6}}>
            <span>🤖 AI調整モード</span>
            <span style={{fontSize:10,fontWeight:400,color:"#a78bfa"}}>自動生成後のシフトを指示で調整できます</span>
          </div>
          <textarea
            value={aiInstruction}
            onChange={e=>setAiInstruction(e.target.value)}
            placeholder={"例）田中さんと山田さんは夜勤を一緒にしないで\n例）鈴木さんは水曜を早番にしてほしい\n例）夜勤が連続している人を確認して調整して"}
            style={{width:"100%",minHeight:72,borderRadius:8,border:"1px solid #c4b5fd",padding:"8px 10px",fontSize:12,color:"#4c1d95",background:"#faf5ff",resize:"vertical",boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}
          />
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button
              onClick={handleAiAdjust}
              disabled={!aiInstruction.trim()||aiLoading}
              style={{background:(!aiInstruction.trim()||aiLoading)?"#e9d5ff":"linear-gradient(135deg,#7c3aed,#a855f7)",color:(!aiInstruction.trim()||aiLoading)?"#a78bfa":"#fff",border:"none",borderRadius:8,padding:"7px 16px",cursor:(!aiInstruction.trim()||aiLoading)?"not-allowed":"pointer",fontSize:12,fontWeight:800}}
            >
              {aiLoading?"⏳ 調整中…":"✨ AIに調整を依頼"}
            </button>
            <span style={{fontSize:10,color:"#a78bfa"}}>※ 自動生成後に使うと精度UP</span>
          </div>
        </div>
      )}

      {/* DEPT TABS */}
      <div style={{background:"#e0f4f2",borderBottom:"1px solid #90cbc8",display:"flex",overflowX:"auto",padding:"0 6px",alignItems:"center"}}>
        {depts.map(d=>{const cnt=staffList.filter(s=>s.dept===d.id).length,act=d.id===activeDeptId;return(<div key={d.id} style={{display:"flex",alignItems:"center",position:"relative"}}><button onClick={()=>setActiveDeptId(d.id)} style={{padding:"9px 10px",background:"transparent",border:"none",color:act?"#2BBFBA":"#2a5a57",borderBottom:act?"2px solid #2BBFBA":"2px solid transparent",cursor:"pointer",fontSize:12,fontWeight:act?800:400,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}}><span>{d.icon}</span><span>{d.label}</span><span style={{background:act?"#8ecece":"#d5edeb",color:act?"#2BBFBA":"#2a5a57",borderRadius:8,padding:"1px 6px",fontSize:10,fontWeight:700}}>{cnt}</span></button>{act&&<button onClick={()=>setDeptSettingModal({dept:d,isNew:false})} style={{background:"#2BBFBA",border:"none",borderRadius:6,color:"#fff",cursor:"pointer",fontSize:11,padding:"3px 8px",marginLeft:2,fontWeight:700,whiteSpace:"nowrap"}}>⚙️ 設定</button>}</div>);})}
        <button onClick={()=>setDeptSettingModal({dept:null,isNew:true})} style={{background:"none",border:"1px dashed #0e3a38",borderRadius:7,color:"#2a5a57",cursor:"pointer",fontSize:11,padding:"5px 10px",marginLeft:6,whiteSpace:"nowrap",flexShrink:0}}>＋ 部署追加</button>
      </div>

      {/* INNER TABS */}
      <div style={{background:"#eaf8f6",borderBottom:"2px solid #2BBFBA",display:"flex",padding:"0 12px",gap:2,alignItems:"center"}}>
        {[["shift","📅 シフト表"],["summary","📊 集計"],["staff","👥 スタッフ"],["yotei","📋 予定表"]].map(([k,l])=><button key={k} onClick={()=>setInnerTab(k)} style={{padding:"7px 13px",background:"transparent",border:"none",color:innerTab===k?"#1a9e9a":"#2a6a67",borderBottom:innerTab===k?"2px solid #2BBFBA":"2px solid transparent",cursor:"pointer",fontSize:12,fontWeight:innerTab===k?800:600}}>{l}</button>)}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {innerTab==="shift"&&(
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <button onClick={()=>handleZoomChange(tableZoom-5)} disabled={tableZoom<=40} style={{width:22,height:22,borderRadius:4,border:"1px solid #90cbc8",background:"#ffffff",color:tableZoom<=40?"#8ecece":"#2BBFBA",cursor:tableZoom<=40?"not-allowed":"pointer",fontSize:14,fontWeight:900,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <input type="range" min={40} max={100} step={5} value={tableZoom} onChange={e=>handleZoomChange(Number(e.target.value))} style={{width:72,accentColor:"#2BBFBA",cursor:"pointer"}}/>
              <button onClick={()=>handleZoomChange(tableZoom+5)} disabled={tableZoom>=100} style={{width:22,height:22,borderRadius:4,border:"1px solid #90cbc8",background:"#ffffff",color:tableZoom>=100?"#8ecece":"#2BBFBA",cursor:tableZoom>=100?"not-allowed":"pointer",fontSize:14,fontWeight:900,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
              <span style={{fontSize:11,fontWeight:700,color:"#2BBFBA",minWidth:34,textAlign:"right"}}>{tableZoom}%</span>
              <button onClick={()=>{const days=getDays(year,month);const ds=staffList.filter(s=>s.dept===activeDeptId).length;handleZoomChange(autoFitZoom(ds,days));}} style={{background:"#ffffff",border:"1px solid #90cbc8",borderRadius:4,color:"#2BBFBA",fontSize:10,padding:"2px 6px",cursor:"pointer",whiteSpace:"nowrap"}}>⊞ フィット</button>
            </div>
          )}
          <div style={{fontSize:10,color:"#8ecece",padding:"0 4px"}}>最低配置：{Object.entries(dept.minStaff||{}).map(([k,v])=>`${k}×${v}`).join(" / ")}</div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{padding:"10px 8px",minHeight:"calc(100vh - 180px)"}}>
        {innerTab==="shift"&&(<><Legend/><ZoomWrapper zoom={tableZoom} onZoomChange={handleZoomChange}><ShiftTable staffList={staffList} shifts={deptShifts} dept={dept} year={year} month={month} onLeftClick={handleLeftClick} onRightClick={handleRightClick}/></ZoomWrapper></>)}
        {innerTab==="summary"&&<SummaryView staffList={staffList} shifts={deptShifts} dept={dept} year={year} month={month}/>}
        {innerTab==="staff"&&<StaffList staffList={staffList} dept={dept} year={year} month={month} onEdit={s=>setStaffModal({data:s})} onDelete={deleteStaff} onAdd={()=>setStaffModal({data:null})}/>}
        {innerTab==="yotei"&&<YoteiView dept={dept} staffList={staffList} shifts={deptShifts} year={year} month={month} yoteiDeptData={deptYotei} onUpdateYotei={handleUpdateYotei} onBatchUpdateYotei={handleBatchUpdateYotei} floorSettings={floorSettings} onUpdateFloorSettings={handleUpdateFloorSettings}/>}
      </div>

      {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} onSelect={handleMenuSelect} onClose={()=>setCtxMenu(null)}/>}
      {staffModal!==null&&<StaffModal data={staffModal.data} deptId={activeDeptId} depts={depts} year={year} month={month} onSave={saveStaff} onClose={()=>setStaffModal(null)}/>}
      {deptSettingModal&&<DeptSettingModal dept={deptSettingModal.dept} isNew={deptSettingModal.isNew} onSave={handleSaveDept} onDelete={handleDeleteDept} onConfirm={(message,onOk,okLabel)=>setConfirmDialog({message,onOk,okLabel})} onClose={()=>setDeptSettingModal(null)}/>}
      {clearModal&&<ClearModal deptLabel={dept.label} onClearDept={()=>{setDeptShifts({});setClearModal(false);}} onClearAll={()=>{setAllShifts({});setClearModal(false);}} onClose={()=>setClearModal(false)}/>}
      {excelImportModal&&<ExcelImportModal currentTrend={shiftTrend} onImport={(newTrend)=>{setShiftTrend(prev=>{const pm=prev._months||[],nm=newTrend._months||[];const m={...prev,...newTrend};m._months=[...new Set([...pm,...nm])].sort();return m;});setExcelImportModal(false);}} onReset={()=>{setShiftTrend({});setExcelImportModal(false);}} onConfirm={(message,onOk,okLabel)=>setConfirmDialog({message,onOk,okLabel})} onClose={()=>setExcelImportModal(false)}/>}
      {bulkKyukoModal&&<BulkKyukoModal depts={depts} staffList={staffList} year={year} month={month} onApply={handleBulkKyuko} onClose={()=>setBulkKyukoModal(false)}/>}
      {downloadModal&&<DownloadModal depts={depts} staffList={staffList} allShifts={allShifts} year={year} month={month} activeDeptId={activeDeptId} onClose={()=>setDownloadModal(false)}/>}
      {generateWarnings&&<GenerateWarningModal warnings={generateWarnings.warnings} deptLabel={generateWarnings.deptLabel} year={year} month={month} onClose={()=>setGenerateWarnings(null)}/>}
      <div style={{position:"fixed",bottom:12,right:12,background:"#d5edeb",border:"1px solid #90cbc8",borderRadius:16,padding:"5px 12px",fontSize:10,color:"#8ecece",display:"flex",gap:6,alignItems:"center"}}><span style={{color:"#2BBFBA",fontWeight:700}}>Phase 2</span><span>クラウド同期 ＋ リアルタイム連携</span></div>
      {confirmDialog&&<ConfirmDialog message={confirmDialog.message} okLabel={confirmDialog.okLabel||"削除する"} onOk={()=>{confirmDialog.onOk();setConfirmDialog(null);}} onCancel={()=>setConfirmDialog(null)}/>}
    </div>
  );
}