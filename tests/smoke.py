"""Smoke test for the spike. Run with the dev server on :5173.
   python3 tests/smoke.py
"""
import json, os, sys, tempfile
from playwright.sync_api import sync_playwright
from jsonschema import Draft202012Validator

BASE = os.environ.get("BASE", "http://localhost:5173/")
SCHEMA = json.load(open(os.path.join(os.path.dirname(__file__), "..", "schema", "project.schema.json")))
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(accept_downloads=True)
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector("#blocklyDiv .blocklySvg", timeout=15000)
    check(page.is_visible("#view-blocks.active"), "blocks view is visible on start")

    # Run the starter script and check the log.
    page.click("#run")
    page.wait_for_timeout(4000)
    log = page.inner_text("#log")
    check("— green flag" in log, "green flag starts the script")
    check("error:" not in log, "no runtime errors in the stage log")

    # Save: download a .akutu file and validate it against the schema.
    with page.expect_download() as dl:
        page.click("#save")
    path = os.path.join(tempfile.mkdtemp(), dl.value.suggested_filename)
    dl.value.save_as(path)
    check(path.endswith(".akutu"), "save produces a .akutu file")
    doc = json.load(open(path))
    errs = list(Draft202012Validator(SCHEMA).iter_errors(doc))
    check(not errs, "saved blocks file validates against schema v0.1" + ("" if not errs else f": {errs[0].message}"))
    scripts = doc["blocks"]["sprites"][0]["scripts"]
    check(len(scripts) >= 1, "saved file contains the starter script")

    # Unsaved-change prompt when switching mode.
    page.fill("#project-name", "Renamed project")
    page.wait_for_timeout(300)
    check(page.is_visible("#dirty"), "editing the name marks the project unsaved")
    page.click("#tab-web")
    page.wait_for_selector("#prompt[open]", timeout=5000)
    check(True, "switching mode with unsaved changes shows the save prompt")
    page.click("#prompt button[value=cancel]")
    page.wait_for_timeout(300)
    check(page.is_visible("#view-blocks.active"), "cancel keeps the user in blocks mode")

    # Web mode: switch with discard, then export.
    page.click("#tab-web")
    page.wait_for_selector("#prompt[open]", timeout=5000)
    page.click("#prompt button[value=discard]")
    page.wait_for_timeout(800)
    check(page.is_visible("#view-web.active"), "discard switches to web mode")
    with page.expect_download() as dl2:
        page.click("#export")
    html_path = os.path.join(tempfile.mkdtemp(), dl2.value.suggested_filename)
    dl2.value.save_as(html_path)
    html = open(html_path, encoding="utf-8").read()
    check("<!doctype html>" in html and "<body>" in html, "web export is a complete HTML document")
    check("http" not in html.split("<body>")[1] if "<body>" in html else True, "export body has no external URLs")

    # Open the saved blocks file back in.
    page.click("#tab-blocks")
    page.wait_for_timeout(500)
    if page.is_visible("#prompt[open]"):
        page.click("#prompt button[value=discard]")
    page.set_input_files("#open-file", path)
    page.wait_for_timeout(1000)
    check(page.input_value("#project-name") == doc["meta"]["name"], "opening the saved file restores the project name")

    check(not console_errors, "no browser console errors" + ("" if not console_errors else f": {console_errors[:3]}"))
    browser.close()

print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED")
sys.exit(1 if failures else 0)
