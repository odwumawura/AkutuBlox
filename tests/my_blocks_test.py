"""My Blocks: define a block, call it (also twice), calling an undefined block does nothing,
   and a define on its own does not run. The definitions are saved with the project.
   python3 tests/my_blocks_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "touching.akutu")
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

def define(name, *body):
    block = {"type": "myblock_define", "fields": {"NAME": name}, "inputs": {"DO": {"block": chain(*body)}}}
    return {"id": "def-" + name, "x": 40, "y": 40, "blocks": [block]}

def call(name):
    return {"type": "myblock_call", "fields": {"BLOCK": name}}

def move_x(n):
    return {"type": "motion_changex", "inputs": {"DX": lit(n)}}

def sprite(pg, name):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == name)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(500)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)

    pg.click("#sprite-list .chip-name >> text=Cat")
    pg.wait_for_timeout(300)

    def run_with(scripts, wait_ms=400):
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", scripts)
        pg.wait_for_timeout(300)
        pg.click("#run")
        pg.wait_for_timeout(wait_ms)
        pg.click("#stop")
        pg.wait_for_timeout(200)
        return sprite(pg, "Cat")["x"]

    # 1. Call a defined block twice, and an undefined one (does nothing): 10 + 10 = 20.
    x = run_with([
        define("hop", move_x(10)),
        hat("c1", 200, "event_flag", chain(call("hop"), call("hop"), call("missing"))),
    ])
    check(abs(x - 20) < 0.5, f"calling hop twice moves the Cat 20; calling a missing block does nothing (x = {x:.1f}, want 20)")

    # 2. A define on its own does not run.
    x = run_with([define("hop", move_x(10))])
    check(abs(x) < 0.5, f"a define on its own does not run (x = {x:.1f}, want 0)")

    # 3. The definition and calls are saved with the project.
    run_with([
        define("hop", move_x(10)),
        hat("c3", 200, "event_flag", chain(call("hop"))),
    ], wait_ms=100)
    saved = pg.evaluate("() => JSON.stringify(window.__akutu.snapshot())")
    check('"myblock_define"' in saved and '"hop"' in saved and '"myblock_call"' in saved, "the define and call are saved with the project")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
