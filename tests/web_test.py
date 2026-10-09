"""Web mode end-to-end: open a multi-page .akutu, edit the canvas, export a zip, run the exported site.
   python3 tests/web_test.py   (dev server on :5173)
"""
import os, sys, tempfile, zipfile, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "site.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(accept_downloads=True)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    page.click("#tab-web")
    page.set_input_files("#open-file", FIXTURE)
    page.wait_for_timeout(1500)
    options = page.locator("#page-select option").all_inner_texts()
    check(len(options) == 2, f"fixture opens with 2 pages (got {options})")

    canvas = page.frame_locator("#gjs iframe")
    check(canvas.locator("h1", has_text="Fixture heading").count() == 1, "canvas shows the home page heading")

    # Switch to the About page and check that its content loads.
    page.select_option("#page-select", "about")
    page.wait_for_timeout(800)
    check(canvas.locator("h2", has_text="About page text").count() == 1, "switching pages loads the About page")
    check(canvas.locator("h1", has_text="Fixture heading").count() == 0, "home page content is not shown on About")

    # Back to home, then export the whole site as a zip.
    page.select_option("#page-select", "home")
    page.wait_for_timeout(800)
    with page.expect_download() as dl:
        page.click("#export")
    zip_path = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename)
    dl.value.save_as(zip_path)
    names = zipfile.ZipFile(zip_path).namelist()
    check(all(n in names for n in ["index.html", "about.html", "styles.css", "script.js"]), f"zip contains the site files ({names})")

    out = tempfile.mkdtemp()
    zipfile.ZipFile(zip_path).extractall(out)
    index_html = open(os.path.join(out, "index.html"), encoding="utf-8").read()
    check('id="msg"' in index_html and "hidden" in index_html, "hidden paragraph is exported with the hidden attribute")
    check('href="about.html"' in index_html, "page link is exported as a relative file link")
    check("Fixture heading" in index_html, "exported page has the heading text")

    # Run the exported site in the browser: the button should reveal the message.
    site = browser.new_page()
    site_errors = []
    site.on("pageerror", lambda e: site_errors.append(str(e)))
    site.goto("file://" + os.path.join(out, "index.html"))
    check(site.is_hidden("#msg"), "message is hidden before the click")
    site.click("#btn")
    check(site.is_visible("#msg"), "clicking the button shows the message in the exported site")
    site.click("#to-about")
    site.wait_for_load_state()
    check(site.url.endswith("about.html"), "link navigates to about.html in the exported site")
    check(not site_errors, "exported site has no script errors")

    check(not errors, "no errors in the editor" + ("" if not errors else f": {errors[:3]}"))
    browser.close()

print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED")
sys.exit(1 if failures else 0)
