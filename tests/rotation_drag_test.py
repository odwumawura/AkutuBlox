"""Sprite rotation style (all around, left-right, don't rotate) and drag mode (dragging on the stage).
   python3 tests/rotation_drag_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "rotation_drag.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

def op(t, **fields):
    return {"type": t, "fields": fields}

def chain(*blocks):
    for a, b in zip(blocks, blocks[1:]):
        a["next"] = {"block": b}
    return blocks[0]

def program(*blocks):
    return [{"id": "l-1", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": chain(*blocks)}}}]}]

# The Cat\'s nose is a dark triangle whose tip points the way it faces (tip at +10, base at -6 when facing right).
# Two probe points just inside the tip decide the way: +1 means the nose points right, -1 means left.
NOSE_SIDE = """() => {
  const d = document.getElementById('stage').getContext('2d').getImageData(0, 0, 480, 360).data;
  const dark = (x, y) => { const i = (y * 480 + x) * 4; return d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 110; };
  return (dark(248, 180) ? 1 : 0) - (dark(232, 180) ? 1 : 0);
}"""

def cat(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")

def canvas_point(pg, x, y):
    """Stage coordinates (origin centre, y up) -> screen position on the canvas."""
    r = pg.evaluate("() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
    return r[0] + (x + 240) * r[2] / 480, r[1] + (180 - y) * r[3] / 360

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

    def run(script, wait=1500):
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", script)
        pg.wait_for_timeout(300)
        pg.click("#run")
        pg.wait_for_timeout(wait)

    c = cat(pg)
    check(c["rotationStyle"] == "all around" and c["draggable"] is False, "defaults: all around, not draggable")

    # Facing left (-90) with each style. Right minus left: negative = nose on the left.
    run(program(op("motion_point", DIRECTION=-90)))
    check(pg.evaluate(NOSE_SIDE) < 0, "all around: facing left shows the nose on the left")

    run(program(op("motion_setrotation", STYLE="left-right"), op("motion_point", DIRECTION=-90)))
    c = cat(pg)
    check(c["rotationStyle"] == "left-right" and c["dir"] == 270, "left-right style is set (facing left is stored as 270)")
    check(pg.evaluate(NOSE_SIDE) < 0, "left-right: facing left mirrors the Cat (nose on the left)")

    run(program(op("motion_setrotation", STYLE="don't rotate"), op("motion_point", DIRECTION=-90)))
    check(pg.evaluate(NOSE_SIDE) > 0, "don't rotate: facing left still shows the nose on the right")

    run(program(op("motion_setrotation", STYLE="left-right"), op("motion_point", DIRECTION=90)))
    check(pg.evaluate(NOSE_SIDE) > 0, "left-right: facing right shows the nose on the right")

    # Drag mode. A sprite that is not draggable does not move when dragged.
    run(program(op("motion_setrotation", STYLE="all around"), op("motion_point", DIRECTION=90)))
    sx, sy = canvas_point(pg, 0, 0)
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx + 60, sy - 20, steps=6); pg.mouse.up()
    pg.wait_for_timeout(200)
    c = cat(pg)
    check(c["x"] == 0 and c["y"] == 0, f"not draggable: the Cat stays put (got {c['x']},{c['y']})")

    # Turn drag mode on, then drag to (100, 40).
    run(program(op("sensing_setdrag", MODE="draggable")))
    check(cat(pg)["draggable"] is True, "set drag mode to draggable")
    sx, sy = canvas_point(pg, 0, 0)
    tx, ty = canvas_point(pg, 100, 40)
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(tx, ty, steps=10); pg.mouse.up()
    pg.wait_for_timeout(200)
    c = cat(pg)
    check(abs(c["x"] - 100) < 1 and abs(c["y"] - 40) < 1, f"draggable: dragged to (100, 40) (got {c['x']:.1f}, {c['y']:.1f})")

    saved = pg.evaluate("() => window.__akutu.snapshot()")["blocks"]["sprites"][0]
    check(abs(saved["x"] - 100) < 1 and abs(saved["y"] - 40) < 1, f"saving keeps the dropped position (got {saved['x']:.1f}, {saved['y']:.1f})")

    # A script run after the drag starts from the dropped place, not from the old one.
    run(program(op("motion_changex", DX=10)))
    c = cat(pg)
    check(abs(c["x"] - 110) < 1, f"a script moves on from the dropped place (got {c['x']:.1f})")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
