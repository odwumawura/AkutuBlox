"""Blocks: a loose stack (a block not attached to a hat) does not run and does not break the sprite's code.
   The scripts with a hat still run. Reproduces the bug where dropping a Motion block on the canvas
   gave "await is only valid in async functions" on every green flag.
   python3 tests/loose_blocks_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

SCRIPT = [{
    "id": "s-1", "x": 40, "y": 40,
    "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": {
        "type": "motion_move", "fields": {"STEPS": 40},
        "next": {"block": {"type": "control_wait", "fields": {"DURATION": 1},
                           "next": {"block": {"type": "motion_move", "fields": {"STEPS": 40}}}}}}}}}]}]

def drag(pg, src, dst_x, dst_y):
    box = src.bounding_box()
    sx, sy = box["x"] + 12, box["y"] + box["height"] / 2
    pg.mouse.move(sx, sy)
    pg.mouse.down()
    for i in range(1, 16):
        pg.mouse.move(sx + (dst_x - sx) * i / 15, sy + (dst_y - sy) * i / 15)
        pg.wait_for_timeout(15)
    pg.mouse.up()
    pg.wait_for_timeout(300)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.wait_for_timeout(800)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SCRIPT)
    pg.wait_for_timeout(600)

    # Drop a loose Motion block on empty canvas.
    pg.locator("#blocklyDiv .blocklyToolboxCategory", has_text="Motion").first.click()
    pg.wait_for_timeout(500)
    drag(pg, pg.locator("#blocklyDiv .blocklyFlyout .blocklyDraggable", has_text="move").first, 520, 470)
    pg.click("#run")
    pg.wait_for_timeout(2300)
    x = pg.evaluate("() => window.__akutu.sprites()[0].x")
    log = pg.inner_text("#log")
    check("await is only valid" not in log, "no code error in the log after dropping a loose block")
    check(round(x) == 80, f"the hat script still runs (x = 80, got {round(x)})")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
raise SystemExit(1 if failures else 0)
