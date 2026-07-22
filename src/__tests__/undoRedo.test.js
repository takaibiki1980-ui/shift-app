/**
 * undo/redo スタック遷移の純粋ロジックのテスト。
 *  - 多段の戻る/進む
 *  - 新規編集で redo が無効化される（矛盾復元の防止）
 *  - 上限(cap)
 *  - 空スタックでは null（何もしない）
 * ※ App.jsx の handleUndo/handleRedo/setDeptShifts はこのモジュールを使用する。
 */
import { describe, test, expect } from 'vitest';
import { pushHistory, undoStep, redoStep, HISTORY_CAP } from '../lib/undoRedo.js';

// 手編集の一連の流れを、このモジュールだけで再現するヘルパ。
function makeSession() {
  let undo = [], redo = [], state = 'S0';
  return {
    get state() { return state; },
    get undoLen() { return undo.length; },
    get redoLen() { return redo.length; },
    edit(next) { const r = pushHistory(undo, redo, state); undo = r.undo; redo = r.redo; state = next; },
    undo() { const r = undoStep(undo, redo, state); if (!r) return false; undo = r.undo; redo = r.redo; state = r.restored; return true; },
    redo() { const r = redoStep(undo, redo, state); if (!r) return false; undo = r.undo; redo = r.redo; state = r.restored; return true; },
  };
}

describe('undo/redo スタック遷移', () => {
  test('1手編集→戻る→進む で元に戻り、やり直せる', () => {
    const s = makeSession();
    s.edit('S1');
    expect(s.state).toBe('S1');
    expect(s.undo()).toBe(true); expect(s.state).toBe('S0');
    expect(s.redo()).toBe(true); expect(s.state).toBe('S1');
  });

  test('複数段: 3手戻して2手進む', () => {
    const s = makeSession();
    s.edit('S1'); s.edit('S2'); s.edit('S3'); // S0→S1→S2→S3
    s.undo(); s.undo(); s.undo();            // →S0
    expect(s.state).toBe('S0');
    s.redo(); s.redo();                       // →S2
    expect(s.state).toBe('S2');
    expect(s.redoLen).toBe(1); // S3 が1つ残る
  });

  test('undo後に新規編集すると redo がクリアされる（矛盾復元しない）', () => {
    const s = makeSession();
    s.edit('S1'); s.edit('S2');   // S0→S1→S2
    s.undo();                     // →S1, redo=[S2]
    expect(s.redoLen).toBe(1);
    s.edit('S9');                 // 新規編集 → redoクリア
    expect(s.redoLen).toBe(0);
    expect(s.redo()).toBe(false); // 進めない
    expect(s.state).toBe('S9');
    s.undo();                     // →S1（S2ではない）
    expect(s.state).toBe('S1');
  });

  test('空スタックでは null（何もしない）', () => {
    expect(undoStep([], [], 'cur')).toBeNull();
    expect(redoStep([], [], 'cur')).toBeNull();
  });

  test('上限(cap)を超えると古い履歴が捨てられる', () => {
    let undo = [], redo = [];
    for (let i = 0; i < HISTORY_CAP + 5; i++) { const r = pushHistory(undo, redo, `s${i}`); undo = r.undo; redo = r.redo; }
    expect(undo.length).toBe(HISTORY_CAP);
    expect(undo[0]).toBe('s5');           // s0..s4 は破棄
    expect(undo[undo.length - 1]).toBe(`s${HISTORY_CAP + 4}`);
  });

  test('cap=2 でリドゥ側も上限が効く', () => {
    let undo = ['a', 'b', 'c'], redo = [];
    let cur = 'd';
    for (let i = 0; i < 3; i++) { const r = undoStep(undo, redo, cur, 2); undo = r.undo; redo = r.redo; cur = r.restored; }
    expect(redo.length).toBe(2); // 上限2
  });

  test('pushHistory は元の配列を破壊しない（不変）', () => {
    const undo0 = ['x']; const redo0 = ['y'];
    const r = pushHistory(undo0, redo0, 'z');
    expect(undo0).toEqual(['x']); expect(redo0).toEqual(['y']);
    expect(r.undo).toEqual(['x', 'z']); expect(r.redo).toEqual([]);
  });
});
