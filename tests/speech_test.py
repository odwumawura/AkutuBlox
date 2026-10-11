"""Speech bubbles (batch 16): say, say for N secs, think, think for N secs. A timed bubble only clears
   itself if no newer bubble has replaced it. Stop clears bubbles.
   python3 tests/speech_test.py   (dev server on :5173)
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

def hat(body):
    return [{"id": "sp1", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": body}}}]}]

def say(text):
    return {"type": "speech_say", "fields": {"TEXT": text}}

def think(text):
    return {"type": "speech_think", "fields": {"TEXT": text}}

def say_for(text, secs):
    return {"type": "speech_sayfor", "fields": {"TEXT": text}, "inputs": {"SECS": lit(secs)}}

def think_for(text, secs):
    return {"type": "speech_thinkfor", "fields": {"TEXT": text}, "inputs": {"SECS": lit(secs)}}

def cat(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["name"] == "Cat")

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
    pg.click("#sprite-list .chip-name >> text=Cat")
    pg.wait_for_timeout(300)

    def run(body, wait_ms):
        pg.evaluate("(s) => window.__akutu.loadScripts(s)", hat(body))
        pg.wait_for_timeout(300)
        pg.click("#run")
        pg.wait_for_timeout(wait_ms)

    def bubble():
        return cat(pg).get("bubble")

    run(chain(say("Hi there")), 300)
    check(bubble() and bubble()["text"] == "Hi there" and bubble()["kind"] == "say", f"say shows a bubble ({bubble()})")
    pg.click("#stop"); pg.wait_for_timeout(200)
    check(bubble() is None, "Stop clears the bubble")

    run(chain(say_for("Bye", 0.5)), 200)
    check(bubble() and bubble()["text"] == "Bye", "say for N secs shows the bubble at first")
    pg.wait_for_timeout(1000)
    check(bubble() is None, "the bubble clears after the time")
    pg.click("#stop"); pg.wait_for_timeout(200)

    run(chain(think("Hmm")), 300)
    check(bubble() and bubble()["kind"] == "think", "think shows a thought bubble")
    pg.click("#stop"); pg.wait_for_timeout(200)

    run(chain(think_for("Hmm", 0.3), say("Wait!")), 700)
    check(bubble() and bubble()["text"] == "Wait!" and bubble()["kind"] == "say", "a newer bubble is not cleared by an older timer")
    pg.click("#stop"); pg.wait_for_timeout(200)

    run(chain(say_for("First", 0.3), say("Second")), 150)
    pg.wait_for_timeout(700)
    check(bubble() and bubble()["text"] == "Second", "a timed bubble does not clear one that replaced it")
    pg.click("#stop"); pg.wait_for_timeout(200)

    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
