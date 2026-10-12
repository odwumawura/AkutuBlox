"""Web builder, B5 (applied): the theme's font pair and spacing scale change the preview and the exported site.
   python3 tests/web_theme_test.py   (dev server on :5173)
"""
import os, tempfile, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "components.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(accept_downloads=True, viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.click("#tab-web")
    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(1200)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
        pg.wait_for_timeout(300)

    pg.select_option("#theme-font", "poppins-nunito")
    pg.select_option("#theme-spacing", "spacious")
    pg.wait_for_timeout(800)
    frame = pg.frame_locator("#preview-frame")
    body_font = frame.locator("body").evaluate("e => getComputedStyle(e).fontFamily")
    h1_font = frame.locator("h1").first.evaluate("e => getComputedStyle(e).fontFamily")
    gap = frame.locator(".akutu-columns").evaluate("e => getComputedStyle(e).rowGap")
    check("Poppins" in body_font, f"preview: body font is the pair's body font ({body_font[:40]})")
    check("Nunito" in h1_font, f"preview: headings use the pair's heading font ({h1_font[:40]})")
    check(gap == "24px", f"preview: spacious gives 24 px gaps (got {gap})")

    with pg.expect_download() as dl:
        pg.click("#export")
    path = os.path.join(tempfile.mkdtemp(), "site.zip")
    dl.value.save_as(path)
    css = zipfile.ZipFile(path).read("styles.css").decode()
    check('font-family: "Poppins"' in css and 'font-family: "Nunito"' in css, "exported styles.css has the font pair")
    check("gap: 24px" in css, "exported styles.css has the spacious gap")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nALL PASSED")
