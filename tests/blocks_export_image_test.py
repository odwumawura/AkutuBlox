"""Blocks, P7: export the scripts as a PNG picture (the whole scripts area, at 2x).
   python3 tests/blocks_export_image_test.py   (dev server on :5173)
"""
import io, os, struct, tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

SCRIPT = [{
    "id": "s-1", "x": 40, "y": 40,
    "blocks": [{
        "type": "event_flag",
        "inputs": {"DO": {"block": {
            "type": "motion_move", "fields": {"STEPS": 40},
            "next": {"block": {"type": "control_wait", "fields": {"DURATION": 1},
                               "next": {"block": {"type": "motion_move", "fields": {"STEPS": 40}}}}},
        }}},
    }],
}]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(accept_downloads=True, viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    alerts = []
    pg.on("dialog", lambda d: (alerts.append(d.message), d.accept()))
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.wait_for_timeout(800)

    # With no scripts there is nothing to draw.
    pg.evaluate("() => window.__akutu.loadScripts([])")
    pg.wait_for_timeout(300)
    pg.click("#export-image")
    pg.wait_for_timeout(600)
    check(any("no scripts" in a for a in alerts), f"an empty workspace says there is nothing to export ({alerts})")

    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SCRIPT)
    pg.wait_for_timeout(600)
    with pg.expect_download(timeout=20000) as dl:
        pg.click("#export-image")
    path = os.path.join(tempfile.mkdtemp(), "scripts.png")
    dl.value.save_as(path)
    data = open(path, "rb").read()
    check(dl.value.suggested_filename.endswith("-scripts.png"), f"the file is named for the project ({dl.value.suggested_filename})")
    check(data[:8] == b"\x89PNG\r\n\x1a\n", "the file is a PNG")
    w, h = struct.unpack(">II", data[16:24])
    check(w > 200 and h > 150, f"the picture has a useful size ({w} x {h})")

    try:
        from PIL import Image
        im = Image.open(io.BytesIO(data)).convert("RGB")
        colours = im.getcolors(maxcolors=1_000_000) or []
        blue = sum(n for n, c in colours if c[2] > 180 and c[0] < 120)  # the Motion colour
        check(len(colours) > 20 and blue > 500, f"the picture shows the blocks in colour ({len(colours)} colours, {blue} motion pixels)")
        # The numbers in the white slots are dark (#575E75), so they must appear in the picture too.
        dark = sum(n for n, c in colours if abs(c[0] - 87) < 12 and abs(c[1] - 94) < 12 and abs(c[2] - 117) < 12)
        check(dark > 60, f"the numbers in the slots are drawn ({dark} dark-text pixels)")
    except ImportError:
        print("SKIP colour check (Pillow not installed)")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
raise SystemExit(1 if failures else 0)
