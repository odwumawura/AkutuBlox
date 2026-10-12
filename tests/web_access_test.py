"""Accessibility (P3): keyboard add from the palette, focus rings, text size and high contrast (kept after reload),
   and labelled controls. Blocks mode: the palette is keyboard-usable; block editing itself has no keyboard support yet.
   python3 tests/web_access_test.py   (dev server on :5173)
"""
import os
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
    ctx = browser.new_context(viewport={"width": 1400, "height": 800})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    # Text size and contrast controls exist and are named.
    check(pg.get_attribute("#text-size", "aria-label") == "Text size", "text size control is named")
    check(pg.get_attribute("#dirty", "role") == "status", "unsaved indicator is a status region")

    # Focus ring on keyboard focus.
    pg.focus("#tab-blocks")
    pg.keyboard.press("Tab")
    outline = pg.evaluate("() => { const e = document.activeElement; const s = getComputedStyle(e); return [e.id || e.tagName, s.outlineStyle, s.outlineWidth]; }")
    check(outline[1] == "solid" and outline[2] == "3px", f"keyboard focus shows a 3px ring on {outline[0]} (got {outline[1:]})")

    # Palette from the keyboard (Web mode).
    pg.click("#tab-web")
    pg.wait_for_timeout(800)
    item = pg.locator("#palette .gjs-block").first
    check(item.get_attribute("role") == "button" and item.get_attribute("tabindex") == "0", "palette items are buttons in the tab order")
    check((item.get_attribute("aria-label") or "").startswith("Add "), f"palette item has a name ({item.get_attribute('aria-label')})")
    canvas = pg.frame_locator("#gjs iframe").first
    before = canvas.locator("h2").count()
    item.focus()
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(500)
    check(canvas.locator("h2").count() == before + 1, "Enter adds the heading from the keyboard")
    pg.keyboard.press("Space")
    pg.wait_for_timeout(400)
    check(canvas.locator("h2").count() == before + 2, "Space adds a second heading from the keyboard")

    # Text size: changes the chrome and is kept after a reload.
    size_before = pg.evaluate("() => getComputedStyle(document.querySelector('.theme-field')).fontSize")
    pg.select_option("#text-size", "largest")
    pg.wait_for_timeout(200)
    size_after = pg.evaluate("() => getComputedStyle(document.querySelector('.theme-field')).fontSize")
    check(size_after != size_before and size_after == "21px", f"largest text size scales the controls ({size_before} -> {size_after})")

    # High contrast.
    pg.click("#contrast")
    pg.wait_for_timeout(200)
    check(pg.get_attribute("#contrast", "aria-pressed") == "true", "high contrast button reports on")
    active_bg = pg.evaluate("() => getComputedStyle(document.querySelector('#tab-web') && document.querySelector('.mode.active')).backgroundColor")
    check(active_bg == "rgb(0, 0, 0)", f"high contrast: the active tab is black ({active_bg})")

    pg.reload(wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    check(pg.evaluate("() => document.documentElement.dataset.contrast") == "high", "high contrast is kept after reload")
    check(pg.evaluate("() => document.documentElement.dataset.text") == "largest", "text size is kept after reload")
    check(pg.input_value("#text-size") == "largest", "text size control shows the saved value")

    pg.select_option("#text-size", "normal")
    pg.click("#contrast")
    check(pg.evaluate("() => document.documentElement.dataset.contrast") == "normal", "contrast can be turned off again")

    check(not errors, f"no page errors ({errors})")
    browser.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nALL PASSED")
