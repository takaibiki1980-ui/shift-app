/**
 * undo/redo スタック遷移の純粋ロジック（Reactやシフトデータ構造に非依存）。
 * App.jsx のセル手編集 undo/redo は、スナップショットの取得/復元は React 側で行い、
 * スタックの配列操作（多段・上限・リドゥ無効化）はこのモジュールに集約する。
 *
 * snapshot は不透明な値（{shifts, sr} など）でよい。ここでは中身を見ない。
 */

export const HISTORY_CAP = 30;

/**
 * 新規編集: 直前状態を undo に積み、redo を無効化（クリア）する。
 * @returns {{undo: any[], redo: any[]}}
 */
export function pushHistory(undoStack, redoStack, snapshot, cap = HISTORY_CAP) {
  return { undo: [...(undoStack || []), snapshot].slice(-cap), redo: [] };
}

/**
 * 戻る: undo の先頭(末尾)を取り出して復元し、現在状態を redo に積む。
 * undo が空なら null（何もしない）。
 * @returns {{undo: any[], redo: any[], restored: any} | null}
 */
export function undoStep(undoStack, redoStack, current, cap = HISTORY_CAP) {
  const u = undoStack || [];
  if (u.length === 0) return null;
  return {
    restored: u[u.length - 1],
    undo: u.slice(0, -1),
    redo: [...(redoStack || []), current].slice(-cap),
  };
}

/**
 * 進む: redo の先頭(末尾)を取り出して復元し、現在状態を undo に積む。
 * redo が空なら null（何もしない）。
 * @returns {{undo: any[], redo: any[], restored: any} | null}
 */
export function redoStep(undoStack, redoStack, current, cap = HISTORY_CAP) {
  const r = redoStack || [];
  if (r.length === 0) return null;
  return {
    restored: r[r.length - 1],
    redo: r.slice(0, -1),
    undo: [...(undoStack || []), current].slice(-cap),
  };
}
