"""Looks blocks: show, hide, change size by, set size to. Run on the stage and check the Cat's look.
   python3 tests/looks_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
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

# Ends with the Cat shown at size 60.
SHOWN = program(
    op("looks_setsize", SIZE=150),
    op("looks_changesize", CHANGE=-50),   # 100
    op("looks_hide"),
    op("looks_show"),
    op("looks_changesize", CHANGE=1000),  # clamps to 500
    op("looks_setsize", SIZE=60),
)
# Ends hidden.
HIDDEN = program(op("looks_hide"))

def cat_state(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SHOWN)
    pg.wait_for_timeout(300)
    pg.click("#run")
    pg.wait_for_timeout(2500)
    cat = cat_state(pg)
    check(cat["size"] == 60, f"size ends at 60 (got {cat['size']})")
    check(cat["visible"] is True, "Cat is shown at the end")

    pg.evaluate("(s) => window.__akutu.loadScripts(s)", HIDDEN)
    pg.wait_for_timeout(300)
    pg.click("#run")
    pg.wait_for_timeout(1500)
    cat = cat_state(pg)
    check(cat["visible"] is False, "hide hides the Cat")
    check(cat["size"] == 100, f"green flag restores the starting size (got {cat['size']})")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
