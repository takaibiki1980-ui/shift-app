/**
 * 部署独自の「前日の勤務 → 翌日の勤務」を強制するルールの純粋ロジック。
 *
 * dept.transitionForces = [{ from:'休み', to:'遅番' }, ...] を持たせ、
 * 「前日が from なら翌日は必ず to にする」を表現する。生成の後処理で
 * 「適用条件を満たす時のみ置換・満たさなければ諦める」形で使う想定（PR-3）。
 *
 * PR-1 はこの純粋関数とテストのみ（core.js / UI には未配線）。
 *
 * 設計上の約束:
 *  - 個別の希望（右クリックでロックされた希望）が強制より優先される → 呼び出し側で
 *    ロック日をスキップ（ここでは判定のみ提供）。
 *  - 必要人数(minStaff)等の絶対制約が上位 → 呼び出し側で feasibility を確認し、
 *    崩れるなら適用しない（諦める）。
 *  - 役職での絞り込み（to が可能な役職のみ）→ 呼び出し側で roleShiftTypes を確認。
 *  - 夜勤/明けは夜勤連鎖と混同しないため UI 側で from/to の選択肢から除外する想定。
 */

/**
 * 遷移 (prev → curr) に対し、強制ルール forces が「curr を別の値へ強制するか」を返す。
 * prev が from に一致する最初のルールの to を返す（後勝ちにしたい場合は呼び出し側で調整）。
 * 既に curr が to と同じなら null（変更不要）。該当なしも null。
 * @param {string} prev   前日の勤務種別
 * @param {string} curr   現在（翌日）の勤務種別
 * @param {Array}  forces [{from,to}, ...]（dept.transitionForces）
 * @returns {string|null} 強制すべき to（置換先）/ 変更不要・該当なしは null
 */
export function forcedShiftFor(prev, curr, forces) {
  if (!prev || !Array.isArray(forces) || forces.length === 0) return null;
  for (const f of forces) {
    if (f && f.from === prev) {
      if (!f.to || f.to === curr) return null; // 既に to・不正 to は何もしない
      return f.to;
    }
  }
  return null;
}

/**
 * 保存用に強制パターン配列を正規化する（純粋・非破壊）。
 * - from / to が両方あり、from !== to のものだけ残す（空・自己遷移を除去）。
 * - from,to の前後空白を除去。
 * - 同一 from の重複を除去（先勝ち）。1つの from に複数の to は無意味なため from 単位で一意化。
 * @param {Array} forces
 * @returns {Array} 正規化後の配列（[{from,to}]）
 */
export function sanitizeForces(forces) {
  const out = [];
  const seenFrom = new Set();
  for (const f of (forces || [])) {
    if (!f) continue;
    const from = (f.from == null ? '' : String(f.from)).trim();
    const to = (f.to == null ? '' : String(f.to)).trim();
    if (!from || !to || from === to) continue;
    if (seenFrom.has(from)) continue; // 同一 from は先勝ち（1 from → 1 to）
    seenFrom.add(from);
    out.push({ from, to });
  }
  return out;
}

/** 表示用ラベル。例: "休み → 遅番" */
export function forceLabel(f) {
  return `${f?.from ?? ''} → ${f?.to ?? ''}`;
}
