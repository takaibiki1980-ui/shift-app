/**
 * Phase5 Step7-EC: 夜勤セル変更元 完全トレース
 *
 * PassAで配置した夜勤セルがどのフェーズで何へ変更されたかを100%特定する。
 * 200試行 × kaigo1/kaigo2
 * 生成ロジック変更なし・ログ出力のみ
 */

import { describe, test, expect } from 'vitest';
import {
  autoGenerate, getDays, monthKey,
  enablePhaseSnaps, disablePhaseSnaps, getPhaseSnaps,
  bestOfN, localSearchImprove,
} from '../shiftEngine.js';

const SIMS  = 200;
const YEAR  = 2026, MONTH = 5;
const DAYS  = getDays(YEAR, MONTH);
const MK    = monthKey(YEAR, MONTH);

const PHASES = [
  'postStep2_night',
  'postStep25',
  'postPassA',
  'postPassB',
  'postPassC',
  'postRestAdj1',
  'postEnforceMax1',
  'postTransitionFix',
  'postEnforceMax2',
  'postMinStaff',
  'postEnforceMax3',
  'postRestAdj2',
  'postEnforceMax4',
  'final',
];

function makeDept(id) {
  return {
    id,
    shiftTypes:      ['早番','日勤','遅番','夜勤','明け','休み'],
    minStaff:        { '早番':1, '日勤':1, '遅番':1, '夜勤':1 },
    maxStaff:        { '早番':1, '日勤':99, '遅番':1, '夜勤':1 },
    maxConsecutive:  5,
    customShiftDefs: [],
    roleShiftTypes:  {},
    shiftTimes:      {},
  };
}

function makePRNG(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

function makeStaff(deptId, sim) {
  const rng = makePRNG(sim * 73 + (deptId === 'kaigo2' ? 50000 : 0));
  return Array.from({length:10}, (_,i) => {
    const idx = i+1;
    const nightOk = idx <= 6;
    const kyuko = Math.floor(rng()*3)+7;
    const kiboCount = rng()<0.4 ? (rng()<0.5?1:2) : 0;
    const kibo = [];
    for (let k=0; k<kiboCount; k++) {
      const d = Math.floor(rng()*28)+1;
      if (!kibo.includes(d)) kibo.push(d);
    }
    return {
      id:   `${deptId}_s${idx}`,
      name: `Staff${deptId}${idx}`,
      dept:  deptId,
      role:  'その他',
      nightOk,
      kyukoDays:        kyuko,
      kyukoDaysByMonth: {},
      kiboByMonth:      kibo.length ? {[MK]: kibo} : {},
      yukyuByMonth:     {},
      shiftRequestsByMonth: {},
      shiftRatio:       null,
      shiftRatioByMonth: null,
      facilityYears:    1 + rng()*4,
      floorYears:       1 + rng()*3,
      nightMax:         5,
      foreignNightSupportRequired: false,
      nightExcludeDays: new Set(),
      shiftRatioCorrection: {},
    };
  });
}

describe('Step7-EC: 夜勤セル変更元 完全トレース', () => {
  test('200試行 × kaigo1/kaigo2 フェーズ別変更集計', () => {
    const deptIds = ['kaigo1', 'kaigo2'];
    const allChanges = []; // 全変更イベント

    for (const deptId of deptIds) {
      for (let sim = 0; sim < SIMS; sim++) {
        const dept = makeDept(deptId);
        const staffList = makeStaff(deptId, sim);

        enablePhaseSnaps();
        const result = autoGenerate(staffList, dept, YEAR, MONTH, {}, {}, {}, {});
        const snaps = getPhaseSnaps();
        disablePhaseSnaps();

        if (!snaps) continue;

        // PassAで配置された夜勤セルを特定
        // postStep2_night はStep2夜勤配置直後
        // postPassA はPassA休み配置後（夜勤には影響しない可能性高いが念のため比較）
        // PassA配置夜勤 = postStep2_night の時点で '夜勤' のセル
        const passANightSnap = snaps['postStep2_night'] || {};

        // 各セルのPhase別変更履歴を構築
        for (const s of staffList) {
          for (let d = 1; d <= DAYS; d++) {
            const passAVal = passANightSnap[s.id]?.[d];
            if (passAVal !== '夜勤') continue;

            // このセルがpassA後に変更されたかを各フェーズで追跡
            let history = [{ phase: 'postStep2_night', value: '夜勤' }];
            let prevVal = '夜勤';

            for (const phase of PHASES) {
              if (phase === 'postStep2_night') continue;
              const snap = snaps[phase];
              if (!snap) continue;
              const val = snap[s.id]?.[d];
              if (val !== prevVal) {
                history.push({ phase, value: val });
                prevVal = val;
              }
            }

            const finalVal = snaps['final']?.[s.id]?.[d] ?? '夜勤';
            const changed = finalVal !== '夜勤';

            if (changed || history.length > 1) {
              allChanges.push({
                trial: sim,
                dept: deptId,
                staffId: s.id,
                day: d,
                passAValue: '夜勤',
                finalValue: finalVal,
                changed,
                changeCount: history.length - 1,
                firstChangedPhase: history.length > 1 ? history[1].phase : null,
                lastChangedPhase: history.length > 1 ? history[history.length - 1].phase : null,
                history: history.slice(1), // passA以降の変更のみ
              });
            }
          }
        }
      }
    }

    // ── 集計 ──────────────────────────────────────────────────────────────

    // ①PassA配置夜勤総数
    let totalPassANights = 0;
    for (const deptId of deptIds) {
      for (let sim = 0; sim < SIMS; sim++) {
        const dept = makeDept(deptId);
        const staffList = makeStaff(deptId, sim);
        enablePhaseSnaps();
        autoGenerate(staffList, dept, YEAR, MONTH, {}, {}, {}, {});
        const snaps = getPhaseSnaps();
        disablePhaseSnaps();
        if (!snaps) continue;
        const passANightSnap = snaps['postStep2_night'] || {};
        for (const s of staffList) {
          for (let d = 1; d <= DAYS; d++) {
            if (passANightSnap[s.id]?.[d] === '夜勤') totalPassANights++;
          }
        }
      }
    }

    const changedCells = allChanges.filter(c => c.changed);

    // ②変更された夜勤総数
    const totalChanged = changedCells.length;

    // ③フェーズ別変更件数（最初に変更したフェーズ基準）
    const phaseFirstChangeCounts = {};
    for (const c of changedCells) {
      const p = c.firstChangedPhase;
      phaseFirstChangeCounts[p] = (phaseFirstChangeCounts[p] || 0) + 1;
    }

    // ④フェーズ別割合
    const phaseFirstChangeRatio = {};
    for (const [p, cnt] of Object.entries(phaseFirstChangeCounts)) {
      phaseFirstChangeRatio[p] = totalChanged > 0 ? (cnt / totalChanged * 100).toFixed(1) + '%' : '0%';
    }

    // ⑤〜⑨変更後シフト別件数（最終値）
    const finalShiftCounts = {};
    for (const c of changedCells) {
      finalShiftCounts[c.finalValue] = (finalShiftCounts[c.finalValue] || 0) + 1;
    }

    // ⑩最終shortage件数（全試行の最終snapshotで夜勤不足日数を集計）
    // ※これは再試行が必要なので別ループ
    let totalShortage = 0;
    for (const deptId of deptIds) {
      for (let sim = 0; sim < SIMS; sim++) {
        const dept = makeDept(deptId);
        const staffList = makeStaff(deptId, sim);
        enablePhaseSnaps();
        autoGenerate(staffList, dept, YEAR, MONTH, {}, {}, {}, {});
        const snaps = getPhaseSnaps();
        disablePhaseSnaps();
        if (!snaps?.final) continue;
        const finalSnap = snaps.final;
        for (let d = 1; d <= DAYS; d++) {
          const cnt = staffList.filter(s => finalSnap[s.id]?.[d] === '夜勤').length;
          const min = dept.minStaff['夜勤'] || 1;
          if (cnt < min) totalShortage += (min - cnt);
        }
      }
    }

    // ⑪1回のみ変更
    const oneChange = changedCells.filter(c => c.changeCount === 1).length;
    // ⑫2回以上変更
    const multiChange = changedCells.filter(c => c.changeCount >= 2).length;

    // ⑬最初に変更したフェーズランキング
    const firstChangeRanking = Object.entries(phaseFirstChangeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([phase, count]) => `${phase}: ${count}件 (${(count/totalChanged*100).toFixed(1)}%)`);

    // ⑭最後に変更したフェーズランキング
    const phaseLastChangeCounts = {};
    for (const c of changedCells) {
      const p = c.lastChangedPhase;
      phaseLastChangeCounts[p] = (phaseLastChangeCounts[p] || 0) + 1;
    }
    const lastChangeRanking = Object.entries(phaseLastChangeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([phase, count]) => `${phase}: ${count}件 (${(count/totalChanged*100).toFixed(1)}%)`);

    // ⑮全変更履歴CSV出力
    const csvLines = ['trial,dept,staffId,day,passAValue,finalValue,changeCount,firstChangedPhase,lastChangedPhase,historyDetail'];
    for (const c of allChanges) {
      const histDetail = c.history.map(h => `${h.phase}:${h.value}`).join('|');
      csvLines.push([c.trial, c.dept, c.staffId, c.day, c.passAValue, c.finalValue, c.changeCount, c.firstChangedPhase || '', c.lastChangedPhase || '', `"${histDetail}"`].join(','));
    }

    // ── 出力 ──────────────────────────────────────────────────────────────
    console.log('\n=== Step7-EC: 夜勤セル変更元 完全トレース結果 ===');
    console.log(`試行数: ${SIMS} × ${deptIds.length}部署 = ${SIMS * deptIds.length}試行`);
    console.log('');
    console.log(`①PassA配置夜勤総数: ${totalPassANights}件`);
    console.log(`②変更された夜勤総数: ${totalChanged}件 (${totalPassANights > 0 ? (totalChanged/totalPassANights*100).toFixed(1) : 0}%)`);
    console.log('');
    console.log('③フェーズ別 最初に変更件数:');
    for (const line of firstChangeRanking) console.log('  ' + line);
    console.log('');
    console.log('④フェーズ別 最初に変更割合:');
    for (const [p, r] of Object.entries(phaseFirstChangeRatio)) console.log(`  ${p}: ${r}`);
    console.log('');
    console.log('⑤〜⑨変更後シフト別件数（最終値）:');
    for (const [shift, cnt] of Object.entries(finalShiftCounts).sort((a,b)=>b[1]-a[1])) {
      console.log(`  ${shift}: ${cnt}件 (${(cnt/totalChanged*100).toFixed(1)}%)`);
    }
    console.log('');
    console.log(`⑩最終shortage件数（夜勤不足）: ${totalShortage}件 / ${SIMS * deptIds.length}試行`);
    console.log(`⑪1回のみ変更: ${oneChange}件`);
    console.log(`⑫2回以上変更: ${multiChange}件`);
    console.log('');
    console.log('⑬最初に変更したフェーズランキング:');
    firstChangeRanking.forEach((l, i) => console.log(`  ${i+1}. ${l}`));
    console.log('');
    console.log('⑭最後に変更したフェーズランキング:');
    lastChangeRanking.forEach((l, i) => console.log(`  ${i+1}. ${l}`));
    console.log('');
    console.log('⑮全変更履歴CSV (先頭20行):');
    csvLines.slice(0, 21).forEach(l => console.log(l));
    if (csvLines.length > 21) console.log(`... 他${csvLines.length - 21}行`);

    expect(totalPassANights).toBeGreaterThan(0);
    expect(SIMS).toBe(200);
  }, 600000);
});
