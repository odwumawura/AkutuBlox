"""Blocks, P6: disable and enable a block, with Undo and Redo. A disabled block does nothing when the project runs (the blocks below it still do),
   a disabled hat turns off its whole script, and the state is kept in the saved project.
   Test script: when flag clicked > move 40 > wait 1 > move 40. Final x: 80 when all is on, 40 when the first move is off, 0 when the hat is off.
   python3 tests/blocks_disable_test.py   (dev server on :5173)
"""
import json, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

SCRIPT = [{
    "id": "s-1", "x": 40, "y": 40,
    "blocks": [{
        "type": "event_flag",
        "inputs": {"DO": {"block": {
            "type": "motion_move", "fields": {"STEPS": 40},
            "next": {"block": {
                "type": "control_wait", "fields": {"DURATION": 1},
                "next": {"block": {"type": "motion_move", "fields": {"STEPS": 40}}},
            }},
        }}},
    }],
}]

def x_after_run(pg):
    """Green flag, wait for the run to finish (it takes about 1 second), then stop and read the sprite's x."""
    pg.click("#run")
    pg.wait_for_timeout(2300)
    x = pg.evaluate("() => window.__akutu.sprites()[0].x")
    pg.click("#stop")
    pg.wait_for_timeout(200)
    return round(x)

def menu(pg, block_text, item, nth=0):
    pg.get_by_text(block_text, exact=True).nth(nth).click(button="right")
    pg.wait_for_timeout(300)
    pg.locator(".blocklyContextMenu .blocklyMenuItemContent", has_text=item).first.click()
    pg.wait_for_timeout(300)

def disabled_count(pg):
    return pg.evaluate("() => JSON.stringify(window.__akutu.scripts())").count('"disabled":true')

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto("http://localhost:5173/", wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.wait_for_timeout(800)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SCRIPT)
    pg.wait_for_timeout(700)

    check(x_after_run(pg) == 80, "enabled: both moves run (x = 80)")

    # Disable the first move: the wait and the second move still run.
    menu(pg, "move", "Disable block", nth=0)
    check(disabled_count(pg) == 1, "the saved project marks one block as disabled")
    check(x_after_run(pg) == 40, "first move disabled: only the second move runs (x = 40)")

    # Undo puts the first move back on, and Redo turns it off again.
    pg.click("#undo"); pg.wait_for_timeout(300)
    check(disabled_count(pg) == 0, "Undo of disable clears the flag")
    check(x_after_run(pg) == 80, "Undo of disable: both moves run again (x = 80)")
    pg.click("#redo"); pg.wait_for_timeout(300)
    check(disabled_count(pg) == 1, "Redo of disable sets the flag again")
    check(x_after_run(pg) == 40, "Redo of disable: first move off again (x = 40)")

    # Enable it again.
    # The disabled block is the faded one.
    pg.locator("#blocklyDiv g[style*='opacity']").get_by_text("move", exact=True).first.click(button="right")
    pg.wait_for_timeout(300)
    pg.locator(".blocklyContextMenu .blocklyMenuItemContent", has_text="Enable block").first.click()
    pg.wait_for_timeout(300)
    check(disabled_count(pg) == 0, "enable clears the flag in the saved project")
    check(x_after_run(pg) == 80, "enabled again: both moves run (x = 80)")

    # Undo of enable turns the move off again; Redo turns it back on.
    pg.click("#undo"); pg.wait_for_timeout(300)
    check(disabled_count(pg) == 1, "Undo of enable sets the flag again")
    check(x_after_run(pg) == 40, "Undo of enable: first move off again (x = 40)")
    pg.click("#redo"); pg.wait_for_timeout(300)
    check(disabled_count(pg) == 0, "Redo of enable clears the flag")
    check(x_after_run(pg) == 80, "Redo of enable: both moves run (x = 80)")

    # Disable the hat: the whole script does nothing.
    menu(pg, "when", "Disable block")
    check(x_after_run(pg) == 0, "a disabled hat turns off the whole script (x = 0)")

    # The saved flag survives a load.
    snap = pg.evaluate("() => JSON.stringify(window.__akutu.scripts())")
    check('"disabled":true' in snap, "the hat's disabled flag is in the saved scripts")
    pg.evaluate("(s) => window.__akutu.loadScripts(JSON.parse(s))", snap)
    pg.wait_for_timeout(700)
    check(pg.evaluate("() => JSON.stringify(window.__akutu.scripts())") == snap, "after loading, the scripts match the saved ones")
    check(x_after_run(pg) == 0, "after loading, the disabled script still does nothing")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
raise SystemExit(1 if failures else 0)
