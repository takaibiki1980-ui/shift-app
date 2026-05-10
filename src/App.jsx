import { useState, useCallback, useRef, useEffect, Component } from "react";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";

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
//  勤務実績: シフト種別デフォルト時刻
// ─────────────────────────────────────────────
const SHIFT_DEFAULT_TIMES = {
  "早番": { start: "07:00", end: "15:30", breakMin: 45 },
  "日勤": { start: "09:00", end: "17:30", breakMin: 60 },
  "遅番": { start: "12:00", end: "20:30", breakMin: 60 },
  "夜勤": { start: "16:45", end: "09:15", breakMin: 90 },
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

        {mode==="signup"&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11, color:"#3a8a87", marginBottom:5}}>施設名 <span style={{color:"#ef4444"}}>*</span></div>
            <input
              type="text" value={facilityName}
              onChange={e=>setFacilityName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="〇〇介護施設"
              style={{width:"100%", background:"#f0fffe", border:"1px solid #90cbc8", borderRadius:8, color:"#1a3635", padding:"10px 12px", fontSize:13, boxSizing:"border-box", outline:"none"}}
            />
          </div>
        )}
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

        {mode==="signup"&&(
          <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:16,padding:"10px 12px",background:"#f0fffe",borderRadius:8,border:"1px solid #b8deda"}}>
            <input type="checkbox" id="agree" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{marginTop:2,accentColor:"#2BBFBA",cursor:"pointer",flexShrink:0}}/>
            <label htmlFor="agree" style={{fontSize:12,color:"#2a5a57",lineHeight:1.6,cursor:"pointer"}}>
              <button onClick={()=>setShowTerms(true)} style={{background:"none",border:"none",color:"#2BBFBA",cursor:"pointer",fontSize:12,fontWeight:700,padding:0,textDecoration:"underline"}}>利用規約</button>
              {" および "}
              <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",color:"#2BBFBA",cursor:"pointer",fontSize:12,fontWeight:700,padding:0,textDecoration:"underline"}}>プライバシーポリシー</button>
              {" に同意します"}
            </label>
          </div>
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

        <div style={{textAlign:"center",marginTop:20,display:"flex",justifyContent:"center",gap:16}}>
          <button onClick={()=>setShowTerms(true)} style={{background:"none",border:"none",color:"#6ab5b2",cursor:"pointer",fontSize:11,textDecoration:"underline"}}>利用規約</button>
          <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",color:"#6ab5b2",cursor:"pointer",fontSize:11,textDecoration:"underline"}}>プライバシーポリシー</button>
        </div>
      </div>
      {showTerms&&<TermsModal onClose={()=>setShowTerms(false)}/>}
      {showPrivacy&&<PrivacyModal onClose={()=>setShowPrivacy(false)}/>}
    </div>
  );
}