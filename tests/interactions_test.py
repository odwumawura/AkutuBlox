"""Interaction editor: open blocks from a file, save them back, and run the exported behavior in a browser.
   python3 tests/interactions_test.py   (dev server on :5173)
"""
import json, os, sys, tempfile, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIX = os.path.join(os.path.dirname(__file__), "fixtures", "interactions.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(accept_downloads=True)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)) if "Unable to decode audio data" not in str(e) else None)
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Unable to decode audio data" not in m.text else None)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    page.click("#tab-web")
    page.set_input_files("#open-file", FIX)
    page.wait_for_timeout(1500)
    page.click("#side-interactions")
    page.wait_for_timeout(800)
    blocks = page.locator("#iblockly .blocklyDraggable").count()
    check(blocks >= 8, f"interaction blocks appear when the file opens (found {blocks} blocks)")

    # Save to file and check that the interactions survived the round trip.
    with page.expect_download() as dl:
        page.click("#save")
    saved_path = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename)
    dl.value.save_as(saved_path)
    saved = json.load(open(saved_path))
    home = saved["web"]["pages"][0]
    got = [(ix["trigger"]["type"], [a["type"] for a in ix["actions"]]) for ix in home["interactions"]]
    want = [("hovered", ["setTextColor"]), ("mouseLeft", ["setTextColor"]), ("clicked", ["toggle", "setBackground"]), ("pageLoaded", ["setText"])]
    check(got == want, f"interactions survive save: {got}")
    check(home["interactions"][3]["actions"][0]["params"]["text"] == "Loaded", "action parameters survive save")

    # Export and run the site.
    with page.expect_download() as dl2:
        page.click("#export")
    zpath = os.path.join(tempfile.mkdtemp(), dl2.value.suggested_filename)
    dl2.value.save_as(zpath)
    out = tempfile.mkdtemp()
    zipfile.ZipFile(zpath).extractall(out)
    site = browser.new_page()
    site_errors = []
    site.on("pageerror", lambda e: site_errors.append(str(e)) if "Unable to decode audio data" not in str(e) else None)
    site.goto("file://" + os.path.join(out, "index.html"))
    check(site.inner_text("#msg") == "Loaded", "page-loaded action runs in the exported site")
    check(site.is_hidden("#msg"), "toggle target starts hidden")
    color0 = site.eval_on_selector("#h1", "e => getComputedStyle(e).color")
    site.hover("#h1")
    site.wait_for_timeout(200)
    color1 = site.eval_on_selector("#h1", "e => getComputedStyle(e).color")
    check(color1 == "rgb(255, 0, 0)" and color1 != color0, f"hover changes text color ({color0} -> {color1})")
    site.mouse.move(0, 0)
    site.wait_for_timeout(200)
    color2 = site.eval_on_selector("#h1", "e => getComputedStyle(e).color")
    check(color2 == "rgb(29, 36, 51)", f"mouse leave restores text color ({color2})")
    site.click("#btn")
    check(site.is_visible("#msg"), "click toggles the message on")
    bg = site.eval_on_selector("#btn", "e => getComputedStyle(e).backgroundColor")
    check(bg == "rgb(15, 118, 110)", f"click sets the button background ({bg})")
    site.click("#btn")
    check(site.is_hidden("#msg"), "second click toggles the message off")
    check(not site_errors, "exported site has no script errors")

    check(not errors, "no errors in the editor" + ("" if not errors else f": {errors[:3]}"))
    browser.close()

print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED")
sys.exit(1 if failures else 0)
