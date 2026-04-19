export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { shifts, staffList, dept, instruction, year, month } = req.body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY が設定されていません" });
    }

    const days = new Date(year, month, 0).getDate();
    const staffInDept = (staffList || []).filter((s) => s.dept === dept.id);

    const SHIFT_SHORT = {
      "早番": "早", "日勤": "日", "遅番": "遅", "夜勤": "夜",
      "明け": "明", "休み": "休", "希望休": "希", "有休": "有",
    };

    const headerDays = Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, "0")).join("|");
    let shiftTable = "日付: " + headerDays + "\n";
    for (const s of staffInDept) {
      const row = Array.from({ length: days }, (_, i) => {
        const v = ((shifts || {})[s.id] || {})[i + 1] || "－";
        const short = SHIFT_SHORT[v] || v;
        return short.padStart(2, " ");
      }).join("|");
      shiftTable += s.name + "(" + s.role + ")[ID:" + s.id + "]: " + row + "\n";
    }

    const systemPrompt =
      "あなたは介護施設のシフト管理AIです。与えられた月次シフト表を指示に従い、最小限の変更で調整してください。\n\n" +
      "厳守ルール（夜勤セット＝3日連続の不可分ブロック）：\n" +
      "- 夜勤の翌日は必ず「明け」、明けの翌日は必ず「休み」\n" +
      "- 「明け」は必ず前日が「夜勤」でなければならない（単独配置禁止）\n" +
      "- 夜勤を削除/変更する場合、翌日の「明け」と翌々日の「休み」も必ずセットで変更する\n" +
      "- 明けを削除する場合、前日の「夜勤」も必ず同時に削除する\n" +
      "- 「夜勤明け削除」「夜勤セット削除」と指示されたら、該当の夜勤・明け・休み3日分すべてを休みに変更\n" +
      "- 変更は指示に関係するスタッフのみ\n" +
      "- 利用可能なシフト種別: " + (dept.shiftTypes || []).join("、") + "、明け、休み\n\n" +
      "シフト表の読み方: 早=早番 日=日勤 遅=遅番 夜=夜勤 明=明け 休=休み 希=希望休 有=有休 －=未設定\n" +
      "シフト表は「日付: 01|02|03|...」の行で日付番号を示し、各スタッフ行の同じ位置がその日のシフト。日付番号を絶対に間違えないこと。\n\n" +
      "【ペア固定ルール抽出】指示が複数スタッフの相関（例：「Aが夜勤の日はBを早番」「Aが夜勤の翌日はBを休み」）を含む場合、rules配列に構造化して出力：\n" +
      '  {"type":"pair","triggerStaffId":"A_ID","triggerShift":"夜勤","targetStaffId":"B_ID","targetShift":"早番","offset":0}\n' +
      "  offset: 0=同日, 1=翌日, -1=前日。該当しない指示なら rules は空配列[]。\n\n" +
      "必ずJSON形式のみで返答（前後に説明文不要）:\n" +
      '{"changes":[{"staffId":"スタッフID","day":日付番号,"shift":"シフト種別"}],"rules":[],"explanation":"変更内容の説明"}\n' +
      '変更不要なら: {"changes":[],"rules":[],"explanation":"変更不要です"}';

    const userPrompt =
      "【" + year + "年" + month + "月 シフト表 / " + dept.label + "】\n" +
      shiftTable + "\n【指示】\n" + instruction;

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(500).json({ error: "Anthropic API " + apiRes.status + ": " + errText });
    }

    const aiData = await apiRes.json();
    const text = (aiData.content && aiData.content[0] && aiData.content[0].text) || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(500).json({ error: "AIの応答からJSONを抽出できませんでした", raw: text });
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return res.status(500).json({ error: "AI応答のJSONパース失敗: " + e.message, raw: match[0] });
    }

    const validated = validateAndRepair(parsed, shifts, staffInDept, days, dept);
    return res.status(200).json(validated);
  } catch (err) {
    return res.status(500).json({ error: err.message || "不明なエラー" });
  }
}

function validateAndRepair(aiResult, originalShifts, staffInDept, days, dept) {
  const SHIFT_NORMALIZE = {
    "早": "早番", "早番": "早番",
    "日": "日勤", "日勤": "日勤",
    "遅": "遅番", "遅番": "遅番",
    "夜": "夜勤", "夜勤": "夜勤",
    "明": "明け", "明け": "明け",
    "休": "休み", "休み": "休み", "公": "休み", "公休": "休み",
    "希": "希望休", "希望休": "希望休",
    "有": "有休", "有休": "有休", "有給": "有休",
  };
  const VALID_SHIFTS = new Set(Object.values(SHIFT_NORMALIZE));
  const normalize = (v) => {
    if (v === null || v === undefined || v === "") return "";
    const s = String(v).trim();
    if (SHIFT_NORMALIZE[s]) return SHIFT_NORMALIZE[s];
    if (VALID_SHIFTS.has(s)) return s;
    return s;
  };

  const rawChanges = Array.isArray(aiResult.changes) ? aiResult.changes : [];
  const aiChanges = rawChanges
    .filter((c) => c && c.staffId && c.day)
    .map((c) => ({ staffId: c.staffId, day: c.day, shift: normalize(c.shift) }));

  const affectedStaffIds = new Set(aiChanges.map((c) => c.staffId));

  const simulated = {};
  for (const s of staffInDept) {
    simulated[s.id] = { ...((originalShifts || {})[s.id] || {}) };
  }
  for (const c of aiChanges) {
    if (!simulated[c.staffId]) simulated[c.staffId] = {};
    simulated[c.staffId][c.day] = c.shift || "";
  }

  const PROTECTED = new Set(["希望休", "有休"]);
  const repairs = [];
  const repairNotes = [];

  const rawRules = Array.isArray(aiResult.rules) ? aiResult.rules : [];
  const staffIdSet = new Set(staffInDept.map((s) => s.id));
  const pairRules = rawRules
    .filter((r) => r && r.type === "pair" && staffIdSet.has(r.triggerStaffId) && staffIdSet.has(r.targetStaffId))
    .map((r) => ({
      triggerStaffId: r.triggerStaffId,
      triggerShift: normalize(r.triggerShift),
      targetStaffId: r.targetStaffId,
      targetShift: normalize(r.targetShift),
      offset: Number.isFinite(r.offset) ? r.offset : 0,
    }));

  for (const rule of pairRules) {
    const trigRow = simulated[rule.triggerStaffId] || {};
    const tgtRow = simulated[rule.targetStaffId] || {};
    affectedStaffIds.add(rule.targetStaffId);
    if (!simulated[rule.targetStaffId]) simulated[rule.targetStaffId] = tgtRow;

    for (let d = 1; d <= days; d++) {
      if (trigRow[d] !== rule.triggerShift) continue;
      const td = d + rule.offset;
      if (td < 1 || td > days) continue;
      const current = tgtRow[td];
      if (current === rule.targetShift) continue;
      if (PROTECTED.has(current)) continue;
      if (current === "夜勤" || current === "明け") continue;

      tgtRow[td] = rule.targetShift;
      repairs.push({ staffId: rule.targetStaffId, day: td, shift: rule.targetShift });
      repairNotes.push(td + "日の" + shortName(staffInDept, rule.targetStaffId) + "を" + rule.targetShift + "に補完（ペア固定）");
    }
  }

  for (const staffId of affectedStaffIds) {
    const row = simulated[staffId] || {};

    for (let d = 1; d <= days; d++) {
      const cur = row[d];
      const next = row[d + 1];
      const prev = row[d - 1];

      if (cur === "夜勤" && d < days && next !== "明け" && !PROTECTED.has(next)) {
        row[d + 1] = "明け";
        repairs.push({ staffId, day: d + 1, shift: "明け" });
        repairNotes.push(d + 1 + "日を明けに自動補完（夜勤の翌日）");
      }

      if (cur === "明け" && prev !== "夜勤") {
        if (!PROTECTED.has(cur)) {
          row[d] = "休み";
          repairs.push({ staffId, day: d, shift: "休み" });
          repairNotes.push(d + "日の孤立した明けを休みに修正");
        }
      }

      if (cur === "明け" && d < days && next !== "休み" && !PROTECTED.has(next)) {
        row[d + 1] = "休み";
        repairs.push({ staffId, day: d + 1, shift: "休み" });
        repairNotes.push(d + 1 + "日を休みに自動補完（明けの翌日）");
      }
    }
  }

  const mergedMap = new Map();
  for (const c of aiChanges) {
    if (!c || !c.staffId || !c.day) continue;
    mergedMap.set(c.staffId + ":" + c.day, c);
  }
  for (const r of repairs) {
    mergedMap.set(r.staffId + ":" + r.day, r);
  }
  const mergedChanges = Array.from(mergedMap.values());

  let explanation = aiResult.explanation || "";
  if (repairNotes.length > 0) {
    explanation += "\n【自動補完】" + repairNotes.join("、");
  }

  const minStaff = (dept && dept.minStaff) ? dept.minStaff : {};
  const staffingWarnings = [];
  if (Object.keys(minStaff).length > 0) {
    for (let d = 1; d <= days; d++) {
      for (const [shiftType, minCount] of Object.entries(minStaff)) {
        if (!minCount) continue;
        const actual = staffInDept.filter((s) => {
          const merged = mergedMap.get(s.id + ":" + d);
          const shift = merged ? merged.shift : ((originalShifts || {})[s.id] || {})[d] || "";
          return shift === shiftType;
        }).length;
        if (actual < minCount) {
          staffingWarnings.push(d + "日 " + shiftType + "：" + actual + "名（最低" + minCount + "名）");
        }
      }
    }
  }

  if (staffingWarnings.length > 0) {
    explanation += "\n【配置不足警告】" + staffingWarnings.slice(0, 10).join("、");
    if (staffingWarnings.length > 10) {
      explanation += "…他" + (staffingWarnings.length - 10) + "件";
    }
  }

  return { changes: mergedChanges, explanation, staffingWarnings };
}

function shortName(staffInDept, id) {
  const s = staffInDept.find((x) => x.id === id);
  return s ? s.name : id;
}
