/**
 * Phase5 Step7-EB: PassA 夜勤候補ゼロ原因 実測ログ取得
 *
 * 200試行 × kaigo1/kaigo2
 * shortage発生時（candidate==0）の除外理由を全件記録
 * 生成ロジック変更なし・ログ出力のみ
 */

import { describe, test, expect } from 'vitest';
import { autoGenerate, getDays, monthKey } from '../shiftEngine.js';

const SIMS  = 200;
const YEAR  = 2026, MONTH = 5;
const DAYS  = getDays(YEAR, MONTH);
const MK    = monthKey(YEAR, MONTH);
const DEPTWORK = new Set(['早番','日勤','遅番','夜勤']);

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

// ── PassA シャドウシミュレーター ──────────────────────────────────────────
// shiftEngine.js の Step1 + Step1.5 + Step2 ロジックを忠実に複製し、
// candidate==0 になった日の除外理由を記録する。
// 生成ロジックは変更しない（shiftEngine.js を直接呼び出す）。

function shadowPassA(ds, dept, year, month, days, mk) {
  const logs = []; // candidate==0 イベント

  // ── Step1: lockedDays 構築 ──────────────────────────────────────────────
  const res = {};
  const lockedDays = {};
  for (const s of ds) {
    res[s.id] = {};
    lockedDays[s.id] = new Set();
    // kiboByMonth → 希望休
    (s.kiboByMonth?.[mk] || []).forEach(d => { res[s.id][Number(d)] = '希望休'; });
    // yukyuByMonth → 有休
    (s.yukyuByMonth?.[mk] || []).forEach(d => { res[s.id][Number(d)] = '有休'; });
    // shiftRequestsByMonth
    Object.entries(s.shiftRequestsByMonth?.[mk] || {}).forEach(([d, v]) => { res[s.id][Number(d)] = v; });
    // 入力済み日をロック
    Object.keys(res[s.id]).forEach(d => lockedDays[s.id].add(Number(d)));
  }

  // 前月末繰り越し: テスト環境では prevShifts={} なのでスキップ

  // 希望勤務に夜勤/明けがある場合の連鎖
  for (const s of ds) {
    for (let d = 1; d <= days; d++) {
      if (res[s.id][d] === '夜勤') {
        if (d+1<=days && !lockedDays[s.id].has(d+1)) { res[s.id][d+1]='明け'; lockedDays[s.id].add(d+1); }
        if (d+2<=days && !lockedDays[s.id].has(d+2)) { res[s.id][d+2]='休み'; lockedDays[s.id].add(d+2); }
      } else if (res[s.id][d] === '明け') {
        if (d+1<=days && !lockedDays[s.id].has(d+1)) { res[s.id][d+1]='休み'; lockedDays[s.id].add(d+1); }
      }
    }
  }

  // ── Step1.5: 希望休アンカー配置 ────────────────────────────────────────
  const _nonNightTypes = dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け');
  const _nightAllowed = (s) => {
    const rst = dept.roleShiftTypes?.[s.role];
    if (!rst) return true;
    return rst.length >= _nonNightTypes.length;
  };

  if (dept.shiftTypes.includes('夜勤')) {
    const anchorPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const anchorAutoMax = Math.ceil(days / Math.max(anchorPool.length, 1));
    const sortedAnchorPool = [...anchorPool].sort((a, b) => (b.kiboNightPreference||0) - (a.kiboNightPreference||0));
    for (const s of sortedAnchorPool) {
      const kibodays = (s.kiboByMonth?.[mk] || []).map(Number).sort((a, b) => a - b);
      for (const D of kibodays) {
        const nightDay = D - 2, meakeDay = D - 1;
        if (nightDay < 1) continue;
        if (lockedDays[s.id].has(nightDay) || lockedDays[s.id].has(meakeDay)) continue;
        // C1 nightExcludeDays (shiftEngine.js にはなし)
        const prevDayShift = nightDay === 1 ? undefined : res[s.id][nightDay - 1];
        if (['夜勤','明け'].includes(prevDayShift)) continue;
        const usedNight = Object.values(res[s.id]).filter(v => v === '夜勤').length;
        if (usedNight >= Math.max(s.nightMax || 5, anchorAutoMax)) continue;
        // shiftEngine.js にはない dayNightCount チェックはスキップ
        res[s.id][nightDay] = '夜勤';
        res[s.id][meakeDay] = '明け';
        lockedDays[s.id].add(nightDay);
        lockedDays[s.id].add(meakeDay);
      }
    }
  }

  // ── Step2: 夜勤配置 ─────────────────────────────────────────────────────
  if (!dept.shiftTypes.includes('夜勤')) return logs;

  const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
  const autoMax   = Math.ceil(days / Math.max(nightPool.length, 1));

  const _isLowNR = (s) => {
    const fy = s.facilityYears, fl = s.floorYears;
    return fy != null && fl != null && (fy < 0.5 || fl < 0.2);
  };
  const _rrVN = { low: 0, medium: 2, high: 4 };
  const getRelocationRisk = (s) => {
    const fy = s.facilityYears, fl = s.floorYears;
    if (fy == null || fl == null) return 'low';
    return (fy >= 2 && fl < 0.5) ? 'high' : (fy >= 1 && fl < 0.3) ? 'medium' : 'low';
  };
  const _nightSort = (a, b) => {
    const nA = Object.values(res[a.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(a)];
    const nB = Object.values(res[b.id]).filter(v => v === '夜勤').length + _rrVN[getRelocationRisk(b)];
    return nA - nB;
  };

  // 候補除外理由を1スタッフ分記録するヘルパー
  const getReasonsForStaff = (s, d) => {
    const reasons = [];
    const c1 = s.nightExcludeDays?.has(d) || false;
    const c2 = lockedDays[s.id].has(d);
    const prevDayShift = d === 1 ? undefined : res[s.id][d-1];
    const c3 = prevDayShift === '夜勤' || prevDayShift === '明け';
    const c4 = d+1<=days && lockedDays[s.id].has(d+1) && res[s.id][d+1] !== '明け';
    const c5 = d+2<=days && lockedDays[s.id].has(d+2) && DEPTWORK.has(res[s.id][d+2]);
    const usedNight = Object.values(res[s.id]).filter(v => v === '夜勤').length;
    const overNightMax = usedNight >= (s.nightMax || 5);
    const overAutoMax  = usedNight >= autoMax;

    if (c1) reasons.push('crossFloor');
    if (c2) reasons.push('locked');
    if (c3) reasons.push('C3');
    if (c4) reasons.push('C4');
    if (c5) reasons.push('C5');
    // nightMax/autoMax は canNight が通った場合のみ記録
    if (!c1 && !c2 && !c3 && !c4 && !c5) {
      if (overNightMax) reasons.push('nightMax');
      if (overAutoMax && !overNightMax) reasons.push('autoMaxOnly'); // autoMax>nightMax の場合
    }
    return reasons;
  };

  for (let d = 1; d <= days; d++) {
    const already = ds.filter(s => res[s.id][d] === '夜勤').length;
    let need = (dept.minStaff['夜勤'] || 0) - already;
    if (need <= 0) continue;

    // 一次候補
    let cands = nightPool.filter(s => {
      const usedNight = Object.values(res[s.id]).filter(v => v === '夜勤').length;
      const c1 = s.nightExcludeDays?.has(d) || false;
      const c2 = lockedDays[s.id].has(d);
      const prevDayShift = d === 1 ? undefined : res[s.id][d-1];
      const c3 = prevDayShift === '夜勤' || prevDayShift === '明け';
      const c4 = d+1<=days && lockedDays[s.id].has(d+1) && res[s.id][d+1] !== '明け';
      const c5 = d+2<=days && lockedDays[s.id].has(d+2) && DEPTWORK.has(res[s.id][d+2]);
      if (c1||c2||c3||c4||c5) return false;
      return usedNight < Math.max(s.nightMax || 5, autoMax);
    }).sort(_nightSort);

    // フォールバック（nightMax上限無視）
    if (cands.length === 0) {
      cands = nightPool.filter(s => {
        const c1 = s.nightExcludeDays?.has(d) || false;
        const c2 = lockedDays[s.id].has(d);
        const prevDayShift = d === 1 ? undefined : res[s.id][d-1];
        const c3 = prevDayShift === '夜勤' || prevDayShift === '明け';
        const c4 = d+1<=days && lockedDays[s.id].has(d+1) && res[s.id][d+1] !== '明け';
        const c5 = d+2<=days && lockedDays[s.id].has(d+2) && DEPTWORK.has(res[s.id][d+2]);
        return !c1 && !c2 && !c3 && !c4 && !c5;
      }).sort(_nightSort);
    }

    if (cands.length === 0) {
      // candidate==0 → shortage確定（NG-2 breakなし、初回から空）
      // 除外理由を全nightPool分記録
      const perStaff = nightPool.map(s => ({
        staffId: s.id,
        reasons: getReasonsForStaff(s, d),
      }));
      // 理由ごとのカウント（1スタッフが複数理由を持つ場合は全カウント）
      const reasonCounts = {};
      for (const { reasons } of perStaff) {
        for (const r of reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
      }
      logs.push({
        type: 'candidate0_initial',
        d,
        nightPoolSize: nightPool.length,
        perStaff,
        reasonCounts,
        breakByNG2: false,
      });
      continue; // このdは shortage, 配置できない
    }

    // 配置実行（NG-2 ループ含む）
    let _cands = [...cands];
    let ng2Break = false;
    while (need > 0 && _cands.length > 0) {
      const lowNROnNight = ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤');
      if (lowNROnNight) {
        _cands = _cands.filter(s => !_isLowNR(s));
        if (_cands.length === 0) {
          ng2Break = true;
          // NG-2 break: shortage 確定
          const perStaff = nightPool.map(s => ({
            staffId: s.id,
            reasons: [...getReasonsForStaff(s, d), ...((_isLowNR(s)) ? ['NG2'] : [])],
          }));
          const reasonCounts = {};
          for (const { reasons } of perStaff) {
            for (const r of reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
          }
          logs.push({
            type: 'candidate0_ng2break',
            d,
            nightPoolSize: nightPool.length,
            perStaff,
            reasonCounts,
            breakByNG2: true,
          });
          break;
        }
      }
      const s = _cands.shift();
      res[s.id][d] = '夜勤';
      if (d+1<=days) res[s.id][d+1] = '明け';
      if (d+2<=days && !res[s.id][d+2]) res[s.id][d+2] = '休み';
      need--;
    }

    // while後 need > 0 かつ NG-2 break でない（_cands が尽きた）
    if (need > 0 && !ng2Break) {
      // _cands が尽きた（need>0かつ候補が途中で尽きた）
      // これは shortage（need>1の場合など）。candidate==0ではないが記録する
      const perStaff = nightPool.map(s => ({
        staffId: s.id,
        reasons: getReasonsForStaff(s, d),
      }));
      const reasonCounts = {};
      for (const { reasons } of perStaff) {
        for (const r of reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
      }
      // まだ割り当てが行われた後に候補が尽きた
      logs.push({
        type: 'cands_exhausted',
        d,
        nightPoolSize: nightPool.length,
        needRemaining: need,
        perStaff,
        reasonCounts,
        breakByNG2: false,
      });
    }
  }

  // shadowPassA後のshortage測定 + 夜勤日一覧
  let passAShortage = 0;
  const passANightDays = {}; // { staffId: [d, ...] }
  for (const s of ds) {
    passANightDays[s.id] = [];
    for (let d = 1; d <= days; d++) {
      if (res[s.id][d] === '夜勤') passANightDays[s.id].push(d);
    }
  }
  for (let d = 1; d <= days; d++) {
    const cnt = ds.filter(s => res[s.id][d] === '夜勤').length;
    if (cnt < (dept.minStaff['夜勤'] || 0)) passAShortage++;
  }

  return { logs, passAShortage, passANightDays };
}

// ── 集計ヘルパー ─────────────────────────────────────────────────────────
function countReasons(allLogs) {
  const counts = {};
  for (const log of allLogs) {
    for (const [r, c] of Object.entries(log.reasonCounts)) {
      counts[r] = (counts[r] || 0) + c;
    }
  }
  return counts;
}

describe('Phase5 Step7-EB: PassA 夜勤候補ゼロ 実測ログ', () => {
  test('200試行 × kaigo1/kaigo2 候補除外理由記録', { timeout: 1200000 }, () => {
    const allData = { kaigo1: [], kaigo2: [] };
    const shadowLogs = { kaigo1: [], kaigo2: [] };

    // 実際のshortage計測用（autoGenerateの出力から計算）
    const actualShortage = { kaigo1: 0, kaigo2: 0 };

    for (let sim = 0; sim < SIMS; sim++) {
      for (const deptId of ['kaigo1', 'kaigo2']) {
        const dept      = makeDept(deptId);
        const staffList = makeStaff(deptId, sim);
        const ds        = staffList.filter(s => s.dept === deptId);

        // シャドウPassA（ログ取得）
        const { logs, passAShortage, passANightDays } = shadowPassA(ds, dept, YEAR, MONTH, DAYS, MK);
        for (const log of logs) {
          shadowLogs[deptId].push({ trial: sim, ...log });
        }

        // 実際のautoGenerate（N=1、shortage測定用）
        const { shifts } = autoGenerate(staffList, dept, YEAR, MONTH, {}, {}, {}, {});
        let finalShortage = 0;
        for (let d = 1; d <= DAYS; d++) {
          const cnt = ds.filter(s => shifts[s.id]?.[d] === '夜勤').length;
          if (cnt < (dept.minStaff['夜勤'] || 0)) { actualShortage[deptId]++; finalShortage++; }
        }

        // PassA割当夜勤日 vs 最終出力の差分（PassC以降で除去された夜勤）
        let nightsRemovedAfterPassA = 0;
        const removedNightFinalShift = {}; // 除去後の最終シフト種別カウント
        for (const s of ds) {
          for (const d of (passANightDays[s.id] || [])) {
            const finalShiftOnDay = shifts[s.id]?.[d];
            if (finalShiftOnDay !== '夜勤') {
              nightsRemovedAfterPassA++;
              const k = finalShiftOnDay || 'undefined';
              removedNightFinalShift[k] = (removedNightFinalShift[k] || 0) + 1;
            }
          }
        }
        allData[deptId].push({ sim, logCount: logs.length, passAShortage, finalShortage, nightsRemovedAfterPassA, removedNightFinalShift });
      }
    }

    // ── 集計・出力 ──────────────────────────────────────────────────────
    for (const deptId of ['kaigo1', 'kaigo2']) {
      const logs = shadowLogs[deptId];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${deptId} (n=${SIMS}試行)`);
      console.log('='.repeat(60));

      // ① shortage総件数（autoGenerate実測）
      const totalPassAShortage = allData[deptId].reduce((a, b) => a + (b.passAShortage||0), 0);
      const totalNightsRemoved = allData[deptId].reduce((a, b) => a + (b.nightsRemovedAfterPassA||0), 0);
      console.log(`\n① shortage総件数（autoGenerate実測・最終出力）: ${actualShortage[deptId]}`);
      console.log(`① shortage総件数（shadowPassA後・PassC前）: ${totalPassAShortage}`);
      console.log(`   PassA割当夜勤がPassC以降で除去された件数: ${totalNightsRemoved}`);
      // 除去後の最終シフト集計
      const removedFinalShiftTotal = {};
      for (const d of allData[deptId]) {
        for (const [k, v] of Object.entries(d.removedNightFinalShift || {})) {
          removedFinalShiftTotal[k] = (removedFinalShiftTotal[k] || 0) + v;
        }
      }
      console.log(`   除去夜勤の最終シフト内訳:`);
      for (const [k, v] of Object.entries(removedFinalShiftTotal).sort((a,b)=>b[1]-a[1])) {
        console.log(`     ${k}: ${v}件`);
      }

      // ② candidate==0総件数（shadowPassA）
      console.log(`② candidate==0総件数: ${logs.length}`);
      const ng2Count    = logs.filter(l => l.breakByNG2).length;
      const initZero    = logs.filter(l => l.type === 'candidate0_initial').length;
      const candsExhausted = logs.filter(l => l.type === 'cands_exhausted').length;
      console.log(`   - 初回から0（経路α〜γ）: ${initZero}`);
      console.log(`   - NG-2 break（経路δ）: ${ng2Count}`);
      console.log(`   - 途中で候補枯渇（need>1）: ${candsExhausted}`);

      // ③ 除外理由別件数（スタッフ×理由の延べ数）
      const reasonCounts = countReasons(logs);
      const total = Object.values(reasonCounts).reduce((a,b)=>a+b, 0);
      const sorted = Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1]);
      console.log(`\n③ 除外理由別件数（延べ: nightPool${deptId==='kaigo1'?'6':'6'}人×日）:`);
      console.log(`   理由         件数    割合`);
      for (const [r, c] of sorted) {
        console.log(`   ${r.padEnd(12)} ${String(c).padStart(5)}   ${(c/Math.max(total,1)*100).toFixed(1)}%`);
      }

      // ④ 日付別件数
      const byDay = {};
      for (const log of logs) byDay[log.d] = (byDay[log.d] || 0) + 1;
      const topDays = Object.entries(byDay).sort((a,b)=>b[1]-a[1]).slice(0, 10);
      console.log(`\n⑤ 日付別件数 TOP10:`);
      for (const [d, c] of topDays) console.log(`   Day ${String(d).padStart(2)}: ${c}件`);

      // ⑧ nightMax超過件数
      console.log(`\n⑧ nightMax超過件数: ${reasonCounts['nightMax'] || 0}`);

      // ⑨ NG-2発動件数
      console.log(`⑨ NG-2発動件数: ${ng2Count}`);

      // ⑩ 単独原因 vs 複合原因
      let single = 0, multi = 0;
      const singleMap = {}, multiMap = {};
      for (const log of logs) {
        for (const { reasons } of log.perStaff) {
          if (reasons.length === 0) continue;
          const key = reasons.slice().sort().join('+');
          if (reasons.length === 1) {
            single++;
            singleMap[key] = (singleMap[key] || 0) + 1;
          } else {
            multi++;
            multiMap[key] = (multiMap[key] || 0) + 1;
          }
        }
      }
      console.log(`\n⑩ 単独原因（1理由のみ）スタッフ延べ数: ${single}`);
      for (const [k,v] of Object.entries(singleMap).sort((a,b)=>b[1]-a[1])) console.log(`   ${k}: ${v}`);
      console.log(`⑪ 複合原因（2理由以上）スタッフ延べ数: ${multi}`);
      for (const [k,v] of Object.entries(multiMap).sort((a,b)=>b[1]-a[1]).slice(0,10)) console.log(`   ${k}: ${v}`);

      // ⑫ CSV出力（全ログ）
      console.log(`\n⑫ CSV（全ログ, candidate==0イベント）:`);
      console.log(`trial,dept,day,type,ng2break,nightPoolSize,locked,C3,C4,C5,nightMax,autoMaxOnly,crossFloor,NG2,other`);
      for (const log of logs) {
        const rc = log.reasonCounts;
        console.log([
          log.trial, deptId, log.d, log.type, log.breakByNG2 ? 1 : 0,
          log.nightPoolSize,
          rc['locked']||0, rc['C3']||0, rc['C4']||0, rc['C5']||0,
          rc['nightMax']||0, rc['autoMaxOnly']||0, rc['crossFloor']||0, rc['NG2']||0,
          rc['other']||0,
        ].join(','));
      }
    }

    // テスト完了確認
    expect(allData.kaigo1.length).toBe(SIMS);
    expect(allData.kaigo2.length).toBe(SIMS);
  });
});
