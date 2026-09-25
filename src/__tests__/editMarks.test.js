import { describe, test, expect } from 'vitest';
import {
  buildMarksVal, collectSeById, collectSeByIdFromByKey,
  hydrateStaffListSe, applyRestoredMarks, cellColorOf,
} from '../lib/editMarks.js';
import { applyCellFix } from '../lib/cellFix.js';
import { monthKey } from '../engine/core.js';

const mk = '2026-7';

describe('buildMarksVal（companion 値の構築）', () => {
  test('sr(青)のみ・se(緑)のみ・両方を正しく拾う', () => {
    const staff = [
      { id: 'a', dept: 'k1', shiftRequestsByMonth: { [mk]: { 5: '日勤' } } },
      { id: 'b', dept: 'k1', shiftEditsByMonth:    { [mk]: { 6: '早番' } } },
      { id: 'c', dept: 'k1', shiftRequestsByMonth: { [mk]: { 7: '休み' } }, shiftEditsByMonth: { [mk]: { 8: '遅番' } } },
    ];
    expect(buildMarksVal(staff, 'k1', mk)).toEqual({
      a: { sr: { 5: '日勤' }, se: null },
      b: { sr: null, se: { 6: '早番' } },
      c: { sr: { 7: '休み' }, se: { 8: '遅番' } },
    });
  });
  test('別部署・空マーカー・当月以外は除外', () => {
    const staff = [
      { id: 'x', dept: 'k2', shiftEditsByMonth: { [mk]: { 1: '日勤' } } }, // 別部署
      { id: 'y', dept: 'k1', shiftRequestsByMonth: { [mk]: {} } },          // 空
      { id: 'z', dept: 'k1', shiftEditsByMonth: { '2026-8': { 1: '早番' } } }, // 別月
    ];
    expect(buildMarksVal(staff, 'k1', mk)).toEqual({});
  });
  test('空配列・null 安全', () => {
    expect(buildMarksVal([], 'k1', mk)).toEqual({});
    expect(buildMarksVal(null, 'k1', mk)).toEqual({});
  });
});

describe('collectSeById（緑の表示ハイドレーション用集約）', () => {
  test('複数部署の companion 行から se だけを集約', () => {
    const rows = [
      { data_value: { a: { sr: { 5: '日勤' }, se: { 6: '早番' } }, b: { sr: null, se: null } } },
      { data_value: { c: { sr: null, se: { 9: '遅番' } } } },
    ];
    expect(collectSeById(rows)).toEqual({ a: { 6: '早番' }, c: { 9: '遅番' } });
  });
  test('se が空/なしの staff は含めない', () => {
    const rows = [{ data_value: { a: { sr: { 1: '日勤' }, se: {} }, b: { sr: { 2: '休み' } } } }];
    expect(collectSeById(rows)).toEqual({});
  });
  test('空・null 安全', () => {
    expect(collectSeById([])).toEqual({});
    expect(collectSeById(null)).toEqual({});
    expect(collectSeById([{ data_value: null }])).toEqual({});
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 色(青=希望/緑=修正)の保存シナリオ回帰テスト。
// 「今後、あらゆる操作の組み合わせで色が崩れない」ことを保証する。
// 実コードの純粋関数(applyCellFix/buildMarksVal/collectSeById/hydrateStaffListSe/
// applyRestoredMarks/cellColorOf)を合成して、保存・階移動・月移動・履歴復元・
// 確定/編集戻しの各シナリオをモデル化する。
// ───────────────────────────────────────────────────────────────────────────
describe('色の保存シナリオ（青/緑が崩れないことの保証）', () => {
  const YEAR = 2026, MONTH = 6; // monthKey(2026,6) === '2026-7'
  const DAY = 5, DEPT = 'k1';

  // 右クリック編集: markEdit=true → 修正(緑・se), false → 希望(青・sr)
  const edit = (staffList, sid, day, shift, markEdit = true) => {
    const targets = [[sid, day]];
    const synth = { [sid]: { [day]: shift } };
    return staffList.map(s => applyCellFix(s, targets, true, synth, YEAR, MONTH, markEdit));
  };
  // 保存: companion に色情報を書き、staffList blob を永続化
  const save = (db, staffList, deptId = DEPT) => {
    db.companion[`editmarks_${YEAR}_${MONTH + 1}_${deptId}`] = buildMarksVal(staffList, deptId, mk);
    db.blob = staffList;
    return staffList;
  };
  // 月/画面リロード: blob から復帰し、companion から緑をハイドレート。
  //   stripSe=true は「blob から se が失われている」最悪ケースの再現。
  const reload = (db, { stripSe = false } = {}) => {
    let list = (db.blob || []).map(s => {
      if (!stripSe) return s;
      const se = { ...(s.shiftEditsByMonth || {}) }; delete se[mk];
      return { ...s, shiftEditsByMonth: se };
    });
    const seById = collectSeByIdFromByKey(db.companion, YEAR, MONTH);
    return hydrateStaffListSe(list, mk, seById);
  };
  const green = (s, day = DAY, opts = {}) => cellColorOf(s, mk, day, opts);
  const find = (list, id) => list.find(s => s.id === id);

  const base = () => [{ id: 'a', dept: DEPT }];

  test('monthKey が期待どおり', () => {
    expect(monthKey(YEAR, MONTH)).toBe(mk);
  });

  test('修正→保存→階移動→戻る: 緑が保たれる', () => {
    const db = { companion: {}, blob: null };
    let list = edit(base(), 'a', DAY, '早番', true);
    save(db, list);
    // 階(部署)移動は staffList を再ロードしない(全部署共通) → そのまま
    expect(green(find(list, 'a'))).toBe('green');
  });

  test('修正→保存→月移動→戻る(blob健全): 緑が保たれる', () => {
    const db = { companion: {}, blob: null };
    let list = edit(base(), 'a', DAY, '早番', true);
    save(db, list);
    const reloaded = reload(db); // blob に se あり
    expect(green(find(reloaded, 'a'))).toBe('green');
  });

  test('修正→保存→月移動(blobからse欠落)→companionから復活', () => {
    const db = { companion: {}, blob: null };
    let list = edit(base(), 'a', DAY, '早番', true);
    save(db, list);
    const reloaded = reload(db, { stripSe: true }); // 最悪ケース
    expect(green(find(reloaded, 'a'))).toBe('green');
  });

  test('修正→保存→履歴復元(対の色情報あり): 緑が復元される', () => {
    const db = { companion: {}, blob: null };
    let list = edit(base(), 'a', DAY, '早番', true);
    save(db, list);
    const marksVal = db.companion[`editmarks_${YEAR}_${MONTH + 1}_${DEPT}`];
    // 一旦緑が消えた状態から復元してもよいことを確認
    const stripped = reload(db, { stripSe: true }).map(s => ({ ...s, shiftEditsByMonth: {} }));
    const restored = applyRestoredMarks(stripped, DEPT, mk, marksVal);
    expect(green(find(restored, 'a'))).toBe('green');
  });

  test('履歴復元(対の色情報なし=null): 現在の緑を壊さない(削除しない)', () => {
    let list = edit(base(), 'a', DAY, '早番', true);
    const after = applyRestoredMarks(list, DEPT, mk, null); // 対が見つからない
    expect(after).toBe(list); // 同一参照=無変更
    expect(green(find(after, 'a'))).toBe('green');
  });

  test('確定→編集に戻す: 確定中は無色・編集に戻すと緑', () => {
    let list = edit(base(), 'a', DAY, '早番', true);
    expect(green(find(list, 'a'), DAY, { confirmed: true })).toBe(null);  // 確定中
    expect(green(find(list, 'a'), DAY, { confirmed: false })).toBe('green'); // 編集に戻す
  });

  test('複合: 修正→保存→月移動(se欠落)→復元(null)→なお緑', () => {
    const db = { companion: {}, blob: null };
    let list = edit(base(), 'a', DAY, '早番', true);
    save(db, list);
    let reloaded = reload(db, { stripSe: true }); // companionから復活
    reloaded = applyRestoredMarks(reloaded, DEPT, mk, null); // 対なし復元でも壊さない
    expect(green(find(reloaded, 'a'))).toBe('green');
  });

  test('青(希望)も同様に保たれる: 修正でなく希望で保存→月移動→青のまま', () => {
    const db = { companion: {}, blob: null };
    let list = edit(base(), 'a', DAY, '日勤', false); // markEdit=false → sr(青)
    save(db, list);
    const reloaded = reload(db, { stripSe: true });
    expect(cellColorOf(find(reloaded, 'a'), mk, DAY)).toBe('blue');
  });

  test('修正は希望(青)を持たない: 緑セルは sr を持たず se のみ', () => {
    const list = edit(base(), 'a', DAY, '早番', true);
    const s = find(list, 'a');
    expect(s.shiftEditsByMonth?.[mk]?.[DAY]).toBe('早番'); // se あり
    expect(s.shiftRequestsByMonth?.[mk]?.[DAY]).toBeUndefined(); // sr なし
  });

  test('他staffの緑を巻き込まない: ハイドレーションは対象staffのみ', () => {
    const db = { companion: {}, blob: null };
    let list = [{ id: 'a', dept: DEPT }, { id: 'b', dept: DEPT }];
    list = edit(list, 'a', DAY, '早番', true); // a だけ修正
    save(db, list);
    const reloaded = reload(db, { stripSe: true });
    expect(green(find(reloaded, 'a'))).toBe('green');
    expect(green(find(reloaded, 'b'))).toBe(null); // b は無色のまま
  });
});
