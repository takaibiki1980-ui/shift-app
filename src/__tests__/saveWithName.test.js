import { describe, test, expect, vi } from 'vitest';
import { saveThenPin } from '../lib/saveWithName.js';

const row = { user_id: 'u', data_key: 'shifts_2026_12_eiyo', name: '確定版' };

describe('saveThenPin（保存→ピンの直列処理）', () => {
  test('保存成功→ピン作成（insertPin が行を受け取り pinned=true）', async () => {
    const saveNow = vi.fn().mockResolvedValue(true);
    const insertPin = vi.fn().mockResolvedValue({ error: null });
    const r = await saveThenPin({ saveNow, pinRow: row, insertPin });
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(insertPin).toHaveBeenCalledWith(row);
    expect(r).toEqual({ saved: true, pinned: true, pinError: null });
  });

  test('保存失敗→ピンを作らない（insertPin 未呼び出し）', async () => {
    const saveNow = vi.fn().mockResolvedValue(false);
    const insertPin = vi.fn();
    const r = await saveThenPin({ saveNow, pinRow: row, insertPin });
    expect(insertPin).not.toHaveBeenCalled();
    expect(r).toEqual({ saved: false, pinned: false, pinError: null });
  });

  test('ピン失敗（error返却）→ エラーを返し、保存は呼ばれ済み', async () => {
    const saveNow = vi.fn().mockResolvedValue(true);
    const err = { message: 'insert failed' };
    const insertPin = vi.fn().mockResolvedValue({ error: err });
    const r = await saveThenPin({ saveNow, pinRow: row, insertPin });
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(r.saved).toBe(true);
    expect(r.pinned).toBe(false);
    expect(r.pinError).toBe(err);
  });

  test('ピン insert が例外を投げても保存は成功のまま pinError を返す', async () => {
    const saveNow = vi.fn().mockResolvedValue(true);
    const boom = new Error('boom');
    const insertPin = vi.fn().mockRejectedValue(boom);
    const r = await saveThenPin({ saveNow, pinRow: row, insertPin });
    expect(r).toEqual({ saved: true, pinned: false, pinError: boom });
  });

  test('名前が空（pinRow=null）→ 保存のみ・ピンは作らない', async () => {
    const saveNow = vi.fn().mockResolvedValue(true);
    const insertPin = vi.fn();
    const r = await saveThenPin({ saveNow, pinRow: null, insertPin });
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(insertPin).not.toHaveBeenCalled();
    expect(r).toEqual({ saved: true, pinned: false, pinError: null });
  });
});
