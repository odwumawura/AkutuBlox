"""Batch 21: graphic effects (colour, ghost, brightness) and the volume reporter.
   python3 tests/effects_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
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

def hat(id_, y, body):
    return {"id": id_, "x": 40, "y": y, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": body}}}]}

def sprite(pg, name):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == name)

def fx(pg):
    return sprite(pg, "Cat").get("effects")

def fx_set(effect, n):
    return {"type": "fx_set", "fields": {"EFFECT": effect}, "inputs": {"VALUE": lit(n)}}

def fx_change(effect, n):
    return {"type": "fx_change", "fields": {"EFFECT": effect}, "inputs": {"VALUE": lit(n)}}

def load_and_run(pg, scripts, wait=700):
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", scripts)
    pg.wait_for_timeout(400)
    pg.click("#run")
    pg.wait_for_timeout(wait)

def stage_png(pg):
    return pg.locator("#stage").screenshot()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.on("dialog", lambda d: d.dismiss())
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.set_input_files("#open-file", os.path.join(os.path.dirname(__file__), "fixtures", "touching.akutu"))
    pg.wait_for_timeout(500)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)
    pg.click("#sprite-list .chip-name >> text=Cat")
    pg.wait_for_timeout(250)

    # 1. Set, change, and clamp. Colour wraps (250 -> 50); ghost stops at 0..100; brightness at -100..100.
    load_and_run(pg, [hat("c-flag", 40, chain(
        fx_set("color", 250),
        fx_set("ghost", 200),
        fx_change("brightness", 150),
        fx_change("brightness", -30),
        fx_change("ghost", -40),
    ))])
    check(fx(pg) == {"color": 50, "ghost": 60, "brightness": 70}, f"set/change/clamp give colour 50, ghost 60, brightness 70 (got {fx(pg)})")

    # 2. Green flag resets effects to zero.
    load_and_run(pg, [hat("c-flag", 40, {"type": "motion_changex", "inputs": {"DX": lit(1)}})])
    check(fx(pg) == {"color": 0, "ghost": 0, "brightness": 0}, f"green flag resets effects (got {fx(pg)})")

    # 3. Ghost 100 makes the Cat invisible on stage, and clear brings it back.
    load_and_run(pg, [hat("c-flag", 40, {"type": "fx_clear"})])  # clean start position and no effects
    base_png = stage_png(pg)
    load_and_run(pg, [hat("c-flag", 40, fx_set("ghost", 100))])
    ghost_png = stage_png(pg)
    check(ghost_png != base_png, "ghost 100 changes the stage picture")
    load_and_run(pg, [hat("c-flag", 40, chain(fx_set("ghost", 100), {"type": "fx_clear"}))])
    check(fx(pg) == {"color": 0, "ghost": 0, "brightness": 0}, f"clear graphic effects resets (got {fx(pg)})")
    check(stage_png(pg) == base_png, "after clear the stage matches the original picture")

    # 4. Colour and brightness change the picture (canvas filters, not Safari).
    load_and_run(pg, [hat("c-flag", 40, fx_set("color", 60))])
    check(stage_png(pg) != base_png, "colour 60 changes the stage picture")
    load_and_run(pg, [hat("c-flag", 40, fx_set("brightness", -80))])
    check(stage_png(pg) != base_png, "brightness -80 changes the stage picture")

    # 5. Unknown effect names are ignored.
    load_and_run(pg, [hat("c-flag", 40, {"type": "fx_set", "fields": {"EFFECT": "fisheye"}, "inputs": {"VALUE": lit(50)}})])
    check(fx(pg) == {"color": 0, "ghost": 0, "brightness": 0}, "unknown effect name does nothing")

    # 6. Volume reporter: set volume 40, then move by the volume.
    load_and_run(pg, [hat("c-flag", 40, chain(
        {"type": "motion_goto", "inputs": {"X": lit(0), "Y": lit(0)}},
        {"type": "sound_setvolume", "inputs": {"VOLUME": lit(40)}},
        {"type": "motion_changex", "inputs": {"DX": {"block": {"type": "sound_getvolume"}}}},
    ))])
    check(sprite(pg, "Cat")["x"] == 40, f"move by volume reporter moves to x 40 (got {sprite(pg, 'Cat')['x']})")

    # 7. Stop keeps effects; the green flag resets them.
    load_and_run(pg, [hat("c-flag", 40, fx_set("ghost", 30))])
    pg.click("#stop"); pg.wait_for_timeout(300)
    check(fx(pg)["ghost"] == 30, f"stop keeps effects (got {fx(pg)})")

    check(not errs, f"no page errors ({errs})")
    b.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nall effects checks passed")
