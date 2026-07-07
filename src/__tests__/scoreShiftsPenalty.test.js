/**
 * scoreShifts ペナルティ 回帰テスト（設計③）
 *
 * scoreShifts は決定論的（同じ入力→必ず同じスコア）なので、間接テストの
 * ランダム性問題は起きない。本テストの重心は「個々のペナルティ額」よりも
 * 「ペナルティ間の大小関係」に置く。
 *
 * 理由: 早番2人バグの本質は「どの違反を優先して直すか」の判断で、その優先順位は
 *       scoreShifts のペナルティの大小関係で決まる。この大小が将来うっかり逆転すると
 *       「公休を直そうとして早番2人を作る」類のバグが再発する。大小関係の凍結が
 *       最も価値が高い。
 *
 * 全ペナルティ額はコードで実挙動を確認済み（推測なし）。各値は違反1件のみを含む
 * 最小シフトと違反ゼロのシフトのスコア差分で検証する。
 * 実測確認値:
 *   公休1日ズレ=10000 / maxConsec超過1日=100 / 同一シフト4連=1500・5連目+6000 /
 *   minStaff 0人(minC=2)=2000・1人不足=300 / maxStaff超過1件=150 /
 *   役職制限1件=5000 / 比率乖離50%=2500(=1%あたり50)
 *
 * 本体コード変更・export追加は一切なし（既存export scoreShifts のみ使用）。
 */
import { describe, test, expect } from 'vitest';
import { scoreShifts } from '../engine/core.js';

const Y = 2026, M = 0; // 2026-01（Jan1=木曜。d1=木,d2=金 は非週末→公平性ノイズを回避）
const baseDept = { shiftTypes: ['早番', '日勤', '遅番'], customShiftDefs: [], maxConsecutive: 5 };
function staff(over = {}) {
  return { id: 's1', name: 'P1', role: '職員', kyukoDays: 0, kyukoDaysByMonth: {}, ...over };
}
function staff2(over = {}) {
  return { id: 's2', name: 'P2', role: '職員', kyukoDays: 0, kyukoDaysByMonth: {}, ...over };
}

// ════════════════════════════════════════════════════════════════
// A. 個別ペナルティの検証（違反1件の差分でペナルティ額を凍結）
// ════════════════════════════════════════════════════════════════
describe('A. scoreShifts 個別ペナルティ額（実測確認値で凍結）', () => {
  test('公休逸脱: 1日ズレ = 10000点', () => {
    const dept = { ...baseDept, minStaff: {} };
    const s = [staff({ kyukoDays: 2 })];
    const okShift = { s1: { 1: '早番', 2: '日勤', 3: '遅番', 4: '休み', 5: '休み', 6: '日勤' } }; // 休み2=目標2
    const ngShift = { s1: { 1: '早番', 2: '日勤', 3: '遅番', 4: '休み', 5: '休み', 6: '休み' } }; // 休み3=+1日
    const ok = scoreShifts(okShift, s, dept, 6, Y, M, {});
    const ng = scoreShifts(ngShift, s, dept, 6, Y, M, {});
    expect(ok).toBe(0);
    expect(ng - ok).toBe(10000);
  });

  test('maxConsec超過: 上限3で4連勤 = +100点/超過日', () => {
    const dept = { ...baseDept, minStaff: {}, maxConsecutive: 3 };
    const s = [staff({ kyukoDays: 1 })];
    const okShift = { s1: { 1: '早番', 2: '日勤', 3: '遅番', 4: '休み', 5: '早番', 6: '日勤' } }; // 連続3
    const ngShift = { s1: { 1: '早番', 2: '日勤', 3: '遅番', 4: '遅番', 5: '休み', 6: '日勤' } }; // 連続4
    const ok = scoreShifts(okShift, s, dept, 6, Y, M, {});
    const ng = scoreShifts(ngShift, s, dept, 6, Y, M, {});
    expect(ok).toBe(0);
    expect(ng - ok).toBe(100);
  });

  test('同一シフト連続: 4連=+1500、5連目でさらに+6000', () => {
    const dept = { ...baseDept, minStaff: {}, maxConsecutive: 10 }; // maxConsecを無効化
    const s = [staff({ kyukoDays: 2 })];
    const run3 = { s1: { 1: '日勤', 2: '日勤', 3: '日勤', 4: '休み', 5: '日勤', 6: '日勤', 7: '休み' } }; // 最長3連
    const run4 = { s1: { 1: '日勤', 2: '日勤', 3: '日勤', 4: '日勤', 5: '休み', 6: '日勤', 7: '休み' } }; // 4連
    const run5 = { s1: { 1: '日勤', 2: '日勤', 3: '日勤', 4: '日勤', 5: '日勤', 6: '休み', 7: '休み' } }; // 5連
    const b3 = scoreShifts(run3, s, dept, 7, Y, M, {});
    const b4 = scoreShifts(run4, s, dept, 7, Y, M, {});
    const b5 = scoreShifts(run5, s, dept, 7, Y, M, {});
    expect(b3).toBe(0);
    expect(b4 - b3).toBe(1500);   // 4連目のペナルティ
    expect(b5 - b4).toBe(6000);   // 5連目の追加ペナルティ
  });

  test('minStaff不足: 1人不足=+300、0人配置=minC×1000（minC=2で2000）', () => {
    const dept = { ...baseDept, shiftTypes: ['早番', '日勤'], minStaff: { 日勤: 2 }, maxStaff: { 日勤: 99, 早番: 99 } };
    const s = [staff(), staff2()];
    const met = { s1: { 1: '日勤', 2: '日勤' }, s2: { 1: '日勤', 2: '日勤' } };       // d1: 日勤2=充足
    const short1 = { s1: { 1: '日勤', 2: '日勤' }, s2: { 1: '早番', 2: '日勤' } };    // d1: 日勤1=1人不足
    const zero = { s1: { 1: '早番', 2: '日勤' }, s2: { 1: '早番', 2: '日勤' } };      // d1: 日勤0
    const bMet = scoreShifts(met, s, dept, 2, Y, M, {});
    const bShort1 = scoreShifts(short1, s, dept, 2, Y, M, {});
    const bZero = scoreShifts(zero, s, dept, 2, Y, M, {});
    expect(bMet).toBe(0);
    expect(bShort1 - bMet).toBe(300);   // (2-1)*300
    expect(bZero - bMet).toBe(2000);    // 0人 → minC*1000 = 2*1000
  });

  test('maxStaff超過: 上限1に対し2人配置 = (2-1)×150 = 150点', () => {
    const dept = { ...baseDept, shiftTypes: ['早番', '日勤'], minStaff: {}, maxStaff: { 早番: 1, 日勤: 99 } };
    const s = [staff(), staff2()];
    const okShift = { s1: { 1: '早番', 2: '日勤' }, s2: { 1: '日勤', 2: '日勤' } };   // d1: 早番1
    const ngShift = { s1: { 1: '早番', 2: '日勤' }, s2: { 1: '早番', 2: '日勤' } };   // d1: 早番2
    const ok = scoreShifts(okShift, s, dept, 2, Y, M, {});
    const ng = scoreShifts(ngShift, s, dept, 2, Y, M, {});
    expect(ok).toBe(0);
    expect(ng - ok).toBe(150);
  });

  test('役職制限違反: 許可外シフト1件 = 5000点', () => {
    const dept = { ...baseDept, shiftTypes: ['早番', '日勤'], minStaff: {}, maxStaff: { 早番: 99, 日勤: 99 }, roleShiftTypes: { '助手': ['日勤'] } };
    const s = [staff({ role: '助手' })];
    const okShift = { s1: { 1: '日勤', 2: '日勤' } };       // 助手は日勤OK
    const ngShift = { s1: { 1: '早番', 2: '日勤' } };       // 助手に早番=違反1件
    const ok = scoreShifts(okShift, s, dept, 2, Y, M, {});
    const ng = scoreShifts(ngShift, s, dept, 2, Y, M, {});
    expect(ok).toBe(0);
    expect(ng - ok).toBe(5000);
  });

  test('比率乖離: 目標100%の早番に対し実績50% = 50%×(50点/1%) = 2500点', () => {
    const dept = { ...baseDept, shiftTypes: ['早番', '日勤'], minStaff: {}, maxStaff: { 早番: 99, 日勤: 99 } };
    const s = [staff({ shiftRatio: { 早番: 100 } })]; // 目標: 早番100%
    // 早番2/日勤2 → 早番実績50% → 乖離50%
    const shift = { s1: { 1: '早番', 2: '早番', 3: '日勤', 4: '日勤' } };
    const score = scoreShifts(shift, s, dept, 4, Y, M, {});
    expect(score).toBe(2500); // 0.5 * 100 * 50。1%あたり50点であることを凍結
  });
});

// ════════════════════════════════════════════════════════════════
// B. ペナルティ間の大小関係の凍結（最重要）
// ════════════════════════════════════════════════════════════════
describe('B. ペナルティ大小関係の凍結（優先順位の逆転防止）', () => {
  // 各違反1件だけを含む最小シフトのスコアを実測し、その順序を凍結する。
  // 設計の想定順序 = 実際の順序であることをコードで確認済み。
  const PENALTY = {
    公休1日:   10000, // 公休逸脱1日
    役職1件:   5000,  // 役職制限違反1件
    同一4連:   1500,  // 同一シフト4連
    minStaff0人: 2000, // 0人配置(minC=2)
    minStaff1不足: 300,
    maxStaff1件: 150,  // maxStaff超過1件
    maxConsec1日: 100,
    比率1pct:  50,    // 比率乖離1%
  };

  test('設計の優先順位チェーン: 公休1日 > 役職1件 > maxStaff超過1件 > 比率乖離1%', () => {
    expect(PENALTY.公休1日).toBeGreaterThan(PENALTY.役職1件);
    expect(PENALTY.役職1件).toBeGreaterThan(PENALTY.maxStaff1件);
    expect(PENALTY.maxStaff1件).toBeGreaterThan(PENALTY.比率1pct);
  });

  test('実スコアで大小関係を検証: 公休1日ズレ > 役職違反1件', () => {
    // 公休違反のみのシフト
    const kyukoDept = { ...baseDept, minStaff: {} };
    const kyukoStaff = [staff({ kyukoDays: 2 })];
    const kyukoNg = scoreShifts({ s1: { 1: '早番', 2: '日勤', 3: '遅番', 4: '休み', 5: '休み', 6: '休み' } }, kyukoStaff, kyukoDept, 6, Y, M, {});
    // 役職違反のみのシフト
    const roleDept = { ...baseDept, shiftTypes: ['早番', '日勤'], minStaff: {}, maxStaff: { 早番: 99, 日勤: 99 }, roleShiftTypes: { '助手': ['日勤'] } };
    const roleStaff = [staff({ role: '助手' })];
    const roleNg = scoreShifts({ s1: { 1: '早番', 2: '日勤' } }, roleStaff, roleDept, 2, Y, M, {});

    expect(kyukoNg).toBe(10000);
    expect(roleNg).toBe(5000);
    expect(kyukoNg).toBeGreaterThan(roleNg); // 公休を優先して直す
  });

  test('実スコアで大小関係を検証: 役職違反1件 > maxStaff超過1件', () => {
    const roleDept = { ...baseDept, shiftTypes: ['早番', '日勤'], minStaff: {}, maxStaff: { 早番: 99, 日勤: 99 }, roleShiftTypes: { '助手': ['日勤'] } };
    const roleStaff = [staff({ role: '助手' })];
    const roleNg = scoreShifts({ s1: { 1: '早番', 2: '日勤' } }, roleStaff, roleDept, 2, Y, M, {});

    const maxDept = { ...baseDept, shiftTypes: ['早番', '日勤'], minStaff: {}, maxStaff: { 早番: 1, 日勤: 99 } };
    const maxStaffPair = [staff(), staff2()];
    const maxNg = scoreShifts({ s1: { 1: '早番', 2: '日勤' }, s2: { 1: '早番', 2: '日勤' } }, maxStaffPair, maxDept, 2, Y, M, {});

    expect(roleNg).toBe(5000);
    expect(maxNg).toBe(150);
    expect(roleNg).toBeGreaterThan(maxNg);
  });

  test('実スコアで大小関係を検証: maxStaff超過1件 > 比率乖離1%相当', () => {
    const maxDept = { ...baseDept, shiftTypes: ['早番', '日勤'], minStaff: {}, maxStaff: { 早番: 1, 日勤: 99 } };
    const maxStaffPair = [staff(), staff2()];
    const maxNg = scoreShifts({ s1: { 1: '早番', 2: '日勤' }, s2: { 1: '早番', 2: '日勤' } }, maxStaffPair, maxDept, 2, Y, M, {});
    expect(maxNg).toBe(150);
    // 比率乖離1% = 50点 < maxStaff超過1件 = 150点
    expect(maxNg).toBeGreaterThan(50);
  });
});
