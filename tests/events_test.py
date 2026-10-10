"""Events: when key pressed, when this sprite clicked, when I receive, broadcast.
   Key and click events only work while the project runs (green flag to Stop).
   python3 tests/events_test.py   (dev server on :5173)
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

def changex(n):
    return {"type": "motion_changex", "inputs": {"DX": lit(n)}}

def changey(n):
    return {"type": "motion_changey", "inputs": {"DY": lit(n)}}

def hat(id_, y, block_type, body, **fields):
    h = {"type": block_type, "inputs": {"DO": {"block": body}}}
    if fields:
        h["fields"] = fields
    return {"id": id_, "x": 40, "y": y, "blocks": [h]}

CAT = [
    hat("c-key", 40, "event_key", changex(10), KEY="space"),
    hat("c-msg", 200, "event_message", changex(5), MSG="hello"),
]
DOG = [
    hat("d-flag", 40, "event_flag", chain({"type": "event_broadcast", "fields": {"MSG": "hello"}})),
    hat("d-click", 200, "event_click", changey(20)),
]

def sprite(pg, name):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == name)

def screen(box, x, y):
    # The stage is 480 x 360 logical units, centred on the canvas, y up.
    return box["x"] + (x + 240) / 480 * box["width"], box["y"] + (180 - y) / 360 * box["height"]

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
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", CAT)
    pg.wait_for_timeout(300)
    pg.click("#sprite-list .chip-name >> text=Dog")
    pg.wait_for_timeout(300)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", DOG)
    pg.wait_for_timeout(300)

    # Green flag: Dog broadcasts "hello", Cat's "when I receive hello" adds 5.
    pg.click("#run")
    pg.wait_for_timeout(1200)
    check(abs(sprite(pg, "Cat")["x"] - 5) < 0.5, f"broadcast reaches Cat from Dog's flag script (x = {sprite(pg, 'Cat')['x']:.1f}, want 5)")
    check(abs(sprite(pg, "Dog")["y"]) < 0.5, "Dog's click script has not run yet")

    # Keys: the page must not be focused on a field.
    pg.evaluate("() => document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("Space")
    pg.wait_for_timeout(400)
    check(abs(sprite(pg, "Cat")["x"] - 15) < 0.5, f"space key runs Cat's script (x = {sprite(pg, 'Cat')['x']:.1f}, want 15)")
    pg.keyboard.press("a")
    pg.wait_for_timeout(400)
    check(abs(sprite(pg, "Cat")["x"] - 15) < 0.5, "pressing a does nothing (no 'a' script)")

    # Click on Dog: a press and release without dragging.
    box = pg.locator("#stage").bounding_box()
    dog = sprite(pg, "Dog")
    sx, sy = screen(box, dog["x"], dog["y"])
    pg.mouse.click(sx, sy)
    pg.wait_for_timeout(400)
    check(abs(sprite(pg, "Dog")["y"] - 20) < 0.5, f"clicking Dog runs its click script (y = {sprite(pg, 'Dog')['y']:.1f}, want 20)")

    # A press that moves before release is a drag, not a click.
    sx, sy = screen(box, sprite(pg, "Dog")["x"], sprite(pg, "Dog")["y"])
    pg.mouse.move(sx, sy)
    pg.mouse.down()
    for i in range(1, 11):
        pg.mouse.move(sx + 4 * i, sy)
        pg.wait_for_timeout(15)
    pg.mouse.up()
    pg.wait_for_timeout(400)
    check(abs(sprite(pg, "Dog")["y"] - 20) < 0.5, f"dragging Dog is not a click (y = {sprite(pg, 'Dog')['y']:.1f}, want 20)")

    # Click on empty stage: nothing runs.
    ex, ey = screen(box, 200, -150)
    pg.mouse.click(ex, ey)
    pg.wait_for_timeout(400)
    check(abs(sprite(pg, "Dog")["y"] - 20) < 0.5 and abs(sprite(pg, "Cat")["x"] - 15) < 0.5, "clicking empty stage runs nothing")

    # Stop: keys and clicks stop working.
    pg.click("#stop")
    pg.wait_for_timeout(400)
    before = sprite(pg, "Cat")["x"]
    pg.evaluate("() => document.activeElement && document.activeElement.blur()")
    pg.keyboard.press("Space")
    pg.wait_for_timeout(400)
    check(abs(sprite(pg, "Cat")["x"] - before) < 0.5, "after Stop, space does nothing")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
