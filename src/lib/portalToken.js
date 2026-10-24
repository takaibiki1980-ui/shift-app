/**
 * 職員ポータル／共有リンクの「新方式トークン」純粋ロジック（副作用なし・配線なし）。
 * 22番 セキュリティ強化 PR-A。画面(App.jsx)・DB・環境変数には一切つながない（新規ファイルのみ）。
 *
 * 新方式のねらい:
 *  - URL に管理者 uuid を含めない（旧 ?staff=<uuid> は PR-F で段階的に廃止）。
 *  - リンクごとに長いランダム合言葉（128bit 以上）＋期限＋失効を持たせる。
 * ここでは「生成・形式検証・期限判定・期限算出・URL 組み立て/解釈」だけを提供する。
 * 既存の uuidToShort / shortToUuid / genToken（App.jsx）には触れない。
 */

// 旧 SHARE_TOKEN_CHARS と同じ 54 文字（紛らわしい 0/O,1/I/l を除外・URL 安全）。
export const PORTAL_TOKEN_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

// 既定の乱数源（CSPRNG）。テストでは差し替え可能。n バイトの Uint8Array を返す。
const DEFAULT_RANDOM_BYTES = (n) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
};

/**
 * トークン生成。既定 24 文字（54^24 ≒ 138bit ≥ 128bit）。
 * modulo バイアスを避けるため棄却サンプリング（256 を 54 で割り切れる範囲 0..215 のみ採用）。
 * @param {number} length 文字数（既定 24）
 * @param {(n:number)=>Uint8Array} randomBytes 乱数源（既定 CSPRNG・テストで固定可能）
 */
export function genPortalToken(length = 24, randomBytes = DEFAULT_RANDOM_BYTES) {
  const A = PORTAL_TOKEN_CHARS;
  const m = A.length;                 // 54
  const max = Math.floor(256 / m) * m; // 216（これ以上の値は捨ててバイアスを無くす）
  let out = '';
  // 安全弁: 乱数源が尽きても無限ループにしない（十分大きい試行上限）。
  let guard = 0;
  while (out.length < length && guard < length * 64 + 64) {
    guard++;
    const buf = randomBytes(length - out.length);
    if (!buf || buf.length === 0) break;
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i];
      if (b < max) out += A[b % m]; // 0..215 のみ採用（216..255 は棄却）
    }
  }
  return out;
}

/**
 * 形式チェック（DB に問い合わせる前に弾く）。文字種＝PORTAL_TOKEN_CHARS のみ、長さ≥minLength。
 */
export function isValidTokenFormat(token, { minLength = 24 } = {}) {
  if (typeof token !== 'string') return false;
  if (token.length < minLength) return false;
  for (const ch of token) if (!PORTAL_TOKEN_CHARS.includes(ch)) return false;
  return true;
}

// 時刻を ms（数値）へ。Date / ISO文字列 / 数値(ms) を受ける。解釈不能は null。
function toMs(v) {
  if (v == null) return null;
  if (v instanceof Date) { const t = v.getTime(); return Number.isNaN(t) ? null : t; }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  return null;
}

/**
 * リンクが有効か。revoked_at があれば失効。expires_at が null なら無期限（有効）。
 * now（Date/ISO/ms）が expires_at 未満なら有効（ちょうど期限＝失効）。
 * expires_at が解釈不能な値のときは安全側に倒して無効（fail-closed）。
 */
export function isLinkActive(link, now) {
  if (!link) return false;
  if (link.revoked_at != null && link.revoked_at !== '') return false;
  const nowMs = toMs(now);
  if (nowMs == null) return false;
  if (link.expires_at == null || link.expires_at === '') return true; // 無期限
  const expMs = toMs(link.expires_at);
  if (expMs == null) return false; // 壊れた期限は無効扱い（fail-closed）
  return nowMs < expMs; // 期限ちょうどは失効
}

// 'YYYY-MM' / 'YYYY-M' を {y, mIdx} に。不正は null。
function parseYm(ym) {
  if (typeof ym !== 'string') return null;
  const m = ym.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mon = +m[2];
  if (mon < 1 || mon > 12) return null;
  return { y, mIdx: mon - 1 };
}

const DAY_MS = 86400000;
const JST_OFFSET_MS = 9 * 3600 * 1000; // JST は UTC+9（DST なし）

/**
 * 提出対象月(YYYY-MM)の「月末 23:59:59.999（JST）＋猶予日数」を expires_at(ISO) で返す。
 * 猶予 graceDays は決め打ちせず引数（既定 0）。不正な ym は null。
 */
export function monthEndExpiry(ym, graceDays = 0) {
  const p = parseYm(ym);
  if (!p) return null;
  // その月の最終日（UTC カレンダーで算出＝JST の暦日と一致：月末日は TZ 非依存）
  const lastDay = new Date(Date.UTC(p.y, p.mIdx + 1, 0)).getUTCDate();
  // JST 壁時計 y-mm-lastDay 23:59:59.999 を UTC 瞬間に変換（-9h）し、猶予日を足す。
  const ms = Date.UTC(p.y, p.mIdx, lastDay, 23, 59, 59, 999) - JST_OFFSET_MS + (graceDays || 0) * DAY_MS;
  return new Date(ms).toISOString();
}

/**
 * 共有リンク用: 発行時刻 now（Date/ISO/ms）から days 日後を expires_at(ISO) で返す。
 * days は引数（既定なしで必須）。now/days が不正なら null。
 */
export function daysFromNowExpiry(now, days) {
  const nowMs = toMs(now);
  if (nowMs == null || typeof days !== 'number' || !Number.isFinite(days)) return null;
  return new Date(nowMs + days * DAY_MS).toISOString();
}

/**
 * 共有シフトリンクの期限：対象シフト月(YYYY-MM)の「月末(JST)＋afterDays 日」を ISO で返す。
 * 決定済み仕様では afterDays=30（＝月末の30日後）。monthEndExpiry の薄いラッパー。不正な ym は null。
 */
export function shareExpiry(shiftYm, afterDays = 30) {
  return monthEndExpiry(shiftYm, afterDays);
}

/**
 * 希望休リンクの期限：締切日("YYYY-MM-DD") の「その日の終わり 23:59:59.999（JST）」を ISO で返す。
 * 締切は facilityConfig.depts[].deadline（または byMonth["YYYY-M"].deadline）に入っている日付文字列。
 * 不正・空は null（＝無期限扱いの判断は呼び出し側に委ねる）。
 */
export function deadlineExpiry(dateString) {
  if (typeof dateString !== 'string') return null;
  const m = dateString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mon = +m[2], d = +m[3];
  if (mon < 1 || mon > 12 || d < 1 || d > 31) return null;
  // 日の妥当性（2/30 等を弾く）: UTC で作って月/日が一致するか検査。
  const probe = new Date(Date.UTC(y, mon - 1, d));
  if (probe.getUTCMonth() !== mon - 1 || probe.getUTCDate() !== d) return null;
  // JST 壁時計 y-mon-d 23:59:59.999 を UTC 瞬間へ（-9h）。
  const ms = Date.UTC(y, mon - 1, d, 23, 59, 59, 999) - JST_OFFSET_MS;
  return new Date(ms).toISOString();
}

// baseUrl の末尾スラッシュを除く。
const stripTrailingSlash = (b) => (typeof b === 'string' ? b : '').replace(/\/+$/, '');

/** 新方式ポータルURL: <base>/?p=<token> （管理者 uuid は含めない）。 */
export function buildPortalUrl(baseUrl, token) {
  return `${stripTrailingSlash(baseUrl)}/?p=${encodeURIComponent(token)}`;
}

/** 新方式共有URL: <base>/?share=<token>。 */
export function buildShareUrl(baseUrl, token) {
  return `${stripTrailingSlash(baseUrl)}/?share=${encodeURIComponent(token)}`;
}

/**
 * URL の query を解釈する。例外は投げず、該当なしは {kind:null}。
 *  - ?staff=... → legacy-staff（旧ポータル。uuid 可逆・併用期間用。token は持たない）
 *  - ?p=...     → portal（新ポータル）
 *  - ?share=... → share（新/旧共有。旧は 8 文字＝isValidTokenFormat が false→ legacy:true）
 * @param {string|URLSearchParams} search window.location.search 等
 */
export function parseLinkParams(search) {
  let sp;
  try {
    sp = search instanceof URLSearchParams ? search : new URLSearchParams(typeof search === 'string' ? search : '');
  } catch {
    return { kind: null, token: null };
  }
  const staff = sp.get('staff');
  if (staff) {
    return { kind: 'legacy-staff', token: null, staff, dept: sp.get('dept') || null, cfg: sp.get('cfg') || null, ym: sp.get('ym') || null };
  }
  const p = sp.get('p');
  if (p) return { kind: 'portal', token: p, dept: sp.get('dept') || null, ym: sp.get('ym') || null };
  const share = sp.get('share');
  if (share) return { kind: 'share', token: share, legacy: !isValidTokenFormat(share) };
  return { kind: null, token: null };
}
