import { describe, test, expect } from 'vitest';
import { buildPinFromCurrent, MAX_PIN_NAME_LEN } from '../lib/historyPins.js';

const base = () => ({
  userId: 'u1',
  deptId: 'eiyo',
  year: 2026,
  month: 11, // 0始まり → 表示は12月
  dataValue: { s1: { 1: '早番', 2: '遅番' } },
  marksValue: { blue: { s1: [1] }, green: { s1: [2] } },
  name: '確定版',
});

describe('buildPinFromCurrent（今の画面からピン行を組み立てる）', () => {
  test('shiftKey は shifts_{year}_{month+1}_{deptId}（月は+1）', () => {
    const row = buildPinFromCurrent(base());
    expect(row.data_key).toBe('shifts_2026_12_eiyo');
  });

  test('名前は前後空白を除去して格納', () => {
    const row = buildPinFromCurrent({ ...base(), name: '  本番OK  ' });
    expect(row.name).toBe('本番OK');
  });

  test('名前が空・空白だけなら null（ピンを作らない）', () => {
    expect(buildPinFromCurrent({ ...base(), name: '' })).toBeNull();
    expect(buildPinFromCurrent({ ...base(), name: '   ' })).toBeNull();
    expect(buildPinFromCurrent({ ...base(), name: null })).toBeNull();
    expect(buildPinFromCurrent({ ...base(), name: undefined })).toBeNull();
  });

  test('長すぎる名前は最大長で切り詰め', () => {
    const long = 'あ'.repeat(MAX_PIN_NAME_LEN + 20);
    const row = buildPinFromCurrent({ ...base(), name: long });
    expect(row.name.length).toBe(MAX_PIN_NAME_LEN);
  });

  test('勤務データ・色情報がそのまま入る', () => {
    const a = base();
    const row = buildPinFromCurrent(a);
    expect(row.data_value).toEqual(a.dataValue);
    expect(row.marks_value).toEqual(a.marksValue);
  });

  test('色情報が無ければ marks_value は null', () => {
    const { marksValue, ...noMarks } = base();
    const row = buildPinFromCurrent(noMarks);
    expect(row.marks_value).toBeNull();
  });

  test('履歴起点ではないので source/original は null', () => {
    const row = buildPinFromCurrent(base());
    expect(row.source_archived_at).toBeNull();
    expect(row.original_updated_at).toBeNull();
  });

  test('必須項目（userId / deptId / dataValue）が欠けたら null', () => {
    expect(buildPinFromCurrent({ ...base(), userId: '' })).toBeNull();
    expect(buildPinFromCurrent({ ...base(), deptId: '' })).toBeNull();
    expect(buildPinFromCurrent({ ...base(), dataValue: null })).toBeNull();
  });

  test('既存の履歴起点ピンと同じ列がそろう', () => {
    const row = buildPinFromCurrent(base());
    expect(Object.keys(row).sort()).toEqual(
      ['user_id', 'data_key', 'name', 'data_value', 'marks_value', 'source_archived_at', 'original_updated_at'].sort()
    );
  });
});
