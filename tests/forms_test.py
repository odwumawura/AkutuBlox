"""Forms, variables, timers, palette: open, save, and run the exported site in a browser.
   python3 tests/forms_test.py   (dev server on :5173)
"""
import json, os, sys, tempfile, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIX = os.path.join(os.path.dirname(__file__), "fixtures", "forms.akutu")
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
    check(page.locator("#palette .gjs-block").count() >= 10, "component palette shows the new components")
    page.set_input_files("#open-file", FIX)
    page.wait_for_timeout(1500)
    check(page.locator("#vars-list .chip").count() == 3, "variables from the file are listed")
    page.click("#side-interactions")
    page.wait_for_timeout(800)
    check(page.locator("#iblockly .blocklyDraggable").count() >= 14, "interaction blocks appear for the form page")

    with page.expect_download() as dl:
        page.click("#save")
    saved = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename)
    dl.value.save_as(saved)
    data = json.load(open(saved))
    home = data["web"]["pages"][0]
    trig = [ix["trigger"]["type"] for ix in home["interactions"]]
    check(trig == ["formSubmitted", "checkboxChecked", "textChanged", "variableEquals", "timerReached", "clicked"], f"triggers survive save: {trig}")
    timer = home["interactions"][4]["trigger"]["params"]
    check(timer == {"seconds": 1}, f"timer parameter survives save: {timer}")
    check([v["name"] for v in data["web"]["variables"]] == ["who", "typed", "agreed"], "variables survive save")
    check(home["root"]["children"][1]["type"] == "form" and home["root"]["children"][1]["children"][2]["props"].get("submit") is True, "form and submit button survive save")

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
    site.wait_for_timeout(300)
    check(site.is_hidden("#greeting"), "greeting starts hidden")
    site.wait_for_timeout(1300)
    check(site.inner_text("#status") == "Timer done", "timer runs after 1 second")

    site.fill("#name", "Ama")
    site.check("#agree")
    site.wait_for_timeout(100)
    color = site.eval_on_selector("#h1", "e => getComputedStyle(e).color")
    check(color == "rgb(180, 83, 9)", f"variable watcher fires when the checkbox is ticked ({color})")

    site.click("#send")
    site.wait_for_timeout(200)
    check(site.is_visible("#greeting") and site.inner_text("#greeting") == "Ama", "form submit reads the field and shows it")
    check(site.url.endswith("index.html") and "?" not in site.url, "form submit does not reload or navigate")

    site.click("#h1")
    site.wait_for_timeout(1400)
    check(site.is_hidden("#pic"), "wait, move, and fade out run in order")

    check(not site_errors, "exported site has no script errors")
    check(not errors, "no errors in the editor" + ("" if not errors else f": {errors[:3]}"))
    browser.close()

print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED")
sys.exit(1 if failures else 0)
