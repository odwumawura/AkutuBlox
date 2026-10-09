import * as Blockly from 'blockly';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import '../style.css';
import { javascriptGenerator, TOOLBOX } from './blocks.js';
import { createStage } from './runtime.js';

// ---- Mode switching (separate projects, save prompt comes later) ----
const tabs = {
  blocks: { tab: document.getElementById('tab-blocks'), view: document.getElementById('view-blocks') },
  web: { tab: document.getElementById('tab-web'), view: document.getElementById('view-web') },
};

function showMode(name) {
  for (const [key, { tab, view }] of Object.entries(tabs)) {
    const on = key === name;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
    view.classList.toggle('active', on);
  }
  if (name === 'blocks') Blockly.svgResize(workspace);
}

// ---- Blocks mode ----
const workspace = Blockly.inject('blocklyDiv', {
  toolbox: TOOLBOX,
  trashcan: true,
  renderer: 'geras',
  grid: { spacing: 20, length: 3, colour: '#dfe4ec', snap: true },
});

// Starter script so the first run does something.
Blockly.serialization.workspaces.load(
  {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'event_flag',
          x: 40,
          y: 40,
          next: {
            block: {
              type: 'control_repeat',
              fields: { TIMES: 4 },
              inputs: {
                DO: {
                  block: {
                    type: 'motion_move',
                    fields: { STEPS: 40 },
                    next: { block: { type: 'motion_turn', fields: { DEGREES: 90 } } },
                  },
                },
              },
            },
          },
        },
      ],
    },
  },
  workspace,
);

const stage = createStage(document.getElementById('stage'), document.getElementById('log'));

document.getElementById('run').addEventListener('click', () => {
  const code = javascriptGenerator.workspaceToCode(workspace);
  stage.greenFlag(code);
});
document.getElementById('stop').addEventListener('click', () => stage.stop());

// ---- Web mode ----
const editor = grapesjs.init({
  container: '#gjs',
  height: '100%',
  width: 'auto',
  storageManager: false,
  components: `
    <section style="padding:40px;text-align:center;font-family:Arial,sans-serif">
      <h1 style="color:#1d2433">Welcome to My Site</h1>
      <p style="color:#4a5568">Built with blocks, no code.</p>
      <button style="background:#0f766e;color:#fff;border:0;padding:12px 24px;border-radius:8px;font-size:18px">Get Started</button>
    </section>`,
});

function buildExport() {
  const html = editor.getHtml();
  const css = editor.getCss();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Site</title>
<style>${css}</style>
</head>
<body>
${html}
</body>
</html>`;
}

document.getElementById('preview').addEventListener('click', () => {
  document.getElementById('preview-frame').srcdoc = buildExport();
});

document.getElementById('export').addEventListener('click', () => {
  const doc = buildExport();
  const blob = new Blob([doc], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'index.html';
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('preview-frame').srcdoc = doc;
});

document.getElementById('tab-blocks').addEventListener('click', () => showMode('blocks'));
document.getElementById('tab-web').addEventListener('click', () => showMode('web'));
