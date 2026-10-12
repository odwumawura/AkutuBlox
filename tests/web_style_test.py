"""Web builder, batch B4: style panel (presets only) for the selected element, and value checks.
   python3 tests/web_style_test.py   (dev server on :5173)
"""
import os, tempfile, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
HERE = os.path.dirname(__file__)
SITE = os.path.join(HERE, "fixtures", "site.akutu")
INJECT = os.path.join(HERE, "fixtures", "style-inject.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

def open_site(pg, path):
    pg.click("#tab-web")
    pg.set_input_files("#open-file", path)
    pg.wait_for_timeout(1200)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
        pg.wait_for_timeout(300)

def export_styles(pg):
    with pg.expect_download() as dl:
        pg.click("#export")
    path = os.path.join(tempfile.mkdtemp(), "site.zip")
    dl.value.save_as(path)
    return zipfile.ZipFile(path).read("styles.css").decode()

with sync_playwright() as p:
    browser = p.chromium.launch()
    pg = browser.new_page(accept_downloads=True, viewport={"width": 1400, "height": 800})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    open_site(pg, SITE)
    canvas = pg.frame_locator("#gjs iframe").first
    canvas.locator("h1", has_text="Fixture heading").click()
    pg.wait_for_timeout(300)
    check(pg.locator("#style-fields select, #style-fields input").count() == 10, "style panel has ten fields")

    pg.select_option("[data-style=fontSize]", "32px")
    pg.fill("[data-style=background]", "#ff0000")
    pg.select_option("[data-style=textAlign]", "center")
    pg.wait_for_timeout(300)
    font = canvas.locator("h1").evaluate("e => getComputedStyle(e).fontSize")
    bg = canvas.locator("h1").evaluate("e => getComputedStyle(e).backgroundColor")
    align = canvas.locator("h1").evaluate("e => getComputedStyle(e).textAlign")
    check(font == "32px", f"font size 32px shows on the canvas (got {font})")
    check(bg == "rgb(255, 0, 0)", f"background colour shows on the canvas (got {bg})")
    check(align == "center", f"alignment shows on the canvas (got {align})")

    css = export_styles(pg)
    check("#h1" in css and "font-size: 32px" in css, "exported styles.css has the font size")
    check("background-color: #ff0000" in css, "exported styles.css has the background colour")
    check("text-align: center" in css, "exported styles.css has the alignment")

    # Reopen the element: the panel reads the saved style back.
    canvas.locator("p", has_text="Hello from the fixture!").click()
    pg.wait_for_timeout(200)
    canvas.locator("h1", has_text="Fixture heading").click()
    pg.wait_for_timeout(300)
    check(pg.input_value("[data-style=fontSize]") == "32px", "panel shows the saved font size when the element is selected again")

    pg.click("#reset-style")
    pg.wait_for_timeout(300)
    css = export_styles(pg)
    check("font-size: 32px" not in css and "background-color: #ff0000" not in css, "reset style removes the styles")

    # A file with a free-form style value must not reach the CSS.
    open_site(pg, INJECT)
    css = export_styles(pg)
    check("evil.example" not in css and "url(" not in css, "free-form style values from a file are dropped")

    check(not errors, f"no page errors ({errors})")
    browser.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nALL PASSED")
