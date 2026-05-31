#!/usr/bin/env python3
"""P4-③: Extract applyMinimalChangePhase1 & recomputeGenerateWarnings, delete 12,466-line diagnostic block"""

with open('/home/user/shift-app/src/App.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

original_count = len(lines)
print(f"Original lines: {original_count}")

def find_line(lines, substring, start=0):
    for i in range(start, len(lines)):
        if substring in lines[i]:
            return i
    return -1

# ─── Two new module-level functions ──────────────────────────────────────────

FUNC_BLOCK = """\
function applyMinimalChangePhase1(result, genSnapshot, ds, cd, year, month) {
  const days     = getDays(year, month);
  const cds      = cd.customShiftDefs || [];
  const work     = buildDeptWorkTypes(cds);
  const maxC     = cd.maxConsecutive || 5;
  const maxS     = {};
  const nightSet = new Set();
  [...new Set(cd.shiftTypes || [])].forEach(k => {
    const c2   = cds.find(c3 => c3.key === k);
    const base = c2?.baseType || k;
    const def  = base === '日勤' ? 99 : 1;
    const sv   = cd.maxStaff?.[k];
    const ms   = (sv != null && !(c2 && base === '日勤' && sv === 1)) ? sv : def;
    maxS[k] = ms;
    if (base === '夜勤') nightSet.add(k);
  });
  const bad = (prev, curr) => {
    if (!prev || !curr || cd.intervalThreshold != null) return false;
    return (prev === '遅番' && (curr === '早番' || curr === '日勤')) ||
           (prev === '日勤' && curr === '早番');
  };
  const consec = (shifts, sid, d, ovSid, ovDay, ovVal) => {
    let c = 0;
    for (let i = d; i >= 1; i--) {
      const sh = (ovSid === sid && ovDay === i) ? ovVal : (shifts[sid]?.[i] ?? '');
      if (work.has(sh)) c++; else break;
    }
    return c;
  };
  const dayM = (shifts, d, ovSid, ovDay, ovVal) => {
    let bt = 0, cv = 0, sv = 0, sh = 0;
    for (const s of ds) {
      const shP = (ovSid === s.id && ovDay === d-1) ? ovVal : (shifts[s.id]?.[d-1] ?? '');
      const shC = (ovSid === s.id && ovDay === d)   ? ovVal : (shifts[s.id]?.[d] ?? '');
      if (d > 1 && bad(shP, shC)) bt++;
      if (work.has(shC) && shC !== '明け' && consec(shifts, s.id, d, ovSid, ovDay, ovVal) > maxC) cv++;
    }
    for (const [k, lim] of Object.entries(maxS)) {
      if (lim >= 99) continue;
      const cnt = ds.filter(s => ((ovSid === s.id && ovDay === d) ? ovVal : (shifts[s.id]?.[d] ?? '')) === k).length;
      if (cnt > lim) sv++;
    }
    for (const [k, min] of Object.entries(cd.minStaff || {})) {
      const cnt = ds.filter(s => ((ovSid === s.id && ovDay === d) ? ovVal : (shifts[s.id]?.[d] ?? '')) === k).length;
      if (cnt < min) sh++;
    }
    return bt + cv + sv + sh;
  };
  const tier1ok = (sid, day, revVal) => {
    for (const [k, min] of Object.entries(cd.minStaff || {})) {
      if (min <= 0) continue;
      const cnt = ds.filter(s => ((s.id === sid) ? (revVal ?? '') : (result[s.id]?.[day] ?? '')) === k).length;
      if (cnt < min) return false;
    }
    return true;
  };
  const cands = [];
  for (const s of ds) {
    for (let d = 1; d <= days; d++) {
      const bv = genSnapshot[s.id]?.[d] ?? '';
      const av = result[s.id]?.[d] ?? '';
      if (bv === av) continue;
      const revVal = bv || undefined;
      const dayImp = dayM(genSnapshot, d) - dayM(result, d);
      if (dayImp > 0) continue;
      const mOrig = dayM(result, d) + (d < days ? dayM(result, d+1) : 0);
      const mRev  = dayM(result, d, s.id, d, revVal) + (d < days ? dayM(result, d+1, s.id, d, revVal) : 0);
      if (mRev > mOrig) continue;
      cands.push({ sid: s.id, name: s.name, day: d, revVal });
    }
  }
  cands.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  for (const { sid, day, revVal } of cands) {
    if ((result[sid]?.[day] ?? '') === (revVal ?? '')) continue;
    // guard①: revVal∉nightSet かつ 翌日=明け
    if (day < days && (result[sid]?.[day+1] ?? '') === '明け' && !nightSet.has(revVal ?? '')) continue;
    // guard②: revVal=明け かつ 前日∉nightSet
    if ((revVal ?? '') === '明け' && !nightSet.has(result[sid]?.[day-1] ?? '')) continue;
    // guard③: result[day]=明け かつ 前日∈nightSet かつ revVal≠明け
    if ((result[sid]?.[day] ?? '') === '明け' && day > 1 && nightSet.has(result[sid]?.[day-1] ?? '') && (revVal ?? '') !== '明け') continue;
    if (!tier1ok(sid, day, revVal)) continue;
    const mOrig = dayM(result, day) + (day < days ? dayM(result, day+1) : 0);
    const mRev  = dayM(result, day, sid, day, revVal) + (day < days ? dayM(result, day+1, sid, day, revVal) : 0);
    if (mRev <= mOrig) {
      if (!result[sid]) result[sid] = {};
      result[sid][day] = revVal !== undefined ? revVal : '';
    }
  }
}

function recomputeGenerateWarnings(result, ds, cd, year, month, warnings, score, timelineWarnings, setGenerateWarnings) {
  const days = getDays(year, month);
  const finalWarnings = {};
  for (const [shiftKey, minCount] of Object.entries(cd.minStaff || {})) {
    if (minCount <= 0) continue;
    for (let d = 1; d <= days; d++) {
      const actual = ds.filter(s => (result[s.id]?.[d] ?? '') === shiftKey).length;
      if (actual < minCount) {
        if (!finalWarnings[shiftKey]) finalWarnings[shiftKey] = { days: 0, maxShort: 0 };
        finalWarnings[shiftKey].days++;
        finalWarnings[shiftKey].maxShort = Math.max(finalWarnings[shiftKey].maxShort, minCount - actual);
      }
    }
  }
  const displayWarnings = Object.keys(finalWarnings).length > 0 ? finalWarnings : warnings;
  if (Object.keys(displayWarnings).length > 0) {
    setGenerateWarnings({ warnings: displayWarnings, deptLabel: cd.label, score, timelineWarnings });
  }
}

"""

# ─── Step 1: Insert functions before "export default function App()" ─────────

idx_app = find_line(lines, 'export default function App() {')
print(f"App() at line {idx_app+1}")

func_lines = FUNC_BLOCK.splitlines(keepends=True)
lines = lines[:idx_app] + func_lines + lines[idx_app:]
n_inserted = len(func_lines)
print(f"Inserted {n_inserted} lines (two functions) before App()")

# ─── Step 2: Replace diagnostic block with 3-line call ───────────────────────
# All subsequent searches run on the modified lines list (line numbers shifted by n_inserted)

# Find setUndoCount line inside handleGenerate
idx_undo = find_line(lines, 'setUndoCount(undoStackRef.current[cd.id].length);')
print(f"setUndoCount at line {idx_undo+1}")

# Line at idx_undo+1 is the blank line after setUndoCount
# Line at idx_undo+2 is "// ═══ divider ═══" = first diagnostic line → start of deletion
idx_diag_start = idx_undo + 2
print(f"Diagnostic block start at line {idx_diag_start+1}")

# Find the Temporal-Console-UI marker (start of what must be kept)
idx_temporal = find_line(lines, '// ══ [Temporal-Console-UI] ══', idx_undo)
print(f"Temporal-Console-UI at line {idx_temporal+1}")

# Replacement: 3 call lines  (blank line before already kept at idx_undo+1)
CALLS = [
    '        const _p1_ds = cs.filter(s => s.dept === cd.id);\n',
    '        applyMinimalChangePhase1(result, genSnapshot, _p1_ds, cd, year, month);\n',
    '        recomputeGenerateWarnings(result, _p1_ds, cd, year, month, warnings, score, timelineWarnings, setGenerateWarnings);\n',
    '\n',
]

# Keep: lines up to and including the blank line after setUndoCount
# Delete: idx_diag_start .. idx_temporal-1
# Keep: idx_temporal onwards
lines = lines[:idx_diag_start] + CALLS + lines[idx_temporal:]

final_count = len(lines)
deleted = original_count + n_inserted - final_count + n_inserted
print(f"\nOriginal: {original_count}")
print(f"Functions inserted: +{n_inserted}")
print(f"Diagnostic block deleted: -{original_count + n_inserted - final_count}")
print(f"Final lines: {final_count}")
print(f"Net change from original: {final_count - original_count}")

with open('/home/user/shift-app/src/App.jsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done.")
