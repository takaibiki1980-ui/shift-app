/**
 * src/lib/cellMarker.js のテスト（純粋・セルの丸マーカー判定）。
 * #288 の穴（生成後に赤が消える）を再現防止する 7 場面を含む。
 */
import { describe, test, expect } from 'vitest';
import { cellMarker, cellMarkerColor, CELL_MARKER_COLOR } from '../lib/cellMarker.js';

describe('cellMarker（丸の種類）', () => {
  test('① 生成前の希望休 → staff（赤）', () => {
    // 申請日で、まだ生成していない（hasEdit/hasFixed なし）
    expect(cellMarker({ isStaffReqDay: true, hasEdit: false, hasFixed: false, confirmed: false })).toBe('staff');
  });

  test('② 生成後の希望休 → staff（赤のまま。これが #288 の穴の修正点）', () => {
    // セルに "希望休" が入っても、申請日である限り赤。!dispType 条件を外した効果。
    expect(cellMarker({ isStaffReqDay: true, hasEdit: false, hasFixed: false, confirmed: false })).toBe('staff');
  });

  test('③ 生成後の有休 → staff（赤）', () => {
    // 有休も kiboByMonth/yukyuByMonth 由来＝isStaffReqDay に含める。
    expect(cellMarker({ isStaffReqDay: true, hasEdit: false, hasFixed: false, confirmed: false })).toBe('staff');
  });

  test('④ 手動修正後（申請日でない）→ edit（緑）', () => {
    expect(cellMarker({ isStaffReqDay: false, hasEdit: true, hasFixed: false, confirmed: false })).toBe('edit');
  });

  test('⑤ リーダー希望（申請日でも修正でもない）→ fix（紫）', () => {
    expect(cellMarker({ isStaffReqDay: false, hasEdit: false, hasFixed: true, confirmed: false })).toBe('fix');
  });

  test('⑥ 重なり（申請日かつ修正かつリーダー希望）→ staff 優先（赤）', () => {
    expect(cellMarker({ isStaffReqDay: true, hasEdit: true, hasFixed: true, confirmed: false })).toBe('staff');
    // edit と fix の重なりは edit 優先
    expect(cellMarker({ isStaffReqDay: false, hasEdit: true, hasFixed: true, confirmed: false })).toBe('edit');
  });

  test('⑦ 確定後 → 必ず null（どの組み合わせでも）', () => {
    expect(cellMarker({ isStaffReqDay: true, hasEdit: true, hasFixed: true, confirmed: true })).toBeNull();
    expect(cellMarker({ isStaffReqDay: true, hasEdit: false, hasFixed: false, confirmed: true })).toBeNull();
    expect(cellMarker({ isStaffReqDay: false, hasEdit: false, hasFixed: true, confirmed: true })).toBeNull();
  });

  test('どれも無ければ null', () => {
    expect(cellMarker({ isStaffReqDay: false, hasEdit: false, hasFixed: false, confirmed: false })).toBeNull();
  });
});

describe('cellMarkerColor（色対応・#288 の色と一致）', () => {
  test('種類ごとの色', () => {
    expect(cellMarkerColor('staff')).toBe('#d6455d');
    expect(cellMarkerColor('edit')).toBe('#2a9d6f');
    expect(cellMarkerColor('fix')).toBe('#7c3aed');
  });
  test('null/未知は null', () => {
    expect(cellMarkerColor(null)).toBeNull();
    expect(cellMarkerColor('xxx')).toBeNull();
  });
  test('色テーブルの値', () => {
    expect(CELL_MARKER_COLOR).toEqual({ staff: '#d6455d', edit: '#2a9d6f', fix: '#7c3aed' });
  });
});
