import { describe, test, expect } from 'vitest';
import { bestOfN, getDays, WORK_TYPES } from '../shiftEngine.js';

// 介護部署モック: 早番・日勤・遅番・夜勤があり、介護補助は日勤のみ
const MOCK_DEPT = {
  id: 'test_kaigo',
  label: '介護部テスト',
  shiftTypes: ['早番', '日勤', '遅番', '夜勤'],
  minStaff: { 早番: 1, 日勤: 1, 遅番: 1, 夜勤: 1 },
  maxStaff: { 早番: 1, 日勤: 99, 遅番: 1, 夜勤: 1 },
  defaultKyukoDays: 8,
  maxConsecutive: 5,
  roles: ['介護福祉士', '介護補助'],
  roleShiftTypes: { '介護補助': ['日勤'] },
};

// 介護補助2名 + 介護福祉士3名の最小チーム
const makeStaff = () => [
  { id: 's1', name: '補助A', dept: 'test_kaigo', role: '介護補助', nightOk: false, nightMax: 0, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
  { id: 's2', name: '補助B', dept: 'test_kaigo', role: '介護補助', nightOk: false, nightMax: 0, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
  { id: 's3', name: '福祉士A', dept: 'test_kaigo', role: '介護福祉士', nightOk: true, nightMax: 5, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
  { id: 's4', name: '福祉士B', dept: 'test_kaigo', role: '介護福祉士', nightOk: true, nightMax: 5, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
  { id: 's5', name: '福祉士C', dept: 'test_kaigo', role: '介護福祉士', nightOk: true, nightMax: 5, kyukoDays: 8, targetWork: 20, kiboByMonth: {}, shiftRequestsByMonth: {}, kyukoDaysByMonth: {}, yukyuByMonth: {} },
];

const RESTRICTED_ROLES = { '介護補助': new Set(['日勤']) };
const NON_WORK = new Set(['休み', '希望休', '有休', '明け', '']);

describe('役職制限テスト: 介護補助は日勤のみ', () => {
  test('bestOfN の結果に介護補助の日勤以外の勤務シフトが入っていない', () => {
    const staffList = makeStaff();
    const year = 2026;
    const month = 3; // 4月(0-indexed)
    const days = getDays(year, month);
    const result = bestOfN(staffList, MOCK_DEPT, year, month, {}, {}, 10);

    expect(result).not.toBeNull();
    const shifts = result.shifts;

    const violations = [];
    for (const s of staffList.filter(s => s.role === '介護補助')) {
      for (let d = 1; d <= days; d++) {
        const sh = shifts[s.id]?.[d] || '';
        if (!sh || NON_WORK.has(sh)) continue;
        if (WORK_TYPES.has(sh) && sh !== '明け' && sh !== '日勤') {
          violations.push({ staff: s.name, day: d, shift: sh });
        }
      }
    }

    if (violations.length > 0) {
      console.error('役職制限違反:', violations);
    }
    expect(violations).toHaveLength(0);
  });

  test('10回の独立試行すべてで介護補助に日勤以外が入っていない', () => {
    const staffList = makeStaff();
    const year = 2026;
    const month = 3;
    const days = getDays(year, month);

    for (let trial = 0; trial < 10; trial++) {
      const result = bestOfN(staffList, MOCK_DEPT, year, month, {}, {}, 5);
      expect(result).not.toBeNull();

      for (const s of staffList.filter(s => s.role === '介護補助')) {
        for (let d = 1; d <= days; d++) {
          const sh = result.shifts[s.id]?.[d] || '';
          if (!sh || NON_WORK.has(sh)) continue;
          if (WORK_TYPES.has(sh) && sh !== '明け' && sh !== '日勤') {
            expect.fail(`試行${trial+1}: ${s.name} の ${d}日 に ${sh} が割り当てられた (日勤のみ許可)`);
          }
        }
      }
    }
  });

  test('isBadTransition: 遅番→日勤は通常部署で禁止', () => {
    // scoreShifts経由で検証: 遅番→日勤があるとペナルティが入るはず
    // autoGenerateが遅番→日勤を生成しないことを確認
    const staffList = makeStaff();
    const year = 2026;
    const month = 3;
    const days = getDays(year, month);
    const result = bestOfN(staffList, MOCK_DEPT, year, month, {}, {}, 20);
    expect(result).not.toBeNull();

    const badTransitions = [];
    for (const s of staffList) {
      for (let d = 2; d <= days; d++) {
        const prev = result.shifts[s.id]?.[d - 1] || '';
        const curr = result.shifts[s.id]?.[d] || '';
        if (prev === '遅番' && curr === '日勤') {
          badTransitions.push({ staff: s.name, day: d, transition: `${prev}→${curr}` });
        }
        if (prev === '遅番' && curr === '早番') {
          badTransitions.push({ staff: s.name, day: d, transition: `${prev}→${curr}` });
        }
        if (prev === '日勤' && curr === '早番') {
          badTransitions.push({ staff: s.name, day: d, transition: `${prev}→${curr}` });
        }
      }
    }

    if (badTransitions.length > 0) {
      console.error('禁止連続シフト違反:', badTransitions);
    }
    expect(badTransitions).toHaveLength(0);
  });
});
