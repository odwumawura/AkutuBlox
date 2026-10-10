"""Sensing: mouse x, mouse y, mouse down. The Cat goes where the mouse was, and waits for a press.
   python3 tests/sensing_test.py   (dev server on :5173)
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

def script(*blocks):
    return [{"id": "x-1", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": chain(*blocks)}}}]}]

GOTO_MOUSE = script({"type": "motion_goto", "inputs": {
    "X": {"block": {"type": "sensing_mousex"}},
    "Y": {"block": {"type": "sensing_mousey"}},
}})
WAIT_FOR_PRESS = script(
    {"type": "control_wait_until", "inputs": {"CONDITION": {"block": {"type": "sensing_mousedown"}}}},
    {"type": "motion_setx", "inputs": {"X": lit(77)}},
)

def cat(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    # 1. Mouse position: the Cat goes to the point under the pointer (stage is 480 x 360, y up).
    box = pg.locator("#stage").bounding_box()
    px, py = box["x"] + box["width"] * 0.25, box["y"] + box["height"] * 0.75
    pg.mouse.move(px, py)
    pg.wait_for_timeout(100)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", GOTO_MOUSE)
    pg.wait_for_timeout(300)
    pg.click("#run")
    pg.wait_for_timeout(1500)
    c = cat(pg)
    check(abs(c["x"] - (-120)) < 1.5, f"mouse x: Cat goes to x = -120 (got {c['x']:.1f})")
    check(abs(c["y"] - (-90)) < 1.5, f"mouse y: Cat goes to y = -90 (got {c['y']:.1f})")

    # 2. Mouse down: the script waits until the mouse is pressed on the stage, then moves the Cat.
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", WAIT_FOR_PRESS)
    pg.wait_for_timeout(300)
    pg.click("#run")
    pg.wait_for_timeout(800)
    check(cat(pg)["x"] == 0, f"nothing happens before a press (x = {cat(pg)['x']:.1f})")
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.mouse.down()
    pg.wait_for_timeout(300)
    pg.mouse.up()
    pg.wait_for_timeout(500)
    check(abs(cat(pg)["x"] - 77) < 0.5, f"a press on the stage releases the wait (x = {cat(pg)['x']:.1f})")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
