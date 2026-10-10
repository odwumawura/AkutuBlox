"""Costume blocks: switch costume to (by name), next costume (wraps). Green flag restores the starting costume.
   python3 tests/costumes_test.py   (dev server on :5173)
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

SWITCH_DOG = program(op("looks_switchcostume", COSTUME="Dog"))              # -> index 1
SWITCH_UNKNOWN = program(op("looks_switchcostume", COSTUME="Dog"),
                         op("looks_switchcostume", COSTUME="Bird"))         # unknown name is a no-op -> index 1
NEXT_WRAPS = program(op("looks_nextcostume"), op("looks_nextcostume"))      # 0 -> 1 -> 0
NEXT_ONCE = program(op("looks_nextcostume"))                                # -> index 1
HIDE_ONLY = program(op("looks_hide"))                                       # green flag resets the costume to 0

def cat_state(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.set_input_files("#open-file", "tests/fixtures/costumes.akutu")
    pg.wait_for_timeout(500)
    if pg.locator("#prompt[open] button[value=discard]").count():  # only when there are unsaved changes
        pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)

    def run(script, wait=1500):
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", script)
        pg.wait_for_timeout(300)
        pg.click("#run")
        pg.wait_for_timeout(wait)
        return cat_state(pg)

    check([c["name"] for c in cat_state(pg).get("costumes", [])] == ["Cat", "Dog"], "Cat has two costumes, Cat and Dog")

    # The palette lists the edited sprite's costumes (the flyout is rebuilt when Looks opens).
    box = pg.evaluate("() => { const d = [...document.querySelectorAll('.blocklyToolboxCategory')].find((d) => d.textContent.trim() === 'Looks'); const r = d.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
    pg.mouse.click(box[0], box[1]); pg.wait_for_timeout(900)
    palette = pg.evaluate("() => [...document.querySelectorAll('.blocklyFlyout text')].map((t) => t.textContent)")
    check("Cat" in palette and "(no\xa0costumes)" not in palette, "palette shows the sprite's costumes, not the empty placeholder")

    cat = run(SWITCH_DOG)
    check(cat["costumeIndex"] == 1 and cat["costume"] == "builtin:dog", f"switch costume to Dog (got index {cat['costumeIndex']})")

    # The saved script keeps the chosen costume name (the dropdown accepted it).
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SWITCH_DOG)
    pg.wait_for_timeout(300)
    saved = pg.evaluate("() => window.__akutu.scripts()")
    kept = saved[0]["blocks"][0]["inputs"]["DO"]["block"]["fields"]["COSTUME"] if saved else None
    check(kept == "Dog", f"switch costume keeps its name after save (got {kept!r})")

    cat = run(SWITCH_UNKNOWN)
    check(cat["costumeIndex"] == 1, f"unknown costume name does nothing (got index {cat['costumeIndex']})")

    cat = run(NEXT_WRAPS)
    check(cat["costumeIndex"] == 0, f"next costume wraps back to the first (got index {cat['costumeIndex']})")

    cat = run(NEXT_ONCE)
    check(cat["costumeIndex"] == 1, f"next costume moves to the second (got index {cat['costumeIndex']})")

    cat = run(HIDE_ONLY)
    check(cat["costumeIndex"] == 0 and cat["visible"] is False, f"green flag restores the starting costume (got index {cat['costumeIndex']})")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
