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

    let shiftTable = "";
    for (const s of staffInDept) {
      const row = Array.from({ length: days }, (_, i) => {
        const v = ((shifts || {})[s.id] || {})[i + 1] || "－";
        return SHIFT_SHORT[v] || v;
      }).join("");
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
      "シフト表の読み方: 早=早番 日=日勤 遅=遅番 夜=夜勤 明=明け 休=休み 希=希望休 有=有休 －=未設定\n\n" +
      "必ずJSON形式のみで返答（前後に説明文不要）:\n" +
      '{"changes":[{"staffId":"スタッフID","day":日付番号,"shift":"シフト種別"}],"explanation":"変更内容の説明"}\n' +
      '変更不要なら: {"changes":[],"explanation":"変更不要です"}';

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
        max_tokens: 1024,
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

    try {
      return res.status(200).json(JSON.parse(match[0]));
    } catch (e) {
      return res.status(500).json({ error: "AI応答のJSONパース失敗: " + e.message, raw: match[0] });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || "不明なエラー" });
  }
}
