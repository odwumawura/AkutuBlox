"""Touching: another sprite (by name) and the stage edge. A circle per sprite, as drawn.
   python3 tests/touching_test.py   (dev server on :5173)
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

def goto(x, y):
    return {"type": "motion_goto", "inputs": {"X": lit(x), "Y": lit(y)}}

def if_(cond, *body):
    return {"type": "control_if", "inputs": {"CONDITION": {"block": cond}, "DO": {"block": chain(*body)}}}

def touching(name):
    return {"type": "sensing_touchingsprite", "fields": {"SPRITE": name}}

EDGE = {"type": "sensing_touchingedge"}

def program(*blocks):
    return [{"id": "t-1", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": chain(*blocks)}}}]}]

# Each check runs on its own, so a wrong answer shows up as a wrong position.
CASES = [
    ("touching Dog (overlapping) -> Cat moves up 10", program(
        goto(-100, 0), if_(touching("Dog"), {"type": "motion_changey", "inputs": {"DY": lit(10)}})), ("y", 10)),
    ("not touching Dog (far away) -> Cat stays", program(
        goto(0, 100), if_(touching("Dog"), {"type": "motion_sety", "inputs": {"Y": lit(999)}})), ("y", 100)),
    ("touching the edge -> Cat moves down 50", program(
        goto(230, 0), if_(EDGE, {"type": "motion_sety", "inputs": {"Y": lit(-50)}})), ("y", -50)),
    ("not touching the edge (centre) -> Cat stays", program(
        goto(0, 0), if_(EDGE, {"type": "motion_sety", "inputs": {"Y": lit(-50)}})), ("y", 0)),
]

def cat(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(500)
    if pg.locator("#prompt[open] button[value=discard]").count():  # only when there are unsaved changes
        pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)
    names = [s["name"] for s in pg.evaluate("() => window.__akutu.sprites()")]
    check(sorted(names) == ["Cat", "Dog"], f"the file has two sprites (got {names})")

    for label, script, (key, want) in CASES:
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", script)
        pg.wait_for_timeout(300)
        pg.click("#run")
        pg.wait_for_timeout(1200)
        got = cat(pg)[key]
        check(abs(got - want) < 0.5, f"{label} ({key} = {got:.1f}, want {want})")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
