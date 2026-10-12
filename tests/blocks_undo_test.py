"""Blocks, P4: undo and redo (keyboard and buttons) after a real mouse drag from the palette.
   python3 tests/blocks_undo_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

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

# Blocks in the project's scripts. Every block object has a "type" key.
COUNT_JS = "() => JSON.stringify(window.__akutu.scripts() || []).split('\"type\"').length - 1"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.wait_for_timeout(800)

    def count():
        return pg.evaluate(COUNT_JS)

    pg.locator("#blocklyDiv .blocklyToolboxCategory", has_text="Motion").first.click()
    pg.wait_for_timeout(500)
    start = count()
    src = pg.locator("#blocklyDiv .blocklyFlyout .blocklyDraggable", has_text="move").first
    drag(pg, src, 520, 470)  # empty space, away from the default script
    after_drag = count()
    check(after_drag == start + 1, f"a block is dropped on the workspace ({start} -> {after_drag})")

    # Undo needs the workspace to have keyboard focus: click empty workspace space first.
    pg.mouse.click(520, 620)
    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(400)
    check(count() == start, f"Ctrl+Z removes the dropped block ({count()} blocks)")

    pg.keyboard.press("Control+Shift+z")
    pg.wait_for_timeout(400)
    check(count() == after_drag, f"Ctrl+Shift+Z puts it back ({count()} blocks)")

    pg.keyboard.press("Control+z")
    pg.wait_for_timeout(300)
    pg.keyboard.press("Control+y")
    pg.wait_for_timeout(400)
    check(count() == after_drag, f"Ctrl+Y also redoes ({count()} blocks)")

    pg.click("#undo")
    pg.wait_for_timeout(300)
    check(count() == start, f"the Undo button removes the block ({count()} blocks)")
    pg.click("#redo")
    pg.wait_for_timeout(300)
    check(count() == after_drag, f"the Redo button puts it back ({count()} blocks)")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
raise SystemExit(1 if failures else 0)
