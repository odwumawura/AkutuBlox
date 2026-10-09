"""Logic: if/else, timers, page visited, form clearing. Open, save, export, and run the site in a browser.
   python3 tests/logic_test.py   (dev server on :5173)
"""
import json, os, sys, tempfile, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIX = os.path.join(os.path.dirname(__file__), "fixtures", "logic.akutu")
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
    page.wait_for_timeout(500)
    page.set_input_files("#open-file", FIX)
    page.wait_for_timeout(1500)
    page.click("#side-interactions")
    page.wait_for_timeout(800)
    check(page.locator("#iblockly .blocklyDraggable").count() >= 12, "logic blocks appear, including the if/else")

    with page.expect_download() as dl:
        page.click("#save")
    saved = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename)
    dl.value.save_as(saved)
    data = json.load(open(saved))
    home = data["web"]["pages"][0]
    branch = home["interactions"][0]["actions"][1]
    check(branch["type"] == "if" and branch["params"]["op"] == "greaterOrEqual" and branch["params"]["then"][0]["params"]["text"] == "Winner!" and branch["params"]["else"][0]["params"]["text"] == "Keep going", "if/else branches survive save")
    check(data["web"]["pages"][1]["interactions"][0]["trigger"] == {"type": "pageVisited", "params": {"pageId": "home"}}, "page visited trigger survives save")

    with page.expect_download() as dl2:
        page.click("#export")
    zpath = os.path.join(tempfile.mkdtemp(), dl2.value.suggested_filename)
    dl2.value.save_as(zpath)
    out = tempfile.mkdtemp()
    zipfile.ZipFile(zpath).extractall(out)

    site = browser.new_page()
    site_errors = []
    site.on("pageerror", lambda e: site_errors.append(str(e)))
    site.goto("file://" + os.path.join(out, "index.html"))
    site.wait_for_timeout(2300)
    check(site.inner_text("#status") == "Two seconds", "timer starts on load and fires a variable watcher at 2")

    site.click("#add")
    site.wait_for_timeout(100)
    check(site.inner_text("#status") == "Keep going", "if/else takes the else branch below 3")
    site.click("#add")
    site.click("#add")
    site.wait_for_timeout(100)
    check(site.inner_text("#status") == "Winner!", "if/else takes the then branch at 3")

    site.fill("#name", "Ama")
    site.click("#send")
    site.wait_for_timeout(100)
    check(site.input_value("#name") == "", "form submit clears the form")
    check("?" not in site.url, "form submit does not navigate")

    site.click("#treset")
    site.wait_for_timeout(100)
    check(site.inner_text("#status") == "Winner!", "reset clock does not change the status")

    site.goto("file://" + os.path.join(out, "about.html"))
    site.wait_for_timeout(200)
    check(site.is_visible("#welcome"), "visiting about after home shows the welcome message")

    fresh = browser.new_context().new_page()
    fresh.goto("file://" + os.path.join(out, "about.html"))
    fresh.wait_for_timeout(200)
    check(fresh.is_hidden("#welcome"), "a new visit to about (no earlier home visit) keeps it hidden")

    check(not site_errors, "exported site has no script errors")
    check(not errors, "no errors in the editor" + ("" if not errors else f": {errors[:3]}"))
    browser.close()

print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED")
sys.exit(1 if failures else 0)
