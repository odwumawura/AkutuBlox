"""Real mouse drag from the Web interaction flyout: the block lands on the canvas and the preview updates live.
   python3 tests/drag_test.py   (dev server on :5173)
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

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.click("#tab-web")
    pg.wait_for_timeout(800)
    pg.click("#side-interactions")
    pg.wait_for_timeout(800)

    before = pg.evaluate("() => document.getElementById('preview-frame').srcdoc")
    pg.locator("#iblockly .blocklyToolboxCategory", has_text="When").first.click()
    pg.wait_for_timeout(500)
    src = pg.locator("#iblockly .blocklyFlyout .blocklyDraggable", has_text="the page loads").first
    drag(pg, src, 1100, 260)
    pg.wait_for_timeout(600)
    after = pg.evaluate("() => document.getElementById('preview-frame').srcdoc")
    check(pg.locator("#iblockly .blocklyWorkspace .blocklyDraggable").count() >= 1, "trigger block placed on canvas")
    check(before != after, "preview updated after dragging a block")

    pg.locator("#iblockly .blocklyToolboxCategory", has_text="Show & hide").first.click()
    pg.wait_for_timeout(500)
    src2 = pg.locator("#iblockly .blocklyFlyout .blocklyDraggable", has_text="show").first
    drag(pg, src2, 920, 300)
    check(pg.locator("#iblockly .blocklyWorkspace .blocklyDraggable").count() >= 2, "second block placed on canvas")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
