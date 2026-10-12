"""Web builder, P1: set the home page. The home page is exported as index.html, the old home keeps its content
   under a new file name, and links follow the pages (not the file names).
   python3 tests/web_home_test.py   (dev server on :5173)
"""
import os, tempfile, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "linked-pages.akutu")
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
    dialogs = []
    def on_dialog(d):
        dialogs.append(d.message)
        d.accept()
    pg.on("dialog", on_dialog)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.click("#tab-web")
    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(1200)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
        pg.wait_for_timeout(300)

    # Setting the current home page does nothing but say so.
    pg.click("#set-home")
    pg.wait_for_timeout(300)
    check(dialogs and dialogs[-1] == "Home is already the home page.", f"home page: refused with a message ({dialogs[-1:]})")

    # Make About the home page.
    pg.select_option("#page-select", "about")
    pg.wait_for_timeout(300)
    pg.click("#set-home")
    pg.wait_for_timeout(400)
    options = pg.locator("#page-select option").all_inner_texts()
    check(options == ["Home (page-3.html)", "About (index.html)"], f"options after set-home (got {options})")

    # Export and check the files.
    with pg.expect_download() as dl:
        pg.click("#export")
    path = os.path.join(tempfile.mkdtemp(), "site.zip")
    dl.value.save_as(path)
    z = zipfile.ZipFile(path)
    names = z.namelist()
    check("index.html" in names, f"index.html is exported ({names})")
    index = z.read("index.html").decode()
    check("About page text" in index, "index.html holds the About page")
    old_files = [n for n in names if n.endswith(".html") and n != "index.html"]
    check(len(old_files) == 1, f"old home has one new file ({old_files})")
    old = z.read(old_files[0]).decode() if old_files else ""
    check("Fixture heading" in old, "the old home keeps its content")
    check('href="index.html"' in old, "the old home's link to About now points to index.html")
    check('href="about.html"' not in old and 'about.html' not in index, "no link to about.html remains")

    # Delete rules still hold for the new home.
    pg.select_option("#page-select", "about")
    pg.wait_for_timeout(300)
    pg.click("#delete-page")
    pg.wait_for_timeout(300)
    check(dialogs[-1] == "The home page cannot be deleted.", "the new home page cannot be deleted")

    check(not errors, f"no page errors ({errors})")
    browser.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nALL PASSED")
