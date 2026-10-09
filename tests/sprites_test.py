"""Blocks: sprite list, per-sprite scripts, backdrops, and a green flag that runs every sprite.
   python3 tests/sprites_test.py   (dev server on :5173)
"""
import json, os, sys, tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIX = os.path.join(os.path.dirname(__file__), "fixtures", "sprites.akutu")
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
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Unable to decode audio data" not in m.text else None)  # headless Chromium cannot decode scratch-blocks click sounds
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    # A new project starts with one sprite.
    check(page.locator("#sprite-list .sprite-chip").count() == 1, "starter project has one sprite (Cat)")

    # Add a sprite: it gets its own, empty script area.
    page.select_option("#new-costume", "builtin:dog")
    page.click("#add-sprite")
    page.wait_for_timeout(300)
    check(page.locator("#sprite-list .sprite-chip").count() == 2, "+ Sprite adds a second sprite")
    check(len(page.evaluate("() => window.__akutu.scripts()")) == 0, "a new sprite has no scripts")
    page.locator("#sprite-list .sprite-chip .chip-name").first.click()
    page.wait_for_timeout(300)
    check(len(page.evaluate("() => window.__akutu.scripts()")) >= 1, "switching back shows the Cat's scripts")

    # Open the fixture with two sprites and a night backdrop.
    # The project has unsaved changes (the new sprite), so the save prompt asks first.
    page.set_input_files("#open-file", FIX)
    page.wait_for_timeout(500)
    page.click("#prompt button[value=discard]")
    page.wait_for_timeout(1500)
    check(page.locator("#sprite-list .sprite-chip").count() == 2, "file with two sprites opens both")
    check(page.input_value("#backdrop-select") == "builtin:night", "backdrop from the file is selected")

    # Green flag: both sprites run their own scripts.
    page.click("#run")
    page.wait_for_timeout(2500)
    sprites = {s["id"]: s for s in page.evaluate("() => window.__akutu.sprites()")}
    check(abs(sprites["star"]["x"] - 0) < 1, f"Star moved 100 steps right from -100 (x={sprites['star']['x']:.0f})")
    check(sprites["cat"]["x"] != 0 or sprites["cat"]["y"] != 0 or sprites["cat"]["dir"] != 90, "Cat ran its square script")

    # Switching sprites in the middle: the star's scripts are still there.
    page.locator("#sprite-list .sprite-chip .chip-name", has_text="Star").click()
    page.wait_for_timeout(300)
    check(page.locator("#blocklyDiv .blocklyDraggable").count() >= 1, "Star's scripts load when Star is selected")

    # Save: both sprites and the backdrop are in the file.
    with page.expect_download() as dl:
        page.click("#save")
    saved = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename)
    dl.value.save_as(saved)
    data = json.load(open(saved))
    names = [s["name"] for s in data["blocks"]["sprites"]]
    check(names == ["Cat", "Star"], f"both sprites save: {names}")
    star = data["blocks"]["sprites"][1]
    check(star["scripts"] and star["scripts"][0]["blocks"][0]["type"] == "event_flag", "Star's script saves under Star")
    check(data["blocks"]["stage"]["backdrops"][0]["source"] == "builtin:night", "backdrop saves")

    # Choose a different backdrop: it becomes the active one.
    page.select_option("#backdrop-select", "builtin:sky")
    page.wait_for_timeout(200)
    check(page.input_value("#backdrop-select") == "builtin:sky", "choosing a backdrop selects it")

    check(not errors, "no errors" + ("" if not errors else f": {errors[:3]}"))
    browser.close()

print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED")
sys.exit(1 if failures else 0)
