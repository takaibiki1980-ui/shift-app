/**
 * 配列要素の並び替え（上下移動）の純粋ロジック。生成・core.js には非関与。
 * 部署(depts)やスタッフなど、id を持つオブジェクト配列の順序変更に使う。
 */

/**
 * id の要素を上(dir=-1)または下(dir=+1)へ1つ移動した新配列を返す（非破壊）。
 * 端で移動できない・id が無い・不正な dir の場合は同一参照を返す。
 * @param {Array} arr   id を持つオブジェクト配列
 * @param {string} id   移動する要素の id
 * @param {number} dir  -1=上へ / +1=下へ
 * @returns {Array} 並び替え後の新配列（変化なしなら同一参照）
 */
export function moveById(arr, id, dir) {
  if (!Array.isArray(arr) || arr.length < 2) return arr;
  if (dir !== -1 && dir !== 1) return arr;
  const i = arr.findIndex((x) => x && x.id === id);
  if (i < 0) return arr;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr; // 端 → 移動不可
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 'up' | 'down' 表記のラッパ。 */
export function moveByIdDir(arr, id, direction) {
  return moveById(arr, id, direction === 'up' ? -1 : direction === 'down' ? 1 : 0);
}
