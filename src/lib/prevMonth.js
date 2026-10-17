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
