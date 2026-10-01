/**
 * 部署独自の「前日の勤務 → 翌日の勤務」を禁止するルールの純粋ロジック。
 *
 * dept.transitionBans = [{ from:'休み', to:'早番' }, ...] を持たせ、
 * 「前日が from かつ 翌日が to」の遷移を禁止する。既存の isBadTransition
 * （遅番→早番 等のハードコード／allowLateToEarly）とは独立した追加ルール。
 * 「夜勤→明け→休み」セットとは無関係。役職での対象絞り込みは roleShiftTypes が
 * 別途担保する（to が配置不可の役職にはそもそも to が出ない）ため、ここでは扱わない。
 *
 * PR-1 はこの純粋関数とテストのみ。isBadTransition への反映は後続 PR。
 */

/**
 * 遷移 (prev → curr) が、禁止パターン bans のいずれかに一致するか。
 * @param {string} prev  前日の勤務種別
 * @param {string} curr  翌日の勤務種別
 * @param {Array}  bans  [{from,to}, ...]（dept.transitionBans）
 * @returns {boolean} 一致（＝禁止）なら true
 */
export function isBannedTransition(prev, curr, bans) {
  if (!prev || !curr || !Array.isArray(bans) || bans.length === 0) return false;
  return bans.some((b) => b && b.from === prev && b.to === curr);
}

/**
 * 保存用に禁止パターン配列を正規化する（純粋・非破壊）。
 * - from / to が両方あり、from !== to のものだけ残す（空・自己遷移を除去）。
 * - from,to の前後空白を除去。
 * - from-to の重複を除去（先勝ち）。
 * @param {Array} bans
 * @returns {Array} 正規化後の配列（[{from,to}]）
 */
export function sanitizeBans(bans) {
  const out = [];
  const seen = new Set();
  for (const b of (bans || [])) {
    if (!b) continue;
    const from = (b.from == null ? '' : String(b.from)).trim();
    const to = (b.to == null ? '' : String(b.to)).trim();
    if (!from || !to || from === to) continue;
    const key = `${from}\u0000${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to });
  }
  return out;
}

/** 表示用ラベル。例: "休み → 早番" */
export function banLabel(b) {
  return `${b?.from ?? ''} → ${b?.to ?? ''}`;
}
