"""Backdrop blocks: switch backdrop to (by name), next backdrop (wraps). Green flag goes back to the first backdrop.
   python3 tests/backdrops_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "backdrops.akutu")
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

SWITCH_NIGHT = program(op("looks_switchbackdrop", BACKDROP="Night"))            # -> Night (index 1)
SWITCH_UNKNOWN = program(op("looks_switchbackdrop", BACKDROP="Night"),
                         op("looks_switchbackdrop", BACKDROP="Bird"))          # unknown name: no change -> Night
NEXT_TWICE = program(op("looks_nextbackdrop"), op("looks_nextbackdrop"))       # Meadow -> Night -> Sky
NEXT_WRAPS = program(*[op("looks_nextbackdrop") for _ in range(3)])            # Meadow -> ... -> Meadow
HIDE_ONLY = program(op("looks_hide"))                                          # green flag goes back to Meadow

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(500)
    if pg.locator("#prompt[open] button[value=discard]").count():  # only when there are unsaved changes
        pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)

    def run(script, wait=1500):
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", script)
        pg.wait_for_timeout(300)
        pg.click("#run")
        pg.wait_for_timeout(wait)
        return pg.evaluate("() => window.__akutu.backdrop()")

    bd = pg.evaluate("() => window.__akutu.backdrop()")
    check(bd["name"] == "Meadow" and bd["index"] == 0, f"starts on the first backdrop (got {bd['name']})")

    # The Looks palette lists the stage's backdrops.
    box = pg.evaluate("() => { const d = [...document.querySelectorAll('.blocklyToolboxCategory')].find((d) => d.textContent.trim() === 'Looks'); const r = d.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
    pg.mouse.click(box[0], box[1]); pg.wait_for_timeout(900)
    palette = [t.replace("\xa0", " ") for t in pg.evaluate("() => [...document.querySelectorAll('.blocklyFlyout text')].map((t) => t.textContent)")]
    check("switch backdrop to" in palette and "Meadow" in palette and "(no backdrops)" not in palette, "palette shows the stage's first backdrop in the switch block")

    bd = run(SWITCH_NIGHT)
    check(bd["name"] == "Night", f"switch backdrop to Night (got {bd['name']})")

    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SWITCH_NIGHT)
    pg.wait_for_timeout(300)
    saved = pg.evaluate("() => window.__akutu.scripts()")
    kept = saved[0]["blocks"][0]["inputs"]["DO"]["block"]["fields"]["BACKDROP"]
    check(kept == "Night", f"switch backdrop keeps its name after save (got {kept!r})")

    bd = run(SWITCH_UNKNOWN)
    check(bd["name"] == "Night", f"unknown backdrop name does nothing (got {bd['name']})")

    bd = run(NEXT_TWICE)
    check(bd["name"] == "Sky", f"next backdrop twice reaches Sky (got {bd['name']})")

    bd = run(NEXT_WRAPS)
    check(bd["name"] == "Meadow", f"next backdrop wraps back to Meadow (got {bd['name']})")

    bd = run(SWITCH_NIGHT)
    bd = run(HIDE_ONLY)
    check(bd["name"] == "Meadow", f"green flag goes back to the first backdrop (got {bd['name']})")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
