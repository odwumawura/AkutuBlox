# AkutuBlox: plan and checklist

Last updated: 2026-10-09. Keep this file current. Each step ends with tests passing and a commit.

**Legend:** `[x]` done · `[~]` in progress · `[ ]` not started · `[?]` needs your decision

---

## Where we are

Phase 1 is partly done. Web mode is well along. Blocks mode is still a spike and needs the switch to scratch-blocks.

| Area | State |
|---|---|
| Web builder: pages, components, palette, preview, zip export | Working, 7 browser suites pass |
| Web interactions: 10 triggers, 22 actions, if/else, timers, variables | Working |
| Blocks mode: all nine Scratch categories, sprites, backdrops, costume and backdrop uploads, sounds, events, My Blocks | Working, with the limits noted in the batch log (not full Scratch 3.0 yet) |
| Save/open, unsaved-changes prompt, .akutu file format (schema v0.1) | Working |

---

## Track A: Blocks mode on scratch-blocks (Phase 1, active)

Goal: the real Scratch 3.0 block editor and block set, with our own sprite and stage runtime.

- [x] **A1. Spike.** Done: blocks show Scratch colours via a custom Scratch theme (scratch-blocks looks up styles by category name, e.g. `motion`; the built-in Blockly themes have none, which caused the black blocks). Install scratch-blocks 2.1.32 (Apache-2.0, npm) and show its editor in a test view next to the current one. Confirm it builds with Vite.
  - Done: installed; editor renders real Scratch blocks (Events, Motion, Control) at `/sb-spike.html`; locale must be set first (`ScratchMsgs.setLocale('en')`).
  - Open: blocks render black. The Classic theme fails ("Invalid colour"), ScratchBlocksTheme renders but without Scratch colours. Needs the colour setup.
  - Open: the bundled click sound fails to decode in headless Chromium (mp3). Harmless for now.
- [x] **A0. Licence check before copying anything.** scratch-blocks is Apache-2.0 (checked). scratch-gui, the Scratch website UI, is AGPL-3.0, so we must not copy its code. scratch-vm and scratch-storage are AGPL-3.0 (checked from the installed LICENSE files): not used. Earlier notes calling them BSD-3 were wrong.
- [x] **A2. Map the 5 current green-flag blocks** to scratch-blocks opcodes. Mapping (current → Scratch):
  - `event_flag` → `event_whenflagclicked` (no inputs)
  - `motion_move` (field STEPS) → `motion_movesteps` (input STEPS, shadow `math_number` NUM=10)
  - `motion_turn` (field DEGREES) → `motion_turnright` (input DEGREES, shadow `math_number` NUM=15)
  - `control_repeat` (field TIMES) → `control_repeat` (input TIMES, shadow `math_number` NUM=10; statement SUBSTACK)
  - `control_wait` (field SECONDS) → `control_wait` (input DURATION, shadow `math_number` NUM=1)
  - Note: our fields become Scratch shadow-number inputs, so the file format needs a converter (part of A4).
- [x] **A3. Code generation.** Turn scratch-blocks workspaces into code our sandbox runs. Done for every block in the palette (`src/codegen.js`, which replaces the Blockly generator). Runtime: our own, per the decision below.
- [x] **A3 decision (corrected): our own runtime, not scratch-vm.** scratch-vm and scratch-storage are AGPL-3.0 (my earlier "BSD-3" was wrong; checked from the installed LICENSE files). Hosting them would require publishing the whole app under AGPL, so they were removed. We keep our own runtime (stage plus sandbox worker, code from `src/codegen.js`) and grow its block set ourselves under our own licence. User approved this path.
- [x] **A4. Switch Blocks mode to scratch-blocks.** Done: scratch-blocks is the default. The saved `.akutu` format and the runtime are unchanged; `src/editor-scratch.js` converts both ways.  All 9 suites pass on both editors, plus the new `tests/blocks_roundtrip_test.py`.
- [x] **A5. Remove the old Blockly block code** (done: old editor, `src/blocks.js`, and the scratch-blocks spike page removed; `src/codegen.js` replaces the generator and gives the same code for the same scripts). Blockly stays only for the Web interactions editor.
- [x] **A6. Categories** (Phase 1 requires full Scratch 3.0): Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, My Blocks. All nine are in (batches 12–15). Limits: My Blocks have no inputs yet; sounds are four built-in ones (no sound uploads); volume applies to sounds started after it is set.
- [x] **A7. Sprite features:** visible, size, costume switching, rotation style, drag sprites on the stage (done in batches 9 and 11).
- [x] **A8. Backdrops and costumes from files** (uploads to `assets/`, 512 KB per image). Done in batch 15. Limits: costume and backdrop images only (PNG, JPEG, GIF); the touching check still uses the circle, not the image shape; rotation centre is the image centre.
- [x] **A8 decision:** flat vector art for the built-in costumes and backdrops (the current simple shapes). Decided by you.
- [x] **A9. Blocks-mode tests:** one browser test per category (motion, looks, sound, events, control, sensing, operators, variables, my blocks), plus sprite, backdrop and round-trip tests.

## Track B: Web builder (Phase 1, mostly done)

- [x] **B1.** Remove the dark strip at the right edge of the component palette. (Confirmed by you.)
- [ ] **B2.** Page rename and delete (the schema already allows both).
- [ ] **B3.** Hidden elements can be selected on the canvas (show-hidden toggle).
- [ ] **B4.** Style editing: a replacement for GrapesJS's Style Manager, limited to the schema's fixed style set (colors, spacing, fonts, sizes, borders). No free-form CSS.
- [ ] **B5.** Theme controls: font pair and spacing scale (stored in the file, not applied yet).
- [ ] **B6.** Remaining components: list, columns, YouTube, text area, dropdown, counter, timer display, modal, navigation.
- [ ] **B7.** Remaining actions: and / or / not, compare as a value, checkbox state, counter and timer components.
- [ ] **B8.** Content Security Policy for the exported site.
- [x] **B0. Interaction blocks drive the preview.** Dragging, editing, and deleting blocks now updates the preview live.
- [ ] **B9.** Web tests for B1–B8 as each lands. Real-mouse drag test added (`tests/drag_test.py`).

## Track C: Text coding and the JS view (Phase 2)

- [ ] **C1.** Read-only view of the JavaScript generated by Blocks and Web modes.
- [ ] **C2.** Teacher category lock: hide chosen blocks and categories per class.
- [ ] **C3.** Text coding entry point (decide scope with you first).

## Track M: Mascot and identity (new)

- [x] **M0. Research.** PictoBlox's mascot is Tobi, a bear (sprite). Its UI: purple menu bar, stage, sprite and costume tabs, block palette. Also AI/ML, robotics, and Python view. Our mascot must be distinct from Tobi and from Scratch's cat.
- [ ] **M1.** Mascot concept: name, look, personality, and how it appears (splash, tutorials, empty states). You choose the direction.
- [ ] **M2.** Mascot art, in simple vector form to match the costume style.
- [ ] **M3.** Brand colours and logo, consistent with the current teal.

## Track D: Later phases (not started)

- [ ] **Phase 3:** 2D game engine (Phaser 3 + Matter.js).
- [ ] **Phase 4:** 2D animation studio (own build on Konva.js or Fabric.js; TupiTube as reference only).
- [ ] **Phase 5:** AI and ML lab.
- [ ] **Phase 6:** accounts, sharing, lessons, teacher accounts, Translate extension.
- [ ] **Phase 7:** Pro and Schools.
- [ ] **Phase 8:** hardware, mobile, localization.
- [ ] **Phase 9:** 3D and XR (expert tier only).

## Housekeeping

- [ ] **H1.** Remove the test-only hook `window.__akutu` before any public release (tests need it for now).
- [ ] **H2.** Update README and this checklist at the end of each step.
- [ ] **H3.** Check the schema version: bump it if the Blocks file format changes with scratch-blocks.
- [ ] **H4.** Decide the live-site check: confirm that Vercel deploys each push (you said it rebuilds automatically, so this is only a reminder).

---

## Decisions needed from you

1. **A3:** resolved: our own runtime (scratch-vm is AGPL-3.0).
2. ~~**A8:** art style for costumes and backdrops.~~ Resolved: flat vector.
3. **C3:** scope of text coding in Phase 2.

## Log

- 2026-10-09: Plan written. A1 started: scratch-blocks renders in a spike page; colours still open.
- 2026-10-10: Blocks batch 9 (costumes, A7 part): switch costume to [name] (dropdown of the edited sprite's costumes) and next costume (wraps). Green flag restores the starting costume. Limits: costumes are the built-in set only, no rotation style or drag yet (rest of A7). Tests: `tests/costumes_test.py`, fixture `tests/fixtures/costumes.akutu`; round-trip script 10 added.
- 2026-10-10: Blocks batch 10 (backdrops, A7/A8 part): switch backdrop to [name] (dropdown of the stage's backdrops) and next backdrop (wraps). The stage's backdrop list is in the project; its first entry is the starting backdrop, and green flag goes back to it. Limits: built-in backdrops only (uploads are A8). Tests: `tests/backdrops_test.py`, fixture `tests/fixtures/backdrops.akutu`; round-trip script 11 added.
- 2026-10-10: Blocks batch 11 (A7 finished): set rotation style (all around, left-right, don't rotate) in Motion; set drag mode (draggable, not draggable) in Sensing. A draggable sprite can be dragged on the stage; where it is dropped becomes its starting place, so saving keeps it. Schema: sprites gain optional `rotationStyle` and `draggable` (additive, defaults keep old files valid). Also fixed: saving now keeps each sprite's visibility, size and costume (it kept only position and direction). Limits: drag mode and rotation style set by a block take effect while the project runs; the saved values are the starting values. Tests: `tests/rotation_drag_test.py`, fixture `tests/fixtures/rotation_drag.akutu`; round-trip script 12 added.
- 2026-10-10: Blocks batch 12 (A6, Events): when [key] key pressed (space, arrows, any, a–z, 0–9), when this sprite clicked, when I receive [message], broadcast [message]. Broadcasts reach every running sprite, including the sender. Flag scripts start only after every sprite has registered its scripts, so no broadcast is missed at start. A click counts when the pointer is released on the sprite without a drag of more than 3 px. Limits: key and click events work only while the project runs (green flag to Stop); Scratch fires them with no green flag, so this is a known gap. Broadcast and wait is not included. Tests: `tests/events_test.py`, fixture `tests/fixtures/touching.akutu`. Also: `tests/smoke.py` sandbox check updated for the `ready`/`go` start protocol.
- 2026-10-10: Palette fix: the Sensing and Looks flyouts showed "(no sprites)" and "(no costumes)" because their dropdowns were filled once at startup. They are now rebuilt each time the category is opened, so the palette shows the current names. The starter costume is named "Cat" (was "cat-a").
- 2026-10-10: Blocks batch 8 (touching): touching sprite (named, dropdown of sprites) and touching stage edge. Sprites are circles (radius 18 × size); hidden sprites never touch. Limits: no distance-to-sprite, no touching colour yet. Tests: `tests/touching_test.py`, fixture `tests/fixtures/touching.akutu`; round-trip script 9 added.
- 2026-10-10: Round-trip test fixed: it checked only the first two scripts, so the rest passed without being compared. It now compares all nine. The saver writes literal numbers as plain fields, so both sides are normalized before comparing; scripts 6, 7 and 9 pass under that rule.
- 2026-10-09: Blocks batch 7 (sensing): mouse x, mouse y, mouse down. The stage tracks the pointer; sprites ask for it the same way as variables. Limits: no touching/distance/edge checks yet (need sprite positions and bounds). Tests: `tests/sensing_test.py`.
- 2026-10-09: Blocks batch 6 (variables): make a variable (palette), set to, change by, variable reporter. Global to the stage, saved with the project, kept across runs. Limits: no sprite-only variables, rename or delete yet, no monitors, no lists. The make-variable prompt is the browser's prompt for now. Tests: `tests/variables_test.py`, fixture `tests/fixtures/variables.akutu`.
- 2026-10-09: Blocks batch 5 (operators): + - × ÷, < > =, and/or/not as reporters inside any number or boolean input (nested). If-then and wait until. Comparisons are numeric for now; text comparison comes later. Tests: `tests/operators_test.py`, round trip extended.
- 2026-10-09: Blocks batch 4 (control): forever (yields each pass, runs until Stop). Tests: `tests/control_test.py`. If, wait until and repeat until need boolean conditions (operators), so they come in a later batch.
- 2026-10-09: Blocks batch 3 (looks): show, hide, change size by, set size to. Sprites reset to their starting look on green flag. Tests: `tests/looks_test.py`. Next costume and say bubbles are later batches.
- 2026-10-09: Blocks batch 2 (motion): go to x/y, change x, set x, change y, set y, point in direction. Stage-edge clamp. Tests: `tests/motion_test.py`, round trip extended.
- 2026-10-09: A5 done: old Blockly block code removed.
- 2026-10-09: A4 done: scratch-blocks is the Blocks editor (old one at ?editor=blockly). Round-trip test added.
- 2026-10-09: Web blocks → live preview fixed (B0). Mascot research (M0) done. A3 approved. A1 done (scratch-blocks colours fixed). Drag test in suite.
- 2026-10-10: Blocks batch 13 (A6, Sound): play sound [name] until done, start sound [name], stop all sounds, set volume to [n], change volume by [n]. Four built-in sounds (Pop, Chime, Boing, Click), made with the Web Audio API so no files are needed. Volume is per sprite, a percentage, and resets at green flag. Stop ends waiting sounds early. Limits: sounds cannot be uploaded; volume does not change sounds that are already playing. Tests: `tests/sound_test.py`; round-trip scripts 13–15 added.
- 2026-10-10: Blocks batch 14 (A6, My Blocks): define [name] (a hat with its body) and call [name] (a dropdown of the defines in the editor). Blocks are per sprite; a define on its own does nothing, and calling an undefined block does nothing. Limits: no inputs or outputs yet; renaming a define leaves old calls pointing at the old name. Tests: `tests/my_blocks_test.py`; round-trip script 16 added.
- 2026-10-10: Blocks batch 15 (A8, uploads): Upload costume… (for the sprite being edited) and Upload backdrop… (for the stage). PNG, JPEG or GIF, up to 512 KB each. A project with uploads is saved as a zip bundle (project.json plus assets/…, as the schema says); a project without uploads stays a plain JSON file. Opening reads both. Uploaded backdrops become the starting backdrop. Limits: images are drawn at their own size, scaled to fit about 120 units; the touch check still uses the circle; no total size limit yet. Tests: `tests/uploads_test.py`.
