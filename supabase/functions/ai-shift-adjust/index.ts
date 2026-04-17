import Anthropic from "npm:@anthropic-ai/sdk@0.36.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { shifts, staffList, dept, instruction, year, month } = await req.json();

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

    const days = new Date(year, month, 0).getDate();
    const staffInDept = staffList.filter((s: { dept: string }) => s.dept === dept.id);

    // シフト表をテキスト形式に変換
    const SHIFT_SHORT: Record<string, string> = {
      "早番": "早", "日勤": "日", "遅番": "遅", "夜勤": "夜",
      "明け": "明", "休み": "休", "希望休": "希", "有休": "有",
    };
    let shiftTable = "";
    for (const s of staffInDept as { id: string; name: string; role: string }[]) {
      const row = Array.from({ length: days }, (_, i) => {
        const v = (shifts[s.id] ?? {})[i + 1] ?? "－";
        return SHIFT_SHORT[v] ?? v;
      }).join("");
      shiftTable += `${s.name}(${s.role})[ID:${s.id}]: ${row}\n`;
    }

    const systemPrompt = `あなたは介護施設のシフト管理AIです。
与えられた月次シフト表を指示に従い、最小限の変更で調整してください。

厳守ルール：
- 夜勤の翌日は必ず「明け」
- 明けの翌日は必ず「休み」
- 変更は指示に関係するスタッフのみ
- 利用可能なシフト種別: ${dept.shiftTypes.join("、")}、明け、休み

シフト表の読み方: 早=早番 日=日勤 遅=遅番 夜=夜勤 明=明け 休=休み 希=希望休 有=有休 －=未設定

必ずJSON形式のみで返答（前後に説明文不要）:
{"changes":[{"staffId":"スタッフID文字列","day":日付番号,"shift":"シフト種別"}],"explanation":"変更内容の説明"}
変更不要なら: {"changes":[],"explanation":"変更不要です"}`;

    const userPrompt = `【${year}年${month}月 シフト表 / ${dept.label}】\n${shiftTable}\n【指示】\n${instruction}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AIの応答からJSONを取得できませんでした");

    const result = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "不明なエラー";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
