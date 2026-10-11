"""Beginner motion (batch 18): go to sprite, go to random position, glide, bounce on edge,
   point towards a sprite, and the x position, y position and direction reporters.
   python3 tests/motion2_test.py   (dev server on :5173)
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

def hat(body):
    return [{"id": "m2", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": body}}}]}]

def goto(x, y):
    return {"type": "motion_goto", "inputs": {"X": lit(x), "Y": lit(y)}}

def cat(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == "Cat")

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

    def run(body, wait_ms=400):
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", hat(body))
        pg.wait_for_timeout(300)
        pg.click("#run")
        pg.wait_for_timeout(wait_ms)
        pg.click("#stop")
        pg.wait_for_timeout(200)
        return cat(pg)

    # Go to Dog (Dog is at -100, 0).
    c = run(chain({"type": "move2_gotosprite", "fields": {"SPRITE": "Dog"}}))
    check(abs(c["x"] + 100) < 0.5 and abs(c["y"]) < 0.5, f"go to Dog puts the Cat on Dog (x={c['x']:.1f}, y={c['y']:.1f})")

    # Random position: whole numbers, on stage.
    c = run(chain({"type": "move2_random"}))
    check(-240 <= c["x"] <= 240 and -180 <= c["y"] <= 180 and float(c["x"]).is_integer(), f"go to random position stays on stage ({c['x']}, {c['y']})")

    # Glide: half way at 0.25 s, at the target after 0.5 s (wait 1.0 s to be safe).
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", hat(chain({"type": "move2_glide", "inputs": {"SECS": lit(0.5), "X": lit(100), "Y": lit(50)}})))
    pg.wait_for_timeout(300)
    pg.click("#run")
    pg.wait_for_timeout(250)
    mid = cat(pg)
    check(0 < mid["x"] < 100 and 0 < mid["y"] < 50, f"glide is still on its way at 0.25 s (x={mid['x']:.1f}, y={mid['y']:.1f})")
    pg.wait_for_timeout(900)
    end = cat(pg)
    check(abs(end["x"] - 100) < 0.5 and abs(end["y"] - 50) < 0.5, f"glide ends on the target (x={end['x']:.1f}, y={end['y']:.1f})")
    pg.click("#stop"); pg.wait_for_timeout(200)

    # Bounce: move right to the edge, then bounce back to the left.
    c = run(chain(goto(230, 0), {"type": "motion_point", "inputs": {"DIRECTION": lit(90)}},
                  {"type": "motion_move", "fields": {"STEPS": 20}}, {"type": "move2_bounce"}))
    check(abs(c["dir"] - 270) < 1 and c["x"] <= 222.5, f"bounce turns the Cat back and keeps it on stage (dir={c['dir']:.0f}, x={c['x']:.1f})")

    # Point towards Dog (to the left): direction 270.
    c = run(chain(goto(0, 0), {"type": "move2_pointtowards", "fields": {"SPRITE": "Dog"}}))
    check(abs(c["dir"] - 270) < 1, f"point towards Dog faces left (direction {c['dir']:.0f}, want 270)")

    # Reporters: go to x 50, then move right by the Cat's own x position (so x becomes 100).
    c = run(chain(goto(50, 0), {"type": "motion_changex", "inputs": {"DX": {"block": {"type": "move2_x"}}}}))
    check(abs(c["x"] - 100) < 0.5, f"x position reporter is the Cat's x (x={c['x']:.1f}, want 100)")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
