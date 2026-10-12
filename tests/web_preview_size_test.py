"""Web builder, P2: responsive preview. Desktop, tablet (768 px) and phone (390 px) widths; the two-column layout stacks on a phone.
   python3 tests/web_preview_size_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "components.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch()
    pg = browser.new_page(viewport={"width": 1400, "height": 800})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.click("#tab-web")
    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(1200)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
        pg.wait_for_timeout(300)
    pg.wait_for_timeout(500)

    frame = pg.locator("#preview-frame")
    def tracks():
        return pg.frame_locator("#preview-frame").locator(".akutu-columns").evaluate(
            "e => getComputedStyle(e).gridTemplateColumns.split(' ').length")

    check(pg.locator("#preview-size").input_value() == "desktop", "preview width starts at desktop")
    check(tracks() == 2, "desktop: two columns")

    pg.select_option("#preview-size", "tablet")
    pg.wait_for_timeout(300)
    w = frame.bounding_box()["width"]
    check(abs(w - 768) < 2, f"tablet: frame is 768 px wide (got {w:.0f})")
    check(tracks() == 2, "tablet: still two columns")

    pg.select_option("#preview-size", "mobile")
    pg.wait_for_timeout(300)
    w = frame.bounding_box()["width"]
    check(abs(w - 390) < 2, f"phone: frame is 390 px wide (got {w:.0f})")
    check(tracks() == 1, "phone: the columns stack")

    pg.select_option("#preview-size", "desktop")
    pg.wait_for_timeout(300)
    pane = pg.locator(".side-pane").first.bounding_box()["width"]
    check(abs(frame.bounding_box()["width"] - pane) < 2, "back to desktop: the frame fills the pane")
    check(tracks() == 2, "desktop again: two columns")

    check(not errors, f"no page errors ({errors})")
    browser.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nALL PASSED")
