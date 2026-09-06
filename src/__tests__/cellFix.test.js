/**
 * セル固定機能テスト
 *  - 固定/解除の状態遷移（applyCellFix）
 *  - 固定セルが自動生成で変更されない（shiftRequestsByMonth ロック機構）
 *  - 固定解除で通常セルに戻る（生成が自由に埋める）
 *  - 有休固定時に有給残数が二重減算されない
 *  - 固定なしの生成が従来通り動く（非劣化）
 */
import { describe, test, expect } from 'vitest';
import { applyCellFix } from '../lib/cellFix.js';
import { computePaidLeaveConsumed } from '../lib/paidLeave.js';
import { autoGenerate, getDays, monthKey } from '../engine/core.js';

const YEAR = 2026, MONTH = 1; // 2月(28日)
const mk = monthKey(YEAR, MONTH);
const days = getDays(YEAR, MONTH);

function eiyoDept() {
  return {
    id: 'eiyo', shiftTypes: ['早番', '遅番', '日勤'],
    minStaff: { 早番: 1, 遅番: 1, 日勤: 1 }, maxStaff: { 早番: 1, 遅番: 1, 日勤: 99 },
    defaultKyukoDays: 9, maxConsec: 5, maxConsecutive: 5, customShiftDefs: [],
    roleShiftTypes: { '常勤': ['早番', '遅番', '日勤'] },
  };
}
function makeStaff(n = 4) {
  const b = { dept: 'eiyo', kyukoDays: 9, kyukoDaysByMonth: {}, kiboByMonth: {}, yukyuByMonth: {}, shiftRequestsByMonth: {} };
  return Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: 'E' + i, role: '常勤', ...b }));
}

// ────────────────────────────────────────────────────────────────
describe('applyCellFix（固定＝希望勤務の状態遷移・shiftRequestsByMonthで統一判定）', () => {
  test('固定: セル値を shiftRequestsByMonth に載せる（fixedByMonthマーカーは廃止）', () => {
    const s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {} };
    const shifts = { e0: { 10: '早番' } };
    const r = applyCellFix(s, [['e0', 10]], true, shifts, YEAR, MONTH);
    expect(r.shiftRequestsByMonth[mk][10]).toBe('早番');
    expect(r.fixedByMonth).toBeUndefined(); // マーカーは作らない
  });

  test('空セルは固定しない', () => {
    const s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {} };
    const r = applyCellFix(s, [['e0', 10]], true, { e0: {} }, YEAR, MONTH);
    expect(r.shiftRequestsByMonth[mk][10]).toBeUndefined();
  });

  test('解除: shiftRequestsByMonth から削除', () => {
    const s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: { [mk]: { 10: '早番' } } };
    const r = applyCellFix(s, [['e0', 10]], false, { e0: { 10: '早番' } }, YEAR, MONTH);
    expect(r.shiftRequestsByMonth[mk][10]).toBeUndefined();
  });

  test('固定→解除で固定前の状態に戻る（希望勤務も残らない）', () => {
    let s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {} };
    s = applyCellFix(s, [['e0', 5]], true, { e0: { 5: '遅番' } }, YEAR, MONTH);
    s = applyCellFix(s, [['e0', 5]], false, { e0: { 5: '遅番' } }, YEAR, MONTH);
    expect(s.shiftRequestsByMonth[mk][5]).toBeUndefined();
  });

  test('スタッフ設定の希望勤務も右クリック固定も同一（shiftRequestsByMonthで固定判定が一致）', () => {
    // スタッフ設定で希望勤務を入れた状態 = 右クリック固定した状態 = 同じ
    const viaStaffEdit = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: { [mk]: { 7: '日勤' } } };
    const viaRightClick = applyCellFix({ id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {} }, [['e0', 7]], true, { e0: { 7: '日勤' } }, YEAR, MONTH);
    expect(viaRightClick.shiftRequestsByMonth[mk][7]).toBe(viaStaffEdit.shiftRequestsByMonth[mk][7]);
  });

  test('対象外スタッフは変更しない（同一参照）', () => {
    const s = { id: 'e1', dept: 'eiyo', shiftRequestsByMonth: {} };
    expect(applyCellFix(s, [['e0', 5]], true, { e0: { 5: '早番' } }, YEAR, MONTH)).toBe(s);
  });
});

// ────────────────────────────────────────────────────────────────
describe('固定セルが自動生成で変更されない（shiftRequestsByMonthロック）', () => {
  test('【本不具合の回帰】右クリック「希望勤務にする」→自動生成でそのセルが上書きされない', () => {
    // シフト画面の右クリック相当: deptShifts の現在値(遅番)を applyCellFix で
    // staffList の shiftRequestsByMonth に載せる（applyFixが実行する処理そのもの）
    const deptShiftsNow = { e0: { 10: '遅番' } }; // 生成直後などにセルにある値
    const staff = makeStaff();
    staff[0] = applyCellFix(staff[0], [['e0', 10]], true, deptShiftsNow, YEAR, MONTH);
    // その staffList で再生成しても、右クリックした遅番が毎回ロックされ上書きされない
    for (let i = 0; i < 20; i++) {
      const { shifts } = autoGenerate(staff, eiyoDept(), YEAR, MONTH, {}, {}, {});
      expect(shifts.e0[10]).toBe('遅番');
    }
    // スタッフ設定経由(shiftRequestsByMonth直接設定)と同一状態であることも確認（データソース統一）
    const viaStaffEdit = makeStaff();
    viaStaffEdit[0] = { ...viaStaffEdit[0], shiftRequestsByMonth: { [mk]: { 10: '遅番' } } };
    expect(staff[0].shiftRequestsByMonth[mk][10]).toBe(viaStaffEdit[0].shiftRequestsByMonth[mk][10]);
  });

  test('固定した休み・有休も生成後に保持される', () => {
    const staff = makeStaff();
    staff[0] = applyCellFix(staff[0], [['e0', 8]], true, { e0: { 8: '休み' } }, YEAR, MONTH);
    staff[1] = applyCellFix(staff[1], [['e1', 12]], true, { e1: { 12: '有休' } }, YEAR, MONTH);
    for (let i = 0; i < 15; i++) {
      const { shifts } = autoGenerate(staff, eiyoDept(), YEAR, MONTH, {}, {}, {});
      expect(shifts.e0[8]).toBe('休み');
      expect(shifts.e1[12]).toBe('有休');
    }
  });

  test('固定を解除すると、その日は生成で他の値になり得る（ロックが外れる）', () => {
    // d10 を遅番固定 → 解除。固定なしなら生成が自由に埋める＝常に遅番とは限らない
    let base = makeStaff()[0];
    base = applyCellFix(base, [['e0', 10]], true, { e0: { 10: '遅番' } }, YEAR, MONTH);
    base = applyCellFix(base, [['e0', 10]], false, { e0: { 10: '遅番' } }, YEAR, MONTH);
    // shiftRequestが空＝ロックなし。生成結果のd10は固定されない（値の一貫性を保証しない）
    expect(base.shiftRequestsByMonth[mk][10]).toBeUndefined();
    let varied = false; let first = null;
    for (let i = 0; i < 30; i++) {
      const staff = makeStaff(); staff[0] = base;
      const { shifts } = autoGenerate(staff, eiyoDept(), YEAR, MONTH, {}, {}, {});
      if (first === null) first = shifts.e0[10];
      if (shifts.e0[10] !== first) { varied = true; break; }
    }
    expect(varied).toBe(true); // ロックが外れ、生成で変動する
  });
});

// ────────────────────────────────────────────────────────────────
// 右クリックメニューで値を選ぶ = 配置 + 希望勤務ロック（handleMenuSelect のデータフローを再現）。
//   実装: fix = !!shiftKey、選択値そのものを shiftsNow 形に包んで applyCellFix に渡す。
function menuSelect(staffList, targets, shiftKey) {
  const fix = !!shiftKey;
  const synthNow = {};
  for (const [sid, d] of targets) synthNow[sid] = { ...(synthNow[sid] || {}), [d]: shiftKey };
  return staffList.map(s => applyCellFix(s, targets, fix, synthNow, YEAR, MONTH));
}

describe('右クリックで勤務を入れたら即・希望勤務ロック（仕様1・2）', () => {
  test('右クリックで勤務を選ぶ→shiftRequestsByMonthに登録され自動生成で上書きされない（仕様1,3）', () => {
    let staff = makeStaff();
    staff = menuSelect(staff, [['e0', 10]], '遅番'); // 2度目の「希望勤務にする」操作なしで即ロック
    expect(staff[0].shiftRequestsByMonth[mk][10]).toBe('遅番');
    for (let i = 0; i < 20; i++) {
      const { shifts } = autoGenerate(staff, eiyoDept(), YEAR, MONTH, {}, {}, {});
      expect(shifts.e0[10]).toBe('遅番');
    }
  });

  test('右クリックの「クリア」(空値)でセルが消え希望勤務ロックも解除される（仕様2）', () => {
    let staff = makeStaff();
    staff = menuSelect(staff, [['e0', 12]], '早番');
    expect(staff[0].shiftRequestsByMonth[mk][12]).toBe('早番');
    staff = menuSelect(staff, [['e0', 12]], ''); // クリア = 解除（専用「希望勤務を解除」不要）
    expect(staff[0].shiftRequestsByMonth[mk][12]).toBeUndefined();
  });

  test('半日勤務(早/有)を右クリックで入れてもロックされ生成後も保持（仕様1）', () => {
    let staff = makeStaff();
    staff = menuSelect(staff, [['e0', 6]], '早/有');
    for (let i = 0; i < 10; i++) {
      const { shifts } = autoGenerate(staff, eiyoDept(), YEAR, MONTH, {}, {}, {});
      expect(shifts.e0[6]).toBe('早/有');
    }
  });

  test('複数セル一括選択でも全て希望勤務ロックされる（仕様1・一括）', () => {
    let staff = makeStaff();
    staff = menuSelect(staff, [['e0', 3], ['e1', 4]], '日勤');
    expect(staff[0].shiftRequestsByMonth[mk][3]).toBe('日勤');
    expect(staff[1].shiftRequestsByMonth[mk][4]).toBe('日勤');
  });
});

// ────────────────────────────────────────────────────────────────
// 表示ロジック（ShiftTable セル）の派生値。UI描画コードと同じ式を検証する:
//   dispType = セル実値 || 希望勤務値 || ""   （全体クリアでdeptShiftsが空でも希望勤務は残る＝仕様4/b解消）
//   showFix  = isFixed && !confirmed          （確定で青枠を消し編集で戻す＝仕様5/6/7）
function deriveCell(cellVal, fixedVal, confirmed) {
  const type = cellVal || '';
  const isFixed = !!fixedVal;
  const dispType = type || fixedVal || '';
  const showFix = isFixed && !confirmed;
  return { dispType, showFix };
}

describe('希望勤務セルの表示ロジック（仕様4/5/6/7）', () => {
  test('全体クリア相当(セル実値なし)でも希望勤務値がオーバーレイ表示される（仕様4）', () => {
    // 希望休/有休と同じく staffList 側に値が残り、deptShifts が空でも表示は消えない
    expect(deriveCell('', '遅番', false).dispType).toBe('遅番');
  });
  test('セル実値がある間はそれを表示（生成後の通常状態）', () => {
    expect(deriveCell('日勤', '日勤', false).dispType).toBe('日勤');
  });
  test('下書き中(confirmed=false)は青枠を表示（仕様5）', () => {
    expect(deriveCell('遅番', '遅番', false).showFix).toBe(true);
  });
  test('確定(confirmed=true)で青枠を消す（データは残す）（仕様6）', () => {
    const r = deriveCell('遅番', '遅番', true);
    expect(r.showFix).toBe(false);   // 装飾は消える
    expect(r.dispType).toBe('遅番');  // 勤務表示（データ）は残る
  });
  test('編集に戻す(confirmed=false)で青枠が戻る（仕様7）', () => {
    expect(deriveCell('遅番', '遅番', false).showFix).toBe(true);
  });
  test('希望勤務でないセルは青枠なし', () => {
    expect(deriveCell('遅番', undefined, false).showFix).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
describe('有休固定と有給残数の二重減算防止', () => {
  test('セル値"有休"と yukyuByMonth が同日に重複しても消費は1.0（二重にならない）', () => {
    const s = { id: 'e0', dept: 'eiyo', yukyuByMonth: { [mk]: [10] } };
    const shifts = { e0: { 10: '有休' } }; // 固定でセルが有休、かつyukyuByMonthにも10
    expect(computePaidLeaveConsumed(shifts, [s], 'eiyo', YEAR, MONTH)).toEqual({ e0: 1 });
  });

  test('固定した有休（shiftRequests経由でセルが有休）は消費1.0で計上される', () => {
    let s = { id: 'e0', dept: 'eiyo', shiftRequestsByMonth: {}, yukyuByMonth: {} };
    s = applyCellFix(s, [['e0', 15]], true, { e0: { 15: '有休' } }, YEAR, MONTH);
    // 生成後のセルは有休（shiftRequestsで固定）
    const { shifts } = autoGenerate([s, ...makeStaff().slice(1)], eiyoDept(), YEAR, MONTH, {}, {}, {});
    expect(shifts.e0[15]).toBe('有休');
    expect(computePaidLeaveConsumed(shifts, [s], 'eiyo', YEAR, MONTH)).toEqual({ e0: 1 });
  });
});

// ────────────────────────────────────────────────────────────────
describe('非劣化: 固定なしの生成が従来通り動く', () => {
  test('固定なしで生成が完了し、maxStaff上限(早番/遅番<=1)を守る', () => {
    const dept = eiyoDept();
    for (let i = 0; i < 20; i++) {
      const { shifts } = autoGenerate(makeStaff(), dept, YEAR, MONTH, {}, {}, {});
      const ds = makeStaff();
      for (let d = 1; d <= days; d++) {
        for (const k of ['早番', '遅番']) {
          const cnt = ds.filter(s => shifts[s.id]?.[d] === k).length;
          expect(cnt).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

// ── 修正マーカー(shiftEditsByMonth・EDIT_MODE段階1) ──────────────────────────
describe('applyCellFix 修正マーカー(markEdit)', () => {
  const staff = { id: 's1', shiftRequestsByMonth: {} };
  const targets = [['s1', 5]];
  const now = { s1: { 5: '早番' } };
  test('markEdit省略時は従来通り(shiftEditsByMonthを作らない)', () => {
    const r = applyCellFix(staff, targets, true, now, YEAR, MONTH);
    expect(r.shiftRequestsByMonth[mk][5]).toBe('早番');
    expect(r.shiftEditsByMonth).toBeUndefined();
  });
  test('markEdit=true で shiftRequests と shiftEdits の両方に記録(段階1併記)', () => {
    const r = applyCellFix(staff, targets, true, now, YEAR, MONTH, true);
    expect(r.shiftRequestsByMonth[mk][5]).toBe('早番');
    expect(r.shiftEditsByMonth[mk][5]).toBe('早番');
  });
  test('希望(markEdit=false)で上書きすると修正マーカーは解除される', () => {
    const edited = applyCellFix(staff, targets, true, now, YEAR, MONTH, true);
    const rewished = applyCellFix(edited, targets, true, now, YEAR, MONTH, false);
    expect(rewished.shiftRequestsByMonth[mk][5]).toBe('早番');
    expect(rewished.shiftEditsByMonth[mk][5]).toBeUndefined();
  });
  test('クリア(fix=false)で希望・修正の両方が消える', () => {
    const edited = applyCellFix(staff, targets, true, now, YEAR, MONTH, true);
    const cleared = applyCellFix(edited, targets, false, {}, YEAR, MONTH, true);
    expect(cleared.shiftRequestsByMonth[mk][5]).toBeUndefined();
    expect(cleared.shiftEditsByMonth[mk][5]).toBeUndefined();
  });
});
