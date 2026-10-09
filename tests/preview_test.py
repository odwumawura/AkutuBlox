"""Web preview runs the same interactions as the exported site (starter page: Get Started shows the message).
   python3 tests/preview_test.py   (dev server on :5173)
"""
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)) if "Unable to decode audio data" not in str(e) else None)
    pg.goto("http://localhost:5173/", wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.click("#tab-web")
    pg.wait_for_timeout(1200)
    frame = pg.frame_locator("#preview-frame")
    hidden_before = frame.locator("#msg").is_hidden()
    frame.get_by_role("button", name="Get Started").click()
    pg.wait_for_timeout(300)
    ok = hidden_before and frame.locator("#msg").is_visible() and not errs
    print("PASS" if ok else "FAIL", "preview button shows the hidden message")
    b.close()
    print("RESULT:", "ALL PASSED" if ok else "1 FAILED")
    sys.exit(0 if ok else 1)
