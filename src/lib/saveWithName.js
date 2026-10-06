/**
 * 「保存 → ピン作成」の直列処理（純粋・副作用は注入された関数だけ）。
 *
 * 保存ボタンで「名前を入れる」を選んだときの流れをテスト可能にするため、
 * saveNow / ピン insert / 組み立て済みのピン行 を引数で受け取り、順に呼ぶだけにする。
 *
 * ルール:
 *  - saveNow() が false（保存失敗）なら、ピンは作らずに終わる。
 *  - pinRow が null（名前が空など）なら、保存は成功のままピンは作らない。
 *  - ピンの insert だけ失敗したら、保存は成功のまま pinError を返す（保存は巻き戻さない）。
 *
 * @param {Object} a
 * @param {() => Promise<boolean>} a.saveNow 保存。成功で true。
 * @param {Object|null} a.pinRow buildPinFromCurrent の結果（null ならピンを作らない）。
 * @param {(row: Object) => Promise<{error?: any}>} a.insertPin ピン行を保存する関数（Supabase insert 相当）。
 * @returns {Promise<{saved: boolean, pinned: boolean, pinError: any}>}
 */
export async function saveThenPin({ saveNow, pinRow, insertPin }) {
  const saved = await saveNow();
  if (!saved) return { saved: false, pinned: false, pinError: null };
  if (!pinRow) return { saved: true, pinned: false, pinError: null };
  try {
    const res = await insertPin(pinRow);
    if (res && res.error) return { saved: true, pinned: false, pinError: res.error };
    return { saved: true, pinned: true, pinError: null };
  } catch (e) {
    return { saved: true, pinned: false, pinError: e };
  }
}
