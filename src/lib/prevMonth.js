/**
 * 月またぎ（前月データ読み取り）の純粋ロジック。テスト対象。
 * App.jsx の生成前処理（前月キーの決定・旧形式フォールバック・prevTail 組み立て・
 * 前月に居ない職員の検出）をここに集約し、同じ関数を使い回す。
 * core.js（生成本体）には一切関係しない。
 */

// 前月の年・月index（0始まり）と、読み取りキー2種（部署別／旧形式・部署なし）。
// 1月(month=0)は前年12月に繰り下げる。
export function prevMonthInfo(year, month) {
  const pY = month === 0 ? year - 1 : year;
  const pIdx = month === 0 ? 11 : month - 1;
  return {
    pY, pIdx,
    perDeptKey: (deptId) => `shifts_${pY}_${pIdx + 1}_${deptId}`,
    legacyKey: `shifts_${pY}_${pIdx + 1}`,
  };
}

// 前月の生データ { [staffId]: { [dayStr]: shift } } を選ぶ。
// ① 部署別キー shifts_Y_M_dept  ② 無ければ旧形式 shifts_Y_M の [deptId]
// rowMap は { data_key: data_value } のマップ（キャッシュでも直接取得結果でも同形）。
export function pickPrevRaw(rowMap, deptId, year, month) {
  const { perDeptKey, legacyKey } = prevMonthInfo(year, month);
  const per = rowMap ? rowMap[perDeptKey(deptId)] : undefined;
  if (per) return { raw: per, source: 'per-dept' };
  const legacy = rowMap ? rowMap[legacyKey] : undefined;
  if (legacy && legacy[deptId]) return { raw: legacy[deptId], source: 'legacy' };
  return { raw: null, source: null };
}

const daysInMonth = (y, mIdx) => new Date(y, mIdx + 1, 0).getDate();

// 前月末尾6日分の tail（{ [staffId]: { [dayNum]: shift } }）を作る。
// consecWork は5日だが週◯日の月またぎ用に6日分持つ（App の従来仕様と同一）。
export function buildPrevTail(raw, pY, pIdx) {
  const tail = {};
  if (!raw) return tail;
  const pd = daysInMonth(pY, pIdx);
  const ts = Math.max(1, pd - 5);
  for (const [sid, dm] of Object.entries(raw)) {
    const t = {};
    for (let d = ts; d <= pd; d++) { const v = dm[String(d)]; if (v) t[d] = v; }
    if (Object.keys(t).length > 0) tail[sid] = t;
  }
  return tail;
}

// tail に居ない現在スタッフ id の一覧（前月に紐づかない＝月またぎが効かない人）。
export function missingPrevStaff(tail, staffIds) {
  return (staffIds || []).filter((id) => !tail[id]);
}

// 前月の生データ raw（{ [staffId]: { [dayStr]: shift } }）と現スタッフ一覧から、通知用に2種類へ分ける。
//  noLink : 前月の職員一覧（raw のキー）に id が無い。部署や職員を作り直して前月と紐づかない可能性。
//  noWork : id はあるが前月に勤務が1つも入っていない（その月に未入力）。
// raw が無い（前月なし）場合は全員 noLink 扱いにはせず、呼び出し側が「前月なし」通知を別に出す想定で
// 空を返す。表示専用の集計で、生成には一切関与しない。
export function classifyPrevStaff(raw, staffIds) {
  const noLink = [], noWork = [];
  if (!raw) return { noLink, noWork };
  const present = new Set(Object.keys(raw));
  for (const id of (staffIds || [])) {
    if (!present.has(id)) { noLink.push(id); continue; }
    const dm = raw[id] || {};
    const hasAny = Object.values(dm).some((v) => v); // 何か勤務が入っているか（空文字/未設定は勤務なし）
    if (!hasAny) noWork.push(id);
  }
  return { noLink, noWork };
}

// ── 前月取得の3状態 ───────────────────────────────────────────────
//  'error' : 取得に失敗した（通信エラー等）。前月が有るか無いか判断できない。
//  'none'  : 取得は成功したが、前月が保存されていないと確認できた。
//  'ok'    : 前月データが取れた（raw に中身あり）。
// 「失敗」と「無い」を同じ null で潰さないために status で区別する。
export const PREV_ERROR = 'error';
export const PREV_NONE = 'none';
export const PREV_OK = 'ok';

// Supabase の2回の取得結果（r1=部署別キー, r2=旧形式キー。いずれも {data,error} 形）から
// 3状態を判定する純関数。どちらかでも error があれば即 'error'（＝前月の有無を断定しない）。
// r1/r2 は { data: { data_value } | null, error: Error|null } を想定。
export function classifyPrevFetch(r1, r2, deptId) {
  if (!r1 || r1.error) return { status: PREV_ERROR, raw: null, source: null };
  if (r1.data?.data_value) return { status: PREV_OK, raw: r1.data.data_value, source: 'per-dept' };
  if (!r2 || r2.error) return { status: PREV_ERROR, raw: null, source: null };
  const legacyVal = r2.data?.data_value;
  if (legacyVal && legacyVal[deptId]) return { status: PREV_OK, raw: legacyVal[deptId], source: 'legacy' };
  return { status: PREV_NONE, raw: null, source: null };
}
