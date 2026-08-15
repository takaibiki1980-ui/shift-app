import { useState, useCallback, useRef, useEffect, useMemo, Component } from "react";
import { computeBacktestMetrics, computeDriftMetric, formatPct } from './research/backtest.js';
import { computeWarnings } from './warnings.js';
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import HolidayJP from "@holiday-jp/holiday_jp";
import { Settings, Calendar, Users, Trash2, Zap, ClipboardList, Download, Lock, Unlock, History, Share2, Building2, HelpCircle, ChevronLeft, ChevronRight, LogOut, RefreshCw, Loader, MoreHorizontal, Undo2, Redo2, Upload, Printer, FileSpreadsheet, FileCode, MessageCircle, Copy, Link2, Home, Clock, Camera, Lightbulb, AlertTriangle, Save, Pencil, Check, Wifi, X, CheckCircle2 } from 'lucide-react';
import { REST_TYPES, WORK_TYPES, buildDeptWorkTypes, buildDeptRestTypes, isCustomTimeDept, timeToMins, buildDayIntervals, coverageGaps, DEFAULT_SHIFT_TIMES, getShiftEndTime, getShiftStartTime, shiftIntervalHours, getDays, monthKey, normName, nameMatch, buildNightSet, buildSlotManagedTypes, isNikkinBase, isBadTransition, isSlotManaged, shouldProtectSlot, consecWork, consecRest, consecRestFwd, canRest, NSO_canAssignInitial, NSO_checkC3, NSO_propagateConstraints, NSO_computeCost, NSO_canSwap, autoGenerate, scoreShifts, localSearchImprove, bestOfN, detectManualEditCells, computeLearnedTrend, repairHardConstraints } from './engine/core.js';
import { computeEditRate } from './lib/editRate.js';
import { computeLearnedMatch } from './lib/learnedMatch.js';
import { computePaidLeaveConsumed, applyConsumption } from './lib/paidLeave.js';
import { applyCellFix } from './lib/cellFix.js';
import { pushHistory, undoStep, redoStep } from './lib/undoRedo.js';
import { effectiveCellShift } from './lib/exportCell.js';

// 時間帯系機能（インターバル制限・勤務時間設定・必須運営時間＝未カバー警告）を凍結するフラグ。
// false で該当UIと未カバー/不足警告の表示を隠す（コードは残す＝将来 true で復活可能）。
// ※生成ロジック・遅番→早番許可(allowLateToEarly)には非接触。
const TIME_FEATURES_ENABLED = false;

// YEIX ワードマーク（画像版）。ログイン画面・上部ヘッダーとも画像版で統一表示。
// height でサイズ調整（ヘッダー=22px / ログイン=40px）。
function YeixTextLogo({ height = 36 }) {
  return (
    <img src="/yeix-text.png" alt="YEIX" style={{ height, width: "auto", display: "inline-block", verticalAlign: "middle" }} />
  );
}

// YEIX ロゴ（XマークのPNG・背景透過）。radius は互換のため受け取るが未使用。
function ShifuponIcon({ size = 48, radius = 12 }) { // eslint-disable-line no-unused-vars
  return (
    <img src="/yeix-logo.png" alt="YEIX" width={size} height={size} style={{ objectFit: "contain", display: "block" }} />
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
          <div style={{margin:"0 auto"}}><YeixTextLogo height={40} /></div>
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
          }}><AlertTriangle size={14} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5}}/>{error}</div>
        )}
        {msg && (
          <div style={{
            background:"#e8f5ee", border:"1px solid #5cb87a", borderRadius:8,
            padding:"9px 12px", fontSize:12, color:"#166534", marginBottom:14,
          }}><CheckCircle2 size={14} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5}}/>{msg}</div>
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
      <p>YEIX（以下「本サービス」）は、介護施設向けのシフト管理を支援するWebアプリケーションです。</p>
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
  研修:  { short:"研", color:"#166534", bg:"#DCFCE7", border:"#86EFAC", time:"研修（日勤扱い）" },
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
  "早/有": { short:"早有", color:"#9b4db5", bg:"#faf0ff", border:"#c07ad5", time:"早番半日／午後有給" },
  "日/有": { short:"日有", color:"#9b4db5", bg:"#faf0ff", border:"#c07ad5", time:"午前日勤／午後有給" },
  "有/日": { short:"有日", color:"#9b4db5", bg:"#faf0ff", border:"#c07ad5", time:"午前有給／午後日勤" },
  "有/遅": { short:"有遅", color:"#9b4db5", bg:"#faf0ff", border:"#c07ad5", time:"午前有給／遅番半日" },
  "有/休": { short:"有休", color:"#9b4db5", bg:"#faf0ff", border:"#c07ad5", time:"午前有給／午後公休" },
  "": { short:"－", color:"#9CA3AF", bg:"transparent", border:"transparent", time:"" },
};
const SHIFT_KEYS = ["早番","日勤","遅番","夜勤","明け","休み","希望休","有休",""];
const SHIFT_KEYS_MANUAL = ["早番","日勤","研修","遅番","夜勤","明け","休み","希望休","有休","日/休","休/日","早/休","休/遅","早/有","日/有","有/日","有/遅","有/休",""];
const HALF_REST_TYPES = new Set(["日/休","休/日","早/休","休/遅"]); // 公休0.5としてカウントする半日休
// 半日有給（勤務半分＋有給半分）。有給は公休に含めない設計のため公休カウント対象外（HALF_REST_TYPESには入れない）
const HALF_PAID_TYPES = new Set(["早/有","日/有","有/日","有/遅"]);
// 有/休 = 午前有給(4h)＋午後公休(4h)。勤務0・公休0.5・有給消費0.5。
// ※早有(早/有=勤務1・公休0・有給0.5)とは集計が異なる（早有は出勤扱い、有/休は勤務なし）。
const HALF_PAIDREST_TYPES = new Set(["有/休"]);
const HALF_ALL_TYPES = new Set([...HALF_REST_TYPES, ...HALF_PAID_TYPES, ...HALF_PAIDREST_TYPES]); // 手動選択で常時許可する半日シフト
// 集計専用: 半日シフトを考慮した1日の勤務貢献度を返す（生成ロジックのWORK_TYPESは変更しない）
//   通常勤務=1 / 半日休=0.5 / 半日有給=1（有給は出勤同等）/ カスタム勤務(deptWork指定時)=1 / その他=0
function workDayValue(v, deptWork) {
  if (!v) return 0;
  if (HALF_PAIDREST_TYPES.has(v)) return 0; // 有/休 = 勤務0（有給4h＋公休4h・出勤なし）
  if (HALF_REST_TYPES.has(v)) return 0.5; // 半日休 = 勤務0.5（＋公休0.5は別途）
  if (HALF_PAID_TYPES.has(v)) return 1;   // 半日有給 = 勤務1（実勤務4h＋有給4h＝出勤扱い）
  if (WORK_TYPES.has(v)) return 1;         // 通常勤務
  if (deptWork && deptWork.has(v)) return 1; // カスタム勤務（呼び出し側がdeptWorkを渡した場合）
  return 0;
}
function getShiftDef(key, customDefs, dept) {
  if (SHIFTS[key]) return SHIFTS[key];
  const cd = (customDefs || []).find(d => d.key === key);
  if (!cd) return SHIFTS[""];
  const base = SHIFTS[cd.baseType] || SHIFTS["日勤"];
  const short = key.length <= 2 ? key : key.slice(0, 2);
  const st = dept?.shiftTimes?.[key];
  const time = st?.start && st?.end ? `${st.start}〜${st.end}` : base.time;
  return { short, color: base.color, bg: base.bg, border: base.border, time };
}
function minsToTimeStr(m) { const h=Math.floor(m/60)%24,mn=m%60; return `${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}`; }
const DEFAULT_DEPTS = [
  { id:"kaigo1", label:"介護部 1階", shiftTypes:["早番","日勤","遅番","夜勤"], minStaff:{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 }, maxStaff:{ 早番:1, 日勤:99, 遅番:1, 夜勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["介護福祉士","介護職員","介護補助","介護助手","特定技能"], roleShiftTypes:{ "介護補助":["日勤"], "介護助手":["日勤"] } },
  { id:"kaigo2", label:"介護部 2階", shiftTypes:["早番","日勤","遅番","夜勤"], minStaff:{ 早番:1, 日勤:1, 遅番:1, 夜勤:1 }, maxStaff:{ 早番:1, 日勤:99, 遅番:1, 夜勤:1 }, defaultKyukoDays:8, maxConsecutive:5, roles:["介護福祉士","介護職員","介護補助","介護助手","特定技能"], roleShiftTypes:{ "介護補助":["日勤"], "介護助手":["日勤"] } },
  { id:"jimu",   label:"事務所",     shiftTypes:["日勤"], minStaff:{ 日勤:1 }, maxStaff:{ 日勤:99 }, defaultKyukoDays:8, maxConsecutive:5, roles:["事務員","主任"] },
  { id:"kango",  label:"看護部",     shiftTypes:["日勤"], minStaff:{ 日勤:1 }, maxStaff:{ 日勤:99 }, defaultKyukoDays:8, maxConsecutive:5, roles:["看護師","准看護師"] },
  { id:"eiyo",   label:"栄養科",     shiftTypes:["早番","日勤"], minStaff:{ 早番:1, 日勤:1 }, maxStaff:{ 早番:1, 日勤:99 }, defaultKyukoDays:9, maxConsecutive:5, roles:["管理栄養士","栄養士","調理師"] },
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
    {id:"eiyo_0",dept:"eiyo",name:"清水 優子",role:"管理栄養士",kyukoDays:9},
    {id:"eiyo_1",dept:"eiyo",name:"池田 恵",  role:"調理師",  kyukoDays:9},
  ].forEach(s => out.push({ nightOk:false, nightMax:0, targetWork:20, kyukoDays:8, kiboByMonth:{}, shiftRequestsByMonth:{}, kyukoDaysByMonth:{}, ...s }));
  return out;
};

const getWD    = (y,m,d) => ["日","月","火","水","木","金","土"][new Date(y,m,d).getDay()];
const isWE     = (y,m,d) => { const w=new Date(y,m,d).getDay(); return w===0||w===6; };
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
// 紛らわしい文字（0/O, 1/I/l）を除いた8文字トークン生成
// 日本の祝日判定（振替休日・国民の休日を含む）
// year: 年, month: 0-indexed月, day: 日
const isJpHoliday = (year, month, day) => HolidayJP.isHoliday(new Date(year, month, day));

const SHARE_TOKEN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const genToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => SHARE_TOKEN_CHARS[b % SHARE_TOKEN_CHARS.length])
    .join('');

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

// YEIX蓄積データからスタッフごとのシフト傾向を学習する
// computeLearnedTrend は src/engine/core.js に移動・export済み（import行参照）


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
      for(let d=1;d<=days;d++){ const v=shifts[s.id]?.[d]||""; const dispV=effectiveCellShift(v, s.shiftRequestsByMonth?.[mk]?.[d]); const out=dispV||(yukyudays.includes(d)?"有休":kibodays.includes(d)?"希望休":""); cells.push(out); workCnt+=workDayValue(v); if(v==="夜勤") nightCnt++; if((REST_TYPES.has(v)||HALF_PAIDREST_TYPES.has(v))&&v!=="明け"&&v!=="有休") restCnt+=(HALF_REST_TYPES.has(v)||HALF_PAIDREST_TYPES.has(v))?0.5:1; }
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
  let html = TAG('!DOCTYPE html')+TAG('html lang="ja"')+TAG('head')+TAG('meta charset="UTF-8"')+TAG('meta name="viewport" content="width=device-width,initial-scale=1"')+TAG('title')+`シフト表 ${year}年${month+1}月`+CTAG('title')+TAG('style')+`body{font-family:'Noto Sans JP',sans-serif;font-size:11px;margin:12px 8px;color:#111;}.dept-header{margin:16px 0 8px;border-bottom:2px solid #6366F1;padding-bottom:8px;}.dept-name{font-size:16px;font-weight:900;color:#18181B;line-height:1.2;}.dept-month{font-size:11px;color:#52525B;margin-top:3px;font-weight:500;}table{border-collapse:collapse;table-layout:fixed;margin-bottom:24px;}th,td{border:1px solid #ccc;padding:3px 1px;text-align:center;font-size:11px;width:34px;max-width:34px;overflow:hidden;box-sizing:border-box;height:32px;}th{background:#e8f0fe;font-weight:bold;line-height:1.2;}td{line-height:1.3;}.name{text-align:left;width:92px;max-width:92px;padding:3px 4px;vertical-align:middle;}.name-inner{font-weight:bold;font-size:10px;line-height:1.3;white-space:nowrap;overflow:hidden;letter-spacing:-0.2px;}.sum{width:32px;max-width:32px;font-size:10px;}.we{background:#fff0f6;}thead{display:table-header-group;}tr{page-break-inside:avoid;break-inside:avoid;}.dept-section{page-break-inside:avoid;break-inside:avoid;}.ev-row th{background:#fffbea!important;border-bottom:2px solid #fde68a;color:#92400e;font-weight:bold;}@media print{body{margin:4px;}.dept-name{font-size:11px;}.dept-month{font-size:9px;}th,td{font-size:8px;padding:1px 2px;}.name{width:84px;max-width:84px;}.name-inner{font-size:9px;letter-spacing:-0.3px;}}`+CTAG('style')+CTAG('head')+TAG('body');
  depts.filter(d=>selectedDepts.includes(d.id)).forEach(dept => {
    const shifts = allShifts[dept.id] || {};
    const deptEvents = (allEvents && allEvents[dept.id] && allEvents[dept.id][mk]) || {};
    html += `<div class="dept-header"><div class="dept-name">${dept.label}</div><div class="dept-month">${year}年${month+1}月 シフト表</div></div>`;
    html += TAG('table')+TAG('thead')+TAG('tr')+TAG('th class="name"')+'氏名'+CTAG('th');
    for(let d=1;d<=days;d++){ const wd=WD[new Date(year,month,d).getDay()]; const isWe=wd==="日"||wd==="土"||isJpHoliday(year,month,d); html += TAG(`th class="${isWe?"we":""}"`)+''+d+'<br>'+wd+CTAG('th'); }
    html += TAG('th class="sum"')+'勤務'+CTAG('th')+TAG('th class="sum"')+'夜勤'+CTAG('th')+TAG('th class="sum"')+'休'+CTAG('th')+CTAG('tr');
    if(Object.keys(deptEvents).length>0){ html += '<tr class="ev-row"><th class="name">行事</th>'; for(let d=1;d<=days;d++){ const ev=deptEvents[d]||''; html += '<th style="text-align:center;vertical-align:top;padding:2px 1px;background:'+(ev?'#fef3c7':'#fffdf0')+';">'+(ev?'<span style="writing-mode:vertical-rl;text-orientation:mixed;font-size:8px;color:#92400e;font-weight:bold;">'+ev+'</span>':'')+'</th>'; } html += '<th></th><th></th><th></th></tr>'; }
    html += CTAG('thead')+TAG('tbody');
    staffList.filter(s=>s.dept===dept.id).forEach(s => {
      let w=0,n=0,r=0;
      const kibodays = s.kiboByMonth?.[mk] || [];
      const yukyudays2 = s.yukyuByMonth?.[mk] || [];
      html += TAG('tr')+'<td class="name"><div class="name-inner">'+s.name+'</div></td>';
      for(let d=1;d<=days;d++){ const v=shifts[s.id]?.[d]||""; const dispV=effectiveCellShift(v, s.shiftRequestsByMonth?.[mk]?.[d]); const isKibo=!dispV&&kibodays.includes(d); const isYukyu2=!dispV&&!isKibo&&yukyudays2.includes(d); w+=workDayValue(v); if(v==="夜勤") n++; if((REST_TYPES.has(v)||HALF_PAIDREST_TYPES.has(v))&&v!=="明け"&&v!=="有休") r+=(HALF_REST_TYPES.has(v)||HALF_PAIDREST_TYPES.has(v))?0.5:1; if(isKibo) r++; const wd=WD[new Date(year,month,d).getDay()]; const isWe=wd==="日"||wd==="土"||isJpHoliday(year,month,d); const cellText=isKibo||dispV==="希望休"||dispV==="希"?'休':isYukyu2?'<span style="color:#9b4db5">有</span>':(HALF_REST_TYPES.has(dispV))?dispV:(getShiftDef(dispV, dept.customShiftDefs, dept)?.short||"－"); html += TAG(`td class="${isWe?"we":""}"`)+cellText+CTAG('td'); }
      html += TAG('td class="sum"')+w+CTAG('td')+TAG('td class="sum"')+(n||"－")+CTAG('td')+TAG('td class="sum"')+r+CTAG('td')+CTAG('tr');
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
  // 研修は全職員が対象になりうるため、半日シフト同様に役職制限の対象外（常時選択可）
  const visibleKeys = roleAllowed ? SHIFT_KEYS_MANUAL.filter(k=>k==="研修"||!WORK_TYPES.has(k)||roleAllowed.includes(k)) : SHIFT_KEYS_MANUAL;
  return (
    <div ref={ref} style={{position:"fixed",left:pos.x,top:pos.y,zIndex:999,background:"#18181B",border:"1px solid #27272A",borderRadius:8,padding:6,boxShadow:"0 8px 32px rgba(0,0,0,0.6)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,minWidth:170,color:"#F4F4F5"}}>
      {isBulk&&<div style={{gridColumn:"1/-1",background:"#1e1b4b",border:"1px solid #4338CA",borderRadius:6,padding:"4px 8px",marginBottom:2,fontSize:11,color:"#C7D2FE",fontWeight:700,textAlign:"center"}}>{selectionCount}セルに一括適用</div>}
      {roleAllowed&&<div style={{gridColumn:"1/-1",background:"#1c1917",border:"1px solid #78350F",borderRadius:6,padding:"3px 8px",marginBottom:2,fontSize:10,color:"#FEF3C7",textAlign:"center"}}>役職制限: {roleAllowed.join("・")}のみ</div>}
      {/* 右クリックで勤務を入れた時点で希望勤務ロック（統一ルール）。専用の「希望勤務にする/解除」メニューは廃止し、
          値の選択＝ロック、クリア＝解除で兼ねる（handleMenuSelect が shiftRequestsByMonth を更新する）。 */}
      {isBulk&&<div style={{gridColumn:"1/-1",background:"#3b1d5e",border:"1px solid #7c3aed",borderRadius:6,padding:"4px 8px",marginBottom:2,fontSize:10,color:"#EDE9FE",textAlign:"center"}}>選択した勤務は希望勤務として固定されます</div>}
      {customWorkKeys.length>0&&<>
        {customWorkKeys.map(cd => { const s=getShiftDef(cd.key,customDefs); return <button key={cd.key} onClick={()=>onSelect(cd.key)} style={{background:s.bg,color:s.color,border:`1px solid ${s.border}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}><span style={{minWidth:18,height:18,background:s.bg,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>{s.short}</span><span style={{fontSize:11,color:"#A1A1AA"}}>{cd.key}</span></button>; })}
        <div style={{gridColumn:"1/-1",borderTop:"1px solid #27272A",margin:"2px 0"}}/>
      </>}
      {visibleKeys.map(k => { const s=SHIFTS[k]; return <button key={k||"empty"} onClick={()=>onSelect(k)} style={{background:s.bg||"transparent",color:s.color,border:`1px solid ${s.border||"#27272A"}`,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}><span style={{minWidth:18,height:18,background:k?s.bg:"transparent",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>{s.short}</span><span style={{fontSize:11,color:"#A1A1AA"}}>{k||"クリア"}</span></button>; })}
    </div>
  );
}

const SHIFT_REQ_TYPES = ["早番","日勤","研修","遅番","夜勤","明け","休み","有休","日/休","休/日","早/休","休/遅","早/有","日/有","有/日","有/遅","有/休"];
function KiboCalendar({ year, month, selected, onChange, shiftRequests, onShiftRequests, deptId, depts, kiboCountByDay, kiboLimit }) {
  const days = getDays(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i=0; i<firstDow; i++) cells.push(null);
  for (let d=1; d<=days; d++) cells.push(d);
  const dept = (depts||DEFAULT_DEPTS).find(d=>d.id===deptId);
  const customDefs = dept?.customShiftDefs || [];
  const availableReqTypes = [
    ...SHIFT_REQ_TYPES.filter(k => k==="休み"||k==="有休"||k==="明け"||k==="研修"||HALF_ALL_TYPES.has(k)||(dept?.shiftTypes||[]).includes(k)),
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
  const [kp, setKp] = useState(null);
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:460,boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{color:"#18181B",fontSize:15,fontWeight:900}}>{isNew?"スタッフ追加":"スタッフ編集"}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}><X size={18} strokeWidth={2}/></button>
        </div>
        <div style={{marginBottom:12}}><div style={{color:"#52525B",fontSize:11,marginBottom:4}}>氏名</div><input type="text" value={form.name} onChange={e=>set("name",e.target.value)} style={INPUT_STYLE} placeholder="例：田中 花子"/></div>
        <div style={{marginBottom:12}}><div style={{color:"#52525B",fontSize:11,marginBottom:4}}>役職</div><select value={form.role} onChange={e=>set("role",e.target.value)} style={INPUT_STYLE}>{(deptRoles.includes(form.role)?deptRoles:[...deptRoles,form.role]).map(r=><option key={r}>{r}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><div style={{color:"#52525B",fontSize:11,marginBottom:4}}>目標勤務日数</div><div onClick={e=>setKp({value:form.targetWork,min:1,max:31,unit:"日",onConfirm:v=>set("targetWork",v===""?1:Math.max(1,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,cursor:"pointer",userSelect:"none",fontWeight:700,textAlign:"center"}}>{form.targetWork}</div></div>
          <div><div style={{color:"#6366F1",fontSize:11,marginBottom:4,fontWeight:700}}>{year}年{month+1}月の休み日数</div><div onClick={e=>setKp({value:kyukoThisMonth,min:0,max:20,unit:"日",onConfirm:v=>setKyukoThisMonth(v===""?0:+v),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,color:"#6366F1",cursor:"pointer",userSelect:"none",fontWeight:800,textAlign:"center"}}>{kyukoThisMonth}</div></div>
          <div><div style={{color:"#9b4db5",fontSize:11,marginBottom:4,fontWeight:700}}>有給残日数（0.5刻み可）</div><div onClick={e=>setKp({mode:"decimal",value:String(form.paidLeaveBalance??0),unit:"日",onConfirm:v=>set("paidLeaveBalance",v===""?0:Number(v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,color:(form.paidLeaveBalance??0)<0?"#dc2626":"#9b4db5",cursor:"pointer",userSelect:"none",fontWeight:800,textAlign:"center"}}>{form.paidLeaveBalance??0}</div></div>
        </div>
        {deptObj?.shiftTypes?.includes("夜勤")&&(
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
function DeptSettingModal({ dept, onSave, onDelete, onClose, isNew, onConfirm }) {
  const buildInitMaxStaff = (types, existing, customDefs) => { const d={}; (types||["日勤"]).forEach(k=>{const cd=(customDefs||[]).find(c=>c.key===k);const base=cd?.baseType||k;const def=base==="日勤"?99:1;const saved=existing?.[k];d[k]=(saved!=null&&!(cd&&base==="日勤"&&saved===1))?saved:def;}); return d; };
  const initShiftTypes = () => { const base=dept?.shiftTypes||["日勤"]; const ckeys=(dept?.customShiftDefs||[]).map(cd=>cd.key).filter(Boolean); const missing=ckeys.filter(k=>!base.includes(k)); const all=missing.length>0?[...base,...missing]:base; return all.filter((k,i)=>all.indexOf(k)===i); };
  const [label,setLabel]=useState(dept?.label||""), [shiftTypes,setShiftTypes]=useState(initShiftTypes), [minStaff,setMinStaff]=useState(dept?.minStaff||{日勤:1}), [maxStaff,setMaxStaff]=useState(()=>buildInitMaxStaff(initShiftTypes(),dept?.maxStaff,dept?.customShiftDefs)), [maxConsec,setMaxConsec]=useState(dept?.maxConsecutive||5), [defKyuko,setDefKyuko]=useState(dept?.defaultKyukoDays||8), [kiboLimit,setKiboLimit]=useState(dept?.kiboLimit||3), [kiboDayLimit,setKiboDayLimit]=useState(dept?.kiboDayLimit||0), [rolesText,setRolesText]=useState((dept?.roles||["職員"]).join("\n")), [pinCode,setPinCode]=useState(dept?.pin||""), [roleShiftTypes,setRoleShiftTypes]=useState(dept?.roleShiftTypes||{});
  const [shiftMaxByType,setShiftMaxByType]=useState(()=>{const d={};initShiftTypes().filter(k=>k!=="夜勤").forEach(k=>{d[k]=dept?.shiftMaxByType?.[k]||0;});return d;});
  const [customShiftDefs, setCustomShiftDefs] = useState(dept?.customShiftDefs || []);
  const [crossFloorNightEnabled, setCrossFloorNightEnabled] = useState(!!dept?.crossFloorNightEnabled);
  const [shiftTimes, setShiftTimes] = useState(dept?.shiftTimes || {});
  const [intervalEnabled, setIntervalEnabled] = useState(!!dept?.intervalEnabled);
  const [allowLateToEarly, setAllowLateToEarly] = useState(!!dept?.allowLateToEarly);
  const [intervalHours, setIntervalHours] = useState(dept?.intervalHours ?? 11);
  const [intervalTargetShifts, setIntervalTargetShifts] = useState(dept?.intervalTargetShifts || []);
  const [requiredStart, setRequiredStart] = useState(dept?.requiredStart || "");
  const [requiredEnd, setRequiredEnd] = useState(dept?.requiredEnd || "");
  const [maxStaffRelaxable, setMaxStaffRelaxable] = useState(dept?.maxStaffRelaxable !== false);
  const [engineType, setEngineType] = useState(dept?.engineType || 'kaigo');
  const toggleShiftType = (k) => { setShiftTypes(prev => { const next=prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]; setMinStaff(p=>{const n={};next.forEach(s=>{n[s]=p[s]||1;});return n;}); setMaxStaff(p=>{const n={};next.forEach(s=>{n[s]=p[s]!=null?p[s]:(s==="日勤"?99:1);});return n;}); setShiftMaxByType(p=>{const n={};next.filter(s=>s!=="夜勤").forEach(s=>{n[s]=p[s]||0;});return n;}); return next; }); };
  const handleSave = () => { if(!label.trim()){alert("部署名を入力してください");return;} if(shiftTypes.length===0){alert("シフト種別を選択してください");return;} if(pinCode&&pinCode.length!==4){alert("PINコードは4桁で入力してください");return;} const roles=rolesText.split("\n").map(r=>r.trim()).filter(Boolean); const cleanRST={}; const nonNightTypes=shiftTypes.filter(k=>k!=='夜勤'&&k!=='明け'); Object.entries(roleShiftTypes).forEach(([role,types])=>{if(types!=null&&types.length>0&&types.length<nonNightTypes.length)cleanRST[role]=types;}); const cleanMax=Object.keys(shiftMaxByType).some(k=>shiftMaxByType[k]>0)?shiftMaxByType:undefined; onSave({id:dept?.id||`dept_${Date.now()}`,label:label.trim(),shiftTypes,minStaff:Object.fromEntries(Object.entries(minStaff).filter(([k])=>k.trim()!=='')),maxStaff:Object.fromEntries(Object.entries(maxStaff).filter(([k])=>k.trim()!=='')),shiftMaxByType:cleanMax,maxConsecutive:maxConsec,defaultKyukoDays:defKyuko,kiboLimit,kiboDayLimit,roles:roles.length>0?roles:["職員"],roleShiftTypes:Object.keys(cleanRST).length>0?cleanRST:undefined,pin:pinCode||undefined,customShiftDefs:customShiftDefs.filter(d=>d.key.trim()),shiftTimes:Object.keys(shiftTimes).length>0?shiftTimes:undefined,intervalEnabled:intervalEnabled||undefined,intervalHours:intervalEnabled?intervalHours:undefined,intervalTargetShifts:intervalEnabled&&intervalTargetShifts.length>0?intervalTargetShifts:undefined,allowLateToEarly:allowLateToEarly||undefined,requiredStart:requiredStart||undefined,requiredEnd:requiredEnd||undefined,crossFloorNightEnabled:crossFloorNightEnabled||undefined,engineType}); };
  const LS = { fontSize:11, color:"#52525B", fontWeight:700, marginBottom:5, display:"block" };
  const [kp, setKp] = useState(null);
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:210,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>{isNew?"➕ 部署を追加":"✏️ 部署を編集"}</div><button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}><X size={18} strokeWidth={2}/></button></div>
        <label style={LS}>部署名</label>
        <input style={{...INPUT_STYLE,marginBottom:14}} value={label} onChange={e=>setLabel(e.target.value)} placeholder="例：介護部 3階"/>
        <label style={LS}>シフト種別</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>{SHIFT_TYPE_OPTIONS.map(k=>{const s=SHIFTS[k],checked=shiftTypes.includes(k);return <button key={k} onClick={()=>toggleShiftType(k)} style={{background:checked?s.bg:"#F4F4F5",border:`1px solid ${checked?s.border:"#E4E4E7"}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",color:checked?s.color:"#3F3F46",fontSize:13,fontWeight:checked?700:400,display:"flex",alignItems:"center",gap:6}}><span>{checked?"✅":"○"}</span>{k}</button>;})}</div>
        {shiftTypes.length>0&&<div style={{background:"#F4F4F5",border:"1px solid #27272A",borderRadius:8,padding:"10px 12px",marginBottom:8}}><div style={{fontSize:11,color:"#52525B",marginBottom:8}}>最低配置人数 <span style={{fontSize:10,color:"#52525B",fontWeight:400}}>（この人数を下回ると警告）</span></div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.map(k=><div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:getShiftDef(k,customShiftDefs)?.color,fontWeight:700}}>{k}</span><div onClick={e=>setKp({value:minStaff[k]||0,min:0,max:20,unit:"名",onConfirm:v=>setMinStaff(p=>({...p,[k]:v===""?0:+v})),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{minStaff[k]||0}</div><span style={{fontSize:11,color:"#3F3F46"}}>名</span></div>)}</div></div>}
        {shiftTypes.length>0&&<div style={{background:"#fff3e0",border:"1px solid #e0a000",borderRadius:8,padding:"10px 12px",marginBottom:8}}><div style={{fontSize:11,color:"#b45309",marginBottom:8}}>最大配置人数 <span style={{fontSize:10,color:"#a06010",fontWeight:400}}>（自動生成でこの人数を超えない・--=制限なし）</span></div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.map(k=>{const mv=maxStaff[k]!=null?maxStaff[k]:((customShiftDefs.find(c=>c.key===k)?.baseType||k)==="日勤"?99:1);const isUnlim=mv>=99;return(<div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:getShiftDef(k,customShiftDefs)?.color,fontWeight:700}}>{k}</span><div onClick={e=>setKp({value:mv,min:1,max:99,unit:"名",onConfirm:v=>setMaxStaff(p=>({...p,[k]:v===""?99:+v})),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:isUnlim?400:700,color:isUnlim?"#b0cece":"inherit"}}>{isUnlim?"--":mv}</div>{!isUnlim&&<span style={{fontSize:11,color:"#92400e"}}>名</span>}</div>);})}</div></div>}
        {shiftTypes.filter(k=>k!=="夜勤").length>0&&<div style={{background:"#f0f0ff",border:"1px solid #a0a0e0",borderRadius:8,padding:"10px 12px",marginBottom:14}}><div style={{fontSize:11,color:"#5050b0",marginBottom:8}}>職員の月間上限回数 <span style={{fontSize:10,color:"#7070a0",fontWeight:400}}>（超過すると集計欄が赤表示・0=制限なし）</span></div><div style={{display:"flex",gap:12,flexWrap:"wrap"}}>{shiftTypes.filter(k=>k!=="夜勤").map(k=><div key={k} style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:getShiftDef(k,customShiftDefs)?.color,fontWeight:700}}>{k}</span><div onClick={e=>setKp({value:shiftMaxByType[k]||0,min:0,max:31,unit:"回",onConfirm:v=>setShiftMaxByType(p=>({...p,[k]:v===""?0:+v})),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:52,padding:"4px 8px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{shiftMaxByType[k]||0}</div><span style={{fontSize:11,color:"#5050b0"}}>回</span></div>)}</div></div>}
        {/* 遅番→早番を許可（allowLateToEarly）: 時間帯系フラグとは独立して常時表示 */}
        <div style={{background:"#f0f8ff",border:"1px solid #90c4e0",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer"}}>
            <input type="checkbox" checked={allowLateToEarly} onChange={e=>setAllowLateToEarly(e.target.checked)} style={{width:14,height:14,accentColor:"#6366F1",marginTop:2}}/>
            <span>
              <span style={{fontSize:12,fontWeight:700,color:"#1a5a87"}}>遅番→早番を許可</span>
              <span style={{display:"block",fontSize:10,color:"#52525B",marginTop:2}}>遅番の翌日に早番・日勤を許可します（日勤→早番も許可）。夜勤のない部署（栄養科など）向け。<b>介護部署はOFF推奨</b>（労務上、遅番→早番は禁止のまま）。</span>
            </span>
          </label>
        </div>
        {/* インターバル設定（時間帯系・TIME_FEATURES_ENABLEDで凍結／復活） */}
        {TIME_FEATURES_ENABLED && <div style={{background:"#f0f8ff",border:"1px solid #90c4e0",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:8}}>
            <input type="checkbox" checked={intervalEnabled} onChange={e=>setIntervalEnabled(e.target.checked)} style={{width:14,height:14,accentColor:"#6366F1"}}/>
            <span style={{fontSize:12,fontWeight:700,color:"#1a5a87"}}>インターバル制限を有効化</span>
          </label>
          {intervalEnabled&&<>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:11,color:"#3a6a87",fontWeight:700}}>最低インターバル</span>
              <div onClick={e=>setKp({mode:"decimal",value:String(intervalHours),unit:"h",onConfirm:v=>setIntervalHours(v===""?11:Number(v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700}}>{intervalHours}</div>
              <span style={{fontSize:10,color:"#52525B"}}>時間未満を禁止</span>
            </div>
            <div style={{fontSize:11,color:"#3a6a87",fontWeight:700,marginBottom:4}}>判定対象シフト</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{shiftTypes.map(k=>{const checked=intervalTargetShifts.includes(k);const sd=getShiftDef(k,customShiftDefs);return(<button key={k} onClick={()=>setIntervalTargetShifts(p=>checked?p.filter(x=>x!==k):[...p,k])} style={{background:checked?"#dbeafe":"#F4F4F5",border:`1px solid ${checked?"#93c5fd":"#E4E4E7"}`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:checked?700:400,color:checked?(sd?.color||"#1d4ed8"):"#3F3F46"}}>{k}</button>);})}</div>
          </>}
        </div>}
        {/* 勤務時間設定・必須運営時間（時間帯系・TIME_FEATURES_ENABLEDで凍結／復活） */}
        {TIME_FEATURES_ENABLED && <div style={{background:"#f0fff8",border:"1px solid #86efac",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#166534",fontWeight:700,marginBottom:4}}>勤務時間設定 <span style={{fontSize:10,fontWeight:400,color:"#52525B"}}>（インターバル判定に使用）</span></div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{shiftTypes.filter(k=>k!=="明け").map(k=>{const def=DEFAULT_SHIFT_TIMES[k]||{};const sd=getShiftDef(k,customShiftDefs);const mkp=(field,cur)=>e=>setKp({mode:"time",value:cur||"",unit:"",onConfirm:v=>setShiftTimes(p=>({...p,[k]:{...(p[k]||{}),[field]:v||undefined}})),anchorRect:e.currentTarget.getBoundingClientRect()});return(<div key={k} style={{display:"flex",alignItems:"center",gap:4,background:"#ffffff",border:"1px solid #E4E4E7",borderRadius:6,padding:"4px 8px"}}><span style={{fontSize:11,color:sd?.color,fontWeight:700,minWidth:36}}>{k}</span><div onClick={mkp("start",shiftTimes[k]?.start)} style={{...INPUT_STYLE,width:60,padding:"2px 4px",marginBottom:0,fontSize:12,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:shiftTimes[k]?.start?"#18181B":"#A1A1AA"}}>{shiftTimes[k]?.start||def.start||"--:--"}</div><span style={{fontSize:10,color:"#D4D4D8"}}>〜</span><div onClick={mkp("end",shiftTimes[k]?.end)} style={{...INPUT_STYLE,width:60,padding:"2px 4px",marginBottom:0,fontSize:12,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:shiftTimes[k]?.end?"#18181B":"#A1A1AA"}}>{shiftTimes[k]?.end||def.end||"--:--"}</div></div>);})}</div>
          <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:8}}><span style={{fontSize:11,color:"#166534",fontWeight:700}}>必須運営時間</span><div onClick={e=>setKp({mode:"time",value:requiredStart||"",unit:"",onConfirm:v=>setRequiredStart(v||""),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:70,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:requiredStart?"#18181B":"#A1A1AA"}}>{requiredStart||"--:--"}</div><span style={{fontSize:10,color:"#D4D4D8"}}>〜</span><div onClick={e=>setKp({mode:"time",value:requiredEnd||"",unit:"",onConfirm:v=>setRequiredEnd(v||""),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:70,padding:"3px 6px",marginBottom:0,textAlign:"center",cursor:"pointer",userSelect:"none",fontWeight:700,color:requiredEnd?"#18181B":"#A1A1AA"}}>{requiredEnd||"--:--"}</div>{(requiredStart||requiredEnd)&&<button onClick={()=>{setRequiredStart("");setRequiredEnd("");}} style={{fontSize:10,color:"#dc2626",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>クリア</button>}</div>
        </div>}
        {/* カスタムシフト種別 */}
        <div style={{background:"#f0fff4",border:"1px solid #86efac",borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#166534",fontWeight:700,marginBottom:6}}>カスタムシフト種別 <span style={{fontSize:10,fontWeight:400,color:"#4ade80"}}>（独自の勤務形態）</span></div>
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
          <button onClick={()=>setCustomShiftDefs(p=>[...p,{key:"",baseType:"日勤"}])} style={{background:"#f0fdf4",border:"1px dashed #86efac",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:11,color:"#166534",fontWeight:700}}>＋ カスタムシフト追加</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          <div><label style={LS}>最大連続勤務日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><div onClick={e=>setKp({value:maxConsec,min:3,max:7,unit:"日",onConfirm:v=>setMaxConsec(v===""?5:Math.max(3,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{maxConsec}</div><span style={{fontSize:12,color:"#3F3F46"}}>日</span></div></div>
          <div><label style={LS}>デフォルト公休日数</label><div style={{display:"flex",alignItems:"center",gap:8}}><div onClick={e=>setKp({value:defKyuko,min:4,max:15,unit:"日",onConfirm:v=>setDefKyuko(v===""?8:Math.max(4,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{defKyuko}</div><span style={{fontSize:12,color:"#3F3F46"}}>日</span></div></div>
          <div><label style={LS}>希望休 上限人数（同日）</label><div style={{display:"flex",alignItems:"center",gap:8}}><div onClick={e=>setKp({value:kiboLimit,min:1,max:10,unit:"名",onConfirm:v=>setKiboLimit(v===""?3:Math.max(1,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{kiboLimit}</div><span style={{fontSize:12,color:"#3F3F46"}}>名</span></div><div style={{fontSize:10,color:"#c44b4b",marginTop:3}}>同じ日に何名まで希望休を取れるか（同日に達すると⚠警告）</div></div>
          <div><label style={LS}>希望休 上限日数（1人あたり）</label><div style={{display:"flex",alignItems:"center",gap:8}}><div onClick={e=>setKp({value:kiboDayLimit,min:0,max:31,unit:"日",onConfirm:v=>setKiboDayLimit(v===""?0:Math.max(0,+v)),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{...INPUT_STYLE,width:64,padding:"7px 10px",textAlign:"center",marginBottom:0,cursor:"pointer",userSelect:"none",fontWeight:700}}>{kiboDayLimit===0?"制限なし":kiboDayLimit}</div><span style={{fontSize:12,color:"#3F3F46"}}>日</span></div><div style={{fontSize:10,color:"#2563EB",marginTop:3}}>1人が1ヶ月に何日まで希望休を出せるか（0=制限なし・超過はポータルで入力不可）</div></div>
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
        {/* 編集PINは「編集PIN設定」専用欄（メニュー→編集PIN設定）へ分離。ここでは既存値を保持のみ。 */}
        <div style={{fontSize:10,color:"#52525B",marginBottom:18,display:"flex",alignItems:"center",gap:5}}><Lock size={12} strokeWidth={2}/>編集PINは「メニュー ＞ 編集PIN設定」から設定・変更できます。</div>
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

/* 編集PIN設定モーダル: 各部署の編集PIN(dept.pin・4桁)を一覧でまとめて設定・変更・解除する専用欄。
   PINの形式・保存先(dept.pin)は不変。ロック中でも開ける（PIN忘れ時の復旧口を兼ねる）。 */
function PinSettingsModal({ depts, onSave, onClose }) {
  const [pins, setPins] = useState(() => Object.fromEntries((depts||[]).map(d => [d.id, d.pin || ""])));
  const setPin = (id, v) => setPins(p => ({ ...p, [id]: v.replace(/\D/g, '').slice(0, 4) }));
  const save = () => {
    for (const d of depts) {
      const v = pins[d.id] || "";
      if (v && v.length !== 4) { alert(`「${d.label}」のPINは4桁で入力してください`); return; }
    }
    onSave(pins);
    onClose();
  };
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:210,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:420,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:15,fontWeight:900,color:"#18181B",display:"flex",alignItems:"center",gap:6}}><Lock size={16} strokeWidth={2}/>編集PIN設定</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}><X size={18} strokeWidth={2}/></button>
        </div>
        <div style={{fontSize:11,color:"#52525B",marginBottom:16}}>各部署の編集PIN（4桁）を設定します。PINを設定すると、その部署はロックされ、編集にはPIN解錠が必要になります。空欄で保存するとPINを解除できます。</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
          {(depts||[]).map(d => (
            <div key={d.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",border:"1px solid #D4D4D8",borderRadius:9,padding:"10px 12px"}}>
              <div style={{flex:1,fontSize:13,fontWeight:700,color:"#18181B"}}>{d.label}</div>
              <input type="text" inputMode="numeric" maxLength={4} value={pins[d.id]||""} onChange={e=>setPin(d.id,e.target.value)} placeholder="4桁（空=なし）" style={{...INPUT_STYLE,width:130,letterSpacing:4,textAlign:"center",marginBottom:0}}/>
              {(pins[d.id]||"")&&<button onClick={()=>setPin(d.id,"")} title="このPINを解除" style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:11,display:"inline-flex",alignItems:"center",gap:2}}><X size={12} strokeWidth={2}/>解除</button>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={save} style={{flex:1,background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}><Save size={14} strokeWidth={2}/>保存する</button>
          <button onClick={onClose} style={{flex:1,background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

/* 学習状況ビュー: 自動生成が学習した各スタッフの「曜日ごとの癖」を画面で確認する（読み取り専用）。
   計算(computeLearnedTrend)・生成(core.js)には一切関与しない。表示のみ。
   - 生成が使う値 = learnedTrend（生成が実際に参照する、平滑・重み付け後の値）
   - 実績データ   = allDBData を素直に集計した観測率（重み・平滑なし＝実際の実績そのもの） */
function LearnStatusView({ learnedTrend, staffList, depts, allDBData, activeDeptId, year, month }) {
  const DOW = ['日','月','火','水','木','金','土']; // getDay() 順
  const REST = new Set(['休み','希望休','有休']);
  const deptStaff = (staffList || []).filter(s => s.dept === activeDeptId);
  const [selId, setSelId] = useState(() => deptStaff[0]?.id || null);
  const sel = deptStaff.find(s => s.id === selId);
  const dept = (depts || []).find(d => d.id === activeDeptId);

  // 生データ観測（全月・重みなし）。曜日は getDay() 順（0=日）。
  const rawOf = (staffId) => {
    const tot = [0,0,0,0,0,0,0], rest = [0,0,0,0,0,0,0]; const months = new Set(); let days = 0;
    for (const [key, shifts] of Object.entries(allDBData || {})) {
      if (!key.startsWith('shifts_') || !shifts || typeof shifts !== 'object') continue;
      const p = key.split('_'); if (p.length < 4) continue; const y = +p[1], mRaw = +p[2];
      if (isNaN(y) || isNaN(mRaw)) continue; const ss = shifts[staffId]; if (!ss || typeof ss !== 'object') continue;
      months.add(`${y}-${mRaw}`);
      for (const [dStr, v] of Object.entries(ss)) { if (!v) continue; const d = +dStr; if (isNaN(d)) continue;
        const dow = new Date(y, mRaw - 1, d).getDay(); tot[dow]++; if (REST.has(v)) rest[dow]++; days++; }
    }
    return { tot, rest, months: months.size, days };
  };
  // learnedTrend の dowRestRate は (getDay()+6)%7 の並び（月=0..日=6）。表示(0=日)へ変換。
  const smRest = (t, dowSun) => t?.dowRestRate?.[(dowSun + 6) % 7];
  const pct = (v) => v == null ? '—' : (v * 100).toFixed(1) + '%';

  const t = sel ? learnedTrend?.[sel.name] : null;
  const raw = sel ? rawOf(sel.id) : null;
  const daysInMonth = getDays(year, month);
  const [selDow, setSelDow] = useState(0); // ③で調べる曜日（0=日〜6=土）。初期は日曜。
  const dowDays = []; for (let d = 1; d <= daysInMonth; d++) if (new Date(year, month, d).getDay() === selDow) dowDays.push(d);
  const monthShifts = allDBData?.[`shifts_${year}_${month + 1}_${activeDeptId}`] || {};

  const th = { padding: '4px 8px', fontSize: 11, color: '#334155', borderBottom: '1px solid #E2E8F0', textAlign: 'center', whiteSpace: 'nowrap' };
  const td = { padding: '4px 8px', fontSize: 11, color: '#0F172A', borderBottom: '1px solid #F1F5F9', textAlign: 'center', whiteSpace: 'nowrap' };
  const sunHi = { background: '#FFF1F2' };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: '1px solid #E4E4E7', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#4F46E5', marginBottom: 4 }}>📈 学習状況</div>
        <div style={{ fontSize: 11.5, color: '#475569', marginBottom: 6, lineHeight: 1.6 }}>
          自動生成が過去の実績から学習した「スタッフごと・曜日ごとの傾向」を表示します。部署「{dept?.label || activeDeptId}」。
        </div>
        <div style={{ fontSize: 11, color: '#64748B', background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: 8, padding: '7px 11px', marginBottom: 14, lineHeight: 1.7 }}>
          <b style={{ color: '#c0392b' }}>実績データ</b> ＝ 実際のシフト実績そのもの（そのまま集計）。<br />
          <b style={{ color: '#2563EB' }}>生成が使う値</b> ＝ その実績を元に、直近月を重視・データの少なさを部署平均で補正して、生成が実際に参照する値。<br />
          <span style={{ color: '#94A3B8' }}>※ 両者が大きく違う場合は、実績が少ない／下書きのまま／別部署に入っている等で学習が薄まっている可能性があります。</span>
        </div>

        {/* スタッフ選択 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {deptStaff.map(s => (
            <button key={s.id} onClick={() => setSelId(s.id)} style={{ background: s.id === selId ? '#6366F1' : '#F1F5F9', color: s.id === selId ? '#fff' : '#334155', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: s.id === selId ? 800 : 500 }}>{s.name}</button>
          ))}
        </div>

        {!sel ? <div style={{ color: '#94A3B8', fontSize: 12 }}>スタッフがいません。</div> : !t ? (
          <div style={{ color: '#DC2626', fontSize: 12, fontWeight: 700 }}><AlertTriangle size={14} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5}}/>{sel.name} さんの学習データがまだありません（実績が未保存の可能性）。実績データの観測: {raw.days}日 / {raw.months}ヶ月</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#0a7d34', fontWeight: 700, marginBottom: 10 }}>
              {sel.name}（{sel.role || '-'}）｜学習に使った月数: {learnedTrend._monthCounts?.[sel.name] ?? '?'}ヶ月 ／ 実績データの件数: 全{raw.days}日・{raw.months}ヶ月分
            </div>

            {/* ① 曜日別の休み率 */}
            <div style={{ fontSize: 12, fontWeight: 800, color: '#c0392b', margin: '6px 0' }}>① 曜日別の休み率</div>
            <div style={{ overflowX: 'auto', marginBottom: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={th}></th>{DOW.map((w, i) => <th key={w} style={i === 0 ? { ...th, ...sunHi, color: '#c0392b', fontWeight: 800 } : th}>{w}</th>)}</tr></thead>
                <tbody>
                  <tr><td style={{ ...td, textAlign: 'left', color: '#2563EB', fontWeight: 700 }}>生成が使う値</td>{DOW.map((w, i) => <td key={w} style={i === 0 ? { ...td, ...sunHi, fontWeight: 800, color: '#c0392b' } : td}>{pct(smRest(t, i))}</td>)}</tr>
                  <tr><td style={{ ...td, textAlign: 'left', color: '#c0392b', fontWeight: 700 }}>実績データ</td>{DOW.map((w, i) => <td key={w} style={i === 0 ? { ...td, ...sunHi, fontWeight: 800, color: '#c0392b' } : td}>{raw.tot[i] ? ((raw.rest[i] / raw.tot[i]) * 100).toFixed(1) + '%' : '—'}</td>)}</tr>
                  <tr><td style={{ ...td, textAlign: 'left', color: '#94A3B8' }}>実績（休み/全日数）</td>{DOW.map((w, i) => <td key={w} style={i === 0 ? { ...td, ...sunHi } : td}>{raw.rest[i]}/{raw.tot[i]}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#c0392b', marginBottom: 14 }}>
              ▶ 日曜の休み率: 実績データ {raw.tot[0] ? ((raw.rest[0] / raw.tot[0]) * 100).toFixed(1) + '%' : '—'} → 生成が使う値 {pct(smRest(t, 0))}
            </div>

            {/* ② 曜日別の勤務種別の割合 */}
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2563EB', margin: '6px 0' }}>② 曜日別の勤務種別の割合（生成が使う値）</div>
            {(() => {
              const types = new Set(); (t.dowShiftRate || []).forEach(r => r && Object.keys(r).forEach(k => types.add(k)));
              // 勤務種別(行)の並びをスタッフ間で固定化する（標準の並び順 SHIFT_KEYS_MANUAL 準拠・未知種別は末尾）。
              const typeArr = [...types].sort((a, b) => {
                const ia = SHIFT_KEYS_MANUAL.indexOf(a), ib = SHIFT_KEYS_MANUAL.indexOf(b);
                const oa = ia === -1 ? Infinity : ia, ob = ib === -1 ? Infinity : ib;
                return oa !== ob ? oa - ob : a.localeCompare(b);
              });
              if (typeArr.length === 0) return <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 12 }}>勤務データなし</div>;
              return (
                <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead><tr><th style={th}></th>{DOW.map((w, i) => <th key={w} style={i === 0 ? { ...th, ...sunHi, color: '#c0392b', fontWeight: 800 } : th}>{w}</th>)}</tr></thead>
                    <tbody>{typeArr.map(k => (
                      <tr key={k}><td style={{ ...td, textAlign: 'left', color: '#475569', fontWeight: 700 }}>{k}</td>{DOW.map((w, i) => { const v = t.dowShiftRate?.[i]?.[k]; return <td key={w} style={i === 0 ? { ...td, ...sunHi } : td}>{v != null ? (v * 100).toFixed(0) + '%' : '—'}</td>; })}</tr>
                    ))}</tbody>
                  </table>
                </div>
              );
            })()}

            {/* ③ 表示中の月の指定曜日の状況 */}
            <div style={{ fontSize: 12, fontWeight: 800, color: '#9b4db5', margin: '6px 0' }}>③ {year}年{month + 1}月（表示中の月）の{DOW[selDow]}曜の割り当て状況</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {DOW.map((w, i) => (
                <button key={w} onClick={() => setSelDow(i)} style={{ background: i === selDow ? '#9b4db5' : '#F1F5F9', color: i === selDow ? '#fff' : (i === 0 ? '#c0392b' : i === 6 ? '#2563EB' : '#334155'), border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: i === selDow ? 800 : 600 }}>{w}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>この部署の最低配置人数：{Object.entries(dept?.minStaff || {}).map(([k, v]) => `${k}×${v}`).join(' / ') || '未設定'}</div>
            {Object.keys(monthShifts).length === 0 ? <div style={{ fontSize: 11, color: '#94A3B8' }}>この月のシフトはまだ作成されていません。</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr><th style={th}>日</th><th style={th}>{sel.name}の割当</th><th style={th}>出勤者数</th><th style={th}>休み者数</th><th style={{ ...th, textAlign: 'left' }}>出勤者</th></tr></thead>
                  <tbody>{dowDays.map(d => {
                    const cs = monthShifts[sel.id]?.[d] || '(空)';
                    const wk = deptStaff.filter(s => { const v = monthShifts[s.id]?.[d]; return v && !['休み', '希望休', '有休', '明け', ''].includes(v); });
                    const rs = deptStaff.filter(s => REST.has(monthShifts[s.id]?.[d]));
                    const selWorking = !REST.has(cs) && cs !== '(空)' && cs !== '明け';
                    return <tr key={d}><td style={td}>{d}</td><td style={{ ...td, fontWeight: 800, color: selWorking ? '#DC2626' : '#0F172A' }}>{cs}</td><td style={td}>{wk.length}</td><td style={td}>{rs.length}</td><td style={{ ...td, textAlign: 'left', color: '#64748B' }}>{wk.map(s => `${s.name}:${monthShifts[s.id][d]}`).join(' / ')}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            )}
            <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 12, lineHeight: 1.7 }}>
              読み方: 実績データが100%近いのに「生成が使う値」が下がっている場合は、実績が少なく部署平均で補正されて薄まっている可能性。実績データ自体が100%でない場合は、学習に入った実績が想定と違う（別の月・下書きのまま・別部署に保存など）可能性があります。
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* 学習バックテスト（答え合わせ）ビュー — 研究用・読み取り専用。
   直近月を正解として隠し、それ以前で学習→生成→実績と突合して一致率を出す。
   ★シフトデータ(shifts_/edits_/confirmed_)への書き込みは一切しない。生成結果はこの画面内表示のみ。 */
function BacktestView({ staffList, depts, allDBData, exceptionMonths, activeDeptId, year, month }) {
  const [deptId, setDeptId] = useState(activeDeptId);
  const dept = depts.find(d => d.id === deptId) || depts[0];
  const monthsAvail = useMemo(() => {
    const arr = [];
    for (const k of Object.keys(allDBData || {})) {
      if (!k.startsWith('shifts_')) continue;
      const p = k.split('_'); if (p.length < 4) continue;
      if (p.slice(3).join('_') !== deptId) continue;
      const y = +p[1], m = +p[2];
      const obj = allDBData[k];
      if (!isNaN(y) && !isNaN(m) && obj && Object.keys(obj).length > 0) arr.push({ y, m });
    }
    arr.sort((a, b) => (b.y * 12 + b.m) - (a.y * 12 + a.m));
    return arr;
  }, [allDBData, deptId]);
  const [targetSel, setTargetSel] = useState(null);
  const tgt = targetSel || monthsAvail[0] || null;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [runsData, setRunsData] = useState(null);
  const [viewRun, setViewRun] = useState(0);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState('');

  const run = async () => {
    setError(''); setMetrics(null); setRunsData(null); setNotes([]);
    if (!tgt) { setError('この部署の実績月がありません。'); return; }
    const targetKey = `shifts_${tgt.y}_${tgt.m}_${deptId}`;
    const actual = allDBData[targetKey];
    if (!actual || Object.keys(actual).length === 0) { setError('対象月の実績(shifts)が見つかりません。'); return; }
    setRunning(true); setProgress(0);
    try {
      const nts = [];
      // Step2: 対象月の shifts/edits/confirmed を除いた学習データ
      const drop = new Set([targetKey, `edits_${tgt.y}_${tgt.m}_${deptId}`, `confirmed_${tgt.y}_${tgt.m}_${deptId}`]);
      const filtered = {};
      for (const [k, v] of Object.entries(allDBData)) if (!drop.has(k)) filtered[k] = v;
      const trend = computeLearnedTrend(filtered, staffList, exceptionMonths || []);
      nts.push('学習の直近重み(recency)は「現在」基準のまま計算しています（core.js非改変のため）。対象月が過去でも重みは現在起点でズレる可能性があります。');
      const remain = new Set();
      for (const k of Object.keys(filtered)) if (k.startsWith('shifts_') && k.split('_').slice(3).join('_') === deptId) { const p = k.split('_'); remain.add(`${p[1]}-${p[2]}`); }
      if (remain.size <= 2) nts.push(`学習に使える月が${remain.size}ヶ月しかありません。STRONG_MONTHS=2ギリギリで強癖がほぼ発動しない可能性があります（これ自体がデータ量と精度の関係の測定結果です）。`);
      // Step3: 入力再現（希望休・有休を実績から固定・希望勤務はクリアして答えを漏らさない）
      const yIdx = tgt.y, mIdx = tgt.m - 1;
      const mk = `${tgt.y}-${tgt.m}`;
      const curIds = new Set(staffList.filter(s => s.dept === deptId).map(s => s.id));
      const missing = Object.keys(actual).filter(id => !curIds.has(id));
      if (missing.length > 0) nts.push(`対象月の実績に居るが現在の「${dept.label}」に居ないID が${missing.length}件あります（現在のスタッフ構成・設定で生成します）。`);
      const btStaff = staffList.map(s => {
        if (s.dept !== deptId) return s;
        const kibo = [], yuk = [];
        for (const [dStr, v] of Object.entries(actual[s.id] || {})) { const d = Number(dStr); if (v === '希望休') kibo.push(d); else if (v === '有休') yuk.push(d); }
        return { ...s, kiboByMonth: { ...(s.kiboByMonth || {}), [mk]: kibo }, yukyuByMonth: { ...(s.yukyuByMonth || {}), [mk]: yuk }, shiftRequestsByMonth: { ...(s.shiftRequestsByMonth || {}), [mk]: {} } };
      });
      // prevTail（前月実績の末尾5日）
      const pY = mIdx === 0 ? yIdx - 1 : yIdx, pM = mIdx === 0 ? 11 : mIdx - 1;
      const prevRaw = allDBData[`shifts_${pY}_${pM + 1}_${deptId}`];
      const prevTail = {};
      if (prevRaw) { const pd = getDays(pY, pM); const ts = Math.max(1, pd - 4); for (const [sid, dm] of Object.entries(prevRaw)) { const t = {}; for (let d = ts; d <= pd; d++) { const v = dm[String(d)]; if (v) t[d] = v; } if (Object.keys(t).length) prevTail[sid] = t; } }
      // Step4: bestOfN 5回（UIに制御を返しながら）
      const runs = [];
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 20));
        const { shifts } = bestOfN(btStaff, dept, yIdx, mIdx, {}, trend, 30, prevTail);
        runs.push(shifts);
        setProgress(i + 1);
      }
      // Step5: 指標計算
      const m = computeBacktestMetrics({ actual, runs, staffList: btStaff, dept, trend, year: yIdx, month: mIdx });
      // 指標G（変化追随率）: 対象月を除いた月別実績を前半/後半に分けて漂流追随を測る（A〜Fに影響なし）
      const excSet = new Set((exceptionMonths || []).map(x => String(x)));
      const monthlyShifts = [];
      for (const [k, v] of Object.entries(filtered)) {
        if (!k.startsWith('shifts_')) continue;
        const p = k.split('_'); if (p.length < 4) continue;
        if (p.slice(3).join('_') !== deptId) continue;
        const yy = +p[1], mm = +p[2];
        if (isNaN(yy) || isNaN(mm) || !v || Object.keys(v).length === 0) continue;
        if (excSet.has(`${yy}-${mm}`)) continue;
        monthlyShifts.push({ y: yy, m0: mm - 1, shifts: v });
      }
      m.G = computeDriftMetric({ actual, runs, staffList: btStaff, dept, monthlyShifts, year: yIdx, month: mIdx });
      setMetrics(m); setRunsData({ actual, runs, ds: btStaff.filter(s => s.dept === deptId), year: yIdx, month: mIdx }); setViewRun(0); setNotes(nts);
    } catch (e) {
      setError('バックテスト実行エラー: ' + (e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  const box = { background: '#fff', border: '1px solid #E4E4E7', borderRadius: 10, padding: '12px 14px', marginBottom: 12 };
  const th = { fontSize: 10, color: '#64748B', fontWeight: 700, padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #E4E4E7', whiteSpace: 'nowrap' };
  const td = { fontSize: 11, padding: '3px 6px', textAlign: 'center', borderBottom: '1px solid #F1F5F9' };
  const rng = (s) => s == null || s.avg == null ? '—' : `${formatPct(s.avg)}（${formatPct(s.min)}〜${formatPct(s.max)}）`;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: '#4F46E5', marginBottom: 4 }}>学習バックテスト（答え合わせ）</div>
      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 12 }}>直近月を「正解」として隠し、それ以前だけで学習→自動生成→実績と突合して再現度を測る研究用ビュー。<b>シフトデータへの書き込みは行いません（表示のみ）。</b></div>

      <div style={{ ...box, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, marginBottom: 4 }}>部署</div>
          <select value={deptId} onChange={e => { setDeptId(e.target.value); setTargetSel(null); setMetrics(null); setRunsData(null); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #D4D4D8', fontSize: 13 }}>
            {depts.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, marginBottom: 4 }}>対象月（正解として隠す月）</div>
          <select value={tgt ? `${tgt.y}-${tgt.m}` : ''} onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setTargetSel({ y, m }); setMetrics(null); setRunsData(null); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #D4D4D8', fontSize: 13 }}>
            {monthsAvail.length === 0 && <option value="">実績なし</option>}
            {monthsAvail.map(o => <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.y}年{o.m}月</option>)}
          </select>
        </div>
        <button onClick={run} disabled={running || !tgt} style={{ background: running || !tgt ? '#E5E7EB' : '#6366F1', color: running || !tgt ? '#9CA3AF' : '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: running || !tgt ? 'default' : 'pointer', fontSize: 13, fontWeight: 800 }}>
          {running ? `生成中… ${progress}/5` : '▶ バックテスト実行（5回生成）'}
        </button>
      </div>

      {error && <div style={{ ...box, background: '#fff0f0', border: '1px solid #ef4444', color: '#dc2626', fontSize: 12, fontWeight: 700 }}>{error}</div>}
      {notes.length > 0 && <div style={{ ...box, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 11, lineHeight: 1.7 }}>{notes.map((n, i) => <div key={i}>※ {n}</div>)}</div>}

      {metrics && <>
        {/* サマリー A/F */}
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#18181B', marginBottom: 8 }}>サマリー（5回の平均（最小〜最大））</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, fontSize: 12 }}>
            <div><b>A. セル一致率（全体）</b>：{rng(metrics.A)}</div>
            <div><b>F. 休み曜日 平均絶対差</b>：{metrics.fMeanAbsDiff == null ? '—' : (metrics.fMeanAbsDiff * 100).toFixed(1) + 'pt'}</div>
            <div style={{ color: '#64748B' }}>固定セル（希望休/有休・分母除外）：{metrics.fixedCount}</div>
          </div>
        </div>

        {/* C: シフト種別別 */}
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>C. シフト種別ごとの再現率（実績=その種別のセルを生成が当てた率）</div>
          <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>種別</th><th style={th}>再現率（平均）</th><th style={th}>最小〜最大</th></tr></thead>
            <tbody>{metrics.C.map(r => <tr key={r.type}><td style={{ ...td, fontWeight: 700 }}>{r.type}</td><td style={td}>{formatPct(r.avg)}</td><td style={td}>{formatPct(r.min)}〜{formatPct(r.max)}</td></tr>)}</tbody>
          </table></div>
        </div>

        {/* B: スタッフ別 */}
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>B. スタッフ別一致率</div>
          <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>スタッフ</th><th style={th}>一致率（平均）</th><th style={th}>最小〜最大</th></tr></thead>
            <tbody>{metrics.B.map(r => <tr key={r.id}><td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.name}</td><td style={td}>{formatPct(r.avg)}</td><td style={td}>{r.avg == null ? '—' : `${formatPct(r.min)}〜${formatPct(r.max)}`}</td></tr>)}</tbody>
          </table></div>
        </div>

        {/* D/E: 強癖・中癖 */}
        {[['D. 強癖セルの再現率（dowShiftRate≥0.5 かつ 観測≥2ヶ月）', metrics.strongRows], ['E. 中癖セルの再現率（dowShiftRate 0.3〜0.5）', metrics.midRows]].map(([title, rows]) => (
          <div style={box} key={title}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>{title}</div>
            {rows.length === 0 ? <div style={{ fontSize: 11, color: '#94A3B8' }}>該当なし</div> :
              <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={{ ...th, textAlign: 'left' }}>スタッフ</th><th style={th}>曜日</th><th style={th}>種別</th><th style={th}>学習率</th><th style={th}>Wilson下限</th><th style={th}>観測(k/n)</th><th style={th}>実績出現率</th><th style={th}>生成出現率(平均)</th></tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i}><td style={{ ...td, textAlign: 'left' }}>{r.name}</td><td style={td}>{r.dow}</td><td style={{ ...td, fontWeight: 700 }}>{r.shift}</td><td style={td}>{formatPct(r.learnRate)}</td><td style={{ ...td, fontWeight: 700, color: r.wilson != null && r.wilson >= 0.5 ? '#16a34a' : '#94A3B8' }}>{r.wilson == null ? '—' : formatPct(r.wilson)}</td><td style={td}>{r.obs}</td><td style={td}>{formatPct(r.actualRate)}</td><td style={td}>{formatPct(r.gen.avg)}</td></tr>)}</tbody>
              </table></div>}
          </div>
        ))}

        {/* G: 変化追随率（概念漂流） */}
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>G. 変化追随率（役割変更への追随：前半old→後半newに入れ替わったセル）</div>
          {!metrics.G?.available ? <div style={{ fontSize: 11, color: '#94A3B8' }}>測定不能：{metrics.G?.reason || '変化を検出できるデータがありません'}</div> :
            metrics.G.changeCells === 0 ? <div style={{ fontSize: 11, color: '#94A3B8' }}>変化セルは0件です（前半{metrics.G.olderMonths}ヶ月／後半{metrics.G.recentMonths}ヶ月で最頻種別の入れ替わりが検出されませんでした。データが少ない/変化が無いことも結果として意味があります）。</div> :
            <>
              <div style={{ background: '#F8FAFF', border: '1px solid #DBEAFE', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#1D4ED8', marginBottom: 6 }}>サマリー</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, fontSize: 12 }}>
                  <div><b>変化セル総件数</b>：{metrics.G.summary.changeCells}件（前半{metrics.G.olderMonths}／後半{metrics.G.recentMonths}ヶ月）</div>
                  <div><b>生成new率(追随)平均</b>：<span style={{ color: '#16a34a', fontWeight: 800 }}>{formatPct(metrics.G.summary.followNew)}</span></div>
                  <div><b>生成old率 平均</b>：{formatPct(metrics.G.summary.stayOld)}</div>
                  <div><b>実績new率 平均</b>：{formatPct(metrics.G.summary.actualNew)}</div>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={{ ...th, textAlign: 'left' }}>スタッフ</th><th style={th}>曜日</th><th style={th}>old</th><th style={th}>new</th><th style={th}>前半(k/n)</th><th style={th}>後半(k/n)</th><th style={th}>実績new率</th><th style={th}>生成new率(追随)</th><th style={th}>生成old率</th></tr></thead>
                <tbody>{metrics.G.rows.map((r, i) => <tr key={i}><td style={{ ...td, textAlign: 'left' }}>{r.name}</td><td style={td}>{r.dow}</td><td style={td}>{r.old}</td><td style={{ ...td, fontWeight: 700 }}>{r.new}</td><td style={td}>{r.oldObs}</td><td style={td}>{r.newObs}</td><td style={td}>{formatPct(r.actualNewRate)}</td><td style={{ ...td, fontWeight: 700, color: r.genNewRate != null && r.genOldRate != null && r.genNewRate >= r.genOldRate ? '#16a34a' : '#dc2626' }}>{formatPct(r.genNewRate)}</td><td style={td}>{formatPct(r.genOldRate)}</td></tr>)}</tbody>
              </table></div>
            </>}
        </div>

        {/* F: 休み曜日 */}
        <div style={box}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>F. 休み曜日の一致（曜日別 休み率：実績 vs 生成平均）</div>
          <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>曜日</th>{metrics.F.map(r => <th key={r.dow} style={th}>{r.dow}</th>)}</tr></thead>
            <tbody>
              <tr><td style={{ ...td, fontWeight: 700, textAlign: 'left' }}>実績</td>{metrics.F.map(r => <td key={r.dow} style={td}>{formatPct(r.actualRate)}</td>)}</tr>
              <tr><td style={{ ...td, fontWeight: 700, textAlign: 'left' }}>生成</td>{metrics.F.map(r => <td key={r.dow} style={td}>{formatPct(r.gen.avg)}</td>)}</tr>
            </tbody>
          </table></div>
        </div>

        {/* Step6: 実績 vs 生成 並列（不一致ハイライト） */}
        {runsData && <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>実績 vs 生成（不一致セルを赤表示）</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setViewRun(v => (v + runsData.runs.length - 1) % runsData.runs.length)} style={{ border: '1px solid #E4E4E7', background: '#fff', borderRadius: 6, cursor: 'pointer', padding: '2px 8px' }}>◀</button>
              <span style={{ fontSize: 12, fontWeight: 700 }}>生成 {viewRun + 1}/{runsData.runs.length}</span>
              <button onClick={() => setViewRun(v => (v + 1) % runsData.runs.length)} style={{ border: '1px solid #E4E4E7', background: '#fff', borderRadius: 6, cursor: 'pointer', padding: '2px 8px' }}>▶</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {(() => {
              const days = getDays(runsData.year, runsData.month);
              const run = runsData.runs[viewRun];
              const c = (o, sid, d) => o?.[sid]?.[d] ?? '';
              const fixed = (sid, d) => ['希望休', '有休'].includes(c(runsData.actual, sid, d));
              return <table style={{ borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}>スタッフ</th>{Array.from({ length: days }, (_, i) => <th key={i} style={th}>{i + 1}</th>)}</tr></thead>
                <tbody>{runsData.ds.map(s => <tr key={s.id}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, position: 'sticky', left: 0, background: '#fff', whiteSpace: 'nowrap' }}>{s.name}</td>
                  {Array.from({ length: days }, (_, i) => {
                    const d = i + 1; const av = c(runsData.actual, s.id, d); const gv = c(run, s.id, d);
                    const fx = fixed(s.id, d); const mism = !fx && av !== '' && av !== gv;
                    return <td key={d} style={{ ...td, padding: '2px 4px', background: fx ? '#eef2ff' : mism ? '#fee2e2' : undefined, color: mism ? '#b91c1c' : '#334155' }}>
                      <div style={{ fontSize: 9, lineHeight: 1.2 }}>{av || '・'}</div>
                      <div style={{ fontSize: 9, lineHeight: 1.2, color: mism ? '#b91c1c' : '#94A3B8' }}>{gv || '・'}</div>
                    </td>;
                  })}
                </tr>)}</tbody>
              </table>;
            })()}
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 6 }}>各セル上段=実績／下段=生成。青=入力(希望休/有休・突合対象外)、赤=不一致。</div>
        </div>}
      </>}
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
        <div style={{marginBottom:8,display:"flex",justifyContent:"center"}}><Lock size={32} strokeWidth={2} style={{color:"#6366F1"}}/></div>
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
        <button onClick={handleVerify} disabled={!filled} style={{width:"100%",background:filled?"#6366F1":"#F4F4F5",color:filled?"#fff":"#71717A",border:"none",borderRadius:9,padding:"12px 0",cursor:filled?"pointer":"not-allowed",fontSize:14,fontWeight:800,marginBottom:10,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}><Unlock size={15} strokeWidth={2}/>解錠する</button>
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
      if (dowCount >= 20) { headerRowIdx = ri; shiftStartCol = row.findIndex(c => DOW_SET.has(String(c??'').trim())); break; }
    }
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
          <button onClick={onClose} style={{background:'none',border:'none',color:'#52525B',cursor:'pointer',fontSize:20,lineHeight:1}}><X size={18} strokeWidth={2}/></button>
        </div>

        {/* Step guide */}
        <div style={{background:'#e8f5f4',border:'1px solid #D4D4D8',borderRadius:8,padding:'8px 12px',fontSize:11,color:'#1a5a57'}}>
          {lastPasteType === 'names'
            ? <span style={{color:'#16a34a',fontWeight:700}}><CheckCircle2 size={13} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5}}/>ステップ1完了: {namedOrder?.length||0}名の名前を確認しました。次に先月末を除いた <b>シフト列だけ</b>（D〜AH等）をCtrl+Cして貼り付けてください。</span>
            : lastPasteType === 'shifts'
            ? <span style={{color:'#2563eb',fontWeight:700}}><CheckCircle2 size={13} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5}}/>ステップ2完了: シフトをグリッドに反映しました。確認して「適用」してください。</span>
            : lastPasteType === 'full'
            ? <span style={{color:'#18181B'}}><CheckCircle2 size={13} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5}}/>名前＋シフトを一括読み込みしました。</span>
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
              <AlertTriangle size={12} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5}}/>未マッチ: {unmatchedNames.join('、')}
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
            <CheckCircle2 size={15} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5,color:"#fff"}}/>このシフトを適用する{totalCells>0?` (${totalCells}件)`:''}
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
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div><div style={{fontSize:15,fontWeight:900,color:"#18181B"}}>📅 休み日数 一括設定</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>{year}年{month+1}月</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}><X size={18} strokeWidth={2}/></button></div>
        <div style={{fontSize:11,color:"#3F3F46",marginBottom:20,marginTop:8,background:"#F4F4F5",borderRadius:7,padding:"8px 12px",border:"1px solid #27272A"}}>💡 施設全体の休み日数を設定します。全部署・全スタッフ（{totalStaff}名）に一括適用されます。</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:28,background:"#F4F4F5",borderRadius:12,padding:"18px 20px",border:"1px solid #D4D4D8"}}>
          <button onClick={()=>setVal(days-1)} style={{background:"#E4E4E7",border:"1px solid #1a4040",borderRadius:8,color:"#1a4040",cursor:"pointer",width:40,height:40,fontSize:22,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
          <div style={{textAlign:"center"}}>
            <div onClick={e=>setKp({value:days,min:0,max:20,unit:"日",onConfirm:v=>setVal(v===""?0:+v),anchorRect:e.currentTarget.getBoundingClientRect()})} style={{width:72,background:"#f0fffe",border:"2px solid #6366F1",borderRadius:8,color:"#6366F1",fontSize:28,fontWeight:900,textAlign:"center",padding:"6px 0",cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",justifyContent:"center",minHeight:48}}>{days}</div>
            <div style={{fontSize:12,color:"#3F3F46",marginTop:4,fontWeight:700}}>日 / 月</div>
          </div>
          <button onClick={()=>setVal(days+1)} style={{background:"#E4E4E7",border:"1px solid #1a4040",borderRadius:8,color:"#1a4040",cursor:"pointer",width:40,height:40,fontSize:22,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
        </div>
        <div style={{display:"flex",gap:10}}><button onClick={()=>onApply(days,mk)} style={{flex:1,background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14,fontWeight:800}}><CheckCircle2 size={15} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5,color:"#fff"}}/>適用する</button><button onClick={onClose} style={{flex:1,background:"#F4F4F5",color:"#52525B",border:"1px solid #D4D4D8",borderRadius:8,padding:"11px 0",cursor:"pointer",fontSize:14}}>キャンセル</button></div>
      </div>
      {kp&&<NumericKeypad mode={kp.mode} value={kp.value} min={kp.min} max={kp.max} unit={kp.unit} anchorRect={kp.anchorRect} onConfirm={v=>{kp.onConfirm(v);setKp(null);}} onClose={()=>setKp(null)}/>}
    </div>
  );
}

function DownloadModal({ depts, staffList, allShifts, year, month, activeDeptId, allEvents, session, onClose }) {
  // 初期状態: 全部署未選択
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [isSharing, setIsSharing] = useState(false);
  // INSERT成功後のみセット（全選択部署を1つのURLで共有）
  const [sharedResult, setSharedResult] = useState(null);
  const noSelection = selectedDepts.length === 0;
  const fname = `シフト表_${year}年${month+1}月`;
  const toggleDept = (id) => {
    setSelectedDepts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSharedResult(null);
  };
  const doDownload = (ext) => { if(noSelection)return; let content="",type=""; if(ext==="csv"){content=buildCSV(depts,staffList,allShifts,year,month,selectedDepts);type="text/csv;charset=utf-8";} if(ext==="html"){content=buildPrintHTML(depts,staffList,allShifts,year,month,selectedDepts,allEvents);type="text/html;charset=utf-8";} triggerDownload(content,`${fname}.${ext}`,type); };
  const doPrint = () => { if(noSelection)return; const html=buildPrintHTML(depts,staffList,allShifts,year,month,selectedDepts,allEvents); printWithIframe(html); onClose(); };

  // 共有ボタン押下: 選択中の全部署を1つのINSERTで保存し、共通URLを発行
  const doShare = async () => {
    if (noSelection) return;
    setIsSharing(true);
    try {
      // STEP2: 押下時点のスナップショットをメモリ上で作成
      const token = genToken();
      const selectedDeptObjs = depts.filter(d => selectedDepts.includes(d.id));

      // 全選択部署の shift_data をまとめる
      const shift_data = {};
      selectedDepts.forEach(deptId => {
        shift_data[deptId] = JSON.parse(JSON.stringify(allShifts[deptId] || {}));
      });

      const staff_data = staffList
        .filter(s => selectedDepts.includes(s.dept))
        .map(s => ({ id: s.id, name: s.name, dept: s.dept }));

      const dept_data = selectedDeptObjs.map(d => ({ id: d.id, label: d.label }));

      // STEP3: shared_shifts へ INSERT（全部署を1レコードで保存）
      const { error } = await supabase.from('shared_shifts').insert({
        token,
        admin_user_id: session.user.id,
        year,
        month: month + 1,
        dept_ids: selectedDepts,
        shift_data,
        staff_data,
        dept_data,
        schema_version: 1,
      });
      if (error) throw error;

      // STEP4: INSERT成功後のみ shareToken 確定・QR/LINE/URLを有効化
      const shareUrl = `${window.location.origin}/?share=${token}`;
      setSharedResult({ token, shareUrl });
    } catch(e) {
      // INSERT失敗: URL・QR・LINEは発行しない
      alert('共有データの保存に失敗しました。再度お試しください。\n' + (e?.message || e));
    } finally {
      setIsSharing(false);
    }
  };

  const doLine = () => {
    if (!sharedResult) return;
    const label = selectedDepts.length === 1
      ? (depts.find(d => d.id === selectedDepts[0])?.label || '')
      : `${selectedDepts.length}部署`;
    const msg = `${label}\n${year}年${month+1}月 確定シフト\n\nこちらをタップしてください。\n${sharedResult.shareUrl}`;
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(msg)}`, '_blank');
  };

  const doCopy = async () => {
    if (!sharedResult) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(sharedResult.shareUrl).then(() => alert('URLをコピーしました！')).catch(() => alert(`URLをコピーしてください:\n${sharedResult.shareUrl}`));
    } else {
      alert(`URLをコピーしてください:\n${sharedResult.shareUrl}`);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:400,boxShadow:"0 30px 80px #000",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div><div style={{fontSize:15,fontWeight:900,color:"#18181B",display:"flex",alignItems:"center",gap:6}}><Upload size={16} strokeWidth={2}/>書き出し</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>{year}年{month+1}月</div></div><button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}><X size={18} strokeWidth={2}/></button></div>
        <div style={{fontSize:11,color:"#52525B",fontWeight:700,marginBottom:7}}>対象部署</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
          {depts.map(d=>{const sel=selectedDepts.includes(d.id);return<button key={d.id} onClick={()=>toggleDept(d.id)} style={{background:sel?"#4F46E5":"#fff",color:sel?"#fff":"#52525B",border:`1.5px solid ${sel?"#4F46E5":"#D4D4D8"}`,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:sel?700:400,letterSpacing:"0.01em",transition:"background 0.12s,color 0.12s,border-color 0.12s"}}>{d.label}</button>;})}
        </div>
        <div style={{fontSize:11,marginBottom:12,minHeight:18,color:noSelection?"#A1A1AA":"#4F46E5",fontWeight:noSelection?400:500}}>
          {noSelection ? "共有する部署を選択してください" : `共有対象（${selectedDepts.length}部署）: ${depts.filter(d=>selectedDepts.includes(d.id)).map(d=>d.label).join(' · ')}`}
        </div>
        <button onClick={doPrint} disabled={noSelection} style={{width:"100%",background:noSelection?"#F4F4F5":"#6366F1",border:"none",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1,marginBottom:8}}><Printer size={24} strokeWidth={2} style={{color:"#fff",flexShrink:0}}/><div><div style={{fontSize:13,fontWeight:800,color:"#fff"}}>今すぐ印刷</div><div style={{fontSize:11,color:"#d5f5f5",marginTop:2}}>印刷ダイアログがすぐに開きます</div></div></button>
        <button onClick={()=>doDownload("csv")} disabled={noSelection} style={{width:"100%",background:noSelection?"#F4F4F5":"#e8f5ee",border:"1px solid #2d8a52",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1,marginBottom:8}}><FileSpreadsheet size={24} strokeWidth={2} style={{color:"#34d399",flexShrink:0}}/><div><div style={{fontSize:13,fontWeight:800,color:"#34d399"}}>CSV（Excel・スプレッドシート）</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>Excel・Googleスプレッドシートで開けます</div></div></button>
        <button onClick={()=>doDownload("html")} disabled={noSelection} style={{width:"100%",background:noSelection?"#F4F4F5":"#F4F4F5",border:"1px solid #A1A1AA",borderRadius:10,padding:"13px 16px",cursor:noSelection?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left",opacity:noSelection?0.4:1,marginBottom:8}}><FileCode size={24} strokeWidth={2} style={{color:"#6366F1",flexShrink:0}}/><div><div style={{fontSize:13,fontWeight:800,color:"#6366F1"}}>HTMLで保存（USB用）</div><div style={{fontSize:11,color:"#52525B",marginTop:2}}>他のPCやUSBで印刷する場合に使用</div></div></button>

        {/* ── 共有セクション ── */}
        <div style={{marginTop:16,paddingTop:16,borderTop:"2px solid #E4E4E7"}}>
          <div style={{fontSize:13,fontWeight:900,color:"#18181B",marginBottom:4,display:"flex",alignItems:"center",gap:6}}><Share2 size={14} strokeWidth={2}/>共有</div>
          <div style={{fontSize:11,color:"#52525B",marginBottom:12}}>
            選択中の部署をまとめて1つのURLで共有します。スタッフは全部署のシフトを1画面で確認できます。
          </div>
          {session && (
            <div style={{background:"#fff",border:"1px solid #D4D4D8",borderRadius:10,padding:"12px 14px"}}>
              {!sharedResult ? (
                /* INSERT前: 共有リンク発行ボタン */
                <button onClick={doShare} disabled={isSharing||noSelection} style={{width:"100%",background:noSelection?"#F4F4F5":isSharing?"#A5B4FC":"#6366F1",color:noSelection?"#A1A1AA":"#fff",border:noSelection?"1px solid #E4E4E7":"none",borderRadius:8,padding:"11px 0",cursor:(isSharing||noSelection)?"not-allowed":"pointer",fontSize:13,fontWeight:800,transition:"all 0.15s"}}>
                  {isSharing ? "保存中..." : noSelection ? "共有する部署を選択してください" : "🔗 共有リンクを発行"}
                </button>
              ) : (
                /* INSERT成功後: QR + LINE + URLコピー + 再発行 */
                <>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
                    <div style={{padding:6,background:"#fff",border:"2px solid #D4D4D8",borderRadius:8,display:"inline-block"}}>
                      <QRCodeSVG value={sharedResult.shareUrl} size={120} bgColor="#ffffff" fgColor="#18181B" level="L" includeMargin={false}/>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <button onClick={doLine} style={{background:"linear-gradient(135deg,#06C755,#00a040)",color:"#fff",border:"none",borderRadius:8,padding:"8px 0",cursor:"pointer",fontSize:12,fontWeight:800,flex:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}><MessageCircle size={14} strokeWidth={2}/>LINEで送る</button>
                    <button onClick={doCopy} style={{background:"#eff6ff",color:"#2563EB",border:"1px solid #93c5fd",borderRadius:8,padding:"8px 0",cursor:"pointer",fontSize:12,fontWeight:800,flex:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}><Copy size={14} strokeWidth={2}/>URLコピー</button>
                  </div>
                  <button onClick={doShare} disabled={isSharing} style={{width:"100%",background:"#F4F4F5",color:"#52525B",border:"1px solid #E4E4E7",borderRadius:8,padding:"7px 0",cursor:isSharing?"not-allowed":"pointer",fontSize:11}}>
                    {isSharing ? "保存中..." : "↩ 再発行（シフト変更後）"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
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
      { title: "YEIXで作成するほど精度UP", body: "YEIXでシフトを作成・保存するたびに自動で学習が進みます。学習データはサーバーに蓄積され、次回の生成精度に活用されます。" },
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
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",cursor:"pointer",fontSize:18,width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}><X size={18} strokeWidth={2}/></button>
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
              <div style={{fontWeight:800,color:"#FB8C00",marginBottom:3}}><AlertTriangle size={13} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5,color:"#FB8C00"}}/>注意</div>
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
  // 時間帯系（必須運営時間の未カバー・時間帯別不足）警告は TIME_FEATURES_ENABLED=false のとき非表示（凍結）。
  const hasTimeline = TIME_FEATURES_ENABLED && timelineWarnings && timelineWarnings.length > 0;
  const hasCoverage = TIME_FEATURES_ENABLED && coverageWarnings && coverageWarnings.length > 0;
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff5f5",border:"1px solid #7f1d1d",borderRadius:14,padding:28,width:"100%",maxWidth:440,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:10}}><div style={{width:44,height:44,borderRadius:10,flexShrink:0,background:"#fff0f0",border:"1px solid #ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}><AlertTriangle size={24} strokeWidth={2} style={{color:"#ef4444"}}/></div><div><div style={{fontSize:15,fontWeight:900,color:"#fca5a5",marginBottom:4}}>自動生成の警告</div><div style={{fontSize:12,color:"#52525B"}}>{deptLabel} ／ {year}年{month+1}月</div></div></div>
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
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#888",lineHeight:1}}><X size={18} strokeWidth={2}/></button>
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

function ShiftTable({ staffList, shifts, dept, year, month, onLeftClick, onRightClick, events, onEventEdit, confirmed, warnings }) {
  const days = getDays(year, month);
  const ds = staffList.filter(s=>s.dept===dept.id);
  const mk = monthKey(year, month);
  const [warnPop, setWarnPop] = useState(null); // 生成警告の根拠ポップオーバー {reason,x,y}
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
    {warnPop && (<><div onClick={()=>setWarnPop(null)} style={{position:"fixed",inset:0,zIndex:399}}/>
      <div style={{position:"fixed",left:Math.min(warnPop.x,(typeof window!=="undefined"?window.innerWidth:400)-250),top:warnPop.y+10,zIndex:400,maxWidth:240,background:"#18181B",color:"#fff",borderRadius:8,padding:"8px 12px",fontSize:11,lineHeight:1.6,boxShadow:"0 8px 24px rgba(0,0,0,0.3)"}} onClick={()=>setWarnPop(null)}>{warnPop.reason}</div></>)}
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
            const workCnt=Object.values(sShifts).reduce((a,v)=>a+workDayValue(v,deptWork),0);
            const nightCnt=Object.values(sShifts).filter(v=>v==="夜勤").length;
            const restCnt=Object.values(sShifts).reduce((acc,v)=>(deptRest.has(v)||HALF_PAIDREST_TYPES.has(v))&&v!=="明け"&&v!=="有休"?acc+((HALF_REST_TYPES.has(v)||HALF_PAIDREST_TYPES.has(v))?0.5:1):acc,0);
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
                  const type=sShifts[d]||"";
                  // 希望勤務(shiftRequestsByMonth)は希望休/有休と同じくstaffList側に残る。全体クリアで
                  // deptShiftsが空になっても、値をオーバーレイ表示して勤務が消えないようにする（不整合(b)解消）。
                  const fixedVal=s.shiftRequestsByMonth?.[mk]?.[d];
                  const isFixed=!!fixedVal;
                  const dispType=type||fixedVal||"";
                  const isKibo=kibodays.includes(d)&&!dispType, isYukyu=yukyudays.includes(d)&&!dispType&&!isKibo, consecViol=isConsecViolation(sShifts,d);
                  const cellKey=`${s.id}|${d}`, isSelected=selectedCells.has(cellKey);
                  const _ra=dept.roleShiftTypes?.[s.role]; const isRoleViol=_ra&&dispType&&deptWork.has(dispType)&&dispType!=="明け"&&!_ra.includes(dispType);
                  const cdow=new Date(year,month,d).getDay(); const cellWeekBg=cdow===0?"#FFF5F5":cdow===6?"#F5F5FF":undefined;
                  // 青枠は下書き中(confirmed=false)のみ。確定後はデータ(shiftRequestsByMonth)は残し装飾だけ消す。
                  const showFix=isFixed&&!confirmed;
                  // 確定中のみ希望休を「休」表示（ブラウザ印刷用・表示のみ）。データ/学習/公休カウントは不変。編集に戻すと自動で「希」へ。
                  const kiboAsRest=confirmed&&isKibo;
                  const dispShown=(confirmed&&dispType==="希望休")?"休み":dispType;
                  const warn=warnings?warnings[`${s.id}:${d}`]:null;
                  const warnBg=warn?(warn.level===1?"#fee2e2":"#fef9c3"):undefined;
                  const warnOutline=warn?(warn.level===1?"2px dashed #ef4444":"1px dashed #f59e0b"):undefined;
                  return <td key={d} title={warn?warn.reason:undefined} style={{position:"relative",padding:"2px 1px",textAlign:"center",borderRight:"1px solid #F1F5F9",borderBottom:"1px solid #F1F5F9",background:isSelected?"#bfdbfe":isRoleViol?"#fecaca":consecViol?"#ffe8e8":warnBg||(isKibo?"#fff5f5":isYukyu?"#faf0ff":showFix?"#f5f3ff":cellWeekBg),cursor:"pointer",outline:isSelected?"2px solid #3b82f6":isRoleViol?"2px solid #ef4444":showFix?"2px solid #a78bfa":warnOutline||(consecViol?"1px solid #e0707060":undefined),outlineOffset:isSelected||isRoleViol||showFix||warn?"-2px":undefined}} onMouseDown={(e)=>{if(e.button!==0)return;e.preventDefault();handleCellMouseDown(si,d,e);}} onMouseEnter={()=>handleCellMouseEnter(si,d)} onContextMenu={(e)=>{e.preventDefault();if(isSelected&&selectedCells.size>1){onRightClick(s.id,d,e,selectedCells);}else{setSelAnchor(null);setSelCur(null);onRightClick(s.id,d,e,null);}}} onTouchStart={(e)=>handleCellTouchStart(si,d,e)} onTouchEnd={(e)=>handleCellTouchEnd(si,d,e)}>{isKibo?(kiboAsRest?<ShiftBadge type="休み" defs={dept.customShiftDefs}/>:<span style={{fontSize:9,color:"#BE123C"}}>希</span>):isYukyu?<span style={{fontSize:9,color:"#9b4db5"}}>有</span>:<ShiftBadge type={dispShown} defs={dept.customShiftDefs}/>}{isRoleViol&&<span style={{fontSize:7,color:"#991b1b",display:"block",lineHeight:1}}>制限!</span>}{!isRoleViol&&consecViol&&<span style={{fontSize:7,color:"#c44b4b",display:"block",lineHeight:1}}>連超</span>}{warn&&<span onClick={(e)=>{e.stopPropagation();setWarnPop({reason:warn.reason,x:e.clientX,y:e.clientY});}} title={warn.reason} style={{position:"absolute",top:0,right:1,fontSize:8,fontWeight:900,lineHeight:1,color:warn.level===1?"#dc2626":"#b45309",cursor:"pointer"}}>{warn.level===1?"⚠":"!"}</span>}</td>;
                })}
                {rightCols.map(col=>{
                  const cnt=typeCnts[col]??0;
                  let color,val;
                  if(col==="計"){val=cnt;color=cnt<(s.targetWork-2)?"#F59E0B":cnt>(s.targetWork+2)?"#EF4444":"#6366F1";}
                  else if(col==="夜勤"){val=cnt||"－";color=nightOver?"#EF4444":"#334155";}
                  else if(col==="明け"){val=cnt||"－";color="#475569";}
                  else if(col==="休"){
                    val=cnt;
                    const kyukoTarget=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;
                    const kyukoDiff=cnt-kyukoTarget;
                    color=kyukoDiff>0?"#b91c1c":kyukoDiff<0?"#92400e":"#52525B";
                    const kyukoBg=kyukoDiff>0?"#fee2e2":kyukoDiff<0?"#fef9c3":undefined;
                    const kyukoTip=kyukoDiff!==0?`目標${kyukoTarget}日 / 実績${cnt}日`:undefined;
                    return <td key={col} style={{...TD,background:kyukoBg}} title={kyukoTip}><span style={{color,fontWeight:700,fontSize:11}}>{val}</span></td>;
                  }
                  else if(col==="希"){val=cnt||"－";color="#BE123C";}
                  else{const mx=dept.shiftMaxByType?.[col]||0;const over=mx>0&&cnt>mx;val=cnt||"－";const sd=getShiftDef(col,dept.customShiftDefs,dept);color=over?"#ef4444":(sd.color||"#71717A");}
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

function StaffList({ locked, staffList, dept, year, month, onEdit:pEdit, onDelete:pDelete, onAdd:pAdd, onReorder:pReorder }) {
  // ロック中は編集系を無効化（二重防御・親側の関数ガードと併せて閲覧のみにする）
  const onEdit=locked?()=>{}:pEdit, onDelete=locked?()=>{}:pDelete, onAdd=locked?()=>{}:pAdd, onReorder=locked?null:pReorder;
  const ds = staffList.filter(s=>s.dept===dept.id);
  return (
    <div style={{maxWidth:680}}>
      {locked&&<div style={{background:"#F3F4F6",border:"1px solid #E5E7EB",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#6B7280",display:"flex",alignItems:"center",gap:6}}><Lock size={13} strokeWidth={2}/>ロック中は閲覧のみです。編集するには解錠してください。</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:"#6366F1",fontWeight:800}}>{dept.label} — {ds.length}名</div>
        <button onClick={onAdd} style={{background:"linear-gradient(135deg,#6366F1,#7C3AED)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:800}}>＋ 追加</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {ds.map((s,i)=>{const mk=monthKey(year,month),kibo=(s.kiboByMonth?.[mk]||[]).length,yukyu=(s.yukyuByMonth?.[mk]||[]).length;return(<div key={s.id} style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:"50%",flexShrink:0,background:`hsl(${(i*53+180)%360},50%,78%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#3F3F46",fontWeight:800}}>{s.name.charAt(0)}</div><div><div style={{fontWeight:800,fontSize:13,color:"#18181B"}}>{s.name}</div><div style={{fontSize:10,color:"#3F3F46",display:"flex",gap:8,flexWrap:"wrap"}}><span>{s.role}</span><span>目標{s.targetWork}日</span><span>休み{s.kyukoDaysByMonth?.[monthKey(year,month)]??s.kyukoDays??8}日</span>{s.nightOk&&<span style={{color:"#c45c35"}}>🌙夜勤×{s.nightMax}回</span>}{kibo>0&&<span style={{color:"#dc2626"}}>希望休{kibo}日</span>}{yukyu>0&&<span style={{color:"#9b4db5"}}>有休{yukyu}日</span>}{s.paidLeaveBalance!=null&&<span style={{color:s.paidLeaveBalance<0?"#dc2626":"#9b4db5",fontWeight:s.paidLeaveBalance<0?800:400}}>有給残{s.paidLeaveBalance}日</span>}</div></div></div><div style={{display:"flex",gap:6,alignItems:"center"}}><div style={{display:"flex",flexDirection:"column",gap:2,marginRight:2}}><button onClick={()=>onReorder&&onReorder(s.id,'up')} disabled={i===0} title="上へ" style={{background:i===0?"#F4F4F5":"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:5,color:i===0?"#D4D4D8":"#6B7280",cursor:i===0?"default":"pointer",fontSize:9,lineHeight:1,padding:"3px 6px"}}>▲</button><button onClick={()=>onReorder&&onReorder(s.id,'down')} disabled={i===ds.length-1} title="下へ" style={{background:i===ds.length-1?"#F4F4F5":"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:5,color:i===ds.length-1?"#D4D4D8":"#6B7280",cursor:i===ds.length-1?"default":"pointer",fontSize:9,lineHeight:1,padding:"3px 6px"}}>▼</button></div><button onClick={()=>onEdit(s)} style={ICON_BTN("#6366F1")}>✏️</button><button onClick={()=>onDelete(s.id)} style={ICON_BTN("#ef4444")}>🗑</button></div></div>);})}
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
// 予定表の勤務種別表示順。半日シフトは HALF_ALL_TYPES から一元的に取り込む
// （半日休4種＋半日有給4種＋有/休）。今後の半日シフト追加も予定表に自動反映される。
const YOTEI_SHIFT_ORDER = ["明け","早番","日勤","遅番","夜勤", ...HALF_ALL_TYPES];
const YOTEI_SHIFT_COLORS = { 明け:"#9e8d80", 早番:"#c45c35", 日勤:"#3b6eea", 遅番:"#8b5cc4", 夜勤:"#2a7a9a", "日/休":"#3b6eea", "休/日":"#3a9659", "早/休":"#c45c35", "休/遅":"#8b5cc4" };

function buildYoteiHTML(dept, staffList, shifts, year, month, yoteiDeptData, floorSettings) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  const mk = monthKey(year, month);
  // シフト表と同じく希望勤務オーバーレイを重ねてセル値を決める（生セルが空でも希望勤務を表示）。
  const effShift = (s, d) => effectiveCellShift(shifts[s.id]?.[d]||"", s.shiftRequestsByMonth?.[mk]?.[d]);
  const WD_NAMES = ["日","月","火","水","木","金","土"];
  const getDayGroups = (d) => {
    const assign = (yoteiDeptData || {})[String(d)] || {};
    return YOTEI_SHIFT_ORDER.map(st => ({
      st, color: YOTEI_SHIFT_COLORS[st]||SHIFTS[st]?.color||'#333',
      staff: ds.filter(s=>effShift(s,d)===st).map(s=>({ name:s.name, assignment:assign[s.id]||"" }))
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

function autoAssignDay(d, dept, staffList, shifts, rules, floorSettings, mk) {
  const ds = staffList.filter(s => s.dept === dept.id);
  const effShift = (s) => effectiveCellShift(shifts[s.id]?.[d]||"", mk ? s.shiftRequestsByMonth?.[mk]?.[d] : undefined);
  const assign = {};
  YOTEI_SHIFT_ORDER.forEach(shiftType => {
    const rule = (rules||[]).find(r => r.shiftType === shiftType);
    if (!rule || !rule.assignment) return;
    const staff = ds.filter(s => effShift(s) === shiftType);
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
  const mk = monthKey(year, month);
  const effShift = (s) => effectiveCellShift(shifts[s.id]?.[day]||"", s.shiftRequestsByMonth?.[mk]?.[day]);
  const workingGroups = YOTEI_SHIFT_ORDER.map(st=>({ st, staff:ds.filter(s=>effShift(s)===st) })).filter(g=>g.staff.length>0);
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
  const mk = monthKey(year, month);
  // シフト表と同じ希望勤務オーバーレイでセル値を決める（生セルが空でも希望勤務を反映）。
  const effShift = (s, d) => effectiveCellShift(shifts[s.id]?.[d]||"", s.shiftRequestsByMonth?.[mk]?.[d]);
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
      const auto = autoAssignDay(d,dept,staffList,shifts,rules,floorSettings,mk);
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
        <span style={{fontSize:12,fontWeight:800,color:"#6366F1",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}><Home size={13} strokeWidth={2}/>フロア</span>
        {(floorSettings.duties||[]).map((d,i)=><span key={i} style={{background:"#F4F4F5",borderRadius:6,padding:"3px 9px",fontSize:11,color:"#18181B",fontWeight:700}}>{d.name}</span>)}
        <button onClick={()=>setSettingsOpen(true)} style={{background:"#6366F1",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}><Settings size={13} strokeWidth={2}/>設定</button>
        <button onClick={handleAutoAssign} style={{background:"linear-gradient(135deg,#f5b942,#e07b30)",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}><Zap size={13} strokeWidth={2}/>自動配置</button>
        <button onClick={handleClearAssign} style={{background:"#fff0f0",color:"#c44b4b",border:"1px solid #e07070",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}><Trash2 size={13} strokeWidth={2}/>配置クリア</button>
        <button onClick={handlePrint} style={{marginLeft:"auto",background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:800,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}><Printer size={13} strokeWidth={2}/>印刷</button>
        <button onClick={handleDownloadYotei} style={{background:"#ffffff",color:"#6366F1",border:"1px solid #D4D4D8",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:5}}><Download size={13} strokeWidth={2}/>USB保存</button>
      </div>
      {/* 月カレンダー */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:7}}>
        {Array.from({length:days},(_,i)=>i+1).map(d=>{
          const wd=getWD(year,month,d), we=isWE(year,month,d);
          const assign=getDayAssignments(d);
          const assignedCnt=Object.keys(assign).filter(k=>k!=="_memo"&&assign[k]).length;
          const memo=assign["_memo"]||"";
          const workCount=YOTEI_SHIFT_ORDER.reduce((acc,st)=>acc+ds.filter(s=>effShift(s,d)===st).length,0);
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
                const group=ds.filter(s=>effShift(s,d)===st);
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
function StaffKiboCalendar({ year, month, myDays, otherCounts, kiboLimit, onChange, type = 'kibo', disabledDays = [], dayLimit = 0 }) {
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
  // 1人あたりの希望休 上限日数（0=無制限）。希望休のみ対象・有休は常に無制限。
  const dayLim = (!isYukyu && dayLimit > 0) ? dayLimit : 0;
  const atDayLimit = dayLim > 0 && myDays.length >= dayLim;

  const toggle = (d) => {
    if (!d) return;
    if (disabledDays.includes(d)) return;
    if (!isYukyu) {
      const cnt = otherCounts?.[d] || 0;
      if (!myDays.includes(d) && cnt >= lim) return;
      // 上限日数に達していたら、未選択日はハードに止める（選択解除は可）
      if (!myDays.includes(d) && atDayLimit) return;
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
          const blocked = isDisabled || (!isMe && over) || (!isMe && atDayLimit);
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
          depts: [{ id: c.d.id, label: c.d.label, kiboLimit: c.d.kb || 3, kiboDayLimit: c.d.kd || 0, deadline: c.d.dl || null, targetYear: c.d.ty || null, targetMonth: c.d.tm || null }],
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
  const dayLim = selDept?.kiboDayLimit || 0; // 1人あたりの希望休 上限日数（0=無制限）
  const overDayLimit = dayLim > 0 && myDays.length > dayLim; // 上限超過（既存データが超えている場合など）

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
      // 1人あたりの上限日数チェック（保存直前の保険・0=無制限）
      if (dayLim > 0 && myDays.length > dayLim) {
        alert(`希望休は${dayLim}日までです。現在${myDays.length}日選択されています。${myDays.length - dayLim}日減らしてください。`);
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
        <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><AlertTriangle size={40} strokeWidth={2} style={{color:"#ef4444"}}/></div>
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
            <div style={{fontSize:13,fontWeight:900,color:"#18181B"}}>{config.facility_name || "YEIX"}</div>
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
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 固定部署の場合は部署名をヘッダーに表示 */}
      {fixedDeptId && selDept && (
        <div style={{background:"#6366F1",borderRadius:12,padding:"10px 16px",marginBottom:12,textAlign:"center"}}>
          <span style={{color:"#fff",fontWeight:900,fontSize:14}}>{selDept.label}</span>
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
          <div style={{marginBottom:6,display:"flex",justifyContent:"center"}}><Lock size={28} strokeWidth={2} style={{color:"#ef4444"}}/></div>
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
            <div style={{fontSize:10,color:"#c44b4b",marginBottom:4}}>※ 同じ日は上限{lim}名まで。上限に達した日は選択できません。</div>
            {dayLim > 0 && (
              <div style={{fontSize:10,color:"#2563EB",marginBottom:10,fontWeight:700}}>※ 希望休は1人{dayLim}日まで（残り {Math.max(0, dayLim - myDays.length)}日）</div>
            )}
            {overDayLimit && (
              <div style={{fontSize:11,color:"#b45309",background:"#fff8e1",border:"1px solid #f59e0b",borderRadius:8,padding:"6px 10px",marginBottom:10,fontWeight:700}}><AlertTriangle size={12} strokeWidth={2} style={{verticalAlign:"middle",marginRight:5,color:"#b45309"}}/>現在{myDays.length}日で上限{dayLim}日を超えています。{myDays.length - dayLim}日減らしてから送信してください。</div>
            )}
            {kiboLoading ? (
              <div style={{textAlign:"center",color:"#71717A",padding:20}}>読み込み中…</div>
            ) : (
              <StaffKiboCalendar year={year} month={month} myDays={myDays} otherCounts={otherCounts} kiboLimit={lim} onChange={setMyDays} type="kibo" disabledDays={myYukyuDays} dayLimit={dayLim}/>
            )}
            <div style={{marginTop:10,fontSize:12,color:"#ef4444",fontWeight:700}}>選択中: {myDays.length}日{dayLim > 0 ? ` ／ 上限${dayLim}日` : ""}</div>
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
          <div style={{marginBottom:8,display:"flex",justifyContent:"center"}}><CheckCircle2 size={36} strokeWidth={2} style={{color:"#16a34a"}}/></div>
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
          <div style={{marginBottom:8,display:"flex",justifyContent:"center"}}><AlertTriangle size={32} strokeWidth={2} style={{color:"#ef4444"}}/></div>
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

// 最小変更フェーズが「公休(休み+希望休)を目標から遠ざける巻き戻し」を却下するガード。
// 生成エンジンが揃えた公休を、前回結果への巻き戻しで崩さないための保険。false で従来動作へ即復帰。
const MINCHANGE_KYUKO_GUARD = true;
// 巻き戻し後に公休が崩れ、かつ巻き戻し前は一致していた場合、巻き戻し前(公休正解)へ戻すフォールバック。
// 全部署対象（従来 eiyo のみ repairHardConstraints で救済していたのを介護等にも拡張）。false で無効。
const KYUKO_FALLBACK_ALL_DEPT = true;
const MINCHANGE_KYUKO_REST = new Set(['休み', '希望休']);

export function applyMinimalChangePhase1(result, genSnapshot, ds, cd, year, month) {
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
  // 公休ガード用: スタッフ別の公休目標と現在の公休(休み+希望休)数。
  const _mk = monthKey(year, month);
  const _staffById = {};
  ds.forEach(s => { _staffById[s.id] = s; });
  const _kyukoTarget = (s) => s?.kyukoDaysByMonth?.[_mk] ?? s?.kyukoDays ?? 8;
  const _restCountOf = (sid) => {
    let c = 0;
    for (const v of Object.values(result[sid] || {})) if (MINCHANGE_KYUKO_REST.has(v)) c++;
    return c;
  };
  const bad = (prev, curr) => {
    if (!prev || !curr) return false;
    if (cd.intervalEnabled && cd.intervalTargetShifts?.includes(curr)) {
      return shiftIntervalHours(prev, curr, cd) < (cd.intervalHours ?? 11);
    }
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
    // guard⓪(公休): 巻き戻しが対象スタッフの公休(休み+希望休)を目標から遠ざけるなら却下。
    if (MINCHANGE_KYUKO_GUARD) {
      const curV = result[sid]?.[day] ?? '';
      const revV = revVal ?? '';
      const wasRest = MINCHANGE_KYUKO_REST.has(curV);
      const willRest = MINCHANGE_KYUKO_REST.has(revV);
      if (wasRest !== willRest) {
        const s = _staffById[sid];
        const tgt = _kyukoTarget(s);
        const cur = _restCountOf(sid);
        const next = cur + (willRest ? 1 : -1);
        if (Math.abs(next - tgt) > Math.abs(cur - tgt)) continue; // 公休が目標から遠ざかる巻き戻しは行わない
      }
    }
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

// ── 共有シフト表示コンポーネント（shared_shifts 専用・他テーブル参照なし）──
function SharedShiftView({ token }) {
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('shared_shifts')
        .select('year,month,dept_ids,shift_data,staff_data,dept_data')
        .eq('token', token)
        .maybeSingle();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setRow(data);
      setLoading(false);
    })();
  }, []); // eslint-disable-line

  // データロード後: テーブル実幅に合わせた viewport を設定
  // width=<テーブル幅> にすることで:
  //   ① ブラウザが自動的に全体を画面に収めてスケールダウン（俯瞰表示）
  //   ② 背景色(html/body)がテーブル幅まで伸びるため背景の途切れが解消
  //   ③ ユーザーはそこから自由にピンチズーム可能（user-scalable=yes）
  // アンマウント時に管理画面用の viewport に復元
  useEffect(() => {
    if (!row) return;
    const days = getDays(row.year, row.month - 1);
    const NAME_W = 76, CELL_W = 34, SUM_W = 32, MARGIN = 24;
    const tableWidth = NAME_W + CELL_W * days + SUM_W * 3 + MARGIN;

    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta ? meta.getAttribute('content') : null;
    if (meta) {
      meta.setAttribute('content',
        `width=${tableWidth}, initial-scale=1.0, minimum-scale=0.5, maximum-scale=5.0, user-scalable=yes`
      );
    }
    return () => {
      if (meta && original) meta.setAttribute('content', original);
    };
  }, [row]);

  if (loading) return <div style={{padding:48,textAlign:'center',color:'#52525B',fontSize:14}}>📋 シフト表を読み込み中...</div>;
  if (notFound || !row) return (
    <div style={{padding:48,textAlign:'center'}}>
      <div style={{fontSize:32,marginBottom:12}}>🔗</div>
      <div style={{color:'#c44b4b',fontWeight:700,fontSize:15,marginBottom:8}}>共有リンクが無効です</div>
      <div style={{color:'#52525B',fontSize:12}}>URLを確認するか、管理者に再発行を依頼してください。</div>
    </div>
  );

  const { year, month, dept_ids, shift_data, staff_data, dept_data } = row;
  const days = getDays(year, month - 1);
  const WD = ['日','月','火','水','木','金','土'];
  const REST_SET = new Set(['休み','希望休','有休']);

  // 共有画面のみ適用するセル変換（管理データは変更しない）
  // ・希望休・希 → 休
  // ・半勤務（日/休, 休/日, 早/休, 休/遅）→ スラッシュ付きそのまま表示（例: 日/休）
  // ・それ以外は SHIFTS の short を使用（早番→早, 日勤→日 など）
  // セル幅は「日/休」3文字が1行で収まる幅を全セル共通で使用
  const cellText = (v) => {
    if (!v) return '－';
    if (v === '希望休' || v === '希') return '休';
    if (HALF_REST_TYPES.has(v)) return v; // 日/休,休/日,早/休,休/遅 → スラッシュ付き（有/休 は short「有休」で表示）
    return SHIFTS[v]?.short || v.slice(0, 1) || '－';
  };

  const CELL_W = 34; // 「日/休」3文字が余裕を持って収まる幅（全勤務セル共通）
  const NAME_W = 76;
  const SUM_W = 32;
  const ROW_H = 36; // 全行の固定高さ（2行分: 11px * 1.4 * 2 + padding）
  const th = { border:'1px solid #ccc', padding:'3px 1px', textAlign:'center', fontSize:11, background:'#e8f0fe', fontWeight:'bold', width:CELL_W, maxWidth:CELL_W, overflow:'hidden', boxSizing:'border-box', lineHeight:'1.2' };
  const td = { border:'1px solid #ccc', padding:'3px 1px', textAlign:'center', fontSize:11, width:CELL_W, maxWidth:CELL_W, overflow:'hidden', boxSizing:'border-box', height:ROW_H };
  // 氏名セル: 全行で2行分の固定高さ。短い名前も長い名前も高さは揃える
  const nameTdStyle = { ...td, textAlign:'left', width:NAME_W, maxWidth:NAME_W, padding:'3px 4px', verticalAlign:'middle' };
  const nameInnerStyle = { fontWeight:'bold', fontSize:11, lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', wordBreak:'break-all' };

  return (
    // position:fixed の背景レイヤーでスクロール位置・viewport変更に関係なく全画面を覆う
    // iOS Safari ではスクロール時に body/html 背景が白く見えるケースがあるため
    // fixed レイヤー(z-index:-1) + コンテンツ(z-index:0) の2層構成で確実に背景統一
    <>
    <div style={{position:'fixed',inset:0,background:'#f0fbfa',zIndex:-1}} />
    <div style={{fontFamily:"'Noto Sans JP',sans-serif",margin:0,padding:'12px 8px',color:'#111',position:'relative',zIndex:0}}>
      {dept_ids.map(deptId => {
        const dept = (dept_data || []).find(d => d.id === deptId) || { id: deptId, label: deptId };
        const deptStaff = (staff_data || []).filter(s => s.dept === deptId);
        const deptShifts = (shift_data || {})[deptId] || {};
        return (
          <div key={deptId} style={{marginBottom:32}}>
            <div style={{margin:'0 0 12px',borderBottom:'2px solid #6366F1',paddingBottom:8}}>
              <div style={{fontSize:16,fontWeight:900,color:'#18181B',lineHeight:1.2}}>{dept.label}</div>
              <div style={{fontSize:11,color:'#52525B',marginTop:3,fontWeight:500}}>{year}年{month}月 シフト表</div>
            </div>
            {/* overflow ラッパーを除去: iOS Safari でも pinch zoom がページレベルで動作する */}
              <table style={{borderCollapse:'collapse',tableLayout:'fixed',minWidth:NAME_W+CELL_W*days+SUM_W*3}}>
                <thead>
                  <tr>
                    <th style={{...th,textAlign:'left',width:NAME_W,maxWidth:NAME_W,fontSize:11}}>氏名</th>
                    {Array.from({length:days},(_,i)=>i+1).map(d=>{
                      const wd=WD[new Date(year,month-1,d).getDay()];
                      const isWe=wd==='日'||wd==='土'||isJpHoliday(year,month-1,d);
                      return <th key={d} style={{...th,background:isWe?'#fff0f6':'#e8f0fe'}}>{d}<br/>{wd}</th>;
                    })}
                    <th style={{...th,width:SUM_W,maxWidth:SUM_W,fontSize:10}}>勤務</th>
                    <th style={{...th,width:SUM_W,maxWidth:SUM_W,fontSize:10}}>夜勤</th>
                    <th style={{...th,width:SUM_W,maxWidth:SUM_W,fontSize:10}}>休</th>
                  </tr>
                </thead>
                <tbody>
                  {deptStaff.map(s=>{
                    let w=0,n=0,r=0;
                    const ss = deptShifts[s.id] || {};
                    return (
                      <tr key={s.id}>
                        <td style={nameTdStyle}><div style={nameInnerStyle}>{s.name}</div></td>
                        {Array.from({length:days},(_,i)=>i+1).map(d=>{
                          const v=ss[d]||'';
                          w+=workDayValue(v);
                          if(v==='夜勤')n++;
                          if((REST_TYPES.has(v)||HALF_PAIDREST_TYPES.has(v))&&v!=='明け'&&v!=='有休')r+=(HALF_REST_TYPES.has(v)||HALF_PAIDREST_TYPES.has(v))?0.5:1;
                          const isWe=['日','土'].includes(WD[new Date(year,month-1,d).getDay()])||isJpHoliday(year,month-1,d);
                          return <td key={d} style={{...td,background:isWe?'#fff0f6':undefined}}>{cellText(v)}</td>;
                        })}
                        <td style={{...td,width:SUM_W,maxWidth:SUM_W}}>{w}</td>
                        <td style={{...td,width:SUM_W,maxWidth:SUM_W}}>{n||'－'}</td>
                        <td style={{...td,width:SUM_W,maxWidth:SUM_W}}>{r}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>
        );
      })}
      <div style={{marginTop:12,fontSize:10,color:'#9CA3AF',textAlign:'center'}}>YEIX — シフト確定表</div>
    </div>
    </>
  );
}


export default function App() {
  const params = new URLSearchParams(window.location.search);
  const shareToken = params.get('share');
  const staffUserId = params.get('staff');
  const staffDeptId = params.get('dept');
  const staffCfgB64 = params.get('cfg');
  // 短縮UUID（22文字）を通常UUIDに戻す
  const resolvedUserId = staffUserId ? (staffUserId.length <= 24 ? shortToUuid(staffUserId) : staffUserId) : null;

  // 新共有ルート: ?share=token → SharedShiftView（shared_shifts 専用）
  if (shareToken) return <SharedShiftView token={shareToken} />;

  // 希望休ポータル（スタッフURL）
  if (resolvedUserId) return <StaffPortal adminUserId={resolvedUserId} fixedDeptId={staffDeptId||undefined} cfgPreload={staffCfgB64} />;

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
          <button onClick={onClose} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:22}}><X size={18} strokeWidth={2}/></button>
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
  const shiftReqDeferSave = useRef(false); // 右クリック希望勤務/undo-redo由来のstaffList変更→自動保存せず明示保存に回す
  const staffListDirtyRef = useRef(false); // 上記で保留中のstaffList未保存フラグ（saveNowで一緒にupsert）
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

  const [staffList, setStaffList] = useState(() => { try { const s=localStorage.getItem("shiftNavi_staffList"); if(s) return JSON.parse(s); } catch {} return buildStaff(); });
  useEffect(() => {
    try { localStorage.setItem("shiftNavi_staffList",JSON.stringify(staffList)); } catch {}
    if (staffListSkipSave.current) {
      // Supabase/Realtimeから来た変更 → 保存不要・保存済みとしてマーク
      staffListSkipSave.current = false;
      lastSavedStaffListRef.current = staffList;
    } else if (shiftReqDeferSave.current) {
      // 右クリック希望勤務/undo-redo由来 → 自動保存せず「保存」ボタンまで保留（明示保存）。
      // localStorage退避は冒頭で実施済み。lastSavedStaffListRefは更新しない
      // （reloadFromRemoteのhasLocalChanges保護で未保存の希望勤務が巻き戻らない）。
      shiftReqDeferSave.current = false;
      staffListDirtyRef.current = true;
      saveStatusRef.current = "unsaved";
      setSaveStatus("unsaved");
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
        return { id: d.id, label: d.label, kiboLimit: d.kiboLimit || 3, kiboDayLimit: d.kiboDayLimit || 0, deadline: ps.deadline || null, targetYear: ps.targetYear || null, targetMonth: ps.targetMonth || null };
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
  const allShiftsRef = useRef(allShifts); // 常に最新のallShiftsを参照（生成ハンドラ内で利用）
  const staffListRef = useRef(staffList); // 常に最新のstaffListを参照（保存ハンドラ内で利用）
  const deptsRef = useRef(depts); // 常に最新のdeptsを参照
  const allDBDataRef = useRef({}); // Supabase全データのキャッシュ（保存後の学習再計算に使用）
  const exceptionMonthsRef = useRef([]); // exceptionMonthsの最新値（保存後の学習再計算に使用）
  allShiftsRef.current = allShifts; // 常に最新状態を参照（生成ハンドラ・保存ハンドラ用）
  staffListRef.current = staffList;
  deptsRef.current = depts;
  const [allEvents, setAllEvents] = useState({});
  const [eventEditDay, setEventEditDay] = useState(null);

  const [confirmedMonths, setConfirmedMonths] = useState({}); // { "YYYY_M_deptId": true|false }
  const [editRates, setEditRates] = useState({}); // { "YYYY_M_deptId": number(%) } 修正率

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
        const confirmedInit = {};
        const editRateInit = {};
        for (const [k, v] of Object.entries(byKey)) {
          if (k.startsWith('confirmed_')) confirmedInit[k.slice('confirmed_'.length)] = v;
          else if (k.startsWith('editRate_')) editRateInit[k.slice('editRate_'.length)] = v;
        }
        if (Object.keys(confirmedInit).length > 0) setConfirmedMonths(confirmedInit);
        if (Object.keys(editRateInit).length > 0) setEditRates(editRateInit);
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
        const confirmedFromRT = {};
        const editRateFromRT = {};
        for (const [k, v] of Object.entries(byKey)) {
          if (k.startsWith('confirmed_')) confirmedFromRT[k.slice('confirmed_'.length)] = v;
          else if (k.startsWith('editRate_')) editRateFromRT[k.slice('editRate_'.length)] = v;
        }
        if (Object.keys(confirmedFromRT).length > 0) setConfirmedMonths(prev => ({...prev, ...confirmedFromRT}));
        if (Object.keys(editRateFromRT).length > 0) setEditRates(prev => ({...prev, ...editRateFromRT}));
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
              undoStackRef.current[dId] = []; // RT適用部署のundo/redo履歴をリセット
              redoStackRef.current[dId] = [];
            }
            setUndoCount(0); setRedoCount(0);
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
    undoStackRef.current = {}; // 月切替でundo/redo履歴をリセット
    redoStackRef.current = {};
    setUndoCount(0); setRedoCount(0);
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

  // ── 明示保存（Stage 1）: 自動保存は廃止し「保存」ボタン押下時のみ Supabase へ upsert ──
  const saveFailCountRef = useRef(0);
  // dirty 部署（+アクティブ部署）を保存する。成功=true / 失敗=false / 保存対象なし=true。
  const saveNow = useCallback(async () => {
    if (!dbInitialized.current) return false;
    if (isLoadingMonth.current) return false;
    const y = yearRef.current, m = monthRef.current;
    const deptIdsToSave = new Set(dirtyDeptIdsRef.current);
    deptIdsToSave.add(activeDeptIdRef.current); // 安全網: アクティブ部署も必ず含める
    let saveError = null;
    for (const currentDeptId of deptIdsToSave) {
      const key = `shifts_${y}_${m+1}_${currentDeptId}`;
      const deptData = allShiftsRef.current[currentDeptId] || {};
      try {
        const { error } = await supabase.from('shift_data').upsert(
          { user_id:session.user.id, data_key:key, data_value:deptData, updated_at:new Date().toISOString() },
          { onConflict:'user_id,data_key' }
        );
        if (error) {
          if (error.code === "PGRST301" || error.message?.includes("JWT") || error.message?.includes("token")) {
            alert("セッションが切れました。再ログインしてください。");
            await supabase.auth.signOut();
            return false;
          }
          throw error;
        }
        dirtyDeptIdsRef.current.delete(currentDeptId); // 保存成功 → dirty解除
        // DBキャッシュ更新 → learnedTrend 再計算（保存＝学習の節目）
        allDBDataRef.current[key] = deptData;
        {
          const relearned = computeLearnedTrend(allDBDataRef.current, staffListRef.current, exceptionMonthsRef.current);
          if (Object.keys(relearned).length > 0) setLearnedTrend(relearned);
        }
        const genRef = lastAutoGenRef.current[currentDeptId];
        if (genRef) {
          const deptStaff = staffListRef.current.filter(s => s.dept === currentDeptId);
          const kiboPatterns = detectKiboNightPatterns(genRef, deptData, deptStaff, y, m);
          if (Object.keys(kiboPatterns).length > 0) {
            setStaffList(prev => prev.map(s => {
              if (!kiboPatterns[s.id]) return s;
              return { ...s, kiboNightPreference: Math.min(20, (s.kiboNightPreference || 0) + kiboPatterns[s.id]) };
            }));
          }
          const editCells = detectManualEditCells(genRef, deptData);
          if (Object.keys(editCells).length > 0) {
            const editKey = `edits_${y}_${m+1}_${currentDeptId}`;
            supabase.from('shift_data').upsert(
              { user_id: session.user.id, data_key: editKey, data_value: editCells, updated_at: new Date().toISOString() },
              { onConflict: 'user_id,data_key' }
            ).then(() => { allDBDataRef.current[editKey] = editCells; });
          }
          lastAutoGenRef.current[currentDeptId] = {...deptData};
        }
      } catch(e) {
        saveError = e;
        console.log("[SAVE] UPSERT ERROR", e?.message || e);
      }
    }
    // 保留中の希望勤務(staffList)も同じ「保存」操作で一緒に永続化する
    if (!saveError && staffListDirtyRef.current) {
      try {
        const listToSave = staffListRef.current;
        const { error } = await supabase.from('shift_data').upsert(
          { user_id:session.user.id, data_key:'staffList', data_value:listToSave, updated_at:new Date().toISOString() },
          { onConflict:'user_id,data_key' }
        );
        if (error) throw error;
        lastSavedStaffListRef.current = listToSave; // reloadFromRemoteのhasLocalChanges基準を更新
        staffListDirtyRef.current = false;
      } catch(e) { saveError = e; console.log("[SAVE] staffList UPSERT ERROR", e?.message || e); }
    }
    try { localStorage.setItem(SAVE_KEY(y,m),JSON.stringify(allShiftsRef.current)); } catch {}
    if (!saveError) {
      saveFailCountRef.current = 0;
      lastSelfSaveTime.current = Date.now(); // 自己Realtimeループ検知用
      seqAtLastRemoteLoad.current = userEditSeq.current; // 保存済み＝現状を基準に（未保存判定のリセット）
      saveStatusRef.current = "saved";
      setSaveStatus("saved");
      setWarningsScope(null); // 保存後は生成警告をクリア（レビュー支援は生成直後のみ）
      return true;
    } else {
      saveFailCountRef.current += 1;
      setSaveStatus("error");
      alert("クラウドへの保存に失敗しました。通信環境を確認してもう一度「保存」を押してください。\n（編集内容はこの端末に退避されています）");
      return false;
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // 編集検知: 未保存マーク＋localStorage退避のみ（自動upsertはしない＝明示保存）。
  // クラッシュ復旧用に localStorage へ随時退避（15世代バックアップ=Supabaseは消費しない）。
  useEffect(() => {
    if (!dbInitialized.current) return;
    if (isLoadingMonth.current) return;
    // Realtime直後で userEditSeq 変化なし = ユーザー編集ではない → 未保存にしない
    if (userEditSeq.current === seqAtLastRemoteLoad.current) { setSaveStatus('saved'); return; }
    saveStatusRef.current = "unsaved"; // Realtime巻き戻し保護（未保存中はRT取り込みをスキップ→undo保持）
    setSaveStatus("unsaved");
    dirtyDeptIdsRef.current.add(activeDeptIdRef.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(SAVE_KEY(yearRef.current, monthRef.current), JSON.stringify(allShiftsRef.current)); } catch {}
    }, 500);
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
  // 生成直後の「直されそうなセル」警告（表示のみ・保存しない）。scopeが一致する間だけ表示。
  const [genWarnings, setGenWarnings] = useState([]);
  const [warningsOn, setWarningsOn] = useState(true);
  const [warningsScope, setWarningsScope] = useState(null); // {deptId, year, month}
  const [downloadModal, setDownloadModal] = useState(false);
  const [bulkKyukoModal, setBulkKyukoModal] = useState(false);
  const undoStackRef = useRef({}); // { [deptId]: snapshot[] } — アンドゥ履歴（最大30ステップ）。snapshot={shifts, sr}
  const redoStackRef = useRef({}); // { [deptId]: snapshot[] } — リドゥ履歴（最大30ステップ）
  const [undoCount, setUndoCount] = useState(0); // 現在部署のアンドゥ可能ステップ数（ボタンのenabled判定用）
  const [redoCount, setRedoCount] = useState(0); // 現在部署のリドゥ可能ステップ数
  const isMobile = (window.innerWidth || document.documentElement.clientWidth) < 900;
  const [tableZoom, setTableZoom] = useState(() => { try { return Number(localStorage.getItem("shiftTableZoom")) || 100; } catch { return 100; } });
  const handleZoomChange = useCallback((v) => { const min=isMobile?30:40; const c=Math.min(100,Math.max(min,Math.round(v/5)*5)); setTableZoom(c); try{localStorage.setItem("shiftTableZoom",c);}catch{} }, [isMobile]);
  const autoFitZoom = useCallback((staffCount, days) => { const vw=window.innerWidth-(isMobile?8:24); const tableEstWidth=148+30*days+116; const min=isMobile?30:40; return Math.min(100,Math.max(min,Math.round(Math.floor(vw/tableEstWidth*100)/5)*5)); }, [isMobile]);
  const autoFitApplied = useRef(false);
  useEffect(() => { if(autoFitApplied.current)return; try{const s=localStorage.getItem("shiftTableZoom");if(s&&!isMobile){autoFitApplied.current=true;return;}}catch{} setTableZoom(autoFitZoom(staffList.filter(s=>s.dept===activeDeptId).length,getDays(now.getFullYear(),now.getMonth()))); autoFitApplied.current=true; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [excelPasteModal, setExcelPasteModal] = useState(false);
  const [clearModal, setClearModal] = useState(false);
  const [pinSettingsModal, setPinSettingsModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [adminModal, setAdminModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [helpModal, setHelpModal] = useState(false);
  const [learnedTrend, setLearnedTrend] = useState({});
  // 生成警告の派生: scope(生成した部署・月)が現在と一致する間だけ算出。
  // deptShifts変化で自動再判定＝手修正で癖に合えば警告消灯。scope不一致(部署/月切替)や
  // 保存後(scope=null)は非表示。表示のみで保存・生成には非干渉。
  useEffect(() => {
    if (!warningsOn || !warningsScope || warningsScope.deptId !== activeDeptId || warningsScope.year !== year || warningsScope.month !== month) {
      setGenWarnings(prev => (prev.length ? [] : prev));
      return;
    }
    const dp = depts.find(d => d.id === activeDeptId);
    if (!dp) return;
    try {
      setGenWarnings(computeWarnings({ shifts: allShifts[activeDeptId] || {}, staffList, dept: dp, trend: learnedTrend, year, month }));
    } catch { /* 表示専用のため失敗時は無視 */ }
  }, [allShifts, warningsScope, warningsOn, activeDeptId, year, month, learnedTrend, staffList, depts]);
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
  useEffect(() => { setUndoCount((undoStackRef.current[activeDeptId] || []).length); setRedoCount((redoStackRef.current[activeDeptId] || []).length); }, [activeDeptId]);
  const isLocked = !!(depts.find(d=>d.id===activeDeptId)?.pin && unlockedDeptId !== activeDeptId);
  const isLockedRef = useRef(isLocked);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  const isConfirmed = confirmedMonths[`${year}_${month+1}_${activeDeptId}`] === true;
  const isConfirmedRef = useRef(isConfirmed);
  useEffect(() => { isConfirmedRef.current = isConfirmed; }, [isConfirmed]);
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
  const warnMap = useMemo(()=>{const m={};for(const w of genWarnings)m[`${w.staffId}:${w.day}`]=w;return m;},[genWarnings]);
  const warnCounts = useMemo(()=>({l1:genWarnings.filter(w=>w.level===1).length,l2:genWarnings.filter(w=>w.level===2).length}),[genWarnings]);
  // 学習一致度（生成シフトが学習済みの曜日別癖 dowShiftRate にどれだけ沿うか・平均%）
  const learnedMatch = useMemo(() => {
    if (!dept) return null;
    return computeLearnedMatch(deptShifts, staffList, dept, year, month, learnedTrend);
  }, [deptShifts, staffList, dept, year, month, learnedTrend, activeDeptId]);

  // ══════════════════════════════════════════════════════════════════════════
  // ── Phase S-1: keep innerTabRef in sync + fire lazy Temporal engines ────────
  useEffect(() => {
    innerTabRef.current = innerTab;
  }, [innerTab]);


  // ── undo/redo用スナップショット ────────────────────────────────────────
  // 手編集は deptShifts に加え、希望勤務化(handleMenuSelect)が staffList の
  // shiftRequestsByMonth[mk] も更新する（唯一の二重更新）。両方を1つのsnapshotに
  // 収めて undo/redo で一緒に復元する（希望勤務のロックも正しく戻る=完全対応）。
  const captureSR = useCallback((deptId) => {
    const mk = monthKey(year, month); const out = {};
    for (const s of staffListRef.current) if (s.dept === deptId) out[s.id] = s.shiftRequestsByMonth?.[mk] ?? null;
    return out;
  }, [year, month]);
  const takeSnapshot = useCallback((deptId) => ({ shifts: allShiftsRef.current[deptId] || {}, sr: captureSR(deptId) }), [captureSR]);
  const applySnapshot = useCallback((deptId, snap) => {
    const mk = monthKey(year, month);
    setAllShifts(prev => ({ ...prev, [deptId]: snap.shifts }));
    // 希望勤務(shiftRequestsByMonth[mk]) は変化がある時のみ復元（左クリック等の無駄なstaffList更新を避ける）
    const cur = captureSR(deptId); let changed = false;
    for (const id of new Set([...Object.keys(cur), ...Object.keys(snap.sr || {})])) {
      if (JSON.stringify(cur[id] ?? null) !== JSON.stringify(snap.sr?.[id] ?? null)) { changed = true; break; }
    }
    if (changed) { shiftReqDeferSave.current = true; setStaffList(prev => prev.map(st => {
      if (st.dept !== deptId) return st;
      const slice = snap.sr?.[st.id] ?? null; const nb = { ...(st.shiftRequestsByMonth || {}) };
      if (slice == null) delete nb[mk]; else nb[mk] = slice;
      return { ...st, shiftRequestsByMonth: nb };
    })); }
  }, [year, month, captureSR]);

  const setDeptShifts = useCallback((updater, opts = {}) => {
    if (opts.resetHistory) {
      // 自動生成・全体クリア・paste等の大操作: undo/redo対象にせず、履歴をリセット
      undoStackRef.current[activeDeptId] = [];
      redoStackRef.current[activeDeptId] = [];
      setUndoCount(0); setRedoCount(0);
    } else {
      // 手編集: アンドゥ用に変更前の状態を積む。新規編集なのでリドゥは無効化。
      const { undo, redo } = pushHistory(undoStackRef.current[activeDeptId], redoStackRef.current[activeDeptId], takeSnapshot(activeDeptId));
      undoStackRef.current[activeDeptId] = undo;
      redoStackRef.current[activeDeptId] = redo;
      setUndoCount(undo.length);
      setRedoCount(0);
    }
    // ユーザー操作はRealtimeより常に優先: 編集前にシーケンス番号を上げてRealtimeをキャンセル
    userEditSeq.current++;
    saveStatusRef.current = "unsaved"; // Realtime簡易ガードを即時有効化
    setAllShifts(prev=>({...prev,[activeDeptId]:typeof updater==="function"?updater(prev[activeDeptId]||{}):updater}));
  }, [activeDeptId, takeSnapshot]);

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
    // 前月シフトデータから prevTail を組み立て（allDBDataRef は全月分をキャッシュ済み）
    const prevMonthYear = month === 0 ? year - 1 : year;
    const prevMonthIdx  = month === 0 ? 11 : month - 1;
    const prevMonthKey  = `shifts_${prevMonthYear}_${prevMonthIdx + 1}_${targetDept.id}`;
    const prevMonthRaw  = allDBDataRef.current[prevMonthKey]; // { [staffId]: { [dayStr]: shift } }
    const builtPrevTail = {};
    if (prevMonthRaw) {
      const prevDays = getDays(prevMonthYear, prevMonthIdx);
      const tailStart = Math.max(1, prevDays - 4); // 末尾5日分
      let staffCount = 0, dayCount = 0;
      for (const [staffId, dayShifts] of Object.entries(prevMonthRaw)) {
        const tail = {};
        for (let d = tailStart; d <= prevDays; d++) {
          const v = dayShifts[String(d)];
          if (v) { tail[d] = v; dayCount++; }
        }
        if (Object.keys(tail).length > 0) { builtPrevTail[staffId] = tail; staffCount++; }
      }
      // prevTail情報は diagnosticReport.prevTail に格納済み（Phase3 Step2）
    }

    const genSnapshot = allShiftsRef.current[targetDept.id] || {};
    // 自動生成はundo/redo対象外: 履歴をリセット（redoも無効化）。
    undoStackRef.current[targetDept.id] = [];
    redoStackRef.current[targetDept.id] = [];
    const _genResult = bestOfN(cs, targetDept, year, month, genSnapshot, ct, 30, builtPrevTail);
    const {shifts:result, warnings, timelineWarnings, score, diagnosticReport} = _genResult;
    lastAutoGenRef.current[targetDept.id] = result;
    return { result, warnings, timelineWarnings, score, genSnapshot, diagnosticReport };
  }, [year, month]);

  // repairHardConstraints は src/engine/core.js に移動・export済み（import行参照）

  const validateHardConstraints = (dept, res, ds, year, month) => {
    if (dept.id !== 'eiyo') return [];
    const errs = [];
    const mk = monthKey(year, month);
    const days = getDays(year, month);
    const REST = new Set(['休み','希望休','有休']);
    const maxConsec = dept.maxConsec ?? 5;
    const maxStaff = dept.maxStaff || {};

    ds.forEach(s => {
      const shifts = res[s.id] || {};
      // ① 公休数（超過のみNG・不足は許容）個人設定を優先
      const tgtK = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const actK = Object.values(shifts).filter(v => REST.has(v)).length;
      if (actK > tgtK)
        errs.push(`${s.name}\n  公休数  設定${tgtK} 実績${actK}`);

      // ② 最大連勤（設定超過のみNG）
      let streak = 0, maxS = 0;
      for (let d = 1; d <= days; d++) {
        const v = shifts[d];
        if (v && !REST.has(v) && v !== '明け') { streak++; maxS = Math.max(maxS, streak); }
        else streak = 0;
      }
      if (maxS > maxConsec)
        errs.push(`${s.name}\n  最大連勤  設定${maxConsec} 実績${maxS}連勤`);

      // ③ 希望休（勤務になっていたらNG）
      (s.kiboByMonth?.[mk] || []).forEach(d => {
        const v = shifts[Number(d)];
        if (v && !REST.has(v))
          errs.push(`${s.name}\n  希望休(${d}日)  実績${v}`);
      });

      // ④ 有給（有給になっていなかったらNG）
      (s.yukyuByMonth?.[mk] || []).forEach(d => {
        if (shifts[Number(d)] !== '有休')
          errs.push(`${s.name}\n  有給(${d}日)  実績${shifts[Number(d)] ?? '未設定'}`);
      });

      // ⑤ 希望勤務（勤務シフト指定が守られているかNG）
      Object.entries(s.shiftRequestsByMonth?.[mk] || {}).forEach(([d, req]) => {
        if (REST.has(req) || req === '明け') return;
        if (shifts[Number(d)] !== req)
          errs.push(`${s.name}\n  希望勤務(${d}日)  設定${req} 実績${shifts[Number(d)] ?? '未設定'}`);
      });
    });

    // ⑥ 最大職種数（日別・maxStaff < 99のみ対象）
    for (let d = 1; d <= days; d++) {
      Object.entries(maxStaff).forEach(([sh, max]) => {
        if (max >= 99) return;
        const cnt = ds.filter(s => res[s.id]?.[d] === sh).length;
        if (cnt > max)
          errs.push(`${d}日 ${sh}\n  最大職種数  設定${max}人 実績${cnt}人`);
      });
    }

    return errs;
  };

  const handleGenerate = useCallback(() => {
    if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;}
    if (isConfirmedRef.current) { alert(`${dept?.label} は確定済みです。「編集」ボタンで編集状態に戻してから生成してください。`); return; }
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
          // Phase4 Step9: kyukoRetry 収集
          if (_gen.diagnosticReport?.repair) {
            _gen.diagnosticReport.repair.kyukoRetry = {
              triggered: true,
              allMatch: _kyukoAllMatch(_gen.result),
              retryCount: 49,
            };
          }
        }
        const {result, warnings, timelineWarnings, score, genSnapshot} = _gen;
        setUndoCount(undoStackRef.current[cd.id].length); setRedoCount(0);

        const _p1_ds = cs.filter(s => s.dept === cd.id);
        // 方針B: 最小変更フェーズ前の結果(公休正解の可能性)を退避しておく。
        const _preMin = KYUKO_FALLBACK_ALL_DEPT
          ? Object.fromEntries(_p1_ds.map(s => [s.id, { ...(result[s.id] || {}) }]))
          : null;
        applyMinimalChangePhase1(result, genSnapshot, _p1_ds, cd, year, month);
        // 方針B: 巻き戻しで公休が崩れ、かつ巻き戻し前は一致していたら、巻き戻し前へ復帰（全部署）。
        if (KYUKO_FALLBACK_ALL_DEPT && _preMin && _kyukoAllMatch(_preMin) && !_kyukoAllMatch(result)) {
          _p1_ds.forEach(s => { result[s.id] = _preMin[s.id]; });
        }
        recomputeGenerateWarnings(result, _p1_ds, cd, year, month, warnings, score, timelineWarnings, setGenerateWarnings);
        // 生成した部署・月を警告scopeに設定（派生useEffectがハイライトを算出）。表示のみ。
        setWarningsScope({ deptId: cd.id, year, month });


        // ── eiyo部署のみ: 公休数・maxConsec違反を自動修正 ──
        repairHardConstraints(cd, result, _p1_ds, year, month);

        // ── 検証（修復後の状態に対して警告のみ・保存は続行）──
        const _hardErrs = validateHardConstraints(cd, result, _p1_ds, year, month);
        if (_hardErrs.length > 0) {
          console.warn('[VALIDATION WARNING] 制約違反:\n' + _hardErrs.join('\n'));
        }

        dirtyDeptIdsRef.current.add(cd.id); // ★Fix S-1: 生成部署を明示dirty登録（active部署と異なる場合でも保存される）
        setAllShifts(prev => ({...prev, [cd.id]: result}));
        setSaveStatus("unsaved");
      }
      catch(e){console.error(e);alert("自動生成エラー: "+e.message);}
      finally{setGenerating(false);}
    },700);
  }, [staffList,dept,year,month,learnedTrend,_runGenerateCore]);

  const handleConfirm = useCallback(() => {
    if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;}
    setConfirmDialog({
      message: `${year}年${month+1}月 ${dept?.label} のシフトを確定しますか？\n確定後は編集・自動生成ができなくなります。`,
      okLabel: '確定する',
      onOk: async () => {
        const key = `confirmed_${year}_${month+1}_${activeDeptId}`;
        const { error } = await supabase.from('shift_data').upsert(
          { user_id: session.user.id, data_key: key, data_value: true, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,data_key' }
        );
        if (!error) {
          allDBDataRef.current[key] = true;
          setConfirmedMonths(prev => ({...prev, [`${year}_${month+1}_${activeDeptId}`]: true}));
        }
        // ── 修正率の計測・保存（生成直後 vs 確定時。生成物でない月はnullで—表示）──
        const baseline = lastAutoGenRef.current[activeDeptId] || null;
        const current = allShiftsRef.current[activeDeptId] || {};
        const rate = computeEditRate(baseline, current);
        if (rate != null) {
          const rateKey = `editRate_${year}_${month+1}_${activeDeptId}`;
          const { error: rErr } = await supabase.from('shift_data').upsert(
            { user_id: session.user.id, data_key: rateKey, data_value: rate, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,data_key' }
          );
          if (!rErr) {
            allDBDataRef.current[rateKey] = rate;
            setEditRates(prev => ({...prev, [`${year}_${month+1}_${activeDeptId}`]: rate}));
          }
        }
        // ── 有給残数の消費（確定時に減算・消費量を記録して解除時に復元）──
        const consKey = `paidLeaveConsumed_${year}_${month+1}_${activeDeptId}`;
        const prevConsumed = allDBDataRef.current[consKey] || null; // 二重減算防止: 既存記録があれば先に復元
        const consumed = computePaidLeaveConsumed(current, staffListRef.current, activeDeptId, year, month);
        // 消費後の残数とマイナス警告を算出（確定は止めない・見える化のみ）
        const warns = [];
        setStaffList(prev => prev.map(s => {
          if (s.dept !== activeDeptId) return s;
          const base = prevConsumed?.[s.id] ? (s.paidLeaveBalance ?? 0) + prevConsumed[s.id] : (s.paidLeaveBalance ?? 0);
          const c = consumed[s.id] || 0;
          if (c === 0 && !(prevConsumed?.[s.id])) return s;
          const nextBal = base - c;
          if (nextBal < 0) warns.push(`${s.name}：残${nextBal}日`);
          return { ...s, paidLeaveBalance: nextBal };
        }));
        const { error: cErr } = await supabase.from('shift_data').upsert(
          { user_id: session.user.id, data_key: consKey, data_value: consumed, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,data_key' }
        );
        if (!cErr) allDBDataRef.current[consKey] = consumed;
        if (warns.length > 0) alert(`次のスタッフの有給残がマイナスになります（確定は完了しています）：\n${warns.join('\n')}`);
      }
    });
  }, [year, month, activeDeptId, dept, session]);

  const handleUnconfirm = useCallback(() => {
    if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;}
    setConfirmDialog({
      message: `${year}年${month+1}月 ${dept?.label} のシフトを編集状態に戻しますか？`,
      okLabel: '編集する',
      onOk: async () => {
        const key = `confirmed_${year}_${month+1}_${activeDeptId}`;
        const { error } = await supabase.from('shift_data').upsert(
          { user_id: session.user.id, data_key: key, data_value: false, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,data_key' }
        );
        if (!error) {
          allDBDataRef.current[key] = false;
          setConfirmedMonths(prev => ({...prev, [`${year}_${month+1}_${activeDeptId}`]: false}));
        }
        // ── 有給残数の復元（確定時に減算した分を戻す・記録を削除）──
        const consKey = `paidLeaveConsumed_${year}_${month+1}_${activeDeptId}`;
        const consumed = allDBDataRef.current[consKey] || null;
        if (consumed && Object.keys(consumed).length > 0) {
          setStaffList(prev => prev.map(s => (consumed[s.id] ? { ...s, paidLeaveBalance: (s.paidLeaveBalance ?? 0) + consumed[s.id] } : s)));
        }
        const { error: cErr } = await supabase.from('shift_data').upsert(
          { user_id: session.user.id, data_key: consKey, data_value: {}, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,data_key' }
        );
        if (!cErr) allDBDataRef.current[consKey] = {};
      }
    });
  }, [year, month, activeDeptId, dept, session]);

  const handleUndo = useCallback(() => {
    if (isLockedRef.current) return;
    if (isConfirmedRef.current) return; // 確定済みは編集不可
    const res = undoStep(undoStackRef.current[activeDeptId], redoStackRef.current[activeDeptId], takeSnapshot(activeDeptId));
    if (!res) return;
    undoStackRef.current[activeDeptId] = res.undo;
    redoStackRef.current[activeDeptId] = res.redo;
    setUndoCount(res.undo.length);
    setRedoCount(res.redo.length);
    // ★編集保護(PR #117): Realtime巻き戻し防止。undo/redoも編集の一種として必須。
    userEditSeq.current++;
    saveStatusRef.current = "unsaved";
    setSaveStatus("unsaved");
    applySnapshot(activeDeptId, res.restored);
  }, [activeDeptId, takeSnapshot, applySnapshot]);

  const handleRedo = useCallback(() => {
    if (isLockedRef.current) return;
    if (isConfirmedRef.current) return; // 確定済みは編集不可
    const res = redoStep(undoStackRef.current[activeDeptId], redoStackRef.current[activeDeptId], takeSnapshot(activeDeptId));
    if (!res) return;
    undoStackRef.current[activeDeptId] = res.undo;
    redoStackRef.current[activeDeptId] = res.redo;
    setUndoCount(res.undo.length);
    setRedoCount(res.redo.length);
    userEditSeq.current++;
    saveStatusRef.current = "unsaved";
    setSaveStatus("unsaved");
    applySnapshot(activeDeptId, res.restored);
  }, [activeDeptId, takeSnapshot, applySnapshot]);

  // Ctrl+Z=戻る / Ctrl+Y・Ctrl+Shift+Z=進む（⌘も同様）
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleLeftClick = useCallback((staffId, day) => {
    if (isLockedRef.current) return;
    if (isConfirmedRef.current) return; // 確定済みは編集不可
    if (isMonthLoading) return; // 月ロード中は操作ブロック
    activeCellRef.current = { staffId, day, time: Date.now() }; // アクティブセル記録（Realtime上書き保護）
    setDeptShifts(prev=>{const cur=prev[staffId]?.[day]||"";if(HALF_ALL_TYPES.has(cur))return prev;const s=staffList.find(x=>x.id===staffId);const roleAllowed=s?dept?.roleShiftTypes?.[s.role]:null;const keys=roleAllowed?SHIFT_KEYS.filter(k=>!WORK_TYPES.has(k)||roleAllowed.includes(k)):SHIFT_KEYS;const idx=keys.indexOf(cur);const next=keys[(idx+1)%keys.length];return{...prev,[staffId]:{...(prev[staffId]||{}),[day]:next}};});
  }, [setDeptShifts, staffList, dept]);

  const handleRightClick = useCallback((staffId, day, e, selCells) => {
    if (isLockedRef.current) return;
    if (isConfirmedRef.current) return; // 確定済みは編集不可
    if (isMonthLoading) return; // 月ロード中は操作ブロック
    setCtxMenu({staffId,day,x:e.clientX+4,y:e.clientY+4,selCells:selCells||null});
  }, []);
  // 右クリックメニューで値を選択 = その勤務を配置し、同時に希望勤務としてロック（shiftRequestsByMonth）。
  //   「クリア」(空値)を選ぶとセルを消し、希望勤務ロックも解除する（専用の「希望勤務にする/解除」は廃止）。
  //   保存先・形式は既存の applyCellFix と完全一致（選択値を shiftsNow 形に包んで渡す）。
  //   ★編集保護フラグ(PR #117): setStaffList した shiftRequestsByMonth が保存完了前に Realtime で
  //     巻き戻されないよう userEditSeq/saveStatusRef を立てる（立てないと生成前にロックが外れる）。
  const handleMenuSelect = (shiftKey) => {
    if (!ctxMenu) return;
    const {staffId, day, selCells} = ctxMenu;
    const targets = (selCells && selCells.size > 1)
      ? [...selCells].map(k => { const i = k.lastIndexOf('|'); return [k.slice(0, i), +k.slice(i + 1)]; })
      : [[staffId, day]];
    userEditSeq.current++;
    saveStatusRef.current = "unsaved";
    setSaveStatus("unsaved");
    // ① セルに値を配置（クリアなら空）
    setDeptShifts(prev => {
      const next = {...prev};
      for (const [sid, d] of targets) next[sid] = {...(next[sid] || {}), [d]: shiftKey};
      return next;
    });
    // ② 希望勤務ロックを更新: 値あり=登録(fix)、クリア=解除。選択値そのものを shiftsNow 形にして渡す。
    const fix = !!shiftKey;
    const synthNow = {};
    for (const [sid, d] of targets) synthNow[sid] = {...(synthNow[sid] || {}), [d]: shiftKey};
    shiftReqDeferSave.current = true; // 右クリック希望勤務のstaffList変更は自動保存せず「保存」まで保留
    setStaffList(prev => prev.map(s => applyCellFix(s, targets, fix, synthNow, year, month)));
    setCtxMenu(null);
  };

  const saveStaff = (form) => { if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;} setStaffList(prev=>{const idx=prev.findIndex(s=>s.id===form.id);if(idx>=0)return prev.map((s,i)=>i===idx?form:s);return[...prev,{...form,id:`${activeDeptId}_${Date.now()}`,dept:activeDeptId}];}); setStaffModal(null); };
  const deleteStaff = (id) => { if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;} const s=staffList.find(x=>x.id===id); setConfirmDialog({message:`「${s?.name||'このスタッフ'}」を削除します。\nよろしいですか？`,onOk:()=>setStaffList(prev=>prev.filter(x=>x.id!==id)),okLabel:"削除する"}); };
  // 表示順の並べ替え（部署内で上下移動）。staff.id・シフト・生成・学習には非影響（配列順のみ変更）
  const moveStaff = (id, dir) => { if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;} setStaffList(prev => {
    const deptId = prev.find(s=>s.id===id)?.dept;
    if (!deptId) return prev;
    const deptIdxs = prev.map((s,i)=>s.dept===deptId?i:-1).filter(i=>i>=0); // 当部署の flat配列インデックス（表示順）
    const posInDept = deptIdxs.findIndex(i=>prev[i].id===id);
    const swapPos = dir==='up'?posInDept-1:posInDept+1;
    if (swapPos<0 || swapPos>=deptIdxs.length) return prev; // 端は移動不可
    const a = deptIdxs[posInDept], b = deptIdxs[swapPos];
    const next = [...prev];
    [next[a], next[b]] = [next[b], next[a]];
    return next;
  }); };
  const handleBulkKyuko = (days, mk) => { if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;} setStaffList(prev=>prev.map(s=>({...s,kyukoDaysByMonth:{...(s.kyukoDaysByMonth||{}),[mk]:days}}))); setBulkKyukoModal(false); };

  const prevMonth = ()=>{ if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); };
  const nextMonth = ()=>{ if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); };

  const handleSaveDept = (deptData) => { if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;} const isNew=!depts.find(d=>d.id===deptData.id); setDepts(prev=>{const idx=prev.findIndex(d=>d.id===deptData.id);if(idx>=0)return prev.map((d,i)=>i===idx?deptData:d);return[...prev,deptData];}); if(isNew)setActiveDeptId(deptData.id); setDeptSettingModal(null); };
  const handleDeleteDept = (deptId) => { if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");return;} if(depts.length<=1){alert("部署は最低1つ必要です。");return;} if(activeDeptId===deptId){const next=depts.find(d=>d.id!==deptId);if(next)setActiveDeptId(next.id);} setDepts(prev=>prev.filter(d=>d.id!==deptId)); setStaffList(prev=>prev.filter(s=>s.dept!==deptId)); setAllShifts(prev=>{const n={...prev};delete n[deptId];return n;}); setDeptSettingModal(null); };

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
          <div style={{display:"flex",alignItems:"center"}}>
            <YeixTextLogo height={22}/>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          <button onClick={prevMonth} style={MNAV}><ChevronLeft size={18} strokeWidth={2}/></button>
          <div style={{fontSize:14,fontWeight:600,color:"#111827",minWidth:110,textAlign:"center",background:"#F8FAFC",border:"1px solid #E5E7EB",borderRadius:8,padding:"6px 12px",letterSpacing:"0.01em"}}>{year}年 {month+1}月</div>
          <button onClick={nextMonth} style={MNAV}><ChevronRight size={18} strokeWidth={2}/></button>
        </div>
        {conflictBanner&&<span title="他の端末でデータが更新されました。保存完了後に自動反映されます。" style={{cursor:"default",animation:"pulse 1.2s infinite",lineHeight:1,flexShrink:0,display:"inline-flex",color:"#6366F1"}}><Wifi size={16} strokeWidth={2}/></span>}
        <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:"auto"}}>
          <div style={{fontSize:11,fontWeight:600,color:saveStatus==="saved"?"#22C55E":saveStatus==="error"?"#EF4444":"#F59E0B",display:"flex",alignItems:"center",gap:3,minWidth:isMobile?0:52}}>
            {saveStatus==="saved"&&<><RefreshCw size={11} strokeWidth={2}/>{!isMobile&&<span>保存済</span>}</>}
            {saveStatus==="unsaved"&&<><Loader size={11} strokeWidth={2}/>{!isMobile&&<span>未保存</span>}</>}
            {saveStatus==="error"&&<><span style={{color:"#EF4444"}}>!</span><span>保存失敗</span></>}
          </div>
          {!isLocked && <button onClick={saveNow} disabled={saveStatus!=="unsaved"&&saveStatus!=="error"} title={saveStatus==="unsaved"?"編集内容をクラウドに保存します":"保存済みです"} style={{background:(saveStatus==="unsaved"||saveStatus==="error")?"#F59E0B":"#F3F4F6",color:(saveStatus==="unsaved"||saveStatus==="error")?"#fff":"#9CA3AF",border:"none",borderRadius:8,padding:"0 14px",height:36,cursor:(saveStatus==="unsaved"||saveStatus==="error")?"pointer":"default",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}><Save size={14} strokeWidth={2}/>{!isMobile&&" 保存"}</button>}
          {isLocked
            ? <button onClick={()=>setPinModal(true)} style={{background:"#374151",color:"#fff",border:"none",borderRadius:8,padding:"0 14px",height:36,cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}><Lock size={14} strokeWidth={2}/>{!isMobile&&" 解錠する"}</button>
            : <button onClick={handleGenerate} disabled={generating||isMonthLoading||isConfirmed} title={isConfirmed?"確定済みです。「編集」ボタンで解除してください":isMonthLoading?"データ読み込み中です":undefined} style={{background:(generating||isMonthLoading||isConfirmed)?"#E5E7EB":"#2563EB",color:(generating||isMonthLoading||isConfirmed)?"#9CA3AF":"#FFFFFF",border:"none",borderRadius:8,padding:"0 14px",height:36,cursor:(generating||isMonthLoading||isConfirmed)?"not-allowed":"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5,opacity:(isMonthLoading||isConfirmed)?0.6:1}}><Zap size={14} strokeWidth={2}/>{generating?" 最適化中…":isMonthLoading?" 読込中…":" 自動生成"}</button>
          }
          {!isLocked && (isConfirmed
            ? <button onClick={handleUnconfirm} style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:8,padding:"0 14px",height:36,cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}><Pencil size={14} strokeWidth={2}/>{!isMobile&&" 編集"}</button>
            : <button onClick={async()=>{ const ok=await saveNow(); if(ok) handleConfirm(); }} title="保存してから確定します" style={{background:"#10B981",color:"#fff",border:"none",borderRadius:8,padding:"0 14px",height:36,cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}><Check size={14} strokeWidth={2}/>{!isMobile&&" 確定"}</button>
          )}
          <button onClick={()=>setDownloadModal(true)} style={{background:"#FFFFFF",color:"#374151",border:"1px solid #E5E7EB",borderRadius:8,padding:"0 12px",height:36,cursor:"pointer",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:5}}><Download size={14} strokeWidth={2}/>{!isMobile&&" 書き出し"}</button>
          {!isLocked && <button onClick={()=>setBulkKyukoModal(true)} style={{background:"#FFFFFF",color:"#374151",border:"1px solid #E5E7EB",borderRadius:8,padding:"0 12px",height:36,cursor:"pointer",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:5}}><Calendar size={14} strokeWidth={2}/>{!isMobile&&" 休み設定"}</button>}
          {/* Overflow [•••] */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setOverflowOpen(o=>!o)} style={{background:overflowOpen?"#F1F5F9":"#FFFFFF",color:"#374151",border:"1px solid #E5E7EB",borderRadius:8,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="その他のメニュー"><MoreHorizontal size={16} strokeWidth={2}/></button>
            {overflowOpen&&<>
              <div style={{position:"fixed",inset:0,zIndex:99}} onClick={()=>setOverflowOpen(false)}/>
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#FFFFFF",border:"1px solid #E5E7EB",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.10)",zIndex:100,minWidth:180,overflow:"hidden",padding:"4px 0"}}>
                <div onClick={()=>{ if(isLocked){alert("この部署はロックされています。編集するには解錠してください。");setOverflowOpen(false);return;} if(isConfirmed){alert(`${dept?.label} は確定済みです。編集するには「編集」を押してください。`);setOverflowOpen(false);return;} setExcelPasteModal(true);setOverflowOpen(false);}} title={isConfirmed?"確定済みです。「編集」を押してから使用できます":undefined} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:isConfirmed?"not-allowed":"pointer",fontSize:12,color:isConfirmed?"#C4C4C4":"#374151",borderBottom:"1px solid #F1F5F9"}} onMouseEnter={e=>{if(!isConfirmed)e.currentTarget.style.background="#F8FAFC";}} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <ClipboardList size={14} strokeWidth={2} style={{color:isConfirmed?"#D4D4D8":"#6B7280",flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500}}>貼付 / 傾向学習</div>
                  </div>
                </div>
                <div onClick={()=>{ if(isConfirmed){alert(`${dept?.label} は確定済みです。編集するには「編集」を押してください。`);setOverflowOpen(false);return;} setHistoryModal(true);setOverflowOpen(false);}} title={isConfirmed?"確定済みです。「編集」を押してから使用できます":undefined} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:isConfirmed?"not-allowed":"pointer",fontSize:12,color:isConfirmed?"#C4C4C4":"#374151"}} onMouseEnter={e=>{if(!isConfirmed)e.currentTarget.style.background="#F8FAFC";}} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><History size={14} strokeWidth={2} style={{color:isConfirmed?"#D4D4D8":"#6B7280"}}/><span>履歴から復元</span></div>
                <div onClick={()=>{setShareModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><Share2 size={14} strokeWidth={2} style={{color:"#6B7280"}}/><span>共有</span></div>
                {profile?.is_admin&&<div onClick={()=>{setAdminModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><Building2 size={14} strokeWidth={2} style={{color:"#6B7280"}}/><span>管理</span></div>}
                <div onClick={()=>{setHelpModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><HelpCircle size={14} strokeWidth={2} style={{color:"#6B7280"}}/><span>ヘルプ</span></div>
                {/* 編集PIN設定: ロック中でも開ける（PIN忘れ時の復旧口を兼ねる） */}
                <div onClick={()=>{setPinSettingsModal(true);setOverflowOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:"pointer",fontSize:12,color:"#374151"}} onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><Lock size={14} strokeWidth={2} style={{color:"#6B7280"}}/><span>編集PIN設定</span></div>
                {!isLocked&&<><div style={{height:1,background:"#F1F5F9",margin:"4px 0"}}/>
                <div onClick={()=>{ if(isConfirmed){alert(`${dept?.label} は確定済みです。編集するには「編集」を押してください。`);setOverflowOpen(false);return;} setClearModal(true);setOverflowOpen(false);}} title={isConfirmed?"確定済みです。「編集」を押してから使用できます":undefined} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",cursor:isConfirmed?"not-allowed":"pointer",fontSize:12,color:isConfirmed?"#E7B8B8":"#DC2626"}} onMouseEnter={e=>{if(!isConfirmed)e.currentTarget.style.background="#FEF2F2";}} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><Trash2 size={14} strokeWidth={2}/><span>シフトをクリア</span></div></>}
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
        {depts.map(d=>{const cnt=staffList.filter(s=>s.dept===d.id).length,act=d.id===activeDeptId;return(<div key={d.id} style={{display:"flex",alignItems:"center",position:"relative"}}><button onClick={()=>setActiveDeptId(d.id)} style={{padding:"10px 14px",background:"transparent",border:"none",borderBottom:act?"2px solid #2563EB":"2px solid transparent",color:act?"#111827":"#6B7280",borderRadius:0,cursor:"pointer",fontSize:12,fontWeight:act?600:400,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5,margin:"0 1px"}}><span>{d.label}</span><span style={{background:act?"#EFF6FF":"#F1F5F9",color:act?"#2563EB":"#9CA3AF",borderRadius:4,padding:"1px 5px",fontSize:10,fontWeight:600}}>{cnt}</span></button>{act&&!isLocked&&<button onClick={()=>setDeptSettingModal({dept:d,isNew:false})} style={{background:"transparent",border:"1px solid #E5E7EB",borderRadius:6,color:"#9CA3AF",cursor:"pointer",padding:"3px 6px",marginLeft:2,display:"flex",alignItems:"center"}}><Settings size={13} strokeWidth={2}/></button>}</div>);})}
        {!isLocked && <button onClick={()=>setDeptSettingModal({dept:null,isNew:true})} style={{background:"none",border:"1px dashed #E5E7EB",borderRadius:6,color:"#9CA3AF",cursor:"pointer",fontSize:11,padding:"5px 11px",marginLeft:8,whiteSpace:"nowrap",flexShrink:0}}>＋ 追加</button>}
      </div>

      {/* INNER TABS */}
      <div style={{background:"#F8F9FA",borderBottom:"1px solid #E4E4E7",display:"flex",padding:"0 8px",gap:2,alignItems:"center",overflowX:"auto"}}>
        {[["shift","シフト表"],["staff","スタッフ"]].map(([k,l])=><button key={k} onClick={()=>setInnerTab(k)} style={{padding:"10px 16px",background:"transparent",border:"none",color:innerTab===k?"#18181B":"#71717A",borderBottom:innerTab===k?"2px solid #2563EB":"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:innerTab===k?700:500,whiteSpace:"nowrap",flexShrink:0}}>{l}</button>)}
        {profile?.plan==='free'
          ? <button onClick={()=>alert("予定表機能はスタンダード・フルプランでご利用いただけます。\nプランのアップグレードはお問い合わせください。")} style={{padding:"10px 16px",background:"transparent",border:"none",color:"#9CA3AF",borderBottom:"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:500,whiteSpace:"nowrap",flexShrink:0,display:"flex",alignItems:"center",gap:4}}><Lock size={13} strokeWidth={2}/> 予定表</button>
          : <button onClick={()=>setInnerTab("yotei")} style={{padding:"10px 16px",background:"transparent",border:"none",color:innerTab==="yotei"?"#18181B":"#71717A",borderBottom:innerTab==="yotei"?"2px solid #2563EB":"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:innerTab==="yotei"?700:500,whiteSpace:"nowrap",flexShrink:0}}>予定表</button>
        }
        <button onClick={()=>setInnerTab("learn")} style={{padding:"10px 16px",background:"transparent",border:"none",color:innerTab==="learn"?"#18181B":"#71717A",borderBottom:innerTab==="learn"?"2px solid #2563EB":"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:innerTab==="learn"?700:500,whiteSpace:"nowrap",flexShrink:0}}>学習状況</button>
        <button onClick={()=>setInnerTab("backtest")} style={{padding:"10px 16px",background:"transparent",border:"none",color:innerTab==="backtest"?"#18181B":"#71717A",borderBottom:innerTab==="backtest"?"2px solid #2563EB":"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:innerTab==="backtest"?700:500,whiteSpace:"nowrap",flexShrink:0}}>バックテスト</button>
        {!isMobile&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          {innerTab==="shift"&&(
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <button onClick={()=>{const days=getDays(year,month);const ds=staffList.filter(s=>s.dept===activeDeptId).length;handleZoomChange(autoFitZoom(ds,days));}} style={{background:"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:8,color:"#6B7280",fontSize:11,padding:"4px 10px",cursor:"pointer",whiteSpace:"nowrap",fontWeight:500}}>フィット</button>
              <button onClick={()=>handleZoomChange(tableZoom-5)} title="縮小" style={{background:"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:8,color:"#6B7280",fontSize:15,fontWeight:700,lineHeight:1,padding:"4px 11px",cursor:"pointer"}}>−</button>
              <span style={{fontSize:12,fontWeight:600,color:"#6B7280",minWidth:40,textAlign:"center"}}>{tableZoom}%</span>
              <button onClick={()=>handleZoomChange(tableZoom+5)} title="拡大" style={{background:"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:8,color:"#6B7280",fontSize:15,fontWeight:700,lineHeight:1,padding:"4px 11px",cursor:"pointer"}}>＋</button>
              {!isLocked && <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
                <button onClick={handleUndo} disabled={undoCount===0} title={`戻る (Ctrl+Z)${undoCount>0?` — ${undoCount}ステップ`:''}`} style={{background:undoCount===0?"#F8FAFC":"#EFF6FF",color:undoCount===0?"#CBD5E1":"#3B82F6",border:`1px solid ${undoCount===0?"#EEF2F7":"#BFDBFE"}`,borderRadius:8,padding:"4px 9px",cursor:undoCount===0?"default":"pointer",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3,whiteSpace:"nowrap"}}><Undo2 size={13} strokeWidth={2}/>戻る</button>
                <button onClick={handleRedo} disabled={redoCount===0} title={`進む (Ctrl+Y)${redoCount>0?` — ${redoCount}ステップ`:''}`} style={{background:redoCount===0?"#F8FAFC":"#EFF6FF",color:redoCount===0?"#CBD5E1":"#3B82F6",border:`1px solid ${redoCount===0?"#EEF2F7":"#BFDBFE"}`,borderRadius:8,padding:"4px 9px",cursor:redoCount===0?"default":"pointer",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3,whiteSpace:"nowrap"}}><Redo2 size={13} strokeWidth={2}/>進む</button>
              </div>}
            </div>
          )}
          <div style={{fontSize:11,color:"#9CA3AF",padding:"0 4px",whiteSpace:"nowrap"}}>最低配置：{Object.entries(dept.minStaff||{}).map(([k,v])=>`${k}×${v}`).join(" / ")}</div>
        </div>}
      </div>
      {/* スマホ用ズームコントロール行 */}
      {isMobile&&innerTab==="shift"&&(
        <div style={{background:"#F8F9FA",borderBottom:"1px solid #E4E4E7",display:"flex",alignItems:"center",gap:4,padding:"6px 10px"}}>
          <button onClick={()=>{const days=getDays(year,month);const ds=staffList.filter(s=>s.dept===activeDeptId).length;handleZoomChange(autoFitZoom(ds,days));}} style={{background:"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:8,color:"#6B7280",fontSize:11,padding:"4px 10px",cursor:"pointer",whiteSpace:"nowrap",fontWeight:500}}>フィット</button>
          <button onClick={()=>handleZoomChange(tableZoom-5)} title="縮小" style={{background:"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:8,color:"#6B7280",fontSize:15,fontWeight:700,lineHeight:1,padding:"4px 11px",cursor:"pointer"}}>−</button>
          <span style={{fontSize:12,fontWeight:600,color:"#6B7280",minWidth:40,textAlign:"center"}}>{tableZoom}%</span>
          <button onClick={()=>handleZoomChange(tableZoom+5)} title="拡大" style={{background:"#FFFFFF",border:"1px solid #E4E4E7",borderRadius:8,color:"#6B7280",fontSize:15,fontWeight:700,lineHeight:1,padding:"4px 11px",cursor:"pointer"}}>＋</button>
          {!isLocked && <>
            <button onClick={handleUndo} disabled={undoCount===0} title="戻る (Ctrl+Z)" style={{background:undoCount===0?"#F8FAFC":"#EFF6FF",color:undoCount===0?"#CBD5E1":"#3B82F6",border:`1px solid ${undoCount===0?"#EEF2F7":"#BFDBFE"}`,borderRadius:8,padding:"4px 9px",cursor:undoCount===0?"default":"pointer",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3,marginLeft:4}}><Undo2 size={13} strokeWidth={2}/>戻る</button>
            <button onClick={handleRedo} disabled={redoCount===0} title="進む (Ctrl+Y)" style={{background:redoCount===0?"#F8FAFC":"#EFF6FF",color:redoCount===0?"#CBD5E1":"#3B82F6",border:`1px solid ${redoCount===0?"#EEF2F7":"#BFDBFE"}`,borderRadius:8,padding:"4px 9px",cursor:redoCount===0?"default":"pointer",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:3}}><Redo2 size={13} strokeWidth={2}/>進む</button>
          </>}
        </div>
      )}

      {/* CONTENT */}
      <div style={{padding:"8px 12px",minHeight:"calc(100vh - 180px)"}}>
        {innerTab==="shift"&&warningsScope&&warningsScope.deptId===activeDeptId&&warningsScope.year===year&&warningsScope.month===month&&(
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:"6px 12px",marginBottom:8,fontSize:12}}>
            <span style={{fontWeight:800,color:"#92400E",display:"inline-flex",alignItems:"center",gap:5}}><AlertTriangle size={14} strokeWidth={2}/>生成レビュー</span>
            <span style={{color:"#dc2626",fontWeight:700}}>癖違反 {warnCounts.l1}件</span>
            <span style={{color:"#b45309",fontWeight:700}}>異例配置 {warnCounts.l2}件</span>
            <span style={{color:"#64748B",fontSize:10}}>セルの⚠/!をタップで根拠。直すと消灯・保存でクリア。</span>
            <label style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:5,cursor:"pointer",color:"#374151"}}>
              <input type="checkbox" checked={warningsOn} onChange={e=>setWarningsOn(e.target.checked)} style={{accentColor:"#6366F1"}}/>警告表示
            </label>
          </div>
        )}
        {innerTab==="shift"&&(<><Legend/>
          {(()=>{
            const hasSchedule = Object.keys(deptShifts||{}).length > 0;
            const hasLearning = Object.keys(learnedTrend||{}).filter(k=>k!=='_monthCounts'&&k!=='_months').length > 0;
            const showMatch = hasSchedule && hasLearning;
            if (!showMatch && !isConfirmed) return null;
            const curRate = editRates[`${year}_${month+1}_${activeDeptId}`];
            const trend = [];
            for (let i=3;i>=0;i--){ let ty=year,tm=month-i; while(tm<0){tm+=12;ty--;} trend.push({label:`${tm+1}月`, rate:editRates[`${ty}_${tm+1}_${activeDeptId}`]}); }
            return (
              <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",fontSize:11,color:"#6B7280",background:"#F8FAFC",border:"1px solid #EEF2F7",borderRadius:8,padding:"5px 12px",margin:"2px 0 8px"}}>
                {showMatch&&<span title="生成シフトが学習済みの曜日別の癖にどれだけ沿っているか（生成直後の先行指標）">学習一致度：{learnedMatch!=null?<b style={{color:"#16A34A",fontSize:13,marginLeft:2}}>{learnedMatch}%</b>:<span style={{color:"#9CA3AF",marginLeft:2}}>—（学習データ不足）</span>}</span>}
                {showMatch&&isConfirmed&&<span style={{color:"#CBD5E1"}}>|</span>}
                {isConfirmed&&<span>この月の修正率：<b style={{color:curRate!=null?"#2563EB":"#9CA3AF",fontSize:13,marginLeft:2}}>{curRate!=null?`${curRate}%`:"—"}</b></span>}
                {isConfirmed&&<span style={{color:"#CBD5E1"}}>|</span>}
                {isConfirmed&&<span style={{display:"flex",gap:8,alignItems:"center"}}>推移:{trend.map(t=><span key={t.label} style={{color:"#94A3B8"}}>{t.label}<b style={{color:t.rate!=null?"#475569":"#CBD5E1",marginLeft:1}}>{t.rate!=null?`${t.rate}%`:"—"}</b></span>)}</span>}
              </div>
            );
          })()}
          <div style={{position:"relative"}}>
          {isMonthLoading&&<div style={{position:"absolute",inset:0,zIndex:50,background:"rgba(240,251,250,0.85)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,backdropFilter:"blur(2px)"}}>
            <div style={{background:"#fff",border:"1px solid #6366F1",borderRadius:12,padding:"18px 32px",fontWeight:800,fontSize:14,color:"#4F46E5",boxShadow:"0 4px 16px rgba(43,191,186,0.2)",display:"flex",alignItems:"center",gap:10}}>
              <span style={{display:"inline-block",animation:"spin 1s linear infinite",fontSize:20}}>⏳</span>シフトデータを読み込んでいます…
            </div>
          </div>}
          <ZoomWrapper zoom={tableZoom} onZoomChange={handleZoomChange}><ShiftTable staffList={staffList} shifts={deptShifts} dept={dept} year={year} month={month} onLeftClick={handleLeftClick} onRightClick={handleRightClick} events={allEvents[activeDeptId]?.[monthKey(year,month)]||{}} onEventEdit={(d)=>setEventEditDay(d)} confirmed={isConfirmed} warnings={warningsOn?warnMap:null}/></ZoomWrapper>
        </div></>)}
        {innerTab==="summary"&&<SummaryView staffList={staffList} shifts={deptShifts} dept={dept} year={year} month={month}/>}
        {innerTab==="staff"&&<StaffList locked={isLocked} staffList={staffList} dept={dept} year={year} month={month} onEdit={s=>setStaffModal({data:s})} onDelete={deleteStaff} onAdd={()=>setStaffModal({data:null})} onReorder={moveStaff}/>}
        {innerTab==="yotei"&&<YoteiView dept={dept} staffList={staffList} shifts={deptShifts} year={year} month={month} yoteiDeptData={deptYotei} onUpdateYotei={handleUpdateYotei} onBatchUpdateYotei={handleBatchUpdateYotei} floorSettings={floorSettings} onUpdateFloorSettings={handleUpdateFloorSettings}/>}
        {innerTab==="learn"&&<LearnStatusView learnedTrend={learnedTrend} staffList={staffList} depts={depts} allDBData={allDBDataRef.current} activeDeptId={activeDeptId} year={year} month={month}/>}
        {innerTab==="backtest"&&<BacktestView staffList={staffList} depts={depts} allDBData={allDBDataRef.current} exceptionMonths={exceptionMonths} activeDeptId={activeDeptId} year={year} month={month}/>}
      </div>

      {ctxMenu&&(()=>{const _st=staffList.find(s=>s.id===ctxMenu.staffId);return <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onSelect={handleMenuSelect} onClose={()=>setCtxMenu(null)} customDefs={dept?.customShiftDefs||[]} deptShiftTypes={dept?.shiftTypes||[]} selectionCount={ctxMenu.selCells?.size||1} roleAllowed={(!ctxMenu.selCells||ctxMenu.selCells.size<=1)?dept?.roleShiftTypes?.[_st?.role]??null:null}/>;})()}
      {staffModal!==null&&(()=>{const mk=monthKey(year,month);const editingId=staffModal.data?.id;const kiboCountByDay={};staffList.filter(s=>s.dept===activeDeptId&&s.id!==editingId).forEach(s=>{(s.kiboByMonth?.[mk]||[]).forEach(d=>{kiboCountByDay[d]=(kiboCountByDay[d]||0)+1;});});return<StaffModal data={staffModal.data} deptId={activeDeptId} depts={depts} year={year} month={month} onSave={saveStaff} onClose={()=>setStaffModal(null)} kiboCountByDay={kiboCountByDay} kiboLimit={dept?.kiboLimit||3}/>;})()}
      {deptSettingModal&&<DeptSettingModal dept={deptSettingModal.dept} isNew={deptSettingModal.isNew} onSave={handleSaveDept} onDelete={handleDeleteDept} onConfirm={(message,onOk,okLabel)=>setConfirmDialog({message,onOk,okLabel})} onClose={()=>setDeptSettingModal(null)}/>}
      {clearModal&&<ClearModal deptLabel={dept.label} onClearDept={()=>{ if(isConfirmedRef.current){alert(`${dept?.label} は確定済みです。編集するには「編集」を押してください。`);setClearModal(false);return;} setDeptShifts({},{resetHistory:true});setClearModal(false);}} onClose={()=>setClearModal(false)}/>}
      {pinSettingsModal&&<PinSettingsModal depts={depts} onSave={(pins)=>{ setDepts(prev=>prev.map(d=>({...d, pin:(pins[d.id]||"")||undefined}))); }} onClose={()=>setPinSettingsModal(false)}/>}
      {pinModal&&dept?.pin&&<PinModal deptLabel={dept.label} onVerify={(pin)=>{if(pin===dept.pin){setUnlockedDeptId(activeDeptId);setPinModal(false);return true;}return false;}} onClose={()=>setPinModal(false)}/>}
      {excelPasteModal&&<ExcelPasteModal year={year} month={month} staffList={staffList.filter(s=>s.dept===activeDeptId)} customShiftKeys={(dept?.customShiftDefs||[]).map(cd=>cd.key).filter(Boolean)} deptShiftTypes={dept?.shiftTypes||[]} customShiftDefs={dept?.customShiftDefs||[]} onApply={(pastedShifts)=>{
            // ★PINロックガード: ロック中は貼り付けで上書きさせない
            if(isLockedRef.current){alert("この部署はロックされています。編集するには解錠してください。");setExcelPasteModal(false);return;}
            // ★確定済みガード（自動生成と同趣旨）: 確定月を貼り付けで上書きさせない
            if(isConfirmedRef.current){alert(`${dept?.label} は確定済みです。編集するには「編集」を押してください。`);setExcelPasteModal(false);return;}
            // Excel貼付はundo/redo対象外: 履歴をリセット（redoも無効化）。
            undoStackRef.current[activeDeptId]=[];
            redoStackRef.current[activeDeptId]=[];
            setUndoCount(0); setRedoCount(0);
            pasteTimestamp.current = Date.now(); // Realtime上書きを5秒ブロック
            userEditSeq.current++;
            seqAtLastRemoteLoad.current = userEditSeq.current - 1; // 保存スキップされないよう保証
            saveStatusRef.current="unsaved";
            setAllShifts(prev=>{const cur=prev[activeDeptId]||{};const next={};const allIds=new Set([...Object.keys(cur),...Object.keys(pastedShifts)]);allIds.forEach(id=>{next[id]={...(cur[id]||{}),...(pastedShifts[id]||{})};});return{...prev,[activeDeptId]:next};});
            setSaveStatus('unsaved');
            setExcelPasteModal(false);
          }} onClose={()=>setExcelPasteModal(false)}/>}
      {bulkKyukoModal&&<BulkKyukoModal staffList={staffList} year={year} month={month} onApply={handleBulkKyuko} onClose={()=>setBulkKyukoModal(false)}/>}
      {downloadModal&&<DownloadModal depts={depts} staffList={staffList} allShifts={allShifts} year={year} month={month} activeDeptId={activeDeptId} allEvents={allEvents} session={session} onClose={()=>setDownloadModal(false)}/>}
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
          // ★確定済みガード（自動生成・クリア・貼付と統一）: 確定月を復元で上書きさせない
          if (isConfirmedRef.current) { alert(`${dept?.label} は確定済みです。編集するには「編集」を押してください。`); setHistoryModal(false); return; }
          // ★PIN: 破壊的な復元は実行直前に解錠を要求（既に解錠済みなら再入力不要／PIN未設定なら従来通り）
          const rdept = depts.find(x=>x.id===restoreDeptId);
          if (rdept?.pin && unlockedDeptId !== restoreDeptId) {
            alert('この部署はロックされています。PINで解錠してから復元してください。');
            setHistoryModal(false);
            setPinModal(true);
            return;
          }
          setAllShifts(prev=>({...prev,[restoreDeptId]:restoredData}));
          // ★Fix W-3: 復元後のundo/redo履歴をリセット（復元前の状態へ戻るundoを防止）
          // 復元を「新しい基準状態」として扱う → 復元前への逆行undoを不可能にする
          undoStackRef.current[restoreDeptId] = [];
          redoStackRef.current[restoreDeptId] = [];
          setUndoCount(0); setRedoCount(0);
          setSaveStatus('saved');
        }}
      />}
      {eventEditDay!==null&&<EventEditModal day={eventEditDay} month={month} year={year} currentText={(allEvents[activeDeptId]?.[monthKey(year,month)]||{})[eventEditDay]||""} onSave={(text)=>{const mk2=monthKey(year,month);setAllEvents(prev=>{const prev2={...(prev[activeDeptId]||{})};const prev3={...(prev2[mk2]||{})};if(text)prev3[eventEditDay]=text;else delete prev3[eventEditDay];prev2[mk2]=prev3;return{...prev,[activeDeptId]:prev2};});setEventEditDay(null);}} onClose={()=>setEventEditDay(null)}/>}
      {shareModal&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:250,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&setShareModal(false)}>
          <div style={{background:"#FAFAFA",border:"1px solid #D4D4D8",borderRadius:14,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 30px 80px #000"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:900,color:"#18181B",display:"flex",alignItems:"center",gap:6}}><Link2 size={16} strokeWidth={2}/>スタッフ共有URL</div>
              <button onClick={()=>setShareModal(false)} style={{background:"none",border:"none",color:"#52525B",cursor:"pointer",fontSize:20}}><X size={18} strokeWidth={2}/></button>
            </div>
            <div style={{fontSize:11,color:"#52525B",marginBottom:16,background:"#F4F4F5",borderRadius:8,padding:"8px 12px"}}>部署ごとのURLをスタッフに送ってください。各部署のスタッフは自分の部署だけ表示されます。</div>

            {/* ── サイト全体QR（新規登録・ログイン用） ── */}
            <div style={{background:"#fff",border:"2px solid #6366F1",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:13,color:"#18181B",marginBottom:4,display:"flex",alignItems:"center",gap:6}}><Home size={14} strokeWidth={2}/>YEIX サイトQRコード</div>
              <div style={{fontSize:10,color:"#52525B",marginBottom:10}}>自分のサイトに貼り付けると、スキャンしたらYEIXのログイン・新規登録画面へ移動します。</div>
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
                    ③ 読み取るとYEIXに到達<br/>
                    ④ 「ログイン」または「新規登録」が表示されます
                  </div>
                  <div style={{marginTop:10,fontSize:10,background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:6,padding:"6px 8px",color:"#92400e"}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:4}}><Lightbulb size={12} strokeWidth={2}/>URLもリンクとして貼れます</span><br/>
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
              const cfgObj={fn:profile?.facility_name||'',d:{id:d.id,label:d.label,kb:d.kiboLimit||3,kd:d.kiboDayLimit||0,dl:ps.deadline||null,ty:ps.targetYear||null,tm:ps.targetMonth||null},sl:deptSl};
              const cfgB64=btoa(unescape(encodeURIComponent(JSON.stringify(cfgObj))));
              const urlShort=`${window.location.origin}?staff=${uuidToShort(session.user.id)}&dept=${d.id}`;
              const urlFull=`${urlShort}&cfg=${cfgB64}`;
              const doCopy=()=>{if(navigator.clipboard?.writeText){navigator.clipboard.writeText(urlShort).then(()=>alert('URLをコピーしました！')).catch(()=>alert(`URLをコピーしてください:\n${urlShort}`));}else{alert(`URLをコピーしてください:\n${urlShort}`);}};
              const doLine=()=>{const dl=d.kiboDayLimit||0;const body=`${d.label}の希望休入力はこちら${dl>0?`\n※希望休は${dl}日までです`:''}\n${urlShort}`;const lineUrl=`https://line.me/R/msg/text/?${encodeURIComponent(body)}`;window.open(lineUrl,'_blank');};              const doSaveSettings=async()=>{
                const newPs={...portalSettings,[d.id]:{deadline:ps.deadline||null,targetYear:ps.targetYear||null,targetMonth:ps.targetMonth||null}};
                const deptsCfg=depts.map(dep=>{const p=newPs[dep.id]||{};return{id:dep.id,label:dep.label,kiboLimit:dep.kiboLimit||3,kiboDayLimit:dep.kiboDayLimit||0,deadline:p.deadline||null,targetYear:p.targetYear||null,targetMonth:p.targetMonth||null};});
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
                  <div style={{fontWeight:800,fontSize:13,color:"#18181B",marginBottom:10}}>{d.label}</div>
                  {/* 対象シフト月 */}
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#3F3F46",marginBottom:4,display:"flex",alignItems:"center",gap:5}}><Calendar size={13} strokeWidth={2}/>対象シフト月</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="month" value={(ps.targetYear&&ps.targetMonth)?`${ps.targetYear}-${String(ps.targetMonth).padStart(2,'0')}`:""} onChange={e=>{const v=e.target.value;if(!v){setPortalSettings(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),targetYear:null,targetMonth:null}}));}else{const[ty,tm]=v.split('-').map(Number);setPortalSettings(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),targetYear:ty,targetMonth:tm}}));}}} style={{border:"1px solid #D4D4D8",borderRadius:6,padding:"5px 8px",fontSize:12,color:"#18181B",outline:"none",background:"#FAFAFA"}}/>
                      {(ps.targetYear||ps.targetMonth)&&<button onClick={()=>setPortalSettings(prev=>({...prev,[d.id]:{...(prev[d.id]||{}),targetYear:null,targetMonth:null}}))} style={{background:"none",border:"none",color:"#c44b4b",cursor:"pointer",fontSize:12}}><X size={12} strokeWidth={2} style={{verticalAlign:"middle",marginRight:3}}/>クリア</button>}
                    </div>
                    {(ps.targetYear&&ps.targetMonth)&&<div style={{fontSize:10,color:"#2563EB",marginTop:3}}>スタッフ画面に「{ps.targetYear}年{ps.targetMonth}月の希望休入力」と表示されます</div>}
                    {!(ps.targetYear&&ps.targetMonth)&&<div style={{fontSize:10,color:"#9CA3AF",marginTop:3}}>未設定の場合は従来動作（締切日の月または当月）</div>}
                  </div>
                  {/* 締め切り */}
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#3F3F46",marginBottom:4,display:"flex",alignItems:"center",gap:5}}><Clock size={13} strokeWidth={2}/>締め切り日</div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="date" value={ps.deadline||""} onChange={e=>setPsDept('deadline',e.target.value||null)} style={{border:"1px solid #D4D4D8",borderRadius:6,padding:"5px 8px",fontSize:12,color:"#18181B",outline:"none",background:"#FAFAFA"}}/>
                      {ps.deadline&&<button onClick={()=>setPsDept('deadline',null)} style={{background:"none",border:"none",color:"#c44b4b",cursor:"pointer",fontSize:12}}><X size={12} strokeWidth={2} style={{verticalAlign:"middle",marginRight:3}}/>クリア</button>}
                    </div>
                    {ps.deadline&&<div style={{fontSize:10,color:"#c44b4b",marginTop:3,display:"flex",alignItems:"center",gap:4}}><AlertTriangle size={11} strokeWidth={2}/>{ps.deadline} 以降は送信不可になります</div>}
                  </div>
                  {/* 保存ボタン */}
                  <button onClick={doSaveSettings} style={{width:"100%",background:"#6366F1",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",cursor:"pointer",fontSize:13,fontWeight:800,marginBottom:12,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}><Save size={14} strokeWidth={2}/>この設定を保存する</button>
                  <div style={{textAlign:"center",marginBottom:6}}>
                    <div style={{fontSize:10,color:"#52525B",marginBottom:6,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}><Camera size={12} strokeWidth={2}/>カメラで読み取り</div>
                    <div style={{display:"inline-block",padding:8,background:"#fff",border:"2px solid #D4D4D8",borderRadius:8}}>
                      <QRCodeSVG value={urlShort} size={140} bgColor="#ffffff" fgColor="#18181B" level="L" includeMargin={false}/>
                    </div>
                  </div>
                  <div style={{fontSize:11,fontWeight:700,color:"#52525B",marginBottom:4}}>希望休入力リンク</div>
                  <div style={{display:"flex",gap:8,marginTop:4,marginBottom:12}}>
                    <button onClick={doLine} style={{background:"linear-gradient(135deg,#06C755,#00a040)",color:"#fff",border:"none",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:12,fontWeight:800,flex:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}><MessageCircle size={14} strokeWidth={2}/>LINEで送る</button>
                    <button onClick={doCopy} style={{background:"#f0fff4",color:"#16a34a",border:"1px solid #86efac",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:12,fontWeight:800,flex:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}><Copy size={14} strokeWidth={2}/>コピー</button>
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