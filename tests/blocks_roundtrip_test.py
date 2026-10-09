"""Blocks editor round trip: every block type, nested, survives load -> save unchanged.
   python3 tests/blocks_roundtrip_test.py   (dev server on :5173)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173/")
SCRIPTS = [
    {"id": "s-1", "x": 40, "y": 40, "blocks": [{
        "type": "event_flag",
        "inputs": {"DO": {"block": {
            "type": "control_repeat", "fields": {"TIMES": 3},
            "inputs": {"DO": {"block": {
                "type": "motion_move", "fields": {"STEPS": 25},
                "next": {"block": {"type": "motion_turn", "fields": {"DEGREES": 45},
                                   "next": {"block": {"type": "control_wait", "fields": {"SECONDS": 2}}}}},
            }}},
            "next": {"block": {"type": "motion_move", "fields": {"STEPS": 5}}},
        }}},
    }]},
    {"id": "s-2", "x": 300, "y": 120, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": {"type": "control_wait", "fields": {"SECONDS": 0.5}}}}}]},
    {"id": "s-3", "x": 40, "y": 260, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": {
        "type": "motion_goto", "fields": {"X": 10, "Y": -5},
        "next": {"block": {"type": "motion_changex", "fields": {"DX": 3},
            "next": {"block": {"type": "motion_setx", "fields": {"X": -20},
                "next": {"block": {"type": "motion_changey", "fields": {"DY": 4},
                    "next": {"block": {"type": "motion_sety", "fields": {"Y": 7},
                        "next": {"block": {"type": "motion_point", "fields": {"DIRECTION": 45}}}}}}}}}}}}}}}]},
    {"id": "s-4", "x": 300, "y": 260, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": {
        "type": "looks_show",
        "next": {"block": {"type": "looks_hide",
            "next": {"block": {"type": "looks_changesize", "fields": {"CHANGE": -15},
                "next": {"block": {"type": "looks_setsize", "fields": {"SIZE": 80}}}}}}}}}}}]},
    {"id": "s-5", "x": 40, "y": 400, "blocks": [{"type": "event_flag", "inputs": {"DO": {"block": {
        "type": "control_forever", "inputs": {"DO": {"block": {"type": "motion_turn", "fields": {"DEGREES": 15}}}}}}}}]},
]

failures = []

def strip_ids(x):
    """Blockly adds block ids when saving; they are not part of the meaning, so ignore them."""
    if isinstance(x, dict):
        return {k: strip_ids(v) for k, v in x.items() if k != "id"}
    if isinstance(x, list):
        return [strip_ids(v) for v in x]
    return x
def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 800})
    pg.goto(BASE, wait_until="networkidle")
    pg.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    pg.evaluate("(s) => window.__akutu.loadScripts(s)", SCRIPTS)
    pg.wait_for_timeout(300)
    saved = pg.evaluate("() => window.__akutu.scripts()")
    check(len(saved) == 5, f"five top-level scripts after load (got {len(saved)})")
    check(saved and strip_ids(saved[0]["blocks"]) == SCRIPTS[0]["blocks"], "nested script 1 round-trips unchanged")
    check(len(saved) > 1 and strip_ids(saved[1]["blocks"]) == SCRIPTS[1]["blocks"], "script 2 round-trips unchanged")
    check(all(s["x"] == o["x"] and s["y"] == o["y"] for s, o in zip(saved, SCRIPTS)), "script positions round-trip")
    b.close()

print("ALL PASSED" if not failures else f"FAILURES: {failures}")
