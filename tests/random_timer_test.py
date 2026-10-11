"""Random and timer (batch 17): pick random a to b (whole numbers, or decimals when an end is decimal),
   timer from the green flag, reset timer. Stop does not reset the timer.
   python3 tests/random_timer_test.py   (dev server on :5173)
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
    return [{"id": "rt1", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": body}}}]}]

def pick(a, b):
    return {"type": "random_pick", "inputs": {"FROM": lit(a), "TO": lit(b)}}

def timer():
    return {"type": "timer_value"}

def change_x(reporter):
    return {"type": "motion_changex", "inputs": {"DX": {"block": reporter}}}

def wait(secs):
    return {"type": "control_wait", "inputs": {"SECONDS": lit(secs)}}

def cat_x(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == "Cat")["x"]

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

    def run(body, wait_ms=300):
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", hat(body))
        pg.wait_for_timeout(300)
        pg.click("#run")
        pg.wait_for_timeout(wait_ms)
        return cat_x(pg)

    # Whole numbers: 10 runs, each moves the Cat by a pick from 1 to 6 (the Cat starts at x = 0 each run).
    results = [run(chain(change_x(pick(1, 6)))) for _ in range(10)]
    check(all(abs(r - round(r)) < 1e-9 and 1 <= r <= 6 for r in results), f"whole-number picks are whole numbers from 1 to 6 ({results})")
    check(len(set(round(r) for r in results)) >= 2, "the pick is random (not always the same)")

    # Decimal: an end with a decimal point gives a decimal in range.
    results = [run(chain(change_x(pick(0, 0.5)))) for _ in range(6)]
    check(all(0 <= r <= 0.5 for r in results) and any(abs(r - round(r)) > 1e-6 for r in results), f"decimal picks lie between 0 and 0.5 ({results})")
    pg.click("#stop"); pg.wait_for_timeout(200)

    # Timer: after 0.5 s of waiting the timer reads about 0.5.
    x = run(chain(wait(0.5), change_x(timer())), wait_ms=900)
    check(0.4 <= x <= 0.8, f"the timer counts from the green flag (reads {x:.2f} after 0.5 s)")

    # Reset: after 0.5 s, reset, then the timer reads about 0 again.
    x = run(chain(wait(0.5), {"type": "timer_reset"}, change_x(timer())), wait_ms=900)
    check(0 <= x < 0.3, f"reset timer starts it again (reads {x:.2f} just after the reset)")
    pg.click("#stop"); pg.wait_for_timeout(200)

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
