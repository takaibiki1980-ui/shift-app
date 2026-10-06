/**
 * シフト表 右側集計の「休」「有」の数え方（純粋ロジック）。
 *
 * PR-1 はこの純粋関数とテストのみ（画面・CSV・印刷・共有の配線は PR-2、有効化は PR-3）。
 * workDayValue や生成ロジック・core.js には非関与。「計」の数え方は変えない。
 *
 * 仕様:
 *  - 休(rest): セル値の休系（既存 restCnt と同じ。明け・有休は除外、半日休と有/休は0.5）
 *      ＋ 申請の希望休(kiboByMonth) のうち「その日のセルに値が無い」日を 1 として加算。
 *  - 有(paid): 有休=1 / 半日有給(HALF_PAID_TYPES)=0.5 / 有/休(HALF_PAIDREST)=0.5
 *      ＋ 申請の有休(yukyuByMonth) のうち「その日のセルに値が無い」日を 1 として加算。
 *  - 「セルに値が無い」は画面 isKibo/isYukyu・印刷HTML と同じ定義（効果的セル値が空）。
 *    呼び出し側で effectiveCellShift 等により解決した値を cellByDay に渡すこと。
 *    同じ日を二重に数えないため、申請加算は cellByDay[day] が空の日に限る。
 */

// App.jsx の同名セットと同一定義（集計専用・生成ロジックとは独立）。
export const HALF_REST_TYPES = new Set(["日/休", "休/日", "早/休", "休/遅"]);      // 半日休=0.5
export const HALF_PAID_TYPES = new Set(["早/有", "日/有", "有/日", "有/遅"]);      // 半日有給（有給0.5）
export const HALF_PAIDREST_TYPES = new Set(["有/休"]);                              // 午前有給+午後公休（休0.5・有0.5）

/**
 * その人の1か月分から「休」と「有」の数を返す（純粋・非破壊）。
 * @param {Object} a
 * @param {Object<number,string>} a.cellByDay 日→効果的セル値（空/未定義=値なし）
 * @param {number[]} [a.kiboDays]  申請の希望休の日（kiboByMonth[mk]）
 * @param {number[]} [a.yukyuDays] 申請の有休の日（yukyuByMonth[mk]）
 * @param {Set<string>} a.deptRest 部署の休み種別（buildDeptRestTypes の結果）
 * @returns {{rest:number, paid:number}}
 */
export function countRestAndPaid({ cellByDay = {}, kiboDays = [], yukyuDays = [], deptRest }) {
  let rest = 0, paid = 0;
  for (const v of Object.values(cellByDay)) {
    if (!v) continue;
    // 休（既存 restCnt と同じ式）
    if ((deptRest.has(v) || HALF_PAIDREST_TYPES.has(v)) && v !== "明け" && v !== "有休") {
      rest += (HALF_REST_TYPES.has(v) || HALF_PAIDREST_TYPES.has(v)) ? 0.5 : 1;
    }
    // 有
    if (v === "有休") paid += 1;
    else if (HALF_PAID_TYPES.has(v)) paid += 0.5;
    else if (HALF_PAIDREST_TYPES.has(v)) paid += 0.5;
  }
  // 申請分（その日のセルに値が無い日だけ＝二重計上しない）
  for (const d of kiboDays) if (!cellByDay[d]) rest += 1;
  for (const d of yukyuDays) if (!cellByDay[d]) paid += 1;
  return { rest, paid };
}
