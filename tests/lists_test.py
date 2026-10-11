"""Batch 20: lists. Make a list from the palette, add/insert/replace/delete, item, length, contains.
   python3 tests/lists_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

def lit(n):
    return {"block": {"type": "math_number", "fields": {"NUM": n}}}

def chain(*blocks):
    for a, b in zip(blocks, blocks[1:]):
        a["next"] = {"block": b}
    return blocks[0]

def hat(id_, y, block_type, body, **fields):
    h = {"type": block_type, "inputs": {"DO": {"block": body}}}
    if fields:
        h["fields"] = fields
    return {"id": id_, "x": 40, "y": y, "blocks": [h]}

def sprite(pg, name):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == name)

def lists(pg):
    return {l["name"]: l["items"] for l in pg.evaluate("() => window.__akutu.lists()")}

def goto(x, y):
    return {"type": "motion_goto", "inputs": {"X": lit(x), "Y": lit(y)}}

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    names = iter(["shopping", "nums"])
    pg.on("dialog", lambda d: d.accept(next(names)) if d.type == "prompt" else d.dismiss())
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.set_input_files("#open-file", os.path.join(os.path.dirname(__file__), "fixtures", "touching.akutu"))
    pg.wait_for_timeout(500)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)

    # 1. Make two lists from the palette.
    pg.locator(".blocklyToolboxCategory", has_text="Lists").first.click()
    pg.wait_for_timeout(500)
    for _ in range(2):
        pg.locator(".blocklyFlyout text", has_text="Make a List").first.click()
        pg.wait_for_timeout(500)
    check(lists(pg) == {"shopping": [], "nums": []}, f"palette makes two empty lists (got {lists(pg)})")
    check("shopping" not in [v["name"] for v in pg.evaluate("() => window.__akutu.variables()")], "lists are not listed as variables")

    # 2. Text and number items: add, insert, replace, delete last.
    sh = [
        hat("c-flag", 40, "event_flag", chain(
            {"type": "data_addtolist", "fields": {"LIST": "shopping", "ITEM": "apple"}},
            {"type": "data_addtolist", "fields": {"LIST": "shopping", "ITEM": 5}},
            {"type": "data_insertatlist", "fields": {"LIST": "shopping", "ITEM": "first", "INDEX": 1}},
            {"type": "data_replaceitemoflist", "fields": {"LIST": "shopping", "INDEX": 2, "ITEM": "pear"}},
            {"type": "data_deleteoflist", "fields": {"LIST": "shopping", "INDEX": "last"}},
        )),
    ]
    pg.click("#sprite-list .chip-name >> text=Cat"); pg.wait_for_timeout(250)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", sh); pg.wait_for_timeout(400)
    pg.click("#run"); pg.wait_for_timeout(700)
    check(lists(pg)["shopping"] == ["first", "pear"], f"add, insert, replace, delete last give ['first', 'pear'] (got {lists(pg)['shopping']})")
    pg.click("#stop"); pg.wait_for_timeout(200)

    # 3. Reporters: length, item (by number and 'last'), contains (case-insensitive).
    nums_cat = [
        hat("c-flag", 40, "event_flag", chain(
            {"type": "data_addtolist", "fields": {"LIST": "nums", "ITEM": 3}},
            {"type": "data_addtolist", "fields": {"LIST": "nums", "ITEM": 4}},
            {"type": "data_addtolist", "fields": {"LIST": "nums", "ITEM": 5}},
            goto(0, 0),
            {"type": "motion_changex", "inputs": {"DX": {"block": {"type": "data_lengthoflist", "fields": {"LIST": "nums"}}}}},
            {"type": "motion_changey", "inputs": {"DY": {"block": {"type": "data_itemoflist", "fields": {"LIST": "nums"}, "inputs": {"INDEX": lit("last")}}}}},
        )),
    ]
    contains_dog = [
        hat("d-flag", 40, "event_flag", chain(
            goto(0, 0),
            {"type": "control_if", "inputs": {
                "CONDITION": {"block": {"type": "data_listcontainsitem", "fields": {"LIST": "shopping"}, "inputs": {"ITEM": {"block": {"type": "math_number", "fields": {"NUM": "PEAR"}}}}}},
                "DO": {"block": {"type": "motion_changex", "inputs": {"DX": lit(7)}}}}},
        )),
    ]
    pg.click("#sprite-list .chip-name >> text=Cat"); pg.wait_for_timeout(250)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", nums_cat); pg.wait_for_timeout(300)
    pg.click("#sprite-list .chip-name >> text=Dog"); pg.wait_for_timeout(250)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", contains_dog); pg.wait_for_timeout(400)
    pg.click("#run"); pg.wait_for_timeout(800)
    c = sprite(pg, "Cat")
    check(abs(c["x"] - 3) < 0.5, f"length of nums is 3, so the Cat moves to x=3 (got {c['x']:.1f})")
    check(abs(c["y"] - 5) < 0.5, f"item 'last' of nums is 5, so the Cat moves to y=5 (got {c['y']:.1f})")
    d = sprite(pg, "Dog")
    check(abs(d["x"] - 7) < 0.5, f"contains PEAR finds pear (case-insensitive), so the Dog moves 7 (got {d['x']:.1f})")
    pg.click("#stop"); pg.wait_for_timeout(200)

    # 4. The lists are saved with the project.
    saved = pg.evaluate("() => window.__akutu.snapshot().blocks.stage.lists")
    check(sorted([(l["name"], l["items"]) for l in saved]) == sorted([("nums", [3, 4, 5]), ("shopping", ["first", "pear"])]), f"lists are saved with their items ({saved})")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
