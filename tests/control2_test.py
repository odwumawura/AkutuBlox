"""Batch 19: events without a green flag, broadcast and wait, stop this script, stop all.
   python3 tests/control2_test.py   (dev server on :5173)
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

def changex(n):
    return {"type": "motion_changex", "inputs": {"DX": lit(n)}}

def changey(n):
    return {"type": "motion_changey", "inputs": {"DY": lit(n)}}

def wait(s):
    return {"type": "control_wait", "inputs": {"SECONDS": lit(s)}}

def hat(id_, y, block_type, body, **fields):
    h = {"type": block_type, "inputs": {"DO": {"block": body}}}
    if fields:
        h["fields"] = fields
    return {"id": id_, "x": 40, "y": y, "blocks": [h]}

def sprite(pg, name):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == name)

def load(pg, cat, dog):
    pg.click("#sprite-list .chip-name >> text=Cat"); pg.wait_for_timeout(250)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", cat); pg.wait_for_timeout(300)
    pg.click("#sprite-list .chip-name >> text=Dog"); pg.wait_for_timeout(250)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", dog); pg.wait_for_timeout(500)

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

    # 1. No green flag: key and click scripts run from the start.
    cat = [hat("c-key", 40, "event_key", changex(10), KEY="space")]
    dog = [hat("d-click", 40, "event_click", changey(20))]
    load(pg, cat, dog)
    x0 = sprite(pg, "Cat")["x"]
    pg.evaluate("() => document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("Space"); pg.wait_for_timeout(300)
    check(abs(sprite(pg, "Cat")["x"] - x0 - 10) < 0.5, "key works with no green flag (Cat +10)")
    # Click Dog on the stage: Dog is at (-100, 0).
    box = pg.locator("#stage").bounding_box()
    dx, dy = sprite(pg, "Dog")["x"], sprite(pg, "Dog")["y"]
    px = box["x"] + (dx + 240) / 480 * box["width"]
    py = box["y"] + (180 - dy) / 360 * box["height"]
    pg.mouse.click(px, py); pg.wait_for_timeout(300)
    check(abs(sprite(pg, "Dog")["y"] - dy - 20) < 0.5, "click works with no green flag (Dog +20)")

    # 2. Broadcast and wait: Dog waits until Cat's receiver has finished.
    cat = [hat("c-flag", 40, "event_flag", chain(goto(0, 0))),
           hat("c-recv", 200, "event_message", chain(wait(0.5), changex(7)), MSG="go")]
    dog = [hat("d-flag", 40, "event_flag", chain(goto(0, 0), {"type": "event_broadcastwait", "fields": {"MSG": "go"}}, changey(20)))]
    load(pg, cat, dog)
    pg.click("#run")
    pg.wait_for_timeout(300)
    check(abs(sprite(pg, "Dog")["y"]) < 0.5, f"broadcast and wait: Dog is still waiting at 0.3 s (y={sprite(pg, 'Dog')['y']:.1f}, want 0)")
    pg.wait_for_timeout(1200)
    check(abs(sprite(pg, "Dog")["y"] - 20) < 0.5, "broadcast and wait: Dog continues after Cat's script (y=20)")
    check(abs(sprite(pg, "Cat")["x"] - 7) < 0.5, f"broadcast and wait: Cat's receiver finished first (x={sprite(pg, 'Cat')['x']:.1f}, want 7)")
    pg.click("#stop"); pg.wait_for_timeout(200)

    # 3. Stop this script: only Cat's script ends; Dog's keeps going.
    cat = [hat("c-flag", 40, "event_flag", chain(goto(0, 0), changex(10), {"type": "stop_this_script"}, changex(10)))]
    dog = [hat("d-flag", 40, "event_flag", chain(goto(0, 0), wait(0.3), changey(20)))]
    load(pg, cat, dog)
    pg.click("#run"); pg.wait_for_timeout(1000)
    check(abs(sprite(pg, "Cat")["x"] - 10) < 0.5, f"stop this script: Cat's second change never ran (x={sprite(pg, 'Cat')['x']:.1f}, want 10)")
    check(abs(sprite(pg, "Dog")["y"] - 20) < 0.5, "stop this script: Dog's script still finished (y=20)")
    pg.click("#stop"); pg.wait_for_timeout(200)

    # 4. Stop all: Dog's delayed change never happens.
    cat = [hat("c-flag", 40, "event_flag", chain(goto(0, 0), changex(10), {"type": "stop_all_scripts"}, changex(10)))]
    dog = [hat("d-flag", 40, "event_flag", chain(goto(0, 0), wait(0.3), changey(20)))]
    load(pg, cat, dog)
    pg.click("#run"); pg.wait_for_timeout(1000)
    check(abs(sprite(pg, "Cat")["x"] - 10) < 0.5, f"stop all: Cat stopped after its first change (x={sprite(pg, 'Cat')['x']:.1f}, want 10)")
    check(abs(sprite(pg, "Dog")["y"]) < 0.5, "stop all: Dog's delayed change never ran (y=0)")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
