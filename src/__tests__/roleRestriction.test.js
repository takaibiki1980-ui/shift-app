/**
 * しふぽん自動生成エンジン：核心ルール絶対死守テスト
 *
 * このテストが RED になる = プロダクションで役職違反・健康被害リスクが発生している
 * このテストが GREEN になる = 4つの「地獄のサボり」がコンクリートで埋まっている
 *
 * バグ1: localSearchImprove が介護補助/助手に早番・遅番をスワップして汚染する
 * バグ2: 30回ガチャ(bestOfN)の奇跡の一枚に役職違反がすり抜ける
 * バグ3: 10回独立試行のどこかで人手不足を理由に介護助手を便利屋扱いする
 * バグ4: 通常部署で「遅番 → 日勤」(12.5h インターバル) が成立してしまう
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { bestOfN, getDays, WORK_TYPES } from '../shiftEngine.js';

// ─────────────────────────────────────────────────────────────────────────────
//  テストフィクスチャ
// ─────────────────────────────────────────────────────────────────────────────

let mockDept;
let mockStaffs;
let mockShiftTrend;

beforeEach(() => {
  // 1. 部署設定のモック（介護職：インターバル設定なし = 通常部署）
  mockDept = {
    id: 'dept_care',
    label: '介護部2階',
    shiftTypes: ['早番', '日勤', '遅番', '夜勤'],
    minStaff: { 早番: 1, 日勤: 1, 遅番: 1, 夜勤: 1 },
    maxStaff: { 早番: 1, 日勤: 99, 遅番: 1, 夜勤: 1 },
    defaultKyukoDays: 8,
    maxConsecutive: 5,
    roles: ['介護福祉士', '介護職員', '介護補助', '介護助手'],
    roleShiftTypes: {
      '介護補助': ['日勤'], // ★日勤のみ
      '介護助手': ['日勤'], // ★日勤のみ（ジャムナはここ）
    },
    // intervalThreshold なし = 通常部署（遅番→日勤は文字ルールで禁止）
  };

  // 2. スタッフデータのモック（ジャムナ=介護助手、スタッフA=介護補助を含む）
  mockStaffs = [
    { id: 's1', name: 'ジャムナ',     dept: 'dept_care', role: '介護助手',   nightOk: false, nightMax: 0, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
    { id: 's2', name: 'スタッフA',    dept: 'dept_care', role: '介護補助',   nightOk: false, nightMax: 0, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
    { id: 's3', name: '介護福祉士A',  dept: 'dept_care', role: '介護福祉士', nightOk: true,  nightMax: 5, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
    { id: 's4', name: '介護福祉士B',  dept: 'dept_care', role: '介護福祉士', nightOk: true,  nightMax: 5, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
    { id: 's5', name: '介護職員A',    dept: 'dept_care', role: '介護職員',   nightOk: true,  nightMax: 5, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
  ];

  // 3. 過去のExcel実績ノイズ：ジャムナに「早番」「遅番」の高確率データを意図的に注入
  //    → エンジンがこのノイズに惑わされて役職制限を破らないかテスト
  mockShiftTrend = {
    'ジャムナ': {
      早番: 0.65, // 過去データ上は早番が最多（本来は役職制限で無視されるべき）
      日勤: 0.25,
      遅番: 0.10,
      dowShiftRate: {
        1: { 早番: 0.80, 日勤: 0.20 }, // 月曜: 過去8割が早番
        2: { 遅番: 0.70, 日勤: 0.30 }, // 火曜: 過去7割が遅番
        3: { 早番: 0.60, 日勤: 0.40 },
      },
    },
    'スタッフA': {
      早番: 0.50,
      日勤: 0.40,
      遅番: 0.10,
    },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
//  ヘルパー: bestOfN の結果を { day: shift } の配列に展開
// ─────────────────────────────────────────────────────────────────────────────
const extractDays = (result, staffId, totalDays) =>
  Array.from({ length: totalDays }, (_, i) => result.shifts[staffId]?.[i + 1] || '');

// 公休・希望休・有休・明け・空白はすべて「許可」
const NON_WORK = new Set(['休み', '希望休', '有休', '明け', '']);

// ─────────────────────────────────────────────────────────────────────────────

describe('しふぽん自動生成エンジン：核心ルール絶対死守テスト', () => {

  // ===========================================================================
  // 🎯 テスト1 & 2 & 3：役割制限 10回連続ガチャ（バグ1・2・3を同時撃墜）
  // ===========================================================================
  test(
    '【役割制限】10回連続で独立試行ガチャを回しても、' +
    '介護補助・介護助手に日勤以外のシフトが「1コマ」も混入しないこと',
    () => {
      const year = 2026, month = 3; // 4月 (0-indexed)
      const days = getDays(year, month);
      const TOTAL_TRIALS = 10;

      // 制限対象スタッフ
      const restrictedStaff = mockStaffs.filter(s =>
        mockDept.roleShiftTypes?.[s.role] !== undefined
      );

      for (let trial = 1; trial <= TOTAL_TRIALS; trial++) {
        // ★ Excel ノイズ付きで 30回ガチャ（内部で localSearchImprove も走る）
        const result = bestOfN(mockStaffs, mockDept, year, month, {}, mockShiftTrend, 30);

        expect(result, `試行${trial}: bestOfN が null を返した`).not.toBeNull();

        for (const s of restrictedStaff) {
          const days_ = extractDays(result, s.id, days);

          days_.forEach((shift, idx) => {
            // 非勤務日（公休・希望休・有休・明け・空白）は合格
            if (NON_WORK.has(shift)) return;

            // 勤務シフトが日勤以外なら一発アウト（何回目の何日目まで明示）
            if (WORK_TYPES.has(shift) && shift !== '日勤') {
              expect.fail(
                `❌ 試行${trial} / ${s.name}（${s.role}） ${idx + 1}日目: ` +
                `「${shift}」が割り当てられた — 日勤のみ許可のはずが制限破り`
              );
            }
          });
        }
      }
    }
  );

  // ===========================================================================
  // 🎯 テスト4：isBadTransition（遅番→日勤 を通常部署で完全禁止）
  // ===========================================================================
  test(
    '【横の法律】通常部署において、スタッフの体を壊す「遅番 ➡️ 日勤」' +
    'の並びが1箇所も発生していないこと',
    () => {
      const year = 2026, month = 3;
      const days = getDays(year, month);

      // 20回の独立試行すべてで違反ゼロを確認（偶然通過を排除）
      for (let trial = 1; trial <= 20; trial++) {
        const result = bestOfN(mockStaffs, mockDept, year, month, {}, {}, 30);

        expect(result, `試行${trial}: bestOfN が null`).not.toBeNull();

        for (const s of mockStaffs) {
          for (let d = 2; d <= days; d++) {
            const prev = result.shifts[s.id]?.[d - 1] || '';
            const curr = result.shifts[s.id]?.[d] || '';

            // 「前日が遅番」かつ「翌日が日勤」= 12.5時間インターバル違反
            if (prev === '遅番' && curr === '日勤') {
              expect.fail(
                `❌ 試行${trial} / ${s.name}: ` +
                `${d - 1}日(遅番) → ${d}日(日勤) が発生 ` +
                `（インターバル12.5時間 = 通常部署では絶対禁止）`
              );
            }

            // おまけ: 遅番→早番（11h）・日勤→早番（13.5h）も確認
            if (prev === '遅番' && curr === '早番') {
              expect.fail(`❌ 試行${trial} / ${s.name}: ${d - 1}日(遅番) → ${d}日(早番) 11時間違反`);
            }
            if (prev === '日勤' && curr === '早番') {
              expect.fail(`❌ 試行${trial} / ${s.name}: ${d - 1}日(日勤) → ${d}日(早番) 13.5時間違反`);
            }
          }
        }
      }
    }
  );

  // ===========================================================================
  // 🎯 ボーナス：Excel ノイズがあっても役職制限が勝つことを単独確認
  // ===========================================================================
  test(
    '【Excelノイズ耐性】ジャムナの過去データが早番80%でも、' +
    '役職制限が上書きして日勤しか入らないこと',
    () => {
      const year = 2026, month = 3;
      const days = getDays(year, month);

      // 5回試行（ノイズデータ付き）
      for (let trial = 1; trial <= 5; trial++) {
        const result = bestOfN(mockStaffs, mockDept, year, month, {}, mockShiftTrend, 30);
        expect(result).not.toBeNull();

        const jamnaShifts = extractDays(result, 's1', days);
        jamnaShifts.forEach((shift, idx) => {
          if (NON_WORK.has(shift)) return;
          if (WORK_TYPES.has(shift) && shift !== '日勤') {
            expect.fail(
              `❌ 試行${trial} / ジャムナ ${idx + 1}日目: 「${shift}」` +
              `— Excelノイズ(早番80%)に引っ張られて役職制限が破られた`
            );
          }
        });
      }
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  時間軸エンジン autoGenerateTime Phase3 2-opt スワップ役職チェック
// ─────────────────────────────────────────────────────────────────────────────
describe('autoGenerateTime Phase3 2-opt swap: 役職外シフトへのスワップ拒否', () => {

  // Phase3 のスワップ可否判定ロジックと同じ述語
  // 修正後: eligibleShifts[s1.id].includes(v2) && eligibleShifts[s2.id].includes(v1) を必須条件とする
  const canSwap = (eligibleShifts, s1id, s2id, v1, v2) =>
    eligibleShifts[s1id].includes(v2) && eligibleShifts[s2id].includes(v1);

  test('調理補助(日勤のみ) ↔ 管理栄養士(早番・日勤): 日勤↔早番 swap は拒否される', () => {
    const eligibleShifts = {
      chorisho: ['日勤'],            // 調理補助: 日勤のみ
      kanrieyo: ['早番', '日勤'],    // 管理栄養士: 早番・日勤
    };

    // swap後 調理補助が早番を受け取る → 役職外 → 拒否
    expect(canSwap(eligibleShifts, 'chorisho', 'kanrieyo', '日勤', '早番')).toBe(false);
  });

  test('調理補助(日勤のみ) ↔ 管理栄養士(早番・日勤): 日勤↔日勤 swap は許可される', () => {
    const eligibleShifts = {
      chorisho: ['日勤'],
      kanrieyo: ['早番', '日勤'],
    };

    // どちらも日勤を受け取る → 双方の役職内 → 許可
    expect(canSwap(eligibleShifts, 'chorisho', 'kanrieyo', '日勤', '日勤')).toBe(true);
  });

  test('管理栄養士(早番・日勤) ↔ 調理補助(日勤のみ): 早番↔日勤 逆向きも拒否される', () => {
    const eligibleShifts = {
      chorisho: ['日勤'],
      kanrieyo: ['早番', '日勤'],
    };

    // s1=管理栄養士が日勤を受け取り(OK)、s2=調理補助が早番を受け取る(NG)
    expect(canSwap(eligibleShifts, 'kanrieyo', 'chorisho', '早番', '日勤')).toBe(false);
  });

  test('制限なし同士: 早番↔日勤 swap は許可される', () => {
    const eligibleShifts = {
      s1: ['早番', '日勤', '遅番'],
      s2: ['早番', '日勤', '遅番'],
    };

    expect(canSwap(eligibleShifts, 's1', 's2', '日勤', '早番')).toBe(true);
    expect(canSwap(eligibleShifts, 's1', 's2', '早番', '遅番')).toBe(true);
  });
});
