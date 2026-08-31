#!/usr/bin/env python3
"""
CP-SAT バックテスト・シミュレーター (Step A: ハード制約のみ)

本番のシフト生成エンジン(core.js)には一切関与しない・隔離された研究用ツール。
入力は既存システムと同じ (希望休/希望勤務/必要人数/夜勤明け/連勤/公休/役職)。
Step A の目的: 学習目的はまだ入れず、全ハード制約を満たす「実行可能解」が出るかを確認する。

使い方:
  python3 solve.py input.json            # 解いて solution を stdout(JSON) + 検証を stderr へ
  python3 solve.py input.json out.json   # 解を out.json にも保存

入力スキーマは schema.md 参照。出力は {"status","solution":{sid:{day:shift}},"verify":{...}}。
"""
import sys, json
from ortools.sat.python import cp_model

REST_INPUT = {"希望休", "有休"}          # 固定入力(休み扱い・公休にカウント)
REST_ALL   = {"休み", "希望休", "有休"}   # 休み系(公休カウント対象)


def build_and_solve(data, time_limit=20.0):
    days   = data["days"]
    staff  = data["staff"]
    work   = list(data["shiftTypes"])          # 例 早番/日勤/遅番/夜勤
    has_night = "夜勤" in work
    role_st = data.get("roleShiftTypes", {})
    minS   = data.get("minStaff", {})
    maxS   = data.get("maxStaff", {})
    maxc   = data.get("maxConsec", 5)
    # カテゴリ = 勤務種別 + 明け + 休み (希望休/有休は「休み」枠に固定して表現)
    cats = list(work) + (["明け"] if has_night else []) + ["休み"]
    ci = {c: i for i, c in enumerate(cats)}
    REST_I = ci["休み"]
    AKE_I  = ci["明け"] if has_night else None
    NIGHT_I = ci["夜勤"] if has_night else None
    m = cp_model.CpModel()
    S = len(staff)
    x = {(s, d, k): m.NewBoolVar(f"x_{s}_{d}_{k}")
         for s in range(S) for d in range(1, days + 1) for k in range(len(cats))}

    def allowed_types(st):
        ra = role_st.get(st.get("role"))
        return set(ra) if ra else set(work)

    prevTail = data.get("prevTail", {})  # {sid: {"lastShift": "夜勤"/...}} 前月末最終日

    for si, st in enumerate(staff):
        aw = allowed_types(st)
        kibo = set(st.get("kibo", []))
        yuk  = set(st.get("yukyu", []))
        req  = {int(d): v for d, v in (st.get("requests", {}) or {}).items()}
        for d in range(1, days + 1):
            # (1) 1日ちょうど1カテゴリ
            m.Add(sum(x[si, d, k] for k in range(len(cats))) == 1)
            # (2) 役職: 許可外の勤務種別は0
            for c in work:
                if c not in aw:
                    m.Add(x[si, d, ci[c]] == 0)
            if not st.get("nightOk", False) and has_night:
                m.Add(x[si, d, NIGHT_I] == 0)   # 夜勤不可者
            # (3) 希望休/有休/希望勤務を固定
            if d in kibo or d in yuk:
                m.Add(x[si, d, REST_I] == 1)
            elif d in req and req[d] in ci:
                m.Add(x[si, d, ci[req[d]]] == 1)
        # (4) 夜勤 -> 翌日明け -> 翌々日休み
        if has_night:
            for d in range(1, days):
                m.Add(x[si, d + 1, AKE_I] >= x[si, d, NIGHT_I])   # 夜勤→翌明け
            # 最終日の夜勤は許可(明けは翌月＝月外なので当月には出さない)。夜勤→明けは d<days のみ。
            # 注: 「夜勤→翌々日=休み」は本番エンジンでも空きのみのソフト既定のためハードにしない
            #     (ハードにすると公休ちょうど一致と衝突し過剰制約になる)。ここでは 夜勤→明け のみ強制。
            # 明けは必ず前日夜勤から (孤立明け禁止)
            for d in range(1, days + 1):
                prev_night = x[si, d - 1, NIGHT_I] if d - 1 >= 1 else None
                if prev_night is None:
                    # 前月末が夜勤なら day1=明け 固定、そうでなければ day1 は明け不可
                    last = prevTail.get(st["id"], {}).get("lastShift")
                    if last == "夜勤":
                        m.Add(x[si, 1, AKE_I] == 1)
                    else:
                        m.Add(x[si, 1, AKE_I] == 0)
                else:
                    m.Add(x[si, d, AKE_I] <= prev_night)
        # (5) 連勤上限: 任意の (maxc+1) 窓で勤務(=非休・非明け)日数 <= maxc
        def is_workday(s_, d_):
            return sum(x[s_, d_, ci[c]] for c in work)  # 勤務種別のみ(明け/休みは0)
        for d in range(1, days - maxc + 1):
            m.Add(sum(is_workday(si, dd) for dd in range(d, d + maxc + 1)) <= maxc)
        # (6) 公休数 = kyukoDays (休み系: 休み枠に希望休/有休も含めている)
        ky = st.get("kyukoDays", 8)
        m.Add(sum(x[si, d, REST_I] for d in range(1, days + 1)) == ky)
        # (7) 遷移禁止: 遅番->翌早番/日勤, 日勤->翌早番
        def bad_pairs():
            pairs = []
            if "遅番" in ci and "早番" in ci: pairs.append(("遅番", "早番"))
            if "遅番" in ci and "日勤" in ci: pairs.append(("遅番", "日勤"))
            if "日勤" in ci and "早番" in ci: pairs.append(("日勤", "早番"))
            return pairs
        for (p, c) in bad_pairs():
            for d in range(1, days):
                m.Add(x[si, d, ci[p]] + x[si, d + 1, ci[c]] <= 1)
            # 月境界: 前月末->day1
            last = prevTail.get(st["id"], {}).get("lastShift")
            if last == p:
                m.Add(x[si, 1, ci[c]] == 0)

    # (8) 必要人数 minStaff <= 配置 <= maxStaff (日ごと・種別ごと)
    for d in range(1, days + 1):
        for c in work:
            tot = sum(x[si, d, ci[c]] for si in range(S))
            if c in minS: m.Add(tot >= minS[c])
            if c in maxS and maxS[c] < 99: m.Add(tot <= maxS[c])

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    status = solver.Solve(m)
    sname = solver.StatusName(status)
    solution = {}
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for si, st in enumerate(staff):
            row = {}
            for d in range(1, days + 1):
                for k, c in enumerate(cats):
                    if solver.Value(x[si, d, k]):
                        # 希望休/有休は入力の見た目を保持
                        v = c
                        if c == "休み":
                            if d in set(st.get("kibo", [])): v = "希望休"
                            elif d in set(st.get("yukyu", [])): v = "有休"
                        row[str(d)] = v
                        break
            solution[st["id"]] = row
    return sname, solution, solver


def verify(data, solution):
    """出力が全ハード制約を満たすか独立に検算(ソルバーを信用しすぎない)。"""
    days = data["days"]; work = data["shiftTypes"]; problems = []
    minS = data.get("minStaff", {}); maxS = data.get("maxStaff", {})
    maxc = data.get("maxConsec", 5)
    by = {st["id"]: st for st in data["staff"]}
    def cell(sid, d): return solution.get(sid, {}).get(str(d), "")
    # minStaff/maxStaff
    for d in range(1, days + 1):
        for c in work:
            cnt = sum(1 for sid in by if cell(sid, d) == c)
            if c in minS and cnt < minS[c]: problems.append(f"day{d} {c} min {cnt}<{minS[c]}")
            if c in maxS and maxS[c] < 99 and cnt > maxS[c]: problems.append(f"day{d} {c} max {cnt}>{maxS[c]}")
    for sid, st in by.items():
        vals = [cell(sid, d) for d in range(1, days + 1)]
        # 公休
        rest = sum(1 for v in vals if v in REST_ALL)
        if rest != st.get("kyukoDays", 8): problems.append(f"{sid} kyuko {rest}!={st.get('kyukoDays',8)}")
        # 夜勤->明け
        for i in range(days - 1):
            if vals[i] == "夜勤" and vals[i + 1] != "明け": problems.append(f"{sid} d{i+1}夜勤->d{i+2}非明け")
        # 明けは前日夜勤
        for i in range(days):
            if vals[i] == "明け" and (i == 0 or vals[i - 1] != "夜勤"):
                last = data.get("prevTail", {}).get(sid, {}).get("lastShift")
                if not (i == 0 and last == "夜勤"): problems.append(f"{sid} d{i+1}孤立明け")
        # 連勤
        run = 0
        for v in vals:
            if v in work: run += 1; problems.append(f"{sid} 連勤>{maxc}") if run > maxc else None
            else: run = 0
        # 遷移
        for i in range(days - 1):
            p, c = vals[i], vals[i + 1]
            if (p == "遅番" and c in ("早番", "日勤")) or (p == "日勤" and c == "早番"):
                problems.append(f"{sid} d{i+1}{p}->d{i+2}{c}遷移")
    return problems


def main():
    if len(sys.argv) < 2:
        print("usage: solve.py input.json [out.json]", file=sys.stderr); sys.exit(2)
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    sname, solution, solver = build_and_solve(data)
    problems = verify(data, solution) if solution else ["解なし"]
    out = {"status": sname, "solveSec": round(solver.WallTime(), 3),
           "verify": {"ok": len(problems) == 0, "problems": problems[:20]},
           "solution": solution}
    print(f"[CP-SAT] status={sname} time={solver.WallTime():.2f}s verify_ok={len(problems)==0} "
          f"problems={len(problems)}", file=sys.stderr)
    if sys.argv[2:]:
        json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
