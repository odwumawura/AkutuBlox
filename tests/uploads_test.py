"""Uploads (A8): a PNG costume for a sprite and a PNG backdrop for the stage. They are drawn on the stage,
   limited to 512 KB, saved as a zip bundle with assets/, and opened again with their images.
   python3 tests/uploads_test.py   (dev server on :5173)
"""
import os
import struct
import tempfile
import zlib
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "touching.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

tmp = tempfile.mkdtemp()
def write(name, data):
    path = os.path.join(tmp, name)
    with open(path, "wb") as f:
        f.write(data)
    return path

RED = write("red-square.png", png(64, 64, (230, 20, 20)))
BLUE = write("blue-sky.png", png(64, 64, (20, 60, 230)))
BIG = write("big.png", png(64, 64, (1, 2, 3)) + b"\0" * (600 * 1024))  # 600 KB+ of PNG data
NOT_IMAGE = write("notes.png", b"hello, this is not a picture")
TEXT = write("notes.txt", b"plain text")

def sprite(pg, name):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == name)

def pixel(pg, x, y):
    return pg.evaluate(f"() => Array.from(document.getElementById('stage').getContext('2d').getImageData({x}, {y}, 1, 1).data)")

def switch_costume_script(name):
    return [{"id": "u1", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": {"type": "looks_switchcostume", "fields": {"COSTUME": name}}}}}]}]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    dialogs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(500)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)
    pg.click("#sprite-list .chip-name >> text=Cat")
    pg.wait_for_timeout(300)

    # 1. Upload a costume for the Cat.
    with pg.expect_file_chooser() as fc:
        pg.click("#add-costume")
    fc.value.set_files(RED)
    pg.wait_for_timeout(600)
    names = [c["name"] for c in sprite(pg, "Cat")["costumes"]]
    check("red-square" in names, f"uploaded costume is added to the Cat (costumes: {names})")

    # 2. The Cat wears it on the stage: its centre is red.
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", switch_costume_script("red-square"))
    pg.wait_for_timeout(300)
    pg.click("#run")
    pg.wait_for_timeout(600)
    r, g, bb, a = pixel(pg, 240, 180)
    check(r > 200 and g < 80 and bb < 80, f"the uploaded costume is drawn on the stage (centre pixel {r},{g},{bb})")

    # 3. Upload a backdrop: the corner is blue.
    with pg.expect_file_chooser() as fc:
        pg.click("#add-backdrop")
    fc.value.set_files(BLUE)
    pg.wait_for_timeout(600)
    backdrop = pg.evaluate("() => window.__akutu.backdrop()")
    check(backdrop["source"].startswith("assets/") and backdrop["name"] == "blue-sky", f"uploaded backdrop is the starting one ({backdrop['name']})")
    r, g, bb, a = pixel(pg, 5, 5)
    check(bb > 200 and r < 80, f"the uploaded backdrop fills the stage (corner pixel {r},{g},{bb})")

    # 4. Size and type limits: nothing is added, and the user is told why.
    count_before = len(sprite(pg, "Cat")["costumes"])
    dialogs.clear()
    with pg.expect_file_chooser() as fc:
        pg.click("#add-costume")
    fc.value.set_files(BIG)
    pg.wait_for_timeout(500)
    check(any("limit" in m for m in dialogs) and len(sprite(pg, "Cat")["costumes"]) == count_before, f"an image over 512 KB is refused ({dialogs})")
    dialogs.clear()
    with pg.expect_file_chooser() as fc:
        pg.click("#add-costume")
    fc.value.set_files(NOT_IMAGE)
    pg.wait_for_timeout(500)
    check(any("not a readable image" in m for m in dialogs), "a file that is not an image is refused")
    dialogs.clear()
    with pg.expect_file_chooser() as fc:
        pg.click("#add-costume")
    fc.value.set_files(TEXT)
    pg.wait_for_timeout(500)
    check(any("PNG, JPEG or GIF" in m for m in dialogs), "a text file is refused by type")
    check(len(sprite(pg, "Cat")["costumes"]) == count_before, "refused files add no costumes")

    # 5. Save: the project has uploads, so it is a zip bundle with the images in assets/.
    pg.click("#stop")
    pg.wait_for_timeout(200)
    with pg.expect_download() as dl:
        pg.click("#save")
    saved = os.path.join(tmp, "uploads.akutu")
    dl.value.save_as(saved)
    with open(saved, "rb") as f:
        head = f.read(2)
    check(head == b"PK", "a project with uploads is saved as a zip bundle")
    import zipfile
    with zipfile.ZipFile(saved) as z:
        names_in_zip = z.namelist()
    check("project.json" in names_in_zip and any(n.startswith("assets/") and n.endswith(".png") for n in names_in_zip) and len([n for n in names_in_zip if n.startswith("assets/")]) == 2, f"the bundle has project.json and the two images ({names_in_zip})")

    # 6. Open the bundle again: the costume and the backdrop come back and draw.
    pg.reload(wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.set_input_files("#open-file", saved)
    pg.wait_for_timeout(1000)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
        pg.wait_for_timeout(500)
    check(len(pg.evaluate("() => window.__akutu.assets()")) == 2, "reopening restores both images")
    pg.click("#sprite-list .chip-name >> text=Cat")
    pg.wait_for_timeout(300)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", switch_costume_script("red-square"))
    pg.wait_for_timeout(300)
    pg.click("#run")
    pg.wait_for_timeout(600)
    r, g, bb, a = pixel(pg, 240, 180)
    check(r > 200 and g < 80 and bb < 80, f"after reopening, the Cat still shows the uploaded costume ({r},{g},{bb})")
    r, g, bb, a = pixel(pg, 5, 5)
    check(bb > 200 and r < 80, f"after reopening, the uploaded backdrop still shows ({r},{g},{bb})")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
