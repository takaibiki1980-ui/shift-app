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

// ─────────────────────────────────────────────
//  TERMS & PRIVACY MODALS
// ─────────────────────────────────────────────
function LegalModal({ title, onClose, children }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000000bb",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f5fffe",border:"1px solid #90cbc8",borderRadius:16,padding:24,width:"100%",maxWidth:560,maxHeight:"80vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,position:"sticky",top:0,background:"#f5fffe",paddingBottom:12,borderBottom:"1px solid #d5edeb"}}>
          <div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:22}}>✕</button>
        </div>
        <div style={{fontSize:12,color:"#2a5a57",lineHeight:2}}>{children}</div>
      </div>
    </div>
  );
}

function TermsModal({ onClose }) {
  return (
    <LegalModal title="📄 利用規約" onClose={onClose}>
      <p style={{color:"#6ab5b2",marginBottom:16}}>最終更新日：2026年4月26日</p>
      <h3 style={{color:"#1a3635",marginBottom:8}}>第1条（サービスの目的）</h3>
      <p>しふぽん（以下「本サービス」）は、介護施設向けのシフト管理を支援するWebアプリケーションです。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>第2条（利用登録）</h3>
      <p>本サービスの利用にはメールアドレスによるアカウント登録が必要です。登録内容は正確な情報を入力してください。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>第3条（プランと料金）</h3>
      <p>本サービスは無料プラン・スタンダードプラン・フルプランを提供します。有料プランの料金・支払方法については別途ご案内します。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>第4条（禁止事項）</h3>
      <p>以下の行為を禁止します。</p>
      <ul style={{paddingLeft:20,marginTop:8}}>
        <li>他のユーザーへの不正アクセス</li>
        <li>サービスの複製・転売・商業目的での無断利用</li>
        <li>虚偽の情報による登録</li>
        <li>法令または公序良俗に反する行為</li>
      </ul>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>第5条（免責事項）</h3>
      <p>運営者は本サービスの利用によって生じた損害について、運営者の故意または重過失がある場合を除き、責任を負いません。システム障害・データ消失等について最大限の努力をもって対応しますが、完全な保証はしかねます。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>第6条（サービスの変更・停止）</h3>
      <p>運営者は事前の通知をもってサービス内容の変更または停止ができるものとします。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>第7条（規約の変更）</h3>
      <p>本規約は必要に応じて変更されることがあります。変更後も本サービスを継続して利用した場合、変更後の規約に同意したものとみなします。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>第8条（準拠法）</h3>
      <p>本規約は日本法に準拠し、日本国内の裁判所を専属的合意管轄とします。</p>
    </LegalModal>
  );
}

function PrivacyModal({ onClose }) {
  return (
    <LegalModal title="🔒 プライバシーポリシー" onClose={onClose}>
      <p style={{color:"#6ab5b2",marginBottom:16}}>最終更新日：2026年4月26日</p>
      <h3 style={{color:"#1a3635",marginBottom:8}}>1. 収集する情報</h3>
      <p>本サービスでは以下の情報を収集します。</p>
      <ul style={{paddingLeft:20,marginTop:8}}>
        <li>メールアドレス（アカウント認証のため）</li>
        <li>施設名（サービス管理のため）</li>
        <li>シフトデータ・職員情報（サービス提供のため）</li>
      </ul>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>2. 利用目的</h3>
      <p>収集した情報は以下の目的のみに利用します。</p>
      <ul style={{paddingLeft:20,marginTop:8}}>
        <li>本サービスの提供・運営</li>
        <li>お問い合わせへの対応</li>
        <li>サービス改善のための分析</li>
      </ul>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>3. 第三者への提供</h3>
      <p>収集した個人情報は、法令に基づく場合を除き、第三者に提供・開示しません。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>4. 安全管理</h3>
      <p>データはSupabase（米国）のサーバーで安全に管理されています。アクセス制御・暗号化により不正アクセス防止に努めます。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>5. Cookieについて</h3>
      <p>本サービスはログイン状態の維持のためにローカルストレージを使用します。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>6. 個人情報の削除</h3>
      <p>アカウントの削除をご希望の場合は、お問い合わせ先までご連絡ください。速やかに対応いたします。</p>
      <h3 style={{color:"#1a3635",margin:"16px 0 8px"}}>7. お問い合わせ</h3>
      <p>個人情報の取り扱いに関するお問い合わせは以下までご連絡ください。</p>
      <p style={{marginTop:8,background:"#d5edeb",borderRadius:8,padding:"8px 12px"}}>メール：takaibiki1980@icloud.com</p>
    </LegalModal>
  );
}


const SHIFTS = {
  早番:  { short:"早", color:"#FB8C00", bg:"#fff3e0", border:"#FB8C00", time:"7:00〜16:00" },
  日勤:  { short:"日", color:"#1E88E5", bg:"#e3f2fd", border:"#1E88E5", time:"9:00〜18:00" },
  遅番:  { short:"遅", color:"#8E24AA", bg:"#f3e5f5", border:"#8E24AA", time:"11:30〜20:30" },
  夜勤:  { short:"夜", color:"#263238", bg:"#eceff1", border:"#455A64", time:"16:30〜翌9:30" },
  明け:  { short:"明", color:"#263238", bg:"#eceff1", border:"#455A64", time:"夜勤明け" },
  休み:  { short:"休", color:"#E53935", bg:"#ffebee", border:"#E53935", time:"－" },
  希望休: { short:"希", color:"#E53935", bg:"#ffffff", border:"#E53935", time:"希望休" },
  有休:  { short:"有", color:"#9b4db5", bg:"#faf0ff", border:"#c07ad5", time:"有給" },
  "日/休": { short:"日休", color:"#1E88E5", bg:"#e8f4fd", border:"#1E88E5", time:"午前日勤／午後休" },
  "休/日": { short:"休日", color:"#E53935", bg:"#ffebee", border:"#E53935", time:"午前休／午後日勤" },
  "早/休": { short:"早休", color:"#FB8C00", bg:"#fff3e0", border:"#FB8C00", time:"早番半日／午後休" },
  "休/遅": { short:"休遅", color:"#8E24AA", bg:"#f3e5f5", border:"#8E24AA", time:"午前休／遅番半日" },
  "": { short:"－", color:"#c8b8a8", bg:"transparent", border:"transparent", time:"" },
};
const SHIFT_KEYS = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休",""];
const SHIFT_KEYS_MANUAL = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休","日/休","休/日","早/休","休/遅",""];
const REST_TYPES  = new Set(["休み","希望休","有休","明け","日/休","休/日","早/休","休/遅"]);
const HALF_REST_TYPES = new Set(["日/休","休/日","早/休","休/遅"]);
const WORK_TYPES  = new Set(["早番","日勤","遅番","夜勤"]);

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

// Excel月別生データから除外月を除いてshiftTrendを再計算
function computeShiftTrendFromRaw(rawByMonth, exceptionMonths = []) {
  const exceptions = new Set(exceptionMonths);
  const COUNT_KEYS = ['早番','日勤','遅番','夜勤'];
  const trendMap = {};
  for (const [month, staffData] of Object.entries(rawByMonth || {})) {
    if (exceptions.has(month)) continue;
    for (const [name, d] of Object.entries(staffData)) {
      if (!trendMap[name]) trendMap[name] = { 早番:0, 日勤:0, 遅番:0, 夜勤:0, total:0, dowRest:[0,0,0,0,0,0,0], dowTotal:[0,0,0,0,0,0,0] };
      COUNT_KEYS.forEach(k => { trendMap[name][k] += (d[k]||0); });
      trendMap[name].total += (d.total||0);
      if (d.dowRest) for (let i=0;i<7;i++) { trendMap[name].dowRest[i]+=(d.dowRest[i]||0); trendMap[name].dowTotal[i]+=(d.dowTotal[i]||0); }
    }
  }
  const result = {};
  for (const [name, d] of Object.entries(trendMap)) {
    if (d.total < 3) continue;
    const freq = {};
    COUNT_KEYS.forEach(k => { freq[k] = d.total > 0 ? d[k]/d.total : 0; });
    result[name] = { ...freq, dowRestRate: d.dowTotal.map((tot,i) => tot>0 ? d.dowRest[i]/tot : null), _workTotal: d.total };
  }
  result._months = Object.keys(rawByMonth||{}).filter(m=>!exceptions.has(m)).sort();
  return result;
}

// 24ヶ月以上前のExcel月別データを自動削除
function filterExpiredExcelMonths(rawByDept) {
  const now = new Date();
  const cutoff = now.getFullYear() * 12 + now.getMonth() - 23;
  const result = {};
  for (const [deptId, rawByMonth] of Object.entries(rawByDept || {})) {
    if (typeof rawByMonth !== 'object' || !rawByMonth) continue;
    const filtered = {};
    for (const [k, v] of Object.entries(rawByMonth)) {
      const [y, m] = k.split('-').map(Number);
      if (!isNaN(y) && (y * 12 + (m - 1)) >= cutoff) filtered[k] = v;
    }
    if (Object.keys(filtered).length > 0) result[deptId] = filtered;
  }
  return result;
}
function migrateLegacyExcelRaw(data, depts) {
  if (!data || Object.keys(data).length === 0) return {};
  const keys = Object.keys(data);
  const isOldFormat = keys.some(k => /^\d{4}-\d+$/.test(k));
  if (!isOldFormat) return data;
  const firstDeptId = depts?.[0]?.id;
  return firstDeptId ? { [firstDeptId]: data } : {};
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
  const now = new Date();
  const nowYM = now.getFullYear() * 12 + now.getMonth();
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
    for (const [staffId, staffShifts] of Object.entries(shifts)) {
      if (!staffShifts || typeof staffShifts !== 'object') continue;
      if (!counts[staffId]) { counts[staffId] = {}; totals[staffId] = 0; monthSets[staffId] = new Set(); }
      monthSets[staffId].add(`${keyYear}-${keyMonth}`);
      for (const shift of Object.values(staffShifts)) {
        if (!shift || ['希望休','有休','明け',''].includes(shift)) continue;
        counts[staffId][shift] = (counts[staffId][shift] || 0) + weight;
        totals[staffId] += weight;
      }
    }
  }
  const result = {}, monthCounts = {};
  for (const staff of staffList) {
    if (!counts[staff.id] || totals[staff.id] < 10) continue;
    const freq = {};
    for (const [shift, cnt] of Object.entries(counts[staff.id])) freq[shift] = cnt / totals[staff.id];
    result[staff.name] = freq;
    monthCounts[staff.name] = monthSets[staff.id].size;
  }
  result._monthCounts = monthCounts; // 動的ブレンド比率の計算用
  return result;
}

// ExcelインポートデータとDB学習データをブレンド（月数に応じた動的比率）
function mergeShiftTrends(excelTrend, learnedTrend) {
  const excelKeys = Object.keys(excelTrend || {}).filter(k => k !== '_months');
  const learnedKeys = Object.keys(learnedTrend || {}).filter(k => k !== '_monthCounts');
  if (learnedKeys.length === 0) return excelTrend || {};
  if (excelKeys.length === 0) {
    const clean = {};
    for (const name of learnedKeys) clean[name] = learnedTrend[name];
    return clean;
  }
  const monthCounts = learnedTrend._monthCounts || {};
  const result = excelTrend._months ? { _months: excelTrend._months } : {};
  const allNames = new Set([...excelKeys, ...learnedKeys]);
  for (const name of allNames) {
    const ex = excelTrend[name], le = learnedTrend[name];
    if (ex && le) {
      // n / (n+2): 1ヶ月=0.33, 3ヶ月=0.60, 6ヶ月=0.75, 12ヶ月=0.86
      const n = monthCounts[name] || 1;
      const lw = Math.min(0.95, n / (n + 2));
      const merged = {};
      for (const k of new Set([...Object.keys(ex), ...Object.keys(le)])) {
        merged[k] = (ex[k] || 0) * (1 - lw) + (le[k] || 0) * lw;
      }
      result[name] = merged;
    } else {
      result[name] = ex || le;
    }
  }
  return result;
}

function autoGenerate(staffList, dept, year, month, prevShifts, shiftTrend = {}) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
  const maxCR = dept.maxConsecRest ?? 2;
  const maxStaffLim = {};
  dept.shiftTypes.forEach(k => {
    maxStaffLim[k] = dept.maxStaff?.[k] != null ? dept.maxStaff[k] : (k === "日勤" ? 99 : 1);
  });
  const PRIORITY = { 早番: 1, 遅番: 1, 日勤: 2 };

  const getTrend = (s) => {
    if (!shiftTrend || Object.keys(shiftTrend).length === 0) return null;
    if (shiftTrend[s.name] && s.name !== '_months') return shiftTrend[s.name];
    const key = Object.keys(shiftTrend).filter(k => k !== '_months').find(k => k.includes(s.name) || s.name.includes(k));
    return key ? shiftTrend[key] : null;
  };

  const res = {};
  const ds = staffList.filter(s => s.dept === dept.id);
  ds.forEach(s => { res[s.id] = {}; });

  const consecWork = (id, d) => { let c = 0; for (let i = d; i >= 1; i--) { if (WORK_TYPES.has(res[id][i])) c++; else break; } return c; };
  const consecRest = (id, d) => { let c = 0; for (let i = d; i >= 1; i--) { if (REST_TYPES.has(res[id][i]) && res[id][i] !== "明け") c++; else break; } return c; };
  const canRestAt = (id, d) => {
    if (res[id][d - 1] === "明け") return false;
    let cr = 0; for (let i = d - 1; i >= 1; i--) { if (REST_TYPES.has(res[id][i]) && res[id][i] !== "明け") cr++; else break; }
    let cf = 0; for (let i = d + 1; i <= days; i++) { if (REST_TYPES.has(res[id][i]) && res[id][i] !== "明け") cf++; else break; }
    return (cr + 1 + cf) <= maxCR;
  };

  const dayTypes = dept.shiftTypes.filter(k => k !== "夜勤");
  const getAllowedTypes = (s) => {
    const allowed = dept.roleShiftTypes?.[s.role];
    return allowed ? dayTypes.filter(k => allowed.includes(k)) : dayTypes;
  };

  const pickWithTrend = (s, available, cnts) => {
    const trend = getTrend(s);
    return [...available].sort((a, b) => {
      const dA = Math.max(0, (dept.minStaff[a] || 0) - cnts[a]);
      const dB = Math.max(0, (dept.minStaff[b] || 0) - cnts[b]);
      if (dA !== dB) return dB - dA;
      const pA = PRIORITY[a] ?? 3, pB = PRIORITY[b] ?? 3;
      if (pA !== pB) return pA - pB;
      if (cnts[a] !== cnts[b]) return cnts[a] - cnts[b];
      const tA = trend ? (trend[a] || 0) : 0, tB = trend ? (trend[b] || 0) : 0;
      if (Math.abs(tA - tB) > 0.05) return tB - tA;
      return Math.random() - 0.5;
    })[0];
  };

  // ① restSlots 初期化（公休バジェット）
  const restSlots = {};
  ds.forEach(s => { restSlots[s.id] = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8; });

  const lockedDays = {};
  ds.forEach(s => { lockedDays[s.id] = new Set(); });

  // バジェットを消費して休みを確定する
  const consumeRest = (id, d, type = "休み") => {
    if (lockedDays[id].has(d)) return false;
    res[id][d] = type;
    if (restSlots[id] > 0) restSlots[id]--;
    lockedDays[id].add(d);
    return true;
  };

  // ② 固定休み（希望休・有休・希望シフト）→ restSlots を消費して確定
  ds.forEach(s => {
    Object.entries(prevShifts[s.id] || {}).forEach(([d, v]) => {
      if (v === "有休") consumeRest(s.id, +d, "有休");
    });
    (s.kiboByMonth?.[mk] || []).forEach(d => consumeRest(s.id, d, "希望休"));
    (s.yukyuByMonth?.[mk] || []).forEach(d => {
      if (!lockedDays[s.id].has(d)) consumeRest(s.id, d, "有休");
      else res[s.id][d] = "有休"; // ラベル上書き（バジェット変動なし）
    });
    Object.entries(s.shiftRequestsByMonth?.[mk] || {}).forEach(([day, shiftKey]) => {
      const d = +day;
      if (lockedDays[s.id].has(d)) return;
      if (REST_TYPES.has(shiftKey) && shiftKey !== "明け") consumeRest(s.id, d, shiftKey);
      else { res[s.id][d] = shiftKey; lockedDays[s.id].add(d); }
    });
  });

  // 希望勤務内の夜勤チェーン展開（restSlots 消費）
  ds.forEach(s => {
    for (let d = 1; d <= days; d++) {
      if (res[s.id][d] === "夜勤") {
        if (d + 1 <= days && !lockedDays[s.id].has(d + 1)) { res[s.id][d + 1] = "明け"; lockedDays[s.id].add(d + 1); }
        if (d + 2 <= days) consumeRest(s.id, d + 2);
      } else if (res[s.id][d] === "明け") {
        if (d + 1 <= days) consumeRest(s.id, d + 1);
      }
    }
  });

  // ③ 夜勤の自動配置（1 夜勤 = 1 休み = restSlots 消費）
  if (dept.shiftTypes.includes("夜勤")) {
    const nightPool = ds.filter(s => s.nightOk);
    const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));
    for (let d = 1; d <= days; d++) {
      const already = ds.filter(s => res[s.id][d] === "夜勤").length;
      let need = (dept.minStaff["夜勤"] || 0) - already;
      if (need <= 0) continue;
      const canNight = (s, checkSlots = true) => {
        if (lockedDays[s.id].has(d)) return false;
        if (["夜勤", "明け"].includes(res[s.id][d - 1])) return false;
        if (d + 1 <= days && lockedDays[s.id].has(d + 1) && res[s.id][d + 1] !== "明け") return false;
        if (d + 2 <= days && lockedDays[s.id].has(d + 2) && res[s.id][d + 2] !== "休み") return false;
        return !checkSlots || restSlots[s.id] > 0;
      };
      let cands = nightPool.filter(s => {
        if (!canNight(s)) return false;
        return Object.values(res[s.id]).filter(v => v === "夜勤").length < Math.max(s.nightMax || 5, autoMax);
      }).sort((a, b) => Object.values(res[a.id]).filter(v => v === "夜勤").length - Object.values(res[b.id]).filter(v => v === "夜勤").length);
      if (cands.length === 0) cands = nightPool.filter(s => canNight(s, false))
        .sort((a, b) => Object.values(res[a.id]).filter(v => v === "夜勤").length - Object.values(res[b.id]).filter(v => v === "夜勤").length);
      for (const s of cands) {
        if (need <= 0) break;
        res[s.id][d] = "夜勤";
        if (d + 1 <= days) { res[s.id][d + 1] = "明け"; lockedDays[s.id].add(d + 1); }
        if (d + 2 <= days) consumeRest(s.id, d + 2);
        need--;
      }
    }
  }

  // ④ 残りの休み日を restSlots の範囲内で分配（maxCR 遵守）
  if (dayTypes.length > 0) {
    const restByDay = {};
    for (let d = 1; d <= days; d++) {
      restByDay[d] = ds.filter(s => REST_TYPES.has(res[s.id][d]) && res[s.id][d] !== "明け").length;
    }
    const maxRestPerDay = Math.max(2, Math.ceil(ds.length * 0.35));
    ds.forEach(s => {
      if (restSlots[s.id] <= 0) return;
      const freeDays = Array.from({ length: days }, (_, i) => i + 1).filter(d => !res[s.id][d] && canRestAt(s.id, d));
      if (freeDays.length === 0) { restSlots[s.id] = 0; return; }
      const trend = getTrend(s);
      const dowRestRate = trend?.dowRestRate || null;
      const budget = restSlots[s.id];
      const interval = Math.max(1, Math.floor(freeDays.length / (budget + 1)));
      const candidates = [...freeDays].sort((a, b) => {
        const rdiff = (restByDay[a] || 0) - (restByDay[b] || 0);
        if (rdiff !== 0) return rdiff;
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
      let lastRest = 0, remaining = budget;
      for (const d of candidates) {
        if (remaining <= 0) break;
        if (res[s.id][d] || !canRestAt(s.id, d)) continue;
        let streak = 0;
        for (let i = d - 1; i >= 1; i--) { if (REST_TYPES.has(res[s.id][i]) && res[s.id][i] !== "明け") break; streak++; }
        const isUrgent = streak >= maxConsec - 1;
        if (!isUrgent && (restByDay[d] || 0) >= maxRestPerDay) continue;
        const remainCands = candidates.filter(fd =>
          fd > d && !res[s.id][fd] && canRestAt(s.id, fd) && (isUrgent || (restByDay[fd] || 0) < maxRestPerDay)
        ).length;
        if (!isUrgent && remainCands >= remaining && (d - lastRest) < interval) continue;
        res[s.id][d] = "休み"; restSlots[s.id]--; restByDay[d] = (restByDay[d] || 0) + 1; lastRest = d; remaining--;
      }
    });
  }

  // ⑤ 残り全日を勤務で埋める（restSlots = 0 以降は絶対に休みを追加しない）
  const seqFilter = (s, d, types) => types.filter(k => {
    const p = res[s.id][d - 1], nx = res[s.id][d + 1];
    if (p === "遅番" && (k === "早番" || k === "日勤")) return false;
    if (p === "日勤" && k === "早番") return false;
    if (nx === "早番" && (k === "遅番" || k === "日勤")) return false;
    if (nx === "日勤" && k === "遅番") return false;
    return true;
  });

  if (dayTypes.length === 0) {
    ds.forEach(s => { for (let d = 1; d <= days; d++) { if (!res[s.id][d]) res[s.id][d] = "休み"; } });
  } else {
    for (let d = 1; d <= days; d++) {
      const cnts = {};
      dayTypes.forEach(k => { cnts[k] = ds.filter(s => res[s.id][d] === k).length; });
      const freeStaff = ds.filter(s => !res[s.id][d]).sort((a, b) => consecWork(a.id, d - 1) - consecWork(b.id, d - 1));
      for (const s of freeStaff) {
        if (res[s.id][d - 1] === "夜勤") { res[s.id][d] = "明け"; continue; }
        // 連続勤務上限に達した場合：restSlots があれば休み、なければ勤務継続
        if ((consecWork(s.id, d - 1) + 1) > maxConsec) {
          if (restSlots[s.id] > 0 && canRestAt(s.id, d)) { res[s.id][d] = "休み"; restSlots[s.id]--; }
          else {
            const av = seqFilter(s, d, getAllowedTypes(s));
            res[s.id][d] = av.sort((a, b) => (cnts[a] || 0) - (cnts[b] || 0))[0] || dayTypes[0];
            cnts[res[s.id][d]] = (cnts[res[s.id][d]] || 0) + 1;
          }
          continue;
        }
        // 通常：maxStaff 範囲内で勤務を割り当て
        const av = seqFilter(s, d, dayTypes.filter(k => cnts[k] < (maxStaffLim[k] ?? 99) && getAllowedTypes(s).includes(k)));
        if (av.length > 0) {
          const pick = pickWithTrend(s, av, cnts);
          res[s.id][d] = pick; cnts[pick] = (cnts[pick] || 0) + 1;
        } else {
          // maxStaff 満員：restSlots があれば休み（canRestAt 確認）、なければ maxStaff 無視で勤務
          if (restSlots[s.id] > 0 && canRestAt(s.id, d)) { res[s.id][d] = "休み"; restSlots[s.id]--; }
          else {
            const forced = seqFilter(s, d, getAllowedTypes(s));
            res[s.id][d] = forced.sort((a, b) => (cnts[a] || 0) - (cnts[b] || 0))[0] || getAllowedTypes(s)[0] || dayTypes[0];
            cnts[res[s.id][d]] = (cnts[res[s.id][d]] || 0) + 1;
          }
        }
      }
    }
  }

  // ⑥ enforceMaxStaff（休みへの変換は禁止：他シフトへ振替のみ）
  const enforceMaxStaff = () => {
    for (let d = 1; d <= days; d++) {
      for (const [shiftKey, limit] of Object.entries(maxStaffLim)) {
        const overStaff = ds.filter(s => res[s.id][d] === shiftKey);
        if (overStaff.length <= limit) continue;
        const toFix = [...overStaff.filter(s => !lockedDays[s.id].has(d)), ...overStaff.filter(s => lockedDays[s.id].has(d))];
        let excess = overStaff.length - limit;
        for (const s of toFix) {
          if (excess <= 0) break;
          if (lockedDays[s.id].has(d) && excess < overStaff.length) break;
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          const altShift = dayTypes.find(k => {
            if (k === shiftKey || !getAllowedTypes(s).includes(k)) return false;
            if (prev === "遅番" && (k === "早番" || k === "日勤")) return false;
            if (prev === "日勤" && k === "早番") return false;
            if (next === "早番" && (k === "遅番" || k === "日勤")) return false;
            if (next === "日勤" && k === "遅番") return false;
            return ds.filter(sx => res[sx.id][d] === k).length < (maxStaffLim[k] ?? 99);
          });
          if (altShift) res[s.id][d] = altShift;
          // 振替先なし → そのまま維持（休みには変えない）
          excess--;
        }
      }
    }
  };
  enforceMaxStaff();

  // 遅番→早番/日勤、日勤→早番 の違反を修正（休みへの変換は禁止）
  const isViolation = (prev, curr) =>
    (prev === "遅番" && (curr === "早番" || curr === "日勤")) || (prev === "日勤" && curr === "早番");
  for (const s of ds) {
    for (let d = 2; d <= days; d++) {
      if (!isViolation(res[s.id][d - 1], res[s.id][d])) continue;
      const fixDay = (target) => {
        if (lockedDays[s.id].has(target)) return false;
        const p = res[s.id][target - 1], n = res[s.id][target + 1];
        const cnts = {};
        dayTypes.forEach(k => { cnts[k] = ds.filter(sx => sx.id !== s.id && res[sx.id][target] === k).length; });
        const alt = dayTypes.find(k => {
          if (p === "遅番" && (k === "早番" || k === "日勤")) return false;
          if (p === "日勤" && k === "早番") return false;
          if (n === "早番" && (k === "遅番" || k === "日勤")) return false;
          if (n === "日勤" && k === "遅番") return false;
          return cnts[k] < (maxStaffLim[k] ?? 99);
        }) || dayTypes.find(k => { // maxStaff 無視 fallback
          if (p === "遅番" && (k === "早番" || k === "日勤")) return false;
          if (p === "日勤" && k === "早番") return false;
          if (n === "早番" && (k === "遅番" || k === "日勤")) return false;
          if (n === "日勤" && k === "遅番") return false;
          return true;
        });
        if (alt) { res[s.id][target] = alt; return true; }
        return false;
      };
      if (!fixDay(d)) fixDay(d - 1);
    }
  }
  enforceMaxStaff();

  // ⑦ minStaff 保証：非ロック休み → 勤務に変換
  for (let pass = 0; pass < 3; pass++) {
    let anyFixed = false;
    for (let d = 1; d <= days; d++) {
      for (const [shiftKey, minCount] of Object.entries(dept.minStaff || {})) {
        const actual = ds.filter(s => res[s.id][d] === shiftKey).length;
        if (actual >= minCount) continue;
        const cands = ds.filter(s => {
          if (res[s.id][d] !== "休み" || lockedDays[s.id].has(d)) return false;
          if (!getAllowedTypes(s).includes(shiftKey)) return false;
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          if (prev === "夜勤" || prev === "明け") return false;
          if (prev === "遅番" && (shiftKey === "早番" || shiftKey === "日勤")) return false;
          if (prev === "日勤" && shiftKey === "早番") return false;
          if (next === "早番" && (shiftKey === "遅番" || shiftKey === "日勤")) return false;
          if (next === "日勤" && shiftKey === "遅番") return false;
          if ((consecWork(s.id, d - 1) + 1) > maxConsec) return false;
          return ds.filter(sx => res[sx.id][d] === shiftKey).length < (maxStaffLim[shiftKey] ?? 99);
        }).sort((a, b) => {
          const rA = Object.values(res[a.id]).filter(v => REST_TYPES.has(v) && v !== "明け").length;
          const rB = Object.values(res[b.id]).filter(v => REST_TYPES.has(v) && v !== "明け").length;
          return rB - rA;
        });
        let need = minCount - actual;
        for (const s of cands) { if (need <= 0) break; res[s.id][d] = shiftKey; need--; anyFixed = true; }
      }
    }
    if (!anyFixed) break;
  }
  enforceMaxStaff();

  // ⑧ 警告生成
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
    for (const [shiftKey, limit] of Object.entries(maxStaffLim || {})) {
      const actual = ds.filter(s => res[s.id][d] === shiftKey).length;
      if (actual > limit) {
        const key = shiftKey + "__over";
        if (!warnings[key]) warnings[key] = { days: 0, maxOver: 0, shiftKey, type: "over" };
        warnings[key].days++;
        warnings[key].maxOver = Math.max(warnings[key].maxOver, actual - limit);
      }
    }
  }
  return { shifts: res, warnings };
}

// 生成結果のペナルティスコアを計算（低いほど良い）
function scoreShifts(res, ds, dept, days) {
  let score = 0;
  const WORK = new Set(["早番","日勤","遅番","夜勤"]);
  const REST = new Set(["休み","希望休","有休","明け"]);
  const maxConsec = dept.maxConsecutive || 5;
  const maxCR = dept.maxConsecRest ?? 2;
  for (const s of ds) {
    // 連続勤務違反
    let consec = 0;
    for (let d = 1; d <= days; d++) {
      const sh = res[s.id]?.[d];
      if (WORK.has(sh) && sh !== "明け") { consec++; if (consec > maxConsec) score += 50; }
      else consec = 0;
    }
    // 遅番→早番/日勤、日勤→早番 違反
    for (let d = 2; d <= days; d++) {
      const prev = res[s.id]?.[d-1], curr = res[s.id]?.[d];
      if ((prev === "遅番" && (curr === "早番" || curr === "日勤")) || (prev === "日勤" && curr === "早番")) score += 100;
    }
    // 連続休み超過違反（希望休/有休を含む連休はペナルティ軽減）
    let cr = 0;
    for (let d = 1; d <= days; d++) {
      const sh = res[s.id]?.[d];
      if (REST.has(sh) && sh !== "明け") {
        cr++;
        if (cr > maxCR) {
          const isLocked = sh === "希望休" || sh === "有休";
          score += isLocked ? 5 : 20; // ロック日は軽ペナルティ
        }
      } else cr = 0;
    }
  }
  // minStaff不足
  for (let d = 1; d <= days; d++) {
    for (const [k, minC] of Object.entries(dept.minStaff || {})) {
      const actual = ds.filter(s => res[s.id]?.[d] === k).length;
      if (actual < minC) score += actual === 0 ? (minC - actual) * 30 : (minC - actual) * 10;
    }
  }
  return score;
}

// N回試行して最もスコアが低い（違反が少ない）結果を返す
function bestOfN(staffList, dept, year, month, prevShifts, shiftTrend, n = 5) {
  const days = new Date(year, month + 1, 0).getDate();
  const ds = staffList.filter(s => s.dept === dept.id);
  let best = null, bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    const { shifts, warnings } = autoGenerate(staffList, dept, year, month, prevShifts, shiftTrend);
    const score = scoreShifts(shifts, ds, dept, days);
    if (score < bestScore) { bestScore = score; best = { shifts, warnings, score }; }
    if (bestScore === 0) break; // 違反ゼロなら即採用
  }
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
      for(let d=1;d<=days;d++){ const v=shifts[s.id]?.[d]||""; const out=v||(yukyudays.includes(d)?"有休":kibodays.includes(d)?"希望休":""); cells.push(out); if(WORK_TYPES.has(v)) workCnt++; if(v==="夜勤") nightCnt++; if(REST_TYPES.has(v)&&v!=="明け") restCnt+=HALF_REST_TYPES.has(v)?0.5:1; }
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
    if(Object.keys(deptEvents).length>0){ html += '<tr class="ev-row"><th class="name">行事</th>'; for(let d=1;d<=days;d++){ const ev=deptEvents[d]||''; html += '<th style="writing-mode:vertical-rl;text-orientation:mixed;vertical-align:top;padding:2px 1px;background:'+(ev?'#fef3c7':'#fffdf0')+';">'+ev+'</th>'; } html += '<th></th><th></th><th></th></tr>'; }
    html += CTAG('thead')+TAG('tbody');
    staffList.filter(s=>s.dept===dept.id).forEach(s => {
      let w=0,n=0,r=0;
      const kibodays = s.kiboByMonth?.[mk] || [];
      const yukyudays2 = s.yukyuByMonth?.[mk] || [];
      html += TAG('tr')+TAG('td class="name"')+s.name+CTAG('td');
      for(let d=1;d<=days;d++){ const v=shifts[s.id]?.[d]||""; const isKibo=!v&&kibodays.includes(d); const isYukyu2=!v&&!isKibo&&yukyudays2.includes(d); if(WORK_TYPES.has(v)) w++; if(v==="夜勤") n++; if(REST_TYPES.has(v)&&v!=="明け") r+=HALF_REST_TYPES.has(v)?0.5:1; html += TAG('td')+(isKibo?'<span style="color:#c44b4b">希</span>':isYukyu2?'<span style="color:#9b4db5">有</span>':(SHIFTS[v]?.short||"－"))+CTAG('td'); }
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

function parseShiftExcel(workbook) {
  const SHIFT_MAP = {"早":"早番","早番":"早番","日":"日勤","日勤":"日勤","遅":"遅番","遅番":"遅番","夜":"夜勤","夜勤":"夜勤","明":"明け","明け":"明け","休":"休み","休み":"休み","公":"休み","公休":"休み","有":"有休","有休":"有休","有給":"有休","希":"希望休","希望休":"希望休","E":"早番","D":"日勤","L":"遅番","N":"夜勤"};
  const REST_SET = new Set(["休み","有休","希望休"]);
  const SHIFT_SET = new Set(Object.keys(SHIFT_MAP));
  const COUNT_KEYS = ["早番","日勤","遅番","夜勤"];
  const trendMap = {};
  const processedYearMonths = new Set();
  const monthlyData = {}; // { "YYYY-M": { name: { 早番, 日勤, 遅番, 夜勤, total, dowRest, dowTotal } } }
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
      // 月別生データを保存
      if (!monthlyData[sheetYearMonth]) monthlyData[sheetYearMonth] = {};
      if (!monthlyData[sheetYearMonth][nameCell]) monthlyData[sheetYearMonth][nameCell] = { 早番:0, 日勤:0, 遅番:0, 夜勤:0, total:0, dowRest:[0,0,0,0,0,0,0], dowTotal:[0,0,0,0,0,0,0] };
      COUNT_KEYS.forEach(k => { monthlyData[sheetYearMonth][nameCell][k] += counts[k]; });
      monthlyData[sheetYearMonth][nameCell].total += total;
      for (let i = 0; i < 7; i++) { monthlyData[sheetYearMonth][nameCell].dowRest[i] += dowRest[i]; monthlyData[sheetYearMonth][nameCell].dowTotal[i] += dowTotal[i]; }
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
  result._rawByMonth = monthlyData;
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
function KiboCalendar({ year, month, selected, onChange, shiftRequests, onShiftRequests, deptId, kiboCountByDay, kiboLimit }) {
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
          const othersKibo = kiboCountByDay?.[d] || 0;
          const limit = kiboLimit || 3;
          const kiboOver = othersKibo >= limit, kiboWarn = othersKibo === limit - 1;
          return <button key={d} onClick={()=>{ if(reqShift){setSelectedDay(isSelected?null:d);}else if(isKibo){toggleKibo(d);}else{setSelectedDay(isSelected?null:d);} }} style={{background:isSelected?"#ffe0b2":isKibo?"#fff0f0":reqShift?s.bg:"transparent",border:isSelected?"2px solid #2BBFBA":isKibo?"1px solid #dc2626":reqShift?`1px solid ${s.border}`:"1px solid #0e3a38",borderRadius:5,padding:"3px 1px",cursor:"pointer",color:isKibo?"#f87171":reqShift?s.color:we?"#2BBFBA":"#5a9e9b",fontSize:10,fontWeight:(isKibo||reqShift||isSelected)?800:400,display:"flex",flexDirection:"column",alignItems:"center",gap:1,minHeight:32,position:"relative"}}>{kiboOver&&<span style={{position:"absolute",top:1,right:2,fontSize:7,color:"#ef4444",fontWeight:900,lineHeight:1}}>⚠</span>}{kiboWarn&&!kiboOver&&<span style={{position:"absolute",top:1,right:2,fontSize:7,color:"#f59e0b",fontWeight:900,lineHeight:1}}>!</span>}<span>{d}</span>{isKibo&&<span style={{fontSize:8,lineHeight:1}}>希休</span>}{reqShift&&<span style={{fontSize:8,lineHeight:1}}>{SHIFTS[reqShift].short}</span>}{!isKibo&&!reqShift&&isSelected&&<span style={{fontSize:7,lineHeight:1}}>選択</span>}{othersKibo>0&&<span style={{fontSize:7,lineHeight:1,color:kiboOver?"#ef4444":kiboWarn?"#f59e0b":"#c44b4b"}}>{othersKibo}人</span>}</button>;
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
          <KiboCalendar year={year} month={month} selected={kiboSelected} onChange={setKibo} shiftRequests={shiftRequests} onShiftRequests={setShiftRequests} deptId={deptId} kiboCountByDay={kiboCountByDay} kiboLimit={kiboLimit}/>
        </div>
        <div style={{fontSize:11,color:"#9b4db5",fontWeight:700,marginBottom:10,marginTop:16}}>▍ {year}年{month+1}月 有休{yukyuSelected.length>0&&<span style={{marginLeft:8,background:"#f3e5f5",border:"1px solid #c07ad5",borderRadius:10,padding:"1px 8px",fontSize:10}}>{yukyuSelected.length}日</span>}</div>
        <div style={{background:"#faf0ff",borderRadius:8,padding:12,border:"1px solid #c07ad5"}}>
          {(()=>{const days=getDays(year,month),firstDow=new Date(year,month,1).getDay(),cells=[];for(let i=0;i<firstDow;i++)cells.push(null);for(let d=1;d<=days;d++)cells.push(d);return(<div><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>{["日","月","火","水","木","金","土"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:10,color:i===0?"#f87171":i===6?"#2BBFBA":"#3a8a87",padding:"2px 0"}}>{w}</div>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>{cells.map((d,i)=>{if(!d)return<div key={i}/>;const isY=yukyuSelected.includes(d),dow=(firstDow+d-1)%7,we=dow===0||dow===6;return<button key={d} onClick={()=>setYukyu(isY?yukyuSelected.filter(x=>x!==d):[...yukyuSelected,d])} style={{background:isY?"#e8d5f5":"transparent",border:isY?"1px solid #9b4db5":"1px solid #c4a0d4",borderRadius:5,padding:"3px 1px",cursor:"pointer",color:isY?"#6b21a8":we?"#2BBFBA":"#5a9e9b",fontSize:10,fontWeight:isY?800:400,display:"flex",flexDirection:"column",alignItems:"center",gap:1,minHeight:32}}><span>{d}</span>{isY&&<span style={{fontSize:8,lineHeight:1,color:"#9b4db5"}}>有休</span>}</button>;})}</div>{yukyuSelected.length>0&&<button onClick={()=>setYukyu([])} style={{fontSize:10,color:"#9b4db5",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>全てクリア</button>}</div>);})()}
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
  const buildInitMaxStaff = (types, existing) => { const d={}; (types||["日勤"]).forEach(k=>{d[k]=existing?.[k]!=null?existing[k]:(k==="日勤"?99:1);}); return d; };
  const [label,setLabel]=useState(dept?.label||""), [icon,setIcon]=useState(dept?.icon||"🏠"), [shiftTypes,setShiftTypes]=useState(dept?.shiftTypes||["日勤"]), [minStaff,setMinStaff]=useState(dept?.minStaff||{日勤:1}), [maxStaff,setMaxStaff]=useState(()=>buildInitMaxStaff(dept?.shiftTypes,dept?.maxStaff)), [maxConsec,setMaxConsec]=useState(dept?.maxConsecutive||5), [maxConsecRest,setMaxConsecRest]=useState(dept?.maxConsecRest??2), [defKyuko,setDefKyuko]=useState(dept?.defaultKyukoDays||8), [kiboLimit,setKiboLimit]=useState(dept?.kiboLimit||3), [rolesText,setRolesText]=useState((dept?.roles||["職員"]).join("\n")), [pinCode,setPinCode]=useState(dept?.pin||""), [roleShiftTypes,setRoleShiftTypes]=useState(dept?.roleShiftTypes||{});
  const toggleShiftType = (k) => { setShiftTypes(prev => { const next=prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]; setMinStaff(p=>{const n={};next.forEach(s=>{n[s]=p[s]||1;});return n;}); setMaxStaff(p=>{const n={};next.forEach(s=>{n[s]=p[s]!=null?p[s]:(s==="日勤"?99:1);});return n;}); return next; }); };
  const handleSave = () => { if(!label.trim()){alert("部署名を入力してください");return;} if(shiftTypes.length===0){alert("シフト種別を選択してください");return;} if(pinCode&&pinCode.length!==4){alert("PINコードは4桁で入力してください");return;} const roles=rolesText.split("\n").map(r=>r.trim()).filter(Boolean); const cleanRST={}; Object.entries(roleShiftTypes).forEach(([role,types])=>{if(types&&types.length>0&&types.length<shiftTypes.length)cleanRST[role]=types;}); onSave({id:dept?.id||`dept_${Date.now()}`,label:label.trim(),icon,shiftTypes,minStaff,maxStaff,maxConsecutive:maxConsec,maxConsecRest,defaultKyukoDays:defKyuko,kiboLimit,roles:roles.length>0?roles:["職員"],roleShiftTypes:Object.keys(cleanRST).length>0?cleanRST:undefined,pin:pinCode||undefined}); };
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
        {shiftTypes.length>0&&<div style={{background:"#d5edeb",border:"1px solid #0e3a38",borderRadius:8,padding:"10px 12px",marginBottom:8}}><div style={{fontSize:11,color:"#3a8a87",marginBottom:8}}>最低配置人数 <span style={{fontSize:10,color:"#5a9e9b",fontWeight:400}}>（この人数を下回ると警告）</span></div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.map(k=><div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:SHIFTS[k]?.color,fontWeight:700}}>{k}</span><input type="number" min={0} max={20} value={minStaff[k]||0} onChange={e=>setMinStaff(p=>({...p,[k]:+e.target.value}))} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:11,color:"#2a5a57"}}>名</span></div>)}</div></div>}
        {shiftTypes.length>0&&<div style={{background:"#fff3e0",border:"1px solid #e0a000",borderRadius:8,padding:"10px 12px",marginBottom:14}}><div style={{fontSize:11,color:"#b45309",marginBottom:8}}>最大配置人数 <span style={{fontSize:10,color:"#a06010",fontWeight:400}}>（自動生成でこの人数を超えない・99=制限なし）</span></div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.map(k=><div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:SHIFTS[k]?.color,fontWeight:700}}>{k}</span><input type="number" min={1} max={99} value={maxStaff[k]!=null?maxStaff[k]:(k==="日勤"?99:1)} onChange={e=>setMaxStaff(p=>({...p,[k]:+e.target.value}))} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:11,color:"#92400e"}}>名</span></div>)}</div></div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><label style={LS}>最大連続勤務日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><input type="number" min={3} max={7} value={maxConsec} onChange={e=>setMaxConsec(+e.target.value)} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:12,color:"#2a5a57"}}>日</span></div></div>
          <div><label style={LS}>最大連続休み日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><input type="number" min={1} max={5} value={maxConsecRest} onChange={e=>setMaxConsecRest(+e.target.value)} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:12,color:"#2a5a57"}}>日</span></div><div style={{fontSize:10,color:"#5a9e9b",marginTop:3}}>自動生成のみ適用。希望休の連休は除外</div></div>
          <div><label style={LS}>デフォルト公休日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><input type="number" min={4} max={15} value={defKyuko} onChange={e=>setDefKyuko(+e.target.value)} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:12,color:"#2a5a57"}}>日</span></div></div>
          <div><label style={LS}>希望休 上限人数</label><div style={{display:"flex",alignItems:"center",gap:8}}><input type="number" min={1} max={10} value={kiboLimit} onChange={e=>setKiboLimit(+e.target.value)} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0}}/><span style={{fontSize:12,color:"#2a5a57"}}>名</span></div><div style={{fontSize:10,color:"#c44b4b",marginTop:3}}>同日に達すると⚠警告表示</div></div>
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
              if(next.length===0)return prev;
              const o={...prev};
              if(next.length===shiftTypes.length){delete o[role];}else{o[role]=next;}
              return o;
            });
          };
          return(
            <div style={{marginBottom:14}}>
              <label style={LS}>役職別シフト制限（任意）</label>
              <div style={{fontSize:10,color:"#5a9e9b",marginBottom:6}}>チェックを外したシフト種別は自動生成で割り当てられません。全チェック＝制限なし。</div>
              <div style={{background:"#f0f4ff",border:"1px solid #90aacb",borderRadius:8,padding:"10px 12px",overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:"left",padding:"2px 8px 4px 0",color:"#3a6a87",fontWeight:700,whiteSpace:"nowrap"}}>役職</th>
                      {shiftTypes.map(k=><th key={k} style={{textAlign:"center",padding:"2px 6px 4px",color:SHIFTS[k]?.color||"#333",fontWeight:700,minWidth:44}}>{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map(role=>{
                      const allowed=roleShiftTypes[role]||shiftTypes;
                      return(
                        <tr key={role}>
                          <td style={{padding:"3px 8px 3px 0",color:"#1a3635",whiteSpace:"nowrap"}}>{role}</td>
                          {shiftTypes.map(k=>(
                            <td key={k} style={{textAlign:"center",padding:"3px 6px"}}>
                              <input type="checkbox" checked={allowed.includes(k)} onChange={()=>toggleRoleShift(role,k)} style={{cursor:"pointer",width:14,height:14,accentColor:"#2BBFBA"}}/>
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
        <div style={{fontSize:10,color:"#5a9e9b",marginBottom:18}}>設定すると部署タブ切替後に編集前にPINが必要になります</div>
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

function ClearModal({ deptLabel, onClearDept, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #450a0a",borderRadius:14,padding:24,width:"100%",maxWidth:360,boxShadow:"0 30px 80px #000"}}>
        <div style={{fontSize:15,fontWeight:900,color:"#f87171",marginBottom:6}}>🗑 シフトのクリア</div>
        <div style={{fontSize:12,color:"#5a9e9b",marginBottom:20}}>「{deptLabel}」のシフトを削除します。この操作は元に戻せません。</div>
        <button onClick={onClearDept} style={{width:"100%",background:"#fff0f0",border:"1px solid #7f1d1d",borderRadius:9,padding:"14px 16px",cursor:"pointer",marginBottom:14,display:"flex",alignItems:"center",gap:12,textAlign:"left"}}><span style={{fontSize:22}}>🗑</span><div><div style={{fontSize:13,fontWeight:800,color:"#f87171"}}>{deptLabel} のシフトをクリア</div><div style={{fontSize:11,color:"#7f1d1d",marginTop:2}}>この部署のシフトをすべて削除します</div></div></button>
        <button onClick={onClose} style={{width:"100%",background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"10px 0",cursor:"pointer",fontSize:13}}>キャンセル</button>
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
      <div style={{background:"#f3fffe",border:"2px solid #2BBFBA",borderRadius:16,padding:28,width:"100%",maxWidth:320,boxShadow:"0 30px 80px #000",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>🔒</div>
        <div style={{fontSize:15,fontWeight:900,color:"#1a3635",marginBottom:4}}>{deptLabel} 編集ロック</div>
        <div style={{fontSize:12,color:"#5a9e9b",marginBottom:24}}>4桁のPINを入力してください</div>
        <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:16}}>
          {digits.map((d,i) => (
            <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={e=>handleChange(i,e.target.value)} onKeyDown={e=>handleKeyDown(i,e)}
              onKeyUp={e=>{ if(e.key==='Enter'&&filled) handleVerify(); }}
              style={{width:52,height:56,textAlign:"center",fontSize:24,fontWeight:900,border:`2px solid ${error?"#ef4444":d?"#2BBFBA":"#90cbc8"}`,borderRadius:10,background:error?"#fff0f0":"#fff",outline:"none",color:"#1a3635",caretColor:"transparent"}}/>
          ))}
        </div>
        {error && <div style={{color:"#ef4444",fontSize:12,marginBottom:12,fontWeight:700}}>PINが違います。もう一度お試しください。</div>}
        <button onClick={handleVerify} disabled={!filled} style={{width:"100%",background:filled?"linear-gradient(135deg,#2BBFBA,#45B7D1)":"#d5edeb",color:filled?"#fff":"#7a9e9b",border:"none",borderRadius:9,padding:"12px 0",cursor:filled?"pointer":"not-allowed",fontSize:14,fontWeight:800,marginBottom:10}}>🔓 解錠する</button>
        <button onClick={onClose} style={{width:"100%",background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:13}}>キャンセル</button>
      </div>
    </div>
  );
}

function ExcelImportModal({ onImport, onReset, onClose, currentTrend, onConfirm, exceptionMonths = [], onExceptionMonthsChange, excelRawMonths = {}, onExcelRawMonthsChange }) {
  const [status, setStatus] = useState("idle"), [preview, setPreview] = useState(null), [errorMsg, setErrorMsg] = useState("");
  const [exInput, setExInput] = useState(""); // "YYYY-M" 入力用
  const fileRef = useRef(null);
  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!window.XLSX) { setErrorMsg("ライブラリ読み込み中…"); setStatus("error"); return; }
    setStatus("parsing"); setErrorMsg("");
    try { const buf=await file.arrayBuffer(); const wb=window.XLSX.read(buf,{type:"array"}); const trend=parseShiftExcel(wb); if(Object.keys(trend).length===0){setErrorMsg("シフトデータを読み取れませんでした。");setStatus("error");if(fileRef.current)fileRef.current.value="";return;} setPreview(trend); setStatus("done"); }
    catch(err) { setErrorMsg("読み込み失敗: "+err.message); setStatus("error"); }
    finally { if(fileRef.current)fileRef.current.value=""; }
  };
  const addException = () => {
    const val = exInput.trim();
    if (!val) return;
    // "YYYY-M" または "YYYY/M" または "YYYY年M月" を正規化
    const m = val.match(/(\d{4})[年\-\/](\d{1,2})/);
    if (!m) { alert('形式は「2024-3」または「2024年3月」で入力してください'); return; }
    const key = `${m[1]}-${parseInt(m[2])}`;
    if (!exceptionMonths.includes(key)) onExceptionMonthsChange([...exceptionMonths, key].sort());
    setExInput("");
  };
  const removeException = (key) => onExceptionMonthsChange(exceptionMonths.filter(k => k !== key));
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
        {/* インポート済み月一覧 */}
        {Object.keys(excelRawMonths).length > 0 && (
          <div style={{marginTop:20,borderTop:"1px solid #b8deda",paddingTop:16}}>
            <div style={{fontSize:13,fontWeight:800,color:"#1a3635",marginBottom:4}}>📅 インポート済み月</div>
            <div style={{fontSize:11,color:"#3a8a87",marginBottom:8}}>不要な月を削除すると学習から除外されます（元に戻すには再インポートが必要）。</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {Object.keys(excelRawMonths).sort().map(k => {
                const [y,m] = k.split('-').map(Number);
                const isExcl = exceptionMonths.includes(k);
                const staffCount = Object.keys(excelRawMonths[k]||{}).length;
                const now2 = new Date();
                const mAgo2 = now2.getFullYear()*12+now2.getMonth()-(y*12+(m-1));
                const remaining2 = 24-mAgo2;
                return (
                  <div key={k} style={{background:isExcl?"#fff0f0":"#e8f5ee",border:`1px solid ${isExcl?"#e07070":"#5cb87a"}`,borderRadius:16,padding:"3px 10px",fontSize:11,color:isExcl?"#c44b4b":"#2d8a52",display:"flex",alignItems:"center",gap:6}}>
                    <span>{y}年{m}月</span>
                    <span style={{fontSize:9,opacity:0.7}}>{staffCount}名{isExcl?" (除外中)":""} · {remaining2}ヶ月後に自動削除</span>
                    <button onClick={()=>onConfirm(`${y}年${m}月のデータを削除しますか？\n元に戻すには再インポートが必要です。`,()=>{
                      const newRaw = {...excelRawMonths}; delete newRaw[k];
                      if(onExcelRawMonthsChange) onExcelRawMonthsChange(newRaw);
                    },'削除')} style={{background:"none",border:"none",color:"#c44b4b",cursor:"pointer",fontSize:13,padding:0,lineHeight:1}}>🗑</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* 例外月設定 */}
        <div style={{marginTop:20,borderTop:"1px solid #b8deda",paddingTop:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#1a3635",marginBottom:4}}>🚫 例外月（一時除外・自動期限切れ）</div>
          <div style={{fontSize:11,color:"#3a8a87",marginBottom:10}}>インフルエンザ・コロナ等でシフトが崩れた月を除外すると学習精度が上がります。</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input value={exInput} onChange={e=>setExInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addException()} placeholder="例: 2024-1 または 2024年1月" style={{flex:1,border:"1px solid #90cbc8",borderRadius:6,padding:"6px 10px",fontSize:12,color:"#1a3635",outline:"none"}}/>
            <button onClick={addException} style={{background:"#2BBFBA",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>追加</button>
          </div>
          {exceptionMonths.length===0
            ? <div style={{fontSize:11,color:"#8ecece"}}>除外月なし（すべての月を学習に使用）</div>
            : <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {exceptionMonths.map(k=>{const [y,m]=k.split('-').map(Number);const now=new Date();const mAgo=now.getFullYear()*12+now.getMonth()-(y*12+(m-1));const remaining=18-mAgo;return(
                  <div key={k} style={{background:"#fff0f0",border:"1px solid #e07070",borderRadius:16,padding:"3px 10px",fontSize:11,color:"#c44b4b",display:"flex",alignItems:"center",gap:6}}>
                    <span>{y}年{m}月</span>
                    <span style={{fontSize:9,color:"#e07070",opacity:0.8}}>{remaining}ヶ月後に自動削除</span>
                    <button onClick={()=>removeException(k)} style={{background:"none",border:"none",color:"#c44b4b",cursor:"pointer",fontSize:13,padding:0,lineHeight:1}}>✕</button>
                  </div>
                );})}
              </div>
          }
        </div>
        {status==="idle"&&<button onClick={onClose} style={{width:"100%",background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,marginTop:16}}>閉じる</button>}
      </div>
    </div>
  );
}

function BulkKyukoModal({ staffList, year, month, onApply, onClose }) {
  const mk = monthKey(year, month);
  const initDays = () => { const first = staffList[0]; return first ? (first.kyukoDaysByMonth?.[mk] ?? first.kyukoDays ?? 8) : 8; };
  const [days, setDays] = useState(initDays);
  const setVal = (v) => setDays(Math.max(0, Math.min(20, +v || 0)));
  const totalStaff = staffList.length;
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:360,boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div><div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>📅 休み日数 一括設定</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>{year}年{month+1}月</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button></div>
        <div style={{fontSize:11,color:"#2a5a57",marginBottom:20,marginTop:8,background:"#d5edeb",borderRadius:7,padding:"8px 12px",border:"1px solid #0e3a38"}}>💡 施設全体の休み日数を設定します。全部署・全スタッフ（{totalStaff}名）に一括適用されます。</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:28,background:"#d5edeb",borderRadius:12,padding:"18px 20px",border:"1px solid #90cbc8"}}>
          <button onClick={()=>setVal(days-1)} style={{background:"#b8deda",border:"1px solid #1a4040",borderRadius:8,color:"#1a4040",cursor:"pointer",width:40,height:40,fontSize:22,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
          <div style={{textAlign:"center"}}>
            <input type="number" value={days} min={0} max={20} onChange={e=>setVal(e.target.value)} style={{width:72,background:"#f0fffe",border:"2px solid #2BBFBA",borderRadius:8,color:"#2BBFBA",fontSize:28,fontWeight:900,textAlign:"center",padding:"6px 0",outline:"none"}}/>
            <div style={{fontSize:12,color:"#2a5a57",marginTop:4,fontWeight:700}}>日 / 月</div>
          </div>
          <button onClick={()=>setVal(days+1)} style={{background:"#b8deda",border:"1px solid #1a4040",borderRadius:8,color:"#1a4040",cursor:"pointer",width:40,height:40,fontSize:22,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
        </div>
        <div style={{display:"flex",gap:10}}><button onClick={()=>onApply(days,mk)} style={{flex:1,background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}>✅ 適用する</button><button onClick={onClose} style={{flex:1,background:"#d5edeb",color:"#3a8a87",border:"1px solid #90cbc8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button></div>
      </div>
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
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:400,boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div><div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>📤 書き出し</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>{year}年{month+1}月</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button></div>
        <div style={{fontSize:11,color:"#3a8a87",fontWeight:700,marginBottom:7}}>対象部署</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:16}}>{depts.map(d=>{const sel=selectedDepts.includes(d.id);return<button key={d.id} onClick={()=>toggleDept(d.id)} style={{background:sel?"#8ecece":"transparent",color:sel?"#2BBFBA":"#2a5a57",border:`1px solid ${sel?"#2BBFBA":"#b8deda"}`,borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:sel?700:400}}>{d.icon} {d.label}</button>;})}</div>
        {noSelection&&<div style={{fontSize:11,color:"#ef4444",marginBottom:10}}>⚠ 部署を1つ以上選択してください</div>}
        <button onClick={doPrint} disabled={noSelection} style={{width:"100%",background:noSelection?"#d5edec":"linear-gradient(135deg,#2BBFBA,#45B7D1)",border:"none",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1,marginBottom:8}}><span style={{fontSize:24}}>🖨️</span><div><div style={{fontSize:13,fontWeight:800,color:"#fff"}}>今すぐ印刷</div><div style={{fontSize:11,color:"#d5f5f5",marginTop:2}}>印刷ダイアログがすぐに開きます</div></div></button>
        <button onClick={()=>doDownload("csv")} disabled={noSelection} style={{width:"100%",background:noSelection?"#d5edec":"#e8f5ee",border:"1px solid #2d8a52",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1,marginBottom:8}}><span style={{fontSize:24}}>📊</span><div><div style={{fontSize:13,fontWeight:800,color:"#34d399"}}>CSV（Excel・スプレッドシート）</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>Excel・Googleスプレッドシートで開けます</div></div></button>
        <button onClick={()=>doDownload("html")} disabled={noSelection} style={{width:"100%",background:noSelection?"#d5edec":"#e8f8f7",border:"1px solid #8ecece",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1}}><span style={{fontSize:24}}>💾</span><div><div style={{fontSize:13,fontWeight:800,color:"#2BBFBA"}}>HTMLで保存（USB用）</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>他のPCやUSBで印刷する場合に使用</div></div></button>
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
      { title: "Excelデータのインポート（初回）", body: "「📊 傾向学習」ボタン→「Excelをインポート」で過去のシフト表（Excel）を読み込みます。初回シフト作成の精度が上がります。" },
      { title: "しふぽんで作成するほど精度UP", body: "しふぽんでシフトを作成・保存するたびに自動で学習が進みます。6ヶ月分たまるとExcelデータよりしふぽんの学習が優先されます。" },
      { title: "例外月の除外", body: "コロナ・インフルエンザ等で通常のシフトが崩れた月は「例外月」に設定すると学習から除外できます。除外は18ヶ月後に自動解除されます。" },
      { title: "🤖 AI調整（フルプランのみ）", body: "「🤖 AI」ボタンをONにして指示を入力すると、AIがシフトを調整します（例：「〇〇さんを15日に休みにして」）。" },
    ],
    tips: ["Excelデータは月別に管理され、古いデータは24ヶ月後に自動削除されます。", "学習が6ヶ月以上たまったらExcelデータのリセットを促すバナーが表示されます。"],
  },
];

function HelpModal({ onClose }) {
  const [activeId, setActiveId] = useState("staff");
  const sec = HELP_SECTIONS.find(s => s.id === activeId);
  return (
    <div style={{position:"fixed",inset:0,background:"#000000bb",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f5fffe",border:"1px solid #90cbc8",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 30px 80px #000"}}>
        {/* ヘッダー */}
        <div style={{background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",padding:"16px 20px",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{fontWeight:900,fontSize:16}}>❓ 使い方ガイド</div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",cursor:"pointer",fontSize:18,width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>✕</button>
        </div>
        {/* タブ */}
        <div style={{display:"flex",overflowX:"auto",borderBottom:"2px solid #d5edeb",background:"#eaf8f6",flexShrink:0}}>
          {HELP_SECTIONS.map(s=>(
            <button key={s.id} onClick={()=>setActiveId(s.id)} style={{padding:"9px 12px",background:"transparent",border:"none",color:activeId===s.id?"#1a9e9a":"#2a6a67",borderBottom:activeId===s.id?"2px solid #2BBFBA":"2px solid transparent",cursor:"pointer",fontSize:11,fontWeight:activeId===s.id?800:500,whiteSpace:"nowrap",flexShrink:0}}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        {/* コンテンツ */}
        <div style={{overflowY:"auto",padding:"20px 24px",flex:1}}>
          <div style={{fontSize:16,fontWeight:900,color:"#1a3635",marginBottom:16}}>{sec.icon} {sec.label}</div>
          {sec.steps.map((st,i)=>(
            <div key={i} style={{display:"flex",gap:14,marginBottom:20,alignItems:"flex-start"}}>
              <div style={{background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",borderRadius:"50%",width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,flexShrink:0,marginTop:2}}>{i+1}</div>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:"#1a3635",marginBottom:4}}>{st.title}</div>
                <div style={{fontSize:12,color:"#3a5a57",lineHeight:1.8}}>{st.body}</div>
              </div>
            </div>
          ))}
          {sec.warn&&(
            <div style={{background:"#fff3e0",borderLeft:"4px solid #FB8C00",borderRadius:"0 8px 8px 0",padding:"10px 14px",margin:"8px 0",fontSize:12,color:"#1a3635"}}>
              <div style={{fontWeight:800,color:"#FB8C00",marginBottom:3}}>⚠ 注意</div>
              {sec.warn}
            </div>
          )}
          {sec.tips&&sec.tips.length>0&&(
            <div style={{background:"#e8f5ee",borderLeft:"4px solid #2d8a52",borderRadius:"0 8px 8px 0",padding:"10px 14px",margin:"8px 0"}}>
              <div style={{fontWeight:800,color:"#2d8a52",fontSize:12,marginBottom:6}}>💡 ポイント</div>
              {sec.tips.map((t,i)=><div key={i} style={{fontSize:12,color:"#1a3635",lineHeight:1.8}}>・{t}</div>)}
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

function GenerateWarningModal({ warnings, deptLabel, year, month, score, onClose }) {
  const days = new Date(year, month + 1, 0).getDate();
  const underEntries = Object.entries(warnings).filter(([k]) => !k.endsWith("__over"));
  const overEntries = Object.entries(warnings).filter(([k]) => k.endsWith("__over"));
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff5f5",border:"1px solid #7f1d1d",borderRadius:14,padding:28,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:10}}><div style={{width:44,height:44,borderRadius:10,flexShrink:0,background:"#fff0f0",border:"1px solid #ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>⚠️</div><div><div style={{fontSize:15,fontWeight:900,color:"#fca5a5",marginBottom:4}}>自動生成の通知</div><div style={{fontSize:12,color:"#5a9e9b"}}>{deptLabel} ／ {year}年{month+1}月</div></div></div>
        {score!=null&&<div style={{background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:7,padding:"6px 12px",marginBottom:14,fontSize:11,color:"#92400e"}}>5回試行して最もスコアが低い結果を採用しました（違反スコア: <span style={{fontWeight:800}}>{score}</span>）。残る警告は手動で調整してください。</div>}
        {underEntries.length>0&&<>
          <div style={{background:"#fff0f0",border:"1px solid #7f1d1d",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#fca5a5",lineHeight:1.7}}>以下のシフト種別で、設定した最低配置人数を達成できない日が発生しました。</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>{underEntries.map(([shiftKey,info])=>{const s=SHIFTS[shiftKey]||{},pct=Math.round(info.days/days*100);return(<div key={shiftKey} style={{background:"#f3fffe",border:`1px solid ${s.border||"#2a5a57"}`,borderRadius:9,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}><ShiftBadge type={shiftKey}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:s.color||"#6ab5b2"}}>{shiftKey}</div><div style={{fontSize:11,color:"#3a8a87",marginTop:2}}>不足日数：<span style={{color:"#f87171",fontWeight:700}}>{info.days}日</span>　最大 <span style={{color:"#f87171",fontWeight:700}}>−{info.maxShort}名</span></div></div><div style={{width:80}}><div style={{height:6,background:"#b8deda",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${pct}%`,background:pct>50?"#ef4444":pct>20?"#f59e0b":"#f87171"}}/></div><div style={{fontSize:10,color:"#3a8a87",marginTop:3,textAlign:"right"}}>{pct}%</div></div></div>);})}</div>
        </>}
        {overEntries.length>0&&<>
          <div style={{background:"#fff8e1",border:"1px solid #f59e0b",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#92400e",lineHeight:1.7}}>連休・公休の上限を守るため、上限人数を超えて配置した日があります。手動で調整してください。</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>{overEntries.map(([k,info])=>{const s=SHIFTS[info.shiftKey]||{};return(<div key={k} style={{background:"#fffbeb",border:`1px solid ${s.border||"#f59e0b"}`,borderRadius:9,padding:"10px 14px",display:"flex",alignItems:"center",gap:12}}><ShiftBadge type={info.shiftKey}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:s.color||"#b45309"}}>{info.shiftKey}</div><div style={{fontSize:11,color:"#92400e",marginTop:2}}>超過日数：<span style={{color:"#f59e0b",fontWeight:700}}>{info.days}日</span>　最大 <span style={{color:"#f59e0b",fontWeight:700}}>+{info.maxOver}名</span></div></div></div>);})}</div>
        </>}
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

// ─────────────────────────────────────────────
//  改善提案モジュール
// ─────────────────────────────────────────────
const SUGGESTION_PENALTY = { UNDERSTAFF:30, KIBO_VIOLATE:50, NIGHT_OVER:40, CONSEC_OVER:20 };

function scoreShiftState(staffList, shifts, year, month, dept) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  let total = 0;
  const issues = [];

  for (let d = 1; d <= days; d++) {
    (dept.shiftTypes || []).forEach(st => {
      const actual = ds.filter(s => (shifts[s.id]?.[d]||'') === st).length;
      const min = dept.minStaff?.[st] || 0;
      if (actual < min) {
        const p = (min - actual) * SUGGESTION_PENALTY.UNDERSTAFF;
        total += p;
        issues.push({ type:'understaff', day:d, shiftType:st, short:min-actual, penalty:p });
      }
    });
  }

  ds.forEach(s => {
    (s.kiboByMonth?.[mk] || []).forEach(d => {
      if (WORK_TYPES.has(shifts[s.id]?.[d] || '')) {
        total += SUGGESTION_PENALTY.KIBO_VIOLATE;
        issues.push({ type:'kibo', staff:s, day:d, penalty:SUGGESTION_PENALTY.KIBO_VIOLATE });
      }
    });
  });

  ds.forEach(s => {
    const nightCnt = Object.values(shifts[s.id]||{}).filter(v=>v==='夜勤').length;
    const max = s.nightMax || 5;
    if (s.nightOk && nightCnt > max) {
      const p = (nightCnt - max) * SUGGESTION_PENALTY.NIGHT_OVER;
      total += p;
      issues.push({ type:'night_over', staff:s, count:nightCnt, max, penalty:p });
    }
  });

  const maxConsec = dept.maxConsecutive || 5;
  ds.forEach(s => {
    let streak = 0;
    for (let d = 1; d <= days; d++) {
      if (WORK_TYPES.has(shifts[s.id]?.[d]||'')) { streak++; }
      else streak = 0;
      if (streak > maxConsec) {
        total += SUGGESTION_PENALTY.CONSEC_OVER;
        issues.push({ type:'consec', staff:s, day:d, penalty:SUGGESTION_PENALTY.CONSEC_OVER });
      }
    }
  });

  return { total, issues };
}

function cloneShiftsDeep(shifts) {
  const out = {};
  Object.keys(shifts).forEach(id => { out[id] = { ...shifts[id] }; });
  return out;
}

function generateSuggestions(staffList, shifts, year, month, dept) {
  const mk = monthKey(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  const base = scoreShiftState(staffList, shifts, year, month, dept);
  const candidates = [];

  const tryCandidate = (newShifts, description, type) => {
    const newScore = scoreShiftState(staffList, newShifts, year, month, dept);
    const improvement = base.total - newScore.total;
    if (improvement > 0) candidates.push({ improvement, newShifts, description, type, newScore: newScore.total });
  };

  base.issues.filter(i => i.type === 'understaff').forEach(({ day, shiftType }) => {
    ds.forEach(s => {
      const cur = shifts[s.id]?.[day] || '';
      if (!cur && !(s.kiboByMonth?.[mk]||[]).includes(day)) {
        const ns = cloneShiftsDeep(shifts);
        ns[s.id] = { ...(ns[s.id]||{}), [day]: shiftType };
        tryCandidate(ns, `${s.name}さんを${day}日（${shiftType}）に追加 → 勤務不足が解消されます`, 'add_staff');
      }
    });
  });

  base.issues.filter(i => i.type === 'night_over').forEach(({ staff }) => {
    Object.entries(shifts[staff.id]||{}).forEach(([dayStr, v]) => {
      if (v !== '夜勤') return;
      const ns = cloneShiftsDeep(shifts);
      ns[staff.id] = { ...(ns[staff.id]||{}), [Number(dayStr)]: '休み' };
      tryCandidate(ns, `${staff.name}さんの${dayStr}日の夜勤を休みに変更 → 夜勤超過が解消されます`, 'reduce_night');
    });
  });

  base.issues.filter(i => i.type === 'kibo').forEach(({ staff, day }) => {
    const ns = cloneShiftsDeep(shifts);
    ns[staff.id] = { ...(ns[staff.id]||{}), [day]: '休み' };
    tryCandidate(ns, `${staff.name}さんの${day}日を希望休（休み）に変更 → 希望休違反が解消されます`, 'fix_kibo');
  });

  base.issues.filter(i => i.type === 'consec').forEach(({ staff, day }) => {
    const ns = cloneShiftsDeep(shifts);
    ns[staff.id] = { ...(ns[staff.id]||{}), [day]: '休み' };
    tryCandidate(ns, `${staff.name}さんの${day}日を休みに変更 → 連続勤務違反が解消されます`, 'fix_consec');
  });

  return candidates.sort((a,b) => b.improvement - a.improvement).slice(0, 5);
}

function SuggestionPanel({ staffList, shifts, year, month, dept, onApply }) {
  const [suggestions, setSuggestions] = useState([]);
  const [baseScore, setBaseScore] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);

  const analyze = () => {
    const result = scoreShiftState(staffList, shifts, year, month, dept);
    setBaseScore(result);
    setSuggestions(generateSuggestions(staffList, shifts, year, month, dept));
    setAnalyzed(true);
  };

  const TYPE_ICON = { add_staff:'➕', reduce_night:'🌙', fix_kibo:'💚', fix_consec:'📅' };

  return (
    <div style={{background:"#f8fffe",border:"1px solid #90cbc8",borderRadius:12,padding:16,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <span style={{fontSize:13,fontWeight:900,color:"#1a3635"}}>🔍 改善提案</span>
        <button onClick={analyze} style={{background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:800}}>分析する</button>
        {baseScore!==null&&<span style={{fontSize:11,color:baseScore.total===0?"#16a34a":"#c44b4b",fontWeight:700}}>ペナルティ: {baseScore.total}点{baseScore.total===0?" ✅ 問題なし":""}</span>}
      </div>

      {analyzed && suggestions.length === 0 && baseScore?.total === 0 && (
        <div style={{fontSize:12,color:"#16a34a",fontWeight:700}}>✅ 現在のシフトに問題は見つかりませんでした。</div>
      )}
      {analyzed && suggestions.length === 0 && baseScore?.total > 0 && (
        <div style={{fontSize:12,color:"#6b7280"}}>自動改善できる案が見つかりませんでした。手動での調整をお試しください。</div>
      )}

      {suggestions.map((s, i) => (
        <div key={i} style={{background:"#f0fff4",border:"1px solid #86efac",borderRadius:9,padding:"10px 14px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div>
              <span style={{fontSize:11,fontWeight:800,color:"#16a34a"}}>{TYPE_ICON[s.type]||"✅"} 改善案 {i+1}</span>
              <span style={{fontSize:10,color:"#16a34a",marginLeft:8}}>(-{s.improvement}点改善 → {s.newScore}点)</span>
              <div style={{fontSize:12,color:"#1a3635",marginTop:4}}>{s.description}</div>
            </div>
            <button onClick={()=>onApply(s.newShifts)}
              style={{flexShrink:0,background:"#16a34a",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
              適用する
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShiftTable({ staffList, shifts, dept, year, month, onLeftClick, onRightClick, events, onEventEdit }) {
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
          {onEventEdit&&<tr>
            <th style={{...TH({sticky:true,w:148}),background:"#fffbea",borderBottom:"2px solid #fde68a"}}><span style={{fontSize:10,color:"#92400e",fontWeight:700}}>行事</span></th>
            {Array.from({length:days},(_,i)=>i+1).map(d=>{const ev=(events||{})[d]||"";return(<th key={d} onClick={()=>onEventEdit(d)} title={ev||"クリックして行事を入力"} style={{...TH({}),background:ev?"#fef3c7":"#fffdf0",borderBottom:"2px solid #fde68a",padding:"3px 1px",cursor:"pointer",minWidth:30,width:30,verticalAlign:"top"}}><div style={{writingMode:"vertical-rl",textOrientation:"mixed",fontSize:10,color:"#92400e",fontWeight:700,lineHeight:1.2,margin:"0 auto",minHeight:ev?undefined:16}}>{ev}</div></th>);})}
            <th colSpan={3} style={{background:"#fffbea",borderBottom:"2px solid #fde68a"}}/>
          </tr>}
        </thead>
        <tbody>
          {ds.map((s,si)=>{
            const sShifts=shifts[s.id]||{}, kibodays=s.kiboByMonth?.[mk]||[], yukyudays=s.yukyuByMonth?.[mk]||[];
            const workCnt=Object.values(sShifts).filter(v=>WORK_TYPES.has(v)).length;
            const nightCnt=Object.values(sShifts).filter(v=>v==="夜勤").length;
            const restCnt=Object.values(sShifts).reduce((acc,v)=>REST_TYPES.has(v)&&v!=="明け"?acc+(HALF_REST_TYPES.has(v)?0.5:1):acc,0);
            const nightOver=s.nightOk&&nightCnt>(s.nightMax||5);
            return (
              <tr key={s.id} style={{background:si%2===0?"#ffffff":"#fafeff"}}>
                <td style={{position:"sticky",left:0,zIndex:2,background:si%2===0?"#ffffff":"#fafeff",padding:"4px 10px",borderRight:"1px solid #90cbc8",borderBottom:"1px solid #b8deda",minWidth:148}}>
                  <div style={{fontWeight:700,fontSize:12,color:"#1a3635",whiteSpace:"nowrap"}}>{s.name}</div>
                  <div style={{fontSize:10,color:"#2a5a57",display:"flex",gap:6,alignItems:"center"}}><span>{s.role}</span>{s.nightOk&&<span style={{color:nightOver?"#ef4444":"#c45c35",fontSize:9}}>🌙{nightCnt}/{s.nightMax}</span>}</div>
                </td>
                {Array.from({length:days},(_,i)=>i+1).map(d=>{
                  const type=sShifts[d]||"", isKibo=kibodays.includes(d)&&!type, isYukyu=yukyudays.includes(d)&&!type&&!isKibo, consecViol=isConsecViolation(sShifts,d);
                  return <td key={d} style={{padding:"2px 1px",textAlign:"center",borderRight:"1px solid #b8deda",borderBottom:"1px solid #b8deda",background:consecViol?"#ffe8e8":isKibo?"#fff5f5":isYukyu?"#faf0ff":undefined,cursor:"pointer",outline:consecViol?"1px solid #e0707060":undefined}} onClick={(e)=>onLeftClick(s.id,d,e)} onContextMenu={(e)=>{e.preventDefault();onRightClick(s.id,d,e);}}>{isKibo?<span style={{fontSize:9,color:"#c44b4b"}}>希</span>:isYukyu?<span style={{fontSize:9,color:"#9b4db5"}}>有</span>:<ShiftBadge type={type}/>}{consecViol&&<span style={{fontSize:7,color:"#c44b4b",display:"block",lineHeight:1}}>連超</span>}</td>;
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
          <tr style={{background:"#fff5f5"}}>
            <td style={{position:"sticky",left:0,zIndex:2,background:"#fff5f5",padding:"3px 10px",borderRight:"1px solid #90cbc8",borderBottom:"1px solid #b8deda",fontSize:10,color:"#c44b4b",fontWeight:700,whiteSpace:"nowrap"}}>希望休</td>
            {Array.from({length:days},(_,i)=>i+1).map(d=>{
              const cnt=ds.reduce((acc,s)=>acc+((s.kiboByMonth?.[mk]||[]).includes(d)?1:0),0);
              const limit=dept.kiboLimit||3;
              const over=cnt>=limit, warn=cnt===limit-1;
              return <td key={d} style={{textAlign:"center",fontSize:11,fontWeight:800,padding:"3px 0",color:over?"#ef4444":warn?"#f59e0b":cnt>0?"#c44b4b":"#d5edeb",background:over?"#ffe4e4":warn?"#fffbeb":undefined,borderRight:"1px solid #b8deda",borderBottom:"1px solid #b8deda"}}>{over?"⚠":cnt>0?cnt:""}</td>;
            })}
            <td colSpan={3} style={{borderBottom:"1px solid #b8deda"}}/>
          </tr>
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
        <tbody>{ds.map((s,i)=>{const sv=shifts[s.id]||{},cnt={};shownKeys.forEach(k=>{cnt[k]=Object.values(sv).filter(v=>v===k).length;});const work=["早番","日勤","遅番","夜勤","明け"].reduce((a,k)=>a+(cnt[k]||0),0),kiboSel=(s.kiboByMonth?.[mk]||[]).length;return(<tr key={s.id} style={{background:i%2===0?"#ffffff":"#fafeff"}}><td style={{...TD,position:"sticky",left:0,zIndex:1,background:i%2===0?"#ffffff":"#fafeff",padding:"5px 10px",borderRight:"1px solid #90cbc8"}}><div style={{fontWeight:700,fontSize:12,color:"#1a3635"}}>{s.name}</div><div style={{fontSize:10,color:"#2a5a57"}}>{s.role}</div></td>{shownKeys.map(k=><td key={k} style={{...TD,color:cnt[k]>0?SHIFTS[k].color:"#8ecece",fontWeight:800,fontSize:13}}>{cnt[k]||"－"}</td>)}<td style={{...TD,color:"#2BBFBA",fontWeight:800,fontSize:14}}>{work}</td><td style={{...TD,color:"#f87171",fontWeight:700,fontSize:13}}>{kiboSel||"－"}</td></tr>);})}</tbody>
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
        {ds.map((s,i)=>{const mk=monthKey(year,month),kibo=(s.kiboByMonth?.[mk]||[]).length,yukyu=(s.yukyuByMonth?.[mk]||[]).length;return(<div key={s.id} style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,background:`hsl(${(i*53+180)%360},55%,30%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:800}}>{s.name.charAt(0)}</div><div><div style={{fontWeight:800,fontSize:13,color:"#1a3635"}}>{s.name}</div><div style={{fontSize:10,color:"#2a5a57",display:"flex",gap:8,flexWrap:"wrap"}}><span>{s.role}</span><span>目標{s.targetWork}日</span><span>休み{s.kyukoDaysByMonth?.[monthKey(year,month)]??s.kyukoDays??8}日</span>{s.nightOk&&<span style={{color:"#c45c35"}}>🌙夜勤×{s.nightMax}回</span>}{kibo>0&&<span style={{color:"#dc2626"}}>希望休{kibo}日</span>}{yukyu>0&&<span style={{color:"#9b4db5"}}>有休{yukyu}日</span>}</div></div></div><div style={{display:"flex",gap:6}}><button onClick={()=>onEdit(s)} style={ICON_BTN("#2BBFBA")}>✏️</button><button onClick={()=>onDelete(s.id)} style={ICON_BTN("#ef4444")}>🗑</button></div></div>);})}
        {ds.length===0&&<div style={{background:"#f3fffe",border:"1px dashed #0e3a38",borderRadius:10,padding:32,textAlign:"center",color:"#8ecece",fontSize:13}}>スタッフが登録されていません</div>}
      </div>
    </div>
  );
}

function Legend() {
  const normalShifts=["早番","日勤","遅番","夜勤","明け","休み","希望休","有休"], halfShifts=["日/休","休/日","早/休","休/遅"];
  return (
    <div style={{padding:"6px 0 6px",borderBottom:"1px solid #b8deda",marginBottom:10}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:4}}>{normalShifts.map(key=><div key={key} style={{display:"flex",alignItems:"center",gap:3}}><ShiftBadge type={key}/><span style={{fontSize:9,color:"#2a5a57"}}>{key}</span></div>)}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,alignItems:"center"}}><span style={{fontSize:9,color:"#8ecece",fontWeight:700}}>半休:</span>{halfShifts.map(key=><div key={key} style={{display:"flex",alignItems:"center",gap:3}}><ShiftBadge type={key}/><span style={{fontSize:9,color:"#2a5a57"}}>{SHIFTS[key].time}</span></div>)}<span style={{fontSize:9,color:"#8ecece",marginLeft:4}}>左クリック：順番切替 ／ 右クリック：メニュー選択</span></div>
    </div>
  );
}

const MNAV = { background:"#ffffff", color:"#2BBFBA", border:"1px solid #90cbc8", borderRadius:6, width:28, height:28, cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center" };

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
    const hBg=isWE?'#ffe0e6':'#e0f4f2', hColor=isWE?'#c0392b':'#1a3635';
    let ri=0, rows='';
    groups.forEach((g, gi)=>{g.staff.forEach((s,si)=>{const bg=ri++%2===0?'#ffffff':'#f5fffe'; const borderTop=(si===0&&gi>0)?'border-top:2px solid #b8deda;':''; rows+=`<tr style="background:${bg};${borderTop}"><td style="color:${g.color};font-weight:bold;font-size:10px;padding:2px 5px;white-space:nowrap;vertical-align:middle;${borderTop}">${si===0?g.st:''}</td><td style="padding:2px 5px;font-size:10px;${borderTop}">${s.name}</td><td style="padding:2px 5px;font-size:10px;color:#1a9e9a;font-weight:bold;${borderTop}">${s.assignment}</td></tr>`;});});
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
  const LS = {fontSize:11,color:"#3a8a87",fontWeight:700,marginBottom:6,display:"block"};
  const rowStyle = {display:"flex",alignItems:"center",gap:6,marginBottom:7};
  const delBtn = () => ({background:"#fff0f0",border:"1px solid #e07070",borderRadius:6,color:"#c44b4b",cursor:"pointer",padding:"5px 9px",fontSize:13});
  const addBtn = {background:"#2BBFBA",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800};
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:210,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>⚙️ 予定表 設定</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        <label style={LS}>📍 配置グループ（均等分配用）</label>
        <div style={{fontSize:10,color:"#6ab5b2",marginBottom:8}}>例：1階・2階など。自動配置で均等に振り分けたい場合に設定します。</div>
        <div style={{background:"#d5edeb",borderRadius:9,padding:"10px 12px",marginBottom:18,border:"1px solid #90cbc8"}}>
          {groups.map((name,i)=>(
            <div key={i} style={rowStyle}>
              <input value={name} onChange={e=>updateGroup(i,e.target.value)} style={{...INPUT_STYLE,flex:1,marginBottom:0,padding:"6px 10px"}} placeholder={`グループ${i+1}（例：1階）`}/>
              <button onClick={()=>deleteGroup(i)} style={delBtn()}>✕</button>
            </div>
          ))}
          <button onClick={()=>setGroups(p=>[...p,""])} style={addBtn}>＋ グループを追加</button>
        </div>
        <label style={LS}>🎯 役割・業務</label>
        <div style={{fontSize:10,color:"#6ab5b2",marginBottom:8}}>入浴・フリーなどの業務担当を自由に追加できます。</div>
        <div style={{background:"#d5edeb",borderRadius:9,padding:"10px 12px",marginBottom:18,border:"1px solid #90cbc8"}}>
          {duties.map((name,i)=>(
            <div key={i} style={rowStyle}>
              <input value={name} onChange={e=>updateDuty(i,e.target.value)} style={{...INPUT_STYLE,flex:1,marginBottom:0,padding:"6px 10px"}} placeholder={`役割${i+1}`}/>
              <button onClick={()=>deleteDuty(i)} style={delBtn()}>✕</button>
            </div>
          ))}
          <button onClick={()=>setDuties(p=>[...p,""])} style={addBtn}>＋ 役割を追加</button>
        </div>
        <label style={LS}>⚡ 自動配置ルール</label>
        <div style={{fontSize:10,color:"#6ab5b2",marginBottom:10}}>「自動配置」ボタンで全日程に一括適用されるルールです。</div>
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
  const floorOptions = ["", ...(floorSettings.floors||[]).map(f=>f.name), ...(floorSettings.duties||[]).map(d=>d.name)];
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
      <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:10,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:800,color:"#2BBFBA",whiteSpace:"nowrap"}}>🏠 フロア</span>
        {(floorSettings.duties||[]).map((d,i)=><span key={i} style={{background:"#d5edeb",borderRadius:6,padding:"3px 9px",fontSize:11,color:"#1a3635",fontWeight:700}}>{d.name}</span>)}
        <button onClick={()=>setSettingsOpen(true)} style={{background:"#2BBFBA",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>⚙️ 設定</button>
        <button onClick={handleAutoAssign} style={{background:"linear-gradient(135deg,#f5b942,#e07b30)",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>⚡ 自動配置</button>
        <button onClick={handleClearAssign} style={{background:"#fff0f0",color:"#c44b4b",border:"1px solid #e07070",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>🗑 配置クリア</button>
        <button onClick={handlePrint} style={{marginLeft:"auto",background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>🖨️ 印刷</button>
        <button onClick={handleDownloadYotei} style={{background:"#ffffff",color:"#2BBFBA",border:"1px solid #90cbc8",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>📥 USB保存</button>
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
                    <span style={{fontSize:10,fontWeight:800,color:sh.color,minWidth:22,textAlign:"center",background:sh.bg,borderRadius:2,flexShrink:0,lineHeight:"18px",padding:"0 2px"}}>{sh.short}</span>
                    <div style={{fontSize:11,color:"#2a5a57",lineHeight:1.6,display:"flex",flexWrap:"wrap",gap:"2px 4px"}}>
                      {group.map(s=>{const a=assign[s.id],nm=s.name.replace(/\s/g,"");return<span key={s.id}>{nm}{a&&<span style={{color:"#1a9e9a",fontWeight:700}}>({a.slice(0,4)})</span>}</span>;})}
                    </div>
                  </div>
                );
              })}
              {workCount===0&&<div style={{fontSize:10,color:"#b8deda",textAlign:"center",paddingTop:4}}>勤務なし</div>}
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
        {["日","月","火","水","木","金","土"].map((w,i)=><div key={w} style={{textAlign:"center",fontSize:11,color:i===0?"#f87171":i===6?"#2BBFBA":"#3a8a87",padding:"3px 0",fontWeight:700}}>{w}</div>)}
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
              style={{background:isMe?activeBg:blocked?"#f5f5f5":"transparent",border:isMe?`2px solid ${activeBorder}`:blocked?"1px solid #e5e5e5":"1px solid #0e3a38",borderRadius:6,padding:"4px 2px",cursor:blocked?"not-allowed":"pointer",color:isMe?activeColor:blocked?"#aaa":we?"#2BBFBA":"#1a3635",fontSize:11,fontWeight:isMe?800:400,display:"flex",flexDirection:"column",alignItems:"center",gap:1,minHeight:38,position:"relative",opacity:blocked?0.5:1}}>
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
        <div style={{marginTop:8,fontSize:11,color:"#3a8a87"}}>
          <span style={{color:"#9b4db5",fontWeight:700}}>■</span> 自分の有休
          <span style={{marginLeft:12,color:"#6b7280"}}>※ 人数上限なし・自由に選択可</span>
        </div>
      ) : (
        <div style={{marginTop:8,fontSize:11,color:"#3a8a87"}}>
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
          depts: [{ id: c.d.id, label: c.d.label, icon: c.d.icon, kiboLimit: c.d.kb || 3, deadline: c.d.dl || null }],
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

  // 締め切り日の月を対象月として自動設定
  useEffect(() => {
    if (!config) return;
    const dept = config.depts?.find(d => d.id === (fixedDeptId || config.depts?.[0]?.id));
    if (!dept?.deadline) return;
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
  const isMonthLocked = !!selDept?.deadline;

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

  const BASE = { minHeight:"100vh", background:"linear-gradient(135deg,#f0fbfa,#d4f1ef)", fontFamily:"'Noto Sans JP',sans-serif", padding:16 };

  if (loading) return (
    <div style={{...BASE,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <ShifuponIcon size={48} radius={12}/>
        <div style={{color:"#6ab5b2",fontSize:13,marginTop:12}}>読み込み中…</div>
      </div>
    </div>
  );

  if (loadError) return (
    <div style={{...BASE,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center",color:"#ef4444"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:14,fontWeight:700}}>施設情報を読み込めませんでした</div>
        <div style={{fontSize:12,color:"#6b7280",marginTop:8}}>URLが正しいか確認してください</div>
        <button onClick={loadConfig} style={{marginTop:16,background:"#2BBFBA",color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          🔄 再読込
        </button>
      </div>
    </div>
  );

  return (
    <div style={BASE}>
      {/* ヘッダー */}
      <div style={{background:"#fff",borderRadius:14,padding:"12px 16px",marginBottom:16,boxShadow:"0 2px 12px #0e3a3820",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <ShifuponIcon size={36} radius={8}/>
          <div>
            <div style={{fontSize:13,fontWeight:900,color:"#1a3635"}}>{config.facility_name || "しふぽん"}</div>
            <div style={{fontSize:10,color:"#3a8a87"}}>希望休・有休 入力ポータル</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {!isMonthLocked&&<button onClick={prevMonth} style={{background:"none",border:"none",fontSize:18,color:"#2BBFBA",cursor:"pointer"}}>◀</button>}
          <span style={{fontSize:13,fontWeight:800,color:"#1a3635"}}>{year}年{month+1}月</span>
          {!isMonthLocked&&<button onClick={nextMonth} style={{background:"none",border:"none",fontSize:18,color:"#2BBFBA",cursor:"pointer"}}>▶</button>}
        </div>
      </div>

      {/* 部署選択（fixedDeptIdがない場合のみ表示） */}
      {!fixedDeptId && (
        <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 6px #0e3a3815"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#3a8a87",marginBottom:10}}>▍ 部署を選んでください</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {(config.depts||[]).map(d=>(
              <button key={d.id} onClick={()=>{setSelDeptId(d.id);setSelStaffId(null);setMyDays([]);setMyYukyuDays([]);setSubmitted(false);}}
                style={{background:selDeptId===d.id?"linear-gradient(135deg,#2BBFBA,#45B7D1)":"#d5edeb",color:selDeptId===d.id?"#fff":"#1a3635",border:"none",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:selDeptId===d.id?800:400}}>
                {d.icon} {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 固定部署の場合は部署名をヘッダーに表示 */}
      {fixedDeptId && selDept && (
        <div style={{background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",borderRadius:12,padding:"10px 16px",marginBottom:12,textAlign:"center"}}>
          <span style={{color:"#fff",fontWeight:900,fontSize:14}}>{selDept.icon} {selDept.label}</span>
        </div>
      )}

      {/* スタッフ選択 */}
      {selDeptId && (
        <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 6px #0e3a3815"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#3a8a87",marginBottom:10}}>▍ 自分の名前を選んでください</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {deptStaff.length===0&&<div style={{fontSize:12,color:"#9ca3af"}}>スタッフが見つかりません。管理者がスタッフを登録後、<button onClick={loadConfig} style={{background:"none",border:"none",color:"#2BBFBA",cursor:"pointer",fontWeight:700,fontSize:12,padding:0,textDecoration:"underline"}}>再読込</button>してください。</div>}
            {deptStaff.map(s=>(
              <button key={s.id} onClick={()=>{setSelStaffId(s.id);setMyDays([]);setMyYukyuDays([]);setSubmitted(false);}}
                style={{background:selStaffId===s.id?"linear-gradient(135deg,#2BBFBA,#b07fd4)":"#d5edeb",color:selStaffId===s.id?"#fff":"#1a3635",border:"none",borderRadius:9,padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:selStaffId===s.id?800:400}}>
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
          <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 6px #0e3a3815"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#3a8a87",marginBottom:4}}>▍ {selStaff.name}さんの希望休（{year}年{month+1}月）</div>
            <div style={{fontSize:10,color:"#c44b4b",marginBottom:10}}>※ 同じ日は上限{lim}名まで。上限に達した日は選択できません。</div>
            {kiboLoading ? (
              <div style={{textAlign:"center",color:"#6ab5b2",padding:20}}>読み込み中…</div>
            ) : (
              <StaffKiboCalendar year={year} month={month} myDays={myDays} otherCounts={otherCounts} kiboLimit={lim} onChange={setMyDays} type="kibo" disabledDays={myYukyuDays}/>
            )}
            <div style={{marginTop:10,fontSize:12,color:"#ef4444",fontWeight:700}}>選択中: {myDays.length}日</div>
          </div>

          {/* 有休 */}
          <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:12,boxShadow:"0 1px 6px #0e3a3815",border:"1px solid #e8d5f5"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#9b4db5",marginBottom:4}}>▍ {selStaff.name}さんの有休（{year}年{month+1}月）</div>
            <div style={{fontSize:10,color:"#9b4db5",marginBottom:10}}>※ 有休取得希望日を選んでください。人数制限はありません。</div>
            {kiboLoading ? (
              <div style={{textAlign:"center",color:"#6ab5b2",padding:20}}>読み込み中…</div>
            ) : (
              <StaffKiboCalendar year={year} month={month} myDays={myYukyuDays} otherCounts={{}} kiboLimit={99} onChange={setMyYukyuDays} type="yukyu" disabledDays={myDays}/>
            )}
            <div style={{marginTop:10,fontSize:12,color:"#9b4db5",fontWeight:700}}>選択中: {myYukyuDays.length}日</div>
          </div>

          {/* 送信ボタン */}
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            <button onClick={handleSubmit} disabled={submitting}
              style={{background:submitting?"#d5edeb":"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:submitting?"#2a5a57":"#fff",border:"none",borderRadius:10,padding:"12px 28px",cursor:submitting?"not-allowed":"pointer",fontSize:14,fontWeight:800}}>
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
            <div style={{fontSize:12,color:"#3a8a87",marginBottom:4}}>{year}年{month+1}月の申請を送信しました。</div>
          )}
          <div style={{fontSize:11,color:"#6b7280",margin:"8px 0 16px"}}>管理者に自動で反映されます。</div>
          <button onClick={()=>setSubmitted(false)} style={{background:"#d5edeb",color:"#1a3635",border:"none",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontSize:12,fontWeight:700}}>✏️ 修正する</button>
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
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#f0fbfa,#d4f1ef)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Noto Sans JP',sans-serif"}}>
        <div style={{textAlign:"center"}}>
          <div style={{margin:"0 auto 12px"}}><ShifuponIcon size={48} radius={12}/></div>
          <div style={{color:"#6ab5b2",fontSize:13}}>読み込み中…</div>
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
const PLAN_COLORS = { free:"#6b7280", standard:"#2BBFBA", full:"#f59e0b" };

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
      <div style={{background:"#f5fffe",border:"1px solid #90cbc8",borderRadius:16,padding:24,width:"100%",maxWidth:680,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:900,color:"#1a3635"}}>🏢 施設管理（管理者）</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:22}}>✕</button>
        </div>
        {loading ? <div style={{textAlign:"center",color:"#6ab5b2",padding:40}}>読み込み中…</div> : (
          <>
            <div style={{fontSize:11,color:"#6ab5b2",marginBottom:12}}>登録施設数：{facilities.length}件</div>
            {facilities.map(f => (
              <div key={f.id} style={{background:"#f0fffe",border:"1px solid #b8deda",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontWeight:800,fontSize:13,color:"#1a3635"}}>{f.facility_name||"（施設名未設定）"}</div>
                  <div style={{fontSize:10,color:"#6ab5b2",marginTop:2}}>{f.created_at?.slice(0,10)} 登録</div>
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
  const isMergingKibo = useRef(false); // mergeStaffKibo中にstaffListが再保存されるのを防ぐ
  const [dbLoading, setDbLoading] = useState(true);
  const [portalSettings, setPortalSettings] = useState({}); // { [deptId]: { deadline: "YYYY-MM-DD"|null } }

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
    if (!isInitializing.current && !isMergingKibo.current) {
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'staffList', data_value:staffList, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' })
        .then(({ error }) => { if (error) console.error('[sync] staffList upsert失敗:', error); else console.log('[sync] staffList 保存OK'); });
    }
  }, [staffList]); // eslint-disable-line react-hooks/exhaustive-deps

  // スタッフポータル用: 施設設定をSupabaseに公開保存（dbLoading完了後に必ず1回書く）
  useEffect(() => {
    if (dbLoading) return;
    if (staffList.length === 0) return; // 空データで上書きしない
    const cfg = {
      facility_name: profile?.facility_name || '',
      depts: depts.map(d => {
        const ps = portalSettings[d.id] || {};
        return { id: d.id, label: d.label, icon: d.icon, kiboLimit: d.kiboLimit || 3, deadline: ps.deadline || null };
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
  const [allEvents, setAllEvents] = useState({});
  const [eventEditDay, setEventEditDay] = useState(null);

  const [saveStatus, setSaveStatus] = useState("saved");
  const saveStatusRef = useRef("saved");
  useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
  const saveTimer = useRef(null);
  const isLoadingMonth = useRef(false);
  const activeDeptIdRef = useRef(activeDeptId);
  useEffect(() => { activeDeptIdRef.current = activeDeptId; }, [activeDeptId]);
  const userEditSeq = useRef(0); // ユーザー編集のたびにインクリメント（Realtime競合検出用）

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
        if (byKey['excelRawMonths']) {
          const actualDepts = byKey['depts'] || depts;
          const migrated = migrateLegacyExcelRaw(byKey['excelRawMonths'], actualDepts);
          const filteredRaw = filterExpiredExcelMonths(migrated);
          setExcelRawMonths(filteredRaw);
          const excl = filterExpiredExceptions(byKey['exceptionMonths'] || []);
          const trend = {};
          for (const [dId, deptRaw] of Object.entries(filteredRaw)) {
            const recomp = computeShiftTrendFromRaw(deptRaw, excl);
            if (Object.keys(recomp).filter(k=>k!=='_months').length > 0) trend[dId] = recomp;
          }
          if (Object.keys(trend).length > 0) setShiftTrend(trend);
        }
        if (byKey['allFloorSettings']) setAllFloorSettings(byKey['allFloorSettings']);
        if (byKey['events_data']) setAllEvents(byKey['events_data']);
        const latestStaffList = byKey['staffList'] || staffList;
        const latestExceptionMonths = filterExpiredExceptions(byKey['exceptionMonths'] || []);
        if (byKey['exceptionMonths']) setExceptionMonths(latestExceptionMonths);
        const learned = computeLearnedTrend(byKey, latestStaffList, latestExceptionMonths);
        if (Object.keys(learned).length > 0) setLearnedTrend(learned);
        if (byKey['aiRules']) setAiRules(byKey['aiRules']);
        if (byKey['portalSettings']) setPortalSettings(byKey['portalSettings']);
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
      // 編集中（unsaved）はスキップ — saveStatusRefはユーザー操作で即時更新されるため確実
      if (saveStatusRef.current === 'unsaved') return;
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
        if (byKey['depts'])      setDepts(byKey['depts']);
        if (byKey['staffList'])  setStaffList(byKey['staffList']);
        const latestExcRT = filterExpiredExceptions(byKey['exceptionMonths'] || exceptionMonths);
        if (byKey['excelRawMonths']) {
          const actualDepts2 = byKey['depts'] || depts;
          const migrated2 = migrateLegacyExcelRaw(byKey['excelRawMonths'], actualDepts2);
          const filteredRaw2 = filterExpiredExcelMonths(migrated2);
          setExcelRawMonths(filteredRaw2);
          const trend2 = {};
          for (const [dId, deptRaw] of Object.entries(filteredRaw2)) {
            const recomp = computeShiftTrendFromRaw(deptRaw, latestExcRT);
            if (Object.keys(recomp).filter(k=>k!=='_months').length > 0) trend2[dId] = recomp;
          }
          if (Object.keys(trend2).length > 0) setShiftTrend(trend2);
        }
        if (byKey['portalSettings']) setPortalSettings(byKey['portalSettings']);
        if (byKey['exceptionMonths']) setExceptionMonths(latestExcRT);
        const latestStaffListRT = byKey['staffList'] || staffList;
        const learnedRT = computeLearnedTrend(byKey, latestStaffListRT, latestExcRT);
        if (Object.keys(learnedRT).length > 0) setLearnedTrend(learnedRT);
        const shiftPrefix = `shifts_${year}_${month+1}_`;
        const deptShiftEntries = Object.entries(byKey).filter(([k]) => k.startsWith(shiftPrefix));
        if (deptShiftEntries.length > 0) {
          isLoadingMonth.current = true;
          setAllShifts(prev => {
            // updater実行時に再チェック（fetch後に編集があればキャンセル）
            if (userEditSeq.current !== seqAtStart) return prev;
            const result = { ...prev };
            for (const [k, v] of deptShiftEntries) {
              result[k.slice(shiftPrefix.length)] = v;
            }
            return restoreShifts(result);
          });
          setTimeout(() => { isLoadingMonth.current = false; }, 100);
        } else {
          const legacyKey = `shifts_${year}_${month+1}`;
          if (byKey[legacyKey]) {
            isLoadingMonth.current = true;
            setAllShifts(prev => {
              if (userEditSeq.current !== seqAtStart) return prev;
              return restoreShifts(byKey[legacyKey]);
            });
            setTimeout(() => { isLoadingMonth.current = false; }, 100);
          }
        }
      } catch(e) { console.warn('リモート同期エラー:', e); }
      finally { setTimeout(() => { isInitializing.current = false; }, 300); }
    };

    // スマホでアプリを切り替えて戻ったとき同期
    const onVisibility = () => { if (!document.hidden) reloadFromRemote(); };
    document.addEventListener('visibilitychange', onVisibility);

    // Supabase Realtime: 他デバイスが保存した瞬間に同期
    const mergeStaffKibo = async () => {
      const mk = monthKey(year, month);
      const { data } = await supabase.from('staff_kibo').select('*').eq('admin_user_id', session.user.id).eq('month_key', mk);
      isMergingKibo.current = true;
      setStaffList(prev => {
        const merged = prev.map(s => {
          if (!data || data.length === 0) return s;
          const kibo = data.find(k => k.dept_id === s.dept && k.staff_id === s.id);
          if (!kibo) return s;
          return {
            ...s,
            kiboByMonth: { ...(s.kiboByMonth || {}), [mk]: kibo.days || [] },
            yukyuByMonth: { ...(s.yukyuByMonth || {}), [mk]: kibo.yukyu_days || [] }
          };
        });
        // マージ後のデータを即座にSupabaseへ保存（reloadFromRemoteで古いデータに上書きされるのを防ぐ）
        supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'staffList', data_value:merged, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(()=>{});
        return merged;
      });
      setTimeout(() => { isMergingKibo.current = false; }, 200);
    };
    mergeStaffKibo();

    const channel = supabase.channel(`shift-sync-${session.user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shift_data', filter: `user_id=eq.${session.user.id}` },
        () => reloadFromRemote()
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
      supabase.removeChannel(channel);
      supabase.removeChannel(kiboChannel);
    };
  }, [dbLoading, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 月切替: Supabase から当月シフトをロード（部署ごとに別キー）──
  useEffect(() => {
    if (isInitializing.current) return;
    isLoadingMonth.current = true;
    const prefix = `shifts_${year}_${month+1}_`;
    supabase.from('shift_data').select('data_key,data_value')
      .eq('user_id', session.user.id)
      .like('data_key', prefix + '%')
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          const merged = {};
          for (const row of data) { merged[row.data_key.slice(prefix.length)] = row.data_value; }
          setAllShifts(restoreShifts(merged));
        } else {
          // 旧フォーマット fallback
          const legacyKey = `shifts_${year}_${month+1}`;
          supabase.from('shift_data').select('data_value')
            .eq('user_id', session.user.id).eq('data_key', legacyKey).maybeSingle()
            .then(({ data: ld }) => {
              if (ld?.data_value) { setAllShifts(restoreShifts(ld.data_value)); }
              else { try { const saved=localStorage.getItem(SAVE_KEY(year,month)); setAllShifts(saved ? restoreShifts(JSON.parse(saved)) : {}); } catch { setAllShifts({}); } }
            });
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
    // isLoadingMonth中（Supabaseからのロード中）のみスキップ
    // isInitializingは不要: reloadFromRemoteはisLoadingMonth=trueでsetAllShiftsするため
    if (isLoadingMonth.current) return;
    saveStatusRef.current = "unsaved"; // Realtime保護を即時有効化（レンダー後のeffect待ち不要）
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (isLoadingMonth.current) return;
      // 部署ごとに別キーで保存（同時編集の競合を防ぐ）
      // activeDeptId は ref 経由で参照（deps に入れると部署切替のたびに余分なDBアクセスが発生するため）
      const currentDeptId = activeDeptIdRef.current;
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

  const eventsTimer = useRef(null);
  useEffect(() => {
    if (isInitializing.current) return;
    if (eventsTimer.current) clearTimeout(eventsTimer.current);
    eventsTimer.current = setTimeout(() => {
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'events_data', data_value:allEvents, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(({error})=>{ if(error)console.error('[events] 保存失敗:',error); });
    }, 1200);
    return () => { if (eventsTimer.current) clearTimeout(eventsTimer.current); };
  }, [allEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  const [generating, setGenerating] = useState(false);
  const [generateWarnings, setGenerateWarnings] = useState(null);
  const [downloadModal, setDownloadModal] = useState(false);
  const [bulkKyukoModal, setBulkKyukoModal] = useState(false);
  const isMobile = (window.innerWidth || document.documentElement.clientWidth) < 900;
  const [tableZoom, setTableZoom] = useState(() => { try { return Number(localStorage.getItem("shiftTableZoom")) || 100; } catch { return 100; } });
  const handleZoomChange = useCallback((v) => { const min=isMobile?30:40; const c=Math.min(100,Math.max(min,Math.round(v/5)*5)); setTableZoom(c); try{localStorage.setItem("shiftTableZoom",c);}catch{} }, [isMobile]);
  const autoFitZoom = useCallback((staffCount, days) => { const vw=window.innerWidth-(isMobile?8:24); const tableEstWidth=148+30*days+116; const min=isMobile?30:40; return Math.min(100,Math.max(min,Math.round(Math.floor(vw/tableEstWidth*100)/5)*5)); }, [isMobile]);
  const autoFitApplied = useRef(false);
  useEffect(() => { if(autoFitApplied.current)return; try{const s=localStorage.getItem("shiftTableZoom");if(s&&!isMobile){autoFitApplied.current=true;return;}}catch{} setTableZoom(autoFitZoom(staffList.filter(s=>s.dept===activeDeptId).length,getDays(now.getFullYear(),now.getMonth()))); autoFitApplied.current=true; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [excelImportModal, setExcelImportModal] = useState(false);
  const [clearModal, setClearModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [adminModal, setAdminModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [helpModal, setHelpModal] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [shiftTrend, setShiftTrend] = useState({}); // { deptId: { staffName: { freq } } }
  const [learnedTrend, setLearnedTrend] = useState({});
  const [exceptionMonths, setExceptionMonths] = useState([]); // ["YYYY-M", ...]
  const [excelRawMonths, setExcelRawMonths] = useState({}); // { deptId: { "YYYY-M": { name: {counts} } } }
  const [excelResetDismissed, setExcelResetDismissed] = useState(() => { try{return localStorage.getItem('shiftNavi_excelResetDismissed')==='true';}catch{return false;} });
  const [aiMode, setAiMode] = useState(false);
  // ── 部署編集ロック ──
  const [unlockedDeptId, setUnlockedDeptId] = useState(null); // 解錠中の部署ID
  const [pinModal, setPinModal] = useState(false);
  // タブ切替で自動ロック
  useEffect(() => { setUnlockedDeptId(null); }, [activeDeptId]);
  const isLocked = !!(depts.find(d=>d.id===activeDeptId)?.pin && unlockedDeptId !== activeDeptId);
  const isLockedRef = useRef(isLocked);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRules, setAiRules] = useState("");
  const [showAiRules, setShowAiRules] = useState(false);
  const aiRulesTimerRef = useRef(null);
  const generateTimerRef = useRef(null);
  useEffect(() => {
    if (isInitializing.current) return;
    if (aiRulesTimerRef.current) clearTimeout(aiRulesTimerRef.current);
    aiRulesTimerRef.current = setTimeout(() => {
      supabase.from('shift_data').upsert({ user_id: session.user.id, data_key: 'aiRules', data_value: aiRules, updated_at: new Date().toISOString() }, { onConflict: 'user_id,data_key' }).then(() => {}).catch(() => {});
    }, 1000);
    return () => { if (aiRulesTimerRef.current) clearTimeout(aiRulesTimerRef.current); };
  }, [aiRules]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isInitializing.current) {
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'shiftTrend', data_value:shiftTrend, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' });
    }
  }, [shiftTrend]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isInitializing.current) {
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'exceptionMonths', data_value:exceptionMonths, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' });
      // 例外月変更時: DBデータとExcelデータ両方を再計算
      if (Object.keys(excelRawMonths).length > 0) {
        const trend3 = {};
        for (const [dId, deptRaw] of Object.entries(excelRawMonths)) {
          const recomp = computeShiftTrendFromRaw(deptRaw, exceptionMonths);
          if (Object.keys(recomp).filter(k=>k!=='_months').length > 0) trend3[dId] = recomp;
        }
        if (Object.keys(trend3).length > 0) setShiftTrend(trend3);
      }
      supabase.from('shift_data').select('data_key,data_value').eq('user_id',session.user.id).then(({data})=>{
        if (!data) return;
        const byKey = Object.fromEntries(data.map(r=>[r.data_key,r.data_value]));
        const learned = computeLearnedTrend(byKey, staffList, exceptionMonths);
        if (Object.keys(learned).length > 0) setLearnedTrend(learned);
      });
    }
  }, [exceptionMonths]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isInitializing.current) {
      supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'excelRawMonths', data_value:excelRawMonths, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' });
    }
  }, [excelRawMonths]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isInitializing.current || dbLoading) return;
    supabase.from('shift_data').upsert({ user_id:session.user.id, data_key:'portalSettings', data_value:portalSettings, updated_at:new Date().toISOString() },{ onConflict:'user_id,data_key' }).then(()=>{}).catch(()=>{});
  }, [portalSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ctxMenu, setCtxMenu] = useState(null);
  const [staffModal, setStaffModal] = useState(null);

  const DEFAULT_FLOOR_SETTINGS = {floors:[],duties:[{name:"入浴"},{name:"フリー"}]};
  const [allFloorSettings, setAllFloorSettings] = useState(() => { try{const s=localStorage.getItem("shiftNavi_allFloorSettings");if(s)return JSON.parse(s);}catch{} return {}; });
  const floorSettings = allFloorSettings[activeDeptId] || DEFAULT_FLOOR_SETTINGS;
  useEffect(() => {
    try{localStorage.setItem("shiftNavi_allFloorSettings",JSON.stringify(allFloorSettings));}catch{}
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
  const setDeptShifts = useCallback(updater => {
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

  const handleAiAdjust = useCallback(async () => {
    if (!aiInstruction.trim()) return;
    if (!dept) { alert("部署が選択されていません。"); return; }
    setAiLoading(true);
    try {
      const fnUrl = "/api/ai-shift-adjust";
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts: deptShifts, staffList, dept, instruction: aiInstruction, aiRules: aiRules.trim(), year, month: month + 1 }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      if (Array.isArray(data.changes) && data.changes.length > 0) {
        setDeptShifts(prev => {
          const next = { ...prev };
          for (const c of data.changes) {
            if (c?.staffId && c?.day) next[c.staffId] = { ...(next[c.staffId] || {}), [c.day]: c.shift };
          }
          return next;
        });
        alert(`✨ AI調整完了\n\n${data.explanation}\n\n変更: ${data.changes.length}件`);
      } else {
        alert(`✨ AIからの回答\n\n${data.explanation || "変更なし"}`);
      }
    } catch (e) {
      alert("AI調整エラー: " + e.message);
    } finally {
      setAiLoading(false);
    }
  }, [aiInstruction, aiRules, deptShifts, staffList, dept, year, month, setDeptShifts]);

  const handleGenerate = useCallback(() => {
    if (generateTimerRef.current) clearTimeout(generateTimerRef.current);
    setGenerating(true);
    isInitializing.current = false;
    const cs=staffList, cd=dept, ct=mergeShiftTrends(shiftTrend[activeDeptId]||{}, learnedTrend);
    generateTimerRef.current = setTimeout(() => {
      // 自動生成もユーザー操作: シーケンス番号を上げてRealtimeをキャンセル
      userEditSeq.current++;
      saveStatusRef.current = "unsaved"; // Realtime簡易ガードを即時有効化
      try {
        setAllShifts(prevAll=>{const cs2=prevAll[cd.id]||{};const{shifts:result,warnings,score}=bestOfN(cs,cd,year,month,cs2,ct,5);if(Object.keys(warnings).length>0)setTimeout(()=>setGenerateWarnings({warnings,deptLabel:cd.label,score}),0);return{...prevAll,[cd.id]:result};});
        setSaveStatus("unsaved");
      }
      catch(e){console.error(e);alert("自動生成エラー: "+e.message);}
      finally{setGenerating(false);}
    },700);
  }, [staffList,dept,year,month,shiftTrend,learnedTrend]);

  const handleLeftClick = useCallback((staffId, day) => {
    if (isLockedRef.current) return;
    setDeptShifts(prev=>{const cur=prev[staffId]?.[day]||"";const HALF=new Set(["日/休","休/日","早/休","休/遅"]);if(HALF.has(cur))return prev;const idx=SHIFT_KEYS.indexOf(cur);const next=SHIFT_KEYS[(idx+1)%SHIFT_KEYS.length];return{...prev,[staffId]:{...(prev[staffId]||{}),[day]:next}};});
  }, [setDeptShifts]);

  const handleRightClick = useCallback((staffId, day, e) => {
    if (isLockedRef.current) return;
    setCtxMenu({staffId,day,x:e.clientX+4,y:e.clientY+4});
  }, []);
  const handleMenuSelect = (shiftKey) => { if(!ctxMenu)return; const{staffId,day}=ctxMenu; setDeptShifts(prev=>({...prev,[staffId]:{...(prev[staffId]||{}),[day]:shiftKey}})); setCtxMenu(null); };

  const saveStaff = (form) => { setStaffList(prev=>{const idx=prev.findIndex(s=>s.id===form.id);if(idx>=0)return prev.map((s,i)=>i===idx?form:s);return[...prev,{...form,id:`${activeDeptId}_${Date.now()}`,dept:activeDeptId}];}); setStaffModal(null); };
  const deleteStaff = (id) => { const s=staffList.find(x=>x.id===id); setConfirmDialog({message:`「${s?.name||'このスタッフ'}」を削除します。\nよろしいですか？`,onOk:()=>setStaffList(prev=>prev.filter(x=>x.id!==id)),okLabel:"削除する"}); };
  const handleBulkKyuko = (days, mk) => { setStaffList(prev=>prev.map(s=>({...s,kyukoDaysByMonth:{...(s.kyukoDaysByMonth||{}),[mk]:days}}))); setBulkKyukoModal(false); };

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
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={prevMonth} style={MNAV}>◀</button>
          <div style={{fontSize:14,fontWeight:800,color:"#2BBFBA",minWidth:104,textAlign:"center",background:"#ffffff",border:"1px solid #90cbc8",borderRadius:8,padding:"5px 10px"}}>{year}年 {month+1}月</div>
          <button onClick={nextMonth} style={MNAV}>▶</button>
        </div>
        <div style={{display:"flex",gap:isMobile?4:7,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{fontSize:10,fontWeight:700,color:saveStatus==="saved"?"#5cb87a":"#6ab5b2",display:"flex",alignItems:"center",gap:3,minWidth:isMobile?0:60}}>
            {saveStatus==="saved"&&<><span>💾</span>{!isMobile&&<span>保存済</span>}</>}
            {saveStatus==="unsaved"&&<><span>⏳</span>{!isMobile&&<span>未保存</span>}</>}
          </div>
          {isLocked
            ? <button onClick={()=>setPinModal(true)} style={{background:"linear-gradient(135deg,#374151,#1f2937)",color:"#fff",border:"none",borderRadius:8,padding:isMobile?"6px 10px":"7px 14px",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>🔒{!isMobile&&" 解錠する"}</button>
            : <><button onClick={handleGenerate} disabled={generating} style={{background:generating?"#d5edeb":"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:generating?"#2a5a57":"#fff",border:"none",borderRadius:8,padding:isMobile?"6px 10px":"7px 14px",cursor:generating?"not-allowed":"pointer",fontSize:isMobile?11:12,fontWeight:800,display:"flex",alignItems:"center",gap:5}}>{generating?"⏳":"⚡"}{!isMobile&&(generating?" 最適化中…":" 自動生成")}</button></>
          }
          <button onClick={()=>setDownloadModal(true)} style={{background:"#ffffff",color:"#34d399",border:"1px solid #064e3b",borderRadius:8,padding:isMobile?"6px 8px":"7px 12px",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:700}}>{isMobile?"📤":"📤 書き出し"}</button>
          <button onClick={()=>setBulkKyukoModal(true)} style={{background:"#ffffff",color:"#2BBFBA",border:"1px solid #90cbc8",borderRadius:8,padding:isMobile?"6px 8px":"7px 12px",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:700}}>{isMobile?"📅":"📅 休み設定"}</button>
          {!isMobile&&(()=>{const deptTrend=shiftTrend[activeDeptId]||{};const excelCnt=Object.keys(deptTrend).filter(k=>k!=='_months').length;const learnedCnt=Object.keys(learnedTrend).filter(k=>k!=='_monthCounts').length;const hasAny=excelCnt>0||learnedCnt>0;const label=learnedCnt>0?`🧠 学習中(${learnedCnt}名)`:excelCnt>0?`📊 傾向ON`:`📊 傾向学習`;return(<button onClick={()=>setExcelImportModal(true)} style={{background:hasAny?"#e8f5ee":"#ffffff",color:hasAny?"#5cb87a":"#2a6a67",border:hasAny?"1px solid #16a34a":"1px solid #90cbc8",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>{label}</button>);})()}
          {!isMobile&&(profile?.plan==='full'
            ? <button onClick={()=>setAiMode(v=>!v)} disabled={isLocked} style={{background:isLocked?"#f3f4f6":aiMode?"#ede9fe":"#ffffff",color:isLocked?"#9ca3af":aiMode?"#7c3aed":"#2a6a67",border:aiMode?"1px solid #7c3aed":"1px solid #90cbc8",borderRadius:8,padding:"7px 12px",cursor:isLocked?"not-allowed":"pointer",fontSize:12,fontWeight:700}}>{aiMode?"🤖 AI ON":"🤖 AI"}</button>
            : <button onClick={()=>alert("🤖 AI機能はフルプランでご利用いただけます。\nプランのアップグレードはお問い合わせください。")} style={{background:"#f5f5f5",color:"#9ca3af",border:"1px solid #d1d5db",borderRadius:8,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>🔒 AI</button>
          )}
          {!isLocked && <button onClick={()=>setClearModal(true)} style={{background:"#ffffff",color:"#ef4444",border:"1px solid #450a0a",borderRadius:8,padding:isMobile?"6px 8px":"7px 10px",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:700}}>{isMobile?"🗑":"🗑 クリア"}</button>}
          <button onClick={()=>setShareModal(true)} style={{background:"#f0fff4",color:"#16a34a",border:"1px solid #86efac",borderRadius:8,padding:isMobile?"6px 8px":"7px 10px",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:700}}>{isMobile?"🔗":"🔗 共有"}</button>
          {profile?.is_admin&&<button onClick={()=>setAdminModal(true)} style={{background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa",borderRadius:8,padding:isMobile?"6px 8px":"7px 10px",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:700}}>{isMobile?"🏢":"🏢 管理"}</button>}
          <button onClick={()=>setHelpModal(true)} style={{background:"#f0f8ff",color:"#1E88E5",border:"1px solid #90caf9",borderRadius:8,padding:isMobile?"6px 8px":"7px 10px",cursor:"pointer",fontSize:isMobile?12:13,fontWeight:800}}>?</button>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer"}} onClick={onLogout}>
            <span style={{fontSize:10,fontWeight:800,color:PLAN_COLORS[profile?.plan||'free'],background:"#fff",border:`1px solid ${PLAN_COLORS[profile?.plan||'free']}`,borderRadius:8,padding:"1px 7px",marginBottom:2}}>{PLAN_LABELS[profile?.plan||'free']}</span>
            <span style={{fontSize:10,color:"#3a8a87",fontWeight:700}}>👤 ログアウト</span>
          </div>
        </div>
      </div>

      {/* Excelデータリセット促進バナー */}
      {(()=>{
        const mc=learnedTrend._monthCounts||{};
        const names=Object.keys(mc);
        const avgMonths=names.length>0?names.reduce((s,n)=>s+(mc[n]||0),0)/names.length:0;
        const deptRawMon=excelRawMonths[activeDeptId]||{};const hasExcel=Object.keys(deptRawMon).length>0||Object.keys(shiftTrend[activeDeptId]||{}).filter(k=>k!=='_months').length>0;
        if(!hasExcel||avgMonths<6||excelResetDismissed) return null;
        return(
          <div style={{background:"#fff7ed",borderBottom:"2px solid #f59e0b",padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:18}}>📊</span>
            <div style={{flex:1,minWidth:200}}>
              <span style={{fontSize:12,fontWeight:800,color:"#92400e"}}>しふぽんの学習データが{Math.round(avgMonths)}ヶ月分たまりました！</span>
              <span style={{fontSize:11,color:"#b45309",marginLeft:6}}>Excelインポートデータは役割を終えたかもしれません。リセットして学習精度を上げましょう。</span>
            </div>
            <button onClick={()=>{setExcelImportModal(true);}} style={{background:"#f59e0b",color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>📂 確認する</button>
            <button onClick={()=>{setExcelResetDismissed(true);try{localStorage.setItem('shiftNavi_excelResetDismissed','true');}catch{}}} style={{background:"none",border:"1px solid #f59e0b",color:"#92400e",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,whiteSpace:"nowrap"}}>今は不要</button>
          </div>
        );
      })()}

      {/* AI PANEL */}
      {aiMode&&(
        <div style={{background:"#f3f0ff",borderBottom:"1px solid #c4b5fd",padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:12,fontWeight:700,color:"#7c3aed",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span>🤖 AI調整モード</span>
            <span style={{fontSize:10,fontWeight:400,color:"#a78bfa"}}>自動生成後のシフトを指示で調整できます</span>
            <button onClick={()=>setShowAiRules(v=>!v)} style={{marginLeft:"auto",background:showAiRules?"#ede9fe":"#fff",border:"1px solid #c4b5fd",borderRadius:6,color:"#7c3aed",fontSize:10,padding:"2px 8px",cursor:"pointer",fontWeight:showAiRules?800:400}}>
              {aiRules.trim()?"⚙️ ルール設定 ✓":"⚙️ ルール設定"}
            </button>
          </div>

          {/* AIルール設定（折りたたみ） */}
          {showAiRules&&(
            <div style={{background:"#ede9fe",borderRadius:10,padding:"10px 12px",border:"1px solid #c4b5fd"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#5b21b6",marginBottom:6}}>施設固有のAIルール（毎回自動で適用されます）</div>
              <div style={{fontSize:10,color:"#7c3aed",marginBottom:6}}>役職・業務ごとのルールを書いておくと、AI がシフト調整時に自動で従います。</div>
              {/* プリセットボタン */}
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                {[
                  "介護補助は夜勤禁止",
                  "パート職員は日勤か早番のみ",
                  "主任は月に夜勤2回まで",
                  "新人（研修中）は日勤のみ",
                  "夜勤担当者は最低2名以上",
                  "同じ役職の職員を夜勤に偏らせない",
                  "連続夜勤は禁止",
                  "リーダーが夜勤の日は経験者を早番に"
                ].map(preset=>(
                  <button key={preset} onClick={()=>setAiRules(r=>r?r+"\n"+preset:preset)}
                    style={{background:"#fff",border:"1px solid #c4b5fd",borderRadius:12,padding:"2px 8px",fontSize:10,color:"#6d28d9",cursor:"pointer"}}>
                    ＋{preset}
                  </button>
                ))}
              </div>
              <textarea
                value={aiRules}
                onChange={e=>setAiRules(e.target.value)}
                placeholder={"例）介護補助は夜勤禁止\n例）パート職員は日勤か早番のみ\n例）○○さんは土日優先で休みにする\n例）新しく追加した役職名はここにルールを書いてください"}
                style={{width:"100%",minHeight:90,borderRadius:8,border:"1px solid #c4b5fd",padding:"8px 10px",fontSize:11,color:"#4c1d95",background:"#faf5ff",resize:"vertical",boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}
              />
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                <div style={{fontSize:10,color:"#a78bfa"}}>{aiRules.trim()?`${aiRules.trim().split("\n").filter(Boolean).length}件のルール設定中`:"ルール未設定（任意）"}</div>
                {aiRules.trim()&&<button onClick={()=>{if(confirm("ルールをクリアしますか？"))setAiRules("");}} style={{background:"none",border:"none",color:"#ef4444",fontSize:10,cursor:"pointer"}}>🗑 クリア</button>}
              </div>
            </div>
          )}

          {/* 今回の指示 */}
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
      <div style={{background:"#eaf8f6",borderBottom:isMobile&&innerTab==="shift"?"none":"2px solid #2BBFBA",display:"flex",padding:"0 6px",gap:2,alignItems:"center",overflowX:"auto"}}>
        {[["shift",isMobile?"📅 シフト":"📅 シフト表"],["summary",isMobile?"📊 集計":"📊 集計"],["staff",isMobile?"👥 スタッフ":"👥 スタッフ"]].map(([k,l])=><button key={k} onClick={()=>setInnerTab(k)} style={{padding:isMobile?"6px 8px":"7px 13px",background:"transparent",border:"none",color:innerTab===k?"#1a9e9a":"#2a6a67",borderBottom:innerTab===k?"2px solid #2BBFBA":"2px solid transparent",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:innerTab===k?800:600,whiteSpace:"nowrap",flexShrink:0}}>{l}</button>)}
        {profile?.plan==='free'
          ? <button onClick={()=>alert("📋 予定表機能はスタンダード・フルプランでご利用いただけます。\nプランのアップグレードはお問い合わせください。")} style={{padding:isMobile?"6px 8px":"7px 13px",background:"transparent",border:"none",color:"#9ca3af",borderBottom:"2px solid transparent",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>🔒 予定表</button>
          : <button onClick={()=>setInnerTab("yotei")} style={{padding:isMobile?"6px 8px":"7px 13px",background:"transparent",border:"none",color:innerTab==="yotei"?"#1a9e9a":"#2a6a67",borderBottom:innerTab==="yotei"?"2px solid #2BBFBA":"2px solid transparent",cursor:"pointer",fontSize:isMobile?11:12,fontWeight:innerTab==="yotei"?800:600,whiteSpace:"nowrap",flexShrink:0}}>📋 予定表</button>
        }
        {!isMobile&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
          {innerTab==="shift"&&(
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <button onClick={()=>handleZoomChange(tableZoom-5)} disabled={tableZoom<=30} style={{width:22,height:22,borderRadius:4,border:"1px solid #90cbc8",background:"#ffffff",color:tableZoom<=30?"#8ecece":"#2BBFBA",cursor:tableZoom<=30?"not-allowed":"pointer",fontSize:14,fontWeight:900,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <input type="range" min={30} max={100} step={5} value={tableZoom} onChange={e=>handleZoomChange(Number(e.target.value))} style={{width:72,accentColor:"#2BBFBA",cursor:"pointer"}}/>
              <button onClick={()=>handleZoomChange(tableZoom+5)} disabled={tableZoom>=100} style={{width:22,height:22,borderRadius:4,border:"1px solid #90cbc8",background:"#ffffff",color:tableZoom>=100?"#8ecece":"#2BBFBA",cursor:tableZoom>=100?"not-allowed":"pointer",fontSize:14,fontWeight:900,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
              <span style={{fontSize:11,fontWeight:700,color:"#2BBFBA",minWidth:34,textAlign:"right"}}>{tableZoom}%</span>
              <button onClick={()=>{const days=getDays(year,month);const ds=staffList.filter(s=>s.dept===activeDeptId).length;handleZoomChange(autoFitZoom(ds,days));}} style={{background:"#ffffff",border:"1px solid #90cbc8",borderRadius:4,color:"#2BBFBA",fontSize:10,padding:"2px 6px",cursor:"pointer",whiteSpace:"nowrap"}}>⊞ フィット</button>
              <button onClick={()=>setShowSuggestion(v=>!v)} style={{background:showSuggestion?"#f0fdf4":"#ffffff",border:showSuggestion?"1px solid #16a34a":"1px solid #90cbc8",borderRadius:4,color:showSuggestion?"#16a34a":"#2a5a57",fontSize:10,padding:"2px 6px",cursor:"pointer",whiteSpace:"nowrap",fontWeight:showSuggestion?800:400}}>🔍 改善提案</button>
            </div>
          )}
          <div style={{fontSize:10,color:"#8ecece",padding:"0 4px",whiteSpace:"nowrap"}}>最低配置：{Object.entries(dept.minStaff||{}).map(([k,v])=>`${k}×${v}`).join(" / ")}</div>
        </div>}
      </div>
      {/* スマホ用ズームコントロール行 */}
      {isMobile&&innerTab==="shift"&&(
        <div style={{background:"#eaf8f6",borderBottom:"2px solid #2BBFBA",display:"flex",alignItems:"center",gap:4,padding:"4px 8px"}}>
          <button onClick={()=>handleZoomChange(tableZoom-5)} disabled={tableZoom<=30} style={{width:24,height:24,borderRadius:4,border:"1px solid #90cbc8",background:"#fff",color:tableZoom<=30?"#8ecece":"#2BBFBA",cursor:tableZoom<=30?"not-allowed":"pointer",fontSize:14,fontWeight:900,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
          <input type="range" min={30} max={100} step={5} value={tableZoom} onChange={e=>handleZoomChange(Number(e.target.value))} style={{flex:1,accentColor:"#2BBFBA",cursor:"pointer"}}/>
          <button onClick={()=>handleZoomChange(tableZoom+5)} disabled={tableZoom>=100} style={{width:24,height:24,borderRadius:4,border:"1px solid #90cbc8",background:"#fff",color:tableZoom>=100?"#8ecece":"#2BBFBA",cursor:tableZoom>=100?"not-allowed":"pointer",fontSize:14,fontWeight:900,padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
          <span style={{fontSize:11,fontWeight:700,color:"#2BBFBA",minWidth:34,textAlign:"right"}}>{tableZoom}%</span>
          <button onClick={()=>{const days=getDays(year,month);const ds=staffList.filter(s=>s.dept===activeDeptId).length;handleZoomChange(autoFitZoom(ds,days));}} style={{background:"#fff",border:"1px solid #90cbc8",borderRadius:4,color:"#2BBFBA",fontSize:10,padding:"3px 8px",cursor:"pointer",whiteSpace:"nowrap"}}>⊞ フィット</button>
          <button onClick={()=>setShowSuggestion(v=>!v)} style={{background:showSuggestion?"#f0fdf4":"#fff",border:showSuggestion?"1px solid #16a34a":"1px solid #90cbc8",borderRadius:4,color:showSuggestion?"#16a34a":"#2a5a57",fontSize:10,padding:"3px 8px",cursor:"pointer",whiteSpace:"nowrap",fontWeight:showSuggestion?800:400}}>🔍 改善提案</button>
          {profile?.plan==='full'
            ? <button onClick={()=>setAiMode(v=>!v)} style={{background:aiMode?"#ede9fe":"#fff",color:aiMode?"#7c3aed":"#2a6a67",border:aiMode?"1px solid #7c3aed":"1px solid #90cbc8",borderRadius:4,fontSize:10,padding:"3px 8px",cursor:"pointer",whiteSpace:"nowrap",fontWeight:aiMode?800:400}}>{aiMode?"🤖 AI ON":"🤖 AI"}</button>
            : <button onClick={()=>alert("🤖 AI機能はフルプランでご利用いただけます。")} style={{background:"#f5f5f5",color:"#9ca3af",border:"1px solid #d1d5db",borderRadius:4,fontSize:10,padding:"3px 8px",cursor:"pointer",whiteSpace:"nowrap"}}>🔒 AI</button>
          }
        </div>
      )}

      {/* CONTENT */}
      <div style={{padding:"10px 8px",minHeight:"calc(100vh - 180px)"}}>
        {innerTab==="shift"&&(<><Legend/>{showSuggestion&&<SuggestionPanel staffList={staffList} shifts={deptShifts} year={year} month={month} dept={dept} onApply={newShifts=>{setDeptShifts(newShifts);setShowSuggestion(false);}}/>}<ZoomWrapper zoom={tableZoom} onZoomChange={handleZoomChange}><ShiftTable staffList={staffList} shifts={deptShifts} dept={dept} year={year} month={month} onLeftClick={handleLeftClick} onRightClick={handleRightClick} events={allEvents[activeDeptId]?.[monthKey(year,month)]||{}} onEventEdit={(d)=>setEventEditDay(d)}/></ZoomWrapper></>)}
        {innerTab==="summary"&&<SummaryView staffList={staffList} shifts={deptShifts} dept={dept} year={year} month={month}/>}
        {innerTab==="staff"&&<StaffList staffList={staffList} dept={dept} year={year} month={month} onEdit={s=>setStaffModal({data:s})} onDelete={deleteStaff} onAdd={()=>setStaffModal({data:null})}/>}
        {innerTab==="yotei"&&<YoteiView dept={dept} staffList={staffList} shifts={deptShifts} year={year} month={month} yoteiDeptData={deptYotei} onUpdateYotei={handleUpdateYotei} onBatchUpdateYotei={handleBatchUpdateYotei} floorSettings={floorSettings} onUpdateFloorSettings={handleUpdateFloorSettings}/>}
      </div>

      {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} onSelect={handleMenuSelect} onClose={()=>setCtxMenu(null)}/>}
      {staffModal!==null&&(()=>{const mk=monthKey(year,month);const editingId=staffModal.data?.id;const kiboCountByDay={};staffList.filter(s=>s.dept===activeDeptId&&s.id!==editingId).forEach(s=>{(s.kiboByMonth?.[mk]||[]).forEach(d=>{kiboCountByDay[d]=(kiboCountByDay[d]||0)+1;});});return<StaffModal data={staffModal.data} deptId={activeDeptId} depts={depts} year={year} month={month} onSave={saveStaff} onClose={()=>setStaffModal(null)} kiboCountByDay={kiboCountByDay} kiboLimit={dept?.kiboLimit||3}/>;})()}
      {deptSettingModal&&<DeptSettingModal dept={deptSettingModal.dept} isNew={deptSettingModal.isNew} onSave={handleSaveDept} onDelete={handleDeleteDept} onConfirm={(message,onOk,okLabel)=>setConfirmDialog({message,onOk,okLabel})} onClose={()=>setDeptSettingModal(null)}/>}
      {clearModal&&<ClearModal deptLabel={dept.label} onClearDept={()=>{setDeptShifts({});setClearModal(false);}} onClose={()=>setClearModal(false)}/>}
      {pinModal&&dept?.pin&&<PinModal deptLabel={dept.label} onVerify={(pin)=>{if(pin===dept.pin){setUnlockedDeptId(activeDeptId);setPinModal(false);return true;}return false;}} onClose={()=>setPinModal(false)}/>}
      {excelImportModal&&<ExcelImportModal currentTrend={shiftTrend[activeDeptId]||{}} exceptionMonths={exceptionMonths} onExceptionMonthsChange={setExceptionMonths} excelRawMonths={excelRawMonths[activeDeptId]||{}} onExcelRawMonthsChange={(newDeptRaw)=>{setExcelRawMonths(prev=>{const next={...prev};if(!newDeptRaw||Object.keys(newDeptRaw).length===0)delete next[activeDeptId];else next[activeDeptId]=newDeptRaw;return next;});const recomp=computeShiftTrendFromRaw(newDeptRaw||{},exceptionMonths);setShiftTrend(prev=>{const n={...prev};if(Object.keys(recomp).filter(k=>k!=='_months').length>0)n[activeDeptId]=recomp;else delete n[activeDeptId];return n;});}} onImport={(newTrend)=>{const newRaw=newTrend._rawByMonth||{};setExcelRawMonths(prev=>{const deptRaw={...(prev[activeDeptId]||{}),...newRaw};const next={...prev,[activeDeptId]:deptRaw};const recomp=computeShiftTrendFromRaw(deptRaw,exceptionMonths);setShiftTrend(p=>({...p,[activeDeptId]:recomp}));return next;});setExcelImportModal(false);}} onReset={()=>{setShiftTrend(prev=>{const n={...prev};delete n[activeDeptId];return n;});setExcelRawMonths(prev=>{const n={...prev};delete n[activeDeptId];return n;});setExcelResetDismissed(false);try{localStorage.removeItem('shiftNavi_excelResetDismissed');}catch{}setExcelImportModal(false);}} onConfirm={(message,onOk,okLabel)=>setConfirmDialog({message,onOk,okLabel})} onClose={()=>setExcelImportModal(false)}/>}
      {bulkKyukoModal&&<BulkKyukoModal staffList={staffList} year={year} month={month} onApply={handleBulkKyuko} onClose={()=>setBulkKyukoModal(false)}/>}
      {downloadModal&&<DownloadModal depts={depts} staffList={staffList} allShifts={allShifts} year={year} month={month} activeDeptId={activeDeptId} allEvents={allEvents} onClose={()=>setDownloadModal(false)}/>}
      {generateWarnings&&<GenerateWarningModal warnings={generateWarnings.warnings} deptLabel={generateWarnings.deptLabel} year={year} month={month} score={generateWarnings.score} onClose={()=>setGenerateWarnings(null)}/>}
      <div style={{position:"fixed",bottom:12,right:12,background:"#d5edeb",border:"1px solid #90cbc8",borderRadius:16,padding:"5px 12px",fontSize:10,color:"#8ecece",display:"flex",gap:6,alignItems:"center"}}><span style={{color:"#2BBFBA",fontWeight:700}}>Phase 2</span><span>クラウド同期 ＋ リアルタイム連携</span></div>
      {confirmDialog&&<ConfirmDialog message={confirmDialog.message} okLabel={confirmDialog.okLabel||"削除する"} onOk={()=>{confirmDialog.onOk();setConfirmDialog(null);}} onCancel={()=>setConfirmDialog(null)}/>}
      {adminModal&&<AdminPanel onClose={()=>setAdminModal(false)}/>}
      {helpModal&&<HelpModal onClose={()=>setHelpModal(false)}/>}
      {eventEditDay!==null&&<EventEditModal day={eventEditDay} month={month} year={year} currentText={(allEvents[activeDeptId]?.[monthKey(year,month)]||{})[eventEditDay]||""} onSave={(text)=>{const mk2=monthKey(year,month);setAllEvents(prev=>{const prev2={...(prev[activeDeptId]||{})};const prev3={...(prev2[mk2]||{})};if(text)prev3[eventEditDay]=text;else delete prev3[eventEditDay];prev2[mk2]=prev3;return{...prev,[activeDeptId]:prev2};});setEventEditDay(null);}} onClose={()=>setEventEditDay(null)}/>}
      {shareModal&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&setShareModal(false)}>
          <div style={{background:"#f3fffe",border:"1px solid #90cbc8",borderRadius:14,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:900,color:"#1a3635"}}>🔗 スタッフ共有URL</div>
              <button onClick={()=>setShareModal(false)} style={{background:"none",border:"none",color:"#3a8a87",cursor:"pointer",fontSize:20}}>✕</button>
            </div>
            <div style={{fontSize:11,color:"#3a8a87",marginBottom:16,background:"#d5edeb",borderRadius:8,padding:"8px 12px"}}>部署ごとのURLをスタッフに送ってください。各部署のスタッフは自分の部署だけ表示されます。</div>

            {/* ── サイト全体QR（新規登録・ログイン用） ── */}
            <div style={{background:"#fff",border:"2px solid #2BBFBA",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:13,color:"#1a3635",marginBottom:4}}>🏠 しふぽん サイトQRコード</div>
              <div style={{fontSize:10,color:"#3a8a87",marginBottom:10}}>自分のサイトに貼り付けると、スキャンしたらしふぽんのログイン・新規登録画面へ移動します。</div>
              <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                  <div style={{padding:8,background:"#fff",border:"2px solid #90cbc8",borderRadius:8,display:"inline-block"}}>
                    <QRCodeSVG value={window.location.origin} size={160} bgColor="#ffffff" fgColor="#1a3635" level="L" includeMargin={false}/>
                  </div>
                  <div style={{fontSize:9,color:"#6ab5b2",wordBreak:"break-all",textAlign:"center",maxWidth:176}}>{window.location.origin}</div>
                </div>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#2a5a57",marginBottom:8}}>使い方</div>
                  <div style={{fontSize:11,color:"#3a8a87",lineHeight:1.8}}>
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

            <div style={{fontSize:11,color:"#3a8a87",marginBottom:10,fontWeight:700}}>▍ 部署別 スタッフ希望休ポータル</div>
            {depts.map(d=>{
              const ps=portalSettings[d.id]||{};
              const setPsDept=(key,val)=>setPortalSettings(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),[key]:val}}));
              const deptSl=staffList.filter(s=>s.dept===d.id).map(s=>({i:uuidToShort(s.id),n:s.name}));
              const cfgObj={fn:profile?.facility_name||'',d:{id:d.id,label:d.label,icon:d.icon,kb:d.kiboLimit||3,dl:ps.deadline||null},sl:deptSl};
              const cfgB64=btoa(unescape(encodeURIComponent(JSON.stringify(cfgObj))));
              const urlShort=`${window.location.origin}?staff=${session.user.id}&dept=${d.id}`;
              const urlFull=`${urlShort}&cfg=${cfgB64}`;
              const doCopy=()=>{if(navigator.clipboard?.writeText){navigator.clipboard.writeText(urlShort).then(()=>alert('URLをコピーしました！')).catch(()=>alert(`URLをコピーしてください:\n${urlShort}`));}else{alert(`URLをコピーしてください:\n${urlShort}`);}};
              const doLine=()=>{const lineUrl=`https://line.me/R/msg/text/?${encodeURIComponent(`${d.label}の希望休入力はこちら\n${urlShort}`)}`;window.open(lineUrl,'_blank');};              const doSaveSettings=async()=>{
                const newPs={...portalSettings,[d.id]:{deadline:ps.deadline||null}};
                const deptsCfg=depts.map(dep=>{const p=newPs[dep.id]||{};return{id:dep.id,label:dep.label,icon:dep.icon,kiboLimit:dep.kiboLimit||3,deadline:p.deadline||null};});
                const facilityVal={facility_name:profile?.facility_name||'',depts:deptsCfg,staffList:staffList.map(s=>({id:s.id,dept:s.dept,name:s.name,role:s.role}))};
                const [r1,r2]=await Promise.all([
                  supabase.from('shift_data').upsert({user_id:session.user.id,data_key:'portalSettings',data_value:newPs,updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'}),
                  supabase.from('shift_data').upsert({user_id:session.user.id,data_key:'facilityConfig',data_value:facilityVal,updated_at:new Date().toISOString()},{onConflict:'user_id,data_key'}),
                ]);
                if(r1.error||r2.error){alert('保存に失敗しました。もう一度お試しください。');return;}
                alert(`✅ ${d.label} の設定を保存しました\n締め切り: ${ps.deadline||'なし'}`);
              };
              return(
                <div key={d.id} style={{background:"#fff",border:"1px solid #90cbc8",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                  <div style={{fontWeight:800,fontSize:13,color:"#1a3635",marginBottom:10}}>{d.icon} {d.label}</div>
                  {/* 締め切り */}
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#2a5a57",marginBottom:4}}>⏰ 締め切り日</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="date" value={ps.deadline||""} onChange={e=>setPsDept('deadline',e.target.value||null)} style={{border:"1px solid #90cbc8",borderRadius:6,padding:"5px 8px",fontSize:12,color:"#1a3635",outline:"none",background:"#f3fffe"}}/>
                      {ps.deadline&&<button onClick={()=>setPsDept('deadline',null)} style={{background:"none",border:"none",color:"#c44b4b",cursor:"pointer",fontSize:12}}>✕ クリア</button>}
                    </div>
                    {ps.deadline&&<div style={{fontSize:10,color:"#c44b4b",marginTop:3}}>⚠ {ps.deadline} 以降は送信不可になります</div>}
                  </div>
                  {/* 保存ボタン */}
                  <button onClick={doSaveSettings} style={{width:"100%",background:"linear-gradient(135deg,#2BBFBA,#45B7D1)",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",cursor:"pointer",fontSize:13,fontWeight:800,marginBottom:12}}>💾 この設定を保存する</button>
                  <div style={{textAlign:"center",marginBottom:6}}>
                    <div style={{fontSize:10,color:"#3a8a87",marginBottom:6,fontWeight:700}}>📷 カメラで読み取り</div>
                    <div style={{display:"inline-block",padding:8,background:"#fff",border:"2px solid #90cbc8",borderRadius:8}}>
                      <QRCodeSVG value={urlShort} size={140} bgColor="#ffffff" fgColor="#1a3635" level="L" includeMargin={false}/>
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