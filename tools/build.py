# -*- coding: utf-8 -*-
"""校验内容源并生成可被 file:// 直接加载的 JS 数据文件。"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import content_source as C
import examples_source as X
import variants_source as V
import extensions_source as XT

EXAMPLES_ALL = list(X.EXAMPLES) + list(V.VARIANTS)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TYPES = {"概念", "规律", "过程", "对比", "方法", "区域", "安全"}
LIMITS = {
    "title": 22, "summary": 60, "pitfall": 90, "exam": 80,
}
EX_LIMITS = {
    "title": 24, "stem": 180, "hint": 80, "answer": 260, "analysis": 200,
    "chapter": 30, "module": 40,
}
errors = []


def check():
    lesson_ids = set()
    book_ids = set()
    for b in C.BOOKS:
        if b["id"] in book_ids:
            errors.append("书籍 id 重复: " + b["id"])
        book_ids.add(b["id"])
        for les in b["lessons"]:
            if les["id"] in lesson_ids:
                errors.append("课次 id 重复: " + les["id"])
            lesson_ids.add(les["id"])
        # 每个课次必须挂在某个单元
        for les in b["lessons"]:
            in_unit = any(les["id"] in u["lessons"] for u in b["units"])
            if not in_unit:
                errors.append("课次未挂单元: " + les["id"])

    item_ids = set()
    per_lesson = {}
    for it in C.ITEMS:
        tag = it.get("id", "?")
        if it["id"] in item_ids:
            errors.append("条目 id 重复: " + tag)
        item_ids.add(it["id"])
        if it.get("lesson") not in lesson_ids:
            errors.append("条目课次不存在: %s -> %s" % (tag, it.get("lesson")))
        if it.get("type") not in TYPES:
            errors.append("条目类型非法: %s -> %s" % (tag, it.get("type")))
        if it.get("diff") not in (1, 2, 3):
            errors.append("条目难度非法: " + tag)
        for f, n in LIMITS.items():
            if len(str(it.get(f, ""))) > n:
                errors.append("%s %s 超长: %d/%d" % (tag, f, len(str(it.get(f, ""))), n))
        core = it.get("core") or []
        if not (1 <= len(core) <= 8):
            errors.append("条目要点数量异常: %s -> %d" % (tag, len(core)))
        for c in core:
            if len(c) > 90:
                errors.append("%s 要点超长: %s" % (tag, c[:20]))
        if not (1 <= len(it.get("terms") or []) <= 6):
            errors.append("条目关键词数量异常: " + tag)
        per_lesson[it["lesson"]] = per_lesson.get(it["lesson"], 0) + 1

    for lid in sorted(lesson_ids):
        if not per_lesson.get(lid):
            errors.append("课次没有条目: " + lid)

    # 例题
    ex_ids = set()
    ex_items = {}
    for ex in EXAMPLES_ALL:
        eid = ex.get("id", "?")
        if eid in ex_ids:
            errors.append("例题 id 重复: " + eid)
        ex_ids.add(eid)
        if ex.get("item") not in item_ids:
            errors.append("例题考点不存在: %s -> %s" % (eid, ex.get("item")))
        if ex.get("level") not in (1, 2, 3):
            errors.append("例题难度非法: " + eid)
        for f, n in EX_LIMITS.items():
            if len(str(ex.get(f, ""))) > n:
                errors.append("%s %s 超长: %d/%d" % (eid, f, len(str(ex.get(f, ""))), n))
        asks = ex.get("ask") or []
        if not (1 <= len(asks) <= 3):
            errors.append("例题小问数量异常: " + eid)
        for a in asks:
            if len(a) > 80:
                errors.append("%s 小问超长: %s" % (eid, a[:20]))
        if not ex.get("stem") or not ex.get("answer"):
            errors.append("例题缺少题干或答案: " + eid)
        ex_items.setdefault(ex["item"], []).append(eid)

    # 每条考点至少 2 道例题，且同一考点最多 3 道
    for iid in item_ids:
        lst = ex_items.get(iid, [])
        if len(lst) < 2:
            errors.append("考点例题不足 2 道: %s -> %d" % (iid, len(lst)))
        if len(lst) > 3:
            errors.append("同一考点例题过多: %s -> %d" % (iid, len(lst)))

    # 拓展必须一条对一条，且不挂不存在的考点
    for iid in item_ids:
        ext = XT.EXTEND.get(iid)
        if not ext:
            errors.append("考点缺少拓展: " + iid)
        elif len(str(ext)) > 120:
            errors.append("拓展超长: %s -> %d/120" % (iid, len(str(ext))))
    for iid in XT.EXTEND:
        if iid not in item_ids:
            errors.append("拓展挂到不存在的考点: " + iid)

    # 易混对照
    pair_ids = set()
    for p in C.PAIRS:
        if p["id"] in pair_ids:
            errors.append("对照 id 重复: " + p["id"])
        pair_ids.add(p["id"])
        for k in ("a", "b"):
            if not p[k].get("label") or not p[k].get("text"):
                errors.append("对照缺少 %s: %s" % (k, p["id"]))
        if len(p.get("diff") or []) < 2:
            errors.append("对照差异点不足: " + p["id"])

    # 时间线
    ev_ids = set()
    stage_keys = {s["key"] for s in C.STAGES}
    for ev in C.TIMELINE:
        if ev["id"] in ev_ids:
            errors.append("时间线 id 重复: " + ev["id"])
        ev_ids.add(ev["id"])
        if ev["stage"] not in stage_keys:
            errors.append("时间线阶段非法: " + ev["id"])
        if ev["region"] not in ("中国", "世界"):
            errors.append("时间线地区非法: " + ev["id"])
        if not isinstance(ev["y"], int):
            errors.append("时间线年份必须是整数: " + ev["id"])

    return lesson_ids, book_ids


def build_payload(lesson_ids, book_ids):
    lesson_meta = {}
    lesson_order = {}
    for b in C.BOOKS:
        for i, les in enumerate(b["lessons"]):
            unit = next((u for u in b["units"] if les["id"] in u["lessons"]), None)
            lesson_meta[les["id"]] = {
                "bookId": b["id"], "bookName": b["name"], "bookTitle": b["title"],
                "unitNo": unit["no"] if unit else "", "unitTitle": unit["title"] if unit else "",
                "lessonNo": les["no"], "lessonTitle": les["title"],
            }
            lesson_order[les["id"]] = i

    items = []
    counter = {}
    ex_by_item = {}
    for ex in EXAMPLES_ALL:
        ex_by_item.setdefault(ex["item"], []).append(ex)
    for it in C.ITEMS:
        m = lesson_meta[it["lesson"]]
        counter[it["lesson"]] = counter.get(it["lesson"], 0) + 1
        row = dict(it)
        row.update(m)
        row["order"] = counter[it["lesson"]]
        exs = ex_by_item.get(it["id"], [])
        row["exCount"] = len(exs)
        row["exSearch"] = " ".join(
            [e["title"] + " " + e["stem"] + " " + " ".join(e["ask"]) + " " + e["hint"] + " " + e["answer"] + " " + e["analysis"]
             for e in exs]
        )
        ext = XT.EXTEND.get(it["id"]) or ""
        row["extend"] = ext
        if ext:
            row["exSearch"] += " " + ext
        items.append(row)

    item_by_id = {it["id"]: it for it in items}
    examples = []
    for ex in EXAMPLES_ALL:
        row = dict(ex)
        it = item_by_id[ex["item"]]
        row["itemTitle"] = it["title"]
        row["bookId"] = it["bookId"]
        row["bookName"] = it["bookName"]
        examples.append(row)

    books = []
    for b in C.BOOKS:
        books.append({
            "id": b["id"], "name": b["name"], "title": b["title"], "short": b["short"],
            "units": b["units"], "lessons": b["lessons"],
        })

    return {
        "meta": {
            "title": "高中地理知识库",
            "updated": "2026-11-25",
            "note": "考点依据人教版（2019）高中地理教材目录与通行考点归纳整理；每条配 2 道同型例题和 1 条细节与拓展，例题与拓展按《一地·高考地理核心方法必刷100讲》（2027版）题型结构自编，不照录原书题目。",
            "source": "人教版（2019）",
            "count": len(items),
            "exampleCount": len(examples),
            "extensionCount": len(XT.EXTEND),
            "bookCount": len(books),
            "lessonCount": len(lesson_meta),
        },
        "books": books,
        "items": items,
        "examples": examples,
    }


def write_js(path, var_name, payload):
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8") as f:
        f.write("/* 由 tools/build.py 自动生成，请勿手改；改 tools/content_source.py 后重新运行。 */\n")
        f.write("window.%s = %s;\n" % (var_name, body))


def main():
    lesson_ids, book_ids = check()
    if errors:
        print("内容校验失败：")
        for e in errors:
            print(" - " + e)
        sys.exit(1)
    payload = build_payload(lesson_ids, book_ids)
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    write_js(os.path.join(ROOT, "data", "content.js"), "GG", payload)
    write_js(os.path.join(ROOT, "data", "views.js"), "GGViews", {"pairs": C.PAIRS})
    write_js(os.path.join(ROOT, "data", "timeline.js"), "GGTimeline",
             {"stages": C.STAGES, "events": C.TIMELINE})
    with open(os.path.join(ROOT, "data", "content.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print("OK · %d 本书 / %d 课 / %d 条考点 / %d 道例题 / %d 条拓展 / %d 组对照 / %d 个时间线事件"
          % (len(C.BOOKS), payload["meta"]["lessonCount"], len(C.ITEMS), len(EXAMPLES_ALL), len(XT.EXTEND), len(C.PAIRS), len(C.TIMELINE)))


if __name__ == "__main__":
    main()
