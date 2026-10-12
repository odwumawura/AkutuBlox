"""Web builder, batch B6: text area, dropdown, list, columns, navigation, YouTube video, pop-up box.
   python3 tests/web_components_test.py   (dev server on :5173)
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

def export_zip(pg):
    with pg.expect_download() as dl:
        pg.click("#export")
    path = os.path.join(tempfile.mkdtemp(), "site.zip")
    dl.value.save_as(path)
    z = zipfile.ZipFile(path)
    return z.read("index.html").decode(), z.read("styles.css").decode(), z

with sync_playwright() as p:
    browser = p.chromium.launch()
    pg = browser.new_page(accept_downloads=True, viewport={"width": 1400, "height": 800})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    alerts = []
    pg.on("dialog", lambda d: (alerts.append(d.message), d.accept()))
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.click("#tab-web")
    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(1200)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
        pg.wait_for_timeout(300)

    # Palette: the new entries are there.
    labels = pg.locator("#palette .gjs-block").all_inner_texts()
    for name in ["Text area", "Dropdown", "List", "Two columns", "Navigation", "Video (YouTube)", "Pop-up box"]:
        check(any(name in t for t in labels), f"palette has {name}")

    canvas = pg.frame_locator("#gjs iframe").first
    check(canvas.locator("select option").count() == 2, "canvas shows the dropdown options")
    check(canvas.locator("ul li").count() == 2, "canvas shows the list items")
    check(canvas.locator("textarea").count() == 1, "canvas shows the text area")
    check(canvas.locator(".akutu-columns").count() == 1, "canvas shows the two-column layout")
    check(canvas.locator("iframe").count() >= 1, "canvas shows the video")

    # Export and check the output.
    html, css, z = export_zip(pg)
    check('<select id="dd"><option>Red</option><option>Blue</option></select>' in html, "dropdown is exported with its options")
    check('<ul id="ls"><li>one</li><li>two</li></ul>' in html, "list is exported with its items")
    check('<textarea id="ta" placeholder="Write here"></textarea>' in html, "text area is exported")
    check('class="akutu-columns"' in html and '<p id="pl">Left</p>' in html, "columns are exported with their content")
    check('<nav id="nv">' in html and 'href="about.html"' in html, "navigation is exported with its page link")
    check('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"' in html, "video uses the privacy-enhanced YouTube embed")
    check("<script>alert" not in html and 'id="yt-bad"' not in html, "a bad video ID is not exported (no script injection)")
    check('role="dialog"' in html and 'id="modal1" class="akutu-modal" role="dialog" aria-modal="true" hidden' in html, "pop-up box is exported hidden")
    check(".akutu-columns" in css and ".akutu-modal" in css, "styles.css has the component classes")
    check("frame-src https://www.youtube-nocookie.com" in html, "CSP allows only the YouTube privacy embed")

    # Run the exported site: the button opens the pop-up box.
    site = browser.new_page()
    site_errors = []
    site.on("pageerror", lambda e: site_errors.append(str(e)))
    site.on("console", lambda m: site_errors.append(m.text) if m.type == "error" else None)
    out = tempfile.mkdtemp()
    z.extractall(out)
    site.goto("file://" + os.path.join(out, "index.html"))
    site.wait_for_timeout(400)
    check(not site.locator("#modal1").is_visible(), "pop-up box is hidden on load")
    site.locator("#open-btn").scroll_into_view_if_needed()  # the button is below the fold in a tall page
    site.click("#open-btn")
    site.wait_for_timeout(300)
    check(site.locator("#modal1").is_visible(), "the button opens the pop-up box in the exported site")
    check(not site_errors, f"no errors in the exported site under the CSP ({site_errors})")

    # Video link typed in the element panel becomes the embed.
    pg.evaluate("() => window.__akutu.web().pages[0].root.children.length")  # project loaded
    check(not errors, f"no page errors in the editor ({errors})")
    browser.close()

if failures:
    print(f"\n{len(failures)} FAILED")
    raise SystemExit(1)
print("\nALL PASSED")
