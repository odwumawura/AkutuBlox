"""Operators and conditions: maths and comparisons inside number inputs, if-then, wait until.
   python3 tests/operators_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

def lit(n):
    return {"block": {"type": "math_number", "fields": {"NUM": n}}}

def rep(t, **inputs):
    return {"block": {"type": t, "inputs": inputs}}

def op(t, **fields):
    return {"type": t, "fields": fields}

def chain(*blocks):
    for a, b in zip(blocks, blocks[1:]):
        a["next"] = {"block": b}
    return blocks[0]

BODY = chain(
    # X = (10 + 5) * 2 = 30, Y = 100 / 4 = 25
    {"type": "motion_goto", "inputs": {
        "X": rep("operator_multiply", NUM1=rep("operator_add", NUM1=lit(10), NUM2=lit(5)), NUM2=lit(2)),
        "Y": rep("operator_divide", NUM1=lit(100), NUM2=lit(4)),
    }},
    # 30 > 20 is true: X becomes 40
    {"type": "control_if", "inputs": {
        "CONDITION": rep("operator_gt", OPERAND1=lit(30), OPERAND2=lit(20)),
        "DO": {"block": {"type": "motion_changex", "fields": {}, "inputs": {"DX": lit(10)}}},
    }},
    # not (5 < 1) is true: Y becomes -7
    {"type": "control_if", "inputs": {
        "CONDITION": rep("operator_not", OPERAND=rep("operator_lt", OPERAND1=lit(5), OPERAND2=lit(1))),
        "DO": {"block": {"type": "motion_sety", "inputs": {"Y": lit(-7)}}},
    }},
    # repeat (1 + 2) times: Y goes up by 3, to -4
    {"type": "control_repeat", "inputs": {
        "TIMES": rep("operator_add", NUM1=lit(1), NUM2=lit(2)),
        "DO": {"block": {"type": "motion_changey", "inputs": {"DY": lit(1)}}},
    }},
    # 5 < 1 is false: this must not run (X would be 999 -> clamped to 240)
    {"type": "control_if", "inputs": {
        "CONDITION": rep("operator_lt", OPERAND1=lit(5), OPERAND2=lit(1)),
        "DO": {"block": {"type": "motion_setx", "inputs": {"X": lit(999)}}},
    }},
    # Already true: the wait ends straight away
    {"type": "control_wait_until", "inputs": {
        "CONDITION": rep("operator_and",
                         OPERAND1=rep("operator_equals", OPERAND1=lit(2), OPERAND2=lit(2)),
                         OPERAND2=rep("operator_gt", OPERAND1=lit(4), OPERAND2=lit(3))),
    }},
)
SCRIPT = [{"id": "o-1", "x": 40, "y": 40, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": BODY}}}]}]
EXPECTED = {"x": 40, "y": -4}

def cat(pg):
    return next(s for s in pg.evaluate("() => window.__akutu.sprites()") if s["id"] == "cat")

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]) if "Unable to decode audio data" not in str(e) else None)
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)

    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SCRIPT)
    pg.wait_for_timeout(400)
    saved = pg.evaluate("() => window.__akutu.scripts()")
    check(len(saved) == 1, "script with reporters loads into the editor")
    check(len(saved[0]["blocks"]) == 1 and saved[0]["blocks"][0]["inputs"]["DO"]["block"]["type"] == "motion_goto",
          "reporters survive load and save (first block is still the goto)")

    pg.click("#run")
    pg.wait_for_timeout(2500)
    c = cat(pg)
    check(abs(c["x"] - EXPECTED["x"]) < 0.5, f"x ends at {EXPECTED['x']} (got {c['x']:.1f})")
    check(abs(c["y"] - EXPECTED["y"]) < 0.5, f"y ends at {EXPECTED['y']} (got {c['y']:.1f})")
    check(not errs, f"no page errors ({errs[:3]})")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
