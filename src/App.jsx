import { useState, useCallback, useRef, useEffect, useMemo, Component } from "react";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import { Settings, Calendar, Users, Trash2, Zap, ClipboardList, Download, Lock, Unlock, History, Share2, Building2, HelpCircle, ChevronLeft, ChevronRight, LogOut, RefreshCw, Loader, MoreHorizontal } from 'lucide-react';

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
          <stop offset="100%" stopColor="#F4F4F5"/>
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
//  勤務実績: シフト種別デフォルト時刻
// ─────────────────────────────────────────────
const SHIFT_DEFAULT_TIMES = {
  "早番": { start: "07:00", end: "15:30", breakMin: 45 },
  "日勤": { start: "09:00", end: "17:30", breakMin: 60 },
  "遅番": { start: "12:00", end: "20:30", breakMin: 60 },
  "夜勤": { start: "16:45", end: "09:15", breakMin: 90 },
  "明け": { start: "00:00", end: "09:15", breakMin: 0 },
};

// ─────────────────────────────────────────────
//  LOGIN PAGE
// ─────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [mode, setMode]       = useState("login");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [agreed, setAgreed]   = useState(false);
  const [showTerms, setShowTerms]   = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [msg, setMsg]         = useState("");

  const handleSubmit = async () => {
    if (!email || !password) { setError("メールアドレスとパスワードを入力してください"); return; }
    if (mode === "signup" && !facilityName.trim()) { setError("施設名を入力してください"); return; }
    if (mode === "signup" && !agreed) { setError("利用規約・プライバシーポリシーへの同意が必要です"); return; }
    setLoading(true); setError(""); setMsg("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLogin();
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { facility_name: facilityName.trim() } } });
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
      minHeight:"100vh", background:"#F8F9FA",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Noto Sans JP',sans-serif", padding:16,
    }}>
      <div style={{
        background:"#FAFAFA", border:"1px solid #D4D4D8", borderRadius:18,
        padding:36, width:"100%", maxWidth:400,
        boxShadow:"0 20px 60px rgba(0,0,0,0.12)",
      }}>
        <div style={{textAlign:"center", marginBottom:28}}>
          <div style={{margin:"0 auto 12px", width:56, height:56}}><ShifuponIcon size={56} radius={14}/></div>
          <ShifuponLogo size={28} />
          <div style={{fontSize:11, color:"#71717A", marginTop:6}}>介護施設シフト管理システム</div>
        </div>

        <div style={{display:"flex", background:"#F4F4F5", borderRadius:10, padding:3, marginBottom:22}}>
          {[["login","ログイン"],["signup","新規登録"]].map(([k,l])=>(
            <button key={k} onClick={()=>{setMode(k);setError("");setMsg("");}} style={{
              flex:1, background:mode===k?"#fff":"transparent",
              border:"none", borderRadius:8, padding:"8px 0",
              fontSize:13, fontWeight:mode===k?800:400,
              color:mode===k?"#6366F1":"#52525B",
              cursor:"pointer",
              boxShadow:mode===k?"0 1px 4px rgba(0,0,0,0.1)":"none",
              transition:"all 0.15s",
            }}>{l}</button>
          ))}
        </div>

        {mode==="signup"&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11, color:"#52525B", marginBottom:5}}>施設名 <span style={{color:"#ef4444"}}>*</span></div>
            <input
              type="text" value={facilityName}
              onChange={e=>setFacilityName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="〇〇介護施設"
              style={{width:"100%", background:"#f0fffe", border:"1px solid #D4D4D8", borderRadius:8, color:"#18181B", padding:"10px 12px", fontSize:13, boxSizing:"border-box", outline:"none"}}
            />
          </div>
        )}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11, color:"#52525B", marginBottom:5}}>メールアドレス</div>
          <input
            type="email" value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="example@email.com"
            style={{
              width:"100%", background:"#f0fffe", border:"1px solid #D4D4D8",
              borderRadius:8, color:"#18181B", padding:"10px 12px", fontSize:13,
              boxSizing:"border-box", outline:"none",
            }}
          />
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11, color:"#52525B", marginBottom:5}}>パスワード{mode==="signup"&&<span style={{color:"#71717A"}}>（6文字以上）</span>}</div>
          <input
            type="password" value={password}
            onChange={e=>setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="••••••••"
            style={{
              width:"100%", background:"#f0fffe", border:"1px solid #D4D4D8",
              borderRadius:8, color:"#18181B", padding:"10px 12px", fontSize:13,
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

        {mode==="signup"&&(
          <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:16,padding:"10px 12px",background:"#f0fffe",borderRadius:8,border:"1px solid #E4E4E7"}}>
            <input type="checkbox" id="agree" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{marginTop:2,accentColor:"#6366F1",cursor:"pointer",flexShrink:0}}/>
            <label htmlFor="agree" style={{fontSize:12,color:"#3F3F46",lineHeight:1.6,cursor:"pointer"}}>
              <button onClick={()=>setShowTerms(true)} style={{background:"none",border:"none",color:"#6366F1",cursor:"pointer",fontSize:12,fontWeight:700,padding:0,textDecoration:"underline"}}>利用規約</button>
              {" および "}
              <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",color:"#6366F1",cursor:"pointer",fontSize:12,fontWeight:700,padding:0,textDecoration:"underline"}}>プライバシーポリシー</button>
              {" に同意します"}
            </label>
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{
          width:"100%",
          background:loading?"#E4E4E7":"#6366F1",
          color:"#fff", border:"none", borderRadius:10,
          padding:"13px 0", fontSize:14, fontWeight:800,
          cursor:loading?"not-allowed":"pointer",
          letterSpacing:"0.05em",
        }}>
          {loading ? "⏳ 処理中…" : mode==="login" ? "ログイン" : "アカウントを作成"}
        </button>

        <div style={{textAlign:"center",marginTop:20,display:"flex",justifyContent:"center",gap:16}}>
          <button onClick={()=>setShowTerms(true)} style={{background:"none",border:"none",color:"#71717A",cursor:"pointer",fontSize:11,textDecoration:"underline"}}>利用規約</button>
          <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",color:"#71717A",cursor:"pointer",fontSize:11,textDecoration:"underline"}}>プライバシーポリシー</button>
        </div>
      </div>
      {showTerms&&<TermsModal onClose={()=>setShowTerms(false)}/>}
      {showPrivacy&&<PrivacyModal onClose={()=>setShowPrivacy(false)}/>}
    </div>
  );
}

// ─────────────────────────────────────────────
//  TERMS & PRIVACY MODALS
// ─────────────────────────────────────────────
function LegalModal({ title, onClose, children }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000000bb",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:16,padding:24,width:"100%",maxWidth:560,maxHeight:"80vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,position:"sticky",top:0,background:"#FAFAFA",paddingBottom:12,borderBottom:"1px solid #F4F4F5"}}>
          <div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:22}}>✕</button>
        </div>
        <div style={{fontSize:12,color:"#3F3F46",lineHeight:2}}>{children}</div>
      </div>
    </div>
  );
}

function TermsModal({ onClose }) {
  return (
    <LegalModal title="📄 利用規約" onClose={onClose}>
      <p style={{color:"#71717A",marginBottom:16}}>最終更新日：2026年4月26日</p>
      <h3 style={{color:"#18181B",marginBottom:8}}>第1条（サービスの目的）</h3>
      <p>しふぽん（以下「本サービス」）は、介護施設向けのシフト管理を支援するWebアプリケーションです。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>第2条（利用登録）</h3>
      <p>本サービスの利用にはメールアドレスによるアカウント登録が必要です。登録内容は正確な情報を入力してください。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>第3条（プランと料金）</h3>
      <p>本サービスは無料プラン・スタンダードプラン・フルプランを提供します。有料プランの料金・支払方法については別途ご案内します。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>第4条（禁止事項）</h3>
      <p>以下の行為を禁止します。</p>
      <ul style={{paddingLeft:20,marginTop:8}}>
        <li>他のユーザーへの不正アクセス</li>
        <li>サービスの複製・転売・商業目的での無断利用</li>
        <li>虚偽の情報による登録</li>
        <li>法令または公序良俗に反する行為</li>
      </ul>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>第5条（免責事項）</h3>
      <p>運営者は本サービスの利用によって生じた損害について、運営者の故意または重過失がある場合を除き、責任を負いません。システム障害・データ消失等について最大限の努力をもって対応しますが、完全な保証はしかねます。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>第6条（サービスの変更・停止）</h3>
      <p>運営者は事前の通知をもってサービス内容の変更または停止ができるものとします。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>第7条（規約の変更）</h3>
      <p>本規約は必要に応じて変更されることがあります。変更後も本サービスを継続して利用した場合、変更後の規約に同意したものとみなします。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>第8条（準拠法）</h3>
      <p>本規約は日本法に準拠し、日本国内の裁判所を専属的合意管轄とします。</p>
    </LegalModal>
  );
}

function PrivacyModal({ onClose }) {
  return (
    <LegalModal title="🔒 プライバシーポリシー" onClose={onClose}>
      <p style={{color:"#71717A",marginBottom:16}}>最終更新日：2026年4月26日</p>
      <h3 style={{color:"#18181B",marginBottom:8}}>1. 収集する情報</h3>
      <p>本サービスでは以下の情報を収集します。</p>
      <ul style={{paddingLeft:20,marginTop:8}}>
        <li>メールアドレス（アカウント認証のため）</li>
        <li>施設名（サービス管理のため）</li>
        <li>シフトデータ・職員情報（サービス提供のため）</li>
      </ul>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>2. 利用目的</h3>
      <p>収集した情報は以下の目的のみに利用します。</p>
      <ul style={{paddingLeft:20,marginTop:8}}>
        <li>本サービスの提供・運営</li>
        <li>お問い合わせへの対応</li>
        <li>サービス改善のための分析</li>
      </ul>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>3. 第三者への提供</h3>
      <p>収集した個人情報は、法令に基づく場合を除き、第三者に提供・開示しません。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>4. 安全管理</h3>
      <p>データはSupabase（米国）のサーバーで安全に管理されています。アクセス制御・暗号化により不正アクセス防止に努めます。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>5. Cookieについて</h3>
      <p>本サービスはログイン状態の維持のためにローカルストレージを使用します。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>6. 個人情報の削除</h3>
      <p>アカウントの削除をご希望の場合は、お問い合わせ先までご連絡ください。速やかに対応いたします。</p>
      <h3 style={{color:"#18181B",margin:"16px 0 8px"}}>7. お問い合わせ</h3>
      <p>個人情報の取り扱いに関するお問い合わせは以下までご連絡ください。</p>
      <p style={{marginTop:8,background:"#F4F4F5",borderRadius:8,padding:"8px 12px"}}>メール：takaibiki1980@icloud.com</p>
    </LegalModal>
  );
}


const SHIFTS = {
  早番:  { short:"早", color:"#D97706", bg:"#FFFFFF", border:"#FED7AA", time:"7:00〜16:00" },
  日勤:  { short:"日", color:"#374151", bg:"#FFFFFF", border:"#E5E7EB", time:"9:00〜18:00" },
  遅番:  { short:"遅", color:"#2563EB", bg:"#FFFFFF", border:"#DBEAFE", time:"11:30〜20:30" },
  夜勤:  { short:"夜", color:"#FFFFFF", bg:"#06B6D4", border:"transparent", time:"16:30〜翌9:30" },
  明け:  { short:"明", color:"#0369A1", bg:"#E0F2FE", border:"transparent", time:"夜勤明け" },
  休み:  { short:"休", color:"#991B1B", bg:"#F3E8E8", border:"transparent", time:"－" },
  希望休: { short:"希", color:"#991B1B", bg:"#F3E8E8", border:"transparent", time:"希望休" },
  有休:  { short:"有", color:"#991B1B", bg:"#F3E8E8", border:"transparent", time:"有給" },
  "日/休": { short:"日休", color:"#374151", bg:"#FFFFFF", border:"#E5E7EB", time:"午前日勤／午後休" },
  "休/日": { short:"休日", color:"#991B1B", bg:"#F3E8E8", border:"transparent", time:"午前休／午後日勤" },
  "早/休": { short:"早休", color:"#D97706", bg:"#FFFFFF", border:"#FED7AA", time:"早番半日／午後休" },
  "休/遅": { short:"休遅", color:"#2563EB", bg:"#FFFFFF", border:"#DBEAFE", time:"午前休／遅番半日" },
  "": { short:"－", color:"#9CA3AF", bg:"transparent", border:"transparent", time:"" },
};
const SHIFT_KEYS = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休",""];
const SHIFT_KEYS_MANUAL = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休","日/休","休/日","早/休","休/遅",""];
const REST_TYPES  = new Set(["休み","希望休","有休","明け","日/休","休/日","早/休","休/遅"]);
const HALF_REST_TYPES = new Set(["日/休","休/日","早/休","休/遅"]);
const WORK_TYPES  = new Set(["早番","日勤","遅番","夜勤"]);

// カスタムシフト種別のstyling定義を取得（標準SHIFTSに無い場合はbaseTypeの色を継承）
function getShiftDef(key, customDefs) {
  if (SHIFTS[key]) return SHIFTS[key];
  const cd = (customDefs || []).find(d => d.key === key);
  if (!cd) return SHIFTS[""];
  const base = SHIFTS[cd.baseType] || SHIFTS["日勤"];
  const short = key.length <= 2 ? key : key.slice(0, 2);
  return { short, color: base.color, bg: base.bg, border: base.border, time: cd.startTime && cd.endTime ? `${cd.startTime}〜${cd.endTime}` : base.time };
}
function buildDeptWorkTypes(customDefs) {
  const s = new Set(WORK_TYPES);
  (customDefs || []).filter(d => WORK_TYPES.has(d.baseType)).forEach(d => s.add(d.key));
  return s;
}
function buildDeptRestTypes(customDefs) {
  const s = new Set(REST_TYPES);
  (customDefs || []).filter(d => REST_TYPES.has(d.baseType)).forEach(d => s.add(d.key));
  return s;
}
// ── 必須運営時間モード（カスタム時間部署）向けヘルパー ────────────────────
function isCustomTimeDept(dept) { return !!(dept?.requiredStart && dept?.requiredEnd); }
function timeToMins(t) { if (!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; }
function minsToTimeStr(m) { const h=Math.floor(m/60)%24,mn=m%60; return `${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}`; }
function buildDayIntervals(shiftKeys, dept) {
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
function coverageGaps(intervals,reqStart,reqEnd,minStaff=1,step=15) {
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
const DEFAULT_SHIFT_TIMES = {
  "早番": { start: "07:00", end: "16:00" },
  "日勤": { start: "09:00", end: "18:00" },
  "遅番": { start: "11:30", end: "20:30" },
  "夜勤": { start: "16:30", end: "09:30" },
};
function getShiftEndTime(key, dept) {
  const st = dept?.shiftTimes?.[key];
  if (st?.end) return st.end;
  const cd = (dept?.customShiftDefs||[]).find(d=>d.key===key);
  if (cd?.endTime) return cd.endTime;
  return DEFAULT_SHIFT_TIMES[key]?.end || null;
}
function getShiftStartTime(key, dept) {
  const st = dept?.shiftTimes?.[key];
  if (st?.start) return st.start;
  const cd = (dept?.customShiftDefs||[]).find(d=>d.key===key);
  if (cd?.startTime) return cd.startTime;
  return DEFAULT_SHIFT_TIMES[key]?.start || null;
}
function shiftIntervalHours(prevKey, nextKey, dept) {
  const endStr = getShiftEndTime(prevKey, dept);
  const startStr = getShiftStartTime(nextKey, dept);
  if (!endStr || !startStr) return 24;
  const [eh, em] = endStr.split(":").map(Number);
  const [sh, sm] = startStr.split(":").map(Number);
  return (sh * 60 + sm + 1440 - (eh * 60 + em)) / 60;
}

const DEFAULT_DEPTS = [
  { id:"kaigo1", label:"介護部 1階", icon:"🏠", shiftTypes:["早番","日勤","遅番","夜勤"], minStaff:{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 }, maxStaff:{ 早番:1, 日勤:99, 遅番:1, 夜勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["介護福祉士","介護職員","介護補助","介護助手","特定技能"], roleShiftTypes:{ "介護補助":["日勤"], "介護助手":["日勤"] } },
  { id:"kaigo2", label:"介護部 2階", icon:"🏢", shiftTypes:["早番","日勤","遅番","夜勤"], minStaff:{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 }, maxStaff:{ 早番:1, 日勤:99, 遅番:1, 夜勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["介護福祉士","介護職員","介護補助","介護助手","特定技能"], roleShiftTypes:{ "介護補助":["日勤"], "介護助手":["日勤"] } },
  { id:"jimu",   label:"事務所",     icon:"📋", shiftTypes:["日勤"], minStaff:{ 日勤:1 }, maxStaff:{ 日勤:99 }, defaultKyukoDays:8, maxConsecutive:5, roles:["事務員","主任"] },
  { id:"kango",  label:"看護部",     icon:"💉", shiftTypes:["日勤"], minStaff:{ 日勤:1 }, maxStaff:{ 日勤:99 }, defaultKyukoDays:8, maxConsecutive:5, roles:["看護師","准看護師"] },
  { id:"eiyo",   label:"栄養科",     icon:"🍱", shiftTypes:["早番","日勤"], minStaff:{ 早番:1, 日勤:1 }, maxStaff:{ 早番:1, 日勤:99 }, defaultKyukoDays:8, maxConsecutive:5, roles:["管理栄養士","栄養士","調理師"] },
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

// 名前正規化：スペース(半角・全角)・中点(・･)・ピリオドを除去して小文字化
// 「田中 花子」「田中　花子」「田中花子」「ジョン・スミス」「ジョン スミス」を統一比較
const normName = (s) => String(s||'').replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[\s　・･．.\-ー－]/g,'').toLowerCase();
const nameMatch = (a, b) => { const na=normName(a), nb=normName(b); return na===nb||na.includes(nb)||nb.includes(na); };

// UUID ↔ 22文字base64url変換（URLを40%短縮）
const uuidToShort = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  const bytes = [];
  for (let i = 0; i < 32; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const shortToUuid = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const hex = Array.from(bin).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};

function calcConsecutive(sShifts, d) {
  let cnt = 0;
  for (let i = d; i >= 1; i--) { if (WORK_TYPES.has(sShifts[i])) cnt++; else break; }
  return cnt;
}

// 18ヶ月以上前の例外月を自動削除（期限切れ）
function filterExpiredExceptions(list) {
  const now = new Date();
  const cutoff = now.getFullYear() * 12 + now.getMonth() - 17; // 18ヶ月前
  return (list || []).filter(k => {
    const [y, m] = k.split('-').map(Number);
    return (y * 12 + (m - 1)) >= cutoff;
  });
}

// しふぽん蓄積データからスタッフごとのシフト傾向を学習する
function computeLearnedTrend(allDBData, staffList, exceptionMonths = []) {
  const exceptionSet = new Set(exceptionMonths); // "YYYY-M" 形式（1始まり月）
  const counts = {}, totals = {}, monthSets = {};
  const transitions = {}, transitionTotals = {}; // 遷移確率集計: [staffId][prev][curr]
  const dowShifts = {}; // 曜日別シフト集計: [staffId][dow][shiftType]
  const dowRests = {};   // 曜日別休み集計: [staffId][dow] 重み付きカウント (+6%7: 月=0,日=6)
  const dowTotalsR = {}; // 曜日別総日数:   [staffId][dow] 重み付きカウント (+6%7: 月=0,日=6)
  const REST_DOW_SET = new Set(['休み','希望休','有休']);
  const now = new Date();
  const nowYM = now.getFullYear() * 12 + now.getMonth();
  const WORK_SHIFT_SET = new Set(['早番','日勤','遅番','夜勤']);
  for (const [key2, shifts2] of Object.entries(allDBData)) {
    if (!key2.startsWith('shifts_') || !shifts2 || typeof shifts2 !== 'object') continue;
    for (const ss of Object.values(shifts2)) {
      if (!ss || typeof ss !== 'object') continue;
      for (const sh of Object.values(ss)) { if (sh && typeof sh === 'string' && !['希望休','有休','明け','休み',''].includes(sh)) WORK_SHIFT_SET.add(sh); }
    }
  }
  const WORK_SHIFT_KEYS = [...WORK_SHIFT_SET];
  const TRANS_KEYS = new Set([...WORK_SHIFT_KEYS, '明け','休み','希望休']);
  for (const [key, shifts] of Object.entries(allDBData)) {
    if (!key.startsWith('shifts_') || !shifts || typeof shifts !== 'object') continue;
    // キー形式: shifts_YYYY_M_deptId
    const parts = key.split('_');
    if (parts.length < 4) continue;
    const keyYear = parseInt(parts[1]), keyMonthRaw = parseInt(parts[2]);
    const keyMonth = keyMonthRaw - 1; // 0始まり
    if (isNaN(keyYear) || isNaN(keyMonth)) continue;
    // 例外月はスキップ
    if (exceptionSet.has(`${keyYear}-${keyMonthRaw}`)) continue;
    // 直近ほど重く: 今月=4, 1ヶ月前=3, 2ヶ月前=2, 3ヶ月以前=1
    const monthsAgo = Math.max(0, nowYM - (keyYear * 12 + keyMonth));
    const weight = Math.max(1, 4 - monthsAgo);
    const daysInMonth = new Date(keyYear, keyMonthRaw, 0).getDate();
    for (const [staffId, staffShifts] of Object.entries(shifts)) {
      if (!staffShifts || typeof staffShifts !== 'object') continue;
      if (!counts[staffId]) { counts[staffId] = {}; totals[staffId] = 0; monthSets[staffId] = new Set(); }
      if (!transitions[staffId]) { transitions[staffId] = {}; transitionTotals[staffId] = {}; }
      if (!dowShifts[staffId]) dowShifts[staffId] = [{},{},{},{},{},{},{}];
      if (!dowTotalsR[staffId]) dowTotalsR[staffId] = [0,0,0,0,0,0,0];
      if (!dowRests[staffId]) dowRests[staffId] = [0,0,0,0,0,0,0];
      monthSets[staffId].add(`${keyYear}-${keyMonth}`);
      for (const [dayStr, shift] of Object.entries(staffShifts)) {
        // dowRestRate用: スキップ前に全シフトを曜日別集計
        if (shift) {
          const dr = parseInt(dayStr);
          if (!isNaN(dr)) {
            const dow2 = (new Date(keyYear, keyMonth, dr).getDay() + 6) % 7;
            dowTotalsR[staffId][dow2] += weight;
            if (REST_DOW_SET.has(shift)) dowRests[staffId][dow2] += weight;
          }
        }
        if (!shift || ['希望休','有休','明け',''].includes(shift)) continue;
        counts[staffId][shift] = (counts[staffId][shift] || 0) + weight;
        totals[staffId] += weight;
        // 曜日別シフト集計
        if (WORK_SHIFT_SET.has(shift)) {
          const d = parseInt(dayStr);
          if (!isNaN(d)) {
            const dow = new Date(keyYear, keyMonth, d).getDay();
            dowShifts[staffId][dow][shift] = (dowShifts[staffId][dow][shift] || 0) + weight;
          }
        }
      }
      // 日別遷移を集計（前日→当日の遷移確率学習）
      for (let d = 2; d <= daysInMonth; d++) {
        const prev = staffShifts[d-1], curr = staffShifts[d];
        if (!prev || !curr || !TRANS_KEYS.has(prev) || !TRANS_KEYS.has(curr) || curr === '有休') continue;
        if (!transitions[staffId][prev]) transitions[staffId][prev] = {};
        transitions[staffId][prev][curr] = (transitions[staffId][prev][curr] || 0) + weight;
        transitionTotals[staffId][prev] = (transitionTotals[staffId][prev] || 0) + weight;
      }
    }
  }
  // ②③ 部署平均を事前計算（スムージング基準: データ豊富スタッフのみ）
  const deptStaffL = staffList.filter(s => counts[s.id] && totals[s.id] >= 10);
  const deptAvgFreqL = {}, deptAvgDowL = Array.from({length:7},()=>({})), deptAvgRestL = [null,null,null,null,null,null,null];
  if (deptStaffL.length > 0) {
    const allShiftKeys = new Set(deptStaffL.flatMap(s => Object.keys(counts[s.id])));
    for (const k of allShiftKeys) {
      deptAvgFreqL[k] = deptStaffL.reduce((s,st)=>s+(counts[st.id][k]||0)/totals[st.id],0)/deptStaffL.length;
    }
    for (let i = 0; i < 7; i++) {
      const totW = deptStaffL.reduce((s,st)=>s+Object.values(dowShifts[st.id]?.[i]||{}).reduce((a,b)=>a+b,0),0);
      const allDK = new Set(deptStaffL.flatMap(s=>Object.keys(dowShifts[s.id]?.[i]||{})));
      for (const k of allDK) { deptAvgDowL[i][k]=totW>0?deptStaffL.reduce((s,st)=>s+(dowShifts[st.id]?.[i]?.[k]||0),0)/totW:0; }
      const totR = deptStaffL.reduce((s,st)=>s+(dowTotalsR[st.id]?.[i]||0),0);
      deptAvgRestL[i] = totR>0 ? deptStaffL.reduce((s,st)=>s+(dowRests[st.id]?.[i]||0),0)/totR : null;
    }
  }
  const result = {}, monthCounts = {};
  for (const staff of staffList) {
    if (!counts[staff.id] || totals[staff.id] < 1) continue; // 完全0件のみスキップ
    const alpha = Math.min(1, totals[staff.id] / 10);
    const freq = {};
    for (const k of new Set([...Object.keys(counts[staff.id]), ...Object.keys(deptAvgFreqL)])) {
      const raw = totals[staff.id] > 0 ? (counts[staff.id][k]||0)/totals[staff.id] : 0;
      freq[k] = raw * alpha + (deptAvgFreqL[k] || 0) * (1 - alpha);
    }
    // 遷移確率はデータ十分なスタッフのみ（スムージング対象外）
    const transitionRate = {};
    if (totals[staff.id] >= 10) {
      for (const [prev, toCounts] of Object.entries(transitions[staff.id] || {})) {
        const tot = transitionTotals[staff.id][prev] || 1;
        transitionRate[prev] = {};
        for (const [curr, cnt] of Object.entries(toCounts)) transitionRate[prev][curr] = cnt / tot;
      }
    }
    // 曜日別シフト確率（薄曜日は部署平均ブレンド）
    const dowShiftRate = (dowShifts[staff.id] || [{},{},{},{},{},{},{}]).map((shiftCounts, i) => {
      const workTot = Object.values(shiftCounts).reduce((s,v)=>s+v,0);
      const da = Math.min(1, workTot / 2);
      const rate = {};
      const dKeys = new Set([...Object.keys(shiftCounts), ...Object.keys(deptAvgDowL[i])]);
      for (const k of dKeys) {
        const raw = workTot > 0 ? (shiftCounts[k]||0)/workTot : 0;
        rate[k] = raw * da + (deptAvgDowL[i][k] || 0) * (1 - da);
      }
      return Object.keys(rate).length > 0 ? rate : null;
    });
    const dowRestRate = (dowTotalsR[staff.id] || [0,0,0,0,0,0,0]).map((tot, i) => {
      if (tot === 0) return deptAvgRestL[i];
      const raw = (dowRests[staff.id]?.[i]||0)/tot, ra = Math.min(1, tot/3);
      return raw * ra + (deptAvgRestL[i] ?? raw) * (1 - ra);
    });
    result[staff.name] = { ...freq, transitionRate, dowShiftRate, dowRestRate };
    monthCounts[staff.name] = monthSets[staff.id].size;
  }
  // ── [診断] 学習信頼度 実測ログ（確認後に削除） ─────────────────────
  {
    const DOW_NAMES = ['月','火','水','木','金','土','日'];
    const lines = ['═══ [学習信頼度診断] ═══'];
    lines.push('名前               月数 | 月        火        水        木        金        土        日');
    lines.push('                        | wTot da   wTot da   wTot da   wTot da   wTot da   wTot da   wTot da');
    lines.push('─'.repeat(110));
    for (const staff of staffList) {
      if (!counts[staff.id] || totals[staff.id] < 1) continue;
      const shiftArr = dowShifts[staff.id] || [{},{},{},{},{},{},{}];
      const totArr   = dowTotalsR[staff.id] || [0,0,0,0,0,0,0];
      const cells = DOW_NAMES.map((_, j) => {
        const siIdx = (j + 1) % 7;
        const wTot = Object.values(shiftArr[siIdx]).reduce((s,v)=>s+v,0);
        const da   = Math.min(1, wTot / 2).toFixed(2);
        const rTot = totArr[j];
        const ra   = rTot === 0 ? '0.00' : Math.min(1, rTot / 3).toFixed(2);
        return `${String(wTot).padStart(4)} ${da}`;
      });
      const nm = staff.name.padEnd(16).slice(0,16);
      const mo = String(monthSets[staff.id].size).padStart(2);
      lines.push(`${nm}  ${mo}月  | ${cells.join('  ')}`);
      // ra行
      const raCells = DOW_NAMES.map((_, j) => {
        const rTot = totArr[j];
        const ra = rTot === 0 ? '0.00' : Math.min(1, rTot / 3).toFixed(2);
        return `${String(rTot).padStart(4)} ${ra}`;
      });
      lines.push(`${''.padEnd(18)}  ra | ${raCells.join('  ')}`);
    }
    lines.push('═'.repeat(110));
    console.error(lines.join('\n'));
  }
  result._monthCounts = monthCounts; // 動的ブレンド比率の計算用
  return result;
}

// 自動生成結果と学習データのシンクロ率を計算（0-100 or null）
function computeSyncRate(shifts, staffList, dept, year, month, mergedTrend) {
  const ds = staffList.filter(s => s.dept === dept.id);
  const customSyncKeys = (dept?.customShiftDefs||[]).map(cd=>cd.key).filter(Boolean);
  const WORK_KEYS = ['早番','日勤','遅番','夜勤', ...customSyncKeys];
  const WORK_SET = new Set(WORK_KEYS);
  let totalWork = 0, syncWork = 0;
  for (const s of ds) {
    const tKey = Object.keys(mergedTrend).find(k => k !== '_months' && k !== '_monthCounts' && nameMatch(k, s.name));
    const trend = tKey ? mergedTrend[tKey] : null;
    if (!trend) continue;
    // 全体頻度データ（dowShiftRateがない旧データでも使える）
    const freqRate = WORK_KEYS.some(k => (trend[k] || 0) > 0.01)
      ? Object.fromEntries(WORK_KEYS.filter(k => (trend[k]||0) > 0.01).map(k => [k, trend[k]]))
      : null;
    if (!freqRate) continue;
    for (let d = 1; d <= getDays(year, month); d++) {
      const shift = shifts[s.id]?.[d];
      if (!shift || !WORK_SET.has(shift)) continue;
      const dow = new Date(year, month, d).getDay();
      // dowShiftRateがあれば曜日別を優先、なければ全体頻度で代替
      const useRate = trend.dowShiftRate?.[dow] || freqRate;
      if (!useRate) continue;
      totalWork++;
      const predicted = Object.entries(useRate).sort((a,b)=>b[1]-a[1])[0]?.[0];
      if (predicted === shift) syncWork++;
    }
  }
  return totalWork >= 5 ? Math.round(syncWork / totalWork * 100) : null;
}


// 希望休の前々日に夜勤を手動配置したパターンを検出（アンカー学習用）
// baseline:自動生成直後, current:手動修正後。戻り値: { staffId: 新規パターン数 }
function detectKiboNightPatterns(baseline, current, deptStaff, year, month) {
  const mk = monthKey(year, month);
  const result = {};
  for (const s of deptStaff) {
    if (!s.nightOk) continue;
    const kibodays = (s.kiboByMonth?.[mk] || []).map(Number);
    let newPat = 0;
    for (const D of kibodays) {
      const nd = D - 2;
      if (nd < 1) continue;
      // 手動後に 夜勤→明け→希望休 パターンが成立し、かつ自動生成時は夜勤でなかった場合
      if (current[s.id]?.[nd] === "夜勤" && current[s.id]?.[nd + 1] === "明け" && baseline[s.id]?.[nd] !== "夜勤") newPat++;
    }
    if (newPat > 0) result[s.id] = newPat;
  }
  return result;
}

function buildNightExclusion(allCs, targetDept, allShifts, allDepts, year, month) {
  // Gate①: OFFフロアは他フロアを参照しない
  if (!targetDept.crossFloorNightEnabled) return allCs;
  // ONフロアのみ参照（OFFフロアは参照されない）
  const nightDepts = allDepts.filter(d =>
    d.id !== targetDept.id &&
    d.shiftTypes?.includes('夜勤') &&
    d.crossFloorNightEnabled === true
  );
  // Gate②: 参照対象ONフロアなし
  if (nightDepts.length === 0) return allCs;
  const days = getDays(year, month);
  // 全スタッフのnightLevelマップ（allCsには全部署スタッフが含まれる）
  const staffLvMap = {};
  for (const s of allCs) staffLvMap[s.id] = s.nightLevel;
  // 他ONフロアにLv1夜勤がある日を収集
  const lv1NightDays = new Set();
  for (const dept of nightDepts) {
    const deptShifts = allShifts[dept.id];
    if (!deptShifts) continue;
    for (const [staffId, dayShifts] of Object.entries(deptShifts)) {
      if (staffLvMap[staffId] !== 1) continue; // nightLevel=1のみ対象
      for (let d = 1; d <= days; d++) {
        if (dayShifts[d] === '夜勤') lv1NightDays.add(d);
      }
    }
  }
  // Gate③: 除外すべき日なし
  if (lv1NightDays.size === 0) return allCs;
  // targetDeptのLv1スタッフのみにnightExcludeDaysを注入
  return allCs.map(s => {
    if (s.dept !== targetDept.id || s.nightLevel !== 1) return s;
    return { ...s, nightExcludeDays: lv1NightDays };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 時間軸エンジン（autoGenerateTime）関連関数
// autoGenerate / scoreShifts / buildNightExclusion とは完全独立
// ─────────────────────────────────────────────────────────────────────────────

// 各シフトの時間帯を分単位で返す（shiftTimes優先、DEFAULT_SHIFT_TIMESフォールバック）
function buildShiftIntervals(dept) {
  const iv = {};
  (dept.shiftTypes || []).forEach(sk => {
    const s = timeToMins(getShiftStartTime(sk, dept));
    const e = timeToMins(getShiftEndTime(sk, dept));
    if (s == null || e == null) return;
    iv[sk] = { start: s, end: e <= s ? e + 1440 : e };
  });
  return iv;
}

// 1日分のシフト配列とcoverageRulesから不足スロット数・最大不足人数を計算（15分刻み）
function calcDayCoverageResult(dayShiftValues, rules, shiftIntervals) {
  const results = [];
  for (const rule of rules) {
    const rS = timeToMins(rule.start), rE = timeToMins(rule.end);
    if (rS == null || rE == null || rS >= rE) continue;
    let maxShortage = 0, shortageSlots = 0, gapStart = null;
    const gaps = [];
    for (let m = rS; m < rE; m += 15) {
      const cnt = dayShiftValues.reduce((c, sk) => {
        if (!sk || !shiftIntervals[sk]) return c;
        const iv = shiftIntervals[sk];
        return (iv.start <= m && m < iv.end) ? c + 1 : c;
      }, 0);
      const shortage = Math.max(0, rule.min - cnt);
      if (shortage > 0) {
        maxShortage = Math.max(maxShortage, shortage);
        shortageSlots++;
        if (gapStart == null) gapStart = m;
      } else if (gapStart != null) {
        gaps.push({ start: gapStart, end: m, maxShortage });
        gapStart = null; maxShortage = 0;
      }
    }
    if (gapStart != null) gaps.push({ start: gapStart, end: rE, maxShortage });
    results.push({ rule, gaps, shortageSlots, totalShortageUnits: shortageSlots > 0 ? shortageSlots * (gaps.reduce((s,g)=>Math.max(s,g.maxShortage),0)) : 0 });
  }
  return results;
}

// time専用スコア評価（autoGenerateのscoreShiftsとは完全独立）
function scoreShiftsTime(shifts, ds, dept, days, year, month, shiftTrend = {}) {
  const mk = monthKey(year, month);
  const shiftIntervals = buildShiftIntervals(dept);
  const rules = dept.coverageRules || [];
  const WORK = buildDeptWorkTypes(dept.customShiftDefs);
  const REST = new Set(['休み','希望休']);
  const maxConsec = dept.maxConsecutive || 5;
  let score = 0;

  // Tier1: coverageRules不足（不足スロット×人数 × 50,000点）
  for (let d = 1; d <= days; d++) {
    const dayShifts = ds.map(s => shifts[s.id]?.[d] || '');
    const results = calcDayCoverageResult(dayShifts, rules, shiftIntervals);
    for (const r of results) {
      for (const g of r.gaps) score += g.maxShortage * 50000;
    }
  }

  for (const s of ds) {
    // Tier2: 公休逸脱
    const targetK = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const actualK = Object.values(shifts[s.id] || {}).filter(v => REST.has(v)).length;
    score += Math.abs(actualK - targetK) * 10000;

    // Tier3: 連続勤務超過
    let consec = 0;
    for (let d = 1; d <= days; d++) {
      const sh = shifts[s.id]?.[d];
      if (WORK.has(sh) && sh !== '明け') { consec++; if (consec > maxConsec) score += 100; }
      else consec = 0;
    }

    // Tier4: インターバル違反
    const th = dept.intervalThreshold ?? null;
    for (let d = 2; d <= days; d++) {
      const prev = shifts[s.id]?.[d-1], curr = shifts[s.id]?.[d];
      if (!prev || !curr || !WORK.has(prev) || !WORK.has(curr)) continue;
      const bad = th != null
        ? shiftIntervalHours(prev, curr, dept) < th
        : (prev === '遅番' && (curr === '早番' || curr === '日勤')) || (prev === '日勤' && curr === '早番');
      if (bad) score += 100;
    }

    // Tier5a: 学習傾向（dowShiftRate × 20・タイブレーカー）
    if (shiftTrend && Object.keys(shiftTrend).length > 0) {
      const tKey = Object.keys(shiftTrend).filter(k => k !== '_months' && k !== '_monthCounts').find(k => nameMatch(k, s.name));
      const trend = tKey ? shiftTrend[tKey] : null;
      if (trend) {
        for (let d = 1; d <= days; d++) {
          const sh = shifts[s.id]?.[d];
          if (!sh) continue;
          const dow = new Date(year, month, d).getDay();
          const prob = trend.dowShiftRate?.[dow]?.[sh] ?? (typeof trend[sh] === 'number' ? trend[sh] : null);
          if (prob != null) score += (1 - prob) * 20;
        }
        // Tier5b: 遷移学習（transitionRate × 500）
        if (trend.transitionRate) {
          for (let d = 2; d <= days; d++) {
            const prev = shifts[s.id]?.[d-1];
            const curr = shifts[s.id]?.[d];
            if (!prev || !curr) continue;
            const transProb = trend.transitionRate[prev]?.[curr];
            if (transProb !== undefined) score += (1 - transProb) * 500;
          }
        }
      }
    }
  }
  return score;
}

// 生成前最低限チェック（静的不可能のみ判定）
function validateCoverageRules(coverageRules, staffList, dept) {
  if (!coverageRules || coverageRules.length === 0) return { ok: true, warnings: [] };
  const shiftIntervals = buildShiftIntervals(dept);
  const warnings = [];

  for (const rule of coverageRules) {
    const rS = timeToMins(rule.start), rE = timeToMins(rule.end);
    if (rS == null || rE == null) continue;
    let minEligible = staffList.length;
    for (let m = rS; m < rE; m += 15) {
      const eligible = staffList.filter(s => {
        const allowed = dept.roleShiftTypes?.[s.role] ?? dept.shiftTypes;
        return allowed.some(sk => {
          const iv = shiftIntervals[sk];
          return iv && iv.start <= m && m < iv.end;
        });
      }).length;
      minEligible = Math.min(minEligible, eligible);
    }
    if (minEligible < rule.min) {
      warnings.push(`${rule.start}〜${rule.end}：カバー可能なスタッフが最大${minEligible}名（必要${rule.min}名）`);
    }
  }
  return { ok: warnings.length === 0, warnings };
}

// 時間軸エンジン本体
function autoGenerateTime(staffList, dept, year, month, prevShifts = {}, shiftTrend = {}) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const rules = dept.coverageRules || [];
  const maxConsec = dept.maxConsecutive || 5;
  const shiftIntervals = buildShiftIntervals(dept);
  const WORK = buildDeptWorkTypes(dept.customShiftDefs);
  const REST_SET = new Set(['休み','希望休','有休']);
  // Fix1: maxStaff制約マップ（早番1人・遅番1人等）
  const maxStaffMap = {};
  (dept.shiftTypes || []).forEach(k => { maxStaffMap[k] = dept.maxStaff?.[k] ?? 99; });

  // Phase 0: 前処理
  const ds = staffList.filter(s => s.dept === dept.id);
  const locked = {};
  for (const s of ds) {
    locked[s.id] = {};
    // Fix3: prevShiftsの有休を引き継ぎ（手動入力分をlocked扱い）
    Object.entries(prevShifts[s.id] || {}).forEach(([d, v]) => { if (v === '有休') locked[s.id][Number(d)] = '有休'; });
    (s.kiboByMonth?.[mk] || []).forEach(d => { locked[s.id][Number(d)] = '希望休'; });
    (s.yukyuByMonth?.[mk] || []).forEach(d => { locked[s.id][Number(d)] = '有休'; });
    Object.entries(s.shiftRequestsByMonth?.[mk] || {}).forEach(([d, sh]) => { locked[s.id][Number(d)] = sh; });
  }
  const targetKyuko = {};
  ds.forEach(s => { targetKyuko[s.id] = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8; });

  const eligibleShifts = {};
  ds.forEach(s => {
    const allowed = dept.roleShiftTypes?.[s.role] ?? dept.shiftTypes;
    eligibleShifts[s.id] = (allowed || []).filter(k => k !== '明け' && k !== '夜勤' && shiftIntervals[k]);
  });

  // Phase1a: eligible数で制約強度グループ化（少ない=制約強=優先）
  const eligibilityGroups = {};
  for (const s of ds) {
    const len = Math.max(eligibleShifts[s.id].length, 1);
    if (!eligibilityGroups[len]) eligibilityGroups[len] = [];
    eligibilityGroups[len].push(s);
  }
  const sortedLengths = Object.keys(eligibilityGroups).map(Number).sort((a, b) => a - b);

  const result = {};
  ds.forEach(s => { result[s.id] = { ...locked[s.id] }; });

  // Phase0.5: preferredRestDays — 公休を月内均等分散（ソフトロック）
  const softRest = {};
  for (const s of ds) {
    softRest[s.id] = new Set();
    const lockedRestCount = Object.values(locked[s.id]).filter(v => REST_SET.has(v)).length;
    const needed = Math.max(0, targetKyuko[s.id] - lockedRestCount);
    if (needed <= 0) continue;
    const available = [];
    for (let d = 1; d <= days; d++) { if (!locked[s.id][d]) available.push(d); }
    if (available.length === 0) continue;
    const step = available.length / (needed + 1);
    const used = new Set();
    for (let i = 1; i <= needed; i++) {
      const idx = Math.min(Math.round(i * step) - 1, available.length - 1);
      const day = available[idx];
      if (!used.has(day)) { used.add(day); softRest[s.id].add(day); result[s.id][day] = '休み'; }
    }
  }

  const th = dept.intervalThreshold ?? null;
  const isBadTransition = (prev, curr) => {
    if (!prev || !curr) return false;
    if (th != null) return shiftIntervalHours(prev, curr, dept) < th;
    return (prev === '遅番' && (curr === '早番' || curr === '日勤')) || (prev === '日勤' && curr === '早番');
  };

  const exceedsConsec = (staffId, d) => {
    let c = 0;
    // 当月分を後ろ向きに数える
    for (let i = d - 1; i >= 1; i--) {
      if (WORK.has(result[staffId]?.[i])) c++; else return c >= maxConsec;
      if (c >= maxConsec) return true;
    }
    // Fix3: 月初の場合、前月末の連続勤務を prevShifts で引き継ぐ
    const pm = prevShifts[staffId] || {};
    const pmKeys = Object.keys(pm).map(Number).filter(n => n > 0);
    if (pmKeys.length > 0) {
      const pmMax = Math.max(...pmKeys);
      for (let i = pmMax; i >= Math.max(1, pmMax - maxConsec); i--) {
        if (WORK.has(pm[i])) c++; else break;
        if (c >= maxConsec) return true;
      }
    }
    return c >= maxConsec;
  };

  const needsRest = (staffId, d) => {
    const restSoFar = Object.values(result[staffId] || {}).filter(v => REST_SET.has(v) || v === '休み').length;
    const remaining = days - d;
    return (targetKyuko[staffId] - restSoFar) >= remaining + 1;
  };

  const calcSlotCoverage = (d) => {
    const cov = {};
    ds.forEach(s => {
      const sh = result[s.id]?.[d];
      if (!sh || !shiftIntervals[sh]) return;
      const iv = shiftIntervals[sh];
      for (let m = iv.start; m < iv.end; m += 15) cov[m] = (cov[m] || 0) + 1;
    });
    return cov;
  };
  // Fix1: シフト別現在配置人数カウント
  const countShift = (d, sk) => ds.filter(s => result[s.id]?.[d] === sk).length;

  const calcMarginalGain = (s, shiftKey, d, currentCov) => {
    const iv = shiftIntervals[shiftKey];
    if (!iv) return 0;
    let gain = 0;
    for (const rule of rules) {
      const rS = timeToMins(rule.start), rE = timeToMins(rule.end);
      if (rS == null || rE == null) continue;
      for (let m = rS; m < rE; m += 15) {
        if (iv.start <= m && m < iv.end) {
          const before = currentCov[m] || 0;
          const after = before + 1;
          gain += Math.max(0, Math.min(after, rule.min) - Math.min(before, rule.min));
        }
      }
    }
    // Tier5: shiftTrend タイブレーカー（スケール小・coverageゲインを逆転しない）
    if (shiftTrend && Object.keys(shiftTrend).length > 0) {
      const tKey = Object.keys(shiftTrend).filter(k => k !== '_months' && k !== '_monthCounts').find(k => nameMatch(k, s.name));
      const trend = tKey ? shiftTrend[tKey] : null;
      if (trend) {
        const dow = new Date(year, month, d).getDay();
        const prob = trend.dowShiftRate?.[dow]?.[shiftKey] ?? (typeof trend[shiftKey] === 'number' ? trend[shiftKey] : 0);
        gain += prob * 0.001;
        // transitionRate: 前日→当日の遷移確率もタイブレーカーに追加
        const prevShift = result[s.id]?.[d-1];
        if (prevShift && trend.transitionRate) {
          const transProb = trend.transitionRate[prevShift]?.[shiftKey];
          if (transProb !== undefined) gain += transProb * 0.001;
        }
      }
    }
    return gain;
  };

  const assignBest = (candidates, d, currentCovFn) => {
    let bestGain = 0, bestStaff = null, bestShift = null;
    const cov = currentCovFn();
    // coverage不足判定（Phase0.5 softRest上書きの前提条件チェック用）
    const hasCoverageDeficit = rules.length > 0 && rules.some(rule => {
      const rS = timeToMins(rule.start), rE = timeToMins(rule.end);
      if (rS == null || rE == null) return false;
      for (let m = rS; m < rE; m += 15) { if ((cov[m] || 0) < rule.min) return true; }
      return false;
    });
    // Fix2: シャッフルでタイブレーカー（同スコア時に毎回同じスタッフが選ばれるのを防ぐ）
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    for (const s of shuffled) {
      const isSoftRest = softRest[s.id]?.has(d);
      if (result[s.id][d] !== undefined && !isSoftRest) continue;
      // Phase0.5: softRestはcoverage不足時のみ上書き可
      if (isSoftRest && !hasCoverageDeficit) continue;
      if (exceedsConsec(s.id, d)) continue;
      if (needsRest(s.id, d)) continue;
      for (const sk of eligibleShifts[s.id]) {
        if (isBadTransition(result[s.id][d-1], sk)) continue;
        // Fix1: maxStaff上限チェック
        if (countShift(d, sk) >= (maxStaffMap[sk] ?? 99)) continue;
        const gain = calcMarginalGain(s, sk, d, cov);
        if (gain > bestGain) { bestGain = gain; bestStaff = s; bestShift = sk; }
      }
    }
    if (bestStaff) {
      result[bestStaff.id][d] = bestShift;
      softRest[bestStaff.id]?.delete(d); // Phase0.5: coverage上書き時にsoftRest解除
    }
    return !!bestStaff;
  };

  // Phase 1: coverage充足グリーディ配置（Phase1a: 制約強スタッフ優先）
  for (let d = 1; d <= days; d++) {
    // 最制約グループ（eligible最少）: coverage状況によらず全員配置試行
    const firstGroup = eligibilityGroups[sortedLengths[0]] || [];
    let changed = true;
    while (changed) {
      changed = assignBest(firstGroup, d, () => calcSlotCoverage(d));
    }
    // 残りグループ: eligible少ない順にcoverage不足時のみ配置（社員など万能スタッフは後回し）
    for (let gi = 1; gi < sortedLengths.length; gi++) {
      const group = eligibilityGroups[sortedLengths[gi]];
      for (let iter = 0; iter < group.length * 2; iter++) {
        const cov = calcSlotCoverage(d);
        const hasDeficit = rules.some(rule => {
          const rS = timeToMins(rule.start), rE = timeToMins(rule.end);
          if (rS == null || rE == null) return false;
          for (let m = rS; m < rE; m += 15) {
            if ((cov[m] || 0) < rule.min) return true;
          }
          return false;
        });
        if (!hasDeficit) break;
        if (!assignBest(group, d, () => cov)) break;
      }
    }
    // 未配置スタッフを休みに（softRest済みは既に'休み'なので変化なし）
    ds.forEach(s => { if (result[s.id][d] === undefined) result[s.id][d] = '休み'; });
  }

  // Phase 2: 公休調整
  for (const s of ds) {
    const restDays = [];
    const workDays = [];
    for (let d = 1; d <= days; d++) {
      if (locked[s.id][d]) continue;
      if (REST_SET.has(result[s.id][d])) restDays.push(d);
      else if (WORK.has(result[s.id][d])) workDays.push(d);
    }
    const actualRest = Object.values(result[s.id]).filter(v => REST_SET.has(v)).length;
    const target = targetKyuko[s.id];

    if (actualRest > target) {
      // 公休過多 → coverageゲインが最大の日を勤務に変換
      const excess = actualRest - target;
      const candidates = restDays.map(d => {
        const cov = calcSlotCoverage(d);
        const bestSh = eligibleShifts[s.id].reduce((best, sk) => {
          if (isBadTransition(result[s.id][d-1], sk)) return best;
          // Fix1: maxStaff上限チェック
          if (countShift(d, sk) >= (maxStaffMap[sk] ?? 99)) return best;
          const g = calcMarginalGain(s, sk, d, cov);
          return g > (best?.gain ?? -1) ? { sk, gain: g } : best;
        }, null);
        return { d, gain: bestSh?.gain ?? 0, sk: bestSh?.sk };
      }).filter(x => x.sk).sort((a, b) => b.gain - a.gain);
      for (let i = 0; i < Math.min(excess, candidates.length); i++) {
        result[s.id][candidates[i].d] = candidates[i].sk;
      }
    } else if (actualRest < target) {
      // 公休不足 → coverageダメージが最小の日を休みに変換
      const shortage = target - actualRest;
      const candidates = workDays.map(d => {
        const cov = calcSlotCoverage(d);
        const sh = result[s.id][d];
        const iv = shiftIntervals[sh];
        let damage = 0;
        if (iv) {
          for (const rule of rules) {
            const rS = timeToMins(rule.start), rE = timeToMins(rule.end);
            if (rS == null || rE == null) continue;
            for (let m = rS; m < rE; m += 15) {
              if (iv.start <= m && m < iv.end) {
                const before = cov[m] || 0;
                damage += Math.max(0, Math.min(before, rule.min) - Math.min(before - 1, rule.min));
              }
            }
          }
        }
        return { d, damage };
      }).sort((a, b) => a.damage - b.damage);
      for (let i = 0; i < Math.min(shortage, candidates.length); i++) {
        result[s.id][candidates[i].d] = '休み';
      }
    }
  }

  // Phase 3: 2-opt swap最適化
  const FIXED = new Set(['希望休','有休']);
  let curScore = scoreShiftsTime(result, ds, dept, days, year, month, shiftTrend);
  for (let pass = 0; pass < 3 && curScore > 0; pass++) {
    let improved = false;
    for (let i = 0; i < ds.length - 1; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const s1 = ds[i], s2 = ds[j];
        for (let d = 1; d <= days; d++) {
          const v1 = result[s1.id][d], v2 = result[s2.id][d];
          if (v1 === v2 || FIXED.has(v1) || FIXED.has(v2)) continue;
          if (locked[s1.id][d] || locked[s2.id][d]) continue;
          if (isBadTransition(result[s1.id][d-1], v2) || isBadTransition(v2, result[s1.id][d+1])) continue;
          if (isBadTransition(result[s2.id][d-1], v1) || isBadTransition(v1, result[s2.id][d+1])) continue;
          // coverageが悪化するスワップは拒否
          const covBefore = calcSlotCoverage(d);
          const iv1 = shiftIntervals[v1], iv2 = shiftIntervals[v2];
          let coverageOk = true;
          if (iv1 && iv2) {
            for (const rule of rules) {
              const rS = timeToMins(rule.start), rE = timeToMins(rule.end);
              if (rS == null || rE == null) continue;
              for (let m = rS; m < rE; m += 15) {
                const had1 = iv1.start <= m && m < iv1.end;
                const had2 = iv2.start <= m && m < iv2.end;
                if (had1 !== had2) { // カバー状況が変わるスロットのみチェック
                  const cnt = covBefore[m] || 0;
                  if (had1 && !had2 && cnt <= rule.min) { coverageOk = false; break; }
                  if (had2 && !had1 && cnt <= rule.min) { coverageOk = false; break; }
                }
              }
              if (!coverageOk) break;
            }
          }
          if (!coverageOk) continue;
          result[s1.id][d] = v2; result[s2.id][d] = v1;
          const newScore = scoreShiftsTime(result, ds, dept, days, year, month, shiftTrend);
          if (newScore < curScore) { curScore = newScore; improved = true; }
          else { result[s1.id][d] = v1; result[s2.id][d] = v2; }
        }
      }
    }
    if (!improved) break;
  }

  // coverageWarnings生成
  const coverageWarnings = [];
  for (let d = 1; d <= days; d++) {
    const dayShifts = ds.map(s => result[s.id]?.[d] || '');
    const results = calcDayCoverageResult(dayShifts, rules, shiftIntervals);
    for (const r of results) {
      for (const g of r.gaps) {
        coverageWarnings.push({ day: d, ruleStart: r.rule.start, ruleEnd: r.rule.end, gapStart: g.start, gapEnd: g.end, maxShortage: g.maxShortage });
      }
    }
  }

  return { shifts: result, coverageWarnings, score: curScore };
}

function autoGenerate(staffList, dept, year, month, prevShifts, shiftTrend = {}) {
  console.error('[AG-v7d] start dept=', dept.id, 'maxStaff=', JSON.stringify(dept.maxStaff), 'minStaff=', JSON.stringify(dept.minStaff));
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
  const deptWork = buildDeptWorkTypes(dept.customShiftDefs);
  const deptRest = buildDeptRestTypes(dept.customShiftDefs);
  const maxStaff = {};
  [...new Set(dept.shiftTypes)].forEach(k => { const cd=(dept.customShiftDefs||[]).find(d=>d.key===k);const base=cd?.baseType||k;const def=base==="日勤"?99:1;const saved=dept.maxStaff?.[k];maxStaff[k]=(saved!=null&&!(cd&&base==="日勤"&&saved===1))?saved:def; });

  // ══════════════════════════════════════════════════════════════════════════════
  // ★role-slot 正式概念定義（介護型エンジン核心）
  //
  // 介護現場では「早番・遅番・夜勤」は coverage 人数ではなく「役割席（role-slot）」。
  //   早番 1人 = 「開け担当」という席  ←→  日勤 は柔軟調整枠（buffer shift）
  //
  // 責務分離:
  //   maxStaff        = 人数制御（何人まで配置してよいか）
  //   slotManagedTypes = role-slot 制御（Tier1絶対制約の対象シフト一覧）
  //
  // 選定基準:
  //   ① baseType が「日勤」のシフトは buffer → slot管理外
  //   ② 「明け」は夜勤連鎖で自動管理 → slot管理外
  //   ③ 上記以外で maxStaff<99（人数制限あり）のシフト = role-slot
  //      ※ 将来「日勤 max=2」に設定しても ① で除外されるため誤判定しない
  // ══════════════════════════════════════════════════════════════════════════════
  const slotManagedTypes = new Set(
    [...new Set(dept.shiftTypes)].filter(k => {
      if (k === '明け') return false;                                    // ② 明けは除外
      const cd = (dept.customShiftDefs||[]).find(d => d.key === k);
      const base = cd?.baseType || k;
      if (base === '日勤') return false;                                 // ① 日勤baseは除外
      return (maxStaff[k] ?? 99) < 99;                                  // ③ 人数制限ありのみ
    })
  );
  // isSlotManaged: あるシフトキーが role-slot（Tier1絶対制約）か判定する共通関数
  const isSlotManaged = (shiftKey) => slotManagedTypes.has(shiftKey);

  // shouldProtectSlot: Tier2 repair がそのシフトを削減してよいか判定する共通ガード
  // 「role-slot かつ 現在の配置数が上限以内」= 削減禁止（Tier1絶対制約）
  //   shiftKey: 削減しようとしているシフト種別
  //   count   : 当該日の現在の配置人数
  // 返値 true  → 削減してはいけない（protect）
  // 返値 false → 削減してよい（proceed）
  //
  // 使用例:
  //   if (shouldProtectSlot(sh, ds.filter(sx => res[sx.id][d] === sh).length)) continue;
  const shouldProtectSlot = (shiftKey, count) => {
    if (!isSlotManaged(shiftKey)) return false;       // 日勤など非slot → 保護不要
    return count <= (maxStaff[shiftKey] ?? 99);       // slot が上限以内 → 削減禁止
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // ★介護型エンジン 制約階層（Constraint Priority）正式定義
  //
  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ Tier1 — 絶対制約（repair フェーズから削減・変更禁止）                      │
  // │                                                                         │
  // │  A. role-slot（役割席）                                                  │
  // │     early shift（早番）= 「開け担当」席                                   │
  // │     late  shift（遅番）= 「閉め担当」席                                   │
  // │     night shift（夜勤）= 「夜間担当」席（+ 明け連鎖）                      │
  // │     → coverage 人数ではなく「役割席」。0人は施設崩壊。                     │
  // │     → shouldProtectSlot() が全 repair 経路の単一ガード。                  │
  // │                                                                         │
  // │  B. 希望休（希望ロック）                                                  │
  // │     スタッフが申請した公休希望日。生成エンジンは絶対尊重。                   │
  // │                                                                         │
  // │  C. 有休（有給休暇）                                                      │
  // │     法的権利。上書き・削除禁止。                                           │
  // │                                                                         │
  // │  D. 夜勤明け                                                              │
  // │     夜勤翌日の「明け」は夜勤連鎖として固定。健康管理上削除禁止。            │
  // │                                                                         │
  // └─────────────────────────────────────────────────────────────────────────┘
  //
  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ Tier2 — ソフト制約（repair フェーズが調整してよい範囲）                    │
  // │                                                                         │
  // │  a. 公休公平性（kyukoDays 目標）                                          │
  // │     スタッフの休み日数を目標に近づける。                                   │
  // │     → Tier1 を壊してまで達成してはいけない。                               │
  // │                                                                         │
  // │  b. 連続勤務制限（maxConsecutive）                                        │
  // │     5連続勤務超過を解消。                                                  │
  // │     → Tier1 slot を「休み」に変換して解消してはいけない。                  │
  // │                                                                         │
  // │  c. 比率最適化（shiftRatio / ratio修復）                                  │
  // │     スタッフの日勤/早番/遅番比率を目標に近づける。                          │
  // │     → Tier1 slot を削減して ratio を達成してはいけない。                   │
  // │                                                                         │
  // │  d. trend最適化（localSearchImprove / scoreShifts）                      │
  // │     過去実績 trend に沿った swap 改善。                                    │
  // │     → swap は人数保存のため Tier1 への影響なし。                           │
  // │                                                                         │
  // │  e. 最低配置補完（minStaff 保証）                                          │
  // │     日勤など非 slot シフトの最低人数補完。                                  │
  // │     → Tier1 slot を slide 元にしてはいけない。                             │
  // │                                                                         │
  // └─────────────────────────────────────────────────────────────────────────┘
  //
  // repair フェーズ 責務一覧:
  // ┌──────────────────────┬────────────┬───────────────┬───────────────────────┐
  // │ フェーズ              │ Tier1変更  │ shouldProtect │ 備考                  │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ enforceMaxStaff      │ △ 超過時のみ│ 不使用（超過が│ 超過(count>max)なら削減│
  // │                      │            │ 条件→逆方向） │ 許可。これが唯一の例外。│
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ Pass C（連続勤務修正）│ ✗ 禁止     │ ✅ 使用済み   │ L1347                 │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ 公休 shortage 補正   │ ✗ 禁止     │ ✅ 使用済み   │ L1403                 │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ 遷移 repair          │ ✗ 禁止     │ ✅ 使用済み   │ L1449（休み→日勤代替） │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ minStaff 保証 slide  │ ✗ 禁止     │ ✅ 使用済み   │ L1487（スライド元除外）│
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ ratio 修復           │ ✗ 禁止     │ ✅ 使用済み   │ L1670（削減禁止）      │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ localSearchImprove   │ ✗ 不可能   │ 不要          │ swap=人数保存、違反生成│
  // │                      │            │               │ 不可能（構造保証）      │
  // └──────────────────────┴────────────┴───────────────┴───────────────────────┘
  //
  // enforceMaxStaff の例外ルール:
  //   count > maxStaff[slot] → 超過（違反状態）→ 削減許可（Tier1 修正方向への削減）
  //   count ≤ maxStaff[slot] → 正常状態       → shouldProtectSlot が削減を禁止
  //
  // 新 repair フェーズを追加するときのルール:
  //   res[s.id][d] を「休み」や別シフトへ変換する前に必ず:
  //     if (shouldProtectSlot(res[s.id][d], <その日のcount>)) continue;
  //   を挿入すること。
  // ══════════════════════════════════════════════════════════════════════════════

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
  // ★[Fix-NightSeq] 夜勤系 shift set: baseType=夜勤 の全 shift key（明け前日バリデーション用）
  const _agNightSet = new Set(
    [...new Set(dept.shiftTypes || [])].filter(k => {
      const _cd = (dept.customShiftDefs || []).find(d => d.key === k);
      return (_cd?.baseType || k) === '夜勤';
    })
  );
  const isBadTransition = (prev, curr) => {
    if (!prev || !curr) return false;
    // ★インターバル特例部署（栄養科等）: 時間インターバルのみで判定、文字ルールは不使用
    if (intervalThreshold != null) return shiftIntervalHours(prev, curr, dept) < intervalThreshold;
    // ★通常部署（介護職等）: 現場防衛のため4パターンを完全禁止
    //   遅番→早番（11時間）、遅番→日勤（12.5時間）、日勤→早番（13.5時間）
    //   ★[Fix-NightSeq] 明けの前日は必ず夜勤系（明け = 夜勤状態の継続）
    if (curr === '明け' && !_agNightSet.has(prev)) return true;
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
        if (s.nightExcludeDays?.has(nightDay)) continue; // クロスフロア夜勤制約
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
        if (s.nightExcludeDays?.has(d)) return false; // クロスフロア夜勤制約
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
          if (_cands.length === 0) break; // shortage を許容
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

  const dayTypes = [...new Set(dept.shiftTypes.filter(s => s !== "夜勤"))];
  const isCtd = isCustomTimeDept(dept);
  const getAllowedTypes = (s) => {
    const allowed = dept.roleShiftTypes?.[s.role];
    return allowed ? dayTypes.filter(k => allowed.includes(k)) : dayTypes;
  };

  // enforceMaxStaff ─ [Tier1例外: count>maxStaff の超過状態のみ削減許可]
  // 正常状態（count≤maxStaff）では発動しない → shouldProtectSlot と逆条件で安全
  // ★enforceMaxStaff: maxStaff超過を強制修正（他シフトへ振替→無理なら休み）
  const enforceMaxStaff = () => {
    for (let d = 1; d <= days; d++) {
      for (const [shiftKey, limit] of Object.entries(maxStaff)) {
        const overStaff = ds.filter(s => res[s.id][d] === shiftKey);
        if (overStaff.length <= limit) continue;
        console.log(`[AG-v7] enforceMaxStaff: day=${d} shift=${shiftKey} count=${overStaff.length} limit=${limit}`);
        const toFix = [
          ...overStaff.filter(s => !lockedDays[s.id].has(d)),
          ...overStaff.filter(s =>  lockedDays[s.id].has(d)),
        ];
        let excess = overStaff.length - limit;
        // ★[Fix-NightSeq] 夜勤系列整合性: shiftKey が夜勤ベースか事前判定
        const _em_isNight = ((_agNightSet.has(shiftKey)) ||
          ((dept.customShiftDefs || []).find(c => c.key === shiftKey)?.baseType || shiftKey) === '夜勤');
        for (const s of toFix) {
          if (excess <= 0) break;
          // ★[Fix-NightSeq] 夜勤系列 atomic 保護:
          //   夜勤セルを変更しようとするとき、翌日=明け かつ 翌日がロック済み
          //   → 系列を壊せない → このスタッフは enforceMaxStaff でスキップ
          if (_em_isNight && d + 1 <= days && (res[s.id][d + 1] ?? '') === '明け'
              && lockedDays[s.id].has(d + 1)) {
            console.log(`[Night-Sequence-EnforceMax] d${d} ${s.name}: 翌日d${d+1}明けがロック済 → スキップ`);
            continue;
          }
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
          // ★[Fix-NightSeq] 夜勤系列カスケード:
          //   夜勤→明け の系列において夜勤を変更した → 翌日の明けも休みに変換
          //   （明け = 夜勤後状態。夜勤がなければ明けは存在できない）
          if (_em_isNight && d + 1 <= days && (res[s.id][d + 1] ?? '') === '明け'
              && !lockedDays[s.id].has(d + 1)) {
            console.log(`[Night-Sequence-EnforceMax] d${d} ${s.name}: ${shiftKey}→${res[s.id][d]} cascade d${d+1}明け→休み ✓`);
            res[s.id][d + 1] = '休み';
          }
          excess--;
        }
      }
    }
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
        // trendなし → 均等分散配置（±2日揺らぎ + maxConsec制約保証）
        // 均等間隔 step = validDays.length / (restTarget+1) を基準に
        // ランダム揺らぎ±2日を加えつつ「前の休みから maxConsec+1 日以内」を保証
        const N = validDays.length;
        const step = N / (restTarget + 1);
        const usedSet = new Set();
        let prevDay = 0; // 前に配置した休みの日付（0=月初前）

        for (let i = 1; i <= restTarget; i++) {
          const isLast = (i === restTarget);

          // ─ 制約範囲 ─
          const minDay = prevDay + 1;
          const maxDay = Math.min(days, prevDay + maxConsec + 1);
          // 末尾制約: 最後の休みは days-maxConsec 以降（月末の連続勤務防止）
          const minDayAdj = isLast ? Math.max(minDay, days - maxConsec) : minDay;

          // ─ 理想位置 ± 揺らぎ ─
          const idealIdx = Math.min(Math.max(0, Math.round(i * step) - 1), N - 1);
          const idealDay = validDays[idealIdx];
          const jitter   = Math.round((Math.random() - 0.5) * 4); // -2〜+2 均等
          const targetDay = idealDay + jitter;

          // ─ 候補: [minDayAdj, maxDay] ∩ validDays ∩ 未使用 ─
          // フォールバック①: isLast 末尾制約を緩和
          // フォールバック②: maxDay 制約も緩和（連続違反は PassC が修正）
          let cands = validDays.filter(d => d >= minDayAdj && d <= maxDay && !usedSet.has(d));
          if (!cands.length && isLast) {
            cands = validDays.filter(d => d >= minDay && d <= maxDay && !usedSet.has(d));
          }
          if (!cands.length) {
            cands = validDays.filter(d => d >= minDay && !usedSet.has(d));
          }
          if (!cands.length) break;

          // targetDay に最も近い候補を選択
          const best = cands.reduce((a, b) =>
            Math.abs(a - targetDay) < Math.abs(b - targetDay) ? a : b
          );

          usedSet.add(best);
          res[s.id][best] = '休み';
          prevDay = best;
        }
      }
    });
    // ── ステップ2.5: 早番・遅番 slot-first 配置（PassA公休確定後に実行）─────
    // PassA で休み日を先確定してから早番・遅番を配置することで、
    // 夜勤5回スタッフの残り空き日数が不足してPassAのbreakが発火する問題を防ぐ。
    {
      const slotFirstTypes = [...new Set(dept.shiftTypes)].filter(k =>
        k !== '夜勤' && isSlotManaged(k)
      );
      console.log('[AG-v7] slotFirstTypes=', slotFirstTypes, 'maxStaff=', JSON.stringify(maxStaff));
      let _slotMaxConsecExcluded = 0;
      for (const shiftType of slotFirstTypes) {
        const limit = maxStaff[shiftType];
        if (limit <= 0) continue;
        const slotPool = ds.filter(s => getAllowedTypes(s).includes(shiftType));
        for (let d = 1; d <= days; d++) {
          const already = ds.filter(s => res[s.id][d] === shiftType).length;
          const need = limit - already;
          if (need <= 0) continue;
          const cands = slotPool.filter(s => {
            if (lockedDays[s.id].has(d)) return false;
            if (res[s.id][d]) return false;
            const prev = res[s.id][d - 1], next = res[s.id][d + 1];
            if (prev === '明け') return false;
            if (isBadTransition(prev, shiftType)) return false;
            if (isBadTransition(shiftType, next)) return false;
            const prevConsec = consecWork(s.id, d - 1);
            let fwdConsec = 0;
            for (let i = d + 1; i <= days; i++) { if (deptWork.has(res[s.id][i])) fwdConsec++; else break; }
            if (prevConsec + 1 + fwdConsec > maxConsec) { _slotMaxConsecExcluded++; return false; }
            return true;
          }).sort((a, b) => {
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
          let filled = 0;
          for (const s of cands) {
            if (filled >= need) break;
            res[s.id][d] = shiftType;
            filled++;
          }
        }
      }
      {
        let _unfilledSlots = 0;
        for (const shiftType of slotFirstTypes) {
          const limit = maxStaff[shiftType];
          for (let d = 1; d <= days; d++) {
            const cnt = ds.filter(s => res[s.id][d] === shiftType).length;
            if (cnt < limit) _unfilledSlots += limit - cnt;
          }
        }
        console.log(`[AG-Phase1] slot-first完了: maxConsecExcluded=${_slotMaxConsecExcluded} unfilledSlots=${_unfilledSlots}`);
      }
    }

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
        const ratioTotal = ratio ? allowed.reduce((sum, j) => sum + (ratio[j] || 0), 0) : 0;
        const ratioW = (ratio && ratioTotal > 0) ? Math.max(0.01, (ratio[k] || 0.01) / ratioTotal) : null;
        if (trend?.dowShiftRate?.[weekday]?.[k] != null) {
          const trendW = Math.max(0.01, trend.dowShiftRate[weekday][k]);
          return ratioW ? trendW * 0.6 + ratioW * 0.4 : trendW;
        }
        if (trend && typeof trend[k] === 'number') {
          const trendW = Math.max(0.01, trend[k]);
          return ratioW ? trendW * 0.6 + ratioW * 0.4 : trendW;
        }
        if (ratioW) return ratioW;
        return 1 / allowed.length;
      };

      if (ratio && Object.values(targetShiftCounts[s.id]).some(v => v > 0)) {
        // ★ratio指定あり: 希少シフトを確率サンプリングで日付確保 → 残りは主力シフト
        const remaining = new Set(workDays);
        allowed.filter(k => k !== '日勤').forEach(shiftType => {
          // slot-first 済み（role-slot）のシフトは Pass B では扱わない
          if (isSlotManaged(shiftType)) return;
          const targetCount = targetShiftCounts[s.id][shiftType] || 0;
          if (!targetCount) return;
          const pool = [...remaining].filter(d => {
            const cnt = ds.filter(sx => res[sx.id][d] === shiftType).length;
            return cnt < (maxStaff[shiftType] ?? 99);
          });
          const weights = pool.map(d => getShiftWeight(d, shiftType));
          // サンプリングにスロット上限ブースト: まだ余裕のある日に偏らせる（但しランダム性維持）
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
        // ★ratio指定なし / trendのみ / trendなし: 各日を確率サンプリングで決定
        workDays.forEach(d => {
          const probs = {};
          allowed.forEach(k => { probs[k] = getShiftWeight(d, k); });
          // minStaff 不足シフトにブースト（minStaff充足優先）
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
    // [DEBUG PassB終了] 公休スナップショット
    { const _R=new Set(['休み','希望休','有休']); console.error('── PassB終了 ──'); console.table(ds.map(s=>({name:s.name,targetKyuko:s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,actualKyuko:Object.values(res[s.id]).filter(v=>_R.has(v)).length,休み:Object.values(res[s.id]).filter(v=>v==='休み').length,希望休:Object.values(res[s.id]).filter(v=>v==='希望休').length,有休:Object.values(res[s.id]).filter(v=>v==='有休').length,明け:Object.values(res[s.id]).filter(v=>v==='明け').length}))); }
    { const _R=new Set(['休み','希望休','有休']); const _sh=ds.filter(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;return Object.values(res[s.id]).filter(v=>_R.has(v)).length<t;}); console.error(`[不足] PassB終了: ${_sh.length}名`); _sh.forEach(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const days2=Object.entries(res[s.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);const ake=Object.values(res[s.id]).filter(v=>v==='明け').length;console.error(`  ${s.name} target=${t} actual=${days2.length} diff=${days2.length-t} 明け=${ake} 休み日=[${days2.join(',')}]`);}); }
    { const _R=new Set(['休み','希望休','有休']); ['高野','伊藤','郡司','柳','川村'].forEach(nm=>{const _s=ds.find(s=>s.name&&s.name.includes(nm));if(_s){const _t=_s.kyukoDaysByMonth?.[mk]??_s.kyukoDays??8;const _d=Object.entries(res[_s.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);console.error(`[公休追跡] PassB終了 ${_s.name} target=${_t} actual=${_d.length} 休み日=[${_d.join(',')}]`);}}); }
    // [DEBUG PassB-連続チェック] PassB後の実際の連続勤務違反（勤務シフト配置済み）
    { let _vs=0,_vc=0,_mx=0; const _rows=ds.map(s=>{let st=0,vc=0,ms=0; for(let d=1;d<=days;d++){const v=res[s.id][d]; const isW=deptWork.has(v)&&v!=='明け'; if(!isW){st=0;}else{st++;if(st>maxConsec)vc++;} ms=Math.max(ms,st);} if(vc>0)_vs++; _vc+=vc; _mx=Math.max(_mx,ms); return{name:s.name,最大連続:ms,超過日数:vc};}); console.error(`[PassB-連続チェック] maxConsec=${maxConsec} 超過職員数=${_vs}/${ds.length} 超過日数合計=${_vc} 最大連続=${_mx}`); if(_vs>0)console.table(_rows.filter(r=>r.超過日数>0)); }

    // ── Pass C: 連続勤務超過の修正 ─ [Tier2 repair] ────────────────────────────
    // 修復方針（介護型 Tier 構造に準拠）:
    //   ① d 日が非 slot → d を休みに変換（従来通り）
    //   ② d 日が role-slot（Tier1保護）→ Tier2（日勤層）で吸収
    //      探索範囲 [d-maxConsec, d-1]: この範囲の1日を削除 → d での streak ≤ maxConsec
    //      数学的根拠: t ∈ [d-maxConsec, d-1] 削除 → 新 streak = d-t ≤ maxConsec ✓
    //
    //      削除優先順位:
    //        最優先: 日勤（base=日勤 のシフト）  ← 介護バッファ層、最も削除に適切
    //        次点  : 非 slot 勤務               ← shouldProtectSlot が false のもの
    //        禁止  : role-slot / lockedDays / 明け
    //
    //      Tier1 保証: shouldProtectSlot(tSh, count) が true の日は除外
    //      副作用: 追加された休みは後続の 公休数調整 で consecWork チェック済みなため
    //              無限 repair ループにはならない
    {
      let _fixedNonSlot = 0, _absorbedByTier2 = 0;
      const _cds = dept.customShiftDefs || [];
      // base が 日勤 かどうかを判定（isSlotManaged は除外済みだが、優先度付けのため明示チェック）
      const _isNikkinBase = (k) => (_cds.find(c => c.key === k)?.baseType || k) === '日勤';
      ds.forEach(s => {
        for (let d = 1; d <= days; d++) {
          if (!deptWork.has(res[s.id][d]) || res[s.id][d] === '明け') continue;
          if (consecWork(s.id, d) <= maxConsec) continue;
          if (lockedDays[s.id].has(d) || res[s.id][d - 1] === '明け') continue;
          const sh = res[s.id][d];
          if (shouldProtectSlot(sh, ds.filter(sx => res[sx.id][d] === sh).length)) {
            // ★Tier1保護: d 日は role-slot → 削除不可
            // Tier2 吸収: [d-maxConsec, d-1] を走査して削除候補を優先度順で選択
            const searchStart = Math.max(1, d - maxConsec);
            let nikkinTarget = null;  // 日勤候補（最優先）
            let nonSlotTarget = null; // 非 slot 候補（次点）
            for (let t = searchStart; t < d; t++) {
              if (lockedDays[s.id].has(t)) continue;
              const tSh = res[s.id][t];
              if (!deptWork.has(tSh) || tSh === '明け') continue;
              if (shouldProtectSlot(tSh, ds.filter(sx => res[sx.id][t] === tSh).length)) continue;
              // 日勤が見つかれば即確定（最優先）
              if (_isNikkinBase(tSh)) { nikkinTarget = t; break; }
              // 非 slot 勤務は候補として保存して走査続行（日勤を探す）
              if (nonSlotTarget === null) nonSlotTarget = t;
            }
            const target = nikkinTarget ?? nonSlotTarget; // 日勤優先、なければ非 slot
            if (target !== null) {
              console.log(`[PassC-Tier2休み追加] ${s.name} day=${target} before=${res[s.id][target]} (streak切断のため)`);
              res[s.id][target] = '休み'; // ← Tier2（日勤層）を削除して streak を断ち切る
              _absorbedByTier2++;
            }
            continue; // d 自体（role-slot）は変更しない
          }
          console.log(`[PassC-非slot休み追加] ${s.name} day=${d} before=${res[s.id][d]} consecWork=${consecWork(s.id,d)}`);
          res[s.id][d] = '休み';
          _fixedNonSlot++;
        }
      });
      console.error(`[AG-Phase1] PassC: 非slot修復=${_fixedNonSlot} Tier2吸収(日勤層)=${_absorbedByTier2} 合計追加休み=${_fixedNonSlot+_absorbedByTier2}`);
    }
    // ★Phase1 diagnostic: Pass C 後の連続勤務違反残存チェック（読み取り専用・ロジック変更なし）
    // [AG-Phase1] log: total=残存違反数 slotProtected=shouldProtectSlot が守った件数（Tier1衝突）
    {
      let _passCViolations = 0, _passCSlotProtected = 0;
      ds.forEach(s => {
        for (let d = 1; d <= days; d++) {
          if (!deptWork.has(res[s.id][d]) || res[s.id][d] === '明け') continue;
          if (consecWork(s.id, d) <= maxConsec) continue;
          _passCViolations++;
          const sh = res[s.id][d];
          if (shouldProtectSlot(sh, ds.filter(sx => res[sx.id][d] === sh).length)) _passCSlotProtected++;
        }
      });
      if (_passCViolations > 0)
        console.warn(`[AG-Phase1] PassC後 連続違反残存: total=${_passCViolations} slotProtected=${_passCSlotProtected}`);
      else
        console.log('[AG-Phase1] PassC後 連続違反: ゼロ ✓');
    }
    // [DEBUG PassC終了] 公休スナップショット
    { const _R=new Set(['休み','希望休','有休']); console.error('── PassC終了 ──'); console.table(ds.map(s=>({name:s.name,targetKyuko:s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,actualKyuko:Object.values(res[s.id]).filter(v=>_R.has(v)).length,休み:Object.values(res[s.id]).filter(v=>v==='休み').length,希望休:Object.values(res[s.id]).filter(v=>v==='希望休').length,有休:Object.values(res[s.id]).filter(v=>v==='有休').length,明け:Object.values(res[s.id]).filter(v=>v==='明け').length}))); }
    { const _R=new Set(['休み','希望休','有休']); const _sh=ds.filter(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;return Object.values(res[s.id]).filter(v=>_R.has(v)).length<t;}); console.error(`[不足] PassC終了: ${_sh.length}名`); _sh.forEach(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const days=Object.entries(res[s.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);const ake=Object.values(res[s.id]).filter(v=>v==='明け').length;console.error(`  ${s.name} target=${t} actual=${days.length} diff=${days.length-t} 明け=${ake} 休み日=[${days.join(',')}]`);}); }
    { const _R=new Set(['休み','希望休','有休']); ['高野','伊藤','郡司','柳','川村'].forEach(nm=>{const _s=ds.find(s=>s.name&&s.name.includes(nm));if(_s){const _t=_s.kyukoDaysByMonth?.[mk]??_s.kyukoDays??8;const _d=Object.entries(res[_s.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);console.error(`[公休追跡] PassC終了 ${_s.name} target=${_t} actual=${_d.length} 休み日=[${_d.join(',')}]`);}}); }

    // ── 公休数調整 ─ [Tier2 repair / shortage補正は shouldProtectSlot 保護済み] ──
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
            // maxStaff を守りつつ遷移ルール内で選択（両方NG なら maxStaff 優先・遷移妥協）
            const forceShift = (() => {
              const base = roleAllowed.length < dayTypes.length ? roleAllowed : dayTypes;
              // ①遷移OK + maxStaff内
              const best = base.find(k => !isBadTransition(prevShift,k) && !isBadTransition(k,nextShift) && ds.filter(sx=>res[sx.id][d]===k).length<(maxStaff[k]??99));
              if (best) return best;
              // ②遷移妥協でも maxStaff内（日勤を優先）
              const safe = base.filter(k=>ds.filter(sx=>res[sx.id][d]===k).length<(maxStaff[k]??99));
              return safe.find(k=>k==='日勤') || safe[0] || '日勤';
            })();
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
            .filter(d => {
              if (res[s.id][d - 1] === "明け" || res[s.id][d + 1] === "明け") return false;
              if (!canRest(s.id, d)) return false;
              // ★Tier1保護: role-slot が上限以内なら公休shortage補正（Tier2）の対象外
              const sh = res[s.id][d];
              if (shouldProtectSlot(sh, ds.filter(sx => res[sx.id][d] === sh).length)) return false;
              return true;
            })
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

  // [DEBUG フェーズ追跡①] 公休数調整後
  { const _R=new Set(['休み','希望休','有休']); console.error('── 公休数調整後 ──'); console.table(ds.map(s=>{const tgt=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const act=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:tgt,actual:act,diff:act-tgt};})); }
  { const _R=new Set(['休み','希望休','有休']); const _sh=ds.filter(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;return Object.values(res[s.id]).filter(v=>_R.has(v)).length<t;}); console.error(`[不足] 公休数調整後: ${_sh.length}名`); _sh.forEach(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const days=Object.entries(res[s.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);const ake=Object.values(res[s.id]).filter(v=>v==='明け').length;console.error(`  ${s.name} target=${t} actual=${days.length} diff=${days.length-t} 明け=${ake} 休み日=[${days.join(',')}]`);}); }
  { const _R=new Set(['休み','希望休','有休']); ['高野','伊藤','郡司','柳','川村'].forEach(nm=>{const _s=ds.find(s=>s.name&&s.name.includes(nm));if(_s){const _t=_s.kyukoDaysByMonth?.[mk]??_s.kyukoDays??8;const _d=Object.entries(res[_s.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);console.error(`[公休追跡] 公休数調整後 ${_s.name} target=${_t} actual=${_d.length} 休み日=[${_d.join(',')}]`);}}); }

  enforceMaxStaff(); // 1回目: Pass B/C 後の超過を除去

  // 遷移違反 repair ─ [Tier2 repair / shouldProtectSlot 保護済み（休み→日勤代替）]
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
        });
        // ★Tier1保護: altが見つからず"休み"にする前に role-slot なら日勤へフォールバック
        const curSh = res[s.id][target];
        const isSlotProtected = shouldProtectSlot(curSh, ds.filter(sx => res[sx.id][target] === curSh).length);
        const finalAlt = alt ?? (isSlotProtected
          ? (dayTypes.find(k => k === '日勤' && cnts[k] < (maxStaff[k] ?? 99)) || '日勤')
          : '休み');
        res[s.id][target] = finalAlt;
        return true;
      };
      if (!fixDay(d)) fixDay(d - 1);
    }
  }

  enforceMaxStaff(); // 2回目: 違反修正後の超過を除去

  // minStaff 保証 ─ [Tier2 repair / slide元は shouldProtectSlot 保護済み]
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
          // ★Tier1保護: role-slot が上限以内ならスライド元（Tier2）にしない
          if (shouldProtectSlot(cur, fromActual)) return false;
          return true;
        }).sort((a, b) => {
          // ★最小変更原則: 比率ターゲットのシフト中スタッフはスライドを最後に選ぶ
          const aRatio = a.shiftRatio || a.shiftRatioByMonth?.[mk];
          const bRatio = b.shiftRatio || b.shiftRatioByMonth?.[mk];
          const aOnTarget = aRatio && (aRatio[res[a.id][d]] || 0) > 0;
          const bOnTarget = bRatio && (bRatio[res[b.id][d]] || 0) > 0;
          if (aOnTarget && !bOnTarget) return 1;
          if (!aOnTarget && bOnTarget) return -1;
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

  enforceMaxStaff(); // 3回目: 最低配置保証後の超過を除去

  // [DEBUG フェーズ追跡②] minStaff保証+enforceMaxStaff×3後
  { const _R=new Set(['休み','希望休','有休']); console.error('── enforceMaxStaff×3後 ──'); console.table(ds.map(s=>{const tgt=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const act=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:tgt,actual:act,diff:act-tgt};})); }
  { const _R=new Set(['休み','希望休','有休']); const _sh=ds.filter(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;return Object.values(res[s.id]).filter(v=>_R.has(v)).length<t;}); console.error(`[不足] enforceMaxStaff×3後: ${_sh.length}名`); _sh.forEach(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const days=Object.entries(res[s.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);const ake=Object.values(res[s.id]).filter(v=>v==='明け').length;console.error(`  ${s.name} target=${t} actual=${days.length} diff=${days.length-t} 明け=${ake} 休み日=[${days.join(',')}]`);}); }

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

  // [DEBUG フェーズ追跡③] 公休数回復フェーズ後
  { const _R=new Set(['休み','希望休','有休']); console.error('── 公休数回復後 ──'); console.table(ds.map(s=>{const tgt=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const act=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:tgt,actual:act,diff:act-tgt};})); }
  { const _L=ds.find(s=>s.name&&s.name.includes('ララ')); if(_L){const _R=new Set(['休み','希望休','有休']);const _tgt=_L.kyukoDaysByMonth?.[mk]??_L.kyukoDays??8;const _ds=Object.entries(res[_L.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);console.error(`[ララ] 公休数回復後 target=${_tgt} actual=${_ds.length} diff=${_ds.length-_tgt} 休み日=[${_ds.join(',')}]`);} }

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

  // [DEBUG フェーズ追跡④] 公休数超過バリデーション後
  { const _R=new Set(['休み','希望休','有休']); console.error('── 超過バリデーション後 ──'); console.table(ds.map(s=>{const tgt=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const act=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:tgt,actual:act,diff:act-tgt};})); }
  { const _L=ds.find(s=>s.name&&s.name.includes('ララ')); if(_L){const _R=new Set(['休み','希望休','有休']);const _tgt=_L.kyukoDaysByMonth?.[mk]??_L.kyukoDays??8;const _ds=Object.entries(res[_L.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);console.error(`[ララ] 超過バリデーション後 target=${_tgt} actual=${_ds.length} diff=${_ds.length-_tgt} 休み日=[${_ds.join(',')}]`);} }

  // ratio 修復 ─ [Tier2 repair / fromShift削減は shouldProtectSlot 保護済み]
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
            // ★Tier1保護: role-slot が上限以内なら ratio修復（Tier2）で削減しない
            if (shouldProtectSlot(fromShift, fromCnt)) continue;
            const toCnt = ds.filter(sx => res[sx.id][d] === toShift).length;
            if (toCnt >= (maxStaff[toShift] ?? 99)) continue;
            res[s.id][d] = toShift;
            actuals[fromShift]--;
            actuals[toShift] = (actuals[toShift]||0) + 1;
            converted++;
          }
        }
      }
    }
  }

  enforceMaxStaff(); // 4回目: 比率修復後の最終確認

  // ★最終検証ログ: maxStaff違反が残っていないか確認
  {
    let totalViolations = 0;
    for (let d = 1; d <= days; d++) {
      for (const [k, limit] of Object.entries(maxStaff)) {
        if (limit >= 99) continue;
        const cnt = ds.filter(s => res[s.id][d] === k).length;
        if (cnt > limit) {
          console.error(`[AG-v7] FINAL VIOLATION: day=${d} shift=${k} cnt=${cnt} limit=${limit}`);
          totalViolations++;
        }
      }
    }
    if (totalViolations === 0) console.log('[AG-v7] FINAL: 違反ゼロ ✓');
    else console.error(`[AG-v7] FINAL: ${totalViolations}件の違反が残存！`);
  }

  // ★[Night-Sequence-Final] read-only: autoGenerate完了後の明け孤立数スキャン（診断のみ）
  {
    const _nf_cds   = dept.customShiftDefs || [];
    const _nf_nset  = new Set();
    [...new Set(dept.shiftTypes || [])].forEach(k => {
      const _nc = _nf_cds.find(c => c.key === k);
      if ((_nc?.baseType || k) === '夜勤') _nf_nset.add(k);
    });
    let _nf_orphans = 0;
    const _nf_list  = [];
    for (const s of ds) {
      for (let d = 2; d <= days; d++) {
        const sh   = res[s.id][d] ?? '';
        const prev = res[s.id][d - 1] ?? '';
        if (sh === '明け' && !_nf_nset.has(prev)) {
          _nf_orphans++;
          _nf_list.push(`${s.name} d${d}(prev=${prev || '空'})`);
        }
      }
    }
    if (_nf_orphans === 0) {
      console.log('[Night-Sequence-Final] 明け孤立ゼロ ✓');
    } else {
      console.warn(`[Night-Sequence-Final] 明け孤立=${_nf_orphans}件 ⚠`, _nf_list.join(' / '));
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
  // [DEBUG 最終出力] 公休スナップショット
  { const _R=new Set(['休み','希望休','有休']); console.error('── 最終出力 ──'); console.table(ds.map(s=>({name:s.name,targetKyuko:s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,actualKyuko:Object.values(res[s.id]).filter(v=>_R.has(v)).length,diff:Object.values(res[s.id]).filter(v=>_R.has(v)).length-(s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8),休み:Object.values(res[s.id]).filter(v=>v==='休み').length,希望休:Object.values(res[s.id]).filter(v=>v==='希望休').length,有休:Object.values(res[s.id]).filter(v=>v==='有休').length,明け:Object.values(res[s.id]).filter(v=>v==='明け').length}))); }
  { const _L=ds.find(s=>s.name&&s.name.includes('ララ')); if(_L){const _R=new Set(['休み','希望休','有休']);const _tgt=_L.kyukoDaysByMonth?.[mk]??_L.kyukoDays??8;const _ds=Object.entries(res[_L.id]).filter(([,v])=>_R.has(v)).map(([d])=>+d).sort((a,b)=>a-b);console.error(`[ララ] 最終出力 target=${_tgt} actual=${_ds.length} diff=${_ds.length-_tgt} 休み日=[${_ds.join(',')}]`);} }
  return { shifts: res, warnings, timelineWarnings };
}

// 生成結果のペナルティスコアを計算（低いほど良い）
function scoreShifts(res, ds, dept, days, year, month, shiftTrend = {}) {
  let score = 0;
  const WORK = buildDeptWorkTypes(dept.customShiftDefs);
  const REST = new Set(["休み","希望休"]); // 有休は賃金支払い対象のため休日カウントから除外
  const maxConsec = dept.maxConsecutive || 5;
  const mk = monthKey(year, month);
  const maxStaffSc = {};
  [...new Set(dept.shiftTypes)].forEach(k => { const cd=(dept.customShiftDefs||[]).find(d=>d.key===k);const base=cd?.baseType||k;const def=base==="日勤"?99:1;const saved=dept.maxStaff?.[k];maxStaffSc[k]=(saved!=null&&!(cd&&base==="日勤"&&saved===1))?saved:def; });
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
  // minStaff不足: Semi-Hard / maxStaff超過: Soft-Medium
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
    if (!ratio) { continue; }
    const ratioTotal = Object.values(ratio).reduce((sum, v) => sum + (v || 0), 0);
    if (ratioTotal <= 0) { continue; }
    const workCounts = {};
    let totalWork = 0;
    for (let d = 1; d <= days; d++) {
      const sh = res[s.id]?.[d];
      if (!sh || !WORK.has(sh) || sh === '明け') continue;
      workCounts[sh] = (workCounts[sh] || 0) + 1;
      totalWork++;
    }
    if (totalWork === 0) continue;
    let ratioPenalty = 0;
    Object.entries(ratio).forEach(([k, targetRate]) => {
      if (!targetRate || targetRate <= 0) return;
      const targetRatio = targetRate / ratioTotal;
      const actualRatio = (workCounts[k] || 0) / totalWork;
      ratioPenalty += Math.abs(actualRatio - targetRatio) * 100 * 50;
    });
    score += ratioPenalty;
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
            if (restProb != null) score += (1 - restProb) * 30;
          }
        }
      }
    }
  }
  return score;
}

// 局所探索（2-opt swap）: 生成済みシフトのスコアをスワップ改善でさらに下げる
function localSearchImprove(shifts, ds, dept, days, year, month, shiftTrend = {}) {
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
function bestOfN(staffList, dept, year, month, prevShifts, shiftTrend, n = 30) {
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
    const { shifts, warnings, timelineWarnings } = autoGenerate(staffList, deptVariant, year, month, prevShifts, shiftTrend);
    // スコアリングは常に元のdeptで評価（公平な比較）
    const score = scoreShifts(shifts, ds, dept, days, year, month, shiftTrend);
    if (score < bestScore) { bestScore = score; best = { shifts, warnings, timelineWarnings, score }; }
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

function buildCSV(depts, staffList, allShifts, year, month, selectedDepts) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const rows = [];
  const header = ["部署","氏名","役職", ...Array.from({length:days},(_,i)=>i+1+"日"), "勤務計","夜勤","休日"];
  rows.push(header.join(","));
  depts.filter(d=>selectedDepts.includes(d.id)).forEach(dept => {
    const shifts = allShifts[dept.id] || {};
    staffList.filter(s=>s.dept===dept.id).forEach(s => {
      const kibodays = s.kiboByMonth?.[mk] || [];
      const yukyudays = s.yukyuByMonth?.[mk] || [];
      const cells = [dept.label, s.name, s.role];
      let workCnt=0, nightCnt=0, restCnt=0;
      for(let d=1;d<=days;d++){ const v=shifts[s.id]?.[d]||""; const out=v||(yukyudays.includes(d)?"有休":kibodays.includes(d)?"希望休":""); cells.push(out); if(WORK_TYPES.has(v)) workCnt++; if(v==="夜勤") nightCnt++; if(REST_TYPES.has(v)&&v!=="明け"&&v!=="有休") restCnt+=HALF_REST_TYPES.has(v)?0.5:1; }
      cells.push(workCnt, nightCnt, restCnt);
      rows.push(cells.map(c=>`"${c}"`).join(","));
    });
    rows.push("");
  });
  return "\uFEFF" + rows.join("\n");
}

function buildPrintHTML(depts, staffList, allShifts, year, month, selectedDepts, allEvents) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const WD = ["日","月","火","水","木","金","土"];
  const TAG = (t) => '<' + t + '>';
  const CTAG = (t) => '</' + t + '>';
  let html = TAG('!DOCTYPE html')+TAG('html lang="ja"')+TAG('head')+TAG('meta charset="UTF-8"')+TAG('title')+`シフト表 ${year}年${month+1}月`+CTAG('title')+TAG('style')+`body{font-family:'Noto Sans JP',sans-serif;font-size:10px;margin:16px;color:#111;}h2{font-size:13px;margin:14px 0 5px;}table{border-collapse:collapse;width:100%;margin-bottom:20px;}th,td{border:1px solid #ccc;padding:2px 3px;text-align:center;font-size:9px;white-space:nowrap;}th{background:#e8f0fe;font-weight:bold;}.name{text-align:left;min-width:70px;}.we{background:#fff0f6;}thead{display:table-header-group;}tr{page-break-inside:avoid;break-inside:avoid;}.dept-section{page-break-inside:avoid;break-inside:avoid;}.ev-row th{background:#fffbea!important;border-bottom:2px solid #fde68a;color:#92400e;font-weight:bold;}@media print{body{margin:4px;}h2{font-size:10px;page-break-before:auto;}th,td{font-size:8px;padding:1px 2px;}}`+CTAG('style')+CTAG('head')+TAG('body');
  depts.filter(d=>selectedDepts.includes(d.id)).forEach(dept => {
    const shifts = allShifts[dept.id] || {};
    const deptEvents = (allEvents && allEvents[dept.id] && allEvents[dept.id][mk]) || {};
    html += TAG('h2')+`${dept.icon} ${dept.label}　${year}年${month+1}月`+CTAG('h2');
    html += TAG('table')+TAG('thead')+TAG('tr')+TAG('th class="name"')+'氏名'+CTAG('th');
    for(let d=1;d<=days;d++){ const wd=WD[new Date(year,month,d).getDay()]; html += TAG(`th class="${(wd==="日"||wd==="土")?"we":""}"`)+''+d+'<br>'+wd+CTAG('th'); }
    html += TAG('th')+'勤務'+CTAG('th')+TAG('th')+'夜勤'+CTAG('th')+TAG('th')+'休'+CTAG('th')+CTAG('tr');
    if(Object.keys(deptEvents).length>0){ html += '<tr class="ev-row"><th class="name">行事</th>'; for(let d=1;d<=days;d++){ const ev=deptEvents[d]||''; html += '<th style="text-align:center;vertical-align:top;padding:2px 1px;background:'+(ev?'#fef3c7':'#fffdf0')+';">'+(ev?'<span style="writing-mode:vertical-rl;text-orientation:mixed;font-size:8px;color:#92400e;font-weight:bold;">'+ev+'</span>':'')+'</th>'; } html += '<th></th><th></th><th></th></tr>'; }
    html += CTAG('thead')+TAG('tbody');
    staffList.filter(s=>s.dept===dept.id).forEach(s => {
      let w=0,n=0,r=0;
      const kibodays = s.kiboByMonth?.[mk] || [];
      const yukyudays2 = s.yukyuByMonth?.[mk] || [];
      html += TAG('tr')+TAG('td class="name"')+s.name+CTAG('td');
      for(let d=1;d<=days;d++){ const v=shifts[s.id]?.[d]||""; const isKibo=!v&&kibodays.includes(d); const isYukyu2=!v&&!isKibo&&yukyudays2.includes(d); if(WORK_TYPES.has(v)) w++; if(v==="夜勤") n++; if(REST_TYPES.has(v)&&v!=="明け"&&v!=="有休") r+=HALF_REST_TYPES.has(v)?0.5:1; if(isKibo) r++; const cellText=isKibo||v==="希望休"?'休':isYukyu2?'<span style="color:#9b4db5">有</span>':(getShiftDef(v, dept.customShiftDefs)?.short||"－"); html += TAG('td')+cellText+CTAG('td'); }
      html += TAG('td')+w+CTAG('td')+TAG('td')+(n||"－")+CTAG('td')+TAG('td')+r+CTAG('td')+CTAG('tr');
    });
    html += CTAG('tbody')+CTAG('table');
  });
  return html + CTAG('body')+CTAG('html');
}

function printWithIframe(html) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 2000);
  }, 600);
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

function ShiftBadge({ type, defs }) {
  const s = getShiftDef(type, defs);
  if (!type) return <span style={{color:"#A1A1AA",fontSize:10}}>－</span>;
  return <span style={{background:s.bg,color:s.color,border:`1px solid ${s.border||"transparent"}`,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700,display:"inline-block",minWidth:22,textAlign:"center",lineHeight:"18px",letterSpacing:"0.02em"}}>{s.short}</span>;
}

function ContextMenu({ x, y, onSelect, onClose, customDefs, deptShiftTypes, selectionCount, roleAllowed }) {
  const ref = useRef();
  useEffect(() => { const h = (e) => { if(ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [onClose]);
  const [pos, setPos] = useState({x,y});
  useEffect(() => { setPos({ x: Math.min(x, window.innerWidth-200), y: Math.min(y, window.innerHeight-320) }); }, [x,y]);
  const customWorkKeys = (customDefs||[]).filter(cd=>cd.key&&deptShiftTypes?.includes(cd.key));
  const isBulk = selectionCount > 1;
  const visibleKeys = roleAllowed ? SHIFT_KEYS_MANUAL.filter(k=>!WORK_TYPES.has(k)||roleAllowed.includes(k)) : SHIFT_KEYS_MANUAL;
  return (
    <div ref={ref} style={{position:"fixed",left:pos.x,top:pos.y,zIndex:999,background:"#18181B",border:"1px solid #27272A",borderRadius:8,padding:6,boxShadow:"0 8px 32px rgba(0,0,0,0.6)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,minWidth:170,color:"#F4F4F5"}}>
      {isBulk&&<div style={{gridColumn:"1/-1",background:"#1e1b4b",border:"1px solid #4338CA",borderRadius:6,padding:"4px 8px",marginBottom:2,fontSize:11,color:"#C7D2FE",fontWeight:700,textAlign:"center"}}>{selectionCount}セルに一括適用</div>}
      {roleAllowed&&<div style={{gridColumn:"1/-1",background:"#1c1917",border:"1px solid #78350F",borderRadius:6,padding:"3px 8px",marginBottom:2,fontSize:10,color:"#FEF3C7",textAlign:"center"}}>役職制限: {roleAllowed.join("・")}のみ</div>}
      {customWorkKeys.length>0&&<>
        {customWorkKeys.map(cd => { const s=getShiftDef(cd.key,customDefs); return <button key={cd.key} onClick={()=>onSelect(cd.key)} style={{background:s.bg,color:s.color,border:`1px solid ${s.border}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}><span style={{minWidth:18,height:18,background:s.bg,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>{s.short}</span><span style={{fontSize:11,color:"#A1A1AA"}}>{cd.key}</span></button>; })}
        <div style={{gridColumn:"1/-1",borderTop:"1px solid #27272A",margin:"2px 0"}}/>
      </>}
      {visibleKeys.map(k => { const s=SHIFTS[k]; return <button key={k||"empty"} onClick={()=>onSelect(k)} style={{background:s.bg||"transparent",color:s.color,border:`1px solid ${s.border||"#27272A"}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}><span style={{minWidth:18,height:18,background:k?s.bg:"transparent",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>{s.short}</span><span style={{fontSize:11,color:"#A1A1AA"}}>{k||"クリア"}</span></button>; })}
    </div>
  );
}

const SHIFT_REQ_TYPES = ["早番","日勤","遅番","夜勤","明け","休み","有休"];
function KiboCalendar({ year, month, selected, onChange, shiftRequests, onShiftRequests, deptId, depts, kiboCountByDay, kiboLimit }) {
  const days = getDays(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i=0; i<firstDow; i++) cells.push(null);
  for (let d=1; d<=days; d++) cells.push(d);
  const dept = (depts||DEFAULT_DEPTS).find(d=>d.id===deptId);
  const customDefs = dept?.customShiftDefs || [];
  const availableReqTypes = [
    ...SHIFT_REQ_TYPES.filter(k => k==="休み"||k==="有休"||k==="明け"||(dept?.shiftTypes||[]).includes(k)),
    ...(dept?.shiftTypes||[]).filter(k => !SHIFT_REQ_TYPES.includes(k) && customDefs.some(cd=>cd.key===k)),
  ];
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
        {["日","月","火","水","木","金","土"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:10,color:i===0?"#f87171":i===6?"#6366F1":"#52525B",padding:"2px 0"}}>{w}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
        {cells.map((d,i) => {
          if (!d) return <div key={i}/>;
          const isKibo=selected.includes(d), reqShift=shiftRequests[d], dow=(firstDow+d-1)%7, we=dow===0||dow===6, s=reqShift?getShiftDef(reqShift,customDefs):null;
          const isSelected = selectedDay===d;
          const othersKibo = kiboCountByDay?.[d] || 0;
          const limit = kiboLimit || 3;
          const kiboOver = othersKibo >= limit, kiboWarn = othersKibo === limit - 1;
          return <button key={d} onClick={()=>{ if(reqShift){setSelectedDay(isSelected?null:d);}else if(isKibo){toggleKibo(d);}else{setSelectedDay(isSelected?null:d);} }} style={{background:isSelected?"#ffe0b2":isKibo?"#fff0f0":reqShift?s.bg:"transparent",border:isSelected?"2px solid #6366F1":isKibo?"1px solid #dc2626":reqShift?`1px solid ${s.border}`:"1px solid #27272A",borderRadius:5,padding:"3px 1px",cursor:"pointer",color:isKibo?"#f87171":reqShift?s.color:we?"#6366F1":"#52525B",fontSize:10,fontWeight:(isKibo||reqShift||isSelected)?800:400,display:"flex",flexDirection:"column",alignItems:"center",gap:1,minHeight:32,position:"relative"}}>{kiboOver&&<span style={{position:"absolute",top:1,right:2,fontSize:7,color:"#ef4444",fontWeight:900,lineHeight:1}}>⚠</span>}{kiboWarn&&!kiboOver&&<span style={{position:"absolute",top:1,right:2,fontSize:7,color:"#f59e0b",fontWeight:900,lineHeight:1}}>!</span>}<span>{d}</span>{isKibo&&<span style={{fontSize:8,lineHeight:1}}>希休</span>}{reqShift&&<span style={{fontSize:8,lineHeight:1}}>{s?.short||reqShift}</span>}{!isKibo&&!reqShift&&isSelected&&<span style={{fontSize:7,lineHeight:1}}>選択</span>}{othersKibo>0&&<span style={{fontSize:7,lineHeight:1,color:kiboOver?"#ef4444":kiboWarn?"#f59e0b":"#c44b4b"}}>{othersKibo}人</span>}</button>;
        })}
      </div>
      {/* 選択中の日のシフト指定UI */}
      {selectedDay&&(
        <div style={{background:"#ffffff",border:"1px solid #D4D4D8",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
          <div style={{fontSize:11,color:"#52525B",marginBottom:6,fontWeight:700}}>{selectedDay}日の設定</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
            <button onClick={()=>{ onChange(selected.includes(selectedDay)?selected:[...selected,selectedDay]); const nr={...shiftRequests};delete nr[selectedDay];onShiftRequests(nr);setSelectedDay(null); }} style={{background:"#fff0f0",border:"1px solid #e07070",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#c44b4b"}}>希 希望休</button>
            {availableReqTypes.map(k=>{const s=getShiftDef(k,customDefs);return<button key={k} onClick={()=>setShiftReq(selectedDay,k)} style={{background:shiftRequests[selectedDay]===k?"#A1A1AA":s.bg,border:`1px solid ${s.border}`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:700,color:s.color}}>{s.short} {k}</button>;})}
            {(selected.includes(selectedDay)||shiftRequests[selectedDay])&&<button onClick={()=>clearDay(selectedDay)} style={{background:"#F4F4F5",border:"1px solid #D4D4D8",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#52525B"}}>クリア</button>}
          </div>
        </div>
      )}
      <div style={{marginTop:4,fontSize:11,color:"#52525B",display:"flex",gap:12,alignItems:"center"}}>
        <span>希望休：<span style={{color:"#f87171",fontWeight:700}}>{selected.length}日</span></span>
        <span>シフト希望：<span style={{color:"#6366F1",fontWeight:700}}>{Object.keys(shiftRequests).length}件</span></span>
        {(selected.length>0||Object.keys(shiftRequests).length>0)&&<button onClick={clearAll} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:11,marginLeft:"auto"}}>全クリア</button>}
      </div>
      <div style={{fontSize:10,color:"#71717A",marginTop:4}}>※ 日付タップ→種別を選択。希望休・シフト希望は自動生成で最優先されます。</div>
    </div>
  );
}

const INPUT_STYLE = { width:"100%", background:"#f0fffe", border:"1px solid #D4D4D8", borderRadius:7, color:"#18181B", padding:"8px 10px", fontSize:13, fontFamily:"'Noto Sans JP',sans-serif", boxSizing:"border-box", outline:"none" };

// テンキーポップアップ（写真参考: 上向き三角矢印で入力欄と接続するポップオーバー型）
function NumericKeypad({ value, onConfirm, onClose, anchorRect, min = 0, max = 100, unit = "%", mode }) {
  const initBuf = () => {
    if (value === "" || value === null || value === undefined) return "";
    if (mode === "time") return String(value).replace(":", "");
    return String(value);
  };
  const [buf, setBuf] = useState(initBuf);
  const press = (key) => {
    if (key === "CL") { setBuf(""); return; }
    if (key === "BS") { setBuf(p => p.slice(0, -1)); return; }
    if (key === "Enter") {
      if (mode === "time") {
        if (buf.length === 0) { onConfirm(""); return; }
        if (buf.length === 4) { onConfirm(buf.slice(0,2)+":"+buf.slice(2)); }
        return;
      }
      if (mode === "decimal") { onConfirm(buf === "" ? "" : buf); return; }
      const n = parseInt(buf, 10);
      onConfirm(buf === "" ? "" : String(Math.min(max, Math.max(min, isNaN(n) ? min : n))));
      return;
    }
    if (key === ".") {
      if (mode !== "decimal") return;
      setBuf(p => p.includes(".") ? p : (p || "0") + ".");
      return;
    }
    setBuf(p => {
      if (mode === "time") {
        if (p.length >= 4) return p;
        const next = p + key;
        if (next.length === 1 && parseInt(key) > 2) return p;
        if (next.length === 2 && parseInt(next) > 23) return p;
        if (next.length === 3 && parseInt(key) > 5) return p;
        return next;
      }
      if (mode === "decimal") { return p + key; }
      const next = p + key;
      const n = parseInt(next, 10);
      return (!isNaN(n) && n <= max) ? next : p;
    });
  };
  const displayVal = mode === "time"
    ? (buf.length === 0 ? "--:--" : buf.length <= 2 ? buf.padEnd(2,"_")+":__" : buf.slice(0,2)+":"+buf.slice(2).padEnd(2,"_"))
    : (buf || "0");
  // ポップアップ位置: アンカー要素の直下に中央揃え
  const PW = 216;
  const anchorCx = anchorRect ? anchorRect.left + anchorRect.width / 2 : window.innerWidth / 2;
  let left = Math.max(8, Math.min(anchorCx - PW / 2, window.innerWidth - PW - 8));
  const topBelow = anchorRect ? anchorRect.bottom + 10 : 120;
  const top = Math.min(topBelow, window.innerHeight - 290);
  // 三角矢印の水平位置（ポップアップ左端からの距離）
  const arrowX = Math.max(16, Math.min(anchorCx - left, PW - 16));
  // ボタン共通スタイル
  const B = (label, onClick, ex = {}) => (
    <button onClick={onClick} style={{
      height: 50, fontSize: 19, fontWeight: 700, borderRadius: 8,
      border: "1px solid #b8cce0", background: "rgba(255,255,255,0.92)",
      cursor: "pointer", fontFamily: "'Noto Sans JP',sans-serif",
      boxShadow: "0 2px 4px rgba(0,0,0,0.12)", display: "flex",
      alignItems: "center", justifyContent: "center",
      ...ex
    }}>{label}</button>
  );
  return (
    <div style={{position:"fixed",inset:0,zIndex:8000}}
      onMouseDown={e=>{ if(e.target===e.currentTarget)onClose(); }}
      onTouchStart={e=>{ if(e.target===e.currentTarget)onClose(); }}>
      <div style={{position:"fixed", top, left, width: PW, zIndex:8001,
        background: "rgba(200,218,240,0.97)", border: "1.5px solid #6888b8",
        borderRadius: 12, padding: "8px 10px 12px",
        boxShadow: "0 8px 28px rgba(0,0,0,0.28)"}}>
        {/* 上向き三角矢印（入力欄へのポインタ） */}
        <div style={{position:"absolute", top:-11, left: arrowX-10,
          width:0, height:0, borderLeft:"10px solid transparent",
          borderRight:"10px solid transparent", borderBottom:"11px solid #6888b8"}}/>
        <div style={{position:"absolute", top:-9, left: arrowX-9,
          width:0, height:0, borderLeft:"9px solid transparent",
          borderRight:"9px solid transparent", borderBottom:"10px solid rgba(200,218,240,0.97)"}}/>
        {/* ヘッダー */}
        <div style={{display:"flex", justifyContent:"flex-end", marginBottom:7}}>
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,0.8)", border:"1px solid #aabbd0",
            borderRadius:6, padding:"2px 12px", cursor:"pointer",
            fontSize:14, fontWeight:700, color:"#334"
          }}>×</button>
        </div>
        {/* 数値表示欄 */}
        <div style={{
          background:"#fff", border:"1.5px solid #88aad0",
          borderRadius:7, padding:"5px 12px", textAlign:"right",
          fontSize:22, fontWeight:800, marginBottom:8,
          color:"#1a3060", letterSpacing:1
        }}>
          {displayVal}{unit&&<span style={{fontSize:12,color:"#88a",marginLeft:4,fontWeight:400}}>{unit}</span>}
        </div>
        {/* キーパッド: 4列 */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:5}}>
          {B("7",()=>press("7"))} {B("8",()=>press("8"))} {B("9",()=>press("9"))}
          {B("CL",()=>press("CL"),{color:"#cc0000",fontWeight:900,background:"rgba(255,235,235,0.95)"})}
          {B("4",()=>press("4"))} {B("5",()=>press("5"))} {B("6",()=>press("6"))}
          {B("←",()=>press("BS"),{fontSize:22,color:"#cc5500"})}
          {B("1",()=>press("1"))} {B("2",()=>press("2"))} {B("3",()=>press("3"))}
          {B("－",()=>{},{color:"#bbb",cursor:"default",boxShadow:"none",background:"rgba(240,244,248,0.7)"})}
          <button onClick={()=>press("0")} style={{
            gridColumn:"span 1", height:50, fontSize:19, fontWeight:700,
            borderRadius:8, border:"1px solid #b8cce0",
            background:"rgba(255,255,255,0.92)", cursor:"pointer",
            boxShadow:"0 2px 4px rgba(0,0,0,0.12)"
          }}>0</button>
          {mode==="decimal"?B(".",()=>press("."),{color:"#334",fontWeight:900}):B("・",()=>{},{color:"#bbb",cursor:"default",boxShadow:"none",background:"rgba(240,244,248,0.7)"})}
          <button onClick={()=>press("Enter")} style={{
            gridColumn:"span 2", height:50, fontSize:15, fontWeight:800,
            borderRadius:8, border:"1px solid #3a6aaa",
            background:"linear-gradient(135deg,#4a7cc8,#2a5aaa)", color:"#fff",
            cursor:"pointer", boxShadow:"0 2px 6px rgba(42,90,170,0.4)"
          }}>Enter</button>
        </div>
      </div>
    </div>
  );
}

// ── Explainable Temporal Console UI ──────────────────────────────────────────
function TemporalConsolePanel({ data, consoleSection, setConsoleSection }) {
  if (!data) return (
    <div style={{padding:32,textAlign:"center",color:"#7a9a97",fontSize:13}}>
      シフト生成後にコンソールが表示されます。<br/>
      <span style={{fontSize:11,color:"#aaa",marginTop:8,display:"block"}}>「シフト生成」ボタンを押してください。</span>
    </div>
  );

  const toggle = key => setConsoleSection(s => s === key ? null : key);

  const badge = (level, text) => {
    const colors = {
      high:   { bg:"#fde8e8", color:"#c0392b", border:"#f5a5a5" },
      medium: { bg:"#fef3cd", color:"#b7770d", border:"#f5d98a" },
      low:    { bg:"#e8f5e9", color:"#276f26", border:"#a5d6a7" },
      block:  { bg:"#fde8e8", color:"#c0392b", border:"#f5a5a5" },
      review: { bg:"#fef3cd", color:"#b7770d", border:"#f5d98a" },
      allow:  { bg:"#e8f5e9", color:"#276f26", border:"#a5d6a7" },
      info:   { bg:"#e8f0fe", color:"#1a56b0", border:"#a5c0f5" },
    };
    const c = colors[level] || colors.info;
    return (
      <span style={{display:"inline-block",background:c.bg,color:c.color,border:`1px solid ${c.border}`,borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:700,verticalAlign:"middle",marginLeft:4}}>
        {text}
      </span>
    );
  };

  const SectionHeader = ({ id, icon, title, summary, verdict }) => (
    <div onClick={() => toggle(id)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:consoleSection===id?"#e0f3f2":"#f0faf9",borderBottom:"1px solid #c5e8e5",cursor:"pointer",userSelect:"none",borderRadius:consoleSection===id?"6px 6px 0 0":"6px"}}>
      <span style={{fontSize:14}}>{icon}</span>
      <span style={{fontWeight:700,fontSize:12,color:"#1a4a47",flex:1}}>{title}</span>
      {summary && <span style={{fontSize:10,color:"#5a8a87"}}>{summary}</span>}
      {verdict && badge(verdict.level, verdict.text)}
      <span style={{color:"#2BBFBA",fontSize:14,marginLeft:4}}>{consoleSection===id?"▲":"▼"}</span>
    </div>
  );

  const Row = ({ label, value, level }) => (
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 6px",borderBottom:"1px solid #edf7f6",fontSize:11}}>
      <span style={{color:"#5a8a87",minWidth:110,flexShrink:0}}>{label}</span>
      <span style={{color:"#1a3635",fontWeight:600,flex:1}}>{value}</span>
      {level && badge(level, level.toUpperCase())}
    </div>
  );

  const { riskDash, futureTimeline, recommendations, sandboxComp, govPanel, readability, xfData } = data;

  return (
    <div style={{padding:"10px 8px",maxWidth:680,margin:"0 auto",fontFamily:"inherit"}}>
      <div style={{background:"linear-gradient(135deg,#1a4a47,#2BBFBA)",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>🧭</span>
        <div>
          <div style={{color:"#fff",fontWeight:900,fontSize:14}}>Temporal Operations Console</div>
          <div style={{color:"#b0e8e6",fontSize:10}}>{data.dept} · {data.year}年{data.month+1}月 · {data.generatedAt?.slice(11,16)} 生成</div>
        </div>
        <div style={{marginLeft:"auto",background:"rgba(255,255,255,0.15)",borderRadius:6,padding:"3px 10px",color:"#fff",fontSize:11,fontWeight:700}}>{data.maturity}</div>
      </div>

      {/* ① Risk Dashboard */}
      <div style={{marginBottom:8,borderRadius:6,border:"1px solid #c5e8e5",overflow:"hidden"}}>
        <SectionHeader id="risk" icon="🔍" title="Temporal Risk Dashboard"
          summary={`課題 ${riskDash.totalIssues}件`}
          verdict={riskDash.totalIssues===0?{level:"low",text:"STABLE"}:riskDash.critical>0?{level:"high",text:"CRITICAL"}:{level:"medium",text:"ADVISORY"}}/>
        {consoleSection==="risk"&&(
          <div style={{background:"#fff",padding:8}}>
            <Row label="🔴 burnout high" value={riskDash.burnoutHigh.length===0?"なし":riskDash.burnoutHigh.join("、")} level={riskDash.burnoutHigh.length>0?"high":null}/>
            <Row label="🟠 support risk" value={riskDash.supportRisk.length===0?"なし":riskDash.supportRisk.join("、")} level={riskDash.supportRisk.length>0?"medium":null}/>
            <Row label="🚫 unsafe候補" value={riskDash.unsafeCandidates.length===0?"なし ✓":riskDash.unsafeCandidates.join("、")} level={riskDash.unsafeCandidates.length>0?"high":null}/>
            <Row label="⚡ nightCore数" value={`${riskDash.nightCoreCount}名`} level={riskDash.nightCoreCount===0?"high":null}/>
            <Row label="🌱 growth停滞" value={riskDash.growthStagnation.length===0?"なし":riskDash.growthStagnation.join("、")} level={riskDash.growthStagnation.length>2?"medium":null}/>
            <Row label="📍 relocationRisk" value={riskDash.relocationRisk.length===0?"なし ✓":riskDash.relocationRisk.join("、")} level={riskDash.relocationRisk.length>0?"medium":null}/>
            <Row label="✅ safeSequence" value={riskDash.safeSeqStableCount>0?`${riskDash.safeSeqStableCount}名 安定`:`0名`} level={riskDash.safeSeqStableCount===0?"medium":null}/>
          </div>
        )}
      </div>

      {/* ② Future Timeline */}
      <div style={{marginBottom:8,borderRadius:6,border:"1px solid #c5e8e5",overflow:"hidden"}}>
        <SectionHeader id="timeline" icon="📈" title="Future Timeline Panel"
          summary="現在 → 1m → 3m → 6m"
          verdict={futureTimeline.t6.coreCount>=futureTimeline.now.coreCount?{level:"low",text:"IMPROVING"}:{level:"medium",text:"WATCH"}}/>
        {consoleSection==="timeline"&&(
          <div style={{background:"#fff",padding:8}}>
            {[["now","現在",futureTimeline.now],["t1","1ヶ月後",futureTimeline.t1],["t3","3ヶ月後",futureTimeline.t3],["t6","6ヶ月後",futureTimeline.t6]].map(([k,label,pt])=>(
              <div key={k} style={{borderBottom:"1px solid #edf7f6",padding:"4px 6px"}}>
                <div style={{fontWeight:700,fontSize:11,color:"#1a6a67",marginBottom:2}}>{label}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,fontSize:10,color:"#3a6a67"}}>
                  <span>burnoutHigh: <b style={{color:pt.burnoutHigh>0?"#c0392b":"#276f26"}}>{pt.burnoutHigh}名</b></span>
                  <span>core: <b style={{color:pt.coreCount===0?"#c0392b":"#276f26"}}>{pt.coreCount}名</b></span>
                  <span>ladder↑候補: <b>{pt.ladderUp}名</b></span>
                  <span>support安定: <b>{pt.supportStable}名</b></span>
                  {pt.note&&<span style={{color:"#7a5590",fontStyle:"italic"}}>{pt.note}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ③ Recommendation Console */}
      <div style={{marginBottom:8,borderRadius:6,border:"1px solid #c5e8e5",overflow:"hidden"}}>
        <SectionHeader id="reco" icon="💡" title="Recommendation Console"
          summary={`${recommendations.length}件の提案`}
          verdict={recommendations.length===0?{level:"low",text:"NONE"}:{level:"medium",text:`${recommendations.length}件`}}/>
        {consoleSection==="reco"&&(
          <div style={{background:"#fff",padding:8}}>
            {recommendations.length===0&&<div style={{padding:8,color:"#7a9a97",fontSize:11,textAlign:"center"}}>提案なし（全スタッフ安定）</div>}
            {recommendations.map((r,i)=>(
              <div key={i} style={{border:"1px solid #e8f5e9",borderRadius:6,padding:"6px 8px",marginBottom:6,background:"#f8fffc"}}>
                <div style={{fontWeight:700,fontSize:12,color:"#1a4a47",marginBottom:4}}>{r.name} — {r.rule}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"2px 10px",fontSize:10}}>
                  <span style={{color:"#5a8a87"}}>理由: <b style={{color:"#1a3635"}}>{r.reason}</b></span>
                  <span style={{color:"#5a8a87"}}>代償: <b style={{color:r.tradeoff?"#b7770d":"#276f26"}}>{r.tradeoff||"なし"}</b></span>
                  <span style={{color:"#5a8a87"}}>governance: {badge(r.govLevel==="ALLOW"?"allow":r.govLevel==="REVIEW"?"review":"block", r.govLevel)}</span>
                  <span style={{color:"#5a8a87"}}>rollback: <b style={{color:"#276f26"}}>{r.rollbackOk?"✓ available":"⚠ 要確認"}</b></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ④ Sandbox Comparison View */}
      <div style={{marginBottom:8,borderRadius:6,border:"1px solid #c5e8e5",overflow:"hidden"}}>
        <SectionHeader id="sandbox" icon="🔬" title="Sandbox Comparison View"
          summary="介入前後比較"
          verdict={sandboxComp.newRisks.length===0?{level:"low",text:"SAFE"}:{level:"medium",text:`risk+${sandboxComp.newRisks.length}`}}/>
        {consoleSection==="sandbox"&&(
          <div style={{background:"#fff",padding:8}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div style={{background:"#fff4f4",border:"1px solid #f5a5a5",borderRadius:6,padding:8}}>
                <div style={{fontWeight:700,fontSize:11,color:"#c0392b",marginBottom:4}}>Before</div>
                <div style={{fontSize:10,color:"#5a3a3a"}}>burnoutHigh: {sandboxComp.before.burnoutHigh}名</div>
                <div style={{fontSize:10,color:"#5a3a3a"}}>core: {sandboxComp.before.coreCount}名</div>
                <div style={{fontSize:10,color:"#5a3a3a"}}>unsafe: {sandboxComp.before.unsafeCount}名</div>
              </div>
              <div style={{background:"#f0fff4",border:"1px solid #a5d6a7",borderRadius:6,padding:8}}>
                <div style={{fontWeight:700,fontSize:11,color:"#276f26",marginBottom:4}}>Sandbox After</div>
                <div style={{fontSize:10,color:"#1a3a1a"}}>burnoutHigh: {sandboxComp.after.burnoutHigh}名 {sandboxComp.after.burnoutHigh<sandboxComp.before.burnoutHigh?"✓":""}</div>
                <div style={{fontSize:10,color:"#1a3a1a"}}>core: {sandboxComp.after.coreCount}名</div>
                <div style={{fontSize:10,color:"#1a3a1a"}}>unsafe: {sandboxComp.after.unsafeCount}名 {sandboxComp.after.unsafeCount<sandboxComp.before.unsafeCount?"✓":""}</div>
              </div>
            </div>
            <Row label="✅ preserved" value={sandboxComp.preserved.length>0?sandboxComp.preserved.join(" · "):"なし"}/>
            <Row label="⚠ new risks" value={sandboxComp.newRisks.length>0?sandboxComp.newRisks.join(" · "):"なし ✓"} level={sandboxComp.newRisks.length>0?"medium":null}/>
          </div>
        )}
      </div>

      {/* ⑤ Governance Visibility Panel */}
      <div style={{marginBottom:8,borderRadius:6,border:"1px solid #c5e8e5",overflow:"hidden"}}>
        <SectionHeader id="gov" icon="🏛" title="Governance Visibility Panel"
          summary={`BLOCK ${govPanel.blockCount}件`}
          verdict={govPanel.blockCount===0?{level:"low",text:"CLEAN"}:{level:"high",text:`BLOCK ${govPanel.blockCount}`}}/>
        {consoleSection==="gov"&&(
          <div style={{background:"#fff",padding:8}}>
            {[["allow","✓ ALLOW","allow",govPanel.allow],["review","⚠ REVIEW","review",govPanel.review],["block","🚫 BLOCK","block",govPanel.block]].map(([k,label,lv,items])=>(
              <div key={k} style={{marginBottom:6}}>
                <div style={{fontWeight:700,fontSize:11,marginBottom:3}}>{label}</div>
                {items.length===0
                  ? <div style={{fontSize:10,color:"#9a9a9a",paddingLeft:8}}>該当なし</div>
                  : items.map((it,i)=>(
                    <div key={i} style={{fontSize:10,color:"#3a6a67",paddingLeft:8,padding:"2px 8px",borderLeft:`3px solid ${lv==="allow"?"#a5d6a7":lv==="review"?"#f5d98a":"#f5a5a5"}`}}>
                      <b>{it.name}</b> — {it.rule}　<span style={{color:"#7a7a7a"}}>{it.reason}</span>
                    </div>
                  ))
                }
              </div>
            ))}
            {govPanel.mandatoryApprovals.length>0&&(
              <div style={{marginTop:6,padding:"4px 8px",background:"#fef3cd",borderRadius:4,fontSize:10,color:"#7a5500"}}>
                <b>⚠ 要承認スタッフ:</b> {govPanel.mandatoryApprovals.join("、")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ⑥ Console Readability Audit */}
      <div style={{marginBottom:8,borderRadius:6,border:"1px solid #c5e8e5",overflow:"hidden"}}>
        <SectionHeader id="audit" icon="📋" title="Console Readability Audit"
          summary=""
          verdict={{level:readability.overall==="humanOperationalConsole"?"low":"medium",text:readability.overall}}/>
        {consoleSection==="audit"&&(
          <div style={{background:"#fff",padding:8}}>
            <Row label="clarity" value={readability.clarity==="high"?"high ✓":readability.clarity} level={readability.clarity==="high"?"low":"medium"}/>
            <Row label="operationalRealism" value={readability.operationalRealism?"maintained ✓":"要改善"} level={readability.operationalRealism?"low":"medium"}/>
            <Row label="AI dominance" value={`${readability.aiDominance} ${readability.aiDominance==="low"?"✓":""}`} level={readability.aiDominance==="low"?"low":readability.aiDominance==="medium"?"medium":"high"}/>
            <Row label="info overload" value={readability.infoOverload?"⚠ 情報過多":"正常 ✓"} level={readability.infoOverload?"medium":"low"}/>
            <Row label="tradeoff visible" value={readability.tradeoffVisible?"✓":"要改善"} level={readability.tradeoffVisible?"low":"medium"}/>
            <div style={{marginTop:6,padding:"6px 8px",background:"#e8f5e9",borderRadius:4,fontSize:11,fontWeight:700,color:"#276f26",textAlign:"center"}}>
              {readability.overall}
            </div>
          </div>
        )}
      </div>

      {/* ⑦ Cross-Care-Floor Night Observation */}
      <div style={{marginBottom:8,borderRadius:6,border:"1px solid #c5e8e5",overflow:"hidden"}}>
        <SectionHeader id="xf" icon="🏢" title="介護フロア夜勤観測"
          summary={xfData ? `${xfData.careFloors?.length ?? 0}フロア · STRONG ${xfData.coverage?.strongDays ?? 0}日` : "生成後に表示"}
          verdict={
            !xfData ? {level:"info",text:"LOADING"}
            : xfData.audit?.overall === 'crossCareFloorObservationStable' ? {level:"low",text:"STABLE"}
            : xfData.audit?.overall === 'crossCareFloorObservationPartial' ? {level:"medium",text:"PARTIAL"}
            : {level:"medium",text:"REVIEW"}
          }
        />
        {consoleSection==="xf"&&(
          <div style={{background:"#fff",padding:8}}>
            {!xfData&&<div style={{padding:8,color:"#7a9a97",fontSize:11,textAlign:"center"}}>観測データ準備中...</div>}
            {xfData&&(
              <>
                <div style={{padding:"4px 6px",background:"#f0faf9",borderRadius:4,marginBottom:4,fontSize:11,fontWeight:700,color:"#1a4a47"}}>夜勤体制サマリー</div>
                {(()=>{
                  const cvg=xfData.coverage;
                  const total=(cvg.strongDays||0)+(cvg.balancedDays||0)+(cvg.thinDays||0);
                  const sp=total>0?Math.round(cvg.strongDays/total*100):0;
                  const bp=total>0?Math.round(cvg.balancedDays/total*100):0;
                  const tp=total>0?Math.round(cvg.thinDays/total*100):0;
                  return(<>
                    <Row label="🟢 STRONG" value={`${cvg.strongDays}日 (${sp}%)`} level={sp>=70?"low":sp>=40?"medium":null}/>
                    <Row label="🟡 BALANCED" value={`${cvg.balancedDays}日 (${bp}%)`}/>
                    <Row label="⚪ 観測対象 THIN" value={`${cvg.thinDays}日 (${tp}%)${cvg.thinDaysList?.length?` (${cvg.thinDaysList.map(d=>d+'日').join('/')})`:''}`} level={tp>30?"medium":null}/>
                    <Row label="📊 STRONG率" value={`${sp}%`}/>
                    <Row label="📊 THIN率" value={`${tp}%`}/>
                  </>);
                })()}
                <div style={{padding:"4px 6px",background:"#f0faf9",borderRadius:4,margin:"6px 0 4px",fontSize:11,fontWeight:700,color:"#1a4a47"}}>support構造観測</div>
                {(()=>{
                  const sup=xfData.support;
                  const total=(xfData.coverage.strongDays||0)+(xfData.coverage.balancedDays||0)+(xfData.coverage.thinDays||0);
                  return(<>
                    <Row label="✅ support充足" value={`${sup.supportCoveredDays}日`} level={sup.supportCoveredDays===total?"low":null}/>
                    <Row label="🟡 support薄" value={`${sup.supportThinDays}日`} level={sup.supportThinDays>0?"medium":null}/>
                    <Row label="⚪ support不足" value={`${sup.supportGapDays}日${sup.supportGapDays>0?" (要確認)":""}`} level={sup.supportGapDays>0?"medium":null}/>
                  </>);
                })()}
                <div style={{padding:"4px 6px",background:"#f0faf9",borderRadius:4,margin:"6px 0 4px",fontSize:11,fontWeight:700,color:"#1a4a47"}}>異動適応観測</div>
                <Row label="🔄 異動適応夜勤日" value={`${xfData.relocation.relocDays}日`}/>
                <Row label="🔄 異動適応重複日" value={`${xfData.relocation.relocOverlapDays}日${xfData.relocation.relocOverlapDays>0?" (複数名同日)":""}`}/>
                <Row label="📊 集中度" value={`${(xfData.relocation.relocConcentrationScore*100).toFixed(1)}%`}/>
                <div style={{padding:"4px 6px",background:"#f0faf9",borderRadius:4,margin:"6px 0 4px",fontSize:11,fontWeight:700,color:"#1a4a47"}}>nightReadiness分布</div>
                {(()=>{
                  const nr=xfData.nightReadiness;
                  const total=(nr.high||0)+(nr.medium||0)+(nr.low||0);
                  const hp=total>0?Math.round(nr.high/total*100):0;
                  const mp=total>0?Math.round(nr.medium/total*100):0;
                  const lp=total>0?Math.round(nr.low/total*100):0;
                  return(<>
                    <Row label="🟢 HIGH" value={`${nr.high}名 (${hp}%)`} level={hp>=60?"low":null}/>
                    <Row label="🟡 MEDIUM" value={`${nr.medium}名 (${mp}%)`}/>
                    <Row label="⚪ LOW" value={`${nr.low}名 (${lp}%)`} level={lp>30?"medium":null}/>
                  </>);
                })()}
                <div style={{padding:"4px 6px",background:"#f0faf9",borderRadius:4,margin:"6px 0 4px",fontSize:11,fontWeight:700,color:"#1a4a47"}}>運営観測サマリー</div>
                {(()=>{
                  const cvg=xfData.coverage; const sup=xfData.support; const rel=xfData.relocation;
                  const total=(cvg.strongDays||0)+(cvg.balancedDays||0)+(cvg.thinDays||0);
                  const sp=total>0?Math.round(cvg.strongDays/total*100):0;
                  const lines=[];
                  if(sp>=70) lines.push(`今月は施設全体として夜勤構造は概ね安定しています（STRONG率 ${sp}%）。`);
                  else if(sp>=40) lines.push(`今月の夜勤構造はバランスを維持しています（STRONG率 ${sp}%）。`);
                  else lines.push(`今月の夜勤体制に観測対象日があります（STRONG率 ${sp}%）。`);
                  if(sup.supportGapDays>0) lines.push(`support不足日は${sup.supportGapDays}日あります。`);
                  if(rel.relocOverlapDays>0) lines.push(`異動適応中の夜勤が${rel.relocOverlapDays}日に集中しています。`);
                  if(xfData.priorityObservationDays>0) lines.push(`Cross-Floor連携の参考として${xfData.priorityObservationDays}日が観測対象です。`);
                  return(
                    <div style={{padding:"6px 8px",background:"#f8fffe",borderRadius:4,fontSize:11,color:"#1a3635",lineHeight:1.7}}>
                      {lines.map((l,i)=><div key={i}>{l}</div>)}
                      <div style={{marginTop:4,fontSize:10,color:"#7a9a97"}}>※ AI評価ではなく運営観測です。</div>
                    </div>
                  );
                })()}
                <div style={{padding:"4px 6px",background:"#f0faf9",borderRadius:4,margin:"6px 0 4px",fontSize:11,fontWeight:700,color:"#1a4a47"}}>Console Readability Audit</div>
                {(()=>{
                  const aud=xfData.audit;
                  const humanRd=aud.humanInterpretability==='high ✓'?'high':'medium';
                  const ovAlert=aud.overAlerting==='none ✓'?'none':'detected';
                  const domIso=aud.domainIsolationReady==='ready ✓'?'ready':'partial';
                  const audFlags=[humanRd!=='high',ovAlert!=='none',domIso!=='ready'].filter(Boolean).length;
                  const cv=audFlags===0?'humanReadableCrossFloorView':audFlags<=1?'partiallyReadable':'needsSimplification';
                  return(<>
                    <Row label="humanReadability" value={humanRd==='high'?'high ✓':'medium'} level={humanRd==='high'?'low':'medium'}/>
                    <Row label="informationDensity" value="balanced ✓" level="low"/>
                    <Row label="operationalInterp." value={domIso==='ready'?'high ✓':'partial ⚠'} level={domIso==='ready'?'low':'medium'}/>
                    <Row label="overAlerting" value={ovAlert==='none'?'none ✓':'detected ⚠'} level={ovAlert==='none'?'low':'medium'}/>
                    <Row label="consoleClarity" value="readable ✓" level="low"/>
                    <Row label="domainIsolation" value={aud.domainIsolationReady} level={aud.domainIsolationReady==='ready ✓'?'low':'medium'}/>
                    <Row label="CrossFloor候補日数" value={`${xfData.priorityObservationDays}日`}/>
                    <div style={{marginTop:6,padding:"6px 8px",background:"#e8f5e9",borderRadius:4,fontSize:11,fontWeight:700,color:"#276f26",textAlign:"center"}}>{cv}</div>
                  </>);
                })()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const deriveYears = (dateStr, refDate) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, (refDate - d) / (365.25 * 24 * 60 * 60 * 1000));
};

function StaffModal({ data, deptId, depts, year, month, onSave, onClose, kiboCountByDay, kiboLimit }) {
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
  const yukyuSelected = form.yukyuByMonth?.[mk] || [];
  const setYukyu = (days) => set("yukyuByMonth",{...(form.yukyuByMonth||{}),[mk]:days});
  const deptObj = depts.find(d => d.id === deptId);
  const deptDayShiftTypes = (deptObj?.shiftTypes || ["早番","日勤","遅番"]).filter(k => k !== "夜勤" && k !== "明け");
  const currentRatio = form.shiftRatio ?? null;
  const getRatioPct = (k) => currentRatio ? Math.round((currentRatio[k] ?? 0) * 100) : "";
  const [numpad, setNumpad] = useState(null); // { key, rect }
  const [kp, setKp] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const setRatioPct = (k, v) => {
    const base = { ...(currentRatio || {}) };
    if (v === "" || isNaN(+v)) { delete base[k]; } else { base[k] = Math.min(100, Math.max(0, +v)) / 100; }
    set("shiftRatio", Object.keys(base).length > 0 ? base : null);
  };
  const ratioSum = deptDayShiftTypes.reduce((s, k) => s + (currentRatio?.[k] ?? 0) * 100, 0);
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:460,boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#18181B",fontSize:15,fontWeight:900}}>{isNew?"スタッフ追加":"スタッフ編集"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        <div style={{marginBottom:12}}><div style={{color:"#52525B",fontSize:11,marginBottom:4}}>氏名</div><input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={INPUT_STYLE} placeholder="例：田中 花子"/></div>
        <div style={{marginBottom:12}}><div style={{color:"#52525B",fontSize:11,marginBottom:4}}>役職</div><select value={form.role} onChange={e=>set("role",e.target.value)} style={INPUT_STYLE}>{(deptRoles.includes(form.role)?deptRoles:[...deptRoles,form.role]).map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><div style={{color:"#52525B",fontSize:11,marginBottom:4}}>目標勤務日数</div><div onClick={e=>setKp({value:form.targetWork,min:1,max:31,unit:"日",onConfirm:v=>set("targetWork",v===""?1:Math.max(1,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,cursor:"pointer",userSelect:"none",fontWeight:700,textAlign:"center"}}>{form.targetWork}</div></div>
          <div><div style={{color:"#6366F1",fontSize:11,marginBottom:4,fontWeight:700}}>{year}年{month+1}月の休み日数</div><div onClick={e=>setKp({value:kyukoThisMonth,min:0,max:20,unit:"日",onConfirm:v=>setKyukoThisMonth(v===""?0:+v),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,color:"#6366F1",cursor:"pointer",userSelect:"none",fontWeight:800,textAlign:"center"}}>{kyukoThisMonth}</div></div>
        </div>
        {["kaigo1","kaigo2"].includes(deptId)&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:10}}><input type="checkbox" checked={!!form.nightOk} onChange={e=>set("nightOk",e.target.checked)} style={{width:15,height:15,accentColor:"#6366F1"}}/><span style={{color:"#71717A",fontSize:13}}>夜勤対応可</span></label>
            {form.nightOk&&<div><div style={{color:"#52525B",fontSize:11,marginBottom:4}}>夜勤 月間上限回数</div><div onClick={e=>setKp({value:form.nightMax,min:0,max:15,unit:"回",onConfirm:v=>set("nightMax",v===""?0:+v),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:80,cursor:"pointer",userSelect:"none",fontWeight:700,textAlign:"center"}}>{form.nightMax}</div></div>}
          </div>
        )}
        <div style={{fontSize:11,color:"#7a5590",fontWeight:700,marginBottom:8,marginTop:4}}>▍ 職員経験・適応状況（オプション）</div>
        <div style={{background:"#f8f0ff",border:"1px solid #c8a0d8",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:10,color:"#7a5590",marginBottom:8}}>入職日を入力すると経験年数が自動計算されます。未入力の場合はシフト傾向から自動推定されます。</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <div style={{color:"#7a5590",fontSize:11,marginBottom:4}}>介護業界 入職日</div>
              <input type="date"
                value={form.facilityJoinDate ?? ""}
                onChange={e=>set("facilityJoinDate",e.target.value||null)}
                style={{...INPUT_STYLE,textAlign:"center",fontSize:12}}/>
              {form.facilityJoinDate&&<div style={{fontSize:10,color:"#9b59b6",marginTop:3,textAlign:"center"}}>{deriveYears(form.facilityJoinDate,new Date())?.toFixed(1)} 年</div>}
            </div>
            <div>
              <div style={{color:"#7a5590",fontSize:11,marginBottom:4}}>フロア 配属日</div>
              <input type="date"
                value={form.floorJoinDate ?? ""}
                onChange={e=>set("floorJoinDate",e.target.value||null)}
                style={{...INPUT_STYLE,textAlign:"center",fontSize:12}}/>
              {form.floorJoinDate&&<div style={{fontSize:10,color:"#9b59b6",marginTop:3,textAlign:"center"}}>{deriveYears(form.floorJoinDate,new Date())?.toFixed(1)} 年</div>}
            </div>
          </div>
        </div>
        {form.nightOk&&(
          <div style={{marginBottom:14}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"6px 8px",background:"#f0e8ff",borderRadius:6,border:"1px solid #c8a0d8"}}>
              <input type="checkbox" checked={!!form.foreignNightSupportRequired}
                     onChange={e=>set("foreignNightSupportRequired",e.target.checked)}
                     style={{width:14,height:14,accentColor:"#7a5590"}}/>
              <div>
                <div style={{color:"#7a5590",fontSize:12,fontWeight:700}}>夜勤サポート体制を厚くしたい</div>
                <div style={{color:"#9a69b0",fontSize:10}}>cross-floor安全監査対象（国籍とは無関係の運営安全属性）</div>
              </div>
            </label>
          </div>
        )}
        {form.nightOk && (
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:"#52525B",fontWeight:700,marginBottom:6}}>夜勤レベル</div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {[[undefined,"未設定"],[1,"Lv1（サポート必要）"],[2,"Lv2（通常）"]].map(([val,label])=>(
                <label key={label} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer",fontSize:12,color:"#3F3F46"}}>
                  <input type="radio" name="nightLevel" checked={form.nightLevel===val}
                    onChange={()=>set("nightLevel",val)}
                    style={{cursor:"pointer",accentColor:"#6366F1"}}/>
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
        {/* ── 詳細設定（折りたたみ） ── */}
        <div style={{marginBottom:14,borderTop:"1px solid #F1F5F9",paddingTop:12,marginTop:4}}>
          <button onClick={()=>setShowAdvanced(a=>!a)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",fontSize:11,fontWeight:600,color:"#6B7280",padding:"4px 0",width:"100%",textAlign:"left"}}>
            <span style={{fontSize:9,color:"#9CA3AF",transition:"transform 0.15s",display:"inline-block",transform:showAdvanced?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
            詳細設定
            {currentRatio&&<span style={{fontSize:9,background:"#FEF3C7",color:"#92400E",borderRadius:4,padding:"1px 6px",marginLeft:4,fontWeight:600}}>設定済</span>}
          </button>
          {showAdvanced&&(
            <div style={{marginTop:10}}>
              <div style={{fontSize:10,color:"#9CA3AF",marginBottom:12,padding:"8px 10px",background:"#F8FAFC",borderRadius:6,border:"1px solid #F1F5F9",lineHeight:1.5}}>通常は未設定で問題ありません。日勤偏重の抑制は自動生成の順序制御が担っています。</div>
              <div style={{fontSize:11,color:"#B45309",fontWeight:700,marginBottom:8}}>勤務比率（上級者向け・任意）</div>
              <div style={{background:"#FFF8E6",border:"1px solid #F0C040",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#A06010",marginBottom:8}}>一度設定すると月をまたいでも維持されます。変更は管理者が数値を書き換えてください。<span style={{marginLeft:6,fontWeight:700,color:Math.abs(ratioSum-100)<1?"#2a8a2a":ratioSum>0?"#c44b4b":"#aaa"}}>{ratioSum>0?`合計 ${Math.round(ratioSum)}%`:""}</span></div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  {deptDayShiftTypes.map(k=>(
                    <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:12,color:SHIFTS[k]?.color,fontWeight:700,minWidth:26}}>{k}</span>
                      <div onClick={e=>setNumpad({key:k,rect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:58,padding:"4px 8px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",background:numpad?.key===k?"#e0f7f7":"#fff",fontWeight:700,fontSize:14,color:"#18181B"}}>{getRatioPct(k)||"0"}</div>
                      <span style={{fontSize:11,color:"#92400e"}}>%</span>
                    </div>
                  ))}
                  {currentRatio&&<button onClick={()=>set("shiftRatio",null)} style={{fontSize:10,color:"#9b4db5",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>クリア</button>}
                </div>
              </div>
            </div>
          )}
        </div>
        {numpad&&<NumericKeypad value={getRatioPct(numpad.key)} anchorRect={numpad.rect} onConfirm={v=>{setRatioPct(numpad.key,v);setNumpad(null);}} onClose={()=>setNumpad(null)}/>}
        {kp&&<NumericKeypad mode={kp.mode} value={kp.value} min={kp.min} max={kp.max} unit={kp.unit} anchorRect={kp.anchorRect} onConfirm={v=>{kp.onConfirm(v);setKp(null);}} onClose={()=>setKp(null)}/>}
        <div style={{fontSize:11,color:"#A1A1AA",fontWeight:700,marginBottom:10}}>▍ {year}年{month+1}月 希望休</div>
        <div style={{background:"#F4F4F5",borderRadius:8,padding:12,border:"1px solid #D4D4D8"}}>
          <KiboCalendar year={year} month={month} selected={kiboSelected} onChange={setKibo} shiftRequests={shiftRequests} onShiftRequests={setShiftRequests} deptId={deptId} depts={depts} kiboCountByDay={kiboCountByDay} kiboLimit={kiboLimit}/>
        </div>
        <div style={{fontSize:11,color:"#9b4db5",fontWeight:700,marginBottom:10,marginTop:16}}>▍ {year}年{month+1}月 有休{yukyuSelected.length>0&&<span style={{marginLeft:8,background:"#f3e5f5",border:"1px solid #c07ad5",borderRadius:10,padding:"1px 8px",fontSize:10}}>{yukyuSelected.length}日</span>}</div>
        <div style={{background:"#faf0ff",borderRadius:8,padding:12,border:"1px solid #c07ad5"}}>
          {(()=>{const days=getDays(year,month),firstDow=new Date(year,month,1).getDay(),cells=[];for(let i=0;i<firstDow;i++)cells.push(null);for(let d=1;d<=days;d++)cells.push(d);return(<div><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>{["日","月","火","水","木","金","土"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:10,color:i===0?"#f87171":i===6?"#6366F1":"#52525B",padding:"2px 0"}}>{w}</div>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>{cells.map((d,i)=>{if(!d)return<div key={i}/>;const isY=yukyuSelected.includes(d),dow=(firstDow+d-1)%7,we=dow===0||dow===6;return<button key={d} onClick={()=>setYukyu(isY?yukyuSelected.filter(x=>x!==d):[...yukyuSelected,d])} style={{background:isY?"#e8d5f5":"transparent",border:isY?"1px solid #9b4db5":"1px solid #c4a0d4",borderRadius:5,padding:"3px 1px",cursor:"pointer",color:isY?"#6b21a8":we?"#6366F1":"#52525B",fontSize:10,fontWeight:isY?800:400,display:"flex",flexDirection:"column",alignItems:"center",gap:1,minHeight:32}}><span>{d}</span>{isY&&<span style={{fontSize:8,lineHeight:1,color:"#9b4db5"}}>有休</span>}</button>;})}</div>{yukyuSelected.length>0&&<button onClick={()=>setYukyu([])} style={{fontSize:10,color:"#9b4db5",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>全てクリア</button>}</div>);})()}
        </div>
        <div style={{display:"flex",gap:10,marginTop:20}}>
          <button onClick={()=>form.name&&onSave(form)} style={{flex:1,background:"linear-gradient(135deg,#6366F1,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>保存</button>
          <button onClick={onClose} style={{flex:1,background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

const SHIFT_TYPE_OPTIONS = ["早番","日勤","遅番","夜勤"];
const DEPT_ICONS = ["🏠","🏢","🏥","💉","📋","🍱","🌸","⭐","🔵","🟢","🟡","🟠","🔴","💜"];
function DeptSettingModal({ dept, onSave, onDelete, onClose, isNew, onConfirm }) {
  const buildInitMaxStaff = (types, existing, customDefs) => { const d={}; (types||["日勤"]).forEach(k=>{const cd=(customDefs||[]).find(c=>c.key===k);const base=cd?.baseType||k;const def=base==="日勤"?99:1;const saved=existing?.[k];d[k]=(saved!=null&&!(cd&&base==="日勤"&&saved===1))?saved:def;}); return d; };
  const initShiftTypes = () => { const base=dept?.shiftTypes||["日勤"]; const ckeys=(dept?.customShiftDefs||[]).map(cd=>cd.key).filter(Boolean); const missing=ckeys.filter(k=>!base.includes(k)); const all=missing.length>0?[...base,...missing]:base; return all.filter((k,i)=>all.indexOf(k)===i); };
  const [label,setLabel]=useState(dept?.label||""), [icon,setIcon]=useState(dept?.icon||"🏠"), [shiftTypes,setShiftTypes]=useState(initShiftTypes), [minStaff,setMinStaff]=useState(dept?.minStaff||{日勤:1}), [maxStaff,setMaxStaff]=useState(()=>buildInitMaxStaff(initShiftTypes(),dept?.maxStaff,dept?.customShiftDefs)), [maxConsec,setMaxConsec]=useState(dept?.maxConsecutive||5), [defKyuko,setDefKyuko]=useState(dept?.defaultKyukoDays||8), [kiboLimit,setKiboLimit]=useState(dept?.kiboLimit||3), [rolesText,setRolesText]=useState((dept?.roles||["職員"]).join("\n")), [pinCode,setPinCode]=useState(dept?.pin||""), [roleShiftTypes,setRoleShiftTypes]=useState(dept?.roleShiftTypes||{});
  const [shiftMaxByType,setShiftMaxByType]=useState(()=>{const d={};initShiftTypes().filter(k=>k!=="夜勤").forEach(k=>{d[k]=dept?.shiftMaxByType?.[k]||0;});return d;});
  const [customShiftDefs, setCustomShiftDefs] = useState(dept?.customShiftDefs || []);
  const [crossFloorNightEnabled, setCrossFloorNightEnabled] = useState(!!dept?.crossFloorNightEnabled);
  const [shiftTimes, setShiftTimes] = useState(dept?.shiftTimes || {});
  const [intervalThreshold, setIntervalThreshold] = useState(dept?.intervalThreshold ?? "");
  const [requiredStart, setRequiredStart] = useState(dept?.requiredStart || "");
  const [requiredEnd, setRequiredEnd] = useState(dept?.requiredEnd || "");
  const [generationMode, setGenerationMode] = useState(dept?.generationMode || 'care');
  const [coverageRules, setCoverageRules] = useState(dept?.coverageRules || []);
  const toggleShiftType = (k) => { setShiftTypes(prev => { const next=prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]; setMinStaff(p=>{const n={};next.forEach(s=>{n[s]=p[s]||1;});return n;}); setMaxStaff(p=>{const n={};next.forEach(s=>{n[s]=p[s]!=null?p[s]:(s==="日勤"?99:1);});return n;}); setShiftMaxByType(p=>{const n={};next.filter(s=>s!=="夜勤").forEach(s=>{n[s]=p[s]||0;});return n;}); return next; }); };
  const handleSave = () => { if(!label.trim()){alert("部署名を入力してください");return;} if(shiftTypes.length===0){alert("シフト種別を選択してください");return;} if(pinCode&&pinCode.length!==4){alert("PINコードは4桁で入力してください");return;} const roles=rolesText.split("\n").map(r=>r.trim()).filter(Boolean); const cleanRST={}; const nonNightTypes=shiftTypes.filter(k=>k!=='夜勤'&&k!=='明け'); Object.entries(roleShiftTypes).forEach(([role,types])=>{if(types!=null&&types.length>0&&types.length<nonNightTypes.length)cleanRST[role]=types;}); const cleanMax=Object.keys(shiftMaxByType).some(k=>shiftMaxByType[k]>0)?shiftMaxByType:undefined; onSave({id:dept?.id||`dept_${Date.now()}`,label:label.trim(),icon,shiftTypes,minStaff,maxStaff,shiftMaxByType:cleanMax,maxConsecutive:maxConsec,defaultKyukoDays:defKyuko,kiboLimit,roles:roles.length>0?roles:["職員"],roleShiftTypes:Object.keys(cleanRST).length>0?cleanRST:undefined,pin:pinCode||undefined,customShiftDefs:customShiftDefs.filter(d=>d.key.trim()),shiftTimes:Object.keys(shiftTimes).length>0?shiftTimes:undefined,intervalThreshold:intervalThreshold!==""?Number(intervalThreshold):undefined,requiredStart:requiredStart||undefined,requiredEnd:requiredEnd||undefined,crossFloorNightEnabled:crossFloorNightEnabled||undefined,generationMode:generationMode==='care'?undefined:generationMode,coverageRules:coverageRules.length>0?coverageRules:undefined}); };
  const LS = { fontSize:11, color:"#52525B", fontWeight:700, marginBottom:5, display:"block" };
  const [kp, setKp] = useState(null);
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:210,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>{isNew?"➕ 部署を追加":"✏️ 部署を編集"}</div><button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}>✕</button></div>
        <label style={LS}>アイコン</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>{DEPT_ICONS.map(ic=><button key={ic} onClick={()=>setIcon(ic)} style={{width:36,height:36,borderRadius:8,fontSize:20,border:"none",cursor:"pointer",background:icon===ic?"#A1A1AA":"#F4F4F5",outline:icon===ic?"2px solid #6366F1":"none"}}>{ic}</button>)}</div>
        <label style={LS}>部署名</label>
        <input style={{...INPUT_STYLE,marginBottom:14}} value={label} onChange={e=>setLabel(e.target.value)} placeholder="例：介護部 3階"/>
        <label style={LS}>シフト種別</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{SHIFT_TYPE_OPTIONS.map(k=>{const s=SHIFTS[k],checked=shiftTypes.includes(k);return <button key={k} onClick={()=>toggleShiftType(k)} style={{background:checked?s.bg:"#F4F4F5",border:`1px solid ${checked?s.border:"#E4E4E7"}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",color:checked?s.color:"#3F3F46",fontSize:13,fontWeight:checked?700:400,display:"flex",alignItems:"center",gap:6}}><span>{checked?"✅":"○"}</span>{k}</button>;})}</div>
        {shiftTypes.length>0&&<div style={{background:"#F4F4F5",border:"1px solid #27272A",borderRadius:8,padding:"10px 12px",marginBottom:8}}><div style={{fontSize:11,color:"#52525B",marginBottom:8}}>最低配置人数 <span style={{fontSize:10,color:"#52525B",fontWeight:400}}>（この人数を下回ると警告）</span></div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.map(k=><div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:getShiftDef(k,customShiftDefs)?.color,fontWeight:700}}>{k}</span><div onClick={e=>setKp({value:minStaff[k]||0,min:0,max:20,unit:"名",onConfirm:v=>setMinStaff(p=>({...p,[k]:v===""?0:+v})),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{minStaff[k]||0}</div><span style={{fontSize:11,color:"#3F3F46"}}>名</span></div>)}</div></div>}
        {shiftTypes.length>0&&<div style={{background:"#fff3e0",border:"1px solid #e0a000",borderRadius:8,padding:"10px 12px",marginBottom:8}}><div style={{fontSize:11,color:"#b45309",marginBottom:8}}>最大配置人数 <span style={{fontSize:10,color:"#a06010",fontWeight:400}}>（自動生成でこの人数を超えない・--=制限なし）</span></div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.map(k=>{const mv=maxStaff[k]!=null?maxStaff[k]:((customShiftDefs.find(c=>c.key===k)?.baseType||k)==="日勤"?99:1);const isUnlim=mv>=99;return(<div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:getShiftDef(k,customShiftDefs)?.color,fontWeight:700}}>{k}</span><div onClick={e=>setKp({value:mv,min:1,max:99,unit:"名",onConfirm:v=>setMaxStaff(p=>({...p,[k]:v===""?99:+v})),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:isUnlim?400:700,color:isUnlim?"#b0cece":"inherit"}}>{isUnlim?"--":mv}</div>{!isUnlim&&<span style={{fontSize:11,color:"#92400e"}}>名</span>}</div>);})}</div></div>}
        {shiftTypes.filter(k=>k!=="夜勤").length>0&&<div style={{background:"#f0f0ff",border:"1px solid #a0a0e0",borderRadius:8,padding:"10px 12px",marginBottom:14}}><div style={{fontSize:11,color:"#5050b0",marginBottom:8}}>職員の月間上限回数 <span style={{fontSize:10,color:"#7070a0",fontWeight:400}}>（超過すると集計欄が赤表示・0=制限なし）</span></div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.filter(k=>k!=="夜勤").map(k=><div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:getShiftDef(k,customShiftDefs)?.color,fontWeight:700}}>{k}</span><div onClick={e=>setKp({value:shiftMaxByType[k]||0,min:0,max:31,unit:"回",onConfirm:v=>setShiftMaxByType(p=>({...p,[k]:v===""?0:+v})),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{shiftMaxByType[k]||0}</div><span style={{fontSize:11,color:"#5050b0"}}>回</span></div>)}</div></div>}
        {/* 勤務時間・インターバル設定（time専用） */}
        {generationMode==='time'&&<div style={{background:"#f0f8ff",border:"1px solid #90c4e0",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#1a5a87",fontWeight:700,marginBottom:4}}>勤務時間設定 <span style={{fontSize:10,fontWeight:400,color:"#52525B"}}>（遅番→早番の可否をインターバルで自動判定）</span></div>
          <div style={{fontSize:10,color:"#52525B",marginBottom:8}}>未入力の場合は介護標準の時間帯ルールを適用します。</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{shiftTypes.filter(k=>k!=="明け").map(k=>{const def=DEFAULT_SHIFT_TIMES[k]||{};const sd=getShiftDef(k,customShiftDefs);const mkp=(field,cur,placeholder)=>e=>setKp({mode:"time",value:cur||"",unit:"",onConfirm:v=>setShiftTimes(p=>({...p,[k]:{...(p[k]||{}),[field]:v||undefined}})),anchorRect:e.currentTarget.getBoundingClientRect()});return(<div key={k} style={{display:"flex",alignItems:"center",gap:4,background:"#ffffff",border:"1px solid #E4E4E7",borderRadius:6,padding:"4px 8px"}}><span style={{fontSize:11,color:sd?.color,fontWeight:700,minWidth:36}}>{k}</span><div onClick={mkp("start",shiftTimes[k]?.start,def.start)} style={{...INPUT_STYLE,width:60,padding:"2px 4px",marginBottom:0,fontSize:12,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:shiftTimes[k]?.start?"#18181B":"#A1A1AA"}}>{shiftTimes[k]?.start||def.start||"--:--"}</div><span style={{fontSize:10,color:"#D4D4D8"}}>〜</span><div onClick={mkp("end",shiftTimes[k]?.end,def.end)} style={{...INPUT_STYLE,width:60,padding:"2px 4px",marginBottom:0,fontSize:12,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:shiftTimes[k]?.end?"#18181B":"#A1A1AA"}}>{shiftTimes[k]?.end||def.end||"--:--"}</div></div>);})}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,color:"#3a6a87",fontWeight:700}}>インターバル閾値</span><div onClick={e=>setKp({mode:"decimal",value:intervalThreshold||"",unit:"h",onConfirm:v=>setIntervalThreshold(v),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700}}>{intervalThreshold||"--"}</div><span style={{fontSize:10,color:"#52525B"}}>時間未満を禁止（例：11）</span></div>
          <div style={{marginTop:8,display:"flex",alignItems:"center",flexWrap:"wrap",gap:8}}><span style={{fontSize:11,color:"#3a6a87",fontWeight:700}}>必須運営時間</span><div onClick={e=>setKp({mode:"time",value:requiredStart||"",unit:"",onConfirm:v=>setRequiredStart(v||""),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:70,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:requiredStart?"#18181B":"#A1A1AA"}}>{requiredStart||"--:--"}</div><span style={{fontSize:10,color:"#D4D4D8"}}>〜</span><div onClick={e=>setKp({mode:"time",value:requiredEnd||"",unit:"",onConfirm:v=>setRequiredEnd(v||""),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:70,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:requiredEnd?"#18181B":"#A1A1AA"}}>{requiredEnd||"--:--"}</div>{(requiredStart||requiredEnd)&&<button onClick={()=>{setRequiredStart("");setRequiredEnd("");}} style={{fontSize:10,color:"#dc2626",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>クリア</button>}</div>
        </div>}
        {generationMode==='time'&&<div style={{background:"#f0fff4",border:"1px solid #86efac",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#166534",fontWeight:700,marginBottom:6}}>カスタムシフト種別 <span style={{fontSize:10,fontWeight:400,color:"#4ade80"}}>（栄養科・リハビリ科など独自の勤務形態）</span></div>
          {customShiftDefs.map((cd,idx)=>(
            <div key={idx} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
              <input value={cd.key} onChange={e=>{const n=[...customShiftDefs];const oldKey=n[idx].key;const newKey=e.target.value;n[idx]={...n[idx],key:newKey};setCustomShiftDefs(n);const otherOwns=customShiftDefs.some((c,i)=>i!==idx&&c.key===oldKey);if(oldKey&&!otherOwns&&shiftTypes.includes(oldKey)){setShiftTypes(p=>{const q=p.map(k=>k===oldKey?newKey:k);return q.filter((k,i)=>q.indexOf(k)===i);});setMinStaff(p=>{const q={...p};if(oldKey in q){q[newKey]=q[oldKey];delete q[oldKey];}return q;});setMaxStaff(p=>{const q={...p};if(oldKey in q){q[newKey]=q[oldKey];delete q[oldKey];}return q;});setShiftMaxByType(p=>{const q={...p};if(oldKey in q){q[newKey]=q[oldKey];delete q[oldKey];}return q;});}}} onBlur={e=>{const key=e.target.value.trim();if(key&&!shiftTypes.includes(key)){setShiftTypes(p=>[...p,key]);setMinStaff(p=>({...p,[key]:1}));setMaxStaff(p=>({...p,[key]:1}));setShiftMaxByType(p=>({...p,[key]:0}));}}} placeholder="シフト名 例:日勤A" style={{...INPUT_STYLE,width:80,padding:"3px 6px",marginBottom:0}}/>
              <select value={cd.baseType||"日勤"} onChange={e=>{const n=[...customShiftDefs];n[idx]={...n[idx],baseType:e.target.value};setCustomShiftDefs(n);}} style={{...INPUT_STYLE,width:68,padding:"3px 4px",marginBottom:0,fontSize:11}}>
                {["早番","日勤","遅番","夜勤","休み"].map(k=><option key={k} value={k}>{k}</option>)}
              </select>
              <button onClick={()=>{const cd2=customShiftDefs[idx];setCustomShiftDefs(p=>p.filter((_,i)=>i!==idx));if(cd2.key){setShiftTypes(p=>p.filter(k=>k!==cd2.key));setMinStaff(p=>{const q={...p};delete q[cd2.key];return q;});setMaxStaff(p=>{const q={...p};delete q[cd2.key];return q;});}}} style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#dc2626",whiteSpace:"nowrap"}}>削除</button>
              {!shiftTypes.includes(cd.key)&&cd.key.trim()&&<span style={{fontSize:10,color:"#fb923c"}}>※保存前に入力欄外をタップして登録</span>}
            </div>
          ))}
          <button onClick={()=>setCustomShiftDefs(p=>[...p,{key:"",startTime:"",endTime:"",baseType:"日勤"}])} style={{background:"#f0fdf4",border:"1px dashed #86efac",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:11,color:"#166534",fontWeight:700}}>＋ カスタムシフト追加</button>
        </div>}
        {/* 時間帯別必要人数（time専用） */}
        {generationMode==='time'&&(
          <div style={{background:"#f0f4ff",border:"1px solid #a5b4fc",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
            <div style={{fontSize:11,color:"#3730a3",fontWeight:700,marginBottom:6}}>時間帯別必要人数 <span style={{fontSize:10,fontWeight:400,color:"#6366F1"}}>（各時間帯に最低何人必要かを設定）</span></div>
            {coverageRules.length===0&&<div style={{fontSize:10,color:"#6366F1",marginBottom:8}}>ルールが未設定です。＋ボタンで追加してください。</div>}
            {coverageRules.map((rule,idx)=>(
              <div key={idx} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                <div onClick={e=>setKp({mode:"time",value:rule.start||"",unit:"",onConfirm:v=>setCoverageRules(p=>{const n=[...p];n[idx]={...n[idx],start:v||""};return n;}),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:rule.start?"#18181B":"#A1A1AA"}}>{rule.start||"--:--"}</div>
                <span style={{fontSize:10,color:"#D4D4D8"}}>〜</span>
                <div onClick={e=>setKp({mode:"time",value:rule.end||"",unit:"",onConfirm:v=>setCoverageRules(p=>{const n=[...p];n[idx]={...n[idx],end:v||""};return n;}),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:rule.end?"#18181B":"#A1A1AA"}}>{rule.end||"--:--"}</div>
                <div onClick={e=>setKp({value:rule.min||1,min:1,max:20,unit:"名",onConfirm:v=>setCoverageRules(p=>{const n=[...p];n[idx]={...n[idx],min:v===""?1:+v};return n;}),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:52,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700}}>{rule.min||1}</div>
                <span style={{fontSize:11,color:"#3730a3"}}>名</span>
                <button onClick={()=>setCoverageRules(p=>p.filter((_,i)=>i!==idx))} style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11,color:"#dc2626"}}>削除</button>
              </div>
            ))}
            <button onClick={()=>setCoverageRules(p=>[...p,{start:"",end:"",min:1}])} style={{background:"#eef2ff",border:"1px dashed #a5b4fc",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:11,color:"#3730a3",fontWeight:700}}>＋ 時間帯を追加</button>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><label style={LS}>最大連続勤務日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><div onClick={e=>setKp({value:maxConsec,min:3,max:7,unit:"日",onConfirm:v=>setMaxConsec(v===""?5:Math.max(3,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{maxConsec}</div><span style={{fontSize:12,color:"#3F3F46"}}>日</span></div></div>
          <div><label style={LS}>デフォルト公休日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><div onClick={e=>setKp({value:defKyuko,min:4,max:15,unit:"日",onConfirm:v=>setDefKyuko(v===""?8:Math.max(4,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{defKyuko}</div><span style={{fontSize:12,color:"#3F3F46"}}>日</span></div></div>
          <div><label style={LS}>希望休 上限人数</label><div style={{display:"flex",alignItems:"center",gap:8}}><div onClick={e=>setKp({value:kiboLimit,min:1,max:10,unit:"名",onConfirm:v=>setKiboLimit(v===""?3:Math.max(1,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{kiboLimit}</div><span style={{fontSize:12,color:"#3F3F46"}}>名</span></div><div style={{fontSize:10,color:"#c44b4b",marginTop:3}}>同日に達すると⚠警告表示</div></div>
        </div>
        <label style={LS}>役職一覧（1行に1つ）</label>
        <textarea value={rolesText} onChange={e=>setRolesText(e.target.value)} rows={4} placeholder={"介護福祉士\n介護職員\n介護補助"} style={{...INPUT_STYLE,resize:"vertical",lineHeight:1.7,marginBottom:14}}/>
        {(()=>{
          const roles=rolesText.split("\n").map(r=>r.trim()).filter(Boolean);
          if(roles.length===0||shiftTypes.length===0)return null;
          const toggleRoleShift=(role,k)=>{
            setRoleShiftTypes(prev=>{
              const current=prev[role]?[...prev[role]]:[...shiftTypes];
              const next=current.includes(k)?current.filter(x=>x!==k):[...current,k];
              const o={...prev};
              if(next.length===shiftTypes.length){delete o[role];}else{o[role]=next;}
              return o;
            });
          };
          return(
            <div style={{marginBottom:14}}>
              <label style={LS}>役職別シフト制限（任意）</label>
              <div style={{fontSize:10,color:"#52525B",marginBottom:6}}>チェックを外したシフト種別は自動生成で割り当てられません。全チェック＝制限なし。</div>
              <div style={{background:"#f0f4ff",border:"1px solid #90aacb",borderRadius:8,padding:"10px 12px",overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:"left",padding:"2px 8px 4px 0",color:"#3a6a87",fontWeight:700,whiteSpace:"nowrap"}}>役職</th>
                      {shiftTypes.map(k=><th key={k} style={{textAlign:"center",padding:"2px 6px 4px",color:getShiftDef(k,customShiftDefs)?.color||"#333",fontWeight:700,minWidth:44}}>{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map(role=>{
                      const allowed=roleShiftTypes[role]||shiftTypes;
                      return(
                        <tr key={role}>
                          <td style={{padding:"3px 8px 3px 0",color:"#18181B",whiteSpace:"nowrap"}}>{role}</td>
                          {shiftTypes.map(k=>(
                            <td key={k} style={{textAlign:"center",padding:"3px 6px"}}>
                              <input type="checkbox" checked={allowed.includes(k)} onChange={()=>toggleRoleShift(role,k)} style={{cursor:"pointer",width:14,height:14,accentColor:"#6366F1"}}/>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
        <label style={LS}>🔒 編集PINコード（4桁・任意）</label>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
          <input type="text" inputMode="numeric" maxLength={4} value={pinCode} onChange={e=>setPinCode(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="例：1234（空欄でPINなし）" style={{...INPUT_STYLE,width:180,letterSpacing:6,textAlign:"center",marginBottom:0}}/>
          {pinCode&&<button onClick={()=>setPinCode("")} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:11}}>✕ 解除</button>}
        </div>
        <div style={{fontSize:10,color:"#52525B",marginBottom:18}}>設定すると部署タブ切替後に編集前にPINが必要になります</div>
        {shiftTypes.includes("夜勤") && (
          <div style={{marginBottom:16}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"8px 10px",background:"#eef2ff",borderRadius:8,border:"1px solid #a5b4fc"}}>
              <input type="checkbox" checked={crossFloorNightEnabled}
                onChange={e=>setCrossFloorNightEnabled(e.target.checked)}
                style={{width:14,height:14,accentColor:"#6366F1"}}/>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#4338ca"}}>クロスフロア夜勤連携を有効化</div>
                <div style={{fontSize:10,color:"#6366F1"}}>ONにすると他フロアのLv1夜勤状況を参照して自動生成します</div>
              </div>
            </label>
          </div>
        )}
        <div style={{marginBottom:16,background:"#f8f8ff",border:"1px solid #c7d2fe",borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#4338ca",marginBottom:6}}>自動生成エンジン</div>
          {[{val:'care',label:'介護特化（既定値）',desc:'G-1/NG-2・夜勤レベル・クロスフロア等の介護専用制約'},{val:'time',label:'時間軸ベース（準備中）',desc:'勤務時間帯を軸にした汎用シフト生成（開発中）'}].map(({val,label,desc})=>(
            <label key={val} style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",marginBottom:4}}>
              <input type="radio" name="generationMode" value={val} checked={generationMode===val} onChange={()=>setGenerationMode(val)} style={{marginTop:2,accentColor:"#6366F1"}}/>
              <div><div style={{fontSize:12,fontWeight:700,color:"#18181B"}}>{label}</div><div style={{fontSize:10,color:"#52525B"}}>{desc}</div></div>
            </label>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={handleSave} style={{flex:1,background:"#6366F1",color:"#fff",border:"none",borderRadius:9,padding:"12px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>{isNew?"➕ 追加する":"💾 保存する"}</button>
          {!isNew&&onDelete&&<button onClick={()=>onConfirm(`「${label}」を削除します。この部署のスタッフとシフトデータもすべて削除されます。`,()=>onDelete(dept.id),"削除する")} style={{background:"#fff0f0",border:"1px solid #e07070",borderRadius:9,padding:"12px 14px",cursor:"pointer",color:"#c44b4b",fontSize:12,fontWeight:700}}>🗑 削除</button>}
          <button onClick={onClose} style={{background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:9,padding:"12px 16px",cursor:"pointer",fontSize:13}}>キャンセル</button>
        </div>
      </div>
      {kp&&<NumericKeypad mode={kp.mode} value={kp.value} min={kp.min} max={kp.max} unit={kp.unit} anchorRect={kp.anchorRect} onConfirm={v=>{kp.onConfirm(v);setKp(null);}} onClose={()=>setKp(null)}/>}
    </div>
  );
}

function ConfirmDialog({ message, onOk, onCancel, okLabel="削除" }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#00000099",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div style={{background:"#FAFAFA",border:"1px solid #b0e0de",borderRadius:14,padding:24,width:"100%",maxWidth:340,boxShadow:"0 20px 60px #0003"}}>
        <div style={{fontSize:14,color:"#18181B",lineHeight:1.7,marginBottom:20,whiteSpace:"pre-wrap"}}>{message}</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onOk} style={{flex:1,background:"#fff0f0",border:"1px solid #e07070",borderRadius:9,padding:"12px 0",cursor:"pointer",color:"#c44b4b",fontSize:14,fontWeight:800}}>{okLabel}</button>
          <button onClick={onCancel} style={{flex:1,background:"#ffffff",border:"1px solid #D4D4D8",borderRadius:9,padding:"12px 0",cursor:"pointer",color:"#52525B",fontSize:14}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

function ClearModal({ deptLabel, onClearDept, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #450a0a",borderRadius:14,padding:24,width:"100%",maxWidth:360,boxShadow:"0 30px 80px #000"}}>
        <div style={{fontSize:15,fontWeight:900,color:"#f87171",marginBottom:6}}>🗑 シフトのクリア</div>
        <div style={{fontSize:12,color:"#52525B",marginBottom:20}}>「{deptLabel}」のシフトと実績を削除します。この操作は元に戻せません。</div>
        <button onClick={onClearDept} style={{width:"100%",background:"#fff0f0",border:"1px solid #7f1d1d",borderRadius:9,padding:"14px 16px",cursor:"pointer",marginBottom:14,display:"flex",alignItems:"center",gap:12,textAlign:"left"}}><span style={{fontSize:22}}>🗑</span><div><div style={{fontSize:13,fontWeight:800,color:"#f87171"}}>{deptLabel} のシフトと実績をクリア</div><div style={{fontSize:11,color:"#7f1d1d",marginTop:2}}>この部署のシフトと実績をすべて削除します</div></div></button>
        <button onClick={onClose} style={{width:"100%",background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"10px 0",cursor:"pointer",fontSize:13}}>キャンセル</button>
      </div>
    </div>
  );
}

function PinModal({ deptLabel, onVerify, onClose }) {
  const [digits, setDigits] = useState(['','','','']);
  const [error, setError] = useState(false);
  const refs = [useRef(), useRef(), useRef(), useRef()];
  useEffect(() => { refs[0].current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleChange = (idx, val) => {
    const d = val.replace(/\D/g,'').slice(-1);
    const next = [...digits]; next[idx] = d; setDigits(next);
    if (d && idx < 3) refs[idx+1].current?.focus();
  };
  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) { refs[idx-1].current?.focus(); }
  };
  const handleVerify = () => {
    const pin = digits.join('');
    if (pin.length < 4) return;
    if (onVerify(pin)) return;
    setError(true); setDigits(['','','','']);
    setTimeout(() => { setError(false); refs[0].current?.focus(); }, 1200);
  };
  const filled = digits.every(d => d !== '');
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"2px solid #6366F1",borderRadius:16,padding:28,width:"100%",maxWidth:320,boxShadow:"0 30px 80px #000",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>🔒</div>
        <div style={{fontSize:15,fontWeight:900,color:"#18181B",marginBottom:4}}>{deptLabel} 編集ロック</div>
        <div style={{fontSize:12,color:"#52525B",marginBottom:24}}>4桁のPINを入力してください</div>
        <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:16}}>
          {digits.map((d,i) => (
            <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={e=>handleChange(i,e.target.value)} onKeyDown={e=>handleKeyDown(i,e)}
              onKeyUp={e=>{ if(e.key==='Enter'&&filled) handleVerify(); }}
              style={{width:52,height:56,textAlign:"center",fontSize:24,fontWeight:900,border:`2px solid ${error?"#ef4444":d?"#6366F1":"#D4D4D8"}`,borderRadius:10,background:error?"#fff0f0":"#fff",outline:"none",color:"#18181B",caretColor:"transparent"}}/>
          ))}
        </div>
        {error && <div style={{color:"#ef4444",fontSize:12,marginBottom:12,fontWeight:700}}>PINが違います。もう一度お試しください。</div>}
        <button onClick={handleVerify} disabled={!filled} style={{width:"100%",background:filled?"#6366F1":"#F4F4F5",color:filled?"#fff":"#71717A",border:"none",borderRadius:9,padding:"12px 0",cursor:filled?"pointer":"not-allowed",fontSize:14,fontWeight:800,marginBottom:10}}>🔓 解錠する</button>
        <button onClick={onClose} style={{width:"100%",background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:13}}>キャンセル</button>
      </div>
    </div>
  );
}

const PASTE_SHIFT_MAP = {"早":"早番","早番":"早番","日":"日勤","日勤":"日勤","遅":"遅番","遅番":"遅番","夜":"夜勤","夜勤":"夜勤","明":"明け","明け":"明け","休":"休み","休み":"休み","公":"休み","公休":"休み","休日":"休み","振休":"休み","有":"有休","有休":"有休","有給":"有休","希":"希望休","希望休":"希望休","E":"早番","D":"日勤","L":"遅番","N":"夜勤"};
function parseExcelPasteData(tsvText, staffList, year, month, customShiftKeys=[]) {
  const normMap = {};
  Object.entries(PASTE_SHIFT_MAP).forEach(([k,v]) => { normMap[normName(k)] = v; });
  customShiftKeys.filter(Boolean).forEach(k => { normMap[normName(k)] = k; });
  const toShift = c => normMap[normName(String(c??'').trim())] || null;
  const isShift = c => !!toShift(c);
  const ROLE_WORDS = new Set(["常勤","非常勤","パート","嘱託","正規","委託","管理","職員","名前","氏名","スタッフ"]);
  const DOW_SET = new Set(["月","火","水","木","金","土","日"]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = tsvText.trim().split(/\r?\n/).map(r => r.split('\t'));
  console.log("[parseExcelPasteData] rows:", rows.length, "first3:", rows.slice(0,3).map(r=>r.slice(0,10)));
  if (rows.length < 2) return null;
  // Format B detection: row with 20+ sequential integers starting from 1
  let dateRowIdx = -1, dateColOffset = -1;
  for (let ri = 0; ri < Math.min(6, rows.length); ri++) {
    const row = rows[ri];
    let seqStart = -1, seqLen = 0;
    for (let ci = 0; ci < row.length; ci++) {
      const n = parseInt(String(row[ci]??'').trim(), 10);
      if (n === 1 && seqStart < 0) { seqStart = ci; seqLen = 1; }
      else if (seqStart >= 0 && n === seqLen + 1) seqLen++;
      else if (seqStart >= 0) break;
    }
    if (seqLen >= 20) { dateRowIdx = ri; dateColOffset = seqStart; break; }
  }
  console.log("[parseExcelPasteData] FormatB dateRowIdx:", dateRowIdx, "dateColOffset:", dateColOffset);
  const result = {}, matched = [], unmatched = [];
  if (dateRowIdx >= 0) {
    // Format B: col→day from date row (explicit date numbers)
    const colToDay = {};
    rows[dateRowIdx].forEach((c, ci) => { const n = parseInt(String(c??'').trim(), 10); if (n >= 1 && n <= 31) colToDay[ci] = n; });
    for (let ri = dateRowIdx + 1; ri < rows.length; ri++) {
      const row = rows[ri];
      const shiftCols = Object.keys(colToDay).filter(ci => isShift(row[ci])).map(Number);
      if (shiftCols.length < 3) continue;
      let nameCell = '';
      for (let ci = 0; ci < dateColOffset; ci++) {
        const v = String(row[ci]??'').trim();
        if (!v || v.length < 2 || /^\d/.test(v) || ROLE_WORDS.has(v) || isShift(v)) continue;
        nameCell = v; break;
      }
      if (!nameCell) continue;
      const staff = staffList.find(s => nameMatch(nameCell, s.name));
      if (!staff) { if (!unmatched.includes(nameCell)) unmatched.push(nameCell); continue; }
      if (!matched.includes(staff.name)) matched.push(staff.name);
      if (!result[staff.id]) result[staff.id] = {};
      shiftCols.forEach(ci => { const sk = toShift(row[ci]); if (sk) result[staff.id][colToDay[ci]] = sk; });
    }
  } else {
    // Format A: 月火水木金土日 header, column position = day number
    let headerRowIdx = -1, shiftStartCol = 1;
    for (let ri = 0; ri < Math.min(5, rows.length); ri++) {
      const row = rows[ri];
      const dowCount = row.filter(c => DOW_SET.has(String(c??'').trim())).length;
      console.log("[parseExcelPasteData] FormatA ri:", ri, "dowCount:", dowCount, "sample:", row.slice(0,8));
      if (dowCount >= 20) { headerRowIdx = ri; shiftStartCol = row.findIndex(c => DOW_SET.has(String(c??'').trim())); break; }
    }
    console.log("[parseExcelPasteData] FormatA headerRowIdx:", headerRowIdx, "shiftStartCol:", shiftStartCol);
    // Align shiftStartCol with day 1's actual DOW: verify 3 consecutive DOW chars match the month
    if (headerRowIdx >= 0) {
      const dowSeq = Array.from({length: 3}, (_, i) => ['日','月','火','水','木','金','土'][new Date(year, month, i+1).getDay()]);
      const hrow = rows[headerRowIdx];
      for (let ci = shiftStartCol; ci < Math.min(shiftStartCol + 5, hrow.length - 2); ci++) {
        if (dowSeq.every((d, k) => String(hrow[ci+k]??'').trim() === d)) { shiftStartCol = ci; break; }
      }
    }
    const colToDay = {};
    for (let i = 0; i < daysInMonth; i++) colToDay[shiftStartCol + i] = i + 1;
    for (let ri = (headerRowIdx >= 0 ? headerRowIdx + 1 : 0); ri < rows.length; ri++) {
      const row = rows[ri];
      const shiftCols = Object.keys(colToDay).filter(ci => isShift(row[Number(ci)])).map(Number);
      if (shiftCols.length < 3) continue;
      let nameCell = '';
      for (let ci = 0; ci < shiftStartCol; ci++) {
        const v = String(row[ci]??'').trim();
        if (!v || v.length < 2 || /^\d/.test(v) || ROLE_WORDS.has(v) || isShift(v)) continue;
        nameCell = v; break;
      }
      if (!nameCell) continue;
      const staff = staffList.find(s => nameMatch(nameCell, s.name));
      if (!staff) { if (!unmatched.includes(nameCell)) unmatched.push(nameCell); continue; }
      if (!matched.includes(staff.name)) matched.push(staff.name);
      if (!result[staff.id]) result[staff.id] = {};
      shiftCols.forEach(ci => { const sk = toShift(row[ci]); if (sk) result[staff.id][colToDay[ci]] = sk; });
    }
  }
  console.log("[parseExcelPasteData] result staffIds:", Object.keys(result).length, "matched:", matched, "unmatched:", unmatched);
  if (Object.keys(result).length === 0) return null;
  return { result, matched, unmatched };
}

function ExcelPasteModal({ onClose, onApply, staffList, year, month, customShiftKeys=[], deptShiftTypes=[], customShiftDefs=[] }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({length: daysInMonth}, (_, i) => i + 1);
  const DOW = ['日','月','火','水','木','金','土'];
  const allCycleKeys = [...new Set([...(deptShiftTypes.length > 0 ? deptShiftTypes : ['早番','日勤','遅番','夜勤']), '休み', '有休', '希望休', ''])];

  const [gridData, setGridData] = useState({});
  const [unmatchedNames, setUnmatchedNames] = useState([]);
  const [parseError, setParseError] = useState('');
  const [pasting, setPasting] = useState(false);
  const [namedOrder, setNamedOrder] = useState(null); // staff IDs in paste order from step-1
  const [pasteStartDay, setPasteStartDay] = useState(1);
  const [lastPasteType, setLastPasteType] = useState(''); // 'full'|'names'|'shifts'

  const isShiftCell = (c) => {
    if (!c) return false;
    return PASTE_SHIFT_MAP[normName(String(c).trim())] != null ||
      customShiftKeys.some(k => normName(k) === normName(String(c).trim()));
  };
  const parseShiftCell = (c) => {
    if (!c) return null;
    const n = normName(String(c).trim());
    return PASTE_SHIFT_MAP[n] || (customShiftKeys.find(k => normName(k) === n)) || null;
  };

  const process = (text) => {
    setParseError('');
    const rows = text.trim().split(/\r?\n/).map(r => r.split('\t').map(c => String(c??'').trim()));
    const filled = rows.filter(r => r.some(c => c));
    if (filled.length === 0) { setParseError('データが空です。'); return; }

    const DOW_CHARS = new Set(['月','火','水','木','金','土','日']);
    const isNameLike = c => c && c.length >= 2 && !isShiftCell(c) && !/^\d+$/.test(c) && !DOW_CHARS.has(c);

    const totalShiftCells = filled.reduce((s, r) => s + r.filter(isShiftCell).length, 0);
    // Check if any cell (any column) has a recognizable staff name
    const anyColHasMatchedName = filled.some(r => r.some(cell => isNameLike(cell) && staffList.some(s => nameMatch(cell, s.name))));


    // Case 1: Names-only paste (≤2 shift cells total → treat as names)
    if (totalShiftCells <= 2) {
      const order = [];
      const unmatched = [];
      filled.forEach(r => {
        const name = r.find(isNameLike);
        if (!name) return;
        const staff = staffList.find(s => nameMatch(name, s.name));
        if (staff && !order.includes(staff.id)) order.push(staff.id);
        else if (!staff && name.length >= 2) unmatched.push(name);
      });
      if (order.length > 0 || unmatched.length > 0) {
        if (order.length > 0) setNamedOrder(order);
        setUnmatchedNames(unmatched);
        setLastPasteType('names');
        if (order.length === 0) setParseError(`名前を認識しましたが、スタッフと一致しません: ${unmatched.join('、')}`);
        return;
      }
    }

    // Case 2: Shifts-only paste (has shifts but no matched staff name anywhere in data)
    if (totalShiftCells > 2 && !anyColHasMatchedName) {
      const order = namedOrder && namedOrder.length > 0 ? namedOrder : staffList.map(s => s.id);
      const shiftRows = filled.filter(r => r.some(c => c)); // all non-empty rows
      if (shiftRows.length > 0) {
        const newData = {};
        Object.entries(gridData).forEach(([id, d]) => { newData[id] = { ...d }; });
        shiftRows.forEach((row, ri) => {
          if (ri >= order.length) return;
          const staffId = order[ri];
          if (!newData[staffId]) newData[staffId] = {};
          row.forEach((cell, ci) => {
            const day = pasteStartDay + ci;
            if (day < 1 || day > daysInMonth) return;
            const sk = parseShiftCell(cell);
            if (sk) newData[staffId][day] = sk;
          });
        });
        setGridData(newData);
        setLastPasteType('shifts');
        if (!namedOrder) setParseError(''); // clear error, show info instead
        return;
      }
    }

    // Case 3: Full paste (names + shifts)
    const r = parseExcelPasteData(text, staffList, year, month, customShiftKeys);
    if (!r) { setParseError('シフトデータを読み取れませんでした。スタッフ名＋シフトの範囲を選択してCtrl+Cしてください。'); return; }
    setGridData(r.result);
    setUnmatchedNames(r.unmatched);
    setLastPasteType('full');
    if (r.matched.length > 0) {
      setNamedOrder(r.matched.map(name => staffList.find(s => s.name === name)?.id).filter(Boolean));
    }
  };

  const handlePasteEvent = (e) => { const text = e.clipboardData.getData('text'); if (text.trim()) { e.preventDefault(); process(text); } };

  const handleClickPaste = async () => {
    setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) setParseError('クリップボードが空です。Excelで範囲を選択しCtrl+Cしてから押してください。');
      else process(text);
    } catch { setParseError('クリップボードを読み取れませんでした。Ctrl+Vで貼り付けてください。'); }
    setPasting(false);
  };

  const cycleCell = (staffId, day) => {
    setGridData(prev => {
      const cur = (prev[staffId] || {})[day] ?? '';
      const idx = allCycleKeys.indexOf(cur);
      const next = allCycleKeys[(idx + 1) % allCycleKeys.length];
      return { ...prev, [staffId]: { ...(prev[staffId] || {}), [day]: next } };
    });
  };

  const totalCells = Object.values(gridData).reduce((sum, d) => sum + Object.values(d).filter(v => v).length, 0);

  const handleApply = () => {
    const cleaned = {};
    Object.entries(gridData).forEach(([id, dayMap]) => {
      const filtered = Object.fromEntries(Object.entries(dayMap).filter(([, v]) => v));
      if (Object.keys(filtered).length > 0) cleaned[id] = filtered;
    });
    onApply(cleaned);
  };

  return (
    <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:8}}
      onPaste={handlePasteEvent}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'#FAFAFA',border:'1px solid #D4D4D8',borderRadius:14,padding:'16px 18px',width:'100%',maxWidth:960,maxHeight:'95vh',boxShadow:'0 30px 80px #000',display:'flex',flexDirection:'column',gap:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:15,fontWeight:900,color:'#18181B'}}>📋 シフト貼り付けグリッド</div>
            <div style={{fontSize:11,color:'#52525B',marginTop:2}}>{year}年{month+1}月 ／ Ctrl+Vで読み込み・セルをクリックでシフト変更</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#52525B',cursor:'pointer',fontSize:20,lineHeight:1}}>✕</button>
        </div>

        {/* Step guide */}
        <div style={{background:'#e8f5f4',border:'1px solid #D4D4D8',borderRadius:8,padding:'8px 12px',fontSize:11,color:'#1a5a57'}}>
          {lastPasteType === 'names'
            ? <span style={{color:'#16a34a',fontWeight:700}}>✅ ステップ1完了: {namedOrder?.length||0}名の名前を確認しました。次に先月末を除いた <b>シフト列だけ</b>（D〜AH等）をCtrl+Cして貼り付けてください。</span>
            : lastPasteType === 'shifts'
            ? <span style={{color:'#2563eb',fontWeight:700}}>✅ ステップ2完了: シフトをグリッドに反映しました。確認して「適用」してください。</span>
            : lastPasteType === 'full'
            ? <span style={{color:'#18181B'}}>✅ 名前＋シフトを一括読み込みしました。</span>
            : <span><b>方法①</b> 名前列だけコピーして貼り付け → ②先月末を除くシフト列をコピーして貼り付け　　<b>方法②</b> 名前＋シフト（先月末含まず）をまとめてコピーして貼り付け</span>
          }
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={handleClickPaste} disabled={pasting}
            style={{background:'#6366F1',color:'#fff',border:'none',borderRadius:9,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:800,whiteSpace:'nowrap'}}>
            {pasting ? '⏳ 読み込み中…' : '📋 クリップボードから読み込み'}
          </button>
          <span style={{fontSize:11,color:'#71717A'}}>または画面にCtrl+V</span>
          {(lastPasteType === 'names' || lastPasteType === 'shifts') && (
            <div style={{display:'flex',alignItems:'center',gap:6,background:'#fff',border:'1px solid #D4D4D8',borderRadius:8,padding:'4px 10px'}}>
              <span style={{fontSize:11,color:'#52525B',fontWeight:700}}>シフト開始日:</span>
              <button onClick={()=>setPasteStartDay(d=>Math.max(1,d-1))} style={{width:22,height:22,border:'1px solid #E4E4E7',borderRadius:4,background:'#F4F4F5',cursor:'pointer',fontSize:12,fontWeight:700,padding:0}}>−</button>
              <span style={{fontSize:13,fontWeight:900,color:'#18181B',minWidth:20,textAlign:'center'}}>{pasteStartDay}</span>
              <button onClick={()=>setPasteStartDay(d=>Math.min(daysInMonth,d+1))} style={{width:22,height:22,border:'1px solid #E4E4E7',borderRadius:4,background:'#F4F4F5',cursor:'pointer',fontSize:12,fontWeight:700,padding:0}}>＋</button>
              <span style={{fontSize:11,color:'#52525B'}}>日から</span>
            </div>
          )}
          {unmatchedNames.length > 0 && (
            <div style={{background:'#fff8e1',border:'1px solid #f59e0b',borderRadius:8,padding:'3px 10px',fontSize:11,color:'#b45309',fontWeight:700}}>
              ⚠️ 未マッチ: {unmatchedNames.join('、')}
            </div>
          )}
        </div>

        {parseError && (
          <div style={{background:'#fff0f0',border:'1px solid #dc2626',borderRadius:8,padding:'7px 12px',color:'#dc2626',fontSize:12}}>{parseError}</div>
        )}

        <div style={{overflowX:'auto',overflowY:'auto',flex:1,border:'1px solid #E4E4E7',borderRadius:8,minHeight:0}}>
          <table style={{borderCollapse:'collapse',fontSize:11,tableLayout:'fixed',minWidth:'max-content',width:'100%'}}>
            <thead>
              <tr style={{position:'sticky',top:0,zIndex:2}}>
                <th style={{width:88,padding:'5px 8px',border:'1px solid #E4E4E7',textAlign:'left',fontWeight:700,color:'#18181B',position:'sticky',left:0,zIndex:3,background:'#c8e8e5'}}>スタッフ</th>
                {days.map(d => {
                  const dow = new Date(year, month, d).getDay();
                  return (
                    <th key={d} style={{width:34,padding:'2px 1px',border:'1px solid #E4E4E7',textAlign:'center',fontWeight:700,background:'#F4F4F5',
                      color: dow===0?'#e53935':dow===6?'#1E88E5':'#18181B'}}>
                      <div style={{fontSize:11}}>{d}</div>
                      <div style={{fontSize:9,fontWeight:400}}>{DOW[dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(namedOrder
                ? [...namedOrder.map(id => staffList.find(s => s.id === id)).filter(Boolean),
                   ...staffList.filter(s => !namedOrder.includes(s.id))]
                : staffList
              ).map((s, si) => {
                const isNamed = namedOrder?.includes(s.id);
                const namedIdx = namedOrder?.indexOf(s.id) ?? -1;
                const staffShifts = gridData[s.id] || {};
                return (
                  <tr key={s.id} style={{background: si%2===0 ? '#fff' : '#f7fdfc'}}>
                    <td style={{padding:'3px 8px',border:'1px solid #E4E4E7',fontWeight:600,color:'#18181B',
                      background: isNamed ? (si%2===0 ? '#d5f0e8' : '#c8eadf') : (si%2===0 ? '#e8f5f4' : '#ddf0ee'),
                      position:'sticky',left:0,zIndex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:88,fontSize:11}}>
                      {isNamed && <span style={{fontSize:9,color:'#16a34a',marginRight:3}}>#{namedIdx+1}</span>}
                      {s.name}
                    </td>
                    {days.map(d => {
                      const sk = staffShifts[d] || '';
                      const def = getShiftDef(sk, customShiftDefs);
                      return (
                        <td key={d} onClick={() => cycleCell(s.id, d)}
                          style={{width:34,padding:'2px 1px',border:'1px solid #ddd',textAlign:'center',cursor:'pointer',
                            background: sk ? def.bg : 'inherit',
                            color: sk ? def.color : '#ccc',
                            fontWeight: sk ? 700 : 400,
                            userSelect:'none',fontSize:11}}>
                          {sk ? (def.short || sk) : '－'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{color:'#52525B',fontWeight:700,fontSize:11}}>凡例:</span>
          {allCycleKeys.filter(k => k !== '').map(k => {
            const def = getShiftDef(k, customShiftDefs);
            return <span key={k} style={{background:def.bg,border:`1px solid ${def.border}`,borderRadius:6,padding:'2px 7px',color:def.color,fontWeight:700,fontSize:11}}>{k}</span>;
          })}
        </div>

        <div style={{display:'flex',gap:10}}>
          <button onClick={handleApply} disabled={totalCells === 0}
            style={{flex:2,background:totalCells>0?'linear-gradient(135deg,#2d8a52,#2a7a6e)':'#b0cece',color:'#fff',border:'none',borderRadius:8,padding:'11px 0',cursor:totalCells>0?'pointer':'default',fontSize:14,fontWeight:800}}>
            ✅ このシフトを適用する{totalCells>0?` (${totalCells}件)`:''}
          </button>
          <button onClick={onClose}
            style={{flex:1,background:'#F4F4F5',color:'#52525B',border:'1px solid #D4D4D8',borderRadius:8,padding:'11px 0',cursor:'pointer',fontSize:14}}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkKyukoModal({ staffList, year, month, onApply, onClose }) {
  const mk = monthKey(year, month);
  const initDays = () => { const first = staffList[0]; return first ? (first.kyukoDaysByMonth?.[mk] ?? first.kyukoDays ?? 8) : 8; };
  const [days, setDays] = useState(initDays);
  const setVal = (v) => setDays(Math.max(0, Math.min(20, +v || 0)));
  const [kp, setKp] = useState(null);
  const totalStaff = staffList.length;
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:360,boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div><div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>📅 休み日数 一括設定</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>{year}年{month+1}月</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}>✕</button></div>
        <div style={{fontSize:11,color:"#3F3F46",marginBottom:20,marginTop:8,background:"#F4F4F5",borderRadius:7,padding:"8px 12px",border:"1px solid #27272A"}}>💡 施設全体の休み日数を設定します。全部署・全スタッフ（{totalStaff}名）に一括適用されます。</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:28,background:"#F4F4F5",borderRadius:12,padding:"18px 20px",border:"1px solid #D4D4D8"}}>
          <button onClick={()=>setVal(days-1)} style={{background:"#E4E4E7",border:"1px solid #1a4040",borderRadius:8,color:"#1a4040",cursor:"pointer",width:40,height:40,fontSize:22,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
          <div style={{textAlign:"center"}}>
            <div onClick={e=>setKp({value:days,min:0,max:20,unit:"日",onConfirm:v=>setVal(v===""?0:+v),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{width:72,background:"#f0fffe",border:"2px solid #6366F1",borderRadius:8,color:"#6366F1",fontSize:28,fontWeight:900,textAlign:"center",padding:"6px 0",cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",justifyContent:"center",minHeight:48}}>{days}</div>
            <div style={{fontSize:12,color:"#3F3F46",marginTop:4,fontWeight:700}}>日 / 月</div>
          </div>
          <button onClick={()=>setVal(days+1)} style={{background:"#E4E4E7",border:"1px solid #1a4040",borderRadius:8,color:"#1a4040",cursor:"pointer",width:40,height:40,fontSize:22,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
        </div>
        <div style={{display:"flex",gap:10}}><button onClick={()=>onApply(days,mk)} style={{flex:1,background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>✅ 適用する</button><button onClick={onClose} style={{flex:1,background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button></div>
      </div>
      {kp&&<NumericKeypad mode={kp.mode} value={kp.value} min={kp.min} max={kp.max} unit={kp.unit} anchorRect={kp.anchorRect} onConfirm={v=>{kp.onConfirm(v);setKp(null);}} onClose={()=>setKp(null)}/>}
    </div>
  );
}

function DownloadModal({ depts, staffList, allShifts, year, month, activeDeptId, allEvents, onClose }) {
  const [selectedDepts, setSelectedDepts] = useState([activeDeptId]);
  const noSelection = selectedDepts.length === 0;
  const fname = `シフト表_${year}年${month+1}月`;
  const toggleDept = (id) => setSelectedDepts(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const doDownload = (ext) => { if(noSelection)return; let content="",type=""; if(ext==="csv"){content=buildCSV(depts,staffList,allShifts,year,month,selectedDepts);type="text/csv;charset=utf-8";} if(ext==="html"){content=buildPrintHTML(depts,staffList,allShifts,year,month,selectedDepts,allEvents);type="text/html;charset=utf-8";} triggerDownload(content,`${fname}.${ext}`,type); };
  const doPrint = () => { if(noSelection)return; const html=buildPrintHTML(depts,staffList,allShifts,year,month,selectedDepts,allEvents); printWithIframe(html); onClose(); };
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:400,boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div><div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>📤 書き出し</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>{year}年{month+1}月</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}>✕</button></div>
        <div style={{fontSize:11,color:"#52525B",fontWeight:700,marginBottom:7}}>対象部署</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:16}}>{depts.map(d=>{const sel=selectedDepts.includes(d.id);return<button key={d.id} onClick={()=>toggleDept(d.id)} style={{background:sel?"#A1A1AA":"transparent",color:sel?"#6366F1":"#3F3F46",border:`1px solid ${sel?"#6366F1":"#E4E4E7"}`,borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:sel?700:400}}>{d.icon} {d.label}</button>;})}</div>
        {noSelection&&<div style={{fontSize:11,color:"#ef4444",marginBottom:10}}>⚠ 部署を1つ以上選択してください</div>}
        <button onClick={doPrint} disabled={noSelection} style={{width:"100%",background:noSelection?"#F4F4F5":"#6366F1",border:"none",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1,marginBottom:8}}><span style={{fontSize:24}}>🖨️</span><div><div style={{fontSize:13,fontWeight:800,color:"#fff"}}>今すぐ印刷</div><div style={{fontSize:11,color:"#d5f5f5",marginTop:2}}>印刷ダイアログがすぐに開きます</div></div></button>
        <button onClick={()=>doDownload("csv")} disabled={noSelection} style={{width:"100%",background:noSelection?"#F4F4F5":"#e8f5ee",border:"1px solid #2d8a52",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1,marginBottom:8}}><span style={{fontSize:24}}>📊</span><div><div style={{fontSize:13,fontWeight:800,color:"#34d399"}}>CSV（Excel・スプレッドシート）</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>Excel・Googleスプレッドシートで開けます</div></div></button>
        <button onClick={()=>doDownload("html")} disabled={noSelection} style={{width:"100%",background:noSelection?"#F4F4F5":"#F4F4F5",border:"1px solid #A1A1AA",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1}}><span style={{fontSize:24}}>💾</span><div><div style={{fontSize:13,fontWeight:800,color:"#6366F1"}}>HTMLで保存（USB用）</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>他のPCやUSBで印刷する場合に使用</div></div></button>
      </div>
    </div>
  );
}

const HELP_SECTIONS = [
  {
    id: "staff", icon: "👥", label: "スタッフ登録",
    steps: [
      { title: "「スタッフ」タブを開く", body: "画面上部のタブから「👥 スタッフ」をタップします。" },
      { title: "「＋ 追加」ボタンを押す", body: "右下または一覧上部の「＋ スタッフ追加」ボタンを押します。" },
      { title: "情報を入力して保存", body: "氏名・部署・役職・スキルを入力し「保存」を押します。複数部署を掛け持ちする場合は所属部署を追加してください。" },
      { title: "希望休を設定する（任意）", body: "スタッフ詳細画面のカレンダーから希望休の日付をタップすると選択できます。" },
    ],
    tips: ["スタッフ名は後から変更できます。", "削除したスタッフのシフトデータは残りますが再表示はできません。"],
  },
  {
    id: "dept", icon: "🏢", label: "部署設定",
    steps: [
      { title: "部署タブ横の「⚙️ 設定」を押す", body: "部署名タブの右にある設定ボタンをクリックします。" },
      { title: "部署名・アイコンを設定", body: "部署名とアイコン（絵文字）を入力します。" },
      { title: "シフト種別・人数基準を設定", body: "使用するシフト種別と、各シフトの必要人数目安を設定します。自動生成時の基準になります。" },
      { title: "締め切り日を設定（任意）", body: "スタッフポータルの希望休締め切り日を設定できます。設定するとポータルの月が自動的に固定されます。" },
    ],
    tips: ["部署は複数追加できます（＋ 部署追加）。", "PINロックを設定すると、シフト編集に暗証番号が必要になります。"],
  },
  {
    id: "shift", icon: "📅", label: "シフト入力",
    steps: [
      { title: "「シフト表」タブを開く", body: "「📅 シフト表」タブがデフォルトで開いています。" },
      { title: "セルを左クリック（タップ）", body: "スタッフ名×日付のセルを左クリックまたはタップするとシフト種別が順番に切り替わります。" },
      { title: "右クリックでメニュー", body: "PC では右クリックするとシフト一覧のコンテキストメニューが表示され、直接選択できます。" },
      { title: "「⚡ 自動生成」で一括作成", body: "ツールバーの「⚡ 自動生成」を押すと、傾向学習データと希望休を考慮してシフトを自動作成します。" },
    ],
    tips: ["夜勤を入力すると翌日が自動で「明け」になります。", "ズームスライダーで表示サイズを調整できます。"],
    warn: "自動生成すると現在のシフトが上書きされます。",
  },
  {
    id: "portal", icon: "🔗", label: "希望休ポータル",
    steps: [
      { title: "「🔗 共有」ボタンを押す", body: "ツールバーの「🔗 共有」から部署ごとのURLとQRコードを確認します。" },
      { title: "URLをスタッフに送る", body: "「LINEで送る」ボタン、またはURLをコピーしてLINEやメールで送ります。" },
      { title: "スタッフが希望休を入力", body: "スタッフは受け取ったURLを開き、自分の名前を選んでカレンダーで希望休をタップ→送信します。" },
      { title: "管理者に自動反映", body: "スタッフが送信すると管理者のシフト表にリアルタイムで反映されます。" },
    ],
    tips: ["締め切り日を設定すると、期限を超えた送信はできなくなります。", "QRコードを印刷して掲示板に貼ることもできます。"],
  },
  {
    id: "summary", icon: "📊", label: "集計・書き出し",
    steps: [
      { title: "「📊 集計」タブを開く", body: "「📊 集計」タブを押すと月間集計表が表示されます。" },
      { title: "各スタッフの勤務数を確認", body: "早・日・遅・夜・明・休の回数と合計勤務日数が表示されます。" },
      { title: "「📤 書き出し」で保存", body: "ツールバーの「📤 書き出し」から CSV・HTML・印刷を選択できます。" },
    ],
    tips: ["CSVはExcelやGoogleスプレッドシートで開けます。", "HTMLは他のPCでも印刷できる形式です。"],
  },
  {
    id: "ai", icon: "🧠", label: "傾向学習・AI",
    steps: [
      { title: "過去データの貼り付け学習（初回）", body: "「📊 傾向学習」ボタン→「シフトを貼り付け」で過去のシフト実績をコピー&ペーストして読み込みます。初回シフト作成の精度が上がります。" },
      { title: "しふぽんで作成するほど精度UP", body: "しふぽんでシフトを作成・保存するたびに自動で学習が進みます。学習データはサーバーに蓄積され、次回の生成精度に活用されます。" },
      { title: "例外月の除外", body: "コロナ・インフルエンザ等で通常のシフトが崩れた月は「例外月」に設定すると学習から除外できます。除外は18ヶ月後に自動解除されます。" },
      { title: "🤖 AI調整（フルプランのみ）", body: "「🤖 AI」ボタンをONにして指示を入力すると、AIがシフトを調整します（例：「〇〇さんを15日に休みにして」）。" },
    ],
    tips: ["貼り付けた過去データと保存済みシフトはどちらも学習に利用されます。", "学習データが6ヶ月以上蓄積されると、貼り付けデータより保存済みシフトの学習が優先されます。"],
  },
];

function HelpModal({ onClose }) {
  const [activeId, setActiveId] = useState("staff");
  const sec = HELP_SECTIONS.find(s => s.id === activeId);
  return (
    <div style={{position:"fixed",inset:0,background:"#000000bb",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 30px 80px #000"}}>
        {/* ヘッダー */}
        <div style={{background:"#6366F1",color:"#fff",padding:"16px 20px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{fontWeight:900,fontSize:16}}>❓ 使い方ガイド</div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",cursor:"pointer",fontSize:18,width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>✕</button>
        </div>
        {/* タブ */}
        <div style={{display:"flex",overflowX:"auto",borderBottom:"2px solid #F4F4F5",background:"#eaf8f6",flexShrink:0}}>
          {HELP_SECTIONS.map(s=>(
            <button key={s.id} onClick={()=>setActiveId(s.id)} style={{padding:"9px 12px",background:"transparent",border:"none",color:activeId===s.id?"#4F46E5":"#3F3F46",borderBottom:activeId===s.id?"2px solid #6366F1":"2px solid transparent",cursor:"pointer",fontSize:11,fontWeight:activeId===s.id?800:500,whiteSpace:"nowrap",flexShrink:0}}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        {/* コンテンツ */}
        <div style={{overflowY:"auto",padding:"20px 24px",flex:1}}>
          <div style={{fontSize:16,fontWeight:900,color:"#18181B",marginBottom:16}}>{sec.icon} {sec.label}</div>
          {sec.steps.map((st,i)=>(
            <div key={i} style={{display:"flex",gap:14,marginBottom:20,alignItems:"flex-start"}}>
              <div style={{background:"#6366F1",color:"#fff",borderRadius:"50%",width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,flexShrink:0,marginTop:2}}>{i+1}</div>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#18181B",marginBottom:4}}>{st.title}</div>
                <div style={{fontSize:12,color:"#3a5a57",lineHeight:1.8}}>{st.body}</div>
              </div>
            </div>
          ))}
          {sec.warn&&(
            <div style={{background:"#fff3e0",borderLeft:"4px solid #FB8C00",borderRadius:"0 8px 8px 0",padding:"10px 14px",margin:"8px 0",fontSize:12,color:"#18181B"}}>
              <div style={{fontWeight:800,color:"#FB8C00",marginBottom:3}}>⚠ 注意</div>
              {sec.warn}
            </div>
          )}
          {sec.tips&&sec.tips.length>0&&(
            <div style={{background:"#e8f5ee",borderLeft:"4px solid #2d8a52",borderRadius:"0 8px 8px 0",padding:"10px 14px",margin:"8px 0"}}>
              <div style={{fontWeight:800,color:"#2d8a52",fontSize:12,marginBottom:6}}>💡 ポイント</div>
              {sec.tips.map((t,i)=><div key={i} style={{fontSize:12,color:"#18181B",lineHeight:1.8}}>・{t}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EventEditModal({ day, month, year, currentText, onSave, onClose }) {
  const [text, setText] = useState(currentText || "");
  const wd = ["日","月","火","水","木","金","土"][(new Date(year, month, day)).getDay()];
  return (
    <div style={{position:"fixed",inset:0,background:"#000000bb",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",border:"1px solid #fde68a",borderRadius:14,padding:24,width:"100%",maxWidth:360,boxShadow:"0 20px 60px #0004"}}>
        <div style={{fontSize:14,fontWeight:900,color:"#92400e",marginBottom:14}}>📅 {month+1}月{day}日（{wd}）の行事</div>
        <input autoFocus value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")onSave(text.trim());if(e.key==="Escape")onClose();}} placeholder="例：運営会議、研修" maxLength={12} style={{width:"100%",fontSize:14,padding:"9px 12px",border:"1px solid #fde68a",borderRadius:8,outline:"none",boxSizing:"border-box",marginBottom:12}} />
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onSave(text.trim())} style={{flex:1,background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",border:"none",borderRadius:8,padding:"10px",cursor:"pointer",fontSize:13,fontWeight:800}}>保存</button>
          {currentText&&<button onClick={()=>onSave("")} style={{background:"#fff5f5",color:"#ef4444",border:"1px solid #ef4444",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontSize:13,fontWeight:700}}>削除</button>}
          <button onClick={onClose} style={{background:"#f0f0f0",color:"#666",border:"none",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontSize:13}}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

function GenerateWarningModal({ warnings, deptLabel, year, month, score, timelineWarnings, coverageWarnings, onClose }) {
  const entries = Object.entries(warnings);
  const days = new Date(year, month + 1, 0).getDate();
  const hasTimeline = timelineWarnings && timelineWarnings.length > 0;
  const hasCoverage = coverageWarnings && coverageWarnings.length > 0;
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff5f5",border:"1px solid #7f1d1d",borderRadius:14,padding:28,width:"100%",maxWidth:440,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:10}}><div style={{width:44,height:44,borderRadius:10,flexShrink:0,background:"#fff0f0",border:"1px solid #ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>⚠️</div><div><div style={{fontSize:15,fontWeight:900,color:"#fca5a5",marginBottom:4}}>自動生成の警告</div><div style={{fontSize:12,color:"#52525B"}}>{deptLabel} ／ {year}年{month+1}月</div></div></div>
        {score!=null&&<div style={{background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:7,padding:"6px 12px",marginBottom:14,fontSize:11,color:"#92400e"}}>30回試行して最もスコアが低い結果を採用しました（違反スコア: <span style={{fontWeight:800}}>{score}</span>）。残る警告は手動で調整してください。</div>}
        {entries.length>0&&<><div style={{background:"#fff0f0",border:"1px solid #7f1d1d",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#fca5a5",lineHeight:1.7}}>以下のシフト種別で、設定した最低配置人数を達成できない日が発生しました。</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>{entries.map(([shiftKey,info])=>{const s=SHIFTS[shiftKey]||{},pct=Math.round(info.days/days*100);return(<div key={shiftKey} style={{background:"#FAFAFA",border:`1px solid ${s.border||"#3F3F46"}`,borderRadius:9,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}><ShiftBadge type={shiftKey}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:s.color||"#71717A"}}>{shiftKey}</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>不足日数：<span style={{color:"#f87171",fontWeight:700}}>{info.days}日</span>　最大 <span style={{color:"#f87171",fontWeight:700}}>−{info.maxShort}名</span></div></div><div style={{width:80}}><div style={{height:6,background:"#E4E4E7",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${pct}%`,background:pct>50?"#ef4444":pct>20?"#f59e0b":"#f87171"}}/></div><div style={{fontSize:10,color:"#52525B",marginTop:3,textAlign:"right"}}>{pct}%</div></div></div>);})}</div></>}
        {hasTimeline&&<><div style={{background:"#fff8e1",border:"1px solid #f59e0b",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#92400e",lineHeight:1.7}}>必須運営時間帯にカバーされていない時間帯があります（手動調整推奨）。</div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>{timelineWarnings.map(({day,gaps})=><div key={day} style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:7,padding:"6px 10px",fontSize:11,color:"#78350f"}}><span style={{fontWeight:700}}>{month+1}/{day}</span>　未カバー：{gaps.map(g=>`${minsToTimeStr(g.start)}〜${minsToTimeStr(g.end)}`).join("、")}</div>)}</div></>}
        {hasCoverage&&<><div style={{background:"#f0f4ff",border:"1px solid #a5b4fc",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#3730a3",lineHeight:1.7}}>時間帯別必要人数を満たせない区間があります（手動調整推奨）。</div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>{coverageWarnings.map((w,i)=><div key={i} style={{background:"#eef2ff",border:"1px solid #c7d2fe",borderRadius:7,padding:"6px 10px",fontSize:11,color:"#312e81"}}><span style={{fontWeight:700}}>{month+1}/{w.day}</span>　{w.ruleStart}〜{w.ruleEnd}　不足区間：{minsToTimeStr(w.gapStart)}〜{minsToTimeStr(w.gapEnd)}　最大<span style={{fontWeight:700,color:"#ef4444"}}>{w.maxShortage}名</span>不足</div>)}</div></>}
        <button onClick={onClose} style={{width:"100%",background:"linear-gradient(135deg,#6366F1,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>確認しました</button>
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

const TH = ({sticky,w}={}) => ({ position:sticky?"sticky":"static", left:sticky?0:"auto", zIndex:sticky?3:1, background:"#FAFAFA", padding:"5px 3px", borderBottom:"1px solid #F1F5F9", borderRight:"1px solid #F1F5F9", fontSize:10, fontWeight:600, color:"#71717A", textAlign:"center", whiteSpace:"nowrap", width:w||"auto", minWidth:w||"auto" });
const TD = { textAlign:"center", padding:"4px 2px", borderBottom:"1px solid #F1F5F9", borderRight:"1px solid #F1F5F9" };

// ── 変更履歴から復元モーダル ──────────────────────────────────
function ShiftHistoryModal({ session, year, month, deptId, deptLabel, onClose, onRestore }) {
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);
  const shiftKey = `shifts_${year}_${month+1}_${deptId}`;

  useEffect(() => {
    supabase.from('shift_data_history')
      .select('id, archived_at, original_updated_at')
      .eq('user_id', session.user.id)
      .eq('data_key', shiftKey)
      .order('archived_at', { ascending: false })
      .limit(15)
      .then(({ data, error }) => {
        setLoading(false);
        if (!error && data) setHistories(data);
        else if (error) console.error('[history]', error);
      });
  }, [shiftKey, session.user.id]);

  const fmt = (iso) => {
    const d = new Date(iso);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const handleRestore = async (histId, archivedAt) => {
    if (!window.confirm(`${fmt(archivedAt)} 時点の状態に復元しますか？\n現在のシフトは上書きされます（現在の状態も履歴に残ります）。`)) return;
    setRestoring(histId);
    const { data: hd, error: he } = await supabase.from('shift_data_history').select('data_value').eq('id', histId).single();
    if (he || !hd) { alert('取得失敗: ' + (he?.message || '不明')); setRestoring(null); return; }
    const { error: ue } = await supabase.from('shift_data').upsert(
      { user_id:session.user.id, data_key:shiftKey, data_value:hd.data_value, updated_at:new Date().toISOString() },
      { onConflict:'user_id,data_key' }
    );
    if (ue) { alert('復元失敗: ' + ue.message); setRestoring(null); return; }
    onRestore(hd.data_value);
    onClose();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:16,padding:24,width:"100%",maxWidth:420,maxHeight:"85vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontWeight:800,fontSize:16,color:"#18181B"}}>🕐 変更履歴から復元</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#888",lineHeight:1}}>✕</button>
        </div>
        <div style={{fontSize:12,color:"#71717A",marginBottom:16,fontWeight:600}}>{deptLabel} — {year}年{month+1}月シフト</div>
        {loading && <div style={{textAlign:"center",color:"#aaa",padding:32}}>読み込み中…</div>}
        {!loading && histories.length === 0 && (
          <div style={{textAlign:"center",padding:32}}>
            <div style={{fontSize:32,marginBottom:8}}>📭</div>
            <div style={{color:"#999",fontSize:13}}>まだ履歴がありません</div>
            <div style={{color:"#bbb",fontSize:11,marginTop:6}}>今後の保存から自動的に記録されます</div>
          </div>
        )}
        {histories.map((h) => (
          <div key={h.id} style={{border:"1px solid #e5e7eb",borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fafafa"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:"#18181B"}}>{fmt(h.archived_at)} に上書き保存</div>
              <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>この時点の直前の状態に戻せます</div>
            </div>
            <button
              disabled={!!restoring}
              onClick={() => handleRestore(h.id, h.archived_at)}
              style={{background:restoring===h.id?"#d1fae5":"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"7px 12px",cursor:restoring?"wait":"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap",minWidth:80}}
            >{restoring===h.id?"復元中…":"この状態\nに戻す"}</button>
          </div>
        ))}
        <div style={{fontSize:10,color:"#d1d5db",textAlign:"center",marginTop:12}}>最大15世代まで遡れます</div>
      </div>
    </div>
  );
}

function ShiftTable({ staffList, shifts, dept, year, month, onLeftClick, onRightClick, events, onEventEdit }) {
  const days = getDays(year, month);
  const ds = staffList.filter(s=>s.dept===dept.id);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
  const deptWork = buildDeptWorkTypes(dept.customShiftDefs);
  const deptRest = buildDeptRestTypes(dept.customShiftDefs);
  const isAlert = (d) => { for(const [sh,min] of Object.entries(dept.minStaff||{})){const cnt=ds.filter(s=>(shifts[s.id]?.[d]||"")===sh).length;if(cnt<min)return true;} return false; };
  const isConsecViolation = (sShifts, d) => { if(!deptWork.has(sShifts[d]))return false; return calcConsecutive(sShifts,d)>maxConsec; };
  const hasNight = dept.shiftTypes.includes("夜勤");
  const rightCols = [...dept.shiftTypes, ...(hasNight?["明け"]:[]), "計", "休", "希"];
  const rightColCount = rightCols.length;

  // Drag-to-select state
  const dragAnchorRef = useRef(null);
  const isDraggingRef = useRef(false);
  const mouseStartRef = useRef(null);
  const [selAnchor, setSelAnchor] = useState(null);
  const [selCur, setSelCur] = useState(null);

  const selectedCells = useMemo(() => {
    if (!selAnchor || !selCur) return new Set();
    const r1 = Math.min(selAnchor.si, selCur.si), r2 = Math.max(selAnchor.si, selCur.si);
    const d1 = Math.min(selAnchor.d, selCur.d), d2 = Math.max(selAnchor.d, selCur.d);
    const cells = new Set();
    for (let ri = r1; ri <= r2; ri++) {
      if (ds[ri]) for (let di = d1; di <= d2; di++) cells.add(`${ds[ri].id}|${di}`);
    }
    return cells;
  }, [selAnchor, selCur, ds]);

  const handleCellMouseDown = (si, d, e) => {
    mouseStartRef.current = {x: e.clientX, y: e.clientY};
    dragAnchorRef.current = {si, d};
    isDraggingRef.current = false;
  };

  const handleCellMouseEnter = (si, d) => {
    if (isDraggingRef.current) setSelCur({si, d});
  };

  // Touch long-press → context menu
  const longPressTimerRef = useRef(null);
  const touchInfoRef = useRef(null);
  const handleCellTouchStart = (si, d, e) => {
    const touch = e.touches[0];
    touchInfoRef.current = {si, d, x: touch.clientX, y: touch.clientY};
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      const ti = touchInfoRef.current;
      if (!ti) return;
      touchInfoRef.current = null;
      const staff = ds[ti.si];
      if (!staff) return;
      const cellKey = `${staff.id}|${ti.d}`;
      const selCells = selectedCells.has(cellKey) && selectedCells.size > 1 ? selectedCells : null;
      onRightClick(staff.id, ti.d, {clientX: ti.x, clientY: Math.max(80, ti.y - 80)}, selCells);
    }, 500);
  };
  const handleCellTouchEnd = (si, d, e) => {
    e.preventDefault(); // prevent synthesized mouse events from double-firing
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      if (touchInfoRef.current) {
        const staff = ds[si];
        if (staff) onLeftClick(staff.id, d, {button: 0});
      }
    }
    touchInfoRef.current = null;
  };
  const handleTouchMove = (e) => {
    if (!touchInfoRef.current) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - touchInfoRef.current.x) > 8 || Math.abs(touch.clientY - touchInfoRef.current.y) > 8) {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      touchInfoRef.current = null;
    }
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!mouseStartRef.current || isDraggingRef.current) return;
      if (Math.abs(e.clientX - mouseStartRef.current.x) > 5 || Math.abs(e.clientY - mouseStartRef.current.y) > 5) {
        isDraggingRef.current = true;
        const anchor = dragAnchorRef.current;
        if (anchor) { setSelAnchor({...anchor}); setSelCur({...anchor}); }
      }
    };
    const onUp = (e) => {
      if (!mouseStartRef.current) {
        if (!isDraggingRef.current) { setSelAnchor(null); setSelCur(null); }
        return;
      }
      const wasDragging = isDraggingRef.current;
      isDraggingRef.current = false;
      mouseStartRef.current = null;
      const anchor = dragAnchorRef.current;
      dragAnchorRef.current = null;
      if (!wasDragging && anchor) {
        const staff = ds[anchor.si];
        if (staff) onLeftClick(staff.id, anchor.d, e);
        setSelAnchor(null); setSelCur(null);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') { setSelAnchor(null); setSelCur(null); } };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [ds, onLeftClick]);

  // ── 公平性ゲージ: 夜勤・土日出勤の偏差を計算 ──
  const fairnessData = useMemo(() => {
    if (ds.length === 0) return {};
    const days2 = getDays(year, month);
    const nightTypes = new Set(dept.shiftTypes.includes('夜勤') ? ['夜勤'] : []);
    const restTypes = new Set(['休み', '休', '明け', '有休', '希望休', '公休']);
    let totalNight = 0, totalWeekend = 0;
    const raw = {};
    for (const s of ds) {
      const ss = shifts[s.id] || {};
      let nc = 0, wc = 0;
      for (let d = 1; d <= days2; d++) {
        const t = ss[d] || '';
        const dow = new Date(year, month, d).getDay();
        if (nightTypes.has(t)) nc++;
        if ((dow === 0 || dow === 6) && t && !restTypes.has(t)) wc++;
      }
      raw[s.id] = { nc, wc };
      totalNight += nc; totalWeekend += wc;
    }
    const avgN = totalNight / ds.length, avgW = totalWeekend / ds.length;
    const result = {};
    for (const s of ds) {
      const nd = raw[s.id].nc - avgN, wd = raw[s.id].wc - avgW;
      const dev = Math.abs(nd) + Math.abs(wd);
      result[s.id] = {
        nc: raw[s.id].nc, wc: raw[s.id].wc,
        nd: Math.round(nd * 10) / 10, wd: Math.round(wd * 10) / 10,
        color: dev < 1 ? '#22c55e' : dev < 2.5 ? '#f59e0b' : '#ef4444',
        tip: `夜勤 ${raw[s.id].nc}回(平均比${nd>=0?'+':''}${Math.round(nd*10)/10}) / 土日出勤 ${raw[s.id].wc}回(平均比${wd>=0?'+':''}${Math.round(wd*10)/10})`
      };
    }
    return result;
  }, [shifts, ds, year, month, dept.shiftTypes]);

  const roleViolationCount = useMemo(() => {
    if (!dept.roleShiftTypes) return 0;
    let count = 0;
    for (const s of ds) {
      const ra = dept.roleShiftTypes[s.role];
      if (!ra) continue;
      for (let d = 1; d <= days; d++) {
        const sh = shifts[s.id]?.[d] || '';
        if (!sh || !deptWork.has(sh) || sh === '明け') continue;
        if (!ra.includes(sh)) count++;
      }
    }
    return count;
  }, [shifts, ds, days, dept.roleShiftTypes, deptWork]);

  return (
    <div>
    {roleViolationCount > 0 && (
      <div style={{background:"#FFF1F2",border:"1px solid #FECDD3",borderRadius:6,padding:"6px 12px",marginBottom:6,color:"#BE123C",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
        <span>役職制限: {roleViolationCount}件</span>
      </div>
    )}
    <div style={{overflowX:"auto",overflowY:"visible",userSelect:"none",WebkitTouchCallout:"none"}} onTouchMove={handleTouchMove}>
      <table style={{borderCollapse:"collapse",minWidth:"max-content",fontSize:12}}>
        <thead>
          <tr>
            <th style={TH({sticky:true,w:148})}><span style={{color:"#71717A",fontSize:10}}>氏名</span></th>
            {Array.from({length:days},(_,i)=>i+1).map(d=>{const wd=getWD(year,month,d),dow=new Date(year,month,d).getDay(),isSun=dow===0,isSat=dow===6,we=isSun||isSat,alert=isAlert(d);const hBg=isSun?"#FFF5F5":isSat?"#F5F5FF":"#FAFAFA";return(<th key={d} style={{...TH({}),background:hBg,minWidth:30,width:30,padding:"3px 1px"}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}><span style={{fontSize:10,fontWeight:700,color:isSun?"#DC2626":isSat?"#6366F1":"#52525B"}}>{d}</span><span style={{fontSize:9,color:isSun?"#DC2626":isSat?"#6366F1":"#A1A1AA"}}>{wd}</span><span style={{fontSize:8}}>{alert?<span style={{width:4,height:4,borderRadius:"50%",background:"#EF4444",display:"inline-block"}}/>:"　"}</span></div></th>);})}
            {rightCols.map(col=><th key={col} style={TH({w:28})}><span style={{fontSize:9,color:"#71717A"}}>{col}</span></th>)}
          </tr>
          {onEventEdit&&<tr>
            <th style={{...TH({sticky:true,w:148}),background:"#fffbea",borderBottom:"2px solid #fde68a"}}><span style={{fontSize:10,color:"#92400e",fontWeight:700}}>行事</span></th>
            {Array.from({length:days},(_,i)=>i+1).map(d=>{const ev=(events||{})[d]||"";return(<th key={d} onClick={()=>onEventEdit(d)} title={ev||"クリックして行事を入力"} style={{...TH({}),background:ev?"#fef3c7":"#fffdf0",borderBottom:"2px solid #fde68a",padding:"3px 1px",cursor:"pointer",minWidth:30,width:30,verticalAlign:"top"}}><div style={{writingMode:"vertical-rl",textOrientation:"mixed",fontSize:10,color:"#92400e",fontWeight:700,lineHeight:1.2,margin:"0 auto",minHeight:ev?undefined:16}}>{ev}</div></th>);})}
            <th colSpan={rightColCount} style={{background:"#fffbea",borderBottom:"2px solid #fde68a"}}/>
          </tr>}
        </thead>
        <tbody>
          {ds.map((s,si)=>{
            const sShifts=shifts[s.id]||{}, kibodays=s.kiboByMonth?.[mk]||[], yukyudays=s.yukyuByMonth?.[mk]||[];
            const workCnt=Object.values(sShifts).filter(v=>deptWork.has(v)).length;
            const nightCnt=Object.values(sShifts).filter(v=>v==="夜勤").length;
            const restCnt=Object.values(sShifts).reduce((acc,v)=>deptRest.has(v)&&v!=="明け"&&v!=="有休"?acc+(HALF_REST_TYPES.has(v)?0.5:1):acc,0);
            const nightOver=s.nightOk&&nightCnt>(s.nightMax||5);
            const typeCnts={};
            dept.shiftTypes.forEach(t=>{typeCnts[t]=Object.values(sShifts).filter(v=>v===t).length;});
            if(hasNight)typeCnts["明け"]=Object.values(sShifts).filter(v=>v==="明け").length;
            typeCnts["計"]=workCnt; typeCnts["休"]=restCnt; typeCnts["希"]=kibodays.length;
            return (
              <tr key={s.id} style={{background:si%2===0?"#FFFFFF":"#FAFAFA"}}>
                <td style={{position:"sticky",left:0,zIndex:2,background:si%2===0?"#FFFFFF":"#FAFAFA",padding:"7px 14px",borderRight:"1px solid #F1F5F9",borderBottom:"1px solid #F1F5F9",minWidth:156}}>
                  <div style={{fontWeight:600,fontSize:13,color:"#0F172A",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                    {s.name}
                    {fairnessData[s.id]&&<span
                      style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:fairnessData[s.id].color,flexShrink:0,cursor:"help"}}
                      title={`【公平性】${fairnessData[s.id].tip}`}
                    />}
                  </div>
                  <div style={{fontSize:10,color:"#94A3B8",display:"flex",gap:6,alignItems:"center",marginTop:2}}><span>{s.role}</span>{s.nightOk&&<span style={{color:nightOver?"#DC2626":"#64748B",fontSize:10,fontWeight:nightOver?600:400}}>N{nightCnt}/{s.nightMax}</span>}</div>
                </td>
                {Array.from({length:days},(_,i)=>i+1).map(d=>{
                  const type=sShifts[d]||"", isKibo=kibodays.includes(d)&&!type, isYukyu=yukyudays.includes(d)&&!type&&!isKibo, consecViol=isConsecViolation(sShifts,d);
                  const cellKey=`${s.id}|${d}`, isSelected=selectedCells.has(cellKey);
                  const _ra=dept.roleShiftTypes?.[s.role]; const isRoleViol=_ra&&type&&deptWork.has(type)&&type!=="明け"&&!_ra.includes(type);
                  const cdow=new Date(year,month,d).getDay(); const cellWeekBg=cdow===0?"#FFF5F5":cdow===6?"#F5F5FF":undefined;
                  return <td key={d} style={{padding:"2px 1px",textAlign:"center",borderRight:"1px solid #F1F5F9",borderBottom:"1px solid #F1F5F9",background:isSelected?"#bfdbfe":isRoleViol?"#fecaca":consecViol?"#ffe8e8":isKibo?"#fff5f5":isYukyu?"#faf0ff":cellWeekBg,cursor:"pointer",outline:isSelected?"2px solid #3b82f6":isRoleViol?"2px solid #ef4444":consecViol?"1px solid #e0707060":undefined,outlineOffset:isSelected||isRoleViol?"-1px":undefined}} onMouseDown={(e)=>{if(e.button!==0)return;e.preventDefault();handleCellMouseDown(si,d,e);}} onMouseEnter={()=>handleCellMouseEnter(si,d)} onContextMenu={(e)=>{e.preventDefault();if(isSelected&&selectedCells.size>1){onRightClick(s.id,d,e,selectedCells);}else{setSelAnchor(null);setSelCur(null);onRightClick(s.id,d,e,null);}}} onTouchStart={(e)=>handleCellTouchStart(si,d,e)} onTouchEnd={(e)=>handleCellTouchEnd(si,d,e)}>{isKibo?<span style={{fontSize:9,color:"#BE123C"}}>希</span>:isYukyu?<span style={{fontSize:9,color:"#9b4db5"}}>有</span>:<ShiftBadge type={type} defs={dept.customShiftDefs}/>}{isRoleViol&&<span style={{fontSize:7,color:"#991b1b",display:"block",lineHeight:1}}>制限!</span>}{!isRoleViol&&consecViol&&<span style={{fontSize:7,color:"#c44b4b",display:"block",lineHeight:1}}>連超</span>}</td>;
                })}
                {rightCols.map(col=>{
                  const cnt=typeCnts[col]??0;
                  let color,val;
                  if(col==="計"){val=cnt;color=cnt<(s.targetWork-2)?"#F59E0B":cnt>(s.targetWork+2)?"#EF4444":"#6366F1";}
                  else if(col==="夜勤"){val=cnt||"－";color=nightOver?"#EF4444":"#334155";}
                  else if(col==="明け"){val=cnt||"－";color="#475569";}
                  else if(col==="休"){val=cnt;color="#52525B";}
                  else if(col==="希"){val=cnt||"－";color="#BE123C";}
                  else{const mx=dept.shiftMaxByType?.[col]||0;const over=mx>0&&cnt>mx;val=cnt||"－";const sd=getShiftDef(col,dept.customShiftDefs);color=over?"#ef4444":(sd.color||"#71717A");}
                  return <td key={col} style={TD}><span style={{color,fontWeight:700,fontSize:11}}>{val}</span></td>;
                })}
              </tr>
            );
          })}
          {dept.shiftTypes.map(shKey=>(
            <tr key={shKey} style={{background:"#FAFAFA"}}>
              <td style={{position:"sticky",left:0,zIndex:2,background:"#FAFAFA",padding:"3px 10px",borderRight:"1px solid #F1F5F9",borderBottom:"1px solid #F1F5F9"}}><ShiftBadge type={shKey} defs={dept.customShiftDefs}/></td>
              {Array.from({length:days},(_,i)=>i+1).map(d=>{const cnt=ds.filter(s=>(shifts[s.id]?.[d]||"")===shKey).length,min=dept.minStaff?.[shKey]||0,max=dept.maxStaff?.[shKey]??99;const overMax=max<99&&cnt>max;return<td key={d} style={{textAlign:"center",fontSize:11,fontWeight:800,padding:"3px 0",color:overMax?"#EF4444":cnt===0?"#EF4444":cnt>=min?"#6366F1":"#F59E0B",background:overMax?"#ffe4e4":undefined,borderRight:"1px solid #F1F5F9",borderBottom:"1px solid #F1F5F9"}}>{cnt||"0"}</td>;})}
              <td colSpan={rightColCount}/>
            </tr>
          ))}
          <tr style={{background:"#FFF5F5"}}>
            <td style={{position:"sticky",left:0,zIndex:2,background:"#FFF5F5",padding:"3px 10px",borderRight:"1px solid #F1F5F9",borderBottom:"1px solid #F1F5F9",fontSize:10,color:"#BE123C",fontWeight:700,whiteSpace:"nowrap"}}>希望休</td>
            {Array.from({length:days},(_,i)=>i+1).map(d=>{
              const cnt=ds.reduce((acc,s)=>acc+((s.kiboByMonth?.[mk]||[]).includes(d)?1:0),0);
              const limit=dept.kiboLimit||3;
              const over=cnt>=limit, warn=cnt===limit-1;
              return <td key={d} style={{textAlign:"center",fontSize:11,fontWeight:800,padding:"3px 0",color:over?"#EF4444":warn?"#F59E0B":cnt>0?"#BE123C":"#A1A1AA",background:over?"#ffe4e4":warn?"#fffbeb":undefined,borderRight:"1px solid #F1F5F9",borderBottom:"1px solid #F1F5F9"}}>{over?"⚠":cnt>0?cnt:""}</td>;
            })}
            <td colSpan={rightColCount} style={{borderBottom:"1px solid #F1F5F9"}}/>
          </tr>
        </tbody>
      </table>
    </div>
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
        <thead><tr style={{background:"#F4F4F5"}}><th style={TH({sticky:true,w:148})}><span style={{color:"#3F3F46",fontSize:10}}>スタッフ</span></th>{shownKeys.map(k=><th key={k} style={TH({})}><ShiftBadge type={k}/></th>)}<th style={TH({w:50})}><span style={{fontSize:10,color:"#3F3F46"}}>勤務計</span></th><th style={TH({w:50})}><span style={{fontSize:10,color:"#3F3F46"}}>希望休</span></th></tr></thead>
        <tbody>{ds.map((s,i)=>{const sv=shifts[s.id]||{},cnt={};shownKeys.forEach(k=>{cnt[k]=Object.values(sv).filter(v=>v===k).length;});const work=["早番","日勤","遅番","夜勤","明け"].reduce((a,k)=>a+(cnt[k]||0),0),kiboSel=(s.kiboByMonth?.[mk]||[]).length;return(<tr key={s.id} style={{background:i%2===0?"#ffffff":"#fafeff"}}><td style={{...TD,position:"sticky",left:0,zIndex:1,background:i%2===0?"#ffffff":"#fafeff",padding:"5px 10px",borderRight:"1px solid #D4D4D8"}}><div style={{fontWeight:700,fontSize:12,color:"#18181B"}}>{s.name}</div><div style={{fontSize:10,color:"#3F3F46"}}>{s.role}</div></td>{shownKeys.map(k=><td key={k} style={{...TD,color:cnt[k]>0?SHIFTS[k].color:"#A1A1AA",fontWeight:800,fontSize:13}}>{cnt[k]||"－"}</td>)}<td style={{...TD,color:"#6366F1",fontWeight:800,fontSize:14}}>{work}</td><td style={{...TD,color:"#f87171",fontWeight:700,fontSize:13}}>{kiboSel||"－"}</td></tr>);})}</tbody>
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
        <div style={{fontSize:13,color:"#6366F1",fontWeight:800}}>{dept.icon} {dept.label} — {ds.length}名</div>
        <button onClick={onAdd} style={{background:"linear-gradient(135deg,#6366F1,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:800}}>＋ 追加</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {ds.map((s,i)=>{const mk=monthKey(year,month),kibo=(s.kiboByMonth?.[mk]||[]).length,yukyu=(s.yukyuByMonth?.[mk]||[]).length;return(<div key={s.id} style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,background:`hsl(${(i*53+180)%360},55%,30%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:800}}>{s.name.charAt(0)}</div><div><div style={{fontWeight:800,fontSize:13,color:"#18181B"}}>{s.name}</div><div style={{fontSize:10,color:"#3F3F46",display:"flex",gap:8,flexWrap:"wrap"}}><span>{s.role}</span><span>目標{s.targetWork}日</span><span>休み{s.kyukoDaysByMonth?.[monthKey(year,month)]??s.kyukoDays??8}日</span>{s.nightOk&&<span style={{color:"#c45c35"}}>🌙夜勤×{s.nightMax}回</span>}{kibo>0&&<span style={{color:"#dc2626"}}>希望休{kibo}日</span>}{yukyu>0&&<span style={{color:"#9b4db5"}}>有休{yukyu}日</span>}</div></div></div><div style={{display:"flex",gap:6}}><button onClick={()=>onEdit(s)} style={ICON_BTN("#6366F1")}>✏️</button><button onClick={()=>onDelete(s.id)} style={ICON_BTN("#ef4444")}>🗑</button></div></div>);})}
        {ds.length===0&&<div style={{background:"#FAFAFA",border:"1px dashed #27272A",borderRadius:10,padding:32,textAlign:"center",color:"#A1A1AA",fontSize:13}}>スタッフが登録されていません</div>}
      </div>
    </div>
  );
}

function Legend() {
  const keys = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休"];
  return (
    <div style={{padding:"4px 0",borderBottom:"1px solid #E4E4E7",marginBottom:6,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
      {keys.map(key => {
        const s = SHIFTS[key];
        return (
          <div key={key} title={key} style={{display:"flex",alignItems:"center",gap:3,cursor:"default"}}>
            <ShiftBadge type={key}/>
          </div>
        );
      })}
      <span style={{fontSize:9,color:"#9CA3AF",marginLeft:4}}>左クリック：切替 ／ 右クリック：メニュー</span>
    </div>
  );
}

const MNAV = { background:"#F4F4F5", color:"#18181B", border:"1px solid #E4E4E7", borderRadius:12, width:48, height:48, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center" };

// ─────────────────────────────────────────────
//  YOTEI (職員予定表)
// ─────────────────────────────────────────────
const YOTEI_SHIFT_ORDER = ["明け","早番","日勤","遅番","夜勤","日/休","休/日","早/休","休/遅"];
const YOTEI_SHIFT_COLORS = { 明け:"#9e8d80", 早番:"#c45c35", 日勤:"#3b6eea", 遅番:"#8b5cc4", 夜勤:"#2a7a9a", "日/休":"#3b6eea", "休/日":"#3a9659", "早/休":"#c45c35", "休/遅":"#8b5cc4" };

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
    const hBg=isWE?'#ffe0e6':'#F4F4F5', hColor=isWE?'#c0392b':'#18181B';
    let ri=0, rows='';
    groups.forEach((g, gi)=>{g.staff.forEach((s,si)=>{const bg=ri++%2===0?'#ffffff':'#FAFAFA'; const borderTop=(si===0&&gi>0)?'border-top:2px solid #E4E4E7;':''; rows+=`<tr style="background:${bg};${borderTop}"><td style="color:${g.color};font-weight:bold;font-size:10px;padding:2px 5px;white-space:nowrap;vertical-align:middle;${borderTop}">${si===0?g.st:''}</td><td style="padding:2px 5px;font-size:10px;${borderTop}">${s.name}</td><td style="padding:2px 5px;font-size:10px;color:#4F46E5;font-weight:bold;${borderTop}">${s.assignment}</td></tr>`;});});
    if(!rows)rows=`<tr><td colspan="3" style="color:#E4E4E7;text-align:center;padding:6px;font-size:9px;">勤務なし</td></tr>`;
    if(memo)rows+=`<tr><td colspan="3" style="background:#fffbea;color:#92400e;font-size:9px;padding:3px 5px;border-top:1px dashed #fde68a;">📝 ${memo}</td></tr>`;
    return `<div style="border:1px solid #D4D4D8;border-radius:6px;overflow:hidden;break-inside:avoid;"><div style="background:${hBg};color:${hColor};padding:4px 8px;font-weight:bold;font-size:11px;">${month+1}月${d}日（${wd}）</div><table style="width:100%;border-collapse:collapse;">${rows}</table></div>`;
  });
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>職員予定表 ${year}年${month+1}月 ${dept.label}</title><style>@media print{@page{size:A4 portrait;margin:10mm;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}body{font-family:'Noto Sans JP','ヒラギノ角ゴ ProN',Meiryo,sans-serif;margin:0;padding:10px;}h2{font-size:14px;border-bottom:2px solid #6366F1;padding-bottom:6px;margin:0 0 10px;color:#18181B;}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}</style></head><body><h2>📋 職員予定表　${year}年${month+1}月　${dept.label}</h2><div class="grid">${dayCards.join('')}</div></body></html>`;
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
      staff.forEach((s, i) => { assign[s.id] = floors[(i + d - 1) % floors.length].name; });
    } else {
      staff.forEach(s => { assign[s.id] = rule.assignment; });
    }
  });
  return assign;
}

function FloorSettingsModal({ floorSettings, onSave, onClose }) {
  const [groups, setGroups] = useState(() => (floorSettings.floors||[]).map(f=>f.name));
  const [duties, setDuties] = useState(() => (floorSettings.duties||[{name:"入浴"},{name:"フリー"}]).map(d=>d.name));
  const [rules, setRules] = useState(() => {
    const existing = floorSettings.rules || [];
    return YOTEI_SHIFT_ORDER.map(st => ({ shiftType:st, assignment:(existing.find(x=>x.shiftType===st)?.assignment)||"" }));
  });
  const updateGroup = (i, v) => setGroups(p=>{const n=[...p];n[i]=v;return n;});
  const deleteGroup = (i) => setGroups(p=>p.filter((_,j)=>j!==i));
  const updateDuty = (i, v) => setDuties(p=>{const n=[...p];n[i]=v;return n;});
  const deleteDuty = (i) => setDuties(p=>p.filter((_,j)=>j!==i));
  const setRule = (st, v) => setRules(p=>p.map(r=>r.shiftType===st?{...r,assignment:v}:r));
  const validGroups = groups.filter(n=>n.trim());
  const validDuties = duties.filter(n=>n.trim());
  const assignOptions = [
    {value:"", label:"なし（未設定）"},
    ...(validGroups.length>0?[{value:"auto", label:`⚡ 均等分配（${validGroups.join("・")}）`}]:[]),
    ...validGroups.map(n=>({value:n, label:`📍 ${n}（固定）`})),
    ...validDuties.map(n=>({value:n, label:`🎯 ${n}（固定）`})),
  ];
  const handleSave = () => {
    onSave({floors:validGroups.map(n=>({name:n})), duties:validDuties.map(n=>({name:n})), rules});
    onClose();
  };
  const LS = {fontSize:11,color:"#52525B",fontWeight:700,marginBottom:6,display:"block"};
  const rowStyle = {display:"flex",alignItems:"center",gap:6,marginBottom:7};
  const delBtn = () => ({background:"#fff0f0",border:"1px solid #e07070",borderRadius:6,color:"#c44b4b",cursor:"pointer",padding:"5px 9px",fontSize:13});
  const addBtn = {background:"#6366F1",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800};
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:210,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>⚙️ 予定表 設定</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        <label style={LS}>📍 配置グループ（均等分配用）</label>
        <div style={{fontSize:10,color:"#71717A",marginBottom:8}}>例：1階・2階など。自動配置で均等に振り分けたい場合に設定します。</div>
        <div style={{background:"#F4F4F5",borderRadius:9,padding:"10px 12px",marginBottom:18,border:"1px solid #D4D4D8"}}>
          {groups.map((name,i)=>(
            <div key={i} style={rowStyle}>
              <input value={name} onChange={e=>updateGroup(i,e.target.value)} style={{...INPUT_STYLE,flex:1,marginBottom:0,padding:"6px 10px"}} placeholder={`グループ${i+1}（例：1階）`}/>
              <button onClick={()=>deleteGroup(i)} style={delBtn()}>✕</button>
            </div>
          ))}
          <button onClick={()=>setGroups(p=>[...p,""])} style={addBtn}>＋ グループを追加</button>
        </div>
        <label style={LS}>🎯 役割・業務</label>
        <div style={{fontSize:10,color:"#71717A",marginBottom:8}}>入浴・フリーなどの業務担当を自由に追加できます。</div>
        <div style={{background:"#F4F4F5",borderRadius:9,padding:"10px 12px",marginBottom:18,border:"1px solid #D4D4D8"}}>
          {duties.map((name,i)=>(
            <div key={i} style={rowStyle}>
              <input value={name} onChange={e=>updateDuty(i,e.target.value)} style={{...INPUT_STYLE,flex:1,marginBottom:0,padding:"6px 10px"}} placeholder={`役割${i+1}`}/>
              <button onClick={()=>deleteDuty(i)} style={delBtn()}>✕</button>
            </div>
          ))}
          <button onClick={()=>setDuties(p=>[...p,""])} style={addBtn}>＋ 役割を追加</button>
        </div>
        <label style={LS}>⚡ 自動配置ルール</label>
        <div style={{fontSize:10,color:"#71717A",marginBottom:10}}>「自動配置」ボタンで全日程に一括適用されるルールです。</div>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>
          {rules.map(({shiftType,assignment})=>{
            const sh=SHIFTS[shiftType];
            return(
              <div key={shiftType} style={{display:"flex",alignItems:"center",gap:10,background:"#F4F4F5",borderRadius:8,padding:"8px 12px",border:"1px solid #D4D4D8"}}>
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
          <button onClick={handleSave} style={{flex:1,background:"linear-gradient(135deg,#6366F1,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>保存</button>
          <button onClick={onClose} style={{flex:1,background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

function DayYoteiModal({ day, year, month, dept, staffList, shifts, assignments, floorSettings, onSave, onClose }) {
  const wd = getWD(year, month, day);
  const ds = staffList.filter(s => s.dept === dept.id);
  const workingGroups = YOTEI_SHIFT_ORDER.map(st=>({ st, staff:ds.filter(s=>(shifts[s.id]?.[day]||"")===st) })).filter(g=>g.staff.length>0);
  const floorOptions = ["", ...(floorSettings.floors||[]).map(f=>f.name), ...(floorSettings.duties||[]).map(d=>d.name)];
  const [local, setLocal] = useState(() => ({...assignments}));
  const [memo, setMemo] = useState(() => assignments["_memo"]||"");
  const set = (staffId, val) => setLocal(prev=>({...prev, [staffId]:val}));
  const handleSave = () => onSave({...local, _memo:memo});
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:460,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>{month+1}月{day}日（{wd}）担当配置</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        {workingGroups.length===0&&<div style={{color:"#A1A1AA",fontSize:13,textAlign:"center",padding:"16px 0"}}>この日の勤務者がいません</div>}
        {workingGroups.map(({st,staff})=>{
          const sh=SHIFTS[st];
          return(
            <div key={st} style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><ShiftBadge type={st}/><span style={{fontSize:11,color:sh.color,fontWeight:700}}>{st}</span></div>
              {staff.map(s=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,background:"#F4F4F5",borderRadius:8,padding:"8px 12px"}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#18181B",flex:1}}>{s.name}</span>
                  <select value={local[s.id]||""} onChange={e=>set(s.id,e.target.value)} style={{...INPUT_STYLE,width:120,marginBottom:0,padding:"5px 8px"}}>
                    {floorOptions.map(opt=><option key={opt} value={opt}>{opt||"（未設定）"}</option>)}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
        <div style={{marginTop:14}}>
          <div style={{fontSize:11,color:"#52525B",marginBottom:5,fontWeight:700}}>📝 メモ・追加記入</div>
          <textarea value={memo} onChange={e=>setMemo(e.target.value)}
            placeholder="例）午後から外部研修あり、浴室清掃担当あり"
            style={{...INPUT_STYLE,minHeight:56,resize:"vertical",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={handleSave} style={{flex:1,background:"linear-gradient(135deg,#6366F1,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>保存</button>
          <button onClick={onClose} style={{flex:1,background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button>
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
    printWithIframe(html);
  };
  const handleDownloadYotei = () => {
    const html = buildYoteiHTML(dept,staffList,shifts,year,month,yoteiDeptData,floorSettings);
    triggerDownload(html, `予定表_${dept.label}_${year}年${month+1}月.html`, 'text/html;charset=utf-8');
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

  const handleClearAssign = () => {
    if(!window.confirm(`${month+1}月の全配置をクリアします。\nシフト・メモは保持されます。\nよろしいですか？`))return;
    const dayMap = {};
    for(let d=1;d<=days;d++){
      const existing = getDayAssignments(d);
      const cleared = {};
      Object.keys(existing).forEach(k=>{ if(k==="memo") cleared[k]=existing[k]; });
      dayMap[String(d)] = cleared;
    }
    onBatchUpdateYotei(dayMap);
  };

  return (
    <div style={{maxWidth:960}}>
      {/* ツールバー */}
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:800,color:"#6366F1",whiteSpace:"nowrap"}}>🏠 フロア</span>
        {(floorSettings.duties||[]).map((d,i)=><span key={i} style={{background:"#F4F4F5",borderRadius:6,padding:"3px 9px",fontSize:11,color:"#18181B",fontWeight:700}}>{d.name}</span>)}
        <button onClick={()=>setSettingsOpen(true)} style={{background:"#6366F1",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>⚙️ 設定</button>
        <button onClick={handleAutoAssign} style={{background:"linear-gradient(135deg,#f5b942,#e07b30)",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>⚡ 自動配置</button>
        <button onClick={handleClearAssign} style={{background:"#fff0f0",color:"#c44b4b",border:"1px solid #e07070",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>🗑 配置クリア</button>
        <button onClick={handlePrint} style={{marginLeft:"auto",background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>🖨️ 印刷</button>
        <button onClick={handleDownloadYotei} style={{background:"#ffffff",color:"#6366F1",border:"1px solid #D4D4D8",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>📥 USB保存</button>
      </div>
      {/* 月カレンダー */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:7}}>
        {Array.from({length:days},(_,i)=>i+1).map(d=>{
          const wd=getWD(year,month,d), we=isWE(year,month,d);
          const assign=getDayAssignments(d);
          const assignedCnt=Object.keys(assign).filter(k=>k!=="_memo"&&assign[k]).length;
          const memo=assign["_memo"]||"";
          const workCount=YOTEI_SHIFT_ORDER.reduce((acc,st)=>acc+ds.filter(s=>(shifts[s.id]?.[d]||"")===st).length,0);
          return(
            <div key={d} onClick={()=>setEditDay(d)} style={{background:"#ffffff",border:`1px solid ${we?"#fca5a5":"#D4D4D8"}`,borderRadius:9,padding:"8px 10px",cursor:"pointer",boxShadow:"0 1px 4px #0001"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:13,fontWeight:800,color:we?"#e53e3e":"#18181B"}}>{d}<span style={{fontSize:10,marginLeft:3,fontWeight:400,color:we?"#e53e3e":"#52525B"}}>({wd})</span></span>
                <div style={{display:"flex",gap:3,alignItems:"center"}}>
                  {assignedCnt>0&&<span style={{fontSize:9,background:"#F4F4F5",color:"#6366F1",borderRadius:8,padding:"1px 5px",fontWeight:700}}>{assignedCnt}</span>}
                  {memo&&<span style={{fontSize:9}}>📝</span>}
                </div>
              </div>
              {YOTEI_SHIFT_ORDER.map(st=>{
                const group=ds.filter(s=>(shifts[s.id]?.[d]||"")===st);
                if(group.length===0)return null;
                const sh=SHIFTS[st];
                return(
                  <div key={st} style={{display:"flex",alignItems:"flex-start",gap:3,marginBottom:2}}>
                    <span style={{fontSize:10,fontWeight:800,color:sh.color,minWidth:22,textAlign:"center",background:sh.bg,borderRadius:2,flexShrink:0,lineHeight:"18px",padding:"0 2px"}}>{sh.short}</span>
                    <div style={{fontSize:11,color:"#3F3F46",lineHeight:1.6,display:"flex",flexWrap:"wrap",gap:"2px 4px"}}>
                      {group.map(s=>{const a=assign[s.id],nm=s.name.replace(/\s/g,"");return<span key={s.id}>{nm}{a&&<span style={{color:"#4F46E5",fontWeight:700}}>({a.slice(0,4)})</span>}</span>;})}
                    </div>
                  </div>
                );
              })}
              {workCount===0&&<div style={{fontSize:10,color:"#E4E4E7",textAlign:"center",paddingTop:4}}>勤務なし</div>}
              {memo&&<div style={{fontSize:10,color:"#92400e",background:"#fffbea",borderRadius:3,padding:"2px 4px",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{memo.slice(0,20)}{memo.length>20?"…":""}</div>}
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
//  スタッフポータル
// ─────────────────────────────────────────────
function StaffKiboCalendar({ year, month, myDays, otherCounts, kiboLimit, onChange, type = 'kibo', disabledDays = [] }) {
  const isYukyu = type === 'yukyu';
  const activeColor = isYukyu ? '#9b4db5' : '#ef4444';
  const activeBg = isYukyu ? '#faf0ff' : '#fff0f0';
  const activeBorder = isYukyu ? '#c07ad5' : '#ef4444';
  const badgeLabel = isYukyu ? '有休' : '希休';

  const days = getDays(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const lim = kiboLimit || 3;

  const toggle = (d) => {
    if (!d) return;
    if (disabledDays.includes(d)) return;
    if (!isYukyu) {
      const cnt = otherCounts?.[d] || 0;
      if (!myDays.includes(d) && cnt >= lim) return;
    }
    onChange(myDays.includes(d) ? myDays.filter(x => x !== d) : [...myDays, d]);
  };

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4}}>
        {["日","月","火","水","木","金","土"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:11,color:i===0?"#f87171":i===6?"#6366F1":"#52525B",padding:"3px 0",fontWeight:700}}>{w}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const isMe = myDays.includes(d);
          const isDisabled = disabledDays.includes(d) && !isMe;
          const cnt = (!isYukyu && otherCounts?.[d]) || 0;
          const over = !isYukyu && cnt >= lim;
          const warn = !isYukyu && cnt === lim - 1;
          const dow = (firstDow+d-1)%7, we = dow===0||dow===6;
          const blocked = isDisabled || (!isMe && over);
          return (
            <button key={d} onClick={()=>toggle(d)} disabled={blocked}
              style={{background:isMe?activeBg:blocked?"#f5f5f5":"transparent",border:isMe?`2px solid ${activeBorder}`:blocked?"1px solid #e5e5e5":"1px solid #27272A",borderRadius:6,padding:"4px 2px",cursor:blocked?"not-allowed":"pointer",color:isMe?activeColor:blocked?"#aaa":we?"#6366F1":"#18181B",fontSize:11,fontWeight:isMe?800:400,display:"flex",flexDirection:"column",alignItems:"center",gap:1,minHeight:38,position:"relative",opacity:blocked?0.5:1}}>
              {over&&!isMe&&<span style={{position:"absolute",top:1,right:2,fontSize:8,color:"#ef4444"}}>⚠</span>}
              {!over&&warn&&<span style={{position:"absolute",top:1,right:2,fontSize:8,color:"#f59e0b"}}>!</span>}
              <span style={{fontSize:12}}>{d}</span>
              {isMe&&<span style={{fontSize:8,lineHeight:1,color:activeColor}}>{badgeLabel}</span>}
              {!isYukyu&&cnt>0&&<span style={{fontSize:8,lineHeight:1,color:over?"#ef4444":warn?"#f59e0b":"#c44b4b"}}>{cnt}人</span>}
              {!isMe&&!blocked&&(!cnt||isYukyu)&&<span style={{fontSize:8,lineHeight:1,color:"#b0d8d5"}}>○</span>}
            </button>
          );
        })}
      </div>
      {isYukyu ? (
        <div style={{marginTop:8,fontSize:11,color:"#52525B"}}>
          <span style={{color:"#9b4db5",fontWeight:700}}>■</span> 自分の有休
          <span style={{marginLeft:12,color:"#6b7280"}}>※ 人数上限なし・自由に選択可</span>
        </div>
      ) : (
        <div style={{marginTop:8,fontSize:11,color:"#52525B"}}>
          <span style={{color:"#ef4444",fontWeight:700}}>■</span> 自分の希望休
          <span style={{marginLeft:12,color:"#c44b4b"}}>数字</span> = 他のスタッフの人数
          <span style={{marginLeft:12,color:"#9ca3af"}}>■</span> 上限到達（選択不可）
        </div>
      )}
    </div>
  );
}

function StaffPortal({ adminUserId, fixedDeptId, cfgPreload }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selDeptId, setSelDeptId] = useState(fixedDeptId || null);
  const [selStaffId, setSelStaffId] = useState(null);
  const [myDays, setMyDays] = useState([]);
  const [myYukyuDays, setMyYukyuDays] = useState([]);
  const [otherCounts, setOtherCounts] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [kiboLoading, setKiboLoading] = useState(false);

  const loadConfig = async () => {
    // URLにcfgデータが埋め込まれていれば即座に使う（Supabase不要・確実）
    if (cfgPreload) {
      try {
        const json = decodeURIComponent(escape(atob(cfgPreload)));
        const c = JSON.parse(json);
        const cfg = {
          facility_name: c.fn || '',
          depts: [{ id: c.d.id, label: c.d.label, icon: c.d.icon, kiboLimit: c.d.kb || 3, deadline: c.d.dl || null, targetYear: c.d.ty || null, targetMonth: c.d.tm || null }],
          staffList: (c.sl || []).map(s => ({ id: s.i ? shortToUuid(s.i) : s.id, name: s.n || s.name, dept: c.d.id }))
        };
        setConfig(cfg);
        setLoading(false);
        if (!fixedDeptId) setSelDeptId(c.d.id);
        return;
      } catch (e) {
        console.warn('[StaffPortal] cfgPreload decode failed:', e);
      }
    }
    // フォールバック: Supabaseから読む（最大4回リトライ）
    setLoading(true); setLoadError(false); setConfig(null);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      const { data, error } = await supabase
        .from('shift_data')
        .select('data_value')
        .eq('user_id', adminUserId)
        .eq('data_key', 'facilityConfig')
        .maybeSingle();
      if (!error && data?.data_value) {
        const cfg = data.data_value;
        setConfig(cfg);
        setLoading(false);
        if (!fixedDeptId && cfg.depts?.length > 0) setSelDeptId(cfg.depts[0].id);
        return;
      }
      console.warn('[StaffPortal] loadConfig attempt', attempt + 1, 'failed:', error?.message || 'no data');
    }
    setLoading(false);
    setLoadError(true);
  };

  useEffect(() => { loadConfig(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 対象月を設定: targetYear/targetMonth が優先、なければ従来の締切日フォールバック
  useEffect(() => {
    if (!config) return;
    const dept = config.depts?.find(d => d.id === (fixedDeptId || config.depts?.[0]?.id));
    if (!dept) return;
    if (dept.targetYear && dept.targetMonth) {
      setYear(dept.targetYear);
      setMonth(dept.targetMonth - 1);
      return;
    }
    // フォールバック: 対象月未設定の場合は締切日の月を使用（既存互換）
    if (!dept.deadline) return;
    const [dy, dm] = dept.deadline.split('-').map(Number);
    if (!isNaN(dy) && !isNaN(dm)) { setYear(dy); setMonth(dm - 1); }
  }, [config, fixedDeptId]);

  const mk = monthKey(year, month);
  const selDept = config?.depts?.find(d => d.id === selDeptId);
  const deptStaff = (config?.staffList || []).filter(s => s.dept === selDeptId);
  const selStaff = deptStaff.find(s => s.id === selStaffId);
  const lim = selDept?.kiboLimit || 3;

  // 締め切りチェック・月固定
  const isPastDeadline = selDept?.deadline ? new Date() > new Date(selDept.deadline + 'T23:59:59') : false;
  const isMonthLocked = !!(selDept?.deadline || (selDept?.targetYear && selDept?.targetMonth));

  useEffect(() => {
    if (!selStaffId || !selDeptId) return;
    setKiboLoading(true);
    setSubmitted(false);
    supabase.from('staff_kibo').select('*')
      .eq('admin_user_id', adminUserId).eq('dept_id', selDeptId).eq('month_key', mk)
      .then(({ data }) => {
        setKiboLoading(false);
        if (!data) return;
        const mine = data.find(k => k.staff_id === selStaffId);
        setMyDays(mine?.days || []);
        setMyYukyuDays(mine?.yukyu_days || []);
        const counts = {};
        data.filter(k => k.staff_id !== selStaffId).forEach(k => {
          (k.days||[]).forEach(d => { counts[d] = (counts[d]||0) + 1; });
        });
        setOtherCounts(counts);
      })
      .catch(() => { setKiboLoading(false); });
  }, [selStaffId, selDeptId, mk, adminUserId]);

  const handleSubmit = async () => {
    if (!selStaff || !selDept) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { data: latest } = await supabase.from('staff_kibo')
        .select('staff_id,days')
        .eq('admin_user_id', adminUserId).eq('dept_id', selDeptId).eq('month_key', mk);
      const overDays = myDays.filter(d =>
        (latest || []).filter(k => k.staff_id !== selStaffId && (k.days||[]).includes(d)).length >= lim
      );
      if (overDays.length > 0) {
        alert(`${overDays.sort((a,b)=>a-b).join('日・')}日は希望休の上限に達しました。別の日を選んでください。`);
        return;
      }
      const { error } = await supabase.from('staff_kibo').upsert({
        admin_user_id: adminUserId, dept_id: selDeptId, staff_id: selStaffId,
        month_key: mk, days: myDays, yukyu_days: myYukyuDays, updated_at: new Date().toISOString()
      }, { onConflict: 'admin_user_id,dept_id,staff_id,month_key' });
      if (!error) setSubmitted(true);
      else alert('送信に失敗しました。もう一度お試しください。');
    } catch {
      alert('送信に失敗しました。ネットワークを確認してください。');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const prevMonth = () => { if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); setSubmitted(false); };
  const nextMonth = () => { if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); setSubmitted(false); };

  const BASE = { minHeight:"100vh", background:"linear-gradient(135deg,#FAFAFA,#F4F4F5)", fontFamily:"'Noto Sans JP',sans-serif", padding:16 };

  if (loading) return (
    <div style={{...BASE,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <ShifuponIcon size={48} radius={12}/>
        <div style={{color:"#71717A",fontSize:13,marginTop:12}}>読み込み中…</div>
      </div>
    </div>
  );

  if (loadError) return (
    <div style={{...BASE,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",color:"#ef4444"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:14,fontWeight:700}}>施設情報を読み込めませんでした</div>
        <div style={{fontSize:12,color:"#6b7280",marginTop:8}}>URLが正しいか確認してください</div>
        <button onClick={loadConfig} style={{marginTop:16,background:"#6366F1",color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          🔄 再読込
        </button>
      </div>
    </div>
  );

  return (
    <div style={BASE}>
      {/* ヘッダー */}
      <div style={{background:"#fff",borderRadius:14,padding:"12px 16px",marginBottom:16,boxShadow:"0 2px 12px #27272A20",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <ShifuponIcon size={36} radius={8}/>
          <div>
            <div style={{fontSize:13,fontWeight:900,color:"#18181B"}}>{config.facility_name || "しふぽん"}</div>
            <div style={{fontSize:10,color:"#52525B"}}>希望休・有休 入力ポータル</div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {!isMonthLocked&&<button onClick={prevMonth} style={{background:"none",border:"none",fontSize:18,color:"#6366F1",cursor:"pointer"}}>◀</button>}
            <span style={{fontSize:13,fontWeight:800,color:"#18181B"}}>{year}年{month+1}月の希望休入力</span>
            {!isMonthLocked&&<button onClick={nextMonth} style={{background:"none",border:"none",fontSize:18,color:"#6366F1",cursor:"pointer"}}>▶</button>}
          </div>
          {selDept?.deadline&&<div style={{fontSize:10,color:"#6B7280"}}>締切：{selDept.deadline.replace(/-/g,'/')}</div>}
        </div>
      </div>

      {/* 部署選択（fixedDeptIdがない場合のみ表示） */}
      {!fixedDeptId && (
        <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 6px #27272A15"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#52525B",marginBottom:10}}>▍ 部署を選んでください</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {(config.depts||[]).map(d=>(
              <button key={d.id} onClick={()=>{setSelDeptId(d.id);setSelStaffId(null);setMyDays([]);setMyYukyuDays([]);setSubmitted(false);}}
                style={{background:selDeptId===d.id?"#6366F1":"#F4F4F5",color:selDeptId===d.id?"#fff":"#18181B",border:"none",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:selDeptId===d.id?800:400}}>
                {d.icon} {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 固定部署の場合は部署名をヘッダーに表示 */}
      {fixedDeptId && selDept && (
        <div style={{background:"#6366F1",borderRadius:12,padding:"10px 16px",marginBottom:12,textAlign:"center"}}>
          <span style={{color:"#fff",fontWeight:900,fontSize:14}}>{selDept.icon} {selDept.label}</span>
        </div>
      )}

      {/* スタッフ選択 */}
      {selDeptId && (
        <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 6px #27272A15"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#52525B",marginBottom:10}}>▍ 自分の名前を選んでください</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {deptStaff.length===0&&<div style={{fontSize:12,color:"#9ca3af"}}>スタッフが見つかりません。管理者がスタッフを登録後、<button onClick={loadConfig} style={{background:"none",border:"none",color:"#6366F1",cursor:"pointer",fontWeight:700,fontSize:12,padding:0,textDecoration:"underline"}}>再読込</button>してください。</div>}
            {deptStaff.map(s=>(
              <button key={s.id} onClick={()=>{setSelStaffId(s.id);setMyDays([]);setMyYukyuDays([]);setSubmitted(false);}}
                style={{background:selStaffId===s.id?"linear-gradient(135deg,#6366F1,#7C3AED)":"#F4F4F5",color:selStaffId===s.id?"#fff":"#18181B",border:"none",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:selStaffId===s.id?800:400}}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 締め切り超過メッセージ */}
      {isPastDeadline && (
        <div style={{background:"#fff5f5",border:"2px solid #ef4444",borderRadius:12,padding:20,textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:28,marginBottom:6}}>🔒</div>
          <div style={{fontSize:15,fontWeight:900,color:"#ef4444",marginBottom:4}}>受付を終了しました</div>
          <div style={{fontSize:12,color:"#6b7280"}}>締め切り日（{selDept?.deadline}）を過ぎています。<br/>管理者にお問い合わせください。</div>
        </div>
      )}

      {/* カレンダー */}
      {selStaff && !submitted && !isPastDeadline && (
        <>
          {/* 希望休 */}
          <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 6px #27272A15"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#52525B",marginBottom:4}}>▍ {selStaff.name}さんの希望休（{year}年{month+1}月）</div>
            <div style={{fontSize:10,color:"#c44b4b",marginBottom:10}}>※ 同じ日は上限{lim}名まで。上限に達した日は選択できません。</div>
            {kiboLoading ? (
              <div style={{textAlign:"center",color:"#71717A",padding:20}}>読み込み中…</div>
            ) : (
              <StaffKiboCalendar year={year} month={month} myDays={myDays} otherCounts={otherCounts} kiboLimit={lim} onChange={setMyDays} type="kibo" disabledDays={myYukyuDays}/>
            )}
            <div style={{marginTop:10,fontSize:12,color:"#ef4444",fontWeight:700}}>選択中: {myDays.length}日</div>
          </div>

          {/* 有休 */}
          <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 6px #27272A15",border:"1px solid #e8d5f5"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#9b4db5",marginBottom:4}}>▍ {selStaff.name}さんの有休（{year}年{month+1}月）</div>
            <div style={{fontSize:10,color:"#9b4db5",marginBottom:10}}>※ 有休取得希望日を選んでください。人数制限はありません。</div>
            {kiboLoading ? (
              <div style={{textAlign:"center",color:"#71717A",padding:20}}>読み込み中…</div>
            ) : (
              <StaffKiboCalendar year={year} month={month} myDays={myYukyuDays} otherCounts={{}} kiboLimit={99} onChange={setMyYukyuDays} type="yukyu" disabledDays={myDays}/>
            )}
            <div style={{marginTop:10,fontSize:12,color:"#9b4db5",fontWeight:700}}>選択中: {myYukyuDays.length}日</div>
          </div>

          {/* 送信ボタン */}
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            <button onClick={handleSubmit} disabled={submitting}
              style={{background:submitting?"#F4F4F5":"#6366F1",color:submitting?"#3F3F46":"#fff",border:"none",borderRadius:10,padding:"12px 28px",cursor:submitting?"not-allowed":"pointer",fontSize:14,fontWeight:800}}>
              {submitting?"送信中…":"✅ 送信する"}
            </button>
          </div>
        </>
      )}

      {/* 送信完了 */}
      {submitted && (
        <div style={{background:"#f0fff4",border:"2px solid #86efac",borderRadius:12,padding:24,textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:36,marginBottom:8}}>✅</div>
          <div style={{fontSize:16,fontWeight:900,color:"#16a34a",marginBottom:4}}>送信しました！</div>
          {myDays.length > 0 && (
            <div style={{fontSize:12,color:"#c44b4b",marginBottom:4}}>希望休：{myDays.sort((a,b)=>a-b).join("日・")}日</div>
          )}
          {myYukyuDays.length > 0 && (
            <div style={{fontSize:12,color:"#9b4db5",marginBottom:4}}>有休：{myYukyuDays.sort((a,b)=>a-b).join("日・")}日</div>
          )}
          {myDays.length === 0 && myYukyuDays.length === 0 && (
            <div style={{fontSize:12,color:"#52525B",marginBottom:4}}>{year}年{month+1}月の申請を送信しました。</div>
          )}
          <div style={{fontSize:11,color:"#6b7280",margin:"8px 0 16px"}}>管理者に自動で反映されます。</div>
          <button onClick={()=>setSubmitted(false)} style={{background:"#F4F4F5",color:"#18181B",border:"none",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontSize:12,fontWeight:700}}>✏️ 修正する</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  APP（メイン）
// ─────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{minHeight:"100vh",background:"#fff0f0",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"sans-serif",padding:24}}>
        <div style={{background:"#fff",border:"2px solid #ef4444",borderRadius:12,padding:24,maxWidth:500,width:"100%"}}>
          <div style={{fontSize:32,marginBottom:8}}>⚠️</div>
          <div style={{fontSize:16,fontWeight:700,color:"#dc2626",marginBottom:8}}>エラーが発生しました</div>
          <div style={{fontSize:12,color:"#374151",marginBottom:16}}>以下のエラー内容を開発者にお伝えください：</div>
          <pre style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:6,padding:12,fontSize:11,color:"#991b1b",overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button onClick={()=>window.location.reload()} style={{marginTop:16,background:"#dc2626",color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",cursor:"pointer",fontSize:13,fontWeight:700}}>
            🔄 ページを再読み込み
          </button>
        </div>
      </div>
    );
  }
}

// ─────────────────────────────────────────────
//  勤務実績: ユーティリティ
// ─────────────────────────────────────────────
function calcWorkMinutes(start, end, breakMin = 60) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(eh)) return 0;
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60;
  return Math.max(0, endMins - startMins - (breakMin || 0));
}
function fmtH(mins) {
  if (!mins && mins !== 0) return "-";
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
async function buildJissekiXLSX(staffList, allJisseki, allShifts, year, month, deptId) {
  const XLSX = await import("xlsx-js-style");
  const days = getDays(year, month);
  const deptStaff = staffList.filter(s => s.dept === deptId);
  const aoa = [["スタッフ名","日付","曜日","予定シフト","実績シフト","出勤時刻","退勤時刻","休憩(分)","実労働時間","備考"]];
  const totalRowIdxs = [];
  for (const s of deptStaff) {
    for (let d = 1; d <= days; d++) {
      const planned = allShifts[deptId]?.[s.id]?.[d] || "";
      const rec = allJisseki[deptId]?.[s.id]?.[d];
      if (!planned && !rec) continue;
      const dow = ["日","月","火","水","木","金","土"][new Date(year, month, d).getDay()];
      const dateStr = `${year}/${String(month+1).padStart(2,"0")}/${String(d).padStart(2,"0")}`;
      const mins = rec ? calcWorkMinutes(rec.start, rec.end, rec.breakMin) : 0;
      aoa.push([s.name, dateStr, dow, planned, rec?.actualShift||planned, rec?.start||"", rec?.end||"", rec?.breakMin??0, rec?fmtH(mins):"", rec?.note||""]);
    }
    let total = 0;
    for (let d = 1; d <= days; d++) { const r = allJisseki[deptId]?.[s.id]?.[d]; if (r) total += calcWorkMinutes(r.start, r.end, r.breakMin); }
    totalRowIdxs.push(aoa.length);
    aoa.push([s.name, `${year}/${String(month+1).padStart(2,"0")} 合計`, "", "", "", "", "", "", fmtH(total), ""]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // スタイル定義
  const grayBorder = {style:"thin", color:{rgb:"BBBBBB"}};
  const blueBorder = {style:"medium", color:{rgb:"4472C4"}};
  const greenBorder = {style:"medium", color:{rgb:"70AD47"}};
  const hStyle = { fill:{fgColor:{rgb:"D9E1F2"}}, font:{bold:true,sz:10}, border:{top:grayBorder,bottom:blueBorder,left:grayBorder,right:grayBorder}, alignment:{horizontal:"center"} };
  const dStyle = { font:{sz:10}, border:{top:grayBorder,bottom:grayBorder,left:grayBorder,right:grayBorder}, alignment:{horizontal:"center"} };
  const tStyle = { fill:{fgColor:{rgb:"E2EFDA"}}, font:{bold:true,sz:10}, border:{top:grayBorder,bottom:greenBorder,left:grayBorder,right:grayBorder}, alignment:{horizontal:"center"} };
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({r, c});
      if (!ws[addr]) ws[addr] = {t:"s", v:""};
      ws[addr].s = r === 0 ? hStyle : totalRowIdxs.includes(r) ? tStyle : dStyle;
    }
  }
  ws["!cols"] = [{wch:14},{wch:12},{wch:5},{wch:10},{wch:10},{wch:10},{wch:10},{wch:8},{wch:10},{wch:18}];
  ws["!freeze"] = {xSplit:0, ySplit:1};
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "実績");
  return XLSX.write(wb, {bookType:"xlsx", type:"array"});
}

function buildJissekiCSV(staffList, allJisseki, allShifts, year, month, deptId) {
  const days = getDays(year, month);
  const deptStaff = staffList.filter(s => s.dept === deptId);
  const rows = [["スタッフ名","日付","曜日","予定シフト","実績シフト","出勤時刻","退勤時刻","休憩(分)","実労働時間","備考"]];
  for (const s of deptStaff) {
    for (let d = 1; d <= days; d++) {
      const planned = allShifts[deptId]?.[s.id]?.[d] || "";
      const rec = allJisseki[deptId]?.[s.id]?.[d];
      if (!planned && !rec) continue;
      const dow = ["日","月","火","水","木","金","土"][new Date(year, month, d).getDay()];
      const mins = rec ? calcWorkMinutes(rec.start, rec.end, rec.breakMin) : 0;
      rows.push([s.name, `${year}/${String(month+1).padStart(2,"0")}/${String(d).padStart(2,"0")}`, dow, planned, rec?.actualShift||planned, rec?.start||"", rec?.end||"", rec?.breakMin??0, rec?fmtH(mins):"", rec?.note||""]);
    }
    let total = 0;
    for (let d = 1; d <= days; d++) { const rec = allJisseki[deptId]?.[s.id]?.[d]; if (rec) total += calcWorkMinutes(rec.start, rec.end, rec.breakMin); }
    rows.push([s.name, `${year}/${String(month+1).padStart(2,"0")} 合計`, "", "", "", "", "", "", fmtH(total), ""]);
  }
  return "﻿" + rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
}

// ─────────────────────────────────────────────
//  勤務実績: 入力モーダル
// ─────────────────────────────────────────────
function JissekiInputModal({ staffName, day, year, month, plannedShift, record, deptShiftTypes, onSave, onClear, onClose }) {
  const defaults = SHIFT_DEFAULT_TIMES[plannedShift] || { start: "", end: "", breakMin: 60 };
  const [start, setStart] = useState(record?.start ?? defaults.start);
  const [end, setEnd] = useState(record?.end ?? defaults.end);
  const [breakMin, setBreakMin] = useState(record?.breakMin ?? defaults.breakMin);
  const [actualShift, setActualShift] = useState(record?.actualShift || plannedShift || "日勤");
  const [note, setNote] = useState(record?.note || "");
  const [kp, setKp] = useState(null);
  const workMins = calcWorkMinutes(start, end, +breakMin || 0);
  const plannedMins = calcWorkMinutes(defaults.start, defaults.end, defaults.breakMin ?? 60);
  const overtimeMins = (start && end && plannedMins > 0) ? Math.max(0, workMins - plannedMins) : 0;
  const dow = ["日","月","火","水","木","金","土"][new Date(year, month, day).getDay()];
  const TS = { width:"100%", border:"1.5px solid #D4D4D8", borderRadius:8, padding:"9px 12px", fontSize:14, fontFamily:"'Noto Sans JP',sans-serif", outline:"none", background:"#fff", boxSizing:"border-box" };
  const allTypes = [...(deptShiftTypes||["早番","日勤","遅番","夜勤"]), "明け", "休み", "有休"].filter((v,i,a)=>a.indexOf(v)===i);
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:380,boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>📋 実績入力</div>
            <div style={{fontSize:12,color:"#52525B",marginTop:2}}>{staffName} — {month+1}月{day}日（{dow}）</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        {plannedShift && <div style={{background:"#F4F4F5",borderRadius:8,padding:"6px 12px",marginBottom:14,fontSize:12,color:"#3F3F46"}}>予定シフト：<strong>{plannedShift}</strong></div>}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"#52525B",marginBottom:4,fontWeight:700}}>実績シフト</div>
          <select value={actualShift} onChange={e=>setActualShift(e.target.value)} style={TS}>
            {allTypes.map(k=><option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:"#52525B",marginBottom:4,fontWeight:700}}>出勤時刻</div>
            <input type="time" value={start} onChange={e=>setStart(e.target.value)} style={TS}/>
          </div>
          <div>
            <div style={{fontSize:11,color:"#52525B",marginBottom:4,fontWeight:700}}>退勤時刻</div>
            <input type="time" value={end} onChange={e=>setEnd(e.target.value)} style={TS}/>
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"#52525B",marginBottom:4,fontWeight:700}}>休憩時間（分）</div>
          <div onClick={e=>setKp({value:breakMin,min:0,max:180,unit:"分",onConfirm:v=>setBreakMin(v===""?0:+v),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...TS,cursor:"pointer",userSelect:"none",fontWeight:700,textAlign:"center"}}>{breakMin}分</div>
        </div>
        {start&&end&&<div style={{background:"#F4F4F5",borderRadius:8,padding:"10px 14px",marginBottom:14,textAlign:"center"}}>
          <span style={{fontSize:12,color:"#3F3F46"}}>実労働時間 </span>
          <span style={{fontSize:20,fontWeight:900,color:"#4F46E5"}}>{fmtH(workMins)}</span>
          {overtimeMins>0&&<span style={{fontSize:12,color:"#c2410c",marginLeft:8,fontWeight:700}}>（うち残業 {fmtH(overtimeMins)}）</span>}
        </div>}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:"#52525B",marginBottom:4,fontWeight:700}}>備考</div>
          <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="例：残業あり" style={TS}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onSave({start,end,breakMin:+breakMin||0,actualShift,note})} style={{flex:2,background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>💾 保存</button>
          {record&&<button onClick={onClear} style={{flex:1,background:"#fff0f0",border:"1px solid #e07070",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:12,color:"#c44b4b",fontWeight:700}}>🗑 削除</button>}
          <button onClick={onClose} style={{flex:1,background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:13}}>戻る</button>
        </div>
        {kp&&<NumericKeypad mode={kp.mode} value={kp.value} min={kp.min} max={kp.max} unit={kp.unit} anchorRect={kp.anchorRect} onConfirm={v=>{kp.onConfirm(v);setKp(null);}} onClose={()=>setKp(null)}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  勤務実績: デフォルト時刻編集モーダル
// ─────────────────────────────────────────────
function JissekiDefaultsModal({ dept, defaults, onSave, onClose }) {
  const shiftTypes = [...(dept?.shiftTypes || ["早番","日勤","遅番","夜勤"]), "明け"].filter((v,i,a)=>a.indexOf(v)===i);
  const [form, setForm] = useState(() => {
    const f = {};
    for (const st of shiftTypes) {
      const base = SHIFT_DEFAULT_TIMES[st] || {start:"",end:"",breakMin:60};
      f[st] = {...base, ...(defaults?.[st]||{})};
    }
    return f;
  });
  const upd = (st, field, val) => setForm(p => ({...p, [st]:{...p[st],[field]:val}}));
  const TS = {border:"1.5px solid #D4D4D8",borderRadius:6,padding:"5px 8px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",width:"100%",boxSizing:"border-box"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,padding:24,width:440,maxWidth:"95vw",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:800,fontSize:16,color:"#18181B",marginBottom:6}}>⏰ シフト別デフォルト時刻</div>
        <div style={{fontSize:12,color:"#52525B",marginBottom:16}}>「全予定を一括コピー」時に使うデフォルトの出退勤時刻を設定します。</div>
        {shiftTypes.map(st=>(
          <div key={st} style={{marginBottom:12,background:"#FAFAFA",borderRadius:8,padding:"10px 14px"}}>
            <div style={{fontWeight:700,color:"#18181B",marginBottom:8,fontSize:13}}>{st}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[["出勤","start","time"],["退勤","end","time"],["休憩(分)","breakMin","number"]].map(([label,field,type])=>(
                <div key={field}>
                  <div style={{fontSize:11,color:"#52525B",marginBottom:3}}>{label}</div>
                  <input type={type} value={form[st]?.[field]??""} min={type==="number"?0:undefined} max={type==="number"?240:undefined}
                    onChange={e=>upd(st,field,type==="number"?+e.target.value:e.target.value)} style={TS}/>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={()=>onSave(form)} style={{flex:2,background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontWeight:700,fontSize:14}}>💾 保存</button>
          <button onClick={onClose} style={{flex:1,background:"#f0f0f0",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:13}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  勤務実績: 一覧・集計ビュー
// ─────────────────────────────────────────────
function JissekiView({ staffList, allJisseki, allShifts, dept, year, month, onCellClick, onCsvExport, onXlsExport, onBulkCopy, onClearZero, onClearAll, defaultTimes, onDefaultsChange }) {
  const deptId = dept?.id;
  const days = getDays(year, month);
  const deptStaff = staffList.filter(s => s.dept === deptId);
  const DOW_LABEL = ["日","月","火","水","木","金","土"];
  const staffTotal = (sid) => { let t=0; for(let d=1;d<=days;d++){const r=allJisseki[deptId]?.[sid]?.[d];if(r)t+=calcWorkMinutes(r.start,r.end,r.breakMin);} return t; };
  const grandTotal = deptStaff.reduce((sum,s)=>sum+staffTotal(s.id), 0);
  const recordCount = deptStaff.reduce((sum,s)=>{let c=0;for(let d=1;d<=days;d++){if(allJisseki[deptId]?.[s.id]?.[d])c++;}return sum+c;},0);
  const [showDefModal, setShowDefModal] = useState(false);

  const getDefault = (shiftName) => defaultTimes?.[shiftName] || SHIFT_DEFAULT_TIMES[shiftName] || {};
  const isModified = (planned, rec) => {
    if (!rec) return false;
    if (rec.actualShift !== planned) return true;
    const d = getDefault(planned);
    if (!d.start) return false;
    return rec.start !== d.start || rec.end !== d.end || +rec.breakMin !== +d.breakMin;
  };
  const cellStatus = (planned, rec) => {
    if (!rec) return "empty";
    const actual = rec.actualShift || planned;
    if (WORK_TYPES.has(planned) && REST_TYPES.has(actual)) return "absence";
    if (rec.start && rec.end) {
      const d = getDefault(planned);
      if (d.start && d.end) {
        const planMins = calcWorkMinutes(d.start, d.end, d.breakMin ?? 60);
        const actMins = calcWorkMinutes(rec.start, rec.end, rec.breakMin ?? 0);
        if (actMins > planMins + 4) return "overtime";
        if (actMins < planMins - 14) return "early";
      }
    }
    if (isModified(planned, rec)) return "modified";
    return "normal";
  };
  const STATUS_STYLE = {
    absence:  { background:"#f1f3f4", color:"#6b7280", fontStyle:"italic" },
    overtime: { background:"#fff3e0", color:"#c2410c" },
    early:    { background:"#f1f3f4", color:"#6b7280", fontStyle:"italic" },
    modified: { background:"#fff3b0", color:"#0a4a47" },
    normal:   { background:"#d5f0ec", color:"#0a4a47" },
    empty:    { color:"#b0c8c8" },
  };

  const TH = { padding:"4px 6px", fontSize:10, fontWeight:700, color:"#52525B", background:"#F4F4F5", textAlign:"center", whiteSpace:"nowrap", position:"sticky", top:0 };
  const TD = (extra={}) => ({ padding:"3px 4px", fontSize:11, textAlign:"center", borderBottom:"1px solid #F4F4F5", ...extra });
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:8}}>
        <div style={{fontSize:12,color:"#52525B"}}>
          <span style={{fontWeight:700,color:"#4F46E5"}}>{recordCount}件</span> の実績 ／ 合計
          <span style={{fontWeight:700,color:"#4F46E5",marginLeft:4}}>{fmtH(grandTotal)}</span>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>setShowDefModal(true)} style={{background:"#FAFAFA",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>⚙️ デフォルト時刻</button>
          <button onClick={()=>onBulkCopy(null)} style={{background:"linear-gradient(135deg,#f59e0b,#f97316)",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>📋 全予定を一括コピー</button>
          <button onClick={onClearZero} style={{background:"#fff0f0",color:"#c44b4b",border:"1px solid #e07070",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>🗑 0:00レコードを削除</button>
          <button onClick={onClearAll} style={{background:"#7f1d1d",color:"#fff",border:"none",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>🗑 全実績クリア</button>
          <button onClick={onXlsExport} style={{background:"linear-gradient(135deg,#217346,#2ecc71)",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>📊 Excel出力</button>
          <button onClick={onCsvExport} style={{background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>📥 CSV出力</button>
        </div>
      </div>
      <div style={{fontSize:11,color:"#52525B",marginBottom:10,background:"#F4F4F5",borderRadius:7,padding:"6px 10px",display:"flex",flexWrap:"wrap",gap:"6px 12px",alignItems:"center"}}>
        <span>💡 セルクリックで個別修正。📋で一括コピー。</span>
        <span><span style={{background:"#fff3e0",color:"#c2410c",padding:"0 4px",borderRadius:3,fontWeight:700}}>橙</span>＝残業</span>
        <span><span style={{background:"#f1f3f4",color:"#6b7280",padding:"0 4px",borderRadius:3,fontStyle:"italic"}}>灰</span>＝早退/欠勤</span>
        <span><span style={{background:"#fff3b0",padding:"0 4px",borderRadius:3}}>黄</span>＝時刻変更</span>
        <span>📝＝備考あり</span>
      </div>
      <div style={{overflowX:"auto",borderRadius:8,border:"1px solid #E4E4E7"}}>
        <table style={{borderCollapse:"collapse",minWidth:"100%",fontSize:11}}>
          <thead>
            <tr>
              <th style={{...TH,left:0,zIndex:2,minWidth:90,textAlign:"left",paddingLeft:8}}>スタッフ</th>
              {Array.from({length:days},(_,i)=>i+1).map(d=>{
                const dow=new Date(year,month,d).getDay();
                return <th key={d} style={{...TH,color:dow===0?"#f87171":dow===6?"#6366F1":"#52525B",minWidth:38}}>
                  <div>{d}</div><div style={{fontSize:9,fontWeight:400}}>{DOW_LABEL[dow]}</div>
                </th>;
              })}
              <th style={{...TH,minWidth:52,background:"#F4F4F5"}}>合計</th>
            </tr>
          </thead>
          <tbody>
            {deptStaff.map((s,si)=>(
              <tr key={s.id} style={{background:si%2===0?"#fff":"#f7fffe"}}>
                <td style={{...TD(),fontWeight:700,color:"#18181B",textAlign:"left",paddingLeft:8,whiteSpace:"nowrap",position:"sticky",left:0,background:si%2===0?"#fff":"#f7fffe"}}>
                  {s.name}
                  <span title={`${s.name}の予定を一括コピー`} onClick={e=>{e.stopPropagation();onBulkCopy(s.id);}} style={{marginLeft:5,cursor:"pointer",fontSize:11,opacity:0.55,userSelect:"none"}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.55"}>📋</span>
                </td>
                {Array.from({length:days},(_,i)=>i+1).map(d=>{
                  const planned=allShifts[deptId]?.[s.id]?.[d];
                  const rec=allJisseki[deptId]?.[s.id]?.[d];
                  const mins=rec?calcWorkMinutes(rec.start,rec.end,rec.breakMin):0;
                  const hasRec=!!rec;
                  const status=cellStatus(planned,rec);
                  const ss=STATUS_STYLE[status]||{};
                  return (
                    <td key={d} onClick={()=>onCellClick(s,d,planned)} style={{...TD({cursor:"pointer",...ss})}}>
                      {hasRec ? (
                        <div style={{position:"relative",display:"inline-block"}}>
                          <span style={{fontWeight:status==="overtime"?800:700}}>{fmtH(mins)}</span>
                          {rec.note&&<span style={{position:"absolute",top:-4,right:-6,fontSize:8,lineHeight:1,pointerEvents:"none"}}>📝</span>}
                        </div>
                      ) : <span style={{fontSize:9}}>{planned||""}</span>}
                    </td>
                  );
                })}
                <td style={{...TD({background:"#F4F4F5",fontWeight:700,color:"#4F46E5"})}}>{fmtH(staffTotal(s.id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deptStaff.length === 0 && <div style={{textAlign:"center",padding:40,color:"#D4D4D8"}}>スタッフが登録されていません</div>}
      {showDefModal && <JissekiDefaultsModal dept={dept} defaults={defaultTimes||{}} onSave={defs=>{onDefaultsChange(defs);setShowDefModal(false);}} onClose={()=>setShowDefModal(false)}/>}
    </div>
  );
}

function applyMinimalChangePhase1(result, genSnapshot, ds, cd, year, month) {
  const days     = getDays(year, month);
  const cds      = cd.customShiftDefs || [];
  const work     = buildDeptWorkTypes(cds);
  const maxC     = cd.maxConsecutive || 5;
  const maxS     = {};
  const nightSet = new Set();
  [...new Set(cd.shiftTypes || [])].forEach(k => {
    const c2   = cds.find(c3 => c3.key === k);
    const base = c2?.baseType || k;
    const def  = base === '日勤' ? 99 : 1;
    const sv   = cd.maxStaff?.[k];
    const ms   = (sv != null && !(c2 && base === '日勤' && sv === 1)) ? sv : def;
    maxS[k] = ms;
    if (base === '夜勤') nightSet.add(k);
  });
  const bad = (prev, curr) => {
    if (!prev || !curr || cd.intervalThreshold != null) return false;
    return (prev === '遅番' && (curr === '早番' || curr === '日勤')) ||
           (prev === '日勤' && curr === '早番');
  };
  const consec = (shifts, sid, d, ovSid, ovDay, ovVal) => {
    let c = 0;
    for (let i = d; i >= 1; i--) {
      const sh = (ovSid === sid && ovDay === i) ? ovVal : (shifts[sid]?.[i] ?? '');
      if (work.has(sh)) c++; else break;
    }
    return c;
  };
  const dayM = (shifts, d, ovSid, ovDay, ovVal) => {
    let bt = 0, cv = 0, sv = 0, sh = 0;
    for (const s of ds) {
      const shP = (ovSid === s.id && ovDay === d-1) ? ovVal : (shifts[s.id]?.[d-1] ?? '');
      const shC = (ovSid === s.id && ovDay === d)   ? ovVal : (shifts[s.id]?.[d] ?? '');
      if (d > 1 && bad(shP, shC)) bt++;
      if (work.has(shC) && shC !== '明け' && consec(shifts, s.id, d, ovSid, ovDay, ovVal) > maxC) cv++;
    }
    for (const [k, lim] of Object.entries(maxS)) {
      if (lim >= 99) continue;
      const cnt = ds.filter(s => ((ovSid === s.id && ovDay === d) ? ovVal : (shifts[s.id]?.[d] ?? '')) === k).length;
      if (cnt > lim) sv++;
    }
    for (const [k, min] of Object.entries(cd.minStaff || {})) {
      const cnt = ds.filter(s => ((ovSid === s.id && ovDay === d) ? ovVal : (shifts[s.id]?.[d] ?? '')) === k).length;
      if (cnt < min) sh++;
    }
    return bt + cv + sv + sh;
  };
  const tier1ok = (sid, day, revVal) => {
    for (const [k, min] of Object.entries(cd.minStaff || {})) {
      if (min <= 0) continue;
      const cnt = ds.filter(s => ((s.id === sid) ? (revVal ?? '') : (result[s.id]?.[day] ?? '')) === k).length;
      if (cnt < min) return false;
    }
    return true;
  };
  const cands = [];
  for (const s of ds) {
    for (let d = 1; d <= days; d++) {
      const bv = genSnapshot[s.id]?.[d] ?? '';
      const av = result[s.id]?.[d] ?? '';
      if (bv === av) continue;
      const revVal = bv || undefined;
      const dayImp = dayM(genSnapshot, d) - dayM(result, d);
      if (dayImp > 0) continue;
      const mOrig = dayM(result, d) + (d < days ? dayM(result, d+1) : 0);
      const mRev  = dayM(result, d, s.id, d, revVal) + (d < days ? dayM(result, d+1, s.id, d, revVal) : 0);
      if (mRev > mOrig) continue;
      cands.push({ sid: s.id, name: s.name, day: d, revVal });
    }
  }
  cands.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  for (const { sid, day, revVal } of cands) {
    if ((result[sid]?.[day] ?? '') === (revVal ?? '')) continue;
    // guard①: revVal∉nightSet かつ 翌日=明け
    if (day < days && (result[sid]?.[day+1] ?? '') === '明け' && !nightSet.has(revVal ?? '')) continue;
    // guard②: revVal=明け かつ 前日∉nightSet
    if ((revVal ?? '') === '明け' && !nightSet.has(result[sid]?.[day-1] ?? '')) continue;
    // guard③: result[day]=明け かつ 前日∈nightSet かつ revVal≠明け
    if ((result[sid]?.[day] ?? '') === '明け' && day > 1 && nightSet.has(result[sid]?.[day-1] ?? '') && (revVal ?? '') !== '明け') continue;
    if (!tier1ok(sid, day, revVal)) continue;
    const mOrig = dayM(result, day) + (day < days ? dayM(result, day+1) : 0);
    const mRev  = dayM(result, day, sid, day, revVal) + (day < days ? dayM(result, day+1, sid, day, revVal) : 0);
    if (mRev <= mOrig) {
      if (!result[sid]) result[sid] = {};
      result[sid][day] = revVal !== undefined ? revVal : '';
    }
  }
}

function recomputeGenerateWarnings(result, ds, cd, year, month, warnings, score, timelineWarnings, setGenerateWarnings) {
  const days = getDays(year, month);
  const finalWarnings = {};
  for (const [shiftKey, minCount] of Object.entries(cd.minStaff || {})) {
    if (minCount <= 0) continue;
    for (let d = 1; d <= days; d++) {
      const actual = ds.filter(s => (result[s.id]?.[d] ?? '') === shiftKey).length;
      if (actual < minCount) {
        if (!finalWarnings[shiftKey]) finalWarnings[shiftKey] = { days: 0, maxShort: 0 };
        finalWarnings[shiftKey].days++;
        finalWarnings[shiftKey].maxShort = Math.max(finalWarnings[shiftKey].maxShort, minCount - actual);
      }
    }
  }
  const displayWarnings = Object.keys(finalWarnings).length > 0 ? finalWarnings : warnings;
  if (Object.keys(displayWarnings).length > 0) {
    setGenerateWarnings({ warnings: displayWarnings, deptLabel: cd.label, score, timelineWarnings });
  }
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const staffUserId = params.get('staff');
  const staffDeptId = params.get('dept');
  const staffCfgB64 = params.get('cfg');
  if (staffUserId) return <StaffPortal adminUserId={staffUserId} fixedDeptId={staffDeptId||undefined} cfgPreload={staffCfgB64} />;

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const fetchProfile = async (sess) => {
    if (!sess) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', sess.user.id).maybeSingle();
    setProfile(data || { facility_name: sess.user.email, plan: 'free', is_admin: false });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      fetchProfile(session).finally(() => setAuthLoading(false));
    }).catch(() => setAuthLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      fetchProfile(session);
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => { await supabase.auth.signOut(); };

  if (authLoading) {
    return (
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#FAFAFA,#F4F4F5)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans JP',sans-serif"}}>
        <div style={{textAlign:"center"}}>
          <div style={{margin:"0 auto 12px"}}><ShifuponIcon size={48} radius={12}/></div>
          <div style={{color:"#71717A",fontSize:13}}>読み込み中…</div>
        </div>
      </div>
    );
  }

  if (!session) { return <LoginPage onLogin={() => {}} />; }

  return <ErrorBoundary><MainApp session={session} profile={profile} onLogout={handleLogout} onProfileUpdate={setProfile} /></ErrorBoundary>;
}

// ─────────────────────────────────────────────
//  PLAN CONSTANTS
// ─────────────────────────────────────────────
const PLAN_LABELS = { free:"無料プラン", standard:"スタンダード", full:"フルプラン" };
const PLAN_COLORS = { free:"#6b7280", standard:"#6366F1", full:"#f59e0b" };

// ─────────────────────────────────────────────
//  ADMIN PANEL
// ─────────────────────────────────────────────
function AdminPanel({ onClose }) {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('profiles').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setFacilities(data || []); setLoading(false); });
  }, []);

  const changePlan = async (id, plan) => {
    await supabase.from('profiles').update({ plan, updated_at: new Date().toISOString() }).eq('id', id);
    setFacilities(prev => prev.map(f => f.id === id ? { ...f, plan } : f));
  };

  const plans = ['free', 'standard', 'full'];
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:16,padding:24,width:"100%",maxWidth:680,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:900,color:"#18181B"}}>🏢 施設管理（管理者）</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:22}}>✕</button>
        </div>
        {loading ? <div style={{textAlign:"center",color:"#71717A",padding:40}}>読み込み中…</div> : (
          <>
            <div style={{fontSize:11,color:"#71717A",marginBottom:12}}>登録施設数：{facilities.length}件</div>
            {facilities.map(f => (
              <div key={f.id} style={{background:"#f0fffe",border:"1px solid #E4E4E7",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontWeight:800,fontSize:13,color:"#18181B"}}>{f.facility_name||"（施設名未設定）"}</div>
                  <div style={{fontSize:10,color:"#71717A",marginTop:2}}>{f.created_at?.slice(0,10)} 登録</div>
                </div>
                <span style={{fontSize:11,fontWeight:700,color:PLAN_COLORS[f.plan]||"#6b7280",background:"#fff",border:`1px solid ${PLAN_COLORS[f.plan]||"#d1d5db"}`,borderRadius:12,padding:"2px 10px"}}>{PLAN_LABELS[f.plan]||f.plan}</span>
                <div style={{display:"flex",gap:4}}>
                  {plans.map(p=>(
                    <button key={p} onClick={()=>changePlan(f.id,p)} style={{background:f.plan===p?PLAN_COLORS[p]:"#fff",color:f.plan===p?"#fff":PLAN_COLORS[p],border:`1px solid ${PLAN_COLORS[p]}`,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>
                      {PLAN_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
function MainApp({ session, profile, onLogout, onProfileUpdate }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const isInitializing = useRef(true);
  const staffUpsertInProgress = useRef(false); // staffList保存中にreloadFromRemoteが旧データで上書くのを防止
  const lastSavedStaffListRef = useRef(null); // Supabaseへの最終保存済みstaffList（null=DB未読込→保存ブロック）
  const staffListSkipSave = useRef(false); // Supabase/Realtimeからのsetを識別してupsertをスキップ
  const exceptionMonthsSkipSave = useRef(false); // ★Fix W-1: reloadFromRemote起因 echo loop 防止
  const portalSettingsSkipSave = useRef(false);   // ★Fix W-1: reloadFromRemote起因 echo loop 防止
  const allFloorSettingsSkipSave = useRef(false);  // ★Fix W-1: 初期load起因 echo loop 防止
  const lastSelfSaveTime = useRef(0); // 自分の保存完了時刻（Realtime自己ループ検知用）
  const pasteTimestamp = useRef(0); // 貼り付け時刻（貼り付け直後のRealtime上書きをブロック）
  const deptsSkipSave = useRef(false); // depts: DB由来のsetを識別してupsertをスキップ
  const lastSavedDeptsRef = useRef(null); // depts: 最終Supabase保存済み値（null=DB未読込→保存ブロック）
  const deptsUpsertInProgress = useRef(false); // depts保存中フラグ
  const pendingDeptsRef = useRef(null); // 保存中に届いた新しいdepts（完了後に再保存）
  const pendingStaffListRef = useRef(null); // 保存中に届いた新しいstaffList
  const legacyJoinDateMigratedRef = useRef(false); // facilityYears→facilityJoinDate 一回限り移行ガード
  const dbInitialized = useRef(false); // 初回DB読込完了フラグ（二重保護）
  const dirtyDeptIdsRef = useRef(new Set()); // ★Fix W-2: 未保存部署の追跡（emergencySave多部署対応）
  const reloadFromRemoteRef = useRef(null); // reloadFromRemote関数への参照（catch節から呼び出し用）
  const activeCellRef = useRef(null); // { staffId, day, time } 現在編集中のセル（Realtime上書き保護用）
  const [dbLoading, setDbLoading] = useState(true);
  const [portalSettings, setPortalSettings] = useState({}); // { [deptId]: { deadline: "YYYY-MM-DD"|null } }

  const [depts, setDepts] = useState(() => { try { const s=localStorage.getItem("shiftNavi_depts"); if(s) return JSON.parse(s); } catch {} return DEFAULT_DEPTS; });
  useEffect(() => {
    try { localStorage.setItem("shiftNavi_depts",JSON.stringify(depts)); } catch {}
    if (deptsSkipSave.current) {
      deptsSkipSave.current = false;
      lastSavedDeptsRef.current = depts;
    } else if (lastSavedDeptsRef.current !== null && dbInitialized.current) {
      // 二重保護: null = DB未読込 OR dbInitialized=false → デフォルト値でSupabaseを上書きしない
      if (deptsUpsertInProgress.current) {
        // 保存中に新しい変更→完了後に再保存するため記録
        pendingDeptsRef.current = depts;
        return;
      }
      const saveDepts = (deptsToSave) => {
        deptsUpsertInProgress.current = true;
        const snapshot = deptsToSave;
        supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'depts', data_value:deptsToSave, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' })
          .then(({ error }) => {
            deptsUpsertInProgress.current = false;
            if (error) {
              console.error('[sync] depts upsert失敗:', error);
              setSaveStatus('error');
            } else {
              lastSavedDeptsRef.current = snapshot;
              // 保存中に届いた変更を再保存
              if (pendingDeptsRef.current !== null) {
                const pending = pendingDeptsRef.current;
                pendingDeptsRef.current = null;
                saveDepts(pending);
              }
            }
          });
      };
      saveDepts(depts);
    }
  }, [depts]); // eslint-disable-line react-hooks/exhaustive-deps

  const [deptSettingModal, setDeptSettingModal] = useState(null);
  const [activeDeptId, setActiveDeptId] = useState("kaigo1");
  const [innerTab, setInnerTab] = useState("shift");
  const [temporalConsole, setTemporalConsole] = useState(null);

  const [staffList, setStaffList] = useState(() => { try { const s=localStorage.getItem("shiftNavi_staffList"); if(s) return JSON.parse(s); } catch {} return buildStaff(); });
  useEffect(() => {
    try { localStorage.setItem("shiftNavi_staffList",JSON.stringify(staffList)); } catch {}
    if (staffListSkipSave.current) {
      // Supabase/Realtimeから来た変更 → 保存不要・保存済みとしてマーク
      staffListSkipSave.current = false;
      lastSavedStaffListRef.current = staffList;
    } else if (lastSavedStaffListRef.current !== null && dbInitialized.current) {
      // 二重保護: null = DB未読込 OR dbInitialized=false → デフォルト値でSupabaseを上書きしない
      if (staffUpsertInProgress.current) {
        pendingStaffListRef.current = staffList;
        return;
      }
      const saveStaffList = (listToSave) => {
        staffUpsertInProgress.current = true;
        const snapshot = listToSave;
        supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'staffList', data_value:listToSave, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' })
          .then(({ error }) => {
            staffUpsertInProgress.current = false;
            if (error) {
              console.error('[sync] staffList upsert失敗:', error);
              setSaveStatus('error');
            } else {
              lastSavedStaffListRef.current = snapshot;
              if (pendingStaffListRef.current !== null) {
                const pending = pendingStaffListRef.current;
                pendingStaffListRef.current = null;
                saveStaffList(pending);
              }
            }
          });
      };
      saveStaffList(staffList);
    }
  }, [staffList]); // eslint-disable-line react-hooks/exhaustive-deps

  // facilityYears/floorYears → facilityJoinDate/floorJoinDate 一回限りレガシー移行
  useEffect(() => {
    if (legacyJoinDateMigratedRef.current) return;
    if (staffList.length === 0) return;
    const needsMigration = staffList.some(s =>
      (!s.facilityJoinDate && s.facilityYears != null) ||
      (!s.floorJoinDate    && s.floorYears    != null)
    );
    if (!needsMigration) { legacyJoinDateMigratedRef.current = true; return; }
    legacyJoinDateMigratedRef.current = true;
    const today = new Date();
    const toDateStr = (years) => {
      if (years == null) return null;
      const d = new Date(today.getTime() - years * 365.25 * 24 * 60 * 60 * 1000);
      return d.toISOString().slice(0, 10);
    };
    setStaffList(prev => prev.map(s => {
      const patch = {};
      if (!s.facilityJoinDate && s.facilityYears != null) patch.facilityJoinDate = toDateStr(s.facilityYears);
      if (!s.floorJoinDate    && s.floorYears    != null) patch.floorJoinDate    = toDateStr(s.floorYears);
      return Object.keys(patch).length > 0 ? { ...s, ...patch } : s;
    }));
  }, [staffList]); // eslint-disable-line react-hooks/exhaustive-deps

  // スタッフポータル用: 施設設定をSupabaseに公開保存（dbLoading完了後に必ず1回書く）
  useEffect(() => {
    if (dbLoading) return;
    if (!dbInitialized.current) return; // DB読込完了前は書かない
    if (staffList.length === 0) return; // 空データで上書きしない
    const cfg = {
      facility_name: profile?.facility_name || '',
      depts: depts.map(d => {
        const ps = portalSettings[d.id] || {};
        return { id: d.id, label: d.label, icon: d.icon, kiboLimit: d.kiboLimit || 3, deadline: ps.deadline || null, targetYear: ps.targetYear || null, targetMonth: ps.targetMonth || null };
      }),
      staffList: staffList.map(s => ({ id: s.id, dept: s.dept, name: s.name, role: s.role }))
    };
    supabase.from('shift_data').upsert({ user_id: session.user.id, data_key: 'facilityConfig', data_value: cfg, updated_at: new Date().toISOString() }, { onConflict: 'user_id,data_key' }).then(() => {});
  }, [depts, staffList, portalSettings, dbLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if(window.XLSX)return; const script=document.createElement("script"); script.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; document.head.appendChild(script); }, []);

  const SAVE_KEY = (y, m) => `shiftNavi_shifts_${y}_${m+1}`;
  const restoreShifts = (parsed) => { const r={}; for(const [dId,ds] of Object.entries(parsed||{})){r[dId]={};for(const [sId,dm] of Object.entries(ds)){r[dId][sId]={};for(const [d,v] of Object.entries(dm))r[dId][sId][+d]=v;}} return r; };
  const [allShifts, setAllShifts] = useState(() => {
    try { const key=`shiftNavi_shifts_${new Date().getFullYear()}_${new Date().getMonth()+1}`; const saved=localStorage.getItem(key); if(!saved) return {}; return restoreShifts(JSON.parse(saved)); } catch { return {}; }
  });
  const [allJisseki, setAllJisseki] = useState({});
  const allJissekiRef = useRef({});
  const [jissekiModal, setJissekiModal] = useState(null); // { staff, day, planned }
  const allShiftsRef = useRef(allShifts); // 常に最新のallShiftsを参照（生成ハンドラ内で利用）
  const staffListRef = useRef(staffList); // 常に最新のstaffListを参照（保存ハンドラ内で利用）
  const deptsRef = useRef(depts); // 常に最新のdeptsを参照
  const allDBDataRef = useRef({}); // Supabase全データのキャッシュ（保存後の学習再計算に使用）
  const exceptionMonthsRef = useRef([]); // exceptionMonthsの最新値（保存後の学習再計算に使用）
  allShiftsRef.current = allShifts; // 常に最新状態を参照（生成ハンドラ・保存ハンドラ用）
  staffListRef.current = staffList;
  deptsRef.current = depts;
  allJissekiRef.current = allJisseki;
  const [allEvents, setAllEvents] = useState({});
  const [eventEditDay, setEventEditDay] = useState(null);

  const [saveStatus, setSaveStatus] = useState("saved");
  const saveStatusRef = useRef("saved");
  useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
  const saveTimer = useRef(null);
  const isLoadingMonth = useRef(false);
  const [isMonthLoading, setIsMonthLoading] = useState(false); // UI表示・操作ブロック用
  const fetchReqIdRef = useRef(0); // 古いfetchを破棄するモノトニックカウンター
  const yearRef = useRef(year);    // 保存時の年月一致検証用（常に最新を追跡）
  const monthRef = useRef(month);
  useEffect(() => { yearRef.current = year; }, [year]);
  useEffect(() => { monthRef.current = month; }, [month]);
  const activeDeptIdRef = useRef(activeDeptId);
  useEffect(() => { activeDeptIdRef.current = activeDeptId; }, [activeDeptId]);
  const userEditSeq = useRef(0); // ユーザー編集のたびにインクリメント（Realtime競合検出用）
  // Realtimeデータ適用時の userEditSeq スナップショット（-1=未ロード）
  // 保存エフェクトで userEditSeq===seqAtLastRemoteLoad なら「Realtime直後で変更なし」→保存スキップ
  const seqAtLastRemoteLoad = useRef(-1);
  const lastAutoGenRef = useRef({}); // 最後の自動生成結果（スワップパターン検出用）
  // ── Phase S-1: Lazy Temporal Architecture ────────────────────────────────
  const innerTabRef        = useRef("shift");     // shadow of innerTab — no dep-array churn
  // ── Phase S-4: Per-Tab Lazy Temporal Architecture ─────────────────────────
  const [consoleSection, setConsoleSection] = useState(null);  // lifted from TemporalConsolePanel
  const consoleSectionRef   = useRef(null);       // shadow of consoleSection — closure-safe
  // ── Phase S-6: Temporal Benchmark & Profiling Framework ──────────────────

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
          deptsSkipSave.current = true;
          // マイグレーション: DBにroleShiftTypesがない場合はDEFAULT_DEPTSから復元
          const loaded = byKey['depts'];
          const migrated = loaded.map(d => {
            if (d.roleShiftTypes) return d;
            const def = DEFAULT_DEPTS.find(dd => dd.id === d.id);
            return def?.roleShiftTypes ? { ...d, roleShiftTypes: def.roleShiftTypes } : d;
          });
          setDepts(migrated);
          // 復元があった場合はDBへ書き戻す（次回から正しく機能させる）
          if (migrated.some((d, i) => d !== loaded[i])) {
            setTimeout(() => {
              supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'depts', data_value:migrated, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' })
                .then(({error}) => { });
            }, 3000);
          }
        } else {
          // 新規ユーザーのみ: エラーなしでデータが存在しない場合にデフォルトを保存
          const defaultDepts = deptsRef.current;
          supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'depts', data_value:defaultDepts, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' })
            .then(({ error }) => { if (!error) lastSavedDeptsRef.current = deptsRef.current; });
        }
        if (byKey['staffList']) {
          staffListSkipSave.current = true;
          setStaffList(byKey['staffList']);
        } else {
          // 新規ユーザーのみ: エラーなしでデータが存在しない場合にデフォルトを保存
          const defaultStaff = staffListRef.current;
          supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'staffList', data_value:defaultStaff, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' })
            .then(({ error }) => { if (!error) lastSavedStaffListRef.current = staffListRef.current; });
        }
        if (byKey['allFloorSettings']) { allFloorSettingsSkipSave.current = true; setAllFloorSettings(byKey['allFloorSettings']); } // ★Fix W-1
        if (byKey['events_data']) setAllEvents(byKey['events_data']);
        const latestStaffList = byKey['staffList'] || staffList;
        const latestExceptionMonths = filterExpiredExceptions(byKey['exceptionMonths'] || []);
        if (byKey['exceptionMonths']) { exceptionMonthsSkipSave.current = true; setExceptionMonths(latestExceptionMonths); } // ★Fix W-1
        allDBDataRef.current = byKey; // DBキャッシュを初期化
        exceptionMonthsRef.current = latestExceptionMonths;
        const learned = computeLearnedTrend(byKey, latestStaffList, latestExceptionMonths);
        if (Object.keys(learned).length > 0) setLearnedTrend(learned);
        if (byKey['portalSettings']) { portalSettingsSkipSave.current = true; setPortalSettings(byKey['portalSettings']); } // ★Fix W-1
        const shiftPrefix = `shifts_${now.getFullYear()}_${now.getMonth()+1}_`;
        const deptShiftEntries = Object.entries(byKey).filter(([k]) => k.startsWith(shiftPrefix));
        if (deptShiftEntries.length > 0) {
          const merged = {};
          for (const [k, v] of deptShiftEntries) { merged[k.slice(shiftPrefix.length)] = v; }
          isLoadingMonth.current = true;
          setAllShifts(restoreShifts(merged));
          setTimeout(() => { isLoadingMonth.current = false; }, 100);
        } else {
          // 旧フォーマット（全部署1つのJSON）からの移行
          const legacyKey = `shifts_${now.getFullYear()}_${now.getMonth()+1}`;
          if (byKey[legacyKey]) {
            isLoadingMonth.current = true;
            setAllShifts(restoreShifts(byKey[legacyKey]));
            setTimeout(() => { isLoadingMonth.current = false; }, 100);
          }
        }
        const yoteiKey = `yotei_${now.getFullYear()}_${now.getMonth()+1}`;
        if (byKey[yoteiKey]) setAllYotei(byKey[yoteiKey]);
        const jissekiPrefix = `jisseki_${now.getFullYear()}_${now.getMonth()+1}_`;
        const jissekiEntries = Object.entries(byKey).filter(([k])=>k.startsWith(jissekiPrefix));
        if (jissekiEntries.length > 0) {
          const merged = {};
          for (const [k,v] of jissekiEntries) merged[k.slice(jissekiPrefix.length)] = v;
          setAllJisseki(merged);
        }
      } catch(e) { console.error('Supabase初期ロードエラー:', e); }
      finally {
        setDbLoading(false);
        // DB読込完了後にlastSavedRefを初期化（まだnullなら現在値で初期化 → 以降の変更が保存される）
        if (lastSavedDeptsRef.current === null) lastSavedDeptsRef.current = deptsRef.current;
        if (lastSavedStaffListRef.current === null) lastSavedStaffListRef.current = staffListRef.current;
        dbInitialized.current = true; // 二重保護フラグON（これ以降だけ保存を許可）
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
      // 月ロード中はRealtimeの割り込みを拒否（データ混線防止）
      if (isLoadingMonth.current) return;
      // 編集中（unsaved）はスキップ — 保存完了後に次のRealtimeイベントで自動反映される
      if (saveStatusRef.current === 'unsaved') {
        // 自分の保存から8秒以内は自己ループなので競合バナーを出さない
        const isSelfTriggered = Date.now() - lastSelfSaveTime.current < 8000;
        if (!isSelfTriggered && !conflictBannerDismissed.current) setConflictBanner(true);
        return;
      }
      // 貼り付け後5秒間はRealtime上書きをブロック（保存完了前にRTが旧データを上書きするのを防ぐ）
      if (Date.now() - pasteTimestamp.current < 5000) {
        return;
      }
      // 保存完了後に実際にロードする際はdismissedフラグをリセット
      conflictBannerDismissed.current = false;
      setConflictBanner(false);
      // fetch開始時のシーケンス番号を記録（fetch中にユーザーが編集したら検出するため）
      const seqAtStart = userEditSeq.current;
      isInitializing.current = true;
      try {
        const { data, error } = await supabase
          .from('shift_data')
          .select('data_key,data_value')
          .eq('user_id', session.user.id);
        if (error) throw error;
        // fetch中にユーザーが編集していたらシフト更新をキャンセル
        if (userEditSeq.current !== seqAtStart) return;
        const byKey = Object.fromEntries((data||[]).map(r=>[r.data_key, r.data_value]));
        if (byKey['depts'] && !deptsUpsertInProgress.current) {
          const lastSavedDepts = lastSavedDeptsRef.current;
          const hasLocalDeptChanges = lastSavedDepts !== null &&
            JSON.stringify(deptsRef.current) !== JSON.stringify(lastSavedDepts);
          if (!hasLocalDeptChanges && JSON.stringify(byKey['depts']) !== JSON.stringify(deptsRef.current)) {
            deptsSkipSave.current = true;
            setDepts(byKey['depts']);
          }
        }
        // staffList保存中、または未保存のローカル変更がある場合はRealtimeの旧データで上書きしない
        if (byKey['staffList'] && !staffUpsertInProgress.current) {
          const lastSaved = lastSavedStaffListRef.current;
          const hasLocalChanges = lastSaved !== null &&
            JSON.stringify(staffListRef.current) !== JSON.stringify(lastSaved);
          if (!hasLocalChanges && JSON.stringify(byKey['staffList']) !== JSON.stringify(staffListRef.current)) {
            staffListSkipSave.current = true;
            setStaffList(byKey['staffList']);
          }
        }
        const latestExcRT = filterExpiredExceptions(byKey['exceptionMonths'] || exceptionMonths);
        if (byKey['portalSettings']) { portalSettingsSkipSave.current = true; setPortalSettings(byKey['portalSettings']); } // ★Fix W-1
        if (byKey['exceptionMonths']) { exceptionMonthsSkipSave.current = true; setExceptionMonths(latestExcRT); } // ★Fix W-1
        allDBDataRef.current = {...allDBDataRef.current, ...byKey}; // DBキャッシュを更新
        exceptionMonthsRef.current = latestExcRT;
        const latestStaffListRT = byKey['staffList'] || staffList;
        const learnedRT = computeLearnedTrend(byKey, latestStaffListRT, latestExcRT);
        if (Object.keys(learnedRT).length > 0) setLearnedTrend(learnedRT);
        // ★重大修正: yearRef/monthRefを使用（closureのyear/monthは起動時に固定されるため必ずrefを参照）
        const shiftPrefix = `shifts_${yearRef.current}_${monthRef.current+1}_`;
        const deptShiftEntries = Object.entries(byKey).filter(([k]) => k.startsWith(shiftPrefix));
        if (deptShiftEntries.length > 0) {
          isLoadingMonth.current = true;
          // ★Fix W-3: RT適用時のundo stack リセット
          // 「RT更新前の古いundo履歴」でundoするとRT変更が消滅するリスクを防止
          // RT適用がseq不一致でキャンセルされる場合（ユーザー編集中）は、undo stackは保持する
          const willApplyRT = userEditSeq.current === seqAtStart;
          if (willApplyRT) {
            for (const [k] of deptShiftEntries) {
              const dId = k.slice(shiftPrefix.length);
              undoStackRef.current[dId] = []; // RT適用部署のundo履歴をリセット
            }
            setUndoCount(0);
          }
          setAllShifts(prev => {
            // updater実行時に再チェック（fetch後に編集があればキャンセル）
            if (userEditSeq.current !== seqAtStart) return prev;
            // Realtime適用時の seqを記録 → 保存エフェクトが「変更なし」と判定してスキップする
            seqAtLastRemoteLoad.current = userEditSeq.current;
            const result = { ...prev };
            const ac = activeCellRef.current;
            const acAge = ac ? Date.now() - ac.time : Infinity;
            for (const [k, v] of deptShiftEntries) {
              const deptId = k.slice(shiftPrefix.length);
              // アクティブセル保護: 直近5秒以内に編集したセルはRealtime上書きから守る
              if (ac && acAge < 5000 && deptId === activeDeptIdRef.current && v[ac.staffId]) {
                const localVal = prev[deptId]?.[ac.staffId]?.[ac.day];
                if (localVal !== undefined) {
                  const patched = { ...v, [ac.staffId]: { ...v[ac.staffId], [ac.day]: localVal } };
                  result[deptId] = patched;
                  continue;
                }
              }
              result[deptId] = v;
            }
            return restoreShifts(result);
          });
          setTimeout(() => { isLoadingMonth.current = false; }, 100);
        } else {
          const legacyKey = `shifts_${yearRef.current}_${monthRef.current+1}`;
          if (byKey[legacyKey]) {
            isLoadingMonth.current = true;
            setAllShifts(prev => {
              if (userEditSeq.current !== seqAtStart) return prev;
              seqAtLastRemoteLoad.current = userEditSeq.current;
              return restoreShifts(byKey[legacyKey]);
            });
            setTimeout(() => { isLoadingMonth.current = false; }, 100);
          }
        }
      } catch(e) { console.warn('リモート同期エラー:', e); }
      finally {
        // DB読込完了後、まだnullなら現在値で初期化 → 以降のユーザー変更がSupabaseに保存される
        if (lastSavedDeptsRef.current === null) lastSavedDeptsRef.current = deptsRef.current;
        if (lastSavedStaffListRef.current === null) lastSavedStaffListRef.current = staffListRef.current;
        setTimeout(() => { isInitializing.current = false; }, 300);
      }
    };

    reloadFromRemoteRef.current = reloadFromRemote; // catch節からも呼べるように公開

    // スマホでアプリを切り替えて戻ったとき同期
    const onVisibility = () => { if (!document.hidden) reloadFromRemote(); };
    document.addEventListener('visibilitychange', onVisibility);

    // Supabase Realtime: 他デバイスが保存した瞬間に同期
    const mergeStaffKibo = async () => {
      const mk = monthKey(yearRef.current, monthRef.current);
      const { data, error } = await supabase.from('staff_kibo').select('*').eq('admin_user_id', session.user.id).eq('month_key', mk);
      if (error) { console.error('[mergeStaffKibo]', error); return; }
      if (!data || data.length === 0) return; // 変更なし：setStaffListを呼ばない
      // functional updaterで「現時点の最新state」にマージを適用（ユーザーの保存と競合しない）
      // kiboByMonth/yukyuByMonthはstaffListとして保存不要（staff_kiboテーブルで管理）のでSkipSave
      staffListSkipSave.current = true;
      setStaffList(prev => {
        const next = prev.map(s => {
          const kibo = data.find(k => k.dept_id === s.dept && k.staff_id === s.id);
          if (!kibo) return s;
          return {
            ...s,
            kiboByMonth: { ...(s.kiboByMonth || {}), [mk]: kibo.days || [] },
            yukyuByMonth: { ...(s.yukyuByMonth || {}), [mk]: kibo.yukyu_days || [] }
          };
        });
        // 実際に変化があった場合のみ新しい配列を返す（変化なしならprevを返しuseEffectを起動しない）
        const changed = next.some((s, i) => s !== prev[i]);
        if (!changed) staffListSkipSave.current = false; // 変化なしならフラグを戻す
        return changed ? next : prev;
      });
    };
    mergeStaffKibo();

    // 自動生成後など複数行のupsertが連続するとpostgres_changesが連打されるため
    // 500msデバウンスで1回にまとめる（auto_generate直後の realtime_update 洪水を防止）
    let reloadDebounceTimer = null;
    const debouncedReload = () => {
      if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
      reloadDebounceTimer = setTimeout(() => {
        reloadDebounceTimer = null;
        reloadFromRemote();
      }, 500);
    };

    const channel = supabase.channel(`shift-sync-${session.user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shift_data', filter: `user_id=eq.${session.user.id}` },
        (payload) => {
          // ★部署境界隔離: 変更された data_key を検査し、現在の year/month のシフトキーのみ reload を発火
          // shifts_YYYY_M_deptId 形式のキーのみが対象 → staffList / depts / shiftTrend 等の
          // 副次的な保存が realtime_update → autosave → echo loop を引き起こすのを防止
          const changedKey = payload.new?.data_key || payload.old?.data_key || '';
          const currentShiftPrefix = `shifts_${yearRef.current}_${monthRef.current+1}_`;
          if (changedKey.startsWith(currentShiftPrefix)) {
            debouncedReload();
          }
          // staffList / depts / shiftTrend 等の変更は reload 対象外（自己 echo 防止）
          // 他セッションからの管理データ更新は tab-focus 時の visibility reload で捕捉する
        }
      )
      .subscribe();

    const kiboChannel = supabase.channel(`staff-kibo-${session.user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'staff_kibo', filter: `admin_user_id=eq.${session.user.id}` },
        () => mergeStaffKibo()
      )
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
      supabase.removeChannel(channel);
      supabase.removeChannel(kiboChannel);
    };
  }, [dbLoading, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── allShifts変更時: localStorageへ即時保存（デバウンスなし・タブ閉じ・月切替対策）──
  useEffect(() => {
    if (!dbInitialized.current) return;
    if (isLoadingMonth.current) return;
    if (Object.keys(allShifts).length === 0) return;
    // year/monthをdepsから外す: 月切替時はallShiftsより先にこのeffectが走り
    // 旧月データを新月のlocalStorageキーに書き込むバグを防ぐ。
    // allShifts変更時のみ実行すれば year/month は常に正しい現在値になる。
    try { localStorage.setItem(SAVE_KEY(year, month), JSON.stringify(allShifts)); } catch {}
  }, [allShifts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── タブ/ウィンドウを閉じる直前: 未保存データをlocalStorageに緊急保存 ──
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (saveStatusRef.current === 'unsaved') {
        try { localStorage.setItem(SAVE_KEY(year, month), JSON.stringify(allShiftsRef.current)); } catch {}
        e.preventDefault();
        e.returnValue = '未保存のシフトがあります。';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 月切替: Supabase から当月シフトをロード（部署ごとに別キー）──
  useEffect(() => {
    if (isInitializing.current) return;
    // クリーンアップ（月切替前）: 旧月の未保存データをSupabaseへ緊急保存
    // ★Fix W-2: activeDeptId 単独 → dirtyDeptIdsRef 全部署へ拡張（多部署同時編集対応）
    // closureで旧year/monthを参照 → allShiftsRef.currentも旧月データ
    const emergencySave = () => {
      if (!dbInitialized.current) return;
      // dirty部署がなく、saveStatus も 'saved' なら保存不要
      const dirtyIds = new Set(dirtyDeptIdsRef.current);
      if (dirtyIds.size === 0 && saveStatusRef.current !== 'unsaved') return;
      // saveStatusが'unsaved'なら activeDeptId も保存対象に含める（dirtyに漏れがある場合の安全網）
      if (saveStatusRef.current === 'unsaved') dirtyIds.add(activeDeptIdRef.current);
      try { localStorage.setItem(SAVE_KEY(year, month), JSON.stringify(allShiftsRef.current)); } catch {}
      console.log('[save] 月切替前緊急保存（対象部署）:', [...dirtyIds].join(','));
      let savedCount = 0;
      for (const deptId of dirtyIds) {
        const emergencyKey = `shifts_${year}_${month+1}_${deptId}`;
        const emergencyData = allShiftsRef.current[deptId] || {};
        supabase.from('shift_data').upsert(
          { user_id:session.user.id, data_key:emergencyKey, data_value:emergencyData, updated_at:new Date().toISOString() },
          { onConflict:'user_id,data_key' }
        ).then(({ error }) => {
          if (!error) {
            dirtyDeptIdsRef.current.delete(deptId);
            savedCount++;
            if (savedCount === dirtyIds.size) { setSaveStatus('saved'); }
            console.log('[save] 月切替前緊急保存OK:', emergencyKey);
          } else {
            console.error('[save] 月切替前緊急保存失敗:', emergencyKey, error);
          }
        });
      }
    };
    // ★防衛1: リクエストIDをインクリメント（古いfetchの結果を破棄するため）
    const reqId = ++fetchReqIdRef.current;
    if (saveTimer.current) clearTimeout(saveTimer.current); // 旧月の保存タイマーを即キャンセル
    isLoadingMonth.current = true;
    setIsMonthLoading(true); // UIロック開始
    setAllShifts({}); // 月切替時に即座にクリア（旧月データが一瞬残るのを防ぐ）
    undoStackRef.current = {}; // 月切替でアンドゥ履歴をリセット
    setUndoCount(0);
    // ロード完了処理（reqId一致時のみ適用）
    const applyLoaded = (data) => {
      if (reqId !== fetchReqIdRef.current) {
        console.warn('[fetch] 古いリクエストを破棄 reqId:', reqId, '最新:', fetchReqIdRef.current);
        return;
      }
      setAllShifts(restoreShifts(data));
      setTimeout(() => {
        if (reqId !== fetchReqIdRef.current) return;
        isLoadingMonth.current = false;
        setIsMonthLoading(false); // UIロック解除
      }, 100);
    };
    const prefix = `shifts_${year}_${month+1}_`;
    supabase.from('shift_data').select('data_key,data_value')
      .eq('user_id', session.user.id)
      .like('data_key', prefix + '%')
      .then(({ data, error }) => {
        if (reqId !== fetchReqIdRef.current) return; // 古いリクエストは即破棄
        if (!error && data && data.length > 0) {
          const merged = {};
          for (const row of data) { merged[row.data_key.slice(prefix.length)] = row.data_value; }
          applyLoaded(merged);
        } else {
          // 旧フォーマット fallback（★バグ修正: setTimeout を nested .then() の中に移動）
          const legacyKey = `shifts_${year}_${month+1}`;
          supabase.from('shift_data').select('data_value')
            .eq('user_id', session.user.id).eq('data_key', legacyKey).maybeSingle()
            .then(({ data: ld }) => {
              if (reqId !== fetchReqIdRef.current) return;
              if (ld?.data_value) { applyLoaded(ld.data_value); }
              else {
                try { const saved=localStorage.getItem(SAVE_KEY(year,month)); applyLoaded(saved ? JSON.parse(saved) : {}); }
                catch { applyLoaded({}); }
              }
            });
        }
        // Load yotei for new month（reqId不一致でも上書きは無害なため実行）
        const yKey=`yotei_${year}_${month+1}`;
        supabase.from('shift_data').select('data_value').eq('user_id',session.user.id).eq('data_key',yKey).maybeSingle()
          .then(({data})=>{ if(reqId!==fetchReqIdRef.current)return; if(data?.data_value)setAllYotei(data.data_value);else{try{const s=localStorage.getItem(`shiftNavi_${yKey}`);setAllYotei(s?JSON.parse(s):{});}catch{setAllYotei({});}} });
      });
    return () => { emergencySave(); }; // cleanup: 月切替/アンマウント時に旧月を緊急保存
  }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── シフト変更: Supabase へ自動保存（1秒デバウンス）──
  const saveFailCountRef = useRef(0);
  useEffect(() => {
    // DB初期化完了前・ロード中は物理的に保存不可
    if (!dbInitialized.current) return;
    if (isLoadingMonth.current) return;
    // Realtime直後で userEditSeq が変化していない = ユーザー/生成の変更なし → 保存不要
    // userEditSeq > seqAtLastRemoteLoad であれば編集・生成があった → 保存する
    if (userEditSeq.current === seqAtLastRemoteLoad.current) {
      setSaveStatus('saved');
      return;
    }
    saveStatusRef.current = "unsaved"; // Realtime保護を即時有効化（レンダー後のeffect待ち不要）
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // ★防衛C: 部署IDをクロージャでキャプチャ（タイマー発火時に部署が変わっても正しい部署に保存）
    const closureDeptId = activeDeptIdRef.current;
    dirtyDeptIdsRef.current.add(closureDeptId); // ★Fix W-2: dirty追跡（緊急保存の多部署対応）
    saveTimer.current = setTimeout(async () => {
      if (isLoadingMonth.current) return;
      // ★防衛3: 保存直前に年月一致検証（クロージャの年月 vs 現在の画面の年月）
      if (year !== yearRef.current || month !== monthRef.current) {
        console.warn('[save] 🚨 年月不一致を検出 - データ破壊を防ぐため保存を中断', {
          closureYear: year, closureMonth: month + 1,
          currentYear: yearRef.current, currentMonth: monthRef.current + 1
        });
        setSaveStatus('saved'); // 画面上のステータスは安全側に倒す
        return;
      }
      // 部署IDはクロージャ値を使用（編集時の部署に正確に保存）
      const currentDeptId = closureDeptId;
      const key = `shifts_${year}_${month+1}_${currentDeptId}`;
      const deptData = allShifts[currentDeptId] || {};
      try {
        const { error } = await supabase.from('shift_data').upsert(
          { user_id:session.user.id, data_key:key, data_value:deptData, updated_at:new Date().toISOString() },
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
        lastSelfSaveTime.current = Date.now(); // 自己Realtimeループ検知用
        dirtyDeptIdsRef.current.delete(currentDeptId); // ★Fix W-2: 保存成功 → dirty解除
        setSaveStatus("saved");
        console.log("[save] Supabase保存OK:", key);
        // 保存成功のたびにDBキャッシュを更新して learnedTrend を再計算
        // → 調整済みシフトが同セッション内の次月生成に即座に反映される
        allDBDataRef.current[key] = deptData;
        {
          const relearned = computeLearnedTrend(allDBDataRef.current, staffListRef.current, exceptionMonthsRef.current);
          if (Object.keys(relearned).length > 0) setLearnedTrend(relearned);
        }
        const genRef = lastAutoGenRef.current[currentDeptId];
        if (genRef) {
          const deptStaff = staffListRef.current.filter(s => s.dept === currentDeptId);
          const kiboPatterns = detectKiboNightPatterns(genRef, deptData, deptStaff, year, month);
          if (Object.keys(kiboPatterns).length > 0) {
            setStaffList(prev => prev.map(s => {
              if (!kiboPatterns[s.id]) return s;
              return {
                ...s,
                kiboNightPreference: Math.min(20, (s.kiboNightPreference || 0) + kiboPatterns[s.id]),
              };
            }));
          }
          lastAutoGenRef.current[currentDeptId] = {...deptData};
        }
      } catch(e) {
        try { localStorage.setItem(SAVE_KEY(year,month),JSON.stringify(allShifts)); } catch {}
        saveFailCountRef.current += 1;
        console.error("[save] Supabase保存失敗(" + saveFailCountRef.current + "回目):", e?.message || e);
        setSaveStatus("unsaved");
        if (saveFailCountRef.current >= 5) {
          saveFailCountRef.current = 0;
          setSaveStatus('error');
          // 5回連続失敗 → 中途半端な状態のまま編集継続は危険のためロールバックを提案
          const shouldRollback = window.confirm(
            "【保存エラー】クラウドへの保存が5回連続で失敗しました。\n\n" +
            "このまま編集を続けるとデータが正常に保存されない恐れがあります。\n\n" +
            "「OK」→ 最後に正常保存された状態に安全に巻き戻す（推奨）\n" +
            "「キャンセル」→ 現在の状態を維持（自己責任）"
          );
          if (shouldRollback && reloadFromRemoteRef.current) {
            setSaveStatus('saved'); // reloadFromRemoteのunsaved skipガードを外す
            reloadFromRemoteRef.current();
          }
        }
      }
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [allShifts, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventsTimer = useRef(null);
  useEffect(() => {
    if (isInitializing.current) return;
    if (!dbInitialized.current) return; // DB読込前は書かない
    if (eventsTimer.current) clearTimeout(eventsTimer.current);
    eventsTimer.current = setTimeout(() => {
      if (!dbInitialized.current) return;
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'events_data', data_value:allEvents, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(({error})=>{
        if (error) { console.error('[events] 保存失敗:', error); setSaveStatus('error'); }
      });
    }, 1200);
    return () => { if (eventsTimer.current) clearTimeout(eventsTimer.current); };
  }, [allEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  const [generating, setGenerating] = useState(false);
  const [generateWarnings, setGenerateWarnings] = useState(null);
  const [downloadModal, setDownloadModal] = useState(false);
  const [bulkKyukoModal, setBulkKyukoModal] = useState(false);
  const undoStackRef = useRef({}); // { [deptId]: deptShifts[] } — アンドゥ履歴（最大30ステップ）
  const [undoCount, setUndoCount] = useState(0); // 現在部署のアンドゥ可能ステップ数（ボタンのenabled判定用）
  const isMobile = (window.innerWidth || document.documentElement.clientWidth) < 900;
  const [tableZoom, setTableZoom] = useState(() => { try { return Number(localStorage.getItem("shiftTableZoom")) || 100; } catch { return 100; } });
  const handleZoomChange = useCallback((v) => { const min=isMobile?30:40; const c=Math.min(100,Math.max(min,Math.round(v/5)*5)); setTableZoom(c); try{localStorage.setItem("shiftTableZoom",c);}catch{} }, [isMobile]);
  const autoFitZoom = useCallback((staffCount, days) => { const vw=window.innerWidth-(isMobile?8:24); const tableEstWidth=148+30*days+116; const min=isMobile?30:40; return Math.min(100,Math.max(min,Math.round(Math.floor(vw/tableEstWidth*100)/5)*5)); }, [isMobile]);
  const autoFitApplied = useRef(false);
  useEffect(() => { if(autoFitApplied.current)return; try{const s=localStorage.getItem("shiftTableZoom");if(s&&!isMobile){autoFitApplied.current=true;return;}}catch{} setTableZoom(autoFitZoom(staffList.filter(s=>s.dept===activeDeptId).length,getDays(now.getFullYear(),now.getMonth()))); autoFitApplied.current=true; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [excelPasteModal, setExcelPasteModal] = useState(false);
  const [clearModal, setClearModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // ── 勤務実績: 保存ハンドラ ──
  const saveJisseki = useCallback((staffId, day, rec) => {
    const prevDept = allJissekiRef.current[activeDeptId] || {};
    const nextDept = { ...prevDept, [staffId]: { ...(prevDept[staffId]||{}), [day]: rec } };
    setAllJisseki(prev => ({ ...prev, [activeDeptId]: nextDept }));
    const key = `jisseki_${year}_${month+1}_${activeDeptId}`;
    supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:key, data_value:nextDept, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(({error})=>{ if(error) console.error('[saveJisseki]',error); });
  }, [activeDeptId, year, month, session.user.id]);
  const clearJisseki = useCallback((staffId, day) => {
    const prevDept = { ...(allJissekiRef.current[activeDeptId]||{}) };
    const staffData = { ...(prevDept[staffId]||{}) };
    delete staffData[day];
    const nextDept = { ...prevDept, [staffId]: staffData };
    setAllJisseki(prev => ({ ...prev, [activeDeptId]: nextDept }));
    const key = `jisseki_${year}_${month+1}_${activeDeptId}`;
    supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:key, data_value:nextDept, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(({error})=>{ if(error) console.error('[clearJisseki]',error); });
  }, [activeDeptId, year, month, session.user.id]);
  const [jissekiDefaults, setJissekiDefaults] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jissekiDefaults') || '{}'); } catch { return {}; }
  });
  const saveJissekiDefaultsForDept = useCallback((deptId, defaults) => {
    setJissekiDefaults(prev => {
      const next = {...prev, [deptId]: defaults};
      try { localStorage.setItem('jissekiDefaults', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const bulkCopyPlanned = useCallback(async (staffId) => {
    const days = getDays(year, month);
    const deptId = activeDeptId;
    const targetStaff = staffId
      ? staffList.filter(s => s.id === staffId && s.dept === deptId)
      : staffList.filter(s => s.dept === deptId);
    const msg = staffId
      ? `${targetStaff[0]?.name || ""}の予定を実績にコピーします（既存の記録は上書きしません）。よろしいですか？`
      : `全スタッフの予定を実績にコピーします（既存の記録は上書きしません）。よろしいですか？`;
    if (!window.confirm(msg)) return;
    let nextDeptData = null;
    setAllJisseki(prev => {
      const deptData = {...(prev[deptId] || {})};
      let changed = false;
      for (const s of targetStaff) {
        const staffData = {...(deptData[s.id] || {})};
        for (let d = 1; d <= days; d++) {
          if (staffData[d]) continue;
          const planned = allShifts[deptId]?.[s.id]?.[d];
          if (!planned || (!WORK_TYPES.has(planned) && planned !== "明け")) continue;
          const defs = jissekiDefaults[deptId]?.[planned] || SHIFT_DEFAULT_TIMES[planned] || {start:"",end:"",breakMin:60};
          staffData[d] = {actualShift:planned, start:defs.start||"", end:defs.end||"", breakMin:defs.breakMin??60, note:""};
          changed = true;
        }
        deptData[s.id] = staffData;
      }
      if (!changed) return prev;
      nextDeptData = deptData;
      return {...prev, [deptId]: deptData};
    });
    if (nextDeptData) {
      const key = `jisseki_${year}_${month+1}_${deptId}`;
      try {
        await supabase.from('shift_data').upsert({user_id:session.user.id, data_key:key, data_value:nextDeptData, updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'});
      } catch (e) {
        console.error('[bulkCopyPlanned] 保存失敗:', e);
      }
    }
  }, [activeDeptId, staffList, allShifts, year, month, jissekiDefaults, session.user.id]);
  const bulkClearZeroRec = useCallback(async () => {
    const deptId = activeDeptId;
    const days = getDays(year, month);
    if (!window.confirm("実労働時間が0:00のレコードをすべて削除します。よろしいですか？")) return;
    let nextDeptData = null;
    setAllJisseki(prev => {
      const deptData = {...(prev[deptId] || {})};
      let changed = false;
      for (const s of staffList.filter(x => x.dept === deptId)) {
        const staffData = {...(deptData[s.id] || {})};
        for (let d = 1; d <= days; d++) {
          const r = staffData[d];
          if (!r) continue;
          const mins = calcWorkMinutes(r.start, r.end, r.breakMin ?? 0);
          if (mins === 0) { delete staffData[d]; changed = true; }
        }
        deptData[s.id] = staffData;
      }
      if (!changed) return prev;
      nextDeptData = deptData;
      return {...prev, [deptId]: deptData};
    });
    if (nextDeptData) {
      const key = `jisseki_${year}_${month+1}_${deptId}`;
      try {
        await supabase.from('shift_data').upsert({user_id:session.user.id, data_key:key, data_value:nextDeptData, updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'});
      } catch (e) {
        console.error('[bulkClearZeroRec] 保存失敗:', e);
      }
    }
  }, [activeDeptId, staffList, year, month, session.user.id]);
  const clearDeptJisseki = useCallback(async () => {
    const deptId = activeDeptId;
    const key = `jisseki_${year}_${month+1}_${deptId}`;
    setAllJisseki(prev => ({ ...prev, [deptId]: {} }));
    try {
      await supabase.from('shift_data').upsert({ user_id: session.user.id, data_key: key, data_value: {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id,data_key' });
    } catch (e) {
      console.error('[clearDeptJisseki] 保存失敗:', e);
    }
  }, [activeDeptId, year, month, session.user.id]);
  const [adminModal, setAdminModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [helpModal, setHelpModal] = useState(false);
  const [learnedTrend, setLearnedTrend] = useState({});
  const [exceptionMonths, setExceptionMonths] = useState([]); // ["YYYY-M", ...]
  // ── 部署編集ロック ──
  const [unlockedDeptId, setUnlockedDeptId] = useState(null); // 解錠中の部署ID
  const [pinModal, setPinModal] = useState(false);
  const [historyModal, setHistoryModal] = useState(false); // 変更履歴から復元モーダル
  const [conflictBanner, setConflictBanner] = useState(false); // 他端末で更新通知バナー
  const [overflowOpen, setOverflowOpen] = useState(false);
  const conflictBannerDismissed = useRef(false); // ×で閉じたら次のRealtimeで再表示しない
  // タブ切替で自動ロック
  useEffect(() => { setUnlockedDeptId(null); }, [activeDeptId]);
  // 部署切替時にアンドゥ可能数を現在部署のスタック長に合わせる
  useEffect(() => { setUndoCount((undoStackRef.current[activeDeptId] || []).length); }, [activeDeptId]);
  const isLocked = !!(depts.find(d=>d.id===activeDeptId)?.pin && unlockedDeptId !== activeDeptId);
  const isLockedRef = useRef(isLocked);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  const generateTimerRef = useRef(null);
  useEffect(() => {
    if (!isInitializing.current) {
      // ★Fix W-1: reloadFromRemote/初期load起因の setExceptionMonths は Supabase に書き戻さない
      if (exceptionMonthsSkipSave.current) { exceptionMonthsSkipSave.current = false; return; }
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'exceptionMonths', data_value:exceptionMonths, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' });
      supabase.from('shift_data').select('data_key,data_value').eq('user_id',session.user.id).then(({data})=>{
        if (!data) return;
        const byKey = Object.fromEntries(data.map(r=>[r.data_key,r.data_value]));
        allDBDataRef.current = byKey; // DBキャッシュを最新化
        exceptionMonthsRef.current = exceptionMonths;
        const learned = computeLearnedTrend(byKey, staffList, exceptionMonths);
        if (Object.keys(learned).length > 0) setLearnedTrend(learned);
      });
    }
  }, [exceptionMonths]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isInitializing.current || dbLoading) return;
    // ★Fix W-1: reloadFromRemote/初期load起因の setPortalSettings は Supabase に書き戻さない
    if (portalSettingsSkipSave.current) { portalSettingsSkipSave.current = false; return; }
    supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'portalSettings', data_value:portalSettings, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(()=>{}).catch(()=>{});
  }, [portalSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ctxMenu, setCtxMenu] = useState(null);
  const [staffModal, setStaffModal] = useState(null);

  const DEFAULT_FLOOR_SETTINGS = {floors:[],duties:[{name:"入浴"},{name:"フリー"}]};
  const [allFloorSettings, setAllFloorSettings] = useState(() => { try{const s=localStorage.getItem("shiftNavi_allFloorSettings");if(s)return JSON.parse(s);}catch{} return {}; });
  const floorSettings = allFloorSettings[activeDeptId] || DEFAULT_FLOOR_SETTINGS;
  useEffect(() => {
    try{localStorage.setItem("shiftNavi_allFloorSettings",JSON.stringify(allFloorSettings));}catch{}
    // ★Fix W-1: 初期load起因の setAllFloorSettings は Supabase に書き戻さない
    if (allFloorSettingsSkipSave.current) { allFloorSettingsSkipSave.current = false; return; }
    if(!isInitializing.current){supabase.from('shift_data').upsert({user_id:session.user.id,data_key:'allFloorSettings',data_value:allFloorSettings,updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'}).then(()=>{});}
  }, [allFloorSettings]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // 現在のシフト表から常時シンクロ率を計算（自動生成後だけでなく常に反映）
  const syncRate = useMemo(() => {
    if (!dept) return null;
    return computeSyncRate(deptShifts, staffList, dept, year, month, learnedTrend);
  }, [deptShifts, staffList, dept, year, month, learnedTrend, activeDeptId]);

  // ══════════════════════════════════════════════════════════════════════════
  // ── Phase S-1: keep innerTabRef in sync + fire lazy Temporal engines ────────
  useEffect(() => {
    innerTabRef.current = innerTab;
  }, [innerTab]);

  // ── Phase S-4: consoleSectionRef sync ───────────────────────────────────────
  useEffect(() => {
    consoleSectionRef.current = consoleSection;
  }, [consoleSection]); // eslint-disable-line react-hooks/exhaustive-deps


  const setDeptShifts = useCallback(updater => {
    // アンドゥ用に変更前の状態を積む
    const snapshot = allShiftsRef.current[activeDeptId] || {};
    const stack = undoStackRef.current[activeDeptId] || [];
    undoStackRef.current[activeDeptId] = [...stack, snapshot].slice(-30);
    setUndoCount(undoStackRef.current[activeDeptId].length);
    // ユーザー操作はRealtimeより常に優先: 編集前にシーケンス番号を上げてRealtimeをキャンセル
    userEditSeq.current++;
    saveStatusRef.current = "unsaved"; // Realtime簡易ガードを即時有効化
    setAllShifts(prev=>({...prev,[activeDeptId]:typeof updater==="function"?updater(prev[activeDeptId]||{}):updater}));
  }, [activeDeptId]);

  const deptYotei = allYotei[activeDeptId]||{};
  const handleUpdateYotei = useCallback((day, assignments) => {
    setAllYotei(prev=>({...prev,[activeDeptId]:{...(prev[activeDeptId]||{}),[String(day)]:assignments}}));
  }, [activeDeptId]);
  const handleBatchUpdateYotei = useCallback((dayMap) => {
    setAllYotei(prev=>({...prev,[activeDeptId]:{...(prev[activeDeptId]||{}),...dayMap}}));
  }, [activeDeptId]);
  const handleUpdateFloorSettings = useCallback((newSettings) => {
    setAllFloorSettings(prev => ({...prev, [activeDeptId]: newSettings}));
  }, [activeDeptId]);

  const _runGenerateCore = useCallback((targetDept, cs, ct) => {
    const genSnapshot = allShiftsRef.current[targetDept.id] || {};
    const genStack = undoStackRef.current[targetDept.id] || [];
    undoStackRef.current[targetDept.id] = [...genStack, genSnapshot].slice(-30);
    const {shifts:result, warnings, timelineWarnings, score, ratioFeedback} = bestOfN(cs, targetDept, year, month, genSnapshot, ct, 30);
    lastAutoGenRef.current[targetDept.id] = result;
    return { result, warnings, timelineWarnings, score, ratioFeedback, genSnapshot };
  }, [year, month]);

  const handleGenerate = useCallback(() => {
    if (generateTimerRef.current) clearTimeout(generateTimerRef.current);
    setGenerating(true);
    isInitializing.current = false;
    const _gen_refDate = new Date();
    const cs = staffList.map(s => {
      const fy = s.facilityJoinDate ? deriveYears(s.facilityJoinDate, _gen_refDate) : (s.facilityYears ?? null);
      const fl = s.floorJoinDate    ? deriveYears(s.floorJoinDate,    _gen_refDate) : (s.floorYears    ?? null);
      return { ...s, facilityYears: fy, floorYears: fl };
    });
    const cd=dept, ct=learnedTrend;
    generateTimerRef.current = setTimeout(() => {
      // 月切り替え中は生成を中断（year/monthクロージャ陳腐化チェック）
      if (year !== yearRef.current || month !== monthRef.current) {
        console.warn('[handleGenerate] 年月切替を検出 - 自動生成を中断', {
          closureYear: year, closureMonth: month + 1,
          currentYear: yearRef.current, currentMonth: monthRef.current + 1
        });
        setGenerating(false);
        return;
      }
      // 自動生成もユーザー操作: シーケンス番号を上げてRealtimeをキャンセル
      userEditSeq.current++;
      saveStatusRef.current = "unsaved"; // Realtime保護を即時有効化
      try {
        if (cd?.generationMode === 'time') {
          const preCheck = validateCoverageRules(cd.coverageRules || [], cs.filter(s => s.dept === cd.id), cd);
          if (!preCheck.ok) {
            if (!window.confirm('生成前チェック:\n' + preCheck.warnings.join('\n') + '\n\n続けて生成しますか？')) {
              return;
            }
          }
          const { shifts: timeResult, coverageWarnings, score: timeScore } = autoGenerateTime(
            cs, cd, year, month, allShiftsRef.current[cd.id] || {}, ct
          );
          setAllShifts(prev => ({ ...prev, [cd.id]: timeResult }));
          setSaveStatus('unsaved');
          if (coverageWarnings.length > 0) {
            setGenerateWarnings({ warnings: {}, deptLabel: cd.label, score: timeScore, timelineWarnings: [], coverageWarnings });
          } else {
            setGenerateWarnings(null);
          }
          return;
        }
        const csForGenerate = buildNightExclusion(cs, cd, allShiftsRef.current, deptsRef.current, year, month);

        // ── 公休日数仕様保証リトライ ──────────────────────────────────────────
        // actualKyuko !== targetKyuko の職員が1人でもいれば再生成（最大50回）
        // 全員一致した最初の結果を採用。全試行で一致しなければ最高スコアを採用。
        const _RETRY_REST = new Set(['休み', '希望休', '有休']);
        const _retryDept  = cs.filter(s => s.dept === cd.id);
        const _retryMk    = monthKey(year, month);
        const _kyukoAllMatch = (res) => _retryDept.every(s => {
          const tgt = s.kyukoDaysByMonth?.[_retryMk] ?? s.kyukoDays ?? 8;
          const act = Object.values(res[s.id] || {}).filter(v => _RETRY_REST.has(v)).length;
          return act === tgt;
        });
        let _gen = _runGenerateCore(cd, csForGenerate, ct);
        if (!_kyukoAllMatch(_gen.result)) {
          let _best = _gen;
          for (let _r = 1; _r < 50; _r++) {
            const _cand = _runGenerateCore(cd, csForGenerate, ct);
            if (_kyukoAllMatch(_cand.result)) { _best = _cand; break; }
            if (_cand.score > _best.score)    _best = _cand;
          }
          _gen = _best;
          console.error(`[公休保証] リトライ結果: 全員一致=${_kyukoAllMatch(_gen.result)}`);
        }
        const {result, warnings, timelineWarnings, score, ratioFeedback, genSnapshot} = _gen;
        setUndoCount(undoStackRef.current[cd.id].length);

        const _p1_ds = cs.filter(s => s.dept === cd.id);
        applyMinimalChangePhase1(result, genSnapshot, _p1_ds, cd, year, month);
        recomputeGenerateWarnings(result, _p1_ds, cd, year, month, warnings, score, timelineWarnings, setGenerateWarnings);

        // ══ [Temporal-Console-UI] ══
        {
          const _uc_ds    = cs.filter(s => s.dept === cd.id);
          const _uc_days  = getDays(year, month);
          const _uc_tailN = Math.max(3, Math.round(_uc_days * 0.15));
          const _uc_nset  = new Set(['夜勤']);
          if (cd.shiftTypes) cd.shiftTypes.forEach(k => { if (k === '夜勤' || k.startsWith('夜勤')) _uc_nset.add(k); });
          const _uc_isNight = sh => _uc_nset.has(sh);
          const _uc_isRest  = sh => ['休み', '希望休', '有休'].includes(sh);
          const _uc_isWork  = sh => !!(sh && !_uc_isRest(sh) && sh !== '明け' && sh !== '');
          const _uc_fw      = sh => _uc_isNight(sh) ? 3 : sh === '明け' ? 2 : (sh === '早番' || sh === '遅番') ? 1 : 0;
          const _uc_boOf    = totF => totF >= _uc_days * 2.0 ? 'high' : totF >= _uc_days * 1.2 ? 'medium' : 'low';
          const _uc_trd     = name => {
            const k = Object.keys(ct).filter(k => k !== '_months' && k !== '_monthCounts').find(k => nameMatch(k, name));
            return k ? ct[k] : null;
          };
          const _uc_metric  = shiftMap => {
            let totF=0, tlF=0, nCnt=0, rCnt=0, sSq=0, cSq=0, leSq=0;
            for (let d = 1; d <= _uc_days; d++) {
              const sh = shiftMap[d]??'', pv = shiftMap[d-1]??'', nx = shiftMap[d+1]??'';
              totF += _uc_fw(sh);
              if (d > _uc_days - _uc_tailN) tlF += _uc_fw(sh);
              if (_uc_isNight(sh)) nCnt++;
              if (_uc_isRest(sh))  rCnt++;
              if (sh === '明け' && _uc_isNight(pv)) {
                if (_uc_isRest(nx) || !nx) sSq++;
                else if (nx === '早番') cSq++;
                else if (_uc_isWork(nx)) { /* dSq */ }
                else sSq++;
              }
              if (sh === '早番' && d > 1 && pv === '遅番') leSq++;
            }
            const bo = _uc_boOf(totF);
            const co = tlF >= _uc_tailN * 3.0 ? 'high' : tlF >= _uc_tailN * 1.5 ? 'medium' : 'low';
            const rd = rCnt < _uc_days * 0.25 * 0.7 ? 'high' : rCnt < _uc_days * 0.25 ? 'medium' : 'low';
            return { totF, tlF, nCnt, rCnt, sSq, cSq, leSq, bo, co, rd };
          };
          const _uc_stageOf = (fy, fl, nCnt, rr) => {
            if (rr === 'high' && fl < 0.5) return 1;
            if (fl < 0.1 || fy < 0.3)     return 0;
            if (fl < 0.5)                  return 1;
            if (fl < 1.0)                  return 2;
            if (nCnt === 0)                return 3;
            if (fl < 2.0)                  return 4;
            return 5;
          };
          const _UC_FL_G   = 0.08;
          const _UC_RANGES = [[0,0.1],[0.1,0.5],[0.5,1.0],[1.0,1.5],[1.5,2.0],[2.0,4.0]];
          const _uc_progOf = (stage, fl, sSq, cSq, bo, co, leSq) => {
            const [lo, hi] = _UC_RANGES[Math.min(stage, 5)];
            const base   = Math.min(1.0, Math.max(0.0, (fl - lo) / Math.max(0.01, hi - lo)));
            const seqAdj = sSq > 0 && cSq === 0 ? +0.10 : cSq > 0 ? -0.15 : 0;
            const fatAdj = bo === 'high' ? -0.15 : bo === 'low' && co === 'low' ? +0.05 : 0;
            const leAdj  = leSq > 0 ? -0.05 : 0;
            return Math.min(1.0, Math.max(0.0, base + seqAdj + fatAdj + leAdj));
          };
          const _uc_ladderOf = (stage, fl, nCnt, bo, progress, nightOk, hasPair) => {
            if (!nightOk)                                   return 0;
            if (stage >= 5 && bo !== 'high')                return 5;
            if (stage >= 4 && nCnt >= 2 && bo !== 'high')  return 4;
            if (nCnt >= 1)                                  return 3;
            if (stage >= 3 && progress >= 0.6 && hasPair)  return 2;
            if (stage >= 2 && fl >= 0.5)                   return 1;
            return 0;
          };
          const _uc_futBo = (bo, co, sSq, cSq, t) => {
            const ord = { low:0, medium:1, high:2 };
            let v = ord[bo];
            if (co === 'high' && cSq > 0)        v = Math.min(2, v + Math.floor(t / 2));
            else if (co === 'high' && sSq > 0)   v = Math.min(2, v + Math.floor(t / 3));
            else if (bo === 'high' && sSq > 0)   v = Math.max(0, v - Math.floor(t / 2));
            else if (bo === 'medium' && sSq > 0) v = Math.max(0, v - Math.floor(t / 3));
            return ['low','medium','high'][Math.max(0, Math.min(2, v))];
          };

          // pair co-occurrence
          const _uc_pco = {};
          for (let d = 1; d <= _uc_days; d++) {
            const nw = _uc_ds.filter(s => _uc_isNight(result[s.id]?.[d] ?? ''));
            for (let i = 0; i < nw.length; i++)
              for (let j = i + 1; j < nw.length; j++) {
                const pk = [nw[i].name, nw[j].name].sort().join('×');
                _uc_pco[pk] = (_uc_pco[pk] || 0) + 1;
              }
          }
          const _uc_fp = Object.entries(_uc_pco).filter(([, n]) => n >= _uc_days * 0.4).map(([k]) => k.split('×'));

          // per-staff state
          const _uc_arr = [];
          for (const s of _uc_ds) {
            const m     = _uc_metric(result[s.id] || {});
            const tr    = _uc_trd(s.name);
            const wk    = tr?._workTotal ?? 0;
            const isNew = wk < 30;
            const fy    = s.facilityYears ?? (isNew ? 0.3 : Math.min(5, wk / 30 * 0.5 + 0.5));
            const fl    = s.floorYears    ?? (isNew ? 0.2 : 1.5);
            const rr    = (fy >= 2 && fl < 0.5) ? 'high' : (fy >= 1 && fl < 0.3) ? 'medium' : 'low';
            const stage    = _uc_stageOf(fy, fl, m.nCnt, rr);
            const progress = _uc_progOf(stage, fl, m.sSq, m.cSq, m.bo, m.co, m.leSq);
            const hasPair  = _uc_fp.some(p => p.includes(s.name));
            const ladder   = _uc_ladderOf(stage, fl, m.nCnt, m.bo, progress, !!s.nightOk, hasPair);
            _uc_arr.push({ s, fy, fl, rr, stage, progress, hasPair, ladder, nightOk: !!s.nightOk, isNew, ...m });
          }

          // ── Layer 1: Risk Dashboard ──
          const _uc_boH    = _uc_arr.filter(st => st.bo === 'high').map(st => st.s.name);
          const _uc_supR   = _uc_arr.filter(st => st.hasPair && st.bo === 'high').map(st => st.s.name);
          const _uc_unsafe = _uc_arr.filter(st => (st.stage <= 1 || st.rr === 'high') && st.nCnt >= 1).map(st => st.s.name);
          const _uc_core   = _uc_arr.filter(st => st.ladder >= 4 && st.bo !== 'high');
          const _uc_growSt = _uc_arr.filter(st => st.ladder >= 1 && st.ladder <= 2 && st.progress < 0.4).map(st => st.s.name);
          const _uc_reloc  = _uc_arr.filter(st => st.rr === 'high').map(st => st.s.name);
          const _uc_safeN  = _uc_arr.filter(st => st.sSq > 0 && st.cSq === 0).length;
          const _uc_critical = _uc_unsafe.length + (_uc_core.length === 0 ? 1 : 0);

          const riskDash = {
            burnoutHigh: _uc_boH,
            supportRisk: _uc_supR,
            unsafeCandidates: _uc_unsafe,
            nightCoreCount: _uc_core.length,
            growthStagnation: _uc_growSt,
            relocationRisk: _uc_reloc,
            safeSeqStableCount: _uc_safeN,
            totalIssues: _uc_boH.length + _uc_supR.length + _uc_unsafe.length + _uc_growSt.length,
            critical: _uc_critical,
          };

          // ── Layer 2: Future Timeline ──
          const _uc_timePoint = t => {
            const burnoutHigh  = _uc_arr.filter(st => _uc_futBo(st.bo, st.co, st.sSq, st.cSq, t) === 'high').length;
            const coreCount    = _uc_arr.filter(st => {
              const ffl  = st.fl + _UC_FL_G * t, fFy = st.fy + t / 12;
              const fBo  = _uc_futBo(st.bo, st.co, st.sSq, st.cSq, t);
              const fRr  = (fFy >= 2 && ffl < 0.5) ? 'high' : (fFy >= 1 && ffl < 0.3) ? 'medium' : 'low';
              const fStg = _uc_stageOf(fFy, ffl, st.nCnt, fRr);
              const fPrg = _uc_progOf(fStg, ffl, st.sSq, st.cSq, fBo, st.co, st.leSq);
              const fLad = _uc_ladderOf(fStg, ffl, st.nCnt, fBo, fPrg, st.nightOk, st.hasPair);
              return fLad >= 4 && fBo !== 'high';
            }).length;
            const ladderUp     = _uc_arr.filter(st => {
              const ffl  = st.fl + _UC_FL_G * t;
              const fBo  = _uc_futBo(st.bo, st.co, st.sSq, st.cSq, t);
              const fRr  = ((st.fy + t/12) >= 2 && ffl < 0.5) ? 'high' : ((st.fy + t/12) >= 1 && ffl < 0.3) ? 'medium' : 'low';
              const fStg = _uc_stageOf(st.fy + t/12, ffl, st.nCnt, fRr);
              const fPrg = _uc_progOf(fStg, ffl, st.sSq, st.cSq, fBo, st.co, st.leSq);
              const fLad = _uc_ladderOf(fStg, ffl, st.nCnt, fBo, fPrg, st.nightOk, st.hasPair);
              return fLad > st.ladder;
            }).length;
            const supportStable = _uc_arr.filter(st => _uc_futBo(st.bo, st.co, st.sSq, st.cSq, t) !== 'high' && st.ladder >= 2).length;
            const note = t === 1 && burnoutHigh < riskDash.burnoutHigh.length ? '回復傾向あり' :
                         t === 3 && coreCount > _uc_core.length ? 'core候補増加見込み' :
                         t === 6 && ladderUp > 0 ? `ladder上昇候補 ${ladderUp}名` : '';
            return { burnoutHigh, coreCount, ladderUp, supportStable, note };
          };
          const futureTimeline = {
            now: _uc_timePoint(0),
            t1:  _uc_timePoint(1),
            t3:  _uc_timePoint(3),
            t6:  _uc_timePoint(6),
          };

          // ── Layer 3: Recommendations ──
          const recommendations = [];
          for (const st of _uc_arr) {
            if (st.bo === 'high' && st.nCnt >= 1 && st.stage >= 3) {
              recommendations.push({
                name: st.s.name,
                rule: `夜勤 ${st.nCnt}→${Math.max(0, st.nCnt - 1)}回`,
                reason: 'burnout高: 緩やかな削減推奨',
                tradeoff: _uc_core.some(c => c.s.name === st.s.name) ? 'core欠員リスク' : '',
                govLevel: 'ALLOW',
                rollbackOk: true,
              });
            } else if (st.ladder >= 1 && st.ladder <= 2 && st.progress >= 0.75 && st.bo !== 'high') {
              recommendations.push({
                name: st.s.name,
                rule: `ladder ${st.ladder}→${st.ladder + 1} 準備開始`,
                reason: `progress ${(st.progress * 100).toFixed(0)}% 達成`,
                tradeoff: st.hasPair ? 'supportペア調整必要' : '',
                govLevel: 'REVIEW',
                rollbackOk: true,
              });
            }
          }

          // ── Layer 4: Sandbox Comparison ──
          const _uc_sbBo    = _uc_arr.filter(st => st.bo === 'high' && st.nCnt >= 1 && st.stage >= 3).length;
          const _uc_sbAfter = Math.max(0, _uc_sbBo - recommendations.filter(r => r.govLevel === 'ALLOW').length);
          const sandboxComp = {
            before: {
              burnoutHigh: _uc_boH.length,
              coreCount:   _uc_core.length,
              unsafeCount: _uc_unsafe.length,
            },
            after: {
              burnoutHigh: Math.max(0, _uc_boH.length - _uc_sbBo + _uc_sbAfter),
              coreCount:   _uc_core.length,
              unsafeCount: _uc_unsafe.length,
              afterNote:   'core/unsafe は構造的指標のため介入後も変化なし',
            },
            preserved: [
              ...((_uc_core.length > 0) ? ['nightCore構造'] : []),
              ...(_uc_arr.filter(st => st.sSq > 0 && st.cSq === 0).length > 0 ? ['safeSequence'] : []),
            ],
            newRisks: [
              ...(_uc_core.length === 0 ? ['core欠員'] : []),
              ...(_uc_unsafe.length > 0 ? ['unsafe継続'] : []),
            ],
          };

          // ── Layer 5: Governance Panel ──
          const _uc_permRules = [
            { id:'gradualNightReduction', test:st=>st.bo==='high'&&st.nCnt>=1&&st.stage>=3, perm:'ALLOW', reason:'burnout回復・リスク低' },
            { id:'burnoutRecoveryAdd',    test:st=>st.bo==='high'&&st.sSq===0,              perm:'ALLOW', reason:'safeSeq補填' },
            { id:'supportPairChange',     test:st=>st.hasPair&&st.ladder>=2,                perm:'REVIEW',reason:'support continuity影響' },
            { id:'ladderAcceleration',    test:st=>st.ladder>=1&&st.ladder<=3&&st.progress>=0.7&&st.bo!=='high', perm:'REVIEW', reason:'段階飛ばしリスク' },
            { id:'nightCoreChange',       test:st=>st.ladder>=4,                            perm:'REVIEW',reason:'運用影響大' },
            { id:'unsafeNightPromotion',  test:st=>(st.stage<=1||st.rr==='high')&&st.nCnt===0&&!!st.nightOk, perm:'BLOCK', reason:'stage不足/relocation中' },
            { id:'burnoutRecoveryDestroy',test:st=>st.bo==='high'&&st.sSq>0&&st.cSq>0,     perm:'BLOCK', reason:'回復シーケンス破壊禁止' },
          ];
          const govPanel = {
            allow: [], review: [], block: [],
            mandatoryApprovals: _uc_arr.filter(st => st.bo==='high'||st.ladder>=4||st.rr==='high').map(st=>st.s.name),
            blockCount: 0,
          };
          for (const rule of _uc_permRules) {
            const affected = _uc_arr.filter(st => rule.test(st));
            for (const st of affected) {
              const entry = { name: st.s.name, rule: rule.id, reason: rule.reason };
              if (rule.perm === 'ALLOW')  govPanel.allow.push(entry);
              if (rule.perm === 'REVIEW') govPanel.review.push(entry);
              if (rule.perm === 'BLOCK')  { govPanel.block.push(entry); }
            }
          }
          govPanel.blockCount = govPanel.block.length;

          // ── Layer 6: Readability Audit ──
          const _uc_bbCount    = _uc_arr.filter(st => {
            const sc = (st.bo!=='low'?1:0)+(st.cSq>0?1:0)+(st.sSq>0?1:0)+(st.leSq>0?1:0)+(st.rr!=='low'?1:0);
            return sc >= 4;
          }).length;
          const _uc_govScore   = [
            true,                          // humanControl always maintained
            _uc_unsafe.length === 0,       // unsafeBlock
            _uc_core.length > 0,           // operationalRealism
            govPanel.blockCount === 0,     // block clean
            _uc_bbCount <= 2,              // explainability
          ].filter(Boolean).length;
          const readability = {
            clarity:            recommendations.length <= 5 ? 'high' : 'medium',
            operationalRealism: _uc_core.length >= (cd.minStaff?.['夜勤'] ?? 1),
            aiDominance:        recommendations.length <= 2 ? 'low' : recommendations.length <= 5 ? 'medium' : 'high',
            infoOverload:       riskDash.totalIssues > Math.max(3, Math.floor(_uc_ds.length * 0.5)),
            tradeoffVisible:    recommendations.length === 0 || recommendations.every(r => r.tradeoff !== undefined && r.tradeoff !== ''),
            overall:            _uc_govScore >= 4 ? 'humanOperationalConsole' : _uc_govScore >= 2 ? 'partialConsole' : 'aiDominant',
          };

          // ── maturity label ──
          const _uc_maturity = _uc_critical === 0 && _uc_unsafe.length === 0
            ? 'STABLE' : _uc_critical >= 2 ? 'CRITICAL' : 'ADVISORY';

          setTemporalConsole({
            dept: cd.id, year, month,
            generatedAt: new Date().toISOString(),
            maturity: _uc_maturity,
            riskDash, futureTimeline, recommendations, sandboxComp, govPanel, readability,
            xfData: null,
          });
        }
        // ══ [Temporal-Console-UI] ここまで ══

        setAllShifts(prev => ({...prev, [cd.id]: result}));
        // 比率達成フィードバックをスタッフに書き戻す（次回生成の補正に利用）
        if (ratioFeedback && Object.keys(ratioFeedback).length > 0) {
          setStaffList(prev => prev.map(s => {
            const fb = ratioFeedback[s.id];
            if (!fb) return s;
            return {...s, shiftRatioCorrection: fb};
          }));
        }
        setSaveStatus("unsaved");
      }
      catch(e){console.error(e);alert("自動生成エラー: "+e.message);}
      finally{setGenerating(false);}
    },700);
  }, [staffList,dept,year,month,learnedTrend,_runGenerateCore]);

  const handleGenerateAllKaigo = useCallback(() => {
    if (generateTimerRef.current) clearTimeout(generateTimerRef.current);
    setGenerating(true);
    isInitializing.current = false;
    const _gen_refDate = new Date();
    const cs = staffList.map(s => {
      const fy = s.facilityJoinDate ? deriveYears(s.facilityJoinDate, _gen_refDate) : (s.facilityYears ?? null);
      const fl = s.floorJoinDate    ? deriveYears(s.floorJoinDate,    _gen_refDate) : (s.floorYears    ?? null);
      return { ...s, facilityYears: fy, floorYears: fl };
    });
    generateTimerRef.current = setTimeout(() => {
      if (year !== yearRef.current || month !== monthRef.current) {
        setGenerating(false);
        return;
      }
      userEditSeq.current++;
      saveStatusRef.current = "unsaved";
      try {
        const newShifts = {};
        const allRatioFeedback = {};
        const targetDeptIds = ['kaigo1', 'kaigo2'].filter(id => depts.some(d => d.id === id));
        for (const deptId of targetDeptIds) {
          const cd = depts.find(d => d.id === deptId);
          if (!cd) continue;
          const ct = learnedTrend;
          const { result, ratioFeedback } = _runGenerateCore(cd, cs, ct);
          newShifts[deptId] = result;
          if (ratioFeedback) Object.assign(allRatioFeedback, ratioFeedback);
        }
        setUndoCount(undoStackRef.current[activeDeptIdRef.current]?.length ?? 0);
        setAllShifts(prev => ({...prev, ...newShifts}));
        if (Object.keys(allRatioFeedback).length > 0) {
          setStaffList(prev => prev.map(s => {
            const fb = allRatioFeedback[s.id];
            if (!fb) return s;
            return {...s, shiftRatioCorrection: fb};
          }));
        }
        setSaveStatus("unsaved");
      }
      catch(e){console.error(e);alert("自動生成エラー: "+e.message);}
      finally{setGenerating(false);}
    }, 700);
  }, [staffList, depts, year, month, learnedTrend, _runGenerateCore]);

  const handleUndo = useCallback(() => {
    if (isLockedRef.current) return;
    const stack = undoStackRef.current[activeDeptId] || [];
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    undoStackRef.current[activeDeptId] = stack.slice(0, -1);
    setUndoCount(undoStackRef.current[activeDeptId].length);
    userEditSeq.current++;
    saveStatusRef.current = "unsaved";
    setAllShifts(prev => ({...prev, [activeDeptId]: previous}));
  }, [activeDeptId]);

  // Ctrl+Z / ⌘+Z でアンドゥ
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo]);

  const handleLeftClick = useCallback((staffId, day) => {
    if (isLockedRef.current) return;
    if (isMonthLoading) return; // 月ロード中は操作ブロック
    activeCellRef.current = { staffId, day, time: Date.now() }; // アクティブセル記録（Realtime上書き保護）
    setDeptShifts(prev=>{const cur=prev[staffId]?.[day]||"";const HALF=new Set(["日/休","休/日","早/休","休/遅"]);if(HALF.has(cur))return prev;const s=staffList.find(x=>x.id===staffId);const roleAllowed=s?dept?.roleShiftTypes?.[s.role]:null;const keys=roleAllowed?SHIFT_KEYS.filter(k=>!WORK_TYPES.has(k)||roleAllowed.includes(k)):SHIFT_KEYS;const idx=keys.indexOf(cur);const next=keys[(idx+1)%keys.length];return{...prev,[staffId]:{...(prev[staffId]||{}),[day]:next}};});
  }, [setDeptShifts, staffList, dept]);

  const handleRightClick = useCallback((staffId, day, e, selCells) => {
    if (isLockedRef.current) return;
    if (isMonthLoading) return; // 月ロード中は操作ブロック
    setCtxMenu({staffId,day,x:e.clientX+4,y:e.clientY+4,selCells:selCells||null});
  }, []);
  const handleMenuSelect = (shiftKey) => {
    if (!ctxMenu) return;
    const {staffId, day, selCells} = ctxMenu;
    if (selCells && selCells.size > 1) {
      setDeptShifts(prev => {
        const next = {...prev};
        for (const cellKey of selCells) {
          const lastPipe = cellKey.lastIndexOf('|');
          const sid = cellKey.slice(0, lastPipe);
          const d = parseInt(cellKey.slice(lastPipe + 1));
          next[sid] = {...(next[sid] || {}), [d]: shiftKey};
        }
        return next;
      });
    } else {
      setDeptShifts(prev=>({...prev,[staffId]:{...(prev[staffId]||{}),[day]:shiftKey}}));
    }
    setCtxMenu(null);
  };

  const saveStaff = (form) => { setStaffList(prev=>{const idx=prev.findIndex(s=>s.id===form.id);if(idx>=0)return prev.map((s,i)=>i===idx?form:s);return[...prev,{...form,id:`${activeDeptId}_${Date.now()}`,dept:activeDeptId}];}); setStaffModal(null); };
  const deleteStaff = (id) => { const s=staffList.find(x=>x.id===id); setConfirmDialog({message:`「${s?.name||'このスタッフ'}」を削除します。\nよろしいですか？`,onOk:()=>setStaffList(prev=>prev.filter(x=>x.id!==id)),okLabel:"削除する"}); };
  const handleBulkKyuko = (days, mk) => { setStaffList(prev=>prev.map(s=>({...s,kyukoDaysByMonth:{...(s.kyukoDaysByMonth||{}),[mk]:days}}))); setBulkKyukoModal(false); };

  const prevMonth = ()=>{ if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextMonth = ()=>{ if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };

  const handleSaveDept = (deptData) => { const isNew=!depts.find(d=>d.id===deptData.id); setDepts(prev=>{const idx=prev.findIndex(d=>d.id===deptData.id);if(idx>=0)return prev.map((d,i)=>i===idx?deptData:d);return[...prev,deptData];}); if(isNew)setActiveDeptId(deptData.id); setDeptSettingModal(null); };
  const handleDeleteDept = (deptId) => { if(depts.length<=1){alert("部署は最低1つ必要です。");return;} if(activeDeptId===deptId){const next=depts.find(d=>d.id!==deptId);if(next)setActiveDeptId(next.id);} setDepts(prev=>prev.filter(d=>d.id!==deptId)); setStaffList(prev=>prev.filter(s=>s.dept!==deptId)); setAllShifts(prev=>{const n={...prev};delete n[deptId];return n;}); setDeptSettingModal(null); };

  if (dbLoading) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#FAFAFA,#F4F4F5)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans JP',sans-serif",userSelect:"none",pointerEvents:"none"}}>
      <div style={{textAlign:"center"}}>
        <div style={{margin:"0 auto 12px"}}><ShifuponIcon size={56} radius={14}/></div>
        <div style={{color:"#6366F1",fontSize:14,fontWeight:700,marginBottom:6}}>データを読み込み中…</div>
        <div style={{color:"#71717A",fontSize:11}}>クラウドから最新データを取得しています</div>
        <div style={{color:"#a0d4d2",fontSize:10,marginTop:4}}>この間はデータの書き込みを一切行いません</div>
      </div>
    </div>
  );
  if (!dept) return <div style={{minHeight:"100vh",background:"#FAFAFA",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#c8b8a8",fontSize:14}}>読み込み中…</div></div>;

  return (
    <div style={{width:"100%",minHeight:"100vh",boxSizing:"border-box",background:"#F8F9FA",fontFamily:"'Inter','Noto Sans JP',sans-serif",color:"#18181B",maxWidth:"none",margin:0,padding:0,textAlign:"left"}}>
      {/* TOPBAR */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid #E5E7EB",padding:"0 20px",height:52,position:"sticky",top:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <ShifuponIcon size={32} radius={8}/>
          <div>
            <ShifuponLogo size={16}/>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          <button onClick={prevMonth} style={MNAV}><ChevronLeft size={18} strokeWidth={2}/></button>
          <div style={{fontSize:14,fontWeight:600,color:"#111827",minWidth:110,textAlign:"center",background:"#F8FAFC",border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 12px",letterSpacing:"0.01em"}}>{year}年 {month+1}月</div>
          <button onClick={nextMonth} style={MNAV}><ChevronRight size={18} strokeWidth={2}/></button>
        </div>
        {conflictBanner&&<span title="他の端末でデータが更新されました。保存完了後に自動反映されます。" style={{fontSize:15,cursor:"default",animation:"pulse 1.2s infinite",lineHeight:1,flexShrink:0}}>📡</span>}
        <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:"auto"}}>
          <div style={{fontSize:11,fontWeight:600,color:saveStatus==="saved"?"#22C55E":saveStatus==="error"?"#EF4444":"#F59E0B",display:"flex",alignItems:"center",gap:3,minWidth:isMobile?0:52}}>
            {saveStatus==="saved"&&<><RefreshCw size={11} strokeWidth={2}/>{!isMobile&&<span>保存済</span>}</>}
            {saveStatus==="unsaved"&&<><Loader size={11} strokeWidth={2}/>{!isMobile&&<span>未保存</span>}</>}
            {saveStatus==="error"&&<><span style={{color:"#EF4444"}}>!</span><span>保存失敗</span></>}
          </div>
          {isLocked
            ? <button onClick={()=>setPinModal(true)} style={{background:"#374151",color:"#fff",border:"none",borderRadius:8,padding:"0 14px",height:36,cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}><Lock size={14} strokeWidth={2}/>{!isMobile&&" 解錠する"}</button>
            : <button onClick={handleGenerate} disabled={generating||saveStatus==="unsaved"||isMonthLoading} title={isMonthLoading?"データ読み込み中です":saveStatus==="unsaved"?"同期完了後に使用できます":undefined} style={{background:(generating||saveStatus==="unsaved"||isMonthLoading)?"#E5E7EB":"#2563EB",color:(generating||saveStatus==="unsaved"||isMonthLoading)?"#9CA3AF":"#FFFFFF",border:"none",borderRadius:8,padding:"0 14px",height:36,cursor:(generating||saveStatus==="unsaved"||isMonthLoading)?"not-allowed":"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5,opacity:(saveStatus==="unsaved"||isMonthLoading)?0.6:1}}><Zap size={14} strokeWidth={2}/>{generating?" 最適化中…":isMonthLoading?" 読込中…":" 自動生成"}</button>
          }
          <button onClick={()=>setDownloadModal(true)} disabled={saveStatus==="unsaved"} title={saveStatus==="unsaved"?"同期完了後に使用できます":undefined} style={{background:"#FFFFFF",color:"#374151",border:"1px solid #E5E7EB",borderRadius:8,padding:"0 12px",height:36,cursor:saveStatus==="unsaved"?"not-allowed":"pointer",fontSize:12,fontWeight:500,opacity:saveStatus==="unsaved"?0.5:1,display:"flex",alignItems:"center",gap:5}}><Download size={14} strokeWidth={2}/>{!isMobile&&" 書き出し"}</button>
          <button onClick={()=>setBulkKyukoModal(true)} style={{background:"#FFFFFF",color:"#374151",border:"1px solid #E5E7EB",borderRadius:8,padding:"0 12px",height:36,cursor:"pointer",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:5}}><Calendar size={14} strokeWidth={2}/>{!isMobile&&" 休み設定"}</button>
          {/* Overflow [•••] */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setOverflowOpen(o=>!o)} style={{background:overflowOpen?"#F1F5F9":"#FFFFFF",color:"#374151",border:"1px solid #E5E7EB",borderRadius:8,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="その他のメニュー"><MoreHorizontal size={16} strokeWidth={2}/></button>
            {overflowOpen&&<>
              <div style={{position:"fixed",inset:0,zIndex:99}} onClick={()=>setOverflowOpen(false)}/>
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#FFFFFF",border:"1px solid #E5E7EB",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.10)",zIndex:100,minWidth:180,overflow:"hidden",padding:"4px 0"}}>
                {(()=>{const learnedCnt=Object.keys(learnedTrend).filter(k=>k!=='_monthCounts').length;const hasAny=learnedCnt>0;const pct=syncRate??0;const barColor=pct>=85?"#16A34A":pct>=70?"#D97706":"#2563EB";return(
                  <div onClick={()=>{setExcelPasteModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151",borderBottom:"1px solid #F1F5F9"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <ClipboardList size={14} strokeWidth={2} style={{color:"#6B7280",flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:500}}>貼付 / 傾向学習</div>
                      {hasAny&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}><div style={{width:56,height:3,background:"#E5E7EB",borderRadius:2}}><div style={{width:`${pct}%`,height:"100%",background:barColor,borderRadius:2}}/></div><span style={{fontSize:10,color:"#6B7280"}}>シンクロ率 {syncRate!=null?syncRate+'%':'--'}</span></div>}
                    </div>
                  </div>
                );})()}
                <div onClick={()=>{setHistoryModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><History size={14} strokeWidth={2} style={{color:"#6B7280"}}/><span>履歴から復元</span></div>
                <div onClick={()=>{setShareModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><Share2 size={14} strokeWidth={2} style={{color:"#6B7280"}}/><span>共有</span></div>
                {profile?.is_admin&&<div onClick={()=>{setAdminModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><Building2 size={14} strokeWidth={2} style={{color:"#6B7280"}}/><span>管理</span></div>}
                <div onClick={()=>{setHelpModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><HelpCircle size={14} strokeWidth={2} style={{color:"#6B7280"}}/><span>ヘルプ</span></div>
                {!isLocked&&<><div style={{height:1,background:"#F1F5F9",margin:"4px 0"}}/>
                <div onClick={()=>{setClearModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#DC2626"}} onMouseEnter={e=>e.currentTarget.style.background="#FEF2F2"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><Trash2 size={14} strokeWidth={2}/><span>シフトをクリア</span></div></>}
              </div>
            </>}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",marginLeft:4}} onClick={onLogout}>
            <span style={{fontSize:10,fontWeight:700,color:PLAN_COLORS[profile?.plan||'free'],background:"#fff",border:`1px solid ${PLAN_COLORS[profile?.plan||'free']}`,borderRadius:6,padding:"1px 7px",marginBottom:2}}>{PLAN_LABELS[profile?.plan||'free']}</span>
            <span style={{fontSize:10,color:"#9CA3AF",fontWeight:500,display:"flex",alignItems:"center",gap:2}}><LogOut size={10} strokeWidth={2}/> ログアウト</span>
          </div>
        </div>
      </div>

      {/* DEPT TABS */}
      <div style={{background:"#F8FAFC",borderBottom:"1px solid #E5E7EB",display:"flex",overflowX:"auto",padding:"0 16px",alignItems:"center"}}>
        {depts.map(d=>{const cnt=staffList.filter(s=>s.dept===d.id).length,act=d.id===activeDeptId;return(<div key={d.id} style={{display:"flex",alignItems:"center",position:"relative"}}><button onClick={()=>setActiveDeptId(d.id)} style={{padding:"10px 14px",background:"transparent",border:"none",borderBottom:act?"2px solid #2563EB":"2px solid transparent",color:act?"#111827":"#6B7280",borderRadius:0,cursor:"pointer",fontSize:12,fontWeight:act?600:400,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5,margin:"0 1px"}}><span>{d.label}</span><span style={{background:act?"#EFF6FF":"#F1F5F9",color:act?"#2563EB":"#9CA3AF",borderRadius:4,padding:"1px 5px",fontSize:10,fontWeight:600}}>{cnt}</span></button>{act&&<button onClick={()=>setDeptSettingModal({dept:d,isNew:false})} style={{background:"transparent",border:"1px solid #E5E7EB",borderRadius:6,color:"#9CA3AF",cursor:"pointer",padding:"3px 6px",marginLeft:2,display:"flex",alignItems:"center"}}><Settings size={13} strokeWidth={2}/></button>}</div>);})}
        <button onClick={()=>setDeptSettingModal({dept:null,isNew:true})} style={{background:"none",border:"1px dashed #E5E7EB",borderRadius:6,color:"#9CA3AF",cursor:"pointer",fontSize:11,padding:"5px 11px",marginLeft:8,whiteSpace:"nowrap",flexShrink:0}}>＋ 追加</button>
      </div>

      {/* INNER TABS */}
      <div style={{background:"#F8F9FA",borderBottom:"1px solid #E4E4E7",display:"flex",padding:"0 8px",gap:2,alignItems:"center",overflowX:"auto"}}>
        {[["shift","シフト表"],["staff","スタッフ"],["jisseki","実績"]].map(([k,l])=><button key={k} onClick={()=>setInnerTab(k)} style={{padding:"10px 16px",background:"transparent",border:"none",color:innerTab===k?"#18181B":"#71717A",borderBottom:innerTab===k?"2px solid #2563EB":"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:innerTab===k?700:500,whiteSpace:"nowrap",flexShrink:0}}>{l}</button>)}
        <button onClick={()=>setInnerTab("console")} style={{padding:"10px 16px",background:"transparent",border:"none",color:innerTab==="console"?"#18181B":"#71717A",borderBottom:innerTab==="console"?"2px solid #2563EB":"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:innerTab==="console"?700:500,whiteSpace:"nowrap",flexShrink:0}}>コンソール</button>
        {profile?.plan==='free'
          ? <button onClick={()=>alert("予定表機能はスタンダード・フルプランでご利用いただけます。\nプランのアップグレードはお問い合わせください。")} style={{padding:"10px 16px",background:"transparent",border:"none",color:"#9CA3AF",borderBottom:"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:500,whiteSpace:"nowrap",flexShrink:0,display:"flex",alignItems:"center",gap:4}}><Lock size={13} strokeWidth={2}/> 予定表</button>
          : <button onClick={()=>setInnerTab("yotei")} style={{padding:"10px 16px",background:"transparent",border:"none",color:innerTab==="yotei"?"#18181B":"#71717A",borderBottom:innerTab==="yotei"?"2px solid #2563EB":"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:innerTab==="yotei"?700:500,whiteSpace:"nowrap",flexShrink:0}}>予定表</button>
        }
        {!isMobile&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          {innerTab==="shift"&&(
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="range" min={30} max={100} step={5} value={tableZoom} onChange={e=>handleZoomChange(Number(e.target.value))} style={{width:100,accentColor:"#6366F1",cursor:"pointer"}}/>
              <span style={{fontSize:12,fontWeight:600,color:"#6B7280",minWidth:36,textAlign:"right"}}>{tableZoom}%</span>
              <button onClick={()=>{const days=getDays(year,month);const ds=staffList.filter(s=>s.dept===activeDeptId).length;handleZoomChange(autoFitZoom(ds,days));}} style={{background:"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:8,color:"#6B7280",fontSize:11,padding:"4px 8px",cursor:"pointer",whiteSpace:"nowrap",fontWeight:500}}>フィット</button>
              {!isLocked && undoCount > 0 && <button onClick={handleUndo} title={`元に戻す (Ctrl+Z) — ${undoCount}ステップ`} style={{background:"#EFF6FF",color:"#3B82F6",border:"1px solid #BFDBFE",borderRadius:8,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3,whiteSpace:"nowrap"}}>↩ 戻す ×{undoCount}</button>}
            </div>
          )}
          <div style={{fontSize:11,color:"#9CA3AF",padding:"0 4px",whiteSpace:"nowrap"}}>最低配置：{Object.entries(dept.minStaff||{}).map(([k,v])=>`${k}×${v}`).join(" / ")}</div>
        </div>}
      </div>
      {/* スマホ用ズームコントロール行 */}
      {isMobile&&innerTab==="shift"&&(
        <div style={{background:"#F8F9FA",borderBottom:"1px solid #E4E4E7",display:"flex",alignItems:"center",gap:6,padding:"6px 10px"}}>
          <input type="range" min={30} max={100} step={5} value={tableZoom} onChange={e=>handleZoomChange(Number(e.target.value))} style={{flex:1,accentColor:"#6366F1",cursor:"pointer"}}/>
          <span style={{fontSize:12,fontWeight:600,color:"#6B7280",minWidth:36,textAlign:"right"}}>{tableZoom}%</span>
          <button onClick={()=>{const days=getDays(year,month);const ds=staffList.filter(s=>s.dept===activeDeptId).length;handleZoomChange(autoFitZoom(ds,days));}} style={{background:"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:8,color:"#6B7280",fontSize:10,padding:"4px 8px",cursor:"pointer",whiteSpace:"nowrap"}}>フィット</button>
          {!isLocked && undoCount > 0 && <button onClick={handleUndo} style={{background:"#EFF6FF",color:"#3B82F6",border:"1px solid #BFDBFE",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:600}}>↩×{undoCount}</button>}
        </div>
      )}

      {/* CONTENT */}
      <div style={{padding:"8px 12px",minHeight:"calc(100vh - 180px)"}}>
        {innerTab==="shift"&&(<><Legend/><div style={{position:"relative"}}>
          {isMonthLoading&&<div style={{position:"absolute",inset:0,zIndex:50,background:"rgba(240,251,250,0.85)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,backdropFilter:"blur(2px)"}}>
            <div style={{background:"#fff",border:"1px solid #6366F1",borderRadius:12,padding:"18px 32px",fontWeight:800,fontSize:14,color:"#4F46E5",boxShadow:"0 4px 16px rgba(43,191,186,0.2)",display:"flex",alignItems:"center",gap:10}}>
              <span style={{display:"inline-block",animation:"spin 1s linear infinite",fontSize:20}}>⏳</span>シフトデータを読み込んでいます…
            </div>
          </div>}
          <ZoomWrapper zoom={tableZoom} onZoomChange={handleZoomChange}><ShiftTable staffList={staffList} shifts={deptShifts} dept={dept} year={year} month={month} onLeftClick={handleLeftClick} onRightClick={handleRightClick} events={allEvents[activeDeptId]?.[monthKey(year,month)]||{}} onEventEdit={(d)=>setEventEditDay(d)}/></ZoomWrapper>
        </div></>)}
        {innerTab==="summary"&&<SummaryView staffList={staffList} shifts={deptShifts} dept={dept} year={year} month={month}/>}
        {innerTab==="staff"&&<StaffList staffList={staffList} dept={dept} year={year} month={month} onEdit={s=>setStaffModal({data:s})} onDelete={deleteStaff} onAdd={()=>setStaffModal({data:null})}/>}
        {innerTab==="jisseki"&&<JissekiView staffList={staffList} allJisseki={allJisseki} allShifts={allShifts} dept={dept} year={year} month={month} onCellClick={(s,d,planned)=>setJissekiModal({staff:s,day:d,planned})} onBulkCopy={bulkCopyPlanned} onClearZero={bulkClearZeroRec} onClearAll={async()=>{if(!window.confirm("この月の全実績を削除します。よろしいですか？"))return;await clearDeptJisseki();}} defaultTimes={jissekiDefaults[activeDeptId]||{}} onDefaultsChange={defs=>saveJissekiDefaultsForDept(activeDeptId,defs)} onXlsExport={async()=>{const data=await buildJissekiXLSX(staffList,allJisseki,allShifts,year,month,activeDeptId);triggerDownload(new Uint8Array(data),`実績_${year}年${month+1}月_${dept?.label||''}.xlsx`,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");}} onCsvExport={()=>{const csv=buildJissekiCSV(staffList,allJisseki,allShifts,year,month,activeDeptId);triggerDownload(csv,`実績_${year}年${month+1}月_${dept?.label||''}.csv`,"text/csv;charset=utf-8");}}/>}
        {innerTab==="yotei"&&<YoteiView dept={dept} staffList={staffList} shifts={deptShifts} year={year} month={month} yoteiDeptData={deptYotei} onUpdateYotei={handleUpdateYotei} onBatchUpdateYotei={handleBatchUpdateYotei} floorSettings={floorSettings} onUpdateFloorSettings={handleUpdateFloorSettings}/>}
        {innerTab==="console"&&<TemporalConsolePanel data={temporalConsole&&temporalConsole.dept===activeDeptId?temporalConsole:null} consoleSection={consoleSection} setConsoleSection={setConsoleSection}/>}
      </div>

      {jissekiModal&&<JissekiInputModal staffName={jissekiModal.staff.name} day={jissekiModal.day} year={year} month={month} plannedShift={jissekiModal.planned} record={allJisseki[activeDeptId]?.[jissekiModal.staff.id]?.[jissekiModal.day]} deptShiftTypes={dept?.shiftTypes||["早番","日勤","遅番","夜勤"]} onSave={rec=>{saveJisseki(jissekiModal.staff.id,jissekiModal.day,rec);setJissekiModal(null);}} onClear={()=>{clearJisseki(jissekiModal.staff.id,jissekiModal.day);setJissekiModal(null);}} onClose={()=>setJissekiModal(null)}/>}
      {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} onSelect={handleMenuSelect} onClose={()=>setCtxMenu(null)} customDefs={dept?.customShiftDefs||[]} deptShiftTypes={dept?.shiftTypes||[]} selectionCount={ctxMenu.selCells?.size||1} roleAllowed={(!ctxMenu.selCells||ctxMenu.selCells.size<=1)?dept?.roleShiftTypes?.[staffList.find(s=>s.id===ctxMenu.staffId)?.role]??null:null}/>}
      {staffModal!==null&&(()=>{const mk=monthKey(year,month);const editingId=staffModal.data?.id;const kiboCountByDay={};staffList.filter(s=>s.dept===activeDeptId&&s.id!==editingId).forEach(s=>{(s.kiboByMonth?.[mk]||[]).forEach(d=>{kiboCountByDay[d]=(kiboCountByDay[d]||0)+1;});});return<StaffModal data={staffModal.data} deptId={activeDeptId} depts={depts} year={year} month={month} onSave={saveStaff} onClose={()=>setStaffModal(null)} kiboCountByDay={kiboCountByDay} kiboLimit={dept?.kiboLimit||3}/>;})()}
      {deptSettingModal&&<DeptSettingModal dept={deptSettingModal.dept} isNew={deptSettingModal.isNew} onSave={handleSaveDept} onDelete={handleDeleteDept} onConfirm={(message,onOk,okLabel)=>setConfirmDialog({message,onOk,okLabel})} onClose={()=>setDeptSettingModal(null)}/>}
      {clearModal&&<ClearModal deptLabel={dept.label} onClearDept={()=>{setDeptShifts({});clearDeptJisseki();setClearModal(false);}} onClose={()=>setClearModal(false)}/>}
      {pinModal&&dept?.pin&&<PinModal deptLabel={dept.label} onVerify={(pin)=>{if(pin===dept.pin){setUnlockedDeptId(activeDeptId);setPinModal(false);return true;}return false;}} onClose={()=>setPinModal(false)}/>}
      {excelPasteModal&&<ExcelPasteModal year={year} month={month} staffList={staffList.filter(s=>s.dept===activeDeptId)} customShiftKeys={(dept?.customShiftDefs||[]).map(cd=>cd.key).filter(Boolean)} deptShiftTypes={dept?.shiftTypes||[]} customShiftDefs={dept?.customShiftDefs||[]} onApply={(pastedShifts)=>{
            const snapshot=allShiftsRef.current[activeDeptId]||{};
            const stack=undoStackRef.current[activeDeptId]||[];
            undoStackRef.current[activeDeptId]=[...stack,snapshot].slice(-30);
            setUndoCount(undoStackRef.current[activeDeptId].length);
            pasteTimestamp.current = Date.now(); // Realtime上書きを5秒ブロック
            userEditSeq.current++;
            seqAtLastRemoteLoad.current = userEditSeq.current - 1; // 保存スキップされないよう保証
            saveStatusRef.current="unsaved";
            setAllShifts(prev=>{const cur=prev[activeDeptId]||{};const next={};const allIds=new Set([...Object.keys(cur),...Object.keys(pastedShifts)]);allIds.forEach(id=>{next[id]={...(cur[id]||{}),...(pastedShifts[id]||{})};});return{...prev,[activeDeptId]:next};});
            setSaveStatus('unsaved');
            setExcelPasteModal(false);
          }} onClose={()=>setExcelPasteModal(false)}/>}
      {bulkKyukoModal&&<BulkKyukoModal staffList={staffList} year={year} month={month} onApply={handleBulkKyuko} onClose={()=>setBulkKyukoModal(false)}/>}
      {downloadModal&&<DownloadModal depts={depts} staffList={staffList} allShifts={allShifts} year={year} month={month} activeDeptId={activeDeptId} allEvents={allEvents} onClose={()=>setDownloadModal(false)}/>}
      {generateWarnings&&<GenerateWarningModal warnings={generateWarnings.warnings} deptLabel={generateWarnings.deptLabel} year={year} month={month} score={generateWarnings.score} timelineWarnings={generateWarnings.timelineWarnings} coverageWarnings={generateWarnings.coverageWarnings} onClose={()=>setGenerateWarnings(null)}/>}
      <div style={{position:"fixed",bottom:12,right:12,background:"#F4F4F5",border:"1px solid #D4D4D8",borderRadius:16,padding:"5px 12px",fontSize:10,color:"#A1A1AA",display:"flex",gap:6,alignItems:"center"}}><span style={{color:"#6366F1",fontWeight:700}}>Phase 2</span><span>クラウド同期 ＋ リアルタイム連携</span></div>
      {confirmDialog&&<ConfirmDialog message={confirmDialog.message} okLabel={confirmDialog.okLabel||"削除する"} onOk={()=>{confirmDialog.onOk();setConfirmDialog(null);}} onCancel={()=>setConfirmDialog(null)}/>}
      {adminModal&&<AdminPanel onClose={()=>setAdminModal(false)}/>}
      {helpModal&&<HelpModal onClose={()=>setHelpModal(false)}/>}
      {historyModal&&<ShiftHistoryModal
        session={session} year={year} month={month}
        deptId={activeDeptId} deptLabel={dept?.label||activeDeptId}
        onClose={()=>setHistoryModal(false)}
        onRestore={(restoredData)=>{
          const restoreDeptId = activeDeptIdRef.current;
          setAllShifts(prev=>({...prev,[restoreDeptId]:restoredData}));
          // ★Fix W-3: 復元後のundo履歴をリセット（復元前の状態へ戻るundoを防止）
          // 復元を「新しい基準状態」として扱う → 復元前への逆行undoを不可能にする
          undoStackRef.current[restoreDeptId] = [];
          setUndoCount(0);
          setSaveStatus('saved');
        }}
      />}
      {eventEditDay!==null&&<EventEditModal day={eventEditDay} month={month} year={year} currentText={(allEvents[activeDeptId]?.[monthKey(year,month)]||{})[eventEditDay]||""} onSave={(text)=>{const mk2=monthKey(year,month);setAllEvents(prev=>{const prev2={...(prev[activeDeptId]||{})};const prev3={...(prev2[mk2]||{})};if(text)prev3[eventEditDay]=text;else delete prev3[eventEditDay];prev2[mk2]=prev3;return{...prev,[activeDeptId]:prev2};});setEventEditDay(null);}} onClose={()=>setEventEditDay(null)}/>}
      {shareModal&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&setShareModal(false)}>
          <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>🔗 スタッフ共有URL</div>
              <button onClick={()=>setShareModal(false)} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}>✕</button>
            </div>
            <div style={{fontSize:11,color:"#52525B",marginBottom:16,background:"#F4F4F5",borderRadius:8,padding:"8px 12px"}}>部署ごとのURLをスタッフに送ってください。各部署のスタッフは自分の部署だけ表示されます。</div>

            {/* ── サイト全体QR（新規登録・ログイン用） ── */}
            <div style={{background:"#fff",border:"2px solid #6366F1",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:13,color:"#18181B",marginBottom:4}}>🏠 しふぽん サイトQRコード</div>
              <div style={{fontSize:10,color:"#52525B",marginBottom:10}}>自分のサイトに貼り付けると、スキャンしたらしふぽんのログイン・新規登録画面へ移動します。</div>
              <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                  <div style={{padding:8,background:"#fff",border:"2px solid #D4D4D8",borderRadius:8,display:"inline-block"}}>
                    <QRCodeSVG value={window.location.origin} size={160} bgColor="#ffffff" fgColor="#18181B" level="L" includeMargin={false}/>
                  </div>
                  <div style={{fontSize:9,color:"#71717A",wordBreak:"break-all",textAlign:"center",maxWidth:176}}>{window.location.origin}</div>
                </div>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#3F3F46",marginBottom:8}}>使い方</div>
                  <div style={{fontSize:11,color:"#52525B",lineHeight:1.8}}>
                    ① このQRコードを<strong>スクリーンショット</strong><br/>
                    ② 自分のサイトに画像として貼り付け<br/>
                    ③ 読み取るとしふぽんに到達<br/>
                    ④ 「ログイン」または「新規登録」が表示されます
                  </div>
                  <div style={{marginTop:10,fontSize:10,background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:6,padding:"6px 8px",color:"#92400e"}}>
                    💡 URLもリンクとして貼れます<br/>
                    <span style={{wordBreak:"break-all",fontWeight:700}}>{window.location.origin}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{fontSize:11,color:"#52525B",marginBottom:10,fontWeight:700}}>▍ 部署別 スタッフ希望休ポータル</div>
            {depts.map(d=>{
              const ps=portalSettings[d.id]||{};
              const setPsDept=(key,val)=>setPortalSettings(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),[key]:val}}));
              const deptSl=staffList.filter(s=>s.dept===d.id).map(s=>({i:uuidToShort(s.id),n:s.name}));
              const cfgObj={fn:profile?.facility_name||'',d:{id:d.id,label:d.label,icon:d.icon,kb:d.kiboLimit||3,dl:ps.deadline||null,ty:ps.targetYear||null,tm:ps.targetMonth||null},sl:deptSl};
              const cfgB64=btoa(unescape(encodeURIComponent(JSON.stringify(cfgObj))));
              const urlShort=`${window.location.origin}?staff=${session.user.id}&dept=${d.id}`;
              const urlFull=`${urlShort}&cfg=${cfgB64}`;
              const doCopy=()=>{if(navigator.clipboard?.writeText){navigator.clipboard.writeText(urlShort).then(()=>alert('URLをコピーしました！')).catch(()=>alert(`URLをコピーしてください:\n${urlShort}`));}else{alert(`URLをコピーしてください:\n${urlShort}`);}};
              const doLine=()=>{const lineUrl=`https://line.me/R/msg/text/?${encodeURIComponent(`${d.label}の希望休入力はこちら\n${urlShort}`)}`;window.open(lineUrl,'_blank');};              const doSaveSettings=async()=>{
                const newPs={...portalSettings,[d.id]:{deadline:ps.deadline||null,targetYear:ps.targetYear||null,targetMonth:ps.targetMonth||null}};
                const deptsCfg=depts.map(dep=>{const p=newPs[dep.id]||{};return{id:dep.id,label:dep.label,icon:dep.icon,kiboLimit:dep.kiboLimit||3,deadline:p.deadline||null,targetYear:p.targetYear||null,targetMonth:p.targetMonth||null};});
                const facilityVal={facility_name:profile?.facility_name||'',depts:deptsCfg,staffList:staffList.map(s=>({id:s.id,dept:s.dept,name:s.name,role:s.role}))};
                const [r1,r2]=await Promise.all([
                  supabase.from('shift_data').upsert({user_id:session.user.id,data_key:'portalSettings',data_value:newPs,updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'}),
                  supabase.from('shift_data').upsert({user_id:session.user.id,data_key:'facilityConfig',data_value:facilityVal,updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'}),
                ]);
                if(r1.error||r2.error){alert('保存に失敗しました。もう一度お試しください。');return;}
                alert(`✅ ${d.label} の設定を保存しました\n対象月: ${ps.targetYear&&ps.targetMonth?`${ps.targetYear}年${ps.targetMonth}月`:'未設定'}\n締め切り: ${ps.deadline||'なし'}`);
              };
              return(
                <div key={d.id} style={{background:"#fff",border:"1px solid #D4D4D8",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                  <div style={{fontWeight:800,fontSize:13,color:"#18181B",marginBottom:10}}>{d.icon} {d.label}</div>
                  {/* 対象シフト月 */}
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#3F3F46",marginBottom:4}}>📅 対象シフト月</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="month" value={(ps.targetYear&&ps.targetMonth)?`${ps.targetYear}-${String(ps.targetMonth).padStart(2,'0')}`:""} onChange={e=>{const v=e.target.value;if(!v){setPortalSettings(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),targetYear:null,targetMonth:null}}));}else{const[ty,tm]=v.split('-').map(Number);setPortalSettings(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),targetYear:ty,targetMonth:tm}}));}}} style={{border:"1px solid #D4D4D8",borderRadius:6,padding:"5px 8px",fontSize:12,color:"#18181B",outline:"none",background:"#FAFAFA"}}/>
                      {(ps.targetYear||ps.targetMonth)&&<button onClick={()=>setPortalSettings(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),targetYear:null,targetMonth:null}}))} style={{background:"none",border:"none",color:"#c44b4b",cursor:"pointer",fontSize:12}}>✕ クリア</button>}
                    </div>
                    {(ps.targetYear&&ps.targetMonth)&&<div style={{fontSize:10,color:"#2563EB",marginTop:3}}>スタッフ画面に「{ps.targetYear}年{ps.targetMonth}月の希望休入力」と表示されます</div>}
                    {!(ps.targetYear&&ps.targetMonth)&&<div style={{fontSize:10,color:"#9CA3AF",marginTop:3}}>未設定の場合は従来動作（締切日の月または当月）</div>}
                  </div>
                  {/* 締め切り */}
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#3F3F46",marginBottom:4}}>⏰ 締め切り日</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="date" value={ps.deadline||""} onChange={e=>setPsDept('deadline',e.target.value||null)} style={{border:"1px solid #D4D4D8",borderRadius:6,padding:"5px 8px",fontSize:12,color:"#18181B",outline:"none",background:"#FAFAFA"}}/>
                      {ps.deadline&&<button onClick={()=>setPsDept('deadline',null)} style={{background:"none",border:"none",color:"#c44b4b",cursor:"pointer",fontSize:12}}>✕ クリア</button>}
                    </div>
                    {ps.deadline&&<div style={{fontSize:10,color:"#c44b4b",marginTop:3}}>⚠ {ps.deadline} 以降は送信不可になります</div>}
                  </div>
                  {/* 保存ボタン */}
                  <button onClick={doSaveSettings} style={{width:"100%",background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",cursor:"pointer",fontSize:13,fontWeight:800,marginBottom:12}}>💾 この設定を保存する</button>
                  <div style={{textAlign:"center",marginBottom:6}}>
                    <div style={{fontSize:10,color:"#52525B",marginBottom:6,fontWeight:700}}>📷 カメラで読み取り</div>
                    <div style={{display:"inline-block",padding:8,background:"#fff",border:"2px solid #D4D4D8",borderRadius:8}}>
                      <QRCodeSVG value={urlShort} size={140} bgColor="#ffffff" fgColor="#18181B" level="L" includeMargin={false}/>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    <button onClick={doLine} style={{background:"linear-gradient(135deg,#06C755,#00a040)",color:"#fff",border:"none",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:12,fontWeight:800,flex:1}}>💬 LINEで送る</button>
                    <button onClick={doCopy} style={{background:"#f0fff4",color:"#16a34a",border:"1px solid #86efac",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:12,fontWeight:800,flex:1}}>📋 コピー</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}