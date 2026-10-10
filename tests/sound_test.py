"""Sound: play sound until done, start sound, set and change volume, stop all sounds.
   Built-in sounds only (Pop, Chime, Boing, Click). The stage records each sound that starts, with its volume.
   python3 tests/sound_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "touching.akutu")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

def lit(n):
    return {"block": {"type": "math_number", "fields": {"NUM": n}}}

def chain(*blocks):
    for a, b in zip(blocks, blocks[1:]):
        a["next"] = {"block": b}
    return blocks[0]

def hat(id_, y, block_type, body, **fields):
    h = {"type": block_type, "inputs": {"DO": {"block": body}}}
    if fields:
        h["fields"] = fields
    return {"id": id_, "x": 40, "y": y, "blocks": [h]}

def play(name, wait):
    return {"type": "sound_playuntil" if wait else "sound_start", "fields": {"SOUND": name}}

def set_volume(n):
    return {"type": "sound_setvolume", "inputs": {"VOLUME": lit(n)}}

def change_volume(n):
    return {"type": "sound_changevolume", "inputs": {"VOLUME": lit(n)}}

def move_x(n):
    return {"type": "motion_changex", "inputs": {"DX": lit(n)}}

def move_y(n):
    return {"type": "motion_changey", "inputs": {"DY": lit(n)}}

def sprite(pg, name):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == name)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(500)
    if pg.locator("#prompt[open] button[value=discard]").count():
        pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)

    def load(sprite_name, scripts):
        pg.click(f"#sprite-list .chip-name >> text={sprite_name}")
        pg.wait_for_timeout(300)
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", scripts)
        pg.wait_for_timeout(300)

    def run(wait_ms):
        pg.click("#run")
        pg.wait_for_timeout(wait_ms)

    def new_sounds(before):
        return pg.evaluate("() => window.__akutu.sounds()")[before:]

    # 1. Play until done: the Cat's script waits for the Chime (about 0.6 s) before it moves.
    load("Cat", [hat("c1", 40, "event_flag", chain(play("Chime", True), move_x(10)))])
    load("Dog", [])
    run(200)
    check(abs(sprite(pg, "Cat")["x"]) < 0.5, f"play until done waits: Cat has not moved yet (x = {sprite(pg, 'Cat')['x']:.1f})")
    pg.wait_for_timeout(1200)
    check(abs(sprite(pg, "Cat")["x"] - 10) < 0.5, f"after the Chime ends the Cat moves (x = {sprite(pg, 'Cat')['x']:.1f}, want 10)")
    pg.click("#stop")
    pg.wait_for_timeout(200)

    # 2. Start sound: the Dog does not wait for the Boing (about 0.55 s) before it moves.
    base = len(pg.evaluate("() => window.__akutu.sounds()"))
    load("Cat", [])
    load("Dog", [hat("d1", 40, "event_flag", chain(play("Boing", False), move_y(20)))])
    run(200)
    check(abs(sprite(pg, "Dog")["y"] - 20) < 0.5, f"start sound does not wait: Dog moved at once (y = {sprite(pg, 'Dog')['y']:.1f}, want 20)")
    check(any(s["name"] == "Boing" for s in new_sounds(base)), "the Boing sound started")
    pg.click("#stop")
    pg.wait_for_timeout(200)

    # 3. Volume: set to 50, a Pop plays at 50; change by -20, a Click plays at 30.
    base = len(pg.evaluate("() => window.__akutu.sounds()"))
    load("Dog", [])
    load("Cat", [hat("c2", 40, "event_flag", chain(set_volume(50), play("Pop", False), change_volume(-20), play("Click", False)))])
    run(400)
    got = [(s["name"], round(s["volume"])) for s in new_sounds(base)]
    check(got == [("Pop", 50), ("Click", 30)], f"volume set to 50 then changed by -20 (sounds: {got}, want [('Pop', 50), ('Click', 30)])")
    pg.click("#stop")
    pg.wait_for_timeout(200)

    # 4. Stop all sounds: the Dog stops the Chime after 0.1 s, which releases the Cat's wait at once.
    load("Cat", [hat("c3", 40, "event_flag", chain(play("Chime", True), move_x(10)))])
    load("Dog", [hat("d3", 40, "event_flag", chain({"type": "control_wait", "inputs": {"SECONDS": lit(0.1)}}, {"type": "sound_stopall"}))])
    run(350)
    check(abs(sprite(pg, "Cat")["x"] - 10) < 0.5, f"stop all sounds ends a waiting sound early (x = {sprite(pg, 'Cat')['x']:.1f}, want 10 at 0.35 s)")

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
