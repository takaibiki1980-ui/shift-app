#!/usr/bin/env python3
"""介護部2階 相当の合成サンプル入力を生成 (実データが手元にない環境での Step A 検証用)。
実データを使う場合は App の BacktestView 書き出しボタンで同形式のJSONを得る (schema.md 参照)。"""
import json, calendar

YEAR, MONTH0 = 2025, 8  # 2025年9月 (0始まり月8)
days = calendar.monthrange(YEAR, MONTH0 + 1)[1]

staff = []
# 正社員6 (夜勤可・全種別)
for i in range(6):
    staff.append({"id": f"R{i}", "name": f"正{i}", "role": "介護福祉士",
                  "nightOk": True, "kyukoDays": 8, "kibo": [], "yukyu": [], "requests": {}})
# パート3 (日勤のみ・夜勤不可)
for i in range(3):
    staff.append({"id": f"P{i}", "name": f"パ{i}", "role": "介護補助",
                  "nightOk": False, "kyukoDays": 9, "kibo": [], "yukyu": [], "requests": {}})

# 希望休をいくつか (現実的な入力)
staff[0]["kibo"] = [5, 6]
staff[1]["kibo"] = [12]
staff[6]["kibo"] = [3, 20]

data = {
    "year": YEAR, "month": MONTH0, "days": days,
    "shiftTypes": ["早番", "日勤", "遅番", "夜勤"],
    "minStaff": {"早番": 1, "日勤": 1, "遅番": 1, "夜勤": 1},
    "maxStaff": {"早番": 1, "日勤": 99, "遅番": 1, "夜勤": 1},
    "maxConsec": 5,
    "roleShiftTypes": {"介護補助": ["日勤"]},
    "prevTail": {},   # 前月末最終日 {sid:{"lastShift":"夜勤"}} など (今回は空)
    "staff": staff,
}
json.dump(data, open("sample_input.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"wrote sample_input.json: {len(staff)}名 {days}日")
