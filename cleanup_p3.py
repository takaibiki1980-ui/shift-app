#!/usr/bin/env python3
"""P3-② cleanup script: Phase A + Phase B deletions in App.jsx"""

import re

with open('/home/user/shift-app/src/App.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

original_count = len(lines)
print(f"Original lines: {original_count}")

# ─── helper ──────────────────────────────────────────────────────────────────
def find_line(lines, substring, start=0):
    """Return 0-based index of first line containing substring, starting from start."""
    for i in range(start, len(lines)):
        if substring in lines[i]:
            return i
    return -1

def delete_lines(lines, start_idx, end_idx):
    """Delete lines[start_idx:end_idx+1] (inclusive)."""
    return lines[:start_idx] + lines[end_idx+1:]

# ─── Phase A ─────────────────────────────────────────────────────────────────

# A-1: Delete detectSwapChanges + mergeSwapLearning (including comment)
# Pattern: comment line "// スワップ成功パターン: 自動生成結果" through end of mergeSwapLearning "}"
idx_swap_comment = find_line(lines, '// スワップ成功パターン: 自動生成結果 vs 保存済みシフトのdiffを検出')
idx_swap_end = find_line(lines, '  return result;', idx_swap_comment)
# mergeSwapLearning ends with "}" on the line after "  return result;"
idx_swap_end = find_line(lines, '}', idx_swap_end)
print(f"A-1: detectSwapChanges comment at line {idx_swap_comment+1}, end at {idx_swap_end+1}")
lines = delete_lines(lines, idx_swap_comment, idx_swap_end)

# A-2: Delete DEV_TEMPORAL_LOG block (4 lines: divider + comment + const + divider)
idx_dev_log = find_line(lines, 'const DEV_TEMPORAL_LOG = process.env.NODE_ENV')
# The block: divider line before, comment line, const line, divider line after
# Find the start divider (line before the comment about Temporal Debug Flag)
idx_dev_comment = find_line(lines, 'Temporal Debug Flag')
idx_dev_start = idx_dev_comment - 1  # the ─── divider line
idx_dev_end = idx_dev_log + 1  # the closing divider
print(f"A-2: DEV_TEMPORAL_LOG block lines {idx_dev_start+1}-{idx_dev_end+1}")
lines = delete_lines(lines, idx_dev_start, idx_dev_end)

# A-3: Delete console.log('[paste detect] totalShiftCells:', ...)
idx = find_line(lines, "console.log('[paste detect] totalShiftCells:'")
print(f"A-3: paste detect log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-4: Delete isMergingKibo useRef
idx = find_line(lines, 'const isMergingKibo = useRef(false)')
print(f"A-4: isMergingKibo at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-5: Delete console.log('[sync] depts 保存OK')
idx = find_line(lines, "console.log('[sync] depts 保存OK')")
print(f"A-5: sync depts at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-6: Delete console.log('[sync] staffList 保存OK')
idx = find_line(lines, "console.log('[sync] staffList 保存OK')")
print(f"A-6: sync staffList at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-7: Delete console.log('[Migration] facilityYears...')
idx = find_line(lines, "console.log('[Migration] facilityYears/floorYears")
print(f"A-7: Migration facilityYears at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-8: Delete Phase S-5 comment + iteSchedulerRef (2 lines)
idx_s5 = find_line(lines, '// ── Phase S-5: Incremental Temporal Engine Architecture')
idx_ite = find_line(lines, 'const iteSchedulerRef = useRef(null)', idx_s5)
print(f"A-8: iteSchedulerRef block lines {idx_s5+1}-{idx_ite+1}")
lines = delete_lines(lines, idx_s5, idx_ite)

# A-9: Delete inline console.log in roleShiftTypes migration .then()
# Line: .then(({error}) => { if (!error) console.log('[migration] roleShiftTypes をDBへ復元保存しました'); });
idx = find_line(lines, "console.log('[migration] roleShiftTypes")
if idx >= 0:
    # Replace the log content but keep the structure → simplest: remove just the console.log
    lines[idx] = lines[idx].replace(
        "if (!error) console.log('[migration] roleShiftTypes をDBへ復元保存しました'); ",
        ""
    )
    print(f"A-9: roleShiftTypes migration log at line {idx+1} (edited inline)")

# A-10: Delete console.log("[setAllShifts]", "reason=initial_load", ...)
idx = find_line(lines, '"reason=initial_load"')
print(f"A-10: initial_load log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-11: Delete console.log("[setAllShifts]", "reason=initial_load_legacy", ...)
idx = find_line(lines, '"reason=initial_load_legacy"')
print(f"A-11: initial_load_legacy log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-12: Delete console.log("[RT_GUARD] BLOCKED by pasteTimestamp", ...)
idx = find_line(lines, '"[RT_GUARD] BLOCKED by pasteTimestamp"')
print(f"A-12: RT_GUARD log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-13: Delete console.log("[setAllShifts]", "reason=realtime_update", ...)
idx = find_line(lines, '"reason=realtime_update"')
print(f"A-13: realtime_update log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-14: Delete console.log("[setAllShifts]", "reason=realtime_update_legacy", ...)
idx = find_line(lines, '"reason=realtime_update_legacy"')
print(f"A-14: realtime_update_legacy log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-15: Delete console.log("[setAllShifts]", "reason=month_clear", ...)
idx = find_line(lines, '"reason=month_clear"')
print(f"A-15: month_clear log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-16: Delete console.log("[setAllShifts]", "reason=month_load_supabase", ...)
idx = find_line(lines, '"reason=month_load_supabase"')
print(f"A-16: month_load_supabase log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-17: Transform swapLearning write block
# Find the comment line "// スワップ成功パターン: 生成後に手動で変更されたシフトを学習"
idx_comment = find_line(lines, '// スワップ成功パターン: 生成後に手動で変更されたシフトを学習')
# Find the closing "}" of the "if (genRef)" block (lastAutoGenRef.current line + 1 line after)
idx_lastAutoGen = find_line(lines, 'lastAutoGenRef.current[currentDeptId] = {...deptData};', idx_comment)
idx_if_close = find_line(lines, '}', idx_lastAutoGen)
print(f"A-17: swapLearning block lines {idx_comment+1}-{idx_if_close+1}")

# Replace the entire block with the kiboNightPreference-only version
new_swap_block = """        const genRef = lastAutoGenRef.current[currentDeptId];
        if (genRef) {
          const deptStaff = staffListRef.current.filter(s => s.dept === currentDeptId);
          const kiboPatterns = detectKiboNightPatterns(genRef, deptData, deptStaff, year, month);
          if (Object.keys(kiboPatterns).length > 0) {
            setStaffList(prev => prev.map(s => {
              if (!kiboPatterns[s.id]) return s;
              return {
                ...s,
                kiboNightPreference: Math.min(20, (s.kiboNightPreference || 0) + kiboPatterns[s.id]),
              };
            }));
          }
          lastAutoGenRef.current[currentDeptId] = {...deptData};
        }
"""
lines = lines[:idx_comment] + [new_swap_block] + lines[idx_if_close+1:]

# A-18: Delete console.log("[setAllShifts]", "reason=user_edit", ...)
idx = find_line(lines, '"reason=user_edit"')
print(f"A-18: user_edit log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-19: Delete console.log("[setAllShifts]", "reason=auto_generate", ...)
idx = find_line(lines, '"reason=auto_generate"')
print(f"A-19: auto_generate log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-20: Delete console.log("[setAllShifts]", "reason=undo", ...)
idx = find_line(lines, '"reason=undo"')
print(f"A-20: undo log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-21: Delete inline console.log in handleDeleteDept
# Line contains: setAllShifts(prev=>{console.log("[setAllShifts]","reason=dept_delete",...)
idx = find_line(lines, '"reason=dept_delete"')
if idx >= 0:
    # Remove just the console.log call from the inline lambda
    lines[idx] = lines[idx].replace(
        'setAllShifts(prev=>{console.log("[setAllShifts]","reason=dept_delete",{deptId,stack:new Error().stack});const n={...prev};delete n[deptId];return n;})',
        'setAllShifts(prev=>{const n={...prev};delete n[deptId];return n;})'
    )
    print(f"A-21: dept_delete log at line {idx+1} (edited inline)")

# A-22: Delete console.log("[PASTE_APPLY]", pastedShifts)
idx = find_line(lines, 'console.log("[PASTE_APPLY]"')
print(f"A-22: PASTE_APPLY log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-23: Delete console.log("[setAllShifts]","reason=paste_apply",...)
idx = find_line(lines, '"reason=paste_apply"')
print(f"A-23: paste_apply log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# A-24: Delete console.log("[setAllShifts]", "reason=history_restore", ...)
idx = find_line(lines, '"reason=history_restore"')
print(f"A-24: history_restore log at line {idx+1}")
lines = delete_lines(lines, idx, idx)

# ─── Phase B ─────────────────────────────────────────────────────────────────

# B-1: Delete autoGenerate diagnostic blocks (AG-Trend through AG-NightCore)
# Start: line with "// ★[AG-Trend] Trend学習実効性検証ログ" (and its leading separator)
# The separator line right before starts with "  // ══"
idx_ag_trend_comment = find_line(lines, '// ★[AG-Trend] Trend学習実効性検証ログ')
# The separator is on idx_ag_trend_comment - 1
idx_diag_start = idx_ag_trend_comment - 1
# End: line with "// ══ [AG-Pair-Effect] 診断ログ ここまで ══" + the blank line after
idx_diag_end_comment = find_line(lines, '// ══ [AG-Pair-Effect] 診断ログ ここまで ══')
# Check if next line is blank
if idx_diag_end_comment + 1 < len(lines) and lines[idx_diag_end_comment + 1].strip() == '':
    idx_diag_end = idx_diag_end_comment + 1
else:
    idx_diag_end = idx_diag_end_comment
print(f"B-1: Diagnostic blocks from line {idx_diag_start+1} to {idx_diag_end+1}")
lines = delete_lines(lines, idx_diag_start, idx_diag_end)

# ─── Write result ────────────────────────────────────────────────────────────
final_count = len(lines)
print(f"\nFinal lines: {final_count}")
print(f"Deleted: {original_count - final_count} lines")

with open('/home/user/shift-app/src/App.jsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done.")
