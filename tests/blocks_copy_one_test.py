"""Blocks, P5: copy one block. "Duplicate this block only" copies the block and what is inside it, but not the blocks below it.
   python3 tests/blocks_copy_one_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

COUNT_JS = "() => JSON.stringify(window.__akutu.scripts() || []).split('\"type\"').length - 1"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.wait_for_timeout(800)

    before = pg.evaluate(COUNT_JS)
    # The default script's first "move" sits inside the repeat, with a "turn" block below it.
    move = pg.locator("#blocklyDiv .blocklyDraggable", has_text="move").nth(0)
    move.click(button="right")
    pg.wait_for_timeout(400)
    items = pg.locator(".blocklyContextMenu .blocklyMenuItemContent").all_inner_texts()
    check("Duplicate this block only" in items, f"the menu has 'Duplicate this block only' ({items})")
    pg.locator(".blocklyContextMenu .blocklyMenuItemContent", has_text="Duplicate this block only").first.click()
    pg.wait_for_timeout(400)
    after = pg.evaluate(COUNT_JS)
    check(after == before + 1, f"one block is copied, not the stack below it ({before} -> {after})")

    # The copy is undoable like any other edit.
    pg.click("#undo")
    pg.wait_for_timeout(300)
    check(pg.evaluate(COUNT_JS) == before, "Undo removes the copy")

    # A block with blocks inside it keeps its contents (the repeat's body).
    # The repeat's own label (the default script is: when flag clicked > repeat 4 { move, turn }).
    repeat = pg.get_by_text("repeat", exact=True).first
    repeat.click(button="right")
    pg.wait_for_timeout(400)
    pg.locator(".blocklyContextMenu .blocklyMenuItemContent", has_text="Duplicate this block only").first.click()
    pg.wait_for_timeout(400)
    after_repeat = pg.evaluate(COUNT_JS)
    check(after_repeat == before + 3, f"copying the repeat keeps its body: repeat, move and turn ({before} -> {after_repeat})")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
raise SystemExit(1 if failures else 0)
