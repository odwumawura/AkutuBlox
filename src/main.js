import * as Blockly from 'blockly';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import '../style.css';
import { javascriptGenerator, TOOLBOX } from './blocks.js';
import { createStage } from './runtime.js';
import {
  newBlocksProject,
  newWebProject,
  blocksProjectFromWorkspace,
  webProjectFromEditor,
  loadBlocksProject,
  loadWebProject,
  downloadProject,
  readProjectFile,
} from './project.js';

// ---------- Shared state ----------
const state = { mode: 'blocks', project: null, dirty: false, loading: false };

const el = {
  tabs: { blocks: document.getElementById('tab-blocks'), web: document.getElementById('tab-web') },
  views: { blocks: document.getElementById('view-blocks'), web: document.getElementById('view-web') },
  name: document.getElementById('project-name'),
  dirty: document.getElementById('dirty'),
  prompt: document.getElementById('prompt'),
  promptText: document.getElementById('prompt-text'),
  openFile: document.getElementById('open-file'),
};

function markDirty() {
  if (state.loading) return;
  state.dirty = true;
  el.dirty.hidden = false;
}
function markClean() {
  state.dirty = false;
  el.dirty.hidden = true;
}

// ---------- Blocks mode ----------
const workspace = Blockly.inject('blocklyDiv', {
  toolbox: TOOLBOX,
  trashcan: true,
  renderer: 'geras',
  grid: { spacing: 20, length: 3, colour: '#dfe4ec', snap: true },
});
workspace.addChangeListener((e) => {
  if (e.isUiEvent || e.type === Blockly.Events.VIEWPORT_CHANGE) return;
  markDirty();
});

const stage = createStage(document.getElementById('stage'), document.getElementById('log'));
document.getElementById('run').addEventListener('click', () => {
  stage.greenFlag(javascriptGenerator.workspaceToCode(workspace));
});
document.getElementById('stop').addEventListener('click', () => stage.stop());

// ---------- Web mode ----------
const editor = grapesjs.init({
  container: '#gjs',
  height: '100%',
  width: 'auto',
  storageManager: false,
  components: '<section style="padding:40px;text-align:center;font-family:Arial,sans-serif"><h1 style="color:#1d2433">Welcome to My Site</h1></section>',
});
editor.on('update', markDirty);

function buildExport() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Site</title>
<style>${editor.getCss()}</style>
</head>
<body>
${editor.getHtml()}
</body>
</html>`;
}
document.getElementById('preview').addEventListener('click', () => {
  document.getElementById('preview-frame').srcdoc = buildExport();
});
document.getElementById('export').addEventListener('click', () => {
  const doc = buildExport();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  a.download = 'index.html';
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('preview-frame').srcdoc = doc;
});

// ---------- Project lifecycle ----------
function showView(mode) {
  state.mode = mode;
  for (const key of ['blocks', 'web']) {
    const on = key === mode;
    el.tabs[key].classList.toggle('active', on);
    el.tabs[key].setAttribute('aria-selected', String(on));
    el.views[key].classList.toggle('active', on);
  }
  if (mode === 'blocks') Blockly.svgResize(workspace);
}

function loadIntoEditors(project) {
  state.loading = true;
  Blockly.Events.disable();
  try {
    if (project.mode === 'blocks') {
      loadBlocksProject(project, workspace, stage);
    } else {
      loadWebProject(project, editor);
    }
  } finally {
    Blockly.Events.enable();
    state.loading = false;
  }
  state.project = project;
  el.name.value = project.meta.name;
  showView(project.mode);
  markClean();
}

// Asks before losing unsaved work. Resolves to true if it's safe to continue.
async function confirmDiscard() {
  if (!state.dirty) return true;
  el.promptText.textContent = `"${el.name.value || 'Untitled'}" has changes that aren't saved.`;
  el.prompt.returnValue = '';
  el.prompt.showModal();
  const choice = await new Promise((resolve) => el.prompt.addEventListener('close', () => resolve(el.prompt.returnValue), { once: true }));
  if (choice === 'save') {
    saveCurrent();
    return true;
  }
  return choice === 'discard';
}

function currentProjectDocument() {
  const base = state.project;
  const project =
    base.mode === 'blocks'
      ? blocksProjectFromWorkspace(base, workspace, stage.getSprite())
      : webProjectFromEditor(base, editor);
  project.meta.name = el.name.value.trim() || 'Untitled';
  return project;
}

function saveCurrent() {
  const project = currentProjectDocument();
  downloadProject(project);
  state.project = project;
  markClean();
}

async function newProject(mode) {
  if (!(await confirmDiscard())) return;
  const project = mode === 'blocks' ? newBlocksProject('Untitled blocks project') : newWebProject('Untitled website');
  loadIntoEditors(project);
}

async function switchMode(mode) {
  if (mode === state.mode) return;
  if (!(await confirmDiscard())) return;
  // Each mode has its own project file, so switching starts a new project in that mode.
  const project = mode === 'blocks' ? newBlocksProject('Untitled blocks project') : newWebProject('Untitled website');
  loadIntoEditors(project);
}

async function openFile(file) {
  if (!(await confirmDiscard())) return;
  const result = await readProjectFile(file);
  if (!result.ok) {
    alert('Could not open this project:\n\n' + result.errors.slice(0, 5).join('\n'));
    return;
  }
  loadIntoEditors(result.project);
}

// ---------- Wiring ----------
el.tabs.blocks.addEventListener('click', () => switchMode('blocks'));
el.tabs.web.addEventListener('click', () => switchMode('web'));
document.getElementById('new').addEventListener('click', () => newProject(state.mode));
document.getElementById('save').addEventListener('click', saveCurrent);
document.getElementById('open').addEventListener('click', () => el.openFile.click());
el.openFile.addEventListener('change', () => {
  const file = el.openFile.files[0];
  el.openFile.value = '';
  if (file) openFile(file);
});
el.name.addEventListener('input', markDirty);
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Start with the starter blocks project.
loadIntoEditors(newBlocksProject('Square walker'));
