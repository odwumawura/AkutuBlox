"""Control blocks: forever. The loop keeps running until Stop is pressed, then stops for good.
   python3 tests/control_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

FOREVER = [{"id": "c-1", "x": 40, "y": 40, "blocks": [{
    "type": "event_flag",
    "inputs": {"DO": {"block": {
        "type": "control_forever",
        "inputs": {"DO": {"block": {"type": "motion_turn", "fields": {"DEGREES": 15}}}},
    }}},
}]}]

def cat_dir(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")["dir"]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.evaluate("(s) => window.__akutu.loadScripts(s)", FOREVER)
    pg.wait_for_timeout(300)
    pg.click("#run")
    samples = []
    for _ in range(4):
        pg.wait_for_timeout(100)
        samples.append(round(cat_dir(pg), 1))
    # Turning never hits an edge, so a changing direction means the loop is running.
    check(len(set(samples)) > 1, f"forever loop keeps turning the Cat (direction samples {samples})")

    pg.click("#stop")
    pg.wait_for_timeout(300)
    stopped = cat_dir(pg)
    pg.wait_for_timeout(1000)
    check(cat_dir(pg) == stopped, f"Stop ends the forever loop (direction stays at {stopped:.1f})")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
