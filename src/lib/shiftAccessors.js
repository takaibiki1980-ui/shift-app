/**
 * shiftAccessors — 共通データアクセサ（care/time 共用・純関数・読み取り専用）
 *
 * エンジン内部から dept.shiftTimes 等の生フィールドを直接読むことを禁止し、
 * この5本を唯一の読み取り口とする。
 * 命名差異・形式差異（文字列キー↔数値キーなど）はこの層で吸収する。
 *
 * 参照元フィールドまとめ:
 *   getShiftDefinition  : dept.shiftTimes[key]             → { start, end }
 *                         DEFAULT_SHIFT_TIMES[key]          (フォールバック)
 *   getAllowedShiftTypes : dept.roleShiftTypes[role]        → string[]
 *                         dept.shiftTypes                   (制限なし時のフォールバック)
 *   getMaxStaff         : dept.maxStaff[shiftKey]          → number
 *   getLockedRequest    : s.kiboByMonth[mk]                → number[]   (希望休)
 *                         s.yukyuByMonth[mk]               → number[]   (有休)
 *                         s.shiftRequestsByMonth[mk]       → { [dayStr]: shiftKey } (希望勤務)
 *   getPrevShift        : prevTail[staffId][dayNum]        → shiftKey
 */

// ── デフォルト時刻（App.jsx の DEFAULT_SHIFT_TIMES と同一） ────────────────────
const DEFAULT_SHIFT_TIMES = {
  早番: { start: '07:00', end: '16:00' },
  日勤: { start: '09:00', end: '18:00' },
  遅番: { start: '11:30', end: '20:30' },
  夜勤: { start: '16:30', end: '09:30' },
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. getShiftDefinition
// ═════════════════════════════════════════════════════════════════════════════
/**
 * シフト時刻定義を取得する。
 *
 * 解決優先順位:
 *   ① dept.shiftTimes[shiftKey]            — 勤務時間設定モーダルで入力された時刻
 *   ② DEFAULT_SHIFT_TIMES[shiftKey]        — 早番/日勤/遅番/夜勤のハードコード値
 *
 * @param {object} dept
 * @param {string} shiftKey  例: '早番' '日勤' '夜勤'
 * @returns {{ start: string, end: string } | null}
 *   例: { start: '07:00', end: '16:00' }
 *   いずれにも定義がない場合は null（明け・休みなど時刻のないシフト）
 */
export function getShiftDefinition(dept, shiftKey) {
  // ① dept.shiftTimes（両フィールドが揃っている場合のみ採用）
  const st = dept?.shiftTimes?.[shiftKey];
  if (st?.start && st?.end) return { start: st.start, end: st.end };

  // ② DEFAULT_SHIFT_TIMES フォールバック
  const def = DEFAULT_SHIFT_TIMES[shiftKey];
  if (def) return { ...def };

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. getAllowedShiftTypes
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 役職が配置可能なシフト種別一覧を取得する。
 *
 * 参照元: dept.roleShiftTypes[role]
 *   エントリなし = 制限なし → dept.shiftTypes を全件返す
 *   （介護エンジンの getAllowedTypes と完全互換。UI・設定モーダルの変更不要）
 *
 * @param {object} dept
 * @param {string} role  例: '調理師' '管理栄養士'
 * @returns {string[]}  例: ['早番', '日勤']
 */
export function getAllowedShiftTypes(dept, role) {
  const allowed = dept?.roleShiftTypes?.[role];
  // エントリあり → 指定シフトのみ（浅いコピーを返す。呼び出し元が変更しても影響しない）
  if (allowed) return [...allowed];
  // エントリなし → 部署の全シフト種別（制限なし）
  return [...(dept?.shiftTypes || [])];
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. getMaxStaff
// ═════════════════════════════════════════════════════════════════════════════
/**
 * シフト種別の上限人数を取得する。
 *
 * 参照元: dept.maxStaff[shiftKey]（実DB形式のまま。maxPerShift への改名なし）
 * 未設定・undefined・null の場合は Infinity を返す（上限なし扱い）。
 *
 * @param {object} dept
 * @param {string} shiftKey  例: '早番'
 * @returns {number}  例: 1  /  Infinity
 */
export function getMaxStaff(dept, shiftKey) {
  const v = dept?.maxStaff?.[shiftKey];
  return v != null && Number.isFinite(v) ? v : Infinity;
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. getLockedRequest  +  buildRequests（組み立てヘルパー）
// ═════════════════════════════════════════════════════════════════════════════

/**
 * スタッフ配列と対象月から requests マップを組み立てる。
 *
 * 参照するフィールド（すべてスタッフオブジェクト上）:
 *   s.kiboByMonth[mk]           → number[]（希望休の日番号リスト）
 *   s.yukyuByMonth[mk]          → number[]（有休の日番号リスト）
 *   s.shiftRequestsByMonth[mk]  → { [dayStr: string]: shiftKey }（希望勤務）
 *
 * monthKey 形式: "${year}-${month+1}"  例: "2026-7"（App.jsx の monthKey と一致）
 *
 * 同日に複数種が重複した場合の優先順位（後から上書き）:
 *   shiftRequest（最低）→ kiboRest（中）→ yukyu（最高）
 *
 * @param {object[]} staffs
 * @param {number} year
 * @param {number} month  0-indexed
 * @returns {{ [staffId: string]: { [day: number]: { type: string, shiftKey: string } } }}
 */
export function buildRequests(staffs, year, month) {
  const mk = `${year}-${month + 1}`;
  const result = {};

  for (const s of staffs) {
    const map = {};

    // ① 希望勤務（最低優先 — kiboRest/yukyu で上書きされる）
    //    キーは文字列 → Number 変換をここで吸収する
    const reqs = s.shiftRequestsByMonth?.[mk] || {};
    for (const [dayStr, shiftKey] of Object.entries(reqs)) {
      const d = Number(dayStr);
      if (d > 0) map[d] = { type: 'shiftRequest', shiftKey };
    }

    // ② 希望休（中優先）
    for (const d of (s.kiboByMonth?.[mk] || []).map(Number)) {
      if (d > 0) map[d] = { type: 'kiboRest', shiftKey: '希望休' };
    }

    // ③ 有休（最高優先）
    for (const d of (s.yukyuByMonth?.[mk] || []).map(Number)) {
      if (d > 0) map[d] = { type: 'yukyu', shiftKey: '有休' };
    }

    if (Object.keys(map).length > 0) result[s.id] = map;
  }

  return result;
}

/**
 * 指定スタッフ・日のロック済みリクエストを取得する。
 *
 * requests は buildRequests() で組み立てたマップを渡す。
 * day パラメータは文字列・数値どちらでも受け付ける（Number() 変換を内包）。
 *
 * @param {string} staffId
 * @param {number|string} day  日番号（1〜31）
 * @param {object} requests  buildRequests() の返値
 * @returns {{ type: 'kiboRest'|'yukyu'|'shiftRequest', shiftKey: string } | null}
 */
export function getLockedRequest(staffId, day, requests) {
  return requests?.[staffId]?.[Number(day)] ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. getPrevShift
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 前月末の最終勤務シフトを取得する。月跨ぎ制約（minInterval / nightSetPattern）用。
 *
 * 参照元: prevTail[staffId]  → { [dayNum: number]: shiftKey }
 * prevTail は末尾5日分のみ格納されているため、最大の dayNum を最終日とする。
 *
 * @param {object} prevTail  例: { 'eiyo_0': { 28: '日勤', 29: '早番', 30: '早番' } }
 * @param {string} staffId
 * @returns {string | null}  例: '早番'  /  null（データなし）
 */
export function getPrevShift(prevTail, staffId) {
  const tail = prevTail?.[staffId];
  if (!tail) return null;
  const dayNums = Object.keys(tail).map(Number);
  if (!dayNums.length) return null;
  return tail[Math.max(...dayNums)] ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. getStaffTrend
// ═════════════════════════════════════════════════════════════════════════════
/**
 * learnedTrend からスタッフのトレンドオブジェクトを取得する。
 *
 * learnedTrend のキーは staffName（computeLearnedTrend の仕様）。
 * staffName キーへのアクセスはこの関数が唯一の吸収点とし、
 * エンジン内の他コードは staffId・staffName を直接参照しない。
 *
 * @param {object} learnedTrend  computeLearnedTrend() の返値
 * @param {{ name: string }}   staff  スタッフオブジェクト（name フィールドを使用）
 * @returns {object | null}
 */
export function getStaffTrend(learnedTrend, staff) {
  return learnedTrend?.[staff?.name] ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. getDowShiftRate
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 指定日の曜日別シフト確率マップを返す。
 *
 * dowShiftRate の曜日インデックスは getDay() 準拠（0=日〜6=土）。
 * 曜日変換はこの関数内で完結させ、呼び出し元に漏らさない。
 *
 * @param {object | null} trend  getStaffTrend() の返値
 * @param {Date | string} date   Date オブジェクト、または "YYYY-MM-DD" 文字列
 * @returns {{ [shiftKey: string]: number } | null}
 *   例: { 早番: 0.4, 日勤: 0.4, 遅番: 0.2 }
 *   trend が null、または該当曜日がデータ薄の場合は null
 */
export function getDowShiftRate(trend, date) {
  if (!trend?.dowShiftRate) return null;
  const dow = (date instanceof Date ? date : new Date(date)).getDay(); // 0=日〜6=土
  return trend.dowShiftRate[dow] ?? null;
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. getDowRestRate
// ═════════════════════════════════════════════════════════════════════════════
/**
 * 指定日の曜日別休み出現率を返す。
 *
 * dowRestRate の曜日インデックスは (getDay()+6)%7 準拠（0=月〜6=日）。
 * dowShiftRate とインデックス体系が異なるため、変換はこの関数内で完結させる。
 *
 * @param {object | null} trend  getStaffTrend() の返値
 * @param {Date | string} date   Date オブジェクト、または "YYYY-MM-DD" 文字列
 * @returns {number | null}  0-1 の休み出現率、またはデータなしの場合 null
 */
export function getDowRestRate(trend, date) {
  if (!trend?.dowRestRate) return null;
  const dow = (date instanceof Date ? date : new Date(date)).getDay();
  const idx = (dow + 6) % 7; // 0=月〜6=日
  const v = trend.dowRestRate[idx];
  return v != null ? v : null;
}
