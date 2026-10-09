# AkutuBlox spike

Proof of the two core Phase 1 pieces in one app shell:
1. **Blocks mode:** Blockly blocks generate JavaScript that drives a sprite on a 480 x 360 stage.
2. **Web mode:** GrapesJS page builder that exports a standalone `index.html`.

## Requirements
- Node.js 18 or newer (Node 20 LTS recommended)
- npm (comes with Node)
- Git (optional, for version control)

## Run on your PC
```bash
git clone <your-repo-url> akutublox-spike
cd akutublox-spike
npm install            # first time only; uses package-lock.json
npm run dev            # open http://localhost:5173
```

Production check on your PC:
```bash
npm run build          # writes dist/
npm run preview        # open http://localhost:4173
```

## Host it (static site)
This is a static site, so any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** 20

## Files
- `src/blocks.js`: block definitions and JavaScript generators (learners never see this code)
- `src/runtime.js`: stage drawing and run/stop, relaying messages to the worker
- `src/sandbox.worker.js`: sandbox that runs generated Blocks code
- `src/project.js`: project create, validate, save and open (.akutu)
- `src/web/model.js`: web model. Converts the GrapesJS canvas to our component format, renders pages to HTML/CSS, and compiles interactions to JavaScript.
- `tests/smoke.py`: Blocks and project browser test (Playwright). `tests/web_test.py`: multi-page web test (`tests/fixtures/site.akutu`). `tests/interactions_test.py`: interaction blocks round trip and exported behavior (`tests/fixtures/interactions.akutu`). All need the dev server on port 5173.
- `src/main.js`: shell, mode tabs, GrapesJS setup, export
- `index.html`, `style.css`: layout

## Findings
- Blockly 12.5: block definitions via `Blockly.common.defineBlocksWithJsonArray`; generators via `blockly/javascript`.
- GrapesJS 0.22: visual editor with clean `getHtml()` / `getCss()` export.
- Production bundle is about 1.8 MB (mostly GrapesJS). Split before Phase 1 ships.

## Known limits (spike only)
- Generated code runs in a Web Worker (`src/sandbox.worker.js`). Stop terminates the worker. Network globals are shadowed; a Content Security Policy should be added at deploy time to block network access entirely.
- Block colors are placeholders, not the original palette.
- 5 blocks, 1 sprite, 1 page. Save/open (.akutu) works; multi-page and interactions are not built yet.
- Web interactions: 4 triggers (clicked, hovered, mouse leaves, page loads) and 8 actions (show, hide, toggle, set text, set text color, set background, go to page, open link) are built, in the Interactions tab. Still to build from the spec: form, text-change, checkbox, timer, variable, and page-visited triggers; fade, move, image, sound, variable, logic, form, timer, and wait actions.
- Hidden elements are hidden on the canvas too, so they can't be selected there yet.
- No page rename or delete yet.
- Click-through testing in a browser is not yet documented.
