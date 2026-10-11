"""Web builder, batch B2/B3/B5/B8: rename and delete pages, hidden elements on the canvas,
theme controls (stored), and the Content Security Policy on exported sites.
   python3 tests/web_manage_test.py   (dev server on :5173)
"""
import json, os, tempfile, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
HERE = os.path.dirname(__file__)
SITE = os.path.join(HERE, "fixtures", "site.akutu")
LINKED = os.path.join(HERE, "fixtures", "linked-pages.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

def option_texts(pg):
    return pg.locator("#page-select option").all_inner_texts()

def open_site(pg, path):
    pg.click("#tab-web")
    pg.set_input_files("#open-file", path)
    pg.wait_for_timeout(1200)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
        pg.wait_for_timeout(300)

def web(pg):
    return pg.evaluate("() => window.__akutu.web()")

with sync_playwright() as p:
    browser = p.chromium.launch()
    pg = browser.new_page(accept_downloads=True, viewport={"width": 1400, "height": 800})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    dialogs = []
    answers = {"prompt": None}

    def on_dialog(d):
        dialogs.append((d.type, d.message))
        if d.type == "prompt":
            d.accept(answers["prompt"] or "")
        else:
            d.accept()

    pg.on("dialog", on_dialog)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    # ---- B2: rename and delete pages ----
    open_site(pg, LINKED)
    check(option_texts(pg) == ["Home (index.html)", "About (about.html)"], f"fixture has Home and About (got {option_texts(pg)})")

    pg.select_option("#page-select", "about")
    pg.wait_for_timeout(400)
    answers["prompt"] = "Our story"
    pg.click("#rename-page")
    pg.wait_for_timeout(400)
    check("Our story (about.html)" in option_texts(pg), f"rename shows the new name, file name unchanged (got {option_texts(pg)})")

    dialogs.clear()
    answers["prompt"] = "home"  # same as Home, different case: must be refused
    pg.select_option("#page-select", "about")
    pg.wait_for_timeout(400)
    pg.click("#rename-page")
    pg.wait_for_timeout(300)
    check(any("already called home" in m for _, m in dialogs), f"duplicate name refused (dialogs: {dialogs})")

    dialogs.clear()
    pg.select_option("#page-select", "home")
    pg.wait_for_timeout(400)
    pg.click("#delete-page")
    pg.wait_for_timeout(300)
    check(any("home page cannot be deleted" in m for _, m in dialogs), "the home page cannot be deleted")
    check(len(option_texts(pg)) == 2, "home page is still there after the refused delete")

    dialogs.clear()
    pg.select_option("#page-select", "about")
    pg.wait_for_timeout(400)
    pg.click("#delete-page")
    pg.wait_for_timeout(300)
    check(any("linked from Home" in m for _, m in dialogs), f"deleting a linked page is refused (dialogs: {dialogs})")
    check(len(option_texts(pg)) == 2, "linked page is still there")

    # The plain fixture links to About from a link called "About us". Remove the link first, then About can go.
    open_site(pg, SITE)
    pg.frame_locator("#gjs iframe").first.locator("a", has_text="About us").click()
    pg.wait_for_timeout(300)
    pg.click("#delete-el")
    pg.wait_for_timeout(300)
    pg.select_option("#page-select", "about")
    pg.wait_for_timeout(400)
    dialogs.clear()
    pg.click("#delete-page")
    pg.wait_for_timeout(300)
    check(len(option_texts(pg)) == 1 and "Home" in option_texts(pg)[0], f"unlinked page is deleted (got {option_texts(pg)})")
    check(not any(p["id"] == "about" for p in web(pg)["pages"]), "deleted page is gone from the project")
    check(pg.frame_locator("#gjs iframe").first.locator("h1", has_text="Fixture heading").count() == 1, "home page shows after a delete")

    # ---- B3: hidden elements on the canvas ----
    canvas = pg.frame_locator("#gjs iframe").first
    msg = canvas.locator("p", has_text="Hello from the fixture!")
    check(msg.count() == 1 and msg.first.is_visible(), "hidden paragraph is shown on the canvas by default")
    msg.first.click()
    pg.wait_for_timeout(300)
    check(pg.locator("#element-panel").is_visible(), "clicking a hidden element selects it (element panel opens)")
    check(pg.is_checked("#el-hidden"), "panel shows the element is hidden")

    pg.click("#show-hidden")  # editor view: hide hidden elements
    pg.wait_for_timeout(300)
    check(pg.get_attribute("#show-hidden", "aria-pressed") == "false", "show-hidden toggle is off")
    check(not msg.first.is_visible(), "with the toggle off, the hidden element is not shown")
    pg.click("#show-hidden")
    pg.wait_for_timeout(300)
    check(msg.first.is_visible(), "toggle back on: element visible again")

    # Make it visible on the live site: clear the hidden box, then export.
    msg.first.click()
    pg.wait_for_timeout(300)
    pg.uncheck("#el-hidden")
    pg.wait_for_timeout(300)
    home = next(p for p in web(pg)["pages"] if p["id"] == "home")
    check(not any(c.get("props", {}).get("hidden") for c in home["root"]["children"] if c["id"] == "msg"), "unchecking hidden clears props.hidden")

    with pg.expect_download() as dl:
        pg.click("#export")
    zip_path = os.path.join(tempfile.mkdtemp(), "site.zip")
    dl.value.save_as(zip_path)
    out = tempfile.mkdtemp()
    zipfile.ZipFile(zip_path).extractall(out)
    index_html = open(os.path.join(out, "index.html")).read()
    check('<p id="msg">Hello from the fixture!</p>' in index_html, "a visible element is exported without the hidden attribute")

    # Hide it again and check it is exported hidden.
    canvas.locator("p", has_text="Hello from the fixture!").first.click()
    pg.wait_for_timeout(300)
    pg.check("#el-hidden")
    pg.wait_for_timeout(200)
    home = next(p for p in web(pg)["pages"] if p["id"] == "home")
    check(any(c.get("props", {}).get("hidden") for c in home["root"]["children"] if c["id"] == "msg"), "checking hidden sets props.hidden")

    # ---- B5: theme controls are stored ----
    pg.select_option("#theme-font", "nunito-inter")
    pg.select_option("#theme-spacing", "spacious")
    pg.wait_for_timeout(300)
    theme = web(pg)["theme"]
    check(theme.get("fontPair") == "nunito-inter" and theme.get("spacingScale") == "spacious", f"theme is stored in the project (got {theme})")

    # ---- B8: CSP on the exported site ----
    with pg.expect_download() as dl:
        pg.click("#export")
    zip_path = os.path.join(tempfile.mkdtemp(), "site.zip")
    dl.value.save_as(zip_path)
    out = tempfile.mkdtemp()
    zipfile.ZipFile(zip_path).extractall(out)
    index_html = open(os.path.join(out, "index.html")).read()
    check("Content-Security-Policy" in index_html and "script-src 'self'" in index_html, "exported pages carry a Content-Security-Policy")
    check("object-src 'none'" in index_html, "CSP blocks plugins (object-src 'none')")

    # The exported site still runs under the policy: the button reveals the message.
    site = browser.new_page()
    csp_errors = []
    site.on("console", lambda m: csp_errors.append(m.text) if m.type == "error" else None)
    site.on("pageerror", lambda e: csp_errors.append(str(e)))
    site.goto("file://" + os.path.join(out, "index.html"))
    site.wait_for_timeout(500)
    site.click("text=Get Started")
    site.wait_for_timeout(300)
    check(site.locator("#msg").is_visible(), "exported site runs its script under the CSP (file://)")
    check(not csp_errors, f"no CSP or script errors in the exported site ({csp_errors})")

    check(not errors, f"no page errors in the editor ({errors})")
    browser.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nALL PASSED")
