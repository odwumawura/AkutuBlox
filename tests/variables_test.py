"""Variables: make one from the palette, set / change / read it in blocks, and save and load it with a project.
   python3 tests/variables_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "variables.akutu")
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

def var(name):
    return {"block": {"type": "data_variable", "fields": {"VARIABLE": name}}}

def stage_var(pg, name):
    return next((v["value"] for v in pg.evaluate("() => window.__akutu.variables()") if v["name"] == name), None)

def cat(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800}, accept_downloads=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    names = iter(["score", "word"])
    pg.on("dialog", lambda d: d.accept(next(names)) if d.type == "prompt" else d.dismiss())
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    # 1. Make two variables from the palette.
    pg.locator(".blocklyToolboxCategory", has_text="Variables").first.click()
    pg.wait_for_timeout(500)
    for _ in range(2):
        pg.locator(".blocklyFlyout text", has_text="Make a Variable").first.click()
        pg.wait_for_timeout(500)
    check(stage_var(pg, "score") == 0 and stage_var(pg, "word") == 0, "palette makes two variables (score, word) starting at 0")

    # 2. Set, change and read them in blocks.
    script = [{"id": "v-1", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": chain(
        {"type": "data_setvariableto", "fields": {"VARIABLE": "score"}, "inputs": {"VALUE": lit(5)}},
        {"type": "data_changevariableby", "fields": {"VARIABLE": "score"}, "inputs": {"VALUE": lit(3)}},  # 8
        {"type": "data_setvariableto", "fields": {"VARIABLE": "word"}, "inputs": {"VALUE": {"block": {"type": "math_number", "fields": {"NUM": "hi"}}}}},
        {"type": "motion_goto", "inputs": {"X": {"block": {"type": "operator_multiply", "inputs": {"NUM1": var("score"), "NUM2": lit(2)}}}}, "fields": {"Y": 0}},  # x = 16
    )}}}]}]
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", script)
    pg.wait_for_timeout(300)
    pg.click("#run")
    pg.wait_for_timeout(2000)
    check(stage_var(pg, "score") == 8, f"set to 5 then changed by 3 gives 8 (got {stage_var(pg, 'score')})")
    check(abs(cat(pg)["x"] - 16) < 0.5, f"a variable inside maths moves the Cat to 16 (got {cat(pg)['x']:.1f})")
    check(stage_var(pg, "word") == "hi", f"text value is stored (got {stage_var(pg, 'word')!r})")

    snap = pg.evaluate("() => window.__akutu.snapshot()")
    saved = {v["name"]: v["value"] for v in snap["blocks"]["stage"]["variables"]}
    check(saved.get("score") == 8 and saved.get("word") == "hi", f"variables are saved with the project ({saved})")

    # 3. Open a project file that has a variable, run it, and check the saved value.
    pg.set_input_files("#open-file", FIXTURE)
    pg.wait_for_timeout(500)
    # The project has unsaved changes (the variable values), so the app asks first.
    pg.click("#prompt button[value=discard]")
    pg.wait_for_timeout(800)
    check(stage_var(pg, "score") == 2, f"file opens with score = 2 (got {stage_var(pg, 'score')})")
    pg.click("#run")
    pg.wait_for_timeout(1500)
    check(stage_var(pg, "score") == 3, f"the file's script changes score to 3 (got {stage_var(pg, 'score')})")
    check(abs(cat(pg)["x"] - 30) < 0.5, f"and moves the Cat to 30 (got {cat(pg)['x']:.1f})")
    snap = pg.evaluate("() => window.__akutu.snapshot()")
    check({v["name"]: v["value"] for v in snap["blocks"]["stage"]["variables"]}.get("score") == 3, "the new score is saved with the project")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
