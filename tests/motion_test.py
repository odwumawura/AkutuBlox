"""Motion blocks: go to x/y, change x/y, set x/y, point in direction. Run on the stage and check where the Cat ends up.
   python3 tests/motion_test.py   (dev server on :5173)
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
    """Link blocks with `next`, and return the first one."""
    for a, b in zip(blocks, blocks[1:]):
        a["next"] = {"block": b}
    return blocks[0]

SCRIPT = [{"id": "m-1", "x": 40, "y": 40, "blocks": [{
    "type": "event_flag",
    "inputs": {"DO": {"block": chain(
        op("motion_goto", X=100, Y=-20),
        op("motion_changex", DX=-30),     # 70
        op("motion_sety", Y=60),          # y 60
        op("motion_changey", DY=-10),     # y 50
        op("motion_point", DIRECTION=180),
        op("motion_setx", X=999),         # clamps to the right edge (240)
    )}},
}]}]
EXPECTED = {"x": 240, "y": 50, "dir": 180}

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SCRIPT)
    pg.wait_for_timeout(300)
    saved = pg.evaluate("() => window.__akutu.scripts()")
    check(len(saved) == 1, "script loads into the editor")

    pg.click("#run")
    pg.wait_for_timeout(2500)
    cat = next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")
    check(abs(cat["x"] - EXPECTED["x"]) < 0.5, f"x ends at {EXPECTED['x']} (got {cat['x']:.1f})")
    check(abs(cat["y"] - EXPECTED["y"]) < 0.5, f"y ends at {EXPECTED['y']} (got {cat['y']:.1f})")
    check(abs(cat["dir"] - EXPECTED["dir"]) < 0.5, f"direction ends at {EXPECTED['dir']} (got {cat['dir']:.1f})")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
