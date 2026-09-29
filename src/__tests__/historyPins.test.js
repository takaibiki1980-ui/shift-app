import { describe, test, expect } from 'vitest';
import {
  sanitizePinName, buildPinInsert, sortPinsByNewest,
  MAX_PIN_NAME_LEN, DEFAULT_PIN_NAME,
} from '../lib/historyPins.js';

describe('sanitizePinName', () => {
  test('前後空白を除去', () => {
    expect(sanitizePinName('  確定版  ')).toBe('確定版');
  });
  test('空/空白/nullは既定名', () => {
    expect(sanitizePinName('')).toBe(DEFAULT_PIN_NAME);
    expect(sanitizePinName('   ')).toBe(DEFAULT_PIN_NAME);
    expect(sanitizePinName(null)).toBe(DEFAULT_PIN_NAME);
    expect(sanitizePinName(undefined)).toBe(DEFAULT_PIN_NAME);
  });
  test('カスタム fallback', () => {
    expect(sanitizePinName('', '9月ベスト')).toBe('9月ベスト');
  });
  test('最大長で切り詰め', () => {
    const long = 'あ'.repeat(MAX_PIN_NAME_LEN + 10);
    expect(sanitizePinName(long).length).toBe(MAX_PIN_NAME_LEN);
  });
  test('数値も文字列化', () => {
    expect(sanitizePinName(123)).toBe('123');
  });
});

describe('buildPinInsert', () => {
  const base = {
    userId: 'u1', dataKey: 'shifts_2026_9_k1', name: '  確定版 ',
    dataValue: { a: { 5: '早番' } },
  };
  test('正常: INSERT行を組み立て・名前は整形される', () => {
    expect(buildPinInsert(base)).toEqual({
      user_id: 'u1', data_key: 'shifts_2026_9_k1', name: '確定版',
      data_value: { a: { 5: '早番' } }, marks_value: null,
      source_archived_at: null, original_updated_at: null,
    });
  });
  test('色情報・時刻も渡せる', () => {
    const r = buildPinInsert({ ...base, marksValue: { a: { se: { 5: '早番' } } }, sourceArchivedAt: '2026-09-01T00:00:00Z', originalUpdatedAt: '2026-08-31T00:00:00Z' });
    expect(r.marks_value).toEqual({ a: { se: { 5: '早番' } } });
    expect(r.source_archived_at).toBe('2026-09-01T00:00:00Z');
    expect(r.original_updated_at).toBe('2026-08-31T00:00:00Z');
  });
  test('data_value が無ければ null', () => {
    expect(buildPinInsert({ ...base, dataValue: null })).toBeNull();
    expect(buildPinInsert({ ...base, dataValue: undefined })).toBeNull();
  });
  test('userId / dataKey 欠如でも null', () => {
    expect(buildPinInsert({ ...base, userId: '' })).toBeNull();
    expect(buildPinInsert({ ...base, dataKey: '' })).toBeNull();
  });
  test('名前空なら既定名で保存', () => {
    expect(buildPinInsert({ ...base, name: '' }).name).toBe(DEFAULT_PIN_NAME);
  });
});

describe('sortPinsByNewest', () => {
  test('created_at 降順', () => {
    const pins = [
      { id: 1, created_at: '2026-09-01T00:00:00Z' },
      { id: 2, created_at: '2026-09-03T00:00:00Z' },
      { id: 3, created_at: '2026-09-02T00:00:00Z' },
    ];
    expect(sortPinsByNewest(pins).map(p => p.id)).toEqual([2, 3, 1]);
  });
  test('同時刻は id 降順で安定', () => {
    const pins = [
      { id: 1, created_at: '2026-09-01T00:00:00Z' },
      { id: 5, created_at: '2026-09-01T00:00:00Z' },
    ];
    expect(sortPinsByNewest(pins).map(p => p.id)).toEqual([5, 1]);
  });
  test('非破壊・空/null安全', () => {
    const pins = [{ id: 1, created_at: 'x' }];
    sortPinsByNewest(pins);
    expect(pins.map(p => p.id)).toEqual([1]);
    expect(sortPinsByNewest([])).toEqual([]);
    expect(sortPinsByNewest(null)).toEqual([]);
  });
});
