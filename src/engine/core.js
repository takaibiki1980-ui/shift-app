const REST_TYPES  = new Set(["休み","希望休","有休","明け","日/休","休/日","早/休","休/遅"]);

const WORK_TYPES  = new Set(["早番","日勤","研修","遅番","夜勤"]);

// カスタムシフト種別のstyling定義を取得（標準SHIFTSに無い場合はbaseTypeの色を継承）

function buildDeptWorkTypes(customDefs) {
  const s = new Set(WORK_TYPES);
  (customDefs || []).filter(d => WORK_TYPES.has(d.baseType)).forEach(d => s.add(d.key));
  return s;
}

function buildDeptRestTypes(customDefs) {
  const s = new Set(REST_TYPES);
  (customDefs || []).filter(d => REST_TYPES.has(d.baseType)).forEach(d => s.add(d.key));
  return s;
}
// ── 必須運営時間モード（カスタム時間部署）向けヘルパー ────────────────────

function isCustomTimeDept(dept) { return !!(dept?.requiredStart && dept?.requiredEnd); }

function timeToMins(t) { if (!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; }

function buildDayIntervals(shiftKeys, dept) {
  const iv=[];
  for (const sk of (shiftKeys||[])) {
    if(!sk)continue;
    const ss=getShiftStartTime(sk,dept),es=getShiftEndTime(sk,dept);
    if(!ss||!es)continue;
    const s0=timeToMins(ss),e0=timeToMins(es);
    iv.push({start:s0,end:e0<=s0?e0+1440:e0});
  }
  return iv;
}

function coverageGaps(intervals,reqStart,reqEnd,minStaff=1,step=15) {
  const gaps=[];let gs=null;
  for(let m=reqStart;m<=reqEnd;m+=step){
    const cnt=intervals.filter(iv=>m>=iv.start&&m<iv.end).length;
    if(cnt<minStaff){if(gs==null)gs=m;}
    else if(gs!=null){gaps.push({start:gs,end:m});gs=null;}
  }
  if(gs!=null)gaps.push({start:gs,end:reqEnd});
  return gaps;
}
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SHIFT_TIMES = {
  "早番": { start: "07:00", end: "16:00" },
  "日勤": { start: "09:00", end: "18:00" },
  "遅番": { start: "11:30", end: "20:30" },
  "夜勤": { start: "16:30", end: "09:30" },
};

function getShiftEndTime(key, dept) {
  const st = dept?.shiftTimes?.[key];
  if (st?.end) return st.end;
  return DEFAULT_SHIFT_TIMES[key]?.end || null;
}

function getShiftStartTime(key, dept) {
  const st = dept?.shiftTimes?.[key];
  if (st?.start) return st.start;
  return DEFAULT_SHIFT_TIMES[key]?.start || null;
}

function shiftIntervalHours(prevKey, nextKey, dept) {
  const endStr = getShiftEndTime(prevKey, dept);
  const startStr = getShiftStartTime(nextKey, dept);
  if (!endStr || !startStr) return 24;
  const [eh, em] = endStr.split(":").map(Number);
  const [sh, sm] = startStr.split(":").map(Number);
  return (sh * 60 + sm + 1440 - (eh * 60 + em)) / 60;
}


const getDays  = (y,m) => new Date(y,m+1,0).getDate();

const monthKey = (y,m) => `${y}-${m+1}`;

// 名前正規化：スペース(半角・全角)・中点(・･)・ピリオドを除去して小文字化
// 「田中 花子」「田中　花子」「田中花子」「ジョン・スミス」「ジョン スミス」を統一比較

const normName = (s) => String(s||'').replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[\s　・･．.\-ー－]/g,'').toLowerCase();

const nameMatch = (a, b) => { const na=normName(a), nb=normName(b); return na===nb||na.includes(nb)||nb.includes(na); };

// UUID ↔ 22文字base64url変換（URLを40%短縮）

function buildNightSet(dept) {
  return new Set(
    [...new Set(dept.shiftTypes || [])].filter(k => {
      const _cd = (dept.customShiftDefs || []).find(d => d.key === k);
      return (_cd?.baseType || k) === '夜勤';
    })
  );
}

// Step3: buildSlotManagedTypes - role-slot 対象シフト Set を構築（Tier1絶対制約の対象一覧）
// 元コード: autoGenerate 内 slotManagedTypes（L784〜792）と同一ロジック

function buildSlotManagedTypes(dept, maxStaff) {
  return new Set(
    [...new Set(dept.shiftTypes)].filter(k => {
      if (k === '明け') return false;
      const cd = (dept.customShiftDefs || []).find(d => d.key === k);
      const base = cd?.baseType || k;
      if (base === '日勤') return false;
      return (maxStaff[k] ?? 99) < 99;
    })
  );
}

// Step4: isNikkinBase - シフトキーの baseType が日勤かどうかを判定
// 元コード: autoGenerate 内 _isNikkinBase（L1543）と同一ロジック

function isNikkinBase(k, customDefs) {
  return ((customDefs || []).find(c => c.key === k)?.baseType || k) === '日勤';
}

// Step5: isBadTransition - シフト遷移が違反かどうかを判定（純粋関数）
// 元コード: autoGenerate 内 isBadTransition（L976〜983）と同一ロジック
// nightSet = buildNightSet(dept) の結果を渡すこと（明け前日バリデーション用）

function isBadTransition(prev, curr, dept, nightSet) {
  if (!prev || !curr) return false;
  if (dept.intervalEnabled && dept.intervalTargetShifts?.includes(curr)) {
    return shiftIntervalHours(prev, curr, dept) < (dept.intervalHours ?? 11);
  }
  if (curr === '明け' && !nightSet.has(prev)) return true;
  return (prev === "遅番" && (curr === "早番" || curr === "日勤")) || (prev === "日勤" && curr === "早番");
}
// Step6: isSlotManaged - シフトキーが role-slot（Tier1絶対制約）対象かを判定
// 元コード: autoGenerate 内 isSlotManaged（L833）と同一ロジック

function isSlotManaged(shiftKey, slotManagedTypes) {
  return slotManagedTypes.has(shiftKey);
}

// Step6: shouldProtectSlot - Tier2 repair がシフトを削減してよいか判定する共通ガード
// 元コード: autoGenerate 内 shouldProtectSlot（L844〜847）と同一ロジック
// 返値 true → 削減禁止（protect）、false → 削減可

function shouldProtectSlot(shiftKey, count, slotManagedTypes, maxStaff) {
  if (!isSlotManaged(shiftKey, slotManagedTypes)) return false;
  return count <= (maxStaff[shiftKey] ?? 99);
}
// ─────────────────────────────────────────────────────────────────────────────

// Step8: consecWork - 当日以前の連続勤務日数を返す（前月末 prevTail まで遡る）
// 元コード: autoGenerate 内 consecWork（L968〜982）と同一ロジック

function consecWork(id, d, res, deptWork, prevTail, prevDays) {
  let c = 0;
  for (let i = d; i >= 1; i--) {
    if (deptWork.has(res[id][i])) c++;
    else return c;
  }
  if (prevTail[id]) {
    for (let i = prevDays; i >= Math.max(1, prevDays - 4); i--) {
      if (deptWork.has(prevTail[id][i])) c++;
      else break;
    }
  }
  return c;
}

// Step8: consecRest - d日以前の連続休み日数を返す（明けは除外）
// 元コード: autoGenerate 内 consecRest（L983）と同一ロジック

function consecRest(id, d, res, deptRest) {
  let c = 0;
  for (let i = d; i >= 1; i--) {
    if (deptRest.has(res[id][i]) && res[id][i] !== "明け") c++;
    else break;
  }
  return c;
}

// Step8: consecRestFwd - d日以降の連続休み日数を返す（明けは除外）
// 元コード: autoGenerate 内 consecRestFwd（L984）と同一ロジック

function consecRestFwd(id, d, res, deptRest, days) {
  let c = 0;
  for (let i = d + 1; i <= days; i++) {
    if (deptRest.has(res[id][i]) && res[id][i] !== "明け") c++;
    else break;
  }
  return c;
}

// Step9: canRest - 指定日に休みを配置してよいか判定（明け翌日禁止 + 連続休み上限2日）
// 元コード: autoGenerate 内 canRest（L1014〜1017）と同一ロジック

function canRest(id, d, res, deptRest, days) {
  if (res[id][d - 1] === "明け") return false;
  return (consecRest(id, d - 1, res, deptRest) + 1 + consecRestFwd(id, d, res, deptRest, days)) <= 2;
}
// ─────────────────────────────────────────────────────────────────────────────
// ★ Phase5 Step4: Night Slot Optimizer 基盤関数（Phase4-A）
// 既存コードからは呼び出されない。Phase4-E で Step2 ループを置換する際に使用する。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NSO_canAssignInitial
 * 静的制約のみ評価（C1/C2/C4/C5）。C3（前日夜勤/明け）は評価しない。
 * C3 は配置ループ内で NSO_checkC3 を使って動的評価する。
 *
 * C1: nightExcludeDays に d が含まれる（クロスフロア夜勤禁止日）
 * C2: lockedDays に d が含まれる（希望休・有休・アンカー固定）
 * C4: lockedDays に d+1 が含まれ、res[d+1] が "明け" 以外（翌日ロック済み非明け）
 * C5: lockedDays に d+2 が含まれ、res[d+2] が deptWork に含まれる（翌々日固定勤務）
 *
 * @returns {boolean} true = 静的制約クリア（C3は別途 NSO_checkC3 でチェック必要）
 */

function NSO_canAssignInitial(s, d, lockedDays, res, deptWork, days) {
  if (s.nightExcludeDays?.has(d)) return false;                               // C1
  if (lockedDays[s.id].has(d)) return false;                                  // C2
  if (d + 1 <= days
      && lockedDays[s.id].has(d + 1)
      && res[s.id][d + 1] !== '明け') return false;                           // C4
  if (d + 2 <= days
      && lockedDays[s.id].has(d + 2)
      && deptWork.has(res[s.id][d + 2])) return false;                        // C5
  return true;
}

/**
 * NSO_checkC3
 * C3: 前日 d-1 が夜勤/明けなら d への配置は不可。
 * 判定順序:
 *   1. assignmentSet に d-1 が含まれる → NSO が夜勤を割り当て済み → 明け確定 → C3違反
 *   2. res[s.id][d-1] が "夜勤" または "明け" → アンカー配置・前月繰り越し → C3違反
 *   3. d === 1 かつ prevShiftFn(s.id) が "夜勤"/"明け" → 前月末繰り越し → C3違反
 *
 * @param {Object} s              スタッフオブジェクト
 * @param {number} d              対象日
 * @param {Set<number>} assignSet NSO 内部の当該スタッフの配置済み日集合
 * @param {Object} res            シフト配列（res[s.id][d]）
 * @param {Object} lockedDays     ロック済み日集合（参照のみ）
 * @param {Function|null} prevShiftFn (staffId) => string|null（前月末シフト）
 * @returns {boolean} true = C3違反（配置不可）
 */

function NSO_checkC3(s, d, assignSet, res, lockedDays, prevShiftFn) {
  if (d === 1) {
    const prev = prevShiftFn?.(s.id);
    return prev === '夜勤' || prev === '明け';
  }
  // NSO 内部 assignment を参照（d-1 が NSO 配置済みなら d は明け確定）
  if (assignSet.has(d - 1)) return true;
  // d+2 が配置済みの場合: d を置くと d+1=明け → d+2=夜勤 で C3違反（逆方向防護）
  // assignSet は有効な日のみ含むため d+2>days の場合は自然に has()=false
  if (assignSet.has(d + 2)) return true;
  // res[] の既確定値（アンカー配置・前日明け等）
  const prevVal = res[s.id][d - 1];
  return prevVal === '夜勤' || prevVal === '明け';
}

/**
 * NSO_propagateConstraints
 * d 日に staffId を夜勤配置確定した後に呼ぶ。
 * C3 の逆方向・順方向を feasible に反映する。
 *
 * 順方向（C3 forward）:
 *   d に夜勤が入ると d+1 は明け確定 → 同スタッフは d+1 に夜勤配置不可
 *   → feasible[staffId][d+1] = false
 *
 * 逆方向（C3 backward）:
 *   d に夜勤が入ると d-1 への後からの夜勤配置も不可（前日夜勤になる）
 *   → feasible[staffId][d-1] = false
 *   （困難日優先で d-1 が後から処理される場合に備える）
 *
 * 他スタッフへの影響: minStaff["夜勤"]=1 の部署では他スタッフに影響しない。
 * minStaff >= 2 の部署への拡張は将来課題。
 *
 * @param {string} staffId
 * @param {number} d              配置確定日
 * @param {Object} feasible       feasible[staffId][d] を更新する
 * @param {number} days           月の日数
 */

function NSO_propagateConstraints(staffId, d, feasible, days) {
  if (d + 1 <= days) feasible[staffId][d + 1] = false; // C3 forward（翌日明け確定）
  if (d + 2 <= days) feasible[staffId][d + 2] = false; // C3 forward+1（明けの翌日も夜勤不可）
  if (d - 1 >= 1)   feasible[staffId][d - 1] = false; // C3 backward（前日夜勤になれない）
  if (d - 2 >= 1)   feasible[staffId][d - 2] = false; // C3 backward-1（d-2=夜勤→d-1=明け→d=夜勤 防止）
}

/**
 * NSO_computeCost
 * 現在の assignment のコストを計算する。
 * hill-climbing の採否判定に使用（小さいほど良い）。
 *
 * Cost = CountEquity × 100 + HalfBalance × 50 + IntervalEquity × 10
 *
 * CountEquity:    Σ_s (actual[s] - targetCount[s])²
 * HalfBalance:    Σ_s (|actualFirst[s] - targetFirst[s]| + |actualSecond[s] - targetSecond[s]|)
 * IntervalEquity: Σ_s Var(夜勤間隔[s])
 *
 * @param {Object} assignment   Map<staffId, Set<day>>
 * @param {Object} targetCount  Map<staffId, number>
 * @param {Object} targetFirst  Map<staffId, number> 前半目標
 * @param {Object} targetSecond Map<staffId, number> 後半目標
 * @param {Array}  nightPool    スタッフ配列
 * @param {number} halfMid      前後半境界日（Math.floor(days/2)）
 * @returns {number} コスト値（小さいほど良い）
 */

function NSO_computeCost(assignment, targetCount, targetFirst, targetSecond, nightPool, halfMid) {
  let countCost = 0, halfCost = 0, intervalCost = 0;
  for (const s of nightPool) {
    const nights = [...assignment[s.id]].sort((a, b) => a - b);
    const actual       = nights.length;
    const actualFirst  = nights.filter(d => d <= halfMid).length;
    const actualSecond = actual - actualFirst;

    countCost += (actual - targetCount[s.id]) ** 2;
    halfCost  += Math.abs(actualFirst  - targetFirst[s.id])
               + Math.abs(actualSecond - targetSecond[s.id]);

    if (nights.length >= 2) {
      const intervals = [];
      for (let i = 1; i < nights.length; i++) intervals.push(nights[i] - nights[i - 1]);
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / intervals.length;
      intervalCost += variance;
    }
  }
  return countCost * 100 + halfCost * 50 + intervalCost * 10;
}

/**
 * NSO_canSwap
 * s1 の夜勤日 d1 と s2 の夜勤日 d2 を入れ替えたとき、全制約をクリアするか確認する。
 * hill-climbing で使用。アンカー配置日（lockedDays に含まれる日）は呼び出し前に除外すること。
 *
 * チェック内容:
 *   A. s1 が d2 に配置できるか（d1 を仮想的に外した assignment で確認）
 *      - NSO_canAssignInitial(s1, d2, ...) → 静的制約 C1/C2/C4/C5
 *      - NSO_checkC3(s1, d2, assignWithoutD1, ...) → C3 動的チェック
 *   B. s2 が d1 に配置できるか（d2 を仮想的に外した assignment で確認）
 *      - NSO_canAssignInitial(s2, d1, ...) → 静的制約 C1/C2/C4/C5
 *      - NSO_checkC3(s2, d1, assignWithoutD2, ...) → C3 動的チェック
 *   C. d1 === d2 または s1.id === s2.id → swap 無意味 → false
 *
 * @returns {boolean} true = swap 可能
 */

function NSO_canSwap(s1, s2, d1, d2, assignment, lockedDays, res, deptWork, days, prevShiftFn) {
  if (d1 === d2) return false;
  if (s1.id === s2.id) return false;

  // A: s1 が d2 に入れられるか（s1 の d1 を外した仮想状態で確認）
  const a1without = new Set(assignment[s1.id]);
  a1without.delete(d1);
  if (!NSO_canAssignInitial(s1, d2, lockedDays, res, deptWork, days)) return false;
  if (NSO_checkC3(s1, d2, a1without, res, lockedDays, prevShiftFn)) return false;

  // B: s2 が d1 に入れられるか（s2 の d2 を外した仮想状態で確認）
  const a2without = new Set(assignment[s2.id]);
  a2without.delete(d2);
  if (!NSO_canAssignInitial(s2, d1, lockedDays, res, deptWork, days)) return false;
  if (NSO_checkC3(s2, d1, a2without, res, lockedDays, prevShiftFn)) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────


function autoGenerate(staffList, dept, year, month, prevShifts, shiftTrend = {}, prevTail = {}) {
  const days = getDays(year, month);
  const mk = monthKey(year, month);
  const maxConsec = dept.maxConsecutive || 5;
  const deptWork = buildDeptWorkTypes(dept.customShiftDefs);
  const deptRest = buildDeptRestTypes(dept.customShiftDefs);
  const maxStaff = {};
  [...new Set(dept.shiftTypes)].forEach(k => { const cd=(dept.customShiftDefs||[]).find(d=>d.key===k);const base=cd?.baseType||k;const def=base==="日勤"?99:1;const saved=dept.maxStaff?.[k];maxStaff[k]=(saved!=null&&!(cd&&base==="日勤"&&saved===1))?saved:def; });

  // ══════════════════════════════════════════════════════════════════════════════
  // ★role-slot 正式概念定義（介護型エンジン核心）
  //
  // 介護現場では「早番・遅番・夜勤」は coverage 人数ではなく「役割席（role-slot）」。
  //   早番 1人 = 「開け担当」という席  ←→  日勤 は柔軟調整枠（buffer shift）
  //
  // 責務分離:
  //   maxStaff        = 人数制御（何人まで配置してよいか）
  //   slotManagedTypes = role-slot 制御（Tier1絶対制約の対象シフト一覧）
  //
  // 選定基準:
  //   ① baseType が「日勤」のシフトは buffer → slot管理外
  //   ② 「明け」は夜勤連鎖で自動管理 → slot管理外
  //   ③ 上記以外で maxStaff<99（人数制限あり）のシフト = role-slot
  //      ※ 将来「日勤 max=2」に設定しても ① で除外されるため誤判定しない
  // ══════════════════════════════════════════════════════════════════════════════
  const slotManagedTypes = buildSlotManagedTypes(dept, maxStaff); // Step3: グローバル昇格
  const _isSlotManaged = (shiftKey) => isSlotManaged(shiftKey, slotManagedTypes); // Step6: グローバル昇格
  const _shouldProtectSlot = (shiftKey, count) => shouldProtectSlot(shiftKey, count, slotManagedTypes, maxStaff); // Step6: グローバル昇格

  // ══════════════════════════════════════════════════════════════════════════════
  // ★介護型エンジン 制約階層（Constraint Priority）正式定義
  //
  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ Tier1 — 絶対制約（repair フェーズから削減・変更禁止）                      │
  // │                                                                         │
  // │  A. role-slot（役割席）                                                  │
  // │     early shift（早番）= 「開け担当」席                                   │
  // │     late  shift（遅番）= 「閉め担当」席                                   │
  // │     night shift（夜勤）= 「夜間担当」席（+ 明け連鎖）                      │
  // │     → coverage 人数ではなく「役割席」。0人は施設崩壊。                     │
  // │     → _shouldProtectSlot() が全 repair 経路の単一ガード。                  │
  // │                                                                         │
  // │  B. 希望休（希望ロック）                                                  │
  // │     スタッフが申請した公休希望日。生成エンジンは絶対尊重。                   │
  // │                                                                         │
  // │  C. 有休（有給休暇）                                                      │
  // │     法的権利。上書き・削除禁止。                                           │
  // │                                                                         │
  // │  D. 夜勤明け                                                              │
  // │     夜勤翌日の「明け」は夜勤連鎖として固定。健康管理上削除禁止。            │
  // │                                                                         │
  // └─────────────────────────────────────────────────────────────────────────┘
  //
  // ┌─────────────────────────────────────────────────────────────────────────┐
  // │ Tier2 — ソフト制約（repair フェーズが調整してよい範囲）                    │
  // │                                                                         │
  // │  a. 公休公平性（kyukoDays 目標）                                          │
  // │     スタッフの休み日数を目標に近づける。                                   │
  // │     → Tier1 を壊してまで達成してはいけない。                               │
  // │                                                                         │
  // │  b. 連続勤務制限（maxConsecutive）                                        │
  // │     5連続勤務超過を解消。                                                  │
  // │     → Tier1 slot を「休み」に変換して解消してはいけない。                  │
  // │                                                                         │
  // │  c. 比率最適化（shiftRatio / ratio修復）                                  │
  // │     スタッフの日勤/早番/遅番比率を目標に近づける。                          │
  // │     → Tier1 slot を削減して ratio を達成してはいけない。                   │
  // │                                                                         │
  // │  d. trend最適化（localSearchImprove / scoreShifts）                      │
  // │     過去実績 trend に沿った swap 改善。                                    │
  // │     → swap は人数保存のため Tier1 への影響なし。                           │
  // │                                                                         │
  // │  e. 最低配置補完（minStaff 保証）                                          │
  // │     日勤など非 slot シフトの最低人数補完。                                  │
  // │     → Tier1 slot を slide 元にしてはいけない。                             │
  // │                                                                         │
  // └─────────────────────────────────────────────────────────────────────────┘
  //
  // repair フェーズ 責務一覧:
  // ┌──────────────────────┬────────────┬───────────────┬───────────────────────┐
  // │ フェーズ              │ Tier1変更  │ shouldProtect │ 備考                  │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ enforceMaxStaff      │ △ 超過時のみ│ 不使用（超過が│ 超過(count>max)なら削減│
  // │                      │            │ 条件→逆方向） │ 許可。これが唯一の例外。│
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ Pass C（連続勤務修正）│ ✗ 禁止     │ ✅ 使用済み   │ L1347                 │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ 公休 shortage 補正   │ ✗ 禁止     │ ✅ 使用済み   │ L1403                 │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ 遷移 repair          │ ✗ 禁止     │ ✅ 使用済み   │ L1449（休み→日勤代替） │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ minStaff 保証 slide  │ ✗ 禁止     │ ✅ 使用済み   │ L1487（スライド元除外）│
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ ratio 修復           │ ✗ 禁止     │ ✅ 使用済み   │ L1670（削減禁止）      │
  // ├──────────────────────┼────────────┼───────────────┼───────────────────────┤
  // │ localSearchImprove   │ ✗ 不可能   │ 不要          │ swap=人数保存、違反生成│
  // │                      │            │               │ 不可能（構造保証）      │
  // └──────────────────────┴────────────┴───────────────┴───────────────────────┘
  //
  // enforceMaxStaff の例外ルール:
  //   count > maxStaff[slot] → 超過（違反状態）→ 削減許可（Tier1 修正方向への削減）
  //   count ≤ maxStaff[slot] → 正常状態       → _shouldProtectSlot が削減を禁止
  //
  // 新 repair フェーズを追加するときのルール:
  //   res[s.id][d] を「休み」や別シフトへ変換する前に必ず:
  //     if (_shouldProtectSlot(res[s.id][d], <その日のcount>)) continue;
  //   を挿入すること。
  // ══════════════════════════════════════════════════════════════════════════════

  const PRIORITY = { 早番:1, 遅番:1, 日勤:2 };
  (dept.customShiftDefs||[]).forEach(cd => { if (cd.key && PRIORITY[cd.key]==null) PRIORITY[cd.key] = PRIORITY[cd.baseType]??2; });

  const getTrend = (s) => {
    if (!shiftTrend || Object.keys(shiftTrend).length === 0) return null;
    const key = Object.keys(shiftTrend).filter(k => k !== '_months').find(k => nameMatch(k, s.name));
    return key ? shiftTrend[key] : null;
  };

  const pickWithTrend = (s, available, cnts) => {
    const trend = getTrend(s);
    return [...available].sort((a, b) => {
      // 1. 設定優先: 最低配置の不足分を先に埋める
      const dA = Math.max(0, (dept.minStaff[a]||0) - cnts[a]);
      const dB = Math.max(0, (dept.minStaff[b]||0) - cnts[b]);
      if (dA !== dB) return dB - dA;
      // 2. シフト種別の優先度
      const pA = PRIORITY[a]??3, pB = PRIORITY[b]??3;
      if (pA !== pB) return pA - pB;
      // 3. 配置バランス（少ない方を優先）
      if (cnts[a] !== cnts[b]) return cnts[a] - cnts[b];
      // 4. 学習データ（最後の補助）
      const tA = trend ? (trend[a] || 0) : 0;
      const tB = trend ? (trend[b] || 0) : 0;
      if (Math.abs(tA - tB) > 0.05) return tB - tA;
      // 5. 同点時はランダムで毎回異なる結果に
      return Math.random() - 0.5;
    })[0];
  };

  const res = {};
  const ds = staffList.filter(s => s.dept === dept.id);
  ds.forEach(s => { res[s.id] = {}; });

  const prevMonthYear = month === 0 ? year - 1 : year;
  const prevMonthIdx  = month === 0 ? 11 : month - 1;
  const prevDays = getDays(prevMonthYear, prevMonthIdx);
  const prevShift = (id) => prevTail[id]?.[prevDays] ?? null;


  const _consecWork = (id, d) => consecWork(id, d, res, deptWork, prevTail, prevDays); // Step8: グローバル昇格
  const _consecRest = (id, d) => consecRest(id, d, res, deptRest); // Step8: グローバル昇格
  const _consecRestFwd = (id, d) => consecRestFwd(id, d, res, deptRest, days); // Step8: グローバル昇格
  // ★[Fix-NightSeq] 夜勤系 shift set: baseType=夜勤 の全 shift key（明け前日バリデーション用）
  const _agNightSet = buildNightSet(dept); // Step2: グローバル昇格
  const _isBadTransition = (prev, curr) => isBadTransition(prev, curr, dept, _agNightSet); // Step5: グローバル昇格
  const _canRest = (id, d) => canRest(id, d, res, deptRest, days); // Step9: グローバル昇格

  // ★ステップ1: 希望休・希望勤務を最初にセット（最優先・絶対変更しない）
  ds.forEach(s => {
    // prevShiftsから有休のみ引き継ぎ（希望休はprevShiftsから引き継がない＝手動入力の希望休は再生成で消える）
    Object.entries(prevShifts[s.id] || {}).forEach(([d, v]) => {
      if (v === "有休") res[s.id][Number(d)] = v;
    });
    // kiboByMonthの希望休 → 希望休として設定（スタッフがポータルで申請したもの）
    (s.kiboByMonth?.[mk] || []).forEach(d => {
      res[s.id][Number(d)] = "希望休";
    });
    // yukyuByMonthの有休（希望休より優先度は同等・後勝ち）
    (s.yukyuByMonth?.[mk] || []).forEach(d => {
      res[s.id][Number(d)] = "有休";
    });
    // shiftRequestsByMonthの希望勤務（早番・日勤・遅番・夜勤指定）
    // roleShiftTypes 外の勤務シフトは配置しない（休み系・明けはそのまま通す）
    Object.entries(s.shiftRequestsByMonth?.[mk] || {}).forEach(([day, shiftKey]) => {
      const isRest = !deptWork.has(shiftKey) || shiftKey === '明け';
      if (!isRest) {
        const ra = dept.roleShiftTypes?.[s.role];
        if (ra && !ra.includes(shiftKey)) return;
      }
      res[s.id][Number(day)] = shiftKey;
    });
  });

  // 希望休・希望勤務が入っている日をロック（夜勤配置で絶対に上書きしない）
  const lockedDays = {};
  ds.forEach(s => { lockedDays[s.id] = new Set(Object.keys(res[s.id]).map(Number)); });

  // 前月末夜勤/明けの当月繰り越し（res への負数格納なし・正キーのみ）
  ds.forEach(s => {
    const ps = prevShift(s.id);
    if (ps === '夜勤') {
      if (!lockedDays[s.id].has(1)) { res[s.id][1] = '明け'; lockedDays[s.id].add(1); }
      if (days >= 2 && !lockedDays[s.id].has(2)) { res[s.id][2] = '休み'; lockedDays[s.id].add(2); }
    } else if (ps === '明け') {
      if (!lockedDays[s.id].has(1)) { res[s.id][1] = '休み'; lockedDays[s.id].add(1); }
    }
  });

  // 勤務指定の夜勤・明けに連鎖して翌日を自動セット
  ds.forEach(s => {
    for (let d = 1; d <= days; d++) {
      if (res[s.id][d] === "夜勤") {
        if (d + 1 <= days && !lockedDays[s.id].has(d + 1)) {
          res[s.id][d + 1] = "明け";
          lockedDays[s.id].add(d + 1);
        }
        if (d + 2 <= days && !lockedDays[s.id].has(d + 2)) {
          res[s.id][d + 2] = "休み";
          lockedDays[s.id].add(d + 2);
        }
      } else if (res[s.id][d] === "明け") {
        if (d + 1 <= days && !lockedDays[s.id].has(d + 1)) {
          res[s.id][d + 1] = "休み";
          lockedDays[s.id].add(d + 1);
        }
      }
    }
  });

  // ★ステップ1.5: 希望休アンカー配置
  // 希望休D がある夜勤対応スタッフに対し、D-2=夜勤・D-1=明け を先行仮置きする。
  // これにより「希望休はパズルのノイズ」でなく「配置を確定させるヒント」として機能する。
  // 役職制限チェック用: dayTypes の先行計算（夜勤配置は getAllowedTypes より前に実行されるため）
  const _nonNightTypes = dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け');
  const _nightAllowed = (s) => {
    const rst = dept.roleShiftTypes?.[s.role];
    if (!rst) return true; // 制限なし
    return rst.length >= _nonNightTypes.length; // 全非夜勤シフトが許可 = 夜勤も可
  };

  if (dept.shiftTypes.includes("夜勤")) {
    const anchorPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const anchorAutoMax = Math.ceil(days / Math.max(anchorPool.length, 1));
    const _anchorHalfMid = Math.floor(days / 2); // ★Step3: 前後半境界

    // ★Phase5 Step3: 前後半均等アンカー配置
    // 全候補を前後半キューに分類し、交互に選択することで
    // アンカーが前半・後半に偏らないよう制御する。
    // kiboNightPreference はキュー内での優先順位として維持。
    const _anchorCands = [];
    for (const s of anchorPool) {
      const kibodays = (s.kiboByMonth?.[mk] || []).map(Number).sort((a, b) => a - b);
      for (const D of kibodays) {
        const nightDay = D - 2, meakeDay = D - 1;
        if (nightDay < 1) continue;
        if (s.nightExcludeDays?.has(nightDay)) continue;
        if (["夜勤", "明け"].includes(nightDay === 1 ? prevShift(s.id) : res[s.id][nightDay - 1])) continue;
        _anchorCands.push({ s, nightDay, meakeDay,
          isFirstHalf: nightDay <= _anchorHalfMid,
          pref: s.kiboNightPreference || 0 });
      }
    }
    // 前後半それぞれ kiboNightPreference 降順・同率は夜勤日昇順でソート
    const _frontQ = _anchorCands.filter(c =>  c.isFirstHalf).sort((a, b) => (b.pref - a.pref) || (a.nightDay - b.nightDay));
    const _backQ  = _anchorCands.filter(c => !c.isFirstHalf).sort((a, b) => (b.pref - a.pref) || (a.nightDay - b.nightDay));
    // 交互マージ: 処理済み数の少ない半から優先して選択（F,B,F,B,...）
    const _anchorOrdered = [];
    let _fi = 0, _bi = 0;
    while (_fi < _frontQ.length || _bi < _backQ.length) {
      if (_fi < _frontQ.length && (_bi >= _backQ.length || _fi <= _bi)) {
        _anchorOrdered.push(_frontQ[_fi++]);
      } else {
        _anchorOrdered.push(_backQ[_bi++]);
      }
    }
    // 配置（制約を配置時に再チェック）
    for (const { s, nightDay, meakeDay } of _anchorOrdered) {
      if (lockedDays[s.id].has(nightDay) || lockedDays[s.id].has(meakeDay)) continue;
      if (["夜勤", "明け"].includes(nightDay === 1 ? prevShift(s.id) : res[s.id][nightDay - 1])) continue;
      const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
      if (usedNight >= Math.max(s.nightMax || 5, anchorAutoMax)) continue;
      const dayNightCount = ds.filter(sx => res[sx.id][nightDay] === "夜勤").length;
      if (dayNightCount >= (maxStaff["夜勤"] ?? 1)) continue;
      res[s.id][nightDay] = "夜勤";
      res[s.id][meakeDay] = "明け";
      lockedDays[s.id].add(nightDay);
      lockedDays[s.id].add(meakeDay);
    }
  }

  // ★ステップ2: 夜勤配置（Phase5 Step2 v3: 優先順位型比較関数）
  // ① 夜勤回数（主キー）: 累積回数少ない順
  // ② 前半/後半カウント（副キー）: 当日の半月内での夜勤数少ない順
  // ③ 夜勤間隔（三次キー）: 前回夜勤からの間隔長い順
  // posBonus / idealInterval / targetCount を廃止。_lastNightDay は間隔比較のみに使用。
  if (dept.shiftTypes.includes("夜勤")) {
    const nightPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    const autoMax = Math.ceil(days / Math.max(nightPool.length, 1));

    // 間隔トラッキング（アンカー配置済み夜勤日を初期値に設定）
    const _lastNightDay = {};
    nightPool.forEach(s => {
      const nightDays = Object.entries(res[s.id])
        .filter(([, v]) => v === '夜勤').map(([d]) => Number(d));
      _lastNightDay[s.id] = nightDays.length ? Math.max(...nightDays) : 0;
    });

    // 比較関数（評価スコアを使わない純粋な優先順位型）
    const _nightCandSort = (a, b, d) => {
      // ① 夜勤回数: 少ない順（count equity を絶対優先）
      const cntA = Object.values(res[a.id]).filter(v => v === '夜勤').length;
      const cntB = Object.values(res[b.id]).filter(v => v === '夜勤').length;
      if (cntA !== cntB) return cntA - cntB;
      // ② 前半/後半カウント: 当日の半月内夜勤数少ない順
      const half = d <= Math.floor(days / 2);
      const halfCnt = s => Object.entries(res[s.id])
        .filter(([dd, v]) => (half ? Number(dd) <= Math.floor(days / 2) : Number(dd) > Math.floor(days / 2)) && v === '夜勤').length;
      const hA = halfCnt(a), hB = halfCnt(b);
      if (hA !== hB) return hA - hB;
      // ③ 夜勤間隔: 前回夜勤からの間隔長い順（待機期間が長いスタッフを優先）
      return (_lastNightDay[b.id] || 0) - (_lastNightDay[a.id] || 0); // 小さいほど古い → 優先
    };

    for (let d = 1; d <= days; d++) {
      const already = ds.filter(s => res[s.id][d] === "夜勤").length;
      let need = (dept.minStaff["夜勤"] || 0) - already;
      if (need <= 0) continue;
      const canNight = (s) => {
        if (s.nightExcludeDays?.has(d)) return false; // クロスフロア夜勤制約
        if (lockedDays[s.id].has(d)) return false; // その日がロック済み
        if (["夜勤","明け"].includes(d === 1 ? prevShift(s.id) : res[s.id][d - 1])) return false;
        if (d + 1 <= days && lockedDays[s.id].has(d + 1) && res[s.id][d+1] !== "明け") return false; // 翌日がロック済み（明けを入れられない）
        if (d + 2 <= days && lockedDays[s.id].has(d + 2) && deptWork.has(res[s.id][d + 2])) return false; // 夜勤→明け→固定勤務（夜勤含む）になるのを防ぐ
        return true;
      };
      let cands = nightPool.filter(s => {
        if (!canNight(s)) return false;
        const usedNight = Object.values(res[s.id]).filter(v => v === "夜勤").length;
        return usedNight < Math.max(s.nightMax || 5, autoMax);
      }).sort((a, b) => _nightCandSort(a, b, d));
      if (cands.length === 0) {
        cands = nightPool.filter(s => canNight(s))
          .sort((a, b) => _nightCandSort(a, b, d));
      }
      // G-1/NG-2: スロット単位動的判定（配置ごとに夜勤状況を再評価）
      const _isLowNR = (s) => {
        const fy = s.facilityYears, fl = s.floorYears;
        return fy != null && fl != null && (fy < 0.5 || fl < 0.2);
      };
      let _cands = [...cands];
      while (need > 0 && _cands.length > 0) {
        // NG-2: その日に low-NR が既に夜勤中なら low-NR 候補を除外（low+low 禁止）
        if (ds.some(s => _isLowNR(s) && res[s.id][d] === '夜勤')) {
          _cands = _cands.filter(s => !_isLowNR(s));
          if (_cands.length === 0) break; // shortage を許容
        }
        // G-1: 外国人夜勤者がいてサポーター未配置なら非外国人を優先ソート
        const _foreignOnNight = ds.some(s => s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        const _supporterOnNight = ds.some(s => !s.foreignNightSupportRequired && res[s.id][d] === '夜勤');
        if (_foreignOnNight && !_supporterOnNight) {
          _cands.sort((a, b) => {
            const aF = a.foreignNightSupportRequired ? 1 : 0;
            const bF = b.foreignNightSupportRequired ? 1 : 0;
            if (aF !== bF) return aF - bF;
            return _nightCandSort(a, b, d); // G-1再ソートも優先順位型
          });
        }
        const s = _cands.shift();
        res[s.id][d] = "夜勤";
        if (d + 1 <= days) res[s.id][d + 1] = "明け";
        if (d + 2 <= days && !res[s.id][d + 2]) res[s.id][d + 2] = "休み";
        _lastNightDay[s.id] = d; // Phase5 Step2: 間隔トラッキング更新
        need--;
      }
    }
  }

  // ★ Phase5 Step4-B: Night Slot Optimizer データ構築（配置は行わない）
  // 既存 Step2 は上記で完了済み。ここでは NSO が必要とするデータ構造を生成・検証する。
  // autoGenerate の戻り値・res[] には一切影響しない。
  if (dept.shiftTypes.includes("夜勤")) {
    const _nsoPool = ds.filter(s => s.nightOk && _nightAllowed(s));
    if (_nsoPool.length > 0) {
      const _nsoM      = dept.minStaff["夜勤"] || 0;
      const _nsoHalf   = Math.floor(days / 2);
      const _nsoAutoMax = Math.ceil(days / _nsoPool.length);

      // ── STEP 0: アンカー配置済み夜勤を assignment に取り込む ──────────────
      // lockedDays.has(d) かつ res[s.id][d]==="夜勤" → Step1.5 のアンカー配置分
      const _nsoAssignment = {};
      _nsoPool.forEach(s => {
        const anchorNights = Object.entries(res[s.id])
          .filter(([d, v]) => v === '夜勤' && lockedDays[s.id].has(Number(d)))
          .map(([d]) => Number(d));
        _nsoAssignment[s.id] = new Set(anchorNights);
      });

      // ── STEP 1: 静的 feasible マトリクス構築（C3 を除く）─────────────────
      // NSO_canAssignInitial は C1/C2/C4/C5 のみ評価（C3 は NSO_checkC3 で動的評価）
      const _nsoFeasible = {};
      _nsoPool.forEach(s => {
        _nsoFeasible[s.id] = {};
        for (let d = 1; d <= days; d++) {
          _nsoFeasible[s.id][d] = NSO_canAssignInitial(s, d, lockedDays, res, deptWork, days);
        }
      });
      // アンカー配置済み日の feasible を false に設定し、隣接日に C3 を伝播
      _nsoPool.forEach(s => {
        for (const d of _nsoAssignment[s.id]) {
          _nsoFeasible[s.id][d] = false;
          NSO_propagateConstraints(s.id, d, _nsoFeasible, days);
        }
      });

      // ── STEP 2: 目標回数計算（アンカー分を差し引いた残余スロット）──────────
      const _nsoTotalSlots    = days * _nsoM;
      const _nsoAnchorTotal   = _nsoPool.reduce((acc, s) => acc + _nsoAssignment[s.id].size, 0);
      const _nsoRemaining     = _nsoTotalSlots - _nsoAnchorTotal;
      const _nsoBase          = Math.floor(_nsoRemaining / _nsoPool.length);
      const _nsoExtra         = _nsoRemaining % _nsoPool.length;
      const _nsoTargetCount   = {};
      const _nsoTargetFirst   = {};
      const _nsoTargetSecond  = {};
      _nsoPool.forEach((s, i) => {
        const anchorFirst  = [..._nsoAssignment[s.id]].filter(d => d <= _nsoHalf).length;
        const anchorSecond = _nsoAssignment[s.id].size - anchorFirst;
        const remainTarget = _nsoBase + (i < _nsoExtra ? 1 : 0);
        const remainFirst  = Math.ceil(remainTarget / 2);
        const remainSecond = remainTarget - remainFirst;
        _nsoTargetCount[s.id]  = _nsoAssignment[s.id].size + remainTarget;
        _nsoTargetFirst[s.id]  = anchorFirst  + remainFirst;
        _nsoTargetSecond[s.id] = anchorSecond + remainSecond;
      });

      // ── STEP 3: NightSlot生成・difficultyScore算出・dayOrder生成 ──────────
      // NightSlot: 各日（d）の夜勤スロット情報
      // feasible 数（C3除く静的制約のみ）で difficulty を定義
      const _nsoSlots = [];
      const _nsoDayAssigned = {};
      _nsoPool.forEach(s => {
        for (const d of _nsoAssignment[s.id]) {
          _nsoDayAssigned[d] = (_nsoDayAssigned[d] || 0) + 1;
        }
      });
      for (let d = 1; d <= days; d++) {
        const alreadyCount = _nsoDayAssigned[d] || 0;
        const need = _nsoM - alreadyCount;
        // feasible 候補数（静的。C3の動的変化は difficulty の近似として無視）
        const feasibleCount = _nsoPool.filter(s => _nsoFeasible[s.id][d]).length;
        _nsoSlots.push({
          day:           d,
          need,                          // まだ埋める必要があるスロット数
          alreadyCount,                  // アンカーで配置済み夜勤数
          feasibleCount,                 // 静的 feasible 候補数（C3近似）
          difficultyScore: feasibleCount, // 小さいほど困難（dayOrder ソートに使用）
          isFirst: d <= _nsoHalf,
        });
      }
      // dayOrder: difficultyScore 昇順（困難日優先）、同率は日付昇順
      const _nsoDayOrder = _nsoSlots
        .filter(sl => sl.need > 0)
        .sort((a, b) => a.difficultyScore - b.difficultyScore || a.day - b.day)
        .map(sl => sl.day);

      // ── Candidate一覧生成（各スロット×スタッフの全組み合わせ）─────────────
      // Phase4-C の配置ループ検証用。ここでは生成のみ行い配置はしない。
      const _nsoCandidates = [];
      for (const d of _nsoDayOrder.slice(0, 3)) { // ログ量削減のため先頭3日分のみ収集
        for (const s of _nsoPool) {
          if (!_nsoFeasible[s.id][d]) continue;
          if (NSO_checkC3(s, d, _nsoAssignment[s.id], res, lockedDays, prevShift)) continue;
          if (_nsoAssignment[s.id].size >= Math.max(s.nightMax || 5, _nsoAutoMax)) continue;
          _nsoCandidates.push({ staffId: s.id, day: d,
            targetRem: _nsoTargetCount[s.id] - _nsoAssignment[s.id].size });
        }
      }

      // ── STEP 4: difficulty-first 配置ループ（Phase4-C）─────────────────────
      // _nsoAssignment のみ更新。res[] / lockedDays は絶対に変更しない。
      // 既存 Step2 の結果とは独立した「NSO 比較用配置」として保持する。
      let _nsoPropagateCount = 0;   // propagateConstraints 実行回数（統計用）
      let _nsoCandSelectCount = 0;  // Candidate 選択回数（統計用）
      let _nsoC3ViolCount = 0;      // C3 違反で除外されたケース数（統計用）
      let _nsoShortageCount = 0;    // 充足できなかったスロット数（shortage）

      // _nsoDayAssigned を配置進行に合わせて更新するためコピーして使用
      const _nsoDayCount = { ..._nsoDayAssigned }; // アンカー分の初期値込み

      for (const d of _nsoDayOrder) {
        const alreadyCount = _nsoDayCount[d] || 0;
        const need = _nsoM - alreadyCount;
        if (need <= 0) continue;

        const isFirst = d <= _nsoHalf;

        // ── 候補者フィルタ（3段階）────────────────────────────────────────
        // 段階1: 静的 feasible + C3 動的チェック + targetCount 上限（autoMax）
        const _nsoPassCands = [];
        let _c3ViolThisDay = 0;
        for (const s of _nsoPool) {
          if (!_nsoFeasible[s.id][d]) continue;                          // 静的制約
          if (NSO_checkC3(s, d, _nsoAssignment[s.id], res, lockedDays, prevShift)) {
            _c3ViolThisDay++;
            continue;                                                      // C3 動的
          }
          if (_nsoAssignment[s.id].size >= Math.max(s.nightMax || 5, _nsoAutoMax)) continue; // C6
          _nsoPassCands.push(s);
        }
        _nsoC3ViolCount += _c3ViolThisDay;

        // 段階2: フォールバック（autoMax 上限なし）
        let _nsoCands = _nsoPassCands;
        if (_nsoCands.length < need) {
          const fallback = [];
          for (const s of _nsoPool) {
            if (!_nsoFeasible[s.id][d]) continue;
            if (NSO_checkC3(s, d, _nsoAssignment[s.id], res, lockedDays, prevShift)) continue;
            fallback.push(s);
          }
          if (fallback.length > 0) _nsoCands = fallback;
        }

        if (_nsoCands.length === 0) {
          _nsoShortageCount += need;
          continue;
        }

        // ── スコアリング: ① targetCount残り降順 → ② 前後半バランス → ③ 最終夜勤日昇順
        _nsoCands = [..._nsoCands].sort((a, b) => {
          // ① 残り目標回数が多いスタッフを優先（count equity）
          const remA = _nsoTargetCount[a.id] - _nsoAssignment[a.id].size;
          const remB = _nsoTargetCount[b.id] - _nsoAssignment[b.id].size;
          if (remA !== remB) return remB - remA;

          // ② 前後半バランス: 当該半月の残り目標が多いスタッフを優先
          const halfRemA = isFirst
            ? _nsoTargetFirst[a.id]  - [..._nsoAssignment[a.id]].filter(dd => dd <= _nsoHalf).length
            : _nsoTargetSecond[a.id] - [..._nsoAssignment[a.id]].filter(dd => dd > _nsoHalf).length;
          const halfRemB = isFirst
            ? _nsoTargetFirst[b.id]  - [..._nsoAssignment[b.id]].filter(dd => dd <= _nsoHalf).length
            : _nsoTargetSecond[b.id] - [..._nsoAssignment[b.id]].filter(dd => dd > _nsoHalf).length;
          if (halfRemA !== halfRemB) return halfRemB - halfRemA;

          // ③ 最終夜勤日が古い（間隔が長い）スタッフを優先
          const lastA = _nsoAssignment[a.id].size ? Math.max(..._nsoAssignment[a.id]) : 0;
          const lastB = _nsoAssignment[b.id].size ? Math.max(..._nsoAssignment[b.id]) : 0;
          return lastA - lastB;
        });

        // ── 上位 need 名を選択・assignment 更新 ────────────────────────────
        const selected = _nsoCands.slice(0, need);
        for (const s of selected) {
          _nsoAssignment[s.id].add(d);
          _nsoDayCount[d] = (_nsoDayCount[d] || 0) + 1;
          _nsoFeasible[s.id][d] = false;                         // 自分自身は配置済み
          NSO_propagateConstraints(s.id, d, _nsoFeasible, days); // C3 伝播
          _nsoPropagateCount++;
          _nsoCandSelectCount++;
        }

        // shortage 判定（need 未達の場合）
        const actualSelected = Math.min(selected.length, need);
        if (actualSelected < need) _nsoShortageCount += (need - actualSelected);
      }

      // ── NSO_result 生成（比較用データ）─────────────────────────────────
      // res[] / lockedDays には一切書き込まない。参照のみ。
      const _nsoResult = {};
      _nsoPool.forEach(s => { _nsoResult[s.id] = [..._nsoAssignment[s.id]].sort((a, b) => a - b); });

      // ── NSO_stats 生成（充足率・KPI）────────────────────────────────────
      const _nsoTotalNeed = _nsoDayOrder.length * _nsoM;
      const _nsoTotalPlaced = _nsoPool.reduce((acc, s) => acc + _nsoAssignment[s.id].size, 0);
      const _nsoFulfillRate = _nsoTotalNeed > 0
        ? ((_nsoTotalNeed - _nsoShortageCount) / _nsoTotalNeed * 100).toFixed(1)
        : '100.0';

      // カウント均等性（σ）
      const _nsoCounts   = _nsoPool.map(s => _nsoAssignment[s.id].size);
      const _nsoCountMean = _nsoCounts.reduce((a, b) => a + b, 0) / _nsoCounts.length;
      const _nsoCountSigma = Math.sqrt(
        _nsoCounts.reduce((acc, c) => acc + (c - _nsoCountMean) ** 2, 0) / _nsoCounts.length
      );

      // 前半後半偏差
      const _nsoHalfDevs = _nsoPool.map(s => {
        const f = [..._nsoAssignment[s.id]].filter(d => d <= _nsoHalf).length;
        const b = _nsoAssignment[s.id].size - f;
        return Math.abs(f - b);
      });
      const _nsoHalfDevMean = _nsoHalfDevs.reduce((a, b) => a + b, 0) / _nsoHalfDevs.length;

      const _nsoFinalCost = NSO_computeCost(
        _nsoAssignment, _nsoTargetCount, _nsoTargetFirst, _nsoTargetSecond, _nsoPool, _nsoHalf);

      const _nsoStats = {
        pool:           _nsoPool.length,
        totalSlots:     _nsoTotalSlots,
        totalPlaced:    _nsoTotalPlaced,
        shortage:       _nsoShortageCount,
        fulfillRate:    _nsoFulfillRate + '%',
        countSigma:     _nsoCountSigma.toFixed(3),
        halfDevMean:    _nsoHalfDevMean.toFixed(3),
        finalCost:      _nsoFinalCost.toFixed(1),
        propagateCount: _nsoPropagateCount,
        candSelectCount:_nsoCandSelectCount,
        c3ViolCount:    _nsoC3ViolCount,
      };

    }
  }
  // ★ Phase5 Step4-B/C ここまで。res[] / lockedDays への変更なし。

  const dayTypes = [...new Set(dept.shiftTypes.filter(s => s !== "夜勤"))];
  const isCtd = isCustomTimeDept(dept);
  const getAllowedTypes = (s) => {
    const allowed = dept.roleShiftTypes?.[s.role];
    return allowed ? dayTypes.filter(k => allowed.includes(k)) : dayTypes;
  };

  // enforceMaxStaff ─ [Tier1例外: count>maxStaff の超過状態のみ削減許可]
  // 正常状態（count≤maxStaff）では発動しない → _shouldProtectSlot と逆条件で安全
  // ★enforceMaxStaff: maxStaff超過を強制修正（他シフトへ振替→無理なら休み）
  const enforceMaxStaff = () => {
    for (let d = 1; d <= days; d++) {
      for (const [shiftKey, limit] of Object.entries(maxStaff)) {
        const overStaff = ds.filter(s => res[s.id][d] === shiftKey);
        if (overStaff.length <= limit) continue;
        const toFix = [
          ...overStaff.filter(s => !lockedDays[s.id].has(d)),
          ...overStaff.filter(s =>  lockedDays[s.id].has(d)),
        ];
        let excess = overStaff.length - limit;
        // ★[Fix-NightSeq] 夜勤系列整合性: shiftKey が夜勤ベースか事前判定
        const _em_isNight = ((_agNightSet.has(shiftKey)) ||
          ((dept.customShiftDefs || []).find(c => c.key === shiftKey)?.baseType || shiftKey) === '夜勤');
        for (const s of toFix) {
          if (excess <= 0) break;
          // ★[Fix-NightSeq] 夜勤系列 atomic 保護:
          //   夜勤セルを変更しようとするとき、翌日=明け かつ 翌日がロック済み
          //   → 系列を壊せない → このスタッフは enforceMaxStaff でスキップ
          if (_em_isNight && d + 1 <= days && (res[s.id][d + 1] ?? '') === '明け'
              && lockedDays[s.id].has(d + 1)) {
            continue;
          }
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          const altShift = dayTypes.find(k => {
            if (k === shiftKey) return false;
            if (!getAllowedTypes(s).includes(k)) return false;
            if (_isBadTransition(prev, k)) return false;
            if (_isBadTransition(k, next)) return false;
            const cnt = ds.filter(sx => res[sx.id][d] === k).length;
            return cnt < (maxStaff[k] ?? 99);
          });
          res[s.id][d] = altShift || "休み";
          // ★[Fix-NightSeq] 夜勤系列カスケード:
          //   夜勤→明け の系列において夜勤を変更した → 翌日の明けも休みに変換
          //   （明け = 夜勤後状態。夜勤がなければ明けは存在できない）
          if (_em_isNight && d + 1 <= days && (res[s.id][d + 1] ?? '') === '明け'
              && !lockedDays[s.id].has(d + 1)) {
            res[s.id][d + 1] = '休み';
          }
          excess--;
        }
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 確率優先配置フェーズ（確率サンプリング主軸アーキテクチャ）
  //  Pass A: 休み日 → dowRestRate で確率的サンプリング（30試行に多様性）
  //  Pass B: 勤務日 → 全スタッフ統一処理（trend or deptAvg でサンプリング）
  //  Pass C: 連続勤務超過の修正
  //  以降の enforceMaxStaff / minStaff保証 で残違反を修正
  // ═══════════════════════════════════════════════════════════════════════════

  // 確率テーブル probs:{key->weight} から1件サンプリング（多様性確保）
  const sampleFromProbs = (probs) => {
    const entries = Object.entries(probs).filter(([, w]) => w > 0);
    if (!entries.length) return null;
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
    return entries[entries.length - 1][0];
  };

  // 配列 items から n件を確率 weights で非復元サンプリング
  const weightedSampleN = (items, weights, n) => {
    const pool = items.map((item, i) => ({ item, w: weights[i] ?? 1 }));
    const result = [];
    while (result.length < n && pool.length) {
      const total = pool.reduce((s, x) => s + x.w, 0);
      if (total <= 0) { result.push(...pool.slice(0, n - result.length).map(x => x.item)); break; }
      let r = Math.random() * total;
      const idx = pool.findIndex(x => { r -= x.w; return r <= 0; });
      const picked = idx >= 0 ? idx : pool.length - 1;
      result.push(pool[picked].item);
      pool.splice(picked, 1);
    }
    return result;
  };

  // 部署全体の平均シフト比率（trendなしスタッフの fallback）
  const deptAvgRatio = (() => {
    const all = ds.map(s => getTrend(s)).filter(Boolean);
    if (!all.length) return null;
    const avg = {};
    dayTypes.forEach(k => {
      const vals = all.map(t => typeof t[k] === 'number' ? t[k] : 0);
      avg[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    return avg;
  })();

  const getShiftRatioOf = (s) => s.shiftRatio || s.shiftRatioByMonth?.[mk] || null;
  const targetShiftCounts = {};
  const assignedShiftCounts = {};

  // ── DiagnosticEngine Phase4 Step2〜5: autoGenerate 収集変数 ────────────
  // Step4: passA
  const _pa_rows = [];
  // Step3: passB
  let _pb_snap = [], _pb_short = [], _pb_consec = { maxConsec, violatingStaffCount:0, totalViolationDays:0, maxStreak:0, rows:[] };
  // Step3: passC
  let _pc_nonSlotFixed = 0, _pc_tier2Absorbed = 0;
  const _pc_typeBreakdown = [], _pc_guards = [], _pc_tier2Changes = [], _pc_nonSlotChanges = [];
  let _pc_residualViolations = 0, _pc_residualSlotProtected = 0;
  let _pc_snap = [], _pc_short_arr = [];
  // Step2: restAdjustment
  const _ra_phases = {
    afterRestAdj:     { rows:[], shortage:[] },
    afterEnforceMax3: { rows:[], shortage:[] },
    afterRestRecovery:{ rows:[] },
    afterExcessVal:   { rows:[] },
  };

  if (dayTypes.length === 0) {
    ds.forEach(s => { for (let d = 1; d <= days; d++) { if (!res[s.id][d]) res[s.id][d] = "休み"; } });
  } else {

    // ── Pass A: 休み日を確率サンプリングで全スタッフに先行確定 ──────────────
    // Phase5 Step1 改善: 4点
    //   1. 日別在籍数ガード（dailyRestLimit）: 特定日への休み集中を防止
    //   2. 処理順ソート: 制約の強いスタッフ（夜勤多・希望休多）を先行処理
    //   3. Branch A 連続制約チェック: サンプリング後に maxConsec 超区間を修正
    //   4. Branch B break → 4段階フォールバック: 公休数達成を優先

    // [改善1] 日別在籍数ガードテーブル構築
    // minRequired = Σ dept.minStaff（その日に必要な最低勤務者数）
    const _paMinRequired = Math.max(1, Object.values(dept.minStaff || {}).reduce((a, b) => a + b, 0));
    const _paDailyRestLimit = {};
    const _paDailyRestCount = {};
    for (let d = 1; d <= days; d++) {
      _paDailyRestLimit[d] = Math.max(0, ds.length - _paMinRequired);
      // ロック済み公休を初期カウントに反映
      _paDailyRestCount[d] = ds.filter(s => {
        const v = res[s.id][d];
        return v && deptRest.has(v) && v !== '明け';
      }).length;
    }

    // [改善2] 処理順ソート: 制約スコア降順（制約強いスタッフ優先）
    // スコア = 夜勤数×2 + 明け数×1 + 希望休数×1
    const _paSortedDs = [...ds].sort((a, b) => {
      const scoreOf = s => {
        const vals = Object.values(res[s.id]);
        return vals.filter(v => v === '夜勤').length * 2
             + vals.filter(v => v === '明け').length
             + (s.kiboByMonth?.[mk]?.length ?? 0);
      };
      return scoreOf(b) - scoreOf(a);
    });

    _paSortedDs.forEach(s => {
      const trend = getTrend(s);
      const freeDays = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
      const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const lockedRest = Object.values(res[s.id]).filter(v => deptRest.has(v) && v !== '明け').length;
      const restTarget = Math.max(0, totalTarget - lockedRest);

      const validDays = freeDays.filter(d => res[s.id][d - 1] !== '明け');
      // [改善1] dailyRestLimit でフィルタした有効候補日
      const availDays = validDays.filter(d => _paDailyRestCount[d] < _paDailyRestLimit[d]);

      if (trend?.dowRestRate) {
        // ── Branch A: 確率サンプリング ──────────────────────────────────────
        // [改善1] validDays → availDays（日別上限ガード適用）
        const srcDays = availDays.length >= restTarget ? availDays : validDays;
        const weights = srcDays.map(d => {
          const dow6 = (new Date(year, month, d).getDay() + 6) % 7;
          return Math.max(0.01, trend.dowRestRate[dow6] ?? 0.01);
        });
        const picked = weightedSampleN(srcDays, weights, Math.min(restTarget, srcDays.length));

        // [改善3] 連続制約チェック: maxConsec 超の勤務区間に休みを挿入
        // pickedSet を最終セットとして確定し、最後に一括でカウント更新する
        const pickedSet = new Set(picked);
        let _tryCount = 0;
        for (let d = 1; d <= days - maxConsec && _tryCount < restTarget; d++) {
          // d〜d+maxConsec の全日が勤務（pickedSet にない・未ロックの空き日）
          const allWork = Array.from({length: maxConsec + 1}, (_, i) => d + i)
            .every(dd => !pickedSet.has(dd) && freeDays.includes(dd));
          if (allWork) {
            const mid = d + Math.floor(maxConsec / 2);
            // 挿入候補: 区間中央付近で validDays かつ未選択
            const alt = [mid, mid - 1, mid + 1, mid + 2, mid - 2].find(dd =>
              dd >= 1 && dd <= days && validDays.includes(dd) && !pickedSet.has(dd)
            );
            if (alt) {
              // restTarget を超えないよう最も遠い picked を外す
              if (pickedSet.size >= restTarget) {
                const farthest = [...pickedSet].reduce((a, b) =>
                  Math.abs(b - alt) > Math.abs(a - alt) ? b : a
                );
                if (Math.abs(farthest - alt) > maxConsec / 2) pickedSet.delete(farthest);
              }
              pickedSet.add(alt);
            }
            _tryCount++;
          }
        }

        // 最終セットを一括設定・カウント更新
        for (const d of pickedSet) {
          res[s.id][d] = '休み';
          _paDailyRestCount[d] = (_paDailyRestCount[d] || 0) + 1;
        }
      } else {
        // ── Branch B: 均等間隔配置 ──────────────────────────────────────────
        // [改善1] availDays を基準に均等間隔を計算
        const srcDays = availDays.length > 0 ? availDays : validDays;
        const N = srcDays.length;
        const step = N > 0 ? N / (restTarget + 1) : 1;
        const usedSet = new Set();
        let prevDay = 0;

        for (let i = 1; i <= restTarget; i++) {
          const isLast = (i === restTarget);

          const minDay = prevDay + 1;
          const maxDay = Math.min(days, prevDay + maxConsec + 1);
          const minDayAdj = isLast ? Math.max(minDay, days - maxConsec) : minDay;

          const idealIdx = Math.min(Math.max(0, Math.round(i * step) - 1), N > 0 ? N - 1 : 0);
          const idealDay = srcDays[idealIdx] ?? days;
          const jitter   = Math.round((Math.random() - 0.5) * 4);
          const targetDay = idealDay + jitter;

          // FB0: availDays 優先
          let cands = availDays.filter(d => d >= minDayAdj && d <= maxDay && !usedSet.has(d));
          if (!cands.length && isLast) {
            cands = availDays.filter(d => d >= minDay && d <= maxDay && !usedSet.has(d));
          }
          if (!cands.length) {
            cands = availDays.filter(d => d >= minDay && !usedSet.has(d));
          }
          // [改善4] FB3: dailyRestLimit +1 緩和（公休数死守優先）
          if (!cands.length) {
            cands = validDays.filter(d => d >= minDay && !usedSet.has(d) &&
              _paDailyRestCount[d] < _paDailyRestLimit[d] + 1);
          }
          // [改善4] FB4: 全 validDays（連続違反は PassC 委任、ただし break しない）
          if (!cands.length) {
            cands = validDays.filter(d => d >= minDay && !usedSet.has(d));
          }
          if (!cands.length) break;

          const best = cands.reduce((a, b) =>
            Math.abs(a - targetDay) < Math.abs(b - targetDay) ? a : b
          );

          usedSet.add(best);
          res[s.id][best] = '休み';
          _paDailyRestCount[best] = (_paDailyRestCount[best] || 0) + 1;
          prevDay = best;
        }
      }
    });

    // [DIAG-PassA] eiyo専用スナップショット
    // Phase4 Step4: passA 収集
    { const _RA=new Set(['休み','希望休','有休']); ds.forEach(s=>{const tK=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,vals=Object.values(res[s.id]);const aK=vals.filter(v=>_RA.has(v)).length;let st=0,ms=0;for(let d=1;d<=days;d++){const v=res[s.id][d];if(v&&!_RA.has(v)&&v!=='明け'){st++;ms=Math.max(ms,st);}else st=0;}_pa_rows.push({name:s.name,targetRest:tK,actualRest:aK,longestStreak:ms,diff:aK-tK});}); }
    // ── ステップ2.5: 早番・遅番 slot-first 配置（PassA公休確定後に実行）─────
    // PassA で休み日を先確定してから早番・遅番を配置することで、
    // 夜勤5回スタッフの残り空き日数が不足してPassAのbreakが発火する問題を防ぐ。
    {
      const slotFirstTypes = [...new Set(dept.shiftTypes)].filter(k =>
        k !== '夜勤' && _isSlotManaged(k)
      );
      let _slotMaxConsecExcluded = 0;
      for (const shiftType of slotFirstTypes) {
        const limit = maxStaff[shiftType];
        if (limit <= 0) continue;
        const slotPool = ds.filter(s => getAllowedTypes(s).includes(shiftType));
        for (let d = 1; d <= days; d++) {
          const already = ds.filter(s => res[s.id][d] === shiftType).length;
          const need = limit - already;
          if (need <= 0) continue;
          const cands = slotPool.filter(s => {
            if (lockedDays[s.id].has(d)) return false;
            if (res[s.id][d]) return false;
            const prev = d === 1 ? prevShift(s.id) : res[s.id][d - 1], next = res[s.id][d + 1];
            if (prev === '明け') return false;
            if (_isBadTransition(prev, shiftType)) return false;
            if (_isBadTransition(shiftType, next)) return false;
            const prevConsec = _consecWork(s.id, d - 1);
            let fwdConsec = 0;
            for (let i = d + 1; i <= days; i++) { if (deptWork.has(res[s.id][i])) fwdConsec++; else break; }
            if (prevConsec + 1 + fwdConsec > maxConsec) { _slotMaxConsecExcluded++; return false; }
            return true;
          }).sort((a, b) => {
            const ua = Object.values(res[a.id]).filter(v => v === shiftType).length;
            const ub = Object.values(res[b.id]).filter(v => v === shiftType).length;
            if (ua !== ub) return ua - ub;
            const weekday = new Date(year, month, d).getDay();
            const tA = getTrend(a), tB = getTrend(b);
            const wA = tA?.dowShiftRate?.[weekday]?.[shiftType] ?? tA?.[shiftType] ?? 0.5;
            const wB = tB?.dowShiftRate?.[weekday]?.[shiftType] ?? tB?.[shiftType] ?? 0.5;
            if (Math.abs(wA - wB) > 0.05) return wB - wA;
            return Math.random() - 0.5;
          });
          let filled = 0;
          for (const s of cands) {
            if (filled >= need) break;
            res[s.id][d] = shiftType;
            filled++;
          }
        }
      }
      {
        let _unfilledSlots = 0;
        for (const shiftType of slotFirstTypes) {
          const limit = maxStaff[shiftType];
          for (let d = 1; d <= days; d++) {
            const cnt = ds.filter(s => res[s.id][d] === shiftType).length;
            if (cnt < limit) _unfilledSlots += limit - cnt;
          }
        }
      }
    }

    // ── Pass B: 全スタッフの勤務シフトを確率サンプリングで配置 ──────────────
    // trend あり → dowShiftRate を重みにサンプリング（ratio指定があれば枠を先確保）
    // trend なし → deptAvgRatio fallback → 均等ランダム
    // maxStaff/minStaff 違反は後続の enforceMaxStaff / 最低配置保証で修正

    // ratioターゲット事前計算
    ds.forEach(s => {
      assignedShiftCounts[s.id] = {};
      dayTypes.forEach(k => { assignedShiftCounts[s.id][k] = 0; });
      const ratio = getShiftRatioOf(s);
      const workDayCount = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]).length;
      targetShiftCounts[s.id] = {};
      if (ratio) {
        const dayShiftTypes = dayTypes.filter(k => k !== "夜勤");
        const ratioTotal = dayShiftTypes.reduce((sum, k) => sum + (ratio[k] || 0), 0);
        if (ratioTotal > 0) {
          const corr = s.shiftRatioCorrection || {};
          const adj = {};
          dayShiftTypes.forEach(k => { adj[k] = Math.max(0, (ratio[k] || 0) - (corr[k] || 0) * 0.5); });
          const adjTotal = dayShiftTypes.reduce((sum, k) => sum + adj[k], 0) || ratioTotal;
          let alloc = 0;
          dayShiftTypes.filter(k => k !== "日勤").forEach(k => {
            const t = Math.round(workDayCount * adj[k] / adjTotal);
            targetShiftCounts[s.id][k] = t; alloc += t;
          });
          targetShiftCounts[s.id]["日勤"] = Math.max(0, workDayCount - alloc);
        } else {
          dayTypes.forEach(k => { targetShiftCounts[s.id][k] = 0; });
        }
      } else {
        dayTypes.forEach(k => { targetShiftCounts[s.id][k] = 0; });
      }
    });

    ds.forEach(s => {
      const trend = getTrend(s);
      const ratio = getShiftRatioOf(s);
      const workDays = Array.from({length: days}, (_, i) => i + 1).filter(d => !res[s.id][d]);
      const allowed = getAllowedTypes(s).filter(k => k !== '夜勤' && k !== '明け');
      if (!allowed.length) return;

      // シフト確率テーブルを取得（trend×比率ブレンド or 比率単独 or 均等）
      const getShiftWeight = (d, k) => {
        const weekday = new Date(year, month, d).getDay();
        const ratioTotal = ratio ? allowed.reduce((sum, j) => sum + (ratio[j] || 0), 0) : 0;
        const ratioW = (ratio && ratioTotal > 0) ? Math.max(0.01, (ratio[k] || 0.01) / ratioTotal) : null;
        if (trend?.dowShiftRate?.[weekday]?.[k] != null) {
          const trendW = Math.max(0.01, trend.dowShiftRate[weekday][k]);
          return ratioW ? trendW * 0.6 + ratioW * 0.4 : trendW;
        }
        if (trend && typeof trend[k] === 'number') {
          const trendW = Math.max(0.01, trend[k]);
          return ratioW ? trendW * 0.6 + ratioW * 0.4 : trendW;
        }
        if (ratioW) return ratioW;
        return 1 / allowed.length;
      };

      if (ratio && Object.values(targetShiftCounts[s.id]).some(v => v > 0)) {
        // ★ratio指定あり: 希少シフトを確率サンプリングで日付確保 → 残りは主力シフト
        const remaining = new Set(workDays);
        allowed.filter(k => k !== '日勤').forEach(shiftType => {
          // slot-first 済み（role-slot）のシフトは Pass B では扱わない
          if (_isSlotManaged(shiftType)) return;
          const targetCount = targetShiftCounts[s.id][shiftType] || 0;
          if (!targetCount) return;
          const pool = [...remaining].filter(d => {
            if (dept.id === 'eiyo' && _consecWork(s.id, d - 1) >= maxConsec) return false;
            const cnt = ds.filter(sx => res[sx.id][d] === shiftType).length;
            return cnt < (maxStaff[shiftType] ?? 99);
          });
          const weights = pool.map(d => getShiftWeight(d, shiftType));
          // サンプリングにスロット上限ブースト: まだ余裕のある日に偏らせる（但しランダム性維持）
          const picked = weightedSampleN(pool, weights, targetCount);
          picked.forEach(d => {
            res[s.id][d] = shiftType;
            assignedShiftCounts[s.id][shiftType] = (assignedShiftCounts[s.id][shiftType] || 0) + 1;
            remaining.delete(d);
          });
        });
        const nikkin = allowed.includes('日勤') ? '日勤' : (allowed.find(k => k !== '夜勤' && k !== '明け') || allowed[0]);
        remaining.forEach(d => {
          if (dept.id === 'eiyo' && _consecWork(s.id, d - 1) >= maxConsec) {
            res[s.id][d] = '休み';
            return;
          }
          res[s.id][d] = nikkin;
          assignedShiftCounts[s.id][nikkin] = (assignedShiftCounts[s.id][nikkin] || 0) + 1;
        });
      } else {
        // ★ratio指定なし / trendのみ / trendなし: 各日を確率サンプリングで決定
        workDays.forEach(d => {
          if (dept.id === 'eiyo' && _consecWork(s.id, d - 1) >= maxConsec) {
            res[s.id][d] = '休み';
            return;
          }
          const probs = {};
          allowed.forEach(k => { probs[k] = getShiftWeight(d, k); });
          // minStaff 不足シフトにブースト（minStaff充足優先）
          const dayCnts = {};
          dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
          allowed.forEach(k => {
            const deficit = Math.max(0, (dept.minStaff[k] || 0) - (dayCnts[k] || 0));
            if (deficit > 0) probs[k] = (probs[k] || 0.01) * (1 + deficit * 2);
            if ((dayCnts[k] || 0) >= (maxStaff[k] ?? 99)) probs[k] = 0;
          });
          if (d === 1) { const ps = prevShift(s.id); if (ps) allowed.forEach(k => { if (_isBadTransition(ps, k)) probs[k] = 0; }); }
          const pick = sampleFromProbs(probs)
            || allowed.find(k => !_isBadTransition(d === 1 ? prevShift(s.id) : null, k) && (dayCnts[k]||0) < (maxStaff[k]??99))
            || allowed.find(k => k === '日勤')
            || allowed[0];
          res[s.id][d] = pick;
          assignedShiftCounts[s.id][pick] = (assignedShiftCounts[s.id][pick] || 0) + 1;
        });
      }
    });
    // [DEBUG PassB終了] 公休スナップショット
    // [DEBUG PassB-連続チェック] PassB後の実際の連続勤務違反（勤務シフト配置済み）
    // Phase4 Step3: passB 収集
    { const _RB=new Set(['休み','希望休','有休']); _pb_snap=ds.map(s=>{const tK=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,vals=Object.values(res[s.id]);const aK=vals.filter(v=>_RB.has(v)).length;return{name:s.name,targetKyuko:tK,actualKyuko:aK,diff:aK-tK,kyumi:vals.filter(v=>v==='休み').length,kibosyu:vals.filter(v=>v==='希望休').length,yuyuu:vals.filter(v=>v==='有休').length,ake:vals.filter(v=>v==='明け').length};}); _pb_short=ds.filter(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;return Object.values(res[s.id]).filter(v=>_RB.has(v)).length<t;}).map(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const act=Object.values(res[s.id]).filter(v=>_RB.has(v)).length;return{name:s.name,target:t,actual:act,diff:act-t};}); { let _vs2=0,_vc2=0,_mx2=0; const _cr=ds.map(s=>{let st=0,vc=0,ms=0;for(let d=1;d<=days;d++){const v=res[s.id][d];const isW=deptWork.has(v)&&v!=='明け';if(!isW){st=0;}else{st++;if(st>maxConsec)vc++;}ms=Math.max(ms,st);}if(vc>0)_vs2++;_vc2+=vc;_mx2=Math.max(_mx2,ms);return{name:s.name,maxStreak:ms,violationDays:vc};}); _pb_consec={maxConsec,violatingStaffCount:_vs2,totalViolationDays:_vc2,maxStreak:_mx2,rows:_cr.filter(r=>r.violationDays>0)}; } }

    // ── Pass C: 連続勤務超過の修正 ─ [Tier2 repair] ────────────────────────────
    // 修復方針（介護型 Tier 構造に準拠）:
    //   ① d 日が非 slot → d を休みに変換（従来通り）
    //   ② d 日が role-slot（Tier1保護）→ Tier2（日勤層）で吸収
    //      探索範囲 [d-maxConsec, d-1]: この範囲の1日を削除 → d での streak ≤ maxConsec
    //      数学的根拠: t ∈ [d-maxConsec, d-1] 削除 → 新 streak = d-t ≤ maxConsec ✓
    //
    //      削除優先順位:
    //        最優先: 日勤（base=日勤 のシフト）  ← 介護バッファ層、最も削除に適切
    //        次点  : 非 slot 勤務               ← _shouldProtectSlot が false のもの
    //        禁止  : role-slot / lockedDays / 明け
    //
    //      Tier1 保証: _shouldProtectSlot(tSh, count) が true の日は除外
    //      副作用: 追加された休みは後続の 公休数調整 で _consecWork チェック済みなため
    //              無限 repair ループにはならない
    {
      let _fixedNonSlot = 0, _absorbedByTier2 = 0;
      const _diagTypeMap = {}; // [DIAG] 元シフト種別カウント
      const _cds = dept.customShiftDefs || [];
      // base が 日勤 かどうかを判定（_isSlotManaged は除外済みだが、優先度付けのため明示チェック）
      const _isNikkinBase = (k) => isNikkinBase(k, _cds); // Step4: グローバル昇格
      ds.forEach(s => {
        for (let d = 1; d <= days; d++) {
          if (!deptWork.has(res[s.id][d]) || res[s.id][d] === '明け') continue;
          if (_consecWork(s.id, d) <= maxConsec) continue;
          if (lockedDays[s.id].has(d) || res[s.id][d - 1] === '明け') continue;
          // ★ PassC 公休超過ガード: actualRest >= targetRest なら休み追加を行わない
          const sh = res[s.id][d];
          if (_shouldProtectSlot(sh, ds.filter(sx => res[sx.id][d] === sh).length)) {
            // ★Tier1保護: d 日は role-slot → 削除不可
            // Tier2 吸収: [d-maxConsec, d-1] を走査して削除候補を優先度順で選択
            const searchStart = Math.max(1, d - maxConsec);
            let nikkinTarget = null;  // 日勤候補（最優先）
            let nonSlotTarget = null; // 非 slot 候補（次点）
            for (let t = searchStart; t < d; t++) {
              if (lockedDays[s.id].has(t)) continue;
              const tSh = res[s.id][t];
              if (!deptWork.has(tSh) || tSh === '明け') continue;
              if (_shouldProtectSlot(tSh, ds.filter(sx => res[sx.id][t] === tSh).length)) continue;
              // 日勤が見つかれば即確定（最優先）
              if (_isNikkinBase(tSh)) { nikkinTarget = t; break; }
              // 非 slot 勤務は候補として保存して走査続行（日勤を探す）
              if (nonSlotTarget === null) nonSlotTarget = t;
            }
            const target = nikkinTarget ?? nonSlotTarget; // 日勤優先、なければ非 slot
            if (target !== null) {
              res[s.id][target] = '休み'; // ← Tier2（日勤層）を削除して streak を断ち切る
              _absorbedByTier2++;
            }
            continue; // d 自体（role-slot）は変更しない
          }
          res[s.id][d] = '休み';
          _fixedNonSlot++;
        }
      });
      // Phase4 Step3: passC 収集（PassC本体）
      _pc_nonSlotFixed = _fixedNonSlot; _pc_tier2Absorbed = _absorbedByTier2;
      Object.entries(_diagTypeMap).forEach(([k,v])=>_pc_typeBreakdown.push({shift:k,count:v}));
    }
    // ★Phase1 diagnostic: Pass C 後の連続勤務違反残存チェック（読み取り専用・ロジック変更なし）
    // [AG-Phase1] log: total=残存違反数 slotProtected=_shouldProtectSlot が守った件数（Tier1衝突）
    {
      let _passCViolations = 0, _passCSlotProtected = 0;
      ds.forEach(s => {
        for (let d = 1; d <= days; d++) {
          if (!deptWork.has(res[s.id][d]) || res[s.id][d] === '明け') continue;
          if (_consecWork(s.id, d) <= maxConsec) continue;
          _passCViolations++;
          const sh = res[s.id][d];
          if (_shouldProtectSlot(sh, ds.filter(sx => res[sx.id][d] === sh).length)) _passCSlotProtected++;
        }
      });
      // Phase4 Step3: passC 残存違反収集
      _pc_residualViolations = _passCViolations; _pc_residualSlotProtected = _passCSlotProtected;
    }
    // [DEBUG PassC終了] 公休スナップショット
    // Phase4 Step3: passC スナップショット収集
    { const _R=new Set(['休み','希望休','有休']); _pc_snap=ds.map(s=>{const tK=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,vals=Object.values(res[s.id]);const aK=vals.filter(v=>_R.has(v)).length;return{name:s.name,targetKyuko:tK,actualKyuko:aK,diff:aK-tK};}); _pc_short_arr=ds.filter(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;return Object.values(res[s.id]).filter(v=>_R.has(v)).length<t;}).map(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;const act=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:t,actual:act,diff:act-t};}); }

    // ── 公休数調整 ─ [Tier2 repair / shortage補正は _shouldProtectSlot 保護済み] ──
    ds.forEach(s => {
      const totalTarget = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const kiboCount = Object.values(res[s.id]).filter(v => v === "希望休").length;
      const target = Math.max(0, totalTarget - kiboCount);
      {
        const restDays = Object.entries(res[s.id]).filter(([, v]) => v === "休み").map(([d]) => +d).sort((a, b) => a - b);
        let excess = restDays.length - target;
        for (const d of restDays) {
          if (excess <= 0) break;
          if (lockedDays[s.id].has(d)) continue;
          if (res[s.id][d - 1] === "明け") continue;
          if (res[s.id][d - 1] === "夜勤") continue;
          const actualBefore = _consecWork(s.id, d - 1);
          let actualAfter = 0;
          for (let i = d + 1; i <= days; i++) { if (deptWork.has(res[s.id][i])) actualAfter++; else break; }
          if (actualBefore + 1 + actualAfter > maxConsec) continue;
          const dayCnts = {};
          dayTypes.forEach(k => { dayCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
          let av = dayTypes.filter(k => dayCnts[k] < (maxStaff[k] ?? 99));
          av = av.filter(k => getAllowedTypes(s).includes(k));
          { const p=d===1?prevShift(s.id):res[s.id][d-1],nx=res[s.id][d+1]; if(p) av=av.filter(k=>!_isBadTransition(p,k)); if(nx) av=av.filter(k=>!_isBadTransition(k,nx)); }
          if (!av.length) {
            const prevSh = d === 1 ? prevShift(s.id) : res[s.id][d - 1]; const nextShift = res[s.id][d + 1];
            const roleAllowed = getAllowedTypes(s);
            // maxStaff を守りつつ遷移ルール内で選択（両方NG なら maxStaff 優先・遷移妥協）
            const forceShift = (() => {
              const base = roleAllowed.length < dayTypes.length ? roleAllowed : dayTypes;
              // ①遷移OK + maxStaff内
              const best = base.find(k => !_isBadTransition(prevSh,k) && !_isBadTransition(k,nextShift) && ds.filter(sx=>res[sx.id][d]===k).length<(maxStaff[k]??99));
              if (best) return best;
              // ②遷移妥協でも maxStaff内（roleAllowed外は絶対に返さない）
              const safe = base.filter(k=>ds.filter(sx=>res[sx.id][d]===k).length<(maxStaff[k]??99));
              return safe.find(k=>k==='日勤') || safe[0] || roleAllowed[0] || '休み';
            })();
            res[s.id][d] = forceShift; excess--; continue;
          }
          const pick = [...av].sort((a, b) => { const dA=Math.max(0,(dept.minStaff[a]||0)-dayCnts[a]),dB=Math.max(0,(dept.minStaff[b]||0)-dayCnts[b]); if(dA!==dB)return dB-dA; return (PRIORITY[a]??3)-(PRIORITY[b]??3); })[0];
          res[s.id][d] = pick; excess--;
        }
      }
      {
        const currentRest = Object.values(res[s.id]).filter(v => v === "休み").length;
        let shortage = target - currentRest;
        if (shortage > 0) {
          const workDays2 = Object.entries(res[s.id]).filter(([, v]) => deptWork.has(v)).map(([d]) => +d)
            .filter(d => {
              if (res[s.id][d - 1] === "明け" || res[s.id][d + 1] === "明け") return false;
              if (!_canRest(s.id, d)) return false;
              // ★Tier1保護: role-slot が上限以内なら公休shortage補正（Tier2）の対象外
              const sh = res[s.id][d];
              if (_shouldProtectSlot(sh, ds.filter(sx => res[sx.id][d] === sh).length)) return false;
              return true;
            })
            .sort((a, b) => _consecWork(s.id, b - 1) - _consecWork(s.id, a - 1));
          for (const d of workDays2) { if (shortage <= 0) break; if (!_canRest(s.id, d)) continue; res[s.id][d] = "休み"; shortage--; }
        }
      }
      for (let d = 1; d <= days; d++) {
        if (res[s.id][d] !== "休み") continue;
        if (lockedDays[s.id].has(d)) continue;
        if (res[s.id][d - 1] === "明け") continue;
        if (res[s.id][d + 1] === "明け") continue;
        if (_consecRest(s.id, d) <= 3) continue;
        if ((_consecWork(s.id, d - 1) + 1) > maxConsec) continue;
        const fixCnts = {};
        dayTypes.forEach(k => { fixCnts[k] = ds.filter(sx => res[sx.id][d] === k).length; });
        let av = dayTypes.filter(k => fixCnts[k] < (maxStaff[k] ?? 99));
        av = av.filter(k => getAllowedTypes(s).includes(k));
        { const p=d===1?prevShift(s.id):res[s.id][d-1],nx=res[s.id][d+1]; if(p) av=av.filter(k=>!_isBadTransition(p,k)); if(nx) av=av.filter(k=>!_isBadTransition(k,nx)); }
        if (!av.length) continue;
        res[s.id][d] = [...av].sort((a, b) => fixCnts[a] - fixCnts[b])[0];
      }
    });
  }

  // [DEBUG フェーズ追跡①] 公休数調整後
  // Phase4 Step2: restAdjustment afterRestAdj 収集
  { const _R=new Set(['休み','希望休','有休']); _ra_phases.afterRestAdj.rows=ds.map(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,a=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:t,actual:a,diff:a-t};}); _ra_phases.afterRestAdj.shortage=ds.filter(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;return Object.values(res[s.id]).filter(v=>_R.has(v)).length<t;}).map(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,a=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:t,actual:a,diff:a-t};}); }

  enforceMaxStaff(); // 1回目: Pass B/C 後の超過を除去

  // 遷移違反 repair ─ [Tier2 repair / _shouldProtectSlot 保護済み（休み→日勤代替）]
  // 遅番翌日早番/日勤、日勤翌日早番 の残存違反を修正
  const isViolation = (prev, curr) => _isBadTransition(prev, curr);
  for (const s of ds) {
    for (let d = 2; d <= days; d++) {
      if (!isViolation(res[s.id][d - 1], res[s.id][d])) continue;
      const fixDay = (target) => {
        if (lockedDays[s.id].has(target)) return false;
        const p = res[s.id][target - 1];
        const n = res[s.id][target + 1];
        const cnts = {};
        dayTypes.forEach(k => { cnts[k] = ds.filter(sx => sx.id !== s.id && res[sx.id][target] === k).length; });
        const alt = dayTypes.find(k => {
          if (!getAllowedTypes(s).includes(k)) return false;
          if (_isBadTransition(p, k)) return false;
          if (_isBadTransition(k, n)) return false;
          return cnts[k] < (maxStaff[k] ?? 99);
        });
        // ★Tier1保護: altが見つからず"休み"にする前に role-slot なら roleAllowed内でフォールバック
        const curSh = res[s.id][target];
        const isSlotProtected = _shouldProtectSlot(curSh, ds.filter(sx => res[sx.id][target] === curSh).length);
        const roleAllowed = getAllowedTypes(s);
        const finalAlt = alt ?? (isSlotProtected
          ? (roleAllowed.find(k => k === '日勤' && cnts[k] < (maxStaff[k] ?? 99))
             || roleAllowed.find(k => cnts[k] < (maxStaff[k] ?? 99))
             || '休み')
          : '休み');
        res[s.id][target] = finalAlt;
        return true;
      };
      if (!fixDay(d)) fixDay(d - 1);
    }
  }

  // 月境界遷移違反修正: 前月末→当月1日
  for (const s of ds) {
    if (lockedDays[s.id].has(1)) continue;
    const ps = prevShift(s.id);
    if (!isViolation(ps, res[s.id][1])) continue;
    const nx = res[s.id][2];
    const cnts = {};
    dayTypes.forEach(k => { cnts[k] = ds.filter(sx => sx.id !== s.id && res[sx.id][1] === k).length; });
    const alt = dayTypes.find(k => {
      if (!getAllowedTypes(s).includes(k)) return false;
      if (_isBadTransition(ps, k)) return false;
      if (_isBadTransition(k, nx)) return false;
      return cnts[k] < (maxStaff[k] ?? 99);
    });
    const curSh = res[s.id][1];
    const isSlotProtected = _shouldProtectSlot(curSh, ds.filter(sx => res[sx.id][1] === curSh).length);
    const roleAllowed1 = getAllowedTypes(s);
    res[s.id][1] = alt ?? (isSlotProtected
      ? (roleAllowed1.find(k => k === '日勤' && cnts[k] < (maxStaff[k] ?? 99))
         || roleAllowed1.find(k => cnts[k] < (maxStaff[k] ?? 99))
         || '休み')
      : '休み');
  }

  enforceMaxStaff(); // 2回目: 違反修正後の超過を除去

  // minStaff 保証 ─ [Tier2 repair / slide元は _shouldProtectSlot 保護済み]
  // 最低配置保証フェーズ: minStaff未満の日にスタッフを補充
  // 優先①: 他シフト勤務中のスタッフをスライド（振替）→ 休み数は変わらない
  // 優先②: 休み→勤務は公休数が目標より多い余剰スタッフのみ対象（kyukoDays死守）
  for (let pass = 0; pass < 3; pass++) {
    let anyFixed = false;
    for (let d = 1; d <= days; d++) {
      for (const [shiftKey, minCount] of Object.entries(dept.minStaff || {})) {
        let actual = ds.filter(s => res[s.id][d] === shiftKey).length;
        if (actual >= minCount) continue;

        // ── 優先①: 他シフト勤務中のスタッフをスライド ──
        const slideCands = ds.filter(s => {
          const cur = res[s.id][d];
          if (!cur || cur === shiftKey) return false;
          if (WORK_TYPES.has(cur) === false) return false; // 勤務中のみ
          if (lockedDays[s.id].has(d)) return false;
          if (!getAllowedTypes(s).includes(shiftKey)) return false;
          const prev = d === 1 ? prevShift(s.id) : res[s.id][d - 1], next = res[s.id][d + 1];
          if (_isBadTransition(prev, shiftKey)) return false;
          if (_isBadTransition(shiftKey, next)) return false;
          // スライド元シフトのminStaffを割らないか確認
          const fromMin = dept.minStaff?.[cur] ?? 0;
          const fromActual = ds.filter(sx => res[sx.id][d] === cur).length;
          if (fromActual - 1 < fromMin) return false;
          // ★Tier1保護: role-slot が上限以内ならスライド元（Tier2）にしない
          if (_shouldProtectSlot(cur, fromActual)) return false;
          return true;
        }).sort((a, b) => {
          // ★最小変更原則: 比率ターゲットのシフト中スタッフはスライドを最後に選ぶ
          const aRatio = a.shiftRatio || a.shiftRatioByMonth?.[mk];
          const bRatio = b.shiftRatio || b.shiftRatioByMonth?.[mk];
          const aOnTarget = aRatio && (aRatio[res[a.id][d]] || 0) > 0;
          const bOnTarget = bRatio && (bRatio[res[b.id][d]] || 0) > 0;
          if (aOnTarget && !bOnTarget) return 1;
          if (!aOnTarget && bOnTarget) return -1;
          const cntA = ds.filter(s => res[s.id][d] === res[a.id][d]).length;
          const cntB = ds.filter(s => res[s.id][d] === res[b.id][d]).length;
          const maxA = maxStaff[res[a.id][d]] ?? 99;
          const maxB = maxStaff[res[b.id][d]] ?? 99;
          return (maxA - cntA) - (maxB - cntB);
        });
        let need = minCount - actual;
        for (const s of slideCands) {
          if (need <= 0) break;
          res[s.id][d] = shiftKey; need--; anyFixed = true;
          actual++;
        }

        if (need <= 0) continue;

        // ── 優先②: 休み→勤務（公休数が目標より多い余剰スタッフのみ） ──
        const restCands = ds.filter(s => {
          if (res[s.id][d] !== "休み") return false;
          if (lockedDays[s.id].has(d)) return false;
          if (!getAllowedTypes(s).includes(shiftKey)) return false;
          const prev = d === 1 ? prevShift(s.id) : res[s.id][d - 1], next = res[s.id][d + 1];
          if (prev === "夜勤" || prev === "明け") return false;
          if (_isBadTransition(prev, shiftKey)) return false;
          if (_isBadTransition(shiftKey, next)) return false;
          if ((_consecWork(s.id, d - 1) + 1) > maxConsec) return false;
          const curCount = ds.filter(sx => res[sx.id][d] === shiftKey).length;
          if (curCount >= (maxStaff[shiftKey] ?? 99)) return false;
          const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
          const actualKyuko = Object.values(res[s.id]).filter(v => v === "休み" || v === "希望休").length;
          return actualKyuko > targetKyuko;
        }).sort((a, b) => {
          const targetA = a.kyukoDaysByMonth?.[mk] ?? a.kyukoDays ?? 8;
          const targetB = b.kyukoDaysByMonth?.[mk] ?? b.kyukoDays ?? 8;
          const surplusA = Object.values(res[a.id]).filter(v => v === "休み" || v === "希望休").length - targetA;
          const surplusB = Object.values(res[b.id]).filter(v => v === "休み" || v === "希望休").length - targetB;
          return surplusB - surplusA;
        });
        for (const s of restCands) {
          if (need <= 0) break;
          res[s.id][d] = shiftKey; need--; anyFixed = true;
        }
      }
    }
    if (!anyFixed) break;
  }

  enforceMaxStaff(); // 3回目: 最低配置保証後の超過を除去

  // [DEBUG フェーズ追跡②] minStaff保証+enforceMaxStaff×3後
  // Phase4 Step2: restAdjustment afterEnforceMax3 収集
  { const _R=new Set(['休み','希望休','有休']); _ra_phases.afterEnforceMax3.rows=ds.map(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,a=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:t,actual:a,diff:a-t};}); _ra_phases.afterEnforceMax3.shortage=ds.filter(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8;return Object.values(res[s.id]).filter(v=>_R.has(v)).length<t;}).map(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,a=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:t,actual:a,diff:a-t};}); }

  // ★公休数回復フェーズ: 目標公休数に不足しているスタッフの日勤を休みに強制変換
  // minStaff を割らない範囲で、日勤配置数が最多の日から優先して変換する
  {
    const REST_KYU = new Set(["休み","希望休"]);
    for (const s of ds) {
      const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const actualKyuko = Object.values(res[s.id]).filter(v => REST_KYU.has(v)).length;
      let shortage = targetKyuko - actualKyuko;
      if (shortage <= 0) continue;
      // 対象: ロック外の日勤日 → 日勤配置人数 降順で並べる
      const nikkinDays = Object.entries(res[s.id])
        .filter(([d, v]) => v === "日勤" && !lockedDays[s.id].has(+d))
        .map(([d]) => +d)
        .filter(d => {
          // minStaff['日勤'] を割らないか確認
          const minN = dept.minStaff?.["日勤"] ?? 0;
          const cur = ds.filter(sx => res[sx.id][d] === "日勤").length;
          if (cur - 1 < minN) return false;
          // 連続休み上限（3日まで許容）
          if (res[s.id][d - 1] === "明け") return false;
          const pr = _consecRest(s.id, d - 1);
          const nx = _consecRestFwd(s.id, d);
          return pr + 1 + nx <= 3;
        })
        .sort((a, b) => {
          const ca = ds.filter(sx => res[sx.id][a] === "日勤").length;
          const cb = ds.filter(sx => res[sx.id][b] === "日勤").length;
          return cb - ca; // 日勤が多い日を優先して間引く
        });
      for (const d of nikkinDays) {
        if (shortage <= 0) break;
        res[s.id][d] = "休み";
        shortage--;
      }
    }
  }

  // [DEBUG フェーズ追跡③] 公休数回復フェーズ後
  // Phase4 Step2: restAdjustment afterRestRecovery 収集
  { const _R=new Set(['休み','希望休','有休']); _ra_phases.afterRestRecovery.rows=ds.map(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,a=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:t,actual:a,diff:a-t};}); }

  // ★公休数超過バリデーション: 他ルールを破らない範囲で超過した休みを日勤へ変換
  // 変換できない場合は10日のまま受け入れる（無理強いしない）
  {
    const REST_OVER = new Set(["休み","希望休"]);
    for (const s of ds) {
      const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
      const actualKyuko = Object.values(res[s.id]).filter(v => REST_OVER.has(v)).length;
      let excess = actualKyuko - targetKyuko;
      if (excess <= 0) continue;
      const allowedForS = getAllowedTypes(s);
      // ロック外の「休み」のみ対象（希望休・有休は固定）
      const excessRestDays = Object.entries(res[s.id])
        .filter(([d, v]) => v === "休み" && !lockedDays[s.id].has(+d))
        .map(([d]) => +d)
        .filter(d => {
          const prev = res[s.id][d - 1], next = res[s.id][d + 1];
          // 優先1: 夜勤・明け翌日は絶対NG
          if (prev === "明け" || prev === "夜勤") return false;
          // 連続勤務上限チェック（前後合計）
          const backW = _consecWork(s.id, d - 1);
          let fwdW = 0; for (let i = d + 1; i <= days; i++) { if (deptWork.has(res[s.id][i])) fwdW++; else break; }
          if ((backW + 1 + fwdW) > maxConsec) return false;
          // シフト連続性チェック（日勤を仮ターゲットとして違反確認）
          const tgt = allowedForS.includes("日勤") ? "日勤" : (allowedForS[0] || "日勤");
          if (_isBadTransition(prev, tgt)) return false;
          if (_isBadTransition(tgt, next)) return false;
          // 優先3: maxStaff チェック（日勤上限を守る）
          const curCount = ds.filter(sx => res[sx.id][d] === tgt).length;
          if (curCount >= (maxStaff[tgt] ?? 99)) return false;
          return true;
        })
        .sort((a, b) => {
          // 日勤が少ない日を優先
          const tgt = allowedForS.includes("日勤") ? "日勤" : (allowedForS[0] || "日勤");
          const ca = ds.filter(sx => res[sx.id][a] === tgt).length;
          const cb = ds.filter(sx => res[sx.id][b] === tgt).length;
          return ca - cb;
        });
      for (const d of excessRestDays) {
        if (excess <= 0) break;
        const tgt = allowedForS.includes("日勤") ? "日勤" : (allowedForS[0] || "日勤");
        res[s.id][d] = tgt;
        excess--;
        // 変換した後、残り excess を再チェック（変換で actualKyuko が変わるため）
      }
      // 変換できる枠がなければ「惜しい状態」のまま終了（スコアで後評価）
    }
  }

  // [DEBUG フェーズ追跡④] 公休数超過バリデーション後
  // Phase4 Step2: restAdjustment afterExcessVal 収集
  { const _R=new Set(['休み','希望休','有休']); _ra_phases.afterExcessVal.rows=ds.map(s=>{const t=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,a=Object.values(res[s.id]).filter(v=>_R.has(v)).length;return{name:s.name,target:t,actual:a,diff:a-t};}); }

  // ratio 修復 ─ [Tier2 repair / fromShift削減は _shouldProtectSlot 保護済み]
  // ★比率修復パス: minStaff保証後の比率乖離を実際のシフト変換で修正する
  // minStaff slide 等で A1→A に崩れたスタッフのシフトを制約内で書き戻す
  {
    for (const s of ds) {
      const sratio = s.shiftRatio || s.shiftRatioByMonth?.[mk];
      if (!sratio) continue;
      const ratioTotal = Object.values(sratio).reduce((sum, v) => sum + (v||0), 0);
      if (ratioTotal <= 0) continue;
      const allowed = getAllowedTypes(s);
      const workDaysArr = Array.from({length:days},(_,i)=>i+1)
        .filter(d => deptWork.has(res[s.id][d]) && res[s.id][d] !== '明け' && !lockedDays[s.id].has(d));
      const totalWork = workDaysArr.length;
      if (totalWork === 0) continue;
      const targets = {}, actuals = {};
      for (const [k, v] of Object.entries(sratio)) {
        if (v > 0 && allowed.includes(k)) {
          targets[k] = Math.round(totalWork * v / ratioTotal);
          actuals[k] = workDaysArr.filter(d => res[s.id][d] === k).length;
        }
      }
      // 過多シフト → 過少シフトへの変換（制約チェック付き）
      const fromShifts = Object.keys(targets).filter(k => (actuals[k]||0) > targets[k])
        .sort((a,b) => (actuals[b]||0)-targets[b] - ((actuals[a]||0)-targets[a]));
      for (const fromShift of fromShifts) {
        const fromDays = workDaysArr.filter(d => res[s.id][d] === fromShift);
        const toShifts = Object.keys(targets).filter(k => k !== fromShift && targets[k] > (actuals[k]||0))
          .sort((a,b) => targets[b]-(actuals[b]||0) - (targets[a]-(actuals[a]||0)));
        for (const toShift of toShifts) {
          const canConvert = Math.min((actuals[fromShift]||0)-targets[fromShift], targets[toShift]-(actuals[toShift]||0));
          let converted = 0;
          for (const d of fromDays) {
            if (converted >= canConvert) break;
            if (res[s.id][d] !== fromShift) continue;
            const prev = res[s.id][d-1], next = res[s.id][d+1];
            if (_isBadTransition(prev, toShift)) continue;
            if (_isBadTransition(toShift, next)) continue;
            const fromCnt = ds.filter(sx => res[sx.id][d] === fromShift).length;
            if (fromCnt - 1 < (dept.minStaff?.[fromShift] ?? 0)) continue;
            // ★Tier1保護: role-slot が上限以内なら ratio修復（Tier2）で削減しない
            if (_shouldProtectSlot(fromShift, fromCnt)) continue;
            const toCnt = ds.filter(sx => res[sx.id][d] === toShift).length;
            if (toCnt >= (maxStaff[toShift] ?? 99)) continue;
            res[s.id][d] = toShift;
            actuals[fromShift]--;
            actuals[toShift] = (actuals[toShift]||0) + 1;
            converted++;
          }
        }
      }
    }
  }

  enforceMaxStaff(); // 4回目: 比率修復後の最終確認

  // ── DiagnosticEngine Phase4 Step1: repair.final 収集変数 ──────────────
  const _rf_maxViolations = [];
  let   _rf_totalViolations = 0;
  let   _rf_nightOrphans = 0;
  const _rf_nightOrphanList = [];
  const _rf_snapshot = [];

  // ★最終検証ログ: maxStaff違反が残っていないか確認
  {
    let totalViolations = 0;
    for (let d = 1; d <= days; d++) {
      for (const [k, limit] of Object.entries(maxStaff)) {
        if (limit >= 99) continue;
        const cnt = ds.filter(s => res[s.id][d] === k).length;
        if (cnt > limit) {
          totalViolations++;
          _rf_maxViolations.push({ day: d, shift: k, cnt, limit }); // Phase4 Step1
        }
      }
    }
    _rf_totalViolations = totalViolations; // Phase4 Step1
  }

  {
    const _nf_cds   = dept.customShiftDefs || [];
    const _nf_nset  = new Set();
    [...new Set(dept.shiftTypes || [])].forEach(k => {
      const _nc = _nf_cds.find(c => c.key === k);
      if ((_nc?.baseType || k) === '夜勤') _nf_nset.add(k);
    });
    let _nf_orphans = 0;
    const _nf_list  = [];
    for (const s of ds) {
      for (let d = 2; d <= days; d++) {
        const sh   = res[s.id][d] ?? '';
        const prev = res[s.id][d - 1] ?? '';
        if (sh === '明け' && !_nf_nset.has(prev)) {
          _nf_orphans++;
          _nf_list.push(`${s.name} d${d}(prev=${prev || '空'})`);
          _rf_nightOrphans++; // Phase4 Step1
          _rf_nightOrphanList.push(`${s.name} d${d}(prev=${prev || '空'})`); // Phase4 Step1
        }
      }
    }
    if (_nf_orphans === 0) {
    } else {
    }
  }

  const warnings = {};
  for (let d = 1; d <= days; d++) {
    for (const [shiftKey, minCount] of Object.entries(dept.minStaff || {})) {
      const actual = ds.filter(s => res[s.id][d] === shiftKey).length;
      if (actual < minCount) {
        if (!warnings[shiftKey]) warnings[shiftKey] = { days: 0, maxShort: 0 };
        warnings[shiftKey].days++;
        warnings[shiftKey].maxShort = Math.max(warnings[shiftKey].maxShort, minCount - actual);
      }
    }
  }
  const timelineWarnings = [];
  if (isCtd) {
    const reqS = timeToMins(dept.requiredStart), reqE = timeToMins(dept.requiredEnd);
    if (reqS != null && reqE != null) {
      for (let d = 1; d <= days; d++) {
        const dayKeys = ds.filter(s => deptWork.has(res[s.id][d]) && res[s.id][d] !== "明け").map(s => res[s.id][d]);
        const gaps = coverageGaps(buildDayIntervals(dayKeys, dept), reqS, reqE);
        if (gaps.length > 0) timelineWarnings.push({ day: d, gaps });
      }
    }
  }
  // [DEBUG 最終出力] 公休スナップショット
  // Phase4 Step1: 最終スナップショット収集
  { const _R=new Set(['休み','希望休','有休']); ds.forEach(s=>{const tK=s.kyukoDaysByMonth?.[mk]??s.kyukoDays??8,vals=Object.values(res[s.id]);const aK=vals.filter(v=>_R.has(v)).length;_rf_snapshot.push({name:s.name,targetKyuko:tK,actualKyuko:aK,diff:aK-tK,kyumi:vals.filter(v=>v==='休み').length,kibosyu:vals.filter(v=>v==='希望休').length,yuyuu:vals.filter(v=>v==='有休').length,ake:vals.filter(v=>v==='明け').length});}); }
  // ── DiagnosticEngine: Phase3 Step2 ──
  // prevTail 引数（builtPrevTail）から実データを取り出してレポートに格納する。
  const _dtStaffCount = Object.keys(prevTail).length;
  const _dtDayCount = Object.values(prevTail).reduce((s, tail) => s + Object.keys(tail).length, 0);
  const diagnosticReport = {
    dept: dept.id,
    year,
    month,
    prevTail: {
      loaded: _dtStaffCount > 0,
      staffCount: _dtStaffCount,
      dayCount: _dtDayCount,
    },
    blankCheck: null,
    // ── DiagnosticEngine Phase4: repair ──────────────────────────────────
    repair: (() => {
      const _passBShort = _pb_short.length;
      const _passCShort = _pc_short_arr.length;
      const _finalShort = _rf_snapshot.filter(r => r.diff < 0).length;
      const _repairHistory = [
        { phase: 'passA', shortCount: _pa_rows.filter(r => r.diff < 0).length },
        { phase: 'passB', shortCount: _passBShort },
        { phase: 'passC', shortCount: _passCShort, nonSlotFixed: _pc_nonSlotFixed, tier2Absorbed: _pc_tier2Absorbed },
        { phase: 'restAdjustment', shortCount: (_ra_phases.afterExcessVal.rows||[]).filter(r=>r.diff<0).length },
        { phase: 'final', shortCount: _finalShort, maxStaffViolations: _rf_totalViolations, nightOrphans: _rf_nightOrphans },
      ];
      return {
        summary: {
          engine: 'autoGenerate',
          dept: dept.id,
          passBShortCount: _passBShort,
          passCRepairs: _pc_nonSlotFixed + _pc_tier2Absorbed,
          finalShortCount: _finalShort,
          finalMaxStaffViolations: _rf_totalViolations,
          finalNightOrphans: _rf_nightOrphans,
        },
        passA: { snapshot: _pa_rows },
        passB: { snapshot: _pb_snap, shortage: _pb_short, consecCheck: _pb_consec },
        passC: {
          nonSlotFixed: _pc_nonSlotFixed, tier2Absorbed: _pc_tier2Absorbed,
          typeBreakdown: _pc_typeBreakdown,
          residualViolations: _pc_residualViolations, residualSlotProtected: _pc_residualSlotProtected,
          snapshot: _pc_snap, shortage: _pc_short_arr,
        },
        restAdjustment: _ra_phases,
        final: {
          maxStaffViolations: _rf_maxViolations,
          totalViolations: _rf_totalViolations,
          nightOrphans: _rf_nightOrphans,
          nightOrphanList: _rf_nightOrphanList,
          snapshot: _rf_snapshot,
        },
        shortage: null, bestOf: null, hillClimb: null, kyukoRetry: null,
        nightSequence: null, maxStaff: null, minStaff: null,
        repairHistory: _repairHistory,
      };
    })(),
  };
  return { shifts: res, warnings, timelineWarnings, diagnosticReport };
}

// 生成結果のペナルティスコアを計算（低いほど良い）

function scoreShifts(res, ds, dept, days, year, month, shiftTrend = {}) {
  let score = 0;
  const WORK = buildDeptWorkTypes(dept.customShiftDefs);
  const REST = new Set(["休み","希望休"]); // 有休は賃金支払い対象のため休日カウントから除外
  const maxConsec = dept.maxConsecutive || 5;
  const mk = monthKey(year, month);
  const maxStaffSc = {};
  [...new Set(dept.shiftTypes)].forEach(k => { const cd=(dept.customShiftDefs||[]).find(d=>d.key===k);const base=cd?.baseType||k;const def=base==="日勤"?99:1;const saved=dept.maxStaff?.[k];maxStaffSc[k]=(saved!=null&&!(cd&&base==="日勤"&&saved===1))?saved:def; });
  const workShiftTypes = dept.shiftTypes.filter(k => WORK.has(k) && k !== "夜勤");
  for (const s of ds) {
    // kyukoDays 逸脱ペナルティ（ルール内で解決できない場合を許容: 1日ズレごとに10,000点）
    const targetKyuko = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const actualKyuko = Object.values(res[s.id] || {}).filter(v => REST.has(v)).length;
    score += Math.abs(actualKyuko - targetKyuko) * 10000;

    // 連続勤務違反
    let consec = 0;
    for (let d = 1; d <= days; d++) {
      const sh = res[s.id]?.[d];
      if (WORK.has(sh) && sh !== "明け") { consec++; if (consec > maxConsec) score += 100; }
      else consec = 0;
    }
    // 遅番→早番/日勤、日勤→早番 違反
    for (let d = 2; d <= days; d++) {
      const prev = res[s.id]?.[d-1], curr = res[s.id]?.[d];
      { const bad=dept.intervalEnabled&&dept.intervalTargetShifts?.includes(curr)?shiftIntervalHours(prev,curr,dept)<(dept.intervalHours??11):((prev==="遅番"&&(curr==="早番"||curr==="日勤"))||(prev==="日勤"&&curr==="早番")); if(bad) score+=100; }
    }
    // 同一シフト連続ペナルティ（×3強化: 4連=1500, 5連以上=6000/日）
    for (const t of workShiftTypes) {
      let sc = 0;
      for (let d = 1; d <= days; d++) {
        if (res[s.id]?.[d] === t) {
          sc++;
          if (sc === 4) score += 1500;
          else if (sc > 4) score += 6000;
        } else {
          sc = 0;
        }
      }
    }
  }
  // minStaff不足: Semi-Hard / maxStaff超過: Soft-Medium
  for (let d = 1; d <= days; d++) {
    for (const [k, minC] of Object.entries(dept.minStaff || {})) {
      const actual = ds.filter(s => res[s.id]?.[d] === k).length;
      if (actual < minC) score += actual === 0 ? minC * 1000 : (minC - actual) * 300;
    }
    for (const [k, maxC] of Object.entries(maxStaffSc)) {
      if (maxC >= 99) continue;
      const actual = ds.filter(s => res[s.id]?.[d] === k).length;
      if (actual > maxC) score += (actual - maxC) * 150;
    }
  }
  // 公平性ペナルティ: 夜勤回数・土日出勤回数の分散（スタッフ間の不均衡を抑制）
  if (ds.length > 1) {
    const hasNight = dept.shiftTypes.includes('夜勤');
    const REST_F = new Set(['休み', '希望休', '有休', '公休', '休', '明け']);
    let totalNight = 0, totalWeekend = 0;
    const nc = {}, wc = {};
    for (const s of ds) {
      let n = 0, w = 0;
      for (let d = 1; d <= days; d++) {
        const t = res[s.id]?.[d] || '';
        if (hasNight && t === '夜勤') n++;
        const dow = new Date(year, month, d).getDay();
        if ((dow === 0 || dow === 6) && t && !REST_F.has(t)) w++;
      }
      nc[s.id] = n; wc[s.id] = w;
      totalNight += n; totalWeekend += w;
    }
    const avgN = totalNight / ds.length, avgW = totalWeekend / ds.length;
    let varN = 0, varW = 0;
    for (const s of ds) {
      varN += (nc[s.id] - avgN) ** 2;
      varW += (wc[s.id] - avgW) ** 2;
    }
    // 夜勤分散×500、土日分散×200（コア制約に次ぐ優先度）
    if (hasNight) score += (varN / ds.length) * 500;
    score += (varW / ds.length) * 200;
  }
  // 役職制限違反ペナルティ（ルール違反10000点級: 1件=5000点）
  if (dept.roleShiftTypes) {
    for (const s of ds) {
      const ra = dept.roleShiftTypes[s.role];
      if (!ra) continue;
      for (let d = 1; d <= days; d++) {
        const sh = res[s.id]?.[d];
        if (!sh || !WORK.has(sh) || sh === '明け') continue;
        if (!ra.includes(sh)) score += 5000;
      }
    }
  }
  // ★勤務比率乖離ペナルティ（1%乖離ごとに50点: 役職制限5000点より軽い誘導）
  for (const s of ds) {
    const ratio = s.shiftRatio || s.shiftRatioByMonth?.[mk];
    if (!ratio) { continue; }
    const ratioTotal = Object.values(ratio).reduce((sum, v) => sum + (v || 0), 0);
    if (ratioTotal <= 0) { continue; }
    const workCounts = {};
    let totalWork = 0;
    for (let d = 1; d <= days; d++) {
      const sh = res[s.id]?.[d];
      if (!sh || !WORK.has(sh) || sh === '明け') continue;
      workCounts[sh] = (workCounts[sh] || 0) + 1;
      totalWork++;
    }
    if (totalWork === 0) continue;
    let ratioPenalty = 0;
    Object.entries(ratio).forEach(([k, targetRate]) => {
      if (!targetRate || targetRate <= 0) return;
      const targetRatio = targetRate / ratioTotal;
      const actualRatio = (workCounts[k] || 0) / totalWork;
      ratioPenalty += Math.abs(actualRatio - targetRatio) * 100 * 50;
    });
    score += ratioPenalty;
  }
  // ④⑤ 学習適合ペナルティ: 勤務日も休日も含む。1人1日あたり最大100点
  // ルール違反(10000点)を逆転しない範囲で公平性ペナルティ(2000点~)を上回るスケール
  const LEARN_TYPES = new Set(dept.shiftTypes.filter(k => k !== '夜勤' && k !== '明け'));
  const LEARN_REST = new Set(['休み', '希望休']); // 休日パターンもシンクロ率に100%直結
  if (shiftTrend && ds.length > 0) {
    const trendKeys = Object.keys(shiftTrend).filter(k => k !== '_months' && k !== '_monthCounts');
    if (trendKeys.length > 0) {
      for (const s of ds) {
        const tKey = trendKeys.find(k => nameMatch(k, s.name));
        const trend = tKey ? shiftTrend[tKey] : null;
        if (!trend) continue;
        for (let d = 1; d <= days; d++) {
          const shift = res[s.id]?.[d];
          if (!shift) continue;
          const dow = new Date(year, month, d).getDay();
          if (LEARN_TYPES.has(shift)) {
            const dowRate = trend.dowShiftRate?.[dow] ?? null;
            const predictedProb = dowRate
              ? (dowRate[shift] ?? 0)
              : (typeof trend[shift] === 'number' ? trend[shift] : 0);
            score += (1 - predictedProb) * 30; // Excel学習はSoft: 傾向補正として軽く
          } else if (LEARN_REST.has(shift)) {
            const dow6 = (dow + 6) % 7; // dowRestRateは月曜=0インデックスで格納
            const restProb = trend.dowRestRate?.[dow6] ?? null;
            if (restProb != null) score += (1 - restProb) * 30;
          }
        }
      }
    }
  }
  return score;
}

// 局所探索（2-opt swap）: 生成済みシフトのスコアをスワップ改善でさらに下げる

function localSearchImprove(shifts, ds, dept, days, year, month, shiftTrend = {}) {
  if (ds.length < 2) return shifts;
  const res = {};
  for (const s of ds) res[s.id] = { ...(shifts[s.id] || {}) };

  // isBadTransition を再実装（autoGenerate 外から使えるよう）
  const badTrans = (prev, curr) => {
    if (!prev || !curr) return false;
    if (dept.intervalEnabled && dept.intervalTargetShifts?.includes(curr)) {
      return shiftIntervalHours(prev, curr, dept) < (dept.intervalHours ?? 11);
    }
    return (prev === "遅番" && (curr === "早番" || curr === "日勤")) || (prev === "日勤" && curr === "早番");
  };

  // 固定タイプ（夜勤・明けは連鎖が複雑なためスワップ対象外）
  const FIXED = new Set(['希望休', '有休', '夜勤', '明け']);
  // ロック日（希望休・有休・希望勤務が入っている日）
  const mk = monthKey(year, month);
  const locked = {};
  for (const s of ds) {
    const lk = new Set();
    (s.kiboByMonth?.[mk] || []).forEach(d => lk.add(Number(d)));
    (s.yukyuByMonth?.[mk] || []).forEach(d => lk.add(Number(d)));
    Object.keys(s.shiftRequestsByMonth?.[mk] || {}).forEach(d => lk.add(Number(d)));
    locked[s.id] = lk;
  }

  let curScore = scoreShifts(res, ds, dept, days, year, month, shiftTrend);

  for (let pass = 0; pass < 3 && curScore > 0; pass++) {
    let improved = false;
    for (let i = 0; i < ds.length - 1; i++) {
      for (let j = i + 1; j < ds.length; j++) {
        const s1 = ds[i], s2 = ds[j];
        for (let d = 1; d <= days; d++) {
          const v1 = res[s1.id][d] || '', v2 = res[s2.id][d] || '';
          if (v1 === v2) continue;
          if (FIXED.has(v1) || FIXED.has(v2)) continue;
          if (locked[s1.id].has(d) || locked[s2.id].has(d)) continue;
          // 明け翌日は休みのみ許可（夜勤チェーンを壊さない）
          const p1 = res[s1.id][d-1] || '', n1 = res[s1.id][d+1] || '';
          const p2 = res[s2.id][d-1] || '', n2 = res[s2.id][d+1] || '';
          if (p1 === '明け' && v2 !== '休み') continue;
          if (p2 === '明け' && v1 !== '休み') continue;
          // 遷移ルール違反チェック
          if (badTrans(p1, v2) || badTrans(v2, n1)) continue;
          if (badTrans(p2, v1) || badTrans(v1, n2)) continue;
          // 役職制限チェック: スワップ後のシフトが相手役職に許可されているか
          const ra1 = dept.roleShiftTypes?.[s1.role];
          const ra2 = dept.roleShiftTypes?.[s2.role];
          const isRoleWork = (v) => v !== '休み' && v !== '希望休' && v !== '有休' && v !== '明け';
          if (ra1 && isRoleWork(v2) && !ra1.includes(v2)) continue;
          if (ra2 && isRoleWork(v1) && !ra2.includes(v1)) continue;
          // スワップ試行
          res[s1.id][d] = v2; res[s2.id][d] = v1;
          const newScore = scoreShifts(res, ds, dept, days, year, month, shiftTrend);
          if (newScore < curScore) { curScore = newScore; improved = true; }
          else { res[s1.id][d] = v1; res[s2.id][d] = v2; } // 戻す
        }
      }
    }
    if (!improved) break;
  }
  return res;
}

// N回試行して最もスコアが低い（違反が少ない）結果を返す

function bestOfN(staffList, dept, year, month, prevShifts, shiftTrend, n = 30, prevTail = {}) {
  const days = getDays(year, month);
  const ds = staffList.filter(s => s.dept === dept.id);
  let best = null, bestScore = Infinity;
  // 日勤の上限が明示設定されている場合、試行ごとに上限を変えて多様な解を探索
  const nikkinMin = dept.minStaff?.["日勤"] ?? 1;
  const nikkinMax = dept.maxStaff?.["日勤"];
  const useVariation = nikkinMax != null && nikkinMax < 99 && nikkinMax > nikkinMin;
  const range = useVariation ? nikkinMax - nikkinMin : 0;
  for (let i = 0; i < n; i++) {
    let deptVariant = dept;
    if (useVariation) {
      // 試行ごとに日勤の上限を min〜max の範囲でサイクル
      const cap = nikkinMin + (i % (range + 1));
      deptVariant = { ...dept, maxStaff: { ...dept.maxStaff, "日勤": cap } };
    }
    const { shifts, warnings, timelineWarnings, diagnosticReport } = autoGenerate(staffList, deptVariant, year, month, prevShifts, shiftTrend, prevTail);
    // スコアリングは常に元のdeptで評価（公平な比較）
    const score = scoreShifts(shifts, ds, dept, days, year, month, shiftTrend);
    if (score < bestScore) { bestScore = score; best = { shifts, warnings, timelineWarnings, score, diagnosticReport }; }
    if (bestScore === 0) break; // 違反ゼロなら即採用
  }
  // 局所探索（swap改善）: 30回試行の最良案をさらにスコア改善
  if (best && bestScore > 0) {
    const improved = localSearchImprove(best.shifts, ds, dept, days, year, month, shiftTrend);
    const improvedScore = scoreShifts(improved, ds, dept, days, year, month, shiftTrend);
    if (improvedScore < bestScore) { best.shifts = improved; best.score = improvedScore; }
  }
  // 比率達成フィードバック: 実際の勤務比率 vs 目標比率の乖離を記録（次回補正用）
  const mk2 = monthKey(year, month);
  const ratioFeedback = {};
  const dayShiftTypesForFb = dept.shiftTypes.filter(k => k !== '夜勤');
  for (const s of ds) {
    const ratio = s.shiftRatio || s.shiftRatioByMonth?.[mk2] || null;
    if (!ratio || !best?.shifts[s.id]) continue;
    const staffShifts = best.shifts[s.id];
    const workDays = Object.values(staffShifts).filter(v => WORK_TYPES.has(v) && v !== '明け').length;
    if (workDays === 0) continue;
    const correction = {};
    for (const k of dayShiftTypesForFb) {
      const targetRate = ratio[k] ?? 0;
      if (targetRate === 0) continue;
      correction[k] = (Object.values(staffShifts).filter(v => v === k).length / workDays) - targetRate;
    }
    if (Object.keys(correction).length > 0) ratioFeedback[s.id] = correction;
  }
  if (best) best.ratioFeedback = ratioFeedback;
  return best;
}

// ── 時間軸エンジン（N試行 bestOf / 5絶対条件合格候補から最良スコア選択）────────────────────

// ── 手動修正セル検出 ────────────────────────────────────────────────────────
/**
 * 自動生成直後(baseline)と保存時(current)のシフト差分を全シフト種別・全セルで検出する。
 * 戻り値: { [staffId]: number[] }  ← 差分があった日番号の配列
 *
 * 既知の制約（変更は今回スコープ外）:
 *   a. baseline は最後の自動生成直後の1スナップショットのみ保持。再生成で上書きされる。
 *   b. undo操作による戻しも「手動修正」として検出される。
 *   c. 自動生成を行わなかった月は genRef=undefined のため呼び出し元でガードされる。
 *   d. 月切り替え後は lastAutoGenRef がリセットされるため、月をまたぐ差分は取れない。
 */
function detectManualEditCells(baseline, current) {
  const result = {};
  const allStaffIds = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const staffId of allStaffIds) {
    const baseDays = baseline[staffId] || {};
    const currDays = current[staffId] || {};
    const allDays = new Set([...Object.keys(baseDays), ...Object.keys(currDays)]);
    const edited = [];
    for (const dayStr of allDays) {
      if (baseDays[dayStr] !== currDays[dayStr]) edited.push(Number(dayStr));
    }
    if (edited.length > 0) result[staffId] = edited;
  }
  return result;
}

// ── 学習トレンド計算 ─────────────────────────────────────────────────────────
// editData は allDBData の edits_YYYY_M_deptId キーから自動読み取り。
// 人手修正セルには EDIT_WEIGHT=1.5 を乗算して学習に強く反映させる。
const EDIT_WEIGHT = 1.5;

function computeLearnedTrend(allDBData, staffList, exceptionMonths = []) {
  const exceptionSet = new Set(exceptionMonths); // "YYYY-M" 形式（1始まり月）
  const counts = {}, totals = {}, monthSets = {};
  const transitions = {}, transitionTotals = {}; // 遷移確率集計: [staffId][prev][curr]
  const dowShifts = {}; // 曜日別シフト集計: [staffId][dow][shiftType]
  const dowRests = {};   // 曜日別休み集計: [staffId][dow] 重み付きカウント (+6%7: 月=0,日=6)
  const dowTotalsR = {}; // 曜日別総日数:   [staffId][dow] 重み付きカウント (+6%7: 月=0,日=6)
  const REST_DOW_SET = new Set(['休み','希望休','有休']);
  const now = new Date();
  const nowYM = now.getFullYear() * 12 + now.getMonth();
  const WORK_SHIFT_SET = new Set(['早番','日勤','遅番','夜勤']);
  for (const [key2, shifts2] of Object.entries(allDBData)) {
    if (!key2.startsWith('shifts_') || !shifts2 || typeof shifts2 !== 'object') continue;
    for (const ss of Object.values(shifts2)) {
      if (!ss || typeof ss !== 'object') continue;
      for (const sh of Object.values(ss)) { if (sh && typeof sh === 'string' && !['希望休','有休','明け','休み',''].includes(sh)) WORK_SHIFT_SET.add(sh); }
    }
  }
  const WORK_SHIFT_KEYS = [...WORK_SHIFT_SET];
  const TRANS_KEYS = new Set([...WORK_SHIFT_KEYS, '明け','休み','希望休']);
  for (const [key, shifts] of Object.entries(allDBData)) {
    if (!key.startsWith('shifts_') || !shifts || typeof shifts !== 'object') continue;
    // キー形式: shifts_YYYY_M_deptId
    const parts = key.split('_');
    if (parts.length < 4) continue;
    const keyYear = parseInt(parts[1]), keyMonthRaw = parseInt(parts[2]);
    const keyMonth = keyMonthRaw - 1; // 0始まり
    if (isNaN(keyYear) || isNaN(keyMonth)) continue;
    // 例外月はスキップ
    if (exceptionSet.has(`${keyYear}-${keyMonthRaw}`)) continue;
    // 直近ほど重く: 今月=4, 1ヶ月前=3, 2ヶ月前=2, 3ヶ月以前=1
    const monthsAgo = Math.max(0, nowYM - (keyYear * 12 + keyMonth));
    const baseWeight = Math.max(1, 4 - monthsAgo);
    // confirmed_* キーが false（下書き保存のまま）の月は weight を 0.3 倍に抑えて学習を弱める
    // キーが存在しない（旧データ）場合は通常 weight を使用
    const confirmedVal = allDBData['confirmed_' + parts.slice(1).join('_')];
    const weight = confirmedVal === false ? baseWeight * 0.3 : baseWeight;
    const daysInMonth = new Date(keyYear, keyMonthRaw, 0).getDate();
    // 対応する edits_* キーから人手修正セルを取得して高速参照用 Set を構築
    // edits_YYYY_M_deptId = { [staffId]: [day, day, ...] }
    const editEntries = allDBData['edits_' + parts.slice(1).join('_')] || {};
    const editedSet = new Set();
    for (const [sid, days] of Object.entries(editEntries)) {
      for (const d of (days || [])) editedSet.add(`${sid}:${d}`);
    }
    for (const [staffId, staffShifts] of Object.entries(shifts)) {
      if (!staffShifts || typeof staffShifts !== 'object') continue;
      if (!counts[staffId]) { counts[staffId] = {}; totals[staffId] = 0; monthSets[staffId] = new Set(); }
      if (!transitions[staffId]) { transitions[staffId] = {}; transitionTotals[staffId] = {}; }
      if (!dowShifts[staffId]) dowShifts[staffId] = [{},{},{},{},{},{},{}];
      if (!dowTotalsR[staffId]) dowTotalsR[staffId] = [0,0,0,0,0,0,0];
      if (!dowRests[staffId]) dowRests[staffId] = [0,0,0,0,0,0,0];
      monthSets[staffId].add(`${keyYear}-${keyMonth}`);
      for (const [dayStr, shift] of Object.entries(staffShifts)) {
        // dowRestRate用: スキップ前に全シフトを曜日別集計
        if (shift) {
          const dr = parseInt(dayStr);
          if (!isNaN(dr)) {
            const dow2 = (new Date(keyYear, keyMonth, dr).getDay() + 6) % 7;
            const ew = editedSet.has(`${staffId}:${dr}`) ? weight * EDIT_WEIGHT : weight;
            dowTotalsR[staffId][dow2] += ew;
            if (REST_DOW_SET.has(shift)) dowRests[staffId][dow2] += ew;
          }
        }
        if (!shift || ['希望休','有休','明け',''].includes(shift)) continue;
        const d = parseInt(dayStr);
        const ew = (!isNaN(d) && editedSet.has(`${staffId}:${d}`)) ? weight * EDIT_WEIGHT : weight;
        counts[staffId][shift] = (counts[staffId][shift] || 0) + ew;
        totals[staffId] += ew;
        // 曜日別シフト集計
        if (WORK_SHIFT_SET.has(shift)) {
          if (!isNaN(d)) {
            const dow = new Date(keyYear, keyMonth, d).getDay();
            dowShifts[staffId][dow][shift] = (dowShifts[staffId][dow][shift] || 0) + ew;
          }
        }
      }
      // 日別遷移を集計（前日→当日の遷移確率学習）
      // 遷移はペア単位のため editWeight 適用対象外
      for (let d = 2; d <= daysInMonth; d++) {
        const prev = staffShifts[d-1], curr = staffShifts[d];
        if (!prev || !curr || !TRANS_KEYS.has(prev) || !TRANS_KEYS.has(curr) || curr === '有休') continue;
        if (!transitions[staffId][prev]) transitions[staffId][prev] = {};
        transitions[staffId][prev][curr] = (transitions[staffId][prev][curr] || 0) + weight;
        transitionTotals[staffId][prev] = (transitionTotals[staffId][prev] || 0) + weight;
      }
    }
  }
  // ②③ 部署平均を事前計算（スムージング基準: データ豊富スタッフのみ）
  const deptStaffL = staffList.filter(s => counts[s.id] && totals[s.id] >= 10);
  const deptAvgFreqL = {}, deptAvgDowL = Array.from({length:7},()=>({})), deptAvgRestL = [null,null,null,null,null,null,null];
  if (deptStaffL.length > 0) {
    const allShiftKeys = new Set(deptStaffL.flatMap(s => Object.keys(counts[s.id])));
    for (const k of allShiftKeys) {
      deptAvgFreqL[k] = deptStaffL.reduce((s,st)=>s+(counts[st.id][k]||0)/totals[st.id],0)/deptStaffL.length;
    }
    for (let i = 0; i < 7; i++) {
      const totW = deptStaffL.reduce((s,st)=>s+Object.values(dowShifts[st.id]?.[i]||{}).reduce((a,b)=>a+b,0),0);
      const allDK = new Set(deptStaffL.flatMap(s=>Object.keys(dowShifts[s.id]?.[i]||{})));
      for (const k of allDK) { deptAvgDowL[i][k]=totW>0?deptStaffL.reduce((s,st)=>s+(dowShifts[st.id]?.[i]?.[k]||0),0)/totW:0; }
      const totR = deptStaffL.reduce((s,st)=>s+(dowTotalsR[st.id]?.[i]||0),0);
      deptAvgRestL[i] = totR>0 ? deptStaffL.reduce((s,st)=>s+(dowRests[st.id]?.[i]||0),0)/totR : null;
    }
  }
  const result = {}, monthCounts = {};
  for (const staff of staffList) {
    if (!counts[staff.id] || totals[staff.id] < 1) continue; // 完全0件のみスキップ
    const alpha = Math.min(1, totals[staff.id] / 10);
    const freq = {};
    for (const k of new Set([...Object.keys(counts[staff.id]), ...Object.keys(deptAvgFreqL)])) {
      const raw = totals[staff.id] > 0 ? (counts[staff.id][k]||0)/totals[staff.id] : 0;
      freq[k] = raw * alpha + (deptAvgFreqL[k] || 0) * (1 - alpha);
    }
    // 遷移確率はデータ十分なスタッフのみ（スムージング対象外）
    const transitionRate = {};
    if (totals[staff.id] >= 10) {
      for (const [prev, toCounts] of Object.entries(transitions[staff.id] || {})) {
        const tot = transitionTotals[staff.id][prev] || 1;
        transitionRate[prev] = {};
        for (const [curr, cnt] of Object.entries(toCounts)) transitionRate[prev][curr] = cnt / tot;
      }
    }
    // 曜日別シフト確率（薄曜日は部署平均ブレンド）
    const dowShiftRate = (dowShifts[staff.id] || [{},{},{},{},{},{},{}]).map((shiftCounts, i) => {
      const workTot = Object.values(shiftCounts).reduce((s,v)=>s+v,0);
      const da = Math.min(1, workTot / 2);
      const rate = {};
      const dKeys = new Set([...Object.keys(shiftCounts), ...Object.keys(deptAvgDowL[i])]);
      for (const k of dKeys) {
        const raw = workTot > 0 ? (shiftCounts[k]||0)/workTot : 0;
        rate[k] = raw * da + (deptAvgDowL[i][k] || 0) * (1 - da);
      }
      return Object.keys(rate).length > 0 ? rate : null;
    });
    const dowRestRate = (dowTotalsR[staff.id] || [0,0,0,0,0,0,0]).map((tot, i) => {
      if (tot === 0) return deptAvgRestL[i];
      const raw = (dowRests[staff.id]?.[i]||0)/tot, ra = Math.min(1, tot/3);
      return raw * ra + (deptAvgRestL[i] ?? raw) * (1 - ra);
    });
    result[staff.name] = { ...freq, transitionRate, dowShiftRate, dowRestRate };
    monthCounts[staff.name] = monthSets[staff.id].size;
  }
  result._monthCounts = monthCounts; // 動的ブレンド比率の計算用
  return result;
}

/**
 * repairHardConstraints: eiyo部署の公休数・最大連勤をハード制約として修正する。
 *
 * Step1: 既存の勤務種別配分を保持したまま、自由日の休み日数の過不足だけを是正する。
 *   - PassA/B/Cが決めた早番・日勤等の種別はそのまま維持する（全リセット禁止）。
 *   - 休みが不足 → 自由勤務日から均等間隔で選んで休みに変換
 *   - 休みが超過 → 自由休みセルから均等間隔で選んでgetDefaultWork()で勤務に変換
 *
 * Step2: maxConsecutive違反を左→右グリーディで修正（Step1後の実態に基づく）。
 *
 * 注意: 呼び出し元(_runGenerateCore等)への配線は別作業で行う。現状どこからも呼ばれていない。
 */
function repairHardConstraints(dept, res, ds, year, month) {
  if (dept.id !== 'eiyo') return;
  const mk = monthKey(year, month);
  const days = getDays(year, month);
  const REST = new Set(['休み', '希望休', '有休']);
  const maxConsec = dept.maxConsec ?? 5;

  const getDefaultWork = (s) => {
    const ra = dept.roleShiftTypes?.[s.role];
    if (ra?.length > 0) { const w = ra.find(k => !REST.has(k) && k !== '明け'); if (w) return w; }
    const ms = Object.keys(dept.minStaff || {}).filter(k => !REST.has(k) && k !== '明け');
    return ms[0] || '日勤';
  };

  ds.forEach(s => {
    const tgtK = s.kyukoDaysByMonth?.[mk] ?? s.kyukoDays ?? 8;
    const work = getDefaultWork(s);

    // ロック日: 希望休・有給・希望勤務（絶対に変更しない）
    const lockedSet = new Set();
    (s.kiboByMonth?.[mk] || []).forEach(d => lockedSet.add(Number(d)));
    (s.yukyuByMonth?.[mk] || []).forEach(d => lockedSet.add(Number(d)));
    Object.keys(s.shiftRequestsByMonth?.[mk] || {}).forEach(d => lockedSet.add(Number(d)));

    // ロック済みの公休数
    const lockedRest = [...lockedSet].filter(d => REST.has(res[s.id]?.[d])).length;
    // 自由日に配置できる公休枠
    const restBudget = Math.max(0, tgtK - lockedRest);

    // 自由日（ロック外）一覧
    const freeDays = [];
    for (let d = 1; d <= days; d++) { if (!lockedSet.has(d)) freeDays.push(d); }

    // ── Step1: 既存配分を保持したまま、休み日数の過不足だけを是正 ──
    const freeRestDays  = freeDays.filter(d => REST.has(res[s.id]?.[d]));
    const freeWorkDays  = freeDays.filter(d => { const v = res[s.id]?.[d]; return v && !REST.has(v) && v !== '明け'; });
    const curRestCount  = freeRestDays.length;

    if (curRestCount < restBudget) {
      // 不足: 自由勤務日から均等間隔で休みに変換
      const deficit = restBudget - curRestCount;
      const step = freeWorkDays.length / (deficit + 1);
      const used = new Set();
      for (let i = 0; i < deficit; i++) {
        const idx = Math.round((i + 1) * step) - 1;
        const d = freeWorkDays[Math.max(0, Math.min(idx, freeWorkDays.length - 1))];
        if (d !== undefined && !used.has(d)) { res[s.id][d] = '休み'; used.add(d); }
      }
    } else if (curRestCount > restBudget) {
      // 超過: 自由休みセルから勤務に変換（maxStaffの空きを考慮）
      const excess = curRestCount - restBudget;
      const step = freeRestDays.length / (excess + 1);
      // 均等間隔の希望日を先頭に、残りの自由休み日を後続候補に並べる
      const preferred = [];
      for (let i = 0; i < excess; i++) {
        const idx = Math.round((i + 1) * step) - 1;
        const d = freeRestDays[Math.max(0, Math.min(idx, freeRestDays.length - 1))];
        if (d !== undefined && !preferred.includes(d)) preferred.push(d);
      }
      const candidates = [...preferred, ...freeRestDays.filter(d => !preferred.includes(d))];
      // シフト種別kのmaxStaff（scoreShiftsと同じ既定値ロジック）
      const maxStaffOf = (k) => {
        const cd = (dept.customShiftDefs || []).find(c => c.key === k);
        const base = cd?.baseType || k;
        const def = base === '日勤' ? 99 : 1;
        const saved = dept.maxStaff?.[k];
        return (saved != null && !(cd && base === '日勤' && saved === 1)) ? saved : def;
      };
      const hasRoom = (d, k) => ds.filter(o => res[o.id]?.[d] === k).length < maxStaffOf(k);
      // このスタッフが入れる勤務種別（roleShiftTypes制限を尊重）
      const ra = dept.roleShiftTypes?.[s.role];
      const allowedWork = (ra?.length > 0 ? ra : (dept.shiftTypes || [work]))
        .filter(k => !REST.has(k) && k !== '明け' && k !== '夜勤');
      const altTypes = allowedWork.filter(k => k !== work);
      const used = new Set();
      for (let i = 0; i < excess; i++) {
        // 1) デフォルト種別に空きのある日を優先
        const d1 = candidates.find(c => !used.has(c) && hasRoom(c, work));
        if (d1 !== undefined) { res[s.id][d1] = work; used.add(d1); continue; }
        // 2) 別の許可種別に空きのある日
        let placed = false;
        for (const c of candidates) {
          if (used.has(c)) continue;
          const alt = altTypes.find(k => hasRoom(c, k));
          if (alt) { res[s.id][c] = alt; used.add(c); placed = true; break; }
        }
        if (placed) continue;
        // 3) 全候補が埋まっている場合のみ従来動作（違反はvalidateの警告に残す）
        const d3 = candidates.find(c => !used.has(c));
        if (d3 !== undefined) { res[s.id][d3] = work; used.add(d3); }
      }
    }
    // 一致している場合は何もしない（既存配分をそのまま維持）

    // ── Step2: maxConsecを守るために必須な休みを配置（左→右グリーディ）──
    // Step1後の実態に基づいて連勤を計算し直す
    let streak = 0;
    for (let d = 1; d <= days; d++) {
      const v = res[s.id]?.[d];
      const isWork = v && !REST.has(v) && v !== '明け';
      if (!isWork) { streak = 0; continue; }
      streak++;
      if (streak > maxConsec && !lockedSet.has(d)) {
        res[s.id][d] = '休み';
        streak = 0;
      }
    }
  });
}

export {
  REST_TYPES,
  WORK_TYPES,
  buildDeptWorkTypes,
  buildDeptRestTypes,
  isCustomTimeDept,
  timeToMins,
  buildDayIntervals,
  coverageGaps,
  DEFAULT_SHIFT_TIMES,
  getShiftEndTime,
  getShiftStartTime,
  shiftIntervalHours,
  getDays,
  monthKey,
  normName,
  nameMatch,
  buildNightSet,
  buildSlotManagedTypes,
  isNikkinBase,
  isBadTransition,
  isSlotManaged,
  shouldProtectSlot,
  consecWork,
  consecRest,
  consecRestFwd,
  canRest,
  NSO_canAssignInitial,
  NSO_checkC3,
  NSO_propagateConstraints,
  NSO_computeCost,
  NSO_canSwap,
  autoGenerate,
  scoreShifts,
  localSearchImprove,
  bestOfN,
  detectManualEditCells,
  computeLearnedTrend,
  EDIT_WEIGHT,
  repairHardConstraints
};
