const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // req.json() が失敗するケースに備えてテキストで受け取ってからパース
    const rawText = await req.text();
    if (!rawText) throw new Error("リクエストボディが空です");
    const { shifts, staffList, dept, instruction, year, month } = JSON.parse(rawText);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");

    const days = new Date(year, month, 0).getDate();
    const staffInDept = (staffList as { id: string; name: string; role: string; dept: string }[])
      .filter((s) => s.dept === dept.id);

    const SHIFT_SHORT: Record<string, string> = {
      早番: "早", 日勤: "日", 遅番: "遅", 夜勤: "夜",
      明け: "明", 休み: "休", 希望休: "希", 有休: "有",
    };

    let shiftTable = "";
    for (const s of staffInDept) {
      const row = Array.from({ length: days }, (_, i) => {
        const v = ((shifts as Record<string, Record<number, string>>)[s.id] ?? {})[i + 1] ?? "－";
        return SHIFT_SHORT[v] ?? v;
      }).join("");
      shiftTable += `${s.name}(${s.role})[ID:${s.id}]: ${row}\n`;
    }

    const systemPrompt = `あなたは介護施設のシフト管理AIです。
与えられた月次シフト表を指示に従い、最小限の変更で調整してください。

厳守ルール：
- 夜勤の翌日は必ず「明け」にする
- 明けの翌日は必ず「休み」にする
- 変更は指示に関係するスタッフのみ
- 利用可能なシフト種別: ${(dept.shiftTypes as string[]).join("、")}、明け、休み

シフト表の読み方: 早=早番 日=日勤 遅=遅番 夜=夜勤 明=明け 休=休み 希=希望休 有=有休 －=未設定

必ずJSON形式のみで返答（前後に説明文不要）:
{"changes":[{"staffId":"スタッフID","day":日付番号,"shift":"シフト種別"}],"explanation":"変更内容の説明"}
変更不要なら: {"changes":[],"explanation":"変更不要です"}`;

    const userPrompt = `【${year}年${month}月 シフト表 / ${dept.label}】\n${shiftTable}\n【指示】\n${instruction}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
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

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API エラー (${res.status}): ${err}`);
    }

    const aiData = await res.json();
    const text = aiData.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AIの応答からJSONを取得できませんでした");

    return json(JSON.parse(match[0]));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "不明なエラー";
    return json({ error: msg }, 500);
  }
});
