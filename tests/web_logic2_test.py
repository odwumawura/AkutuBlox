"""Web builder, batch B7: and / or / not, comparisons as values, checkbox state, counter and timer display.
   python3 tests/web_logic2_test.py   (dev server on :5173)
"""
import os, re, tempfile, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "logic-web.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch()
    pg = browser.new_page(accept_downloads=True, viewport={"width": 1400, "height": 800})
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

    canvas = pg.frame_locator("#gjs iframe").first
    check(canvas.locator(".akutu-counter").text_content() == "0", "counter starts at 0 on the canvas")
    check(canvas.locator(".akutu-timer").text_content() == "0", "timer display starts at 0 on the canvas")

    pg.click("#side-interactions")
    pg.wait_for_timeout(500)
    toolbox = pg.locator("#iblockly").text_content()
    check("Conditions" in toolbox and "Decide" in toolbox, "the interaction palette has Conditions and Decide")

    with pg.expect_download() as dl:
        pg.click("#export")
    path = os.path.join(tempfile.mkdtemp(), "site.zip")
    dl.value.save_as(path)
    out = tempfile.mkdtemp()
    zipfile.ZipFile(path).extractall(out)
    index = open(os.path.join(out, "index.html")).read()
    check('data-show="score"' in index and 'data-show="secs"' in index, "counter and timer are exported with the variable they show")

    site = browser.new_page()
    site_errors = []
    site.on("pageerror", lambda e: site_errors.append(str(e)))
    site.on("console", lambda m: site_errors.append(m.text) if m.type == "error" else None)
    site.goto("file://" + os.path.join(out, "index.html"))
    site.wait_for_timeout(400)
    check(site.locator("#score").text_content() == "0", "exported counter starts at 0")

    site.click("#plus")
    check(site.locator("#score").text_content() == "1", "plus one moves the counter to 1")

    site.click("#check")
    check(site.locator("#res").text_content() == "Not yet", "unticked box: the condition is false")
    site.check("#cb")
    site.click("#check")
    check(site.locator("#res").text_content() == "Passed", "ticked and score 1: the condition is true")

    site.click("#plus")
    site.click("#check")
    check(site.locator("#res").text_content() == "Passed", "ticked and score 2 (or): still true")

    site.click("#plus")
    site.click("#check")
    check(site.locator("#res").text_content() == "Not yet", "score 3: the or is false")

    site.click("#start")
    site.wait_for_timeout(2300)
    clock = site.locator("#clock").text_content()
    check(re.fullmatch(r"[1-9]\d* s", clock or "") is not None, f"timer display counts seconds (got {clock!r})")

    check(not site_errors, f"no errors in the exported site under the CSP ({site_errors})")
    check(not errors, f"no page errors in the editor ({errors})")
    browser.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nALL PASSED")
