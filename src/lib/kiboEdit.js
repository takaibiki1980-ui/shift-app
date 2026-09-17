/**
 * 希望休(kiboByMonth)・有給(yukyuByMonth)の日番号配列を、右クリック編集で切り替える純粋ロジック。
 * 生成・core.js には非関与（入力データの編集のみ）。staff_kibo テーブルへの write-through は呼び出し側。
 *
 * ルール:
 *  - kind='kibo': 対象日が希望休にあれば解除、なければ付与（付与時は同日の有給を外す＝排他）。
 *  - kind='yukyu': 対象日が有給にあれば解除、なければ付与（付与時は同日の希望休を外す＝排他）。
 *  - 1日が希望休と有給の両方になることはない（排他）。
 *
 * @param {number[]} kiboArr   現在の希望休日配列
 * @param {number[]} yukyuArr  現在の有給日配列
 * @param {number[]} days      切り替え対象の日番号（複数可＝一括）
 * @param {'kibo'|'yukyu'} kind
 * @returns {{days:number[], yukyu_days:number[]}} 更新後の配列（昇順・重複なし）
 */
export function toggleKiboDays(kiboArr, yukyuArr, days, kind) {
  const kibo = new Set((kiboArr || []).map(Number));
  const yuk = new Set((yukyuArr || []).map(Number));
  for (const dRaw of (days || [])) {
    const d = Number(dRaw);
    if (kind === 'kibo') {
      if (kibo.has(d)) kibo.delete(d); else { kibo.add(d); yuk.delete(d); }
    } else {
      if (yuk.has(d)) yuk.delete(d); else { yuk.add(d); kibo.delete(d); }
    }
  }
  const sort = (set) => [...set].sort((a, b) => a - b);
  return { days: sort(kibo), yukyu_days: sort(yuk) };
}
