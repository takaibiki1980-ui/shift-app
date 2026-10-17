import { describe, test, expect } from 'vitest';
import {
  prevMonthInfo, pickPrevRaw, buildPrevTail, missingPrevStaff,
} from '../lib/prevMonth.js';

// 月またぎ（前月データ読み取り）の再現テスト。
// 症状: 「12月を編集して保存 → 開き直さずに1月を自動生成」したとき、
//   生成が“保存した12月”ではなく“古い12月”を使ってしまう／前月が引けず月またぎが崩れる。
// 修正(#265): 生成直前に Supabase から前月を直接取得（旧形式フォールバック込み）し、
//   その tail を使う。ここでは純粋ロジック（キー決定・選択・tail 組み立て・欠落検出）を検証する。

describe('prevMonthInfo（前月キーの決定）', () => {
  test('月内: 2026年2月(month=1) → 前月は2026年1月、キーは _1_', () => {
    const { pY, pIdx, perDeptKey, legacyKey } = prevMonthInfo(2026, 1);
    expect([pY, pIdx]).toEqual([2026, 0]);
    expect(perDeptKey('kaigo1')).toBe('shifts_2026_1_kaigo1');
    expect(legacyKey).toBe('shifts_2026_1');
  });

  test('年またぎ: 2027年1月(month=0) → 前月は2026年12月（前年に繰り下げ）', () => {
    const { pY, pIdx, perDeptKey, legacyKey } = prevMonthInfo(2027, 0);
    expect([pY, pIdx]).toEqual([2026, 11]);
    expect(perDeptKey('kaigo1')).toBe('shifts_2026_12_kaigo1');
    expect(legacyKey).toBe('shifts_2026_12');
  });

  test('ユーザー作成部署IDでもキーが正しく組める', () => {
    const { perDeptKey } = prevMonthInfo(2027, 0);
    expect(perDeptKey('dept_abc123')).toBe('shifts_2026_12_dept_abc123');
  });
});

describe('pickPrevRaw（部署別→旧形式フォールバック）', () => {
  const raw = { s1: { '31': '夜勤' }, s2: { '30': '夜勤', '31': '明け' } };

  test('仮説1-a: 部署別キーがあればそれを使う', () => {
    const map = { 'shifts_2026_12_kaigo1': raw };
    expect(pickPrevRaw(map, 'kaigo1', 2027, 0)).toEqual({ raw, source: 'per-dept' });
  });

  test('仮説1-b: 部署別が無く旧形式(全部署まとめ)にあればフォールバック', () => {
    const map = { 'shifts_2026_12': { kaigo1: raw } };
    expect(pickPrevRaw(map, 'kaigo1', 2027, 0)).toEqual({ raw, source: 'legacy' });
  });

  test('仮説1-c: どちらにも無ければ null（前月が存在しない＝引き継げない）', () => {
    expect(pickPrevRaw({}, 'kaigo1', 2027, 0)).toEqual({ raw: null, source: null });
    expect(pickPrevRaw(null, 'kaigo1', 2027, 0)).toEqual({ raw: null, source: null });
  });

  test('旧形式に“その部署”が無ければ null（他部署だけ保存済みのとき）', () => {
    const map = { 'shifts_2026_12': { kaigo2: raw } };
    expect(pickPrevRaw(map, 'kaigo1', 2027, 0)).toEqual({ raw: null, source: null });
  });

  // 仮説5（古いキャッシュを見てしまう）の本質: pick は“渡されたマップ”の中身をそのまま返す。
  // 古いキャッシュを渡せば古い結果、直接取得した最新を渡せば最新の結果になる。
  // → #265 は生成直前に DB から直接取得した最新マップを渡すことで、保存済み内容が確実に使われる。
  test('仮説5: 古いキャッシュと最新取得では pick の結果が変わる（＝入力源が結果を決める）', () => {
    const stale = { 'shifts_2026_12_kaigo1': { s1: { '31': '休み' } } }; // 開く前の古い内容
    const fresh = { 'shifts_2026_12_kaigo1': { s1: { '31': '夜勤' } } }; // 保存した最新内容
    const fromStale = pickPrevRaw(stale, 'kaigo1', 2027, 0);
    const fromFresh = pickPrevRaw(fresh, 'kaigo1', 2027, 0);
    expect(fromStale.raw.s1['31']).toBe('休み');
    expect(fromFresh.raw.s1['31']).toBe('夜勤');
    expect(fromStale.raw).not.toEqual(fromFresh.raw);
  });
});

describe('buildPrevTail（前月末尾6日の tail 組み立て）', () => {
  // 12月は31日まで → 末尾6日は 26..31。
  test('年末(2026/12)の末尾6日だけを数値キーで拾う', () => {
    const raw = { s1: { '24': '日勤', '26': '夜勤', '31': '明け' } };
    const tail = buildPrevTail(raw, 2026, 11);
    expect(tail).toEqual({ s1: { 26: '夜勤', 31: '明け' } }); // 24日は範囲外、キーは数値
  });

  test('前月末=夜勤 / 明け / 休み の3パターンがそのまま末日に入る', () => {
    const raw = {
      yakin: { '31': '夜勤' },   // A: 31日夜勤 → 翌月1日は明け(core側)
      ake:   { '30': '夜勤', '31': '明け' }, // B: 30夜勤・31明け → 翌月1日に夜勤は来ない
      kyu:   { '31': '休み' },   // C: 31日休み → 翌月1日に明けは来ない
    };
    const tail = buildPrevTail(raw, 2026, 11);
    expect(tail.yakin[31]).toBe('夜勤');
    expect(tail.ake[30]).toBe('夜勤');
    expect(tail.ake[31]).toBe('明け');
    expect(tail.kyu[31]).toBe('休み');
  });

  test('raw が null/空なら空 tail（前月なし）', () => {
    expect(buildPrevTail(null, 2026, 11)).toEqual({});
    expect(buildPrevTail({}, 2026, 11)).toEqual({});
  });

  test('決定性: 同じ入力は常に同一の tail（キャッシュ/直接取得で内容が同じなら生成結果も不変）', () => {
    const raw = { s1: { '29': '日勤', '30': '夜勤', '31': '明け' } };
    const a = buildPrevTail(raw, 2026, 11);
    const b = buildPrevTail(raw, 2026, 11);
    expect(a).toEqual(b);
    // _runGenerateCore のキャッシュ経路と handleGenerate の直接取得経路は同じ buildPrevTail を使うため、
    // 前月が見つかる限り生成への入力(tail)は一致する＝生成結果は従来と変わらない。
  });

  test('2月(28日)でも末尾6日は 23..28 で拾う', () => {
    const raw = { s1: { '22': '日勤', '23': '夜勤', '28': '明け' } };
    const tail = buildPrevTail(raw, 2026, 1); // 2026/2は28日
    expect(tail).toEqual({ s1: { 23: '夜勤', 28: '明け' } });
  });
});

describe('missingPrevStaff（前月に紐づかない職員の検出）', () => {
  test('仮説2: 現スタッフidが前月tailに無ければ検出（部署/職員の作り直しでid不一致）', () => {
    const tail = { s1: { 31: '夜勤' } };
    expect(missingPrevStaff(tail, ['s1', 's2', 's3'])).toEqual(['s2', 's3']);
  });

  test('全員前月にいれば空', () => {
    const tail = { s1: {}, s2: {} };
    // 注: buildPrevTail は値ありのみ残すので実運用で {} は入らないが、キー有無のみ判定することを確認
    expect(missingPrevStaff({ s1: { 31: '夜勤' }, s2: { 31: '明け' } }, ['s1', 's2'])).toEqual([]);
  });

  test('空配列/未定義でも落ちない', () => {
    expect(missingPrevStaff({}, [])).toEqual([]);
    expect(missingPrevStaff({}, undefined)).toEqual([]);
  });
});
