import * as Blockly from 'blockly';
import grapesjs from 'grapesjs';
import JSZip from 'jszip';
import 'grapesjs/dist/css/grapes.min.css';
import '../style.css';
import { javascriptGenerator, TOOLBOX } from './blocks.js';
import { createStage } from './runtime.js';
import {
  newBlocksProject,
  newWebProject,
  newWebPage,
  blocksProjectFromWorkspace,
  webProjectFromEditor,
  loadBlocksProject,
  loadWebPage,
  downloadProject,
  readProjectFile,
} from './project.js';
import { siteFiles, previewHtml, treeFromEditor } from './web/model.js';

// ---------- Shared state ----------
const state = { mode: 'blocks', project: null, dirty: false, loading: false, webPageId: 'home', webSnapshot: '' };

const el = {
  tabs: { blocks: document.getElementById('tab-blocks'), web: document.getElementById('tab-web') },
  views: { blocks: document.getElementById('view-blocks'), web: document.getElementById('view-web') },
  name: document.getElementById('project-name'),
  dirty: document.getElementById('dirty'),
  prompt: document.getElementById('prompt'),
  promptText: document.getElementById('prompt-text'),
  openFile: document.getElementById('open-file'),
  pageSelect: document.getElementById('page-select'),
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
  components: '',
});
// GrapesJS reports updates after loading too, so only count a change when the canvas really differs from the last snapshot.
const webSnapshot = () => JSON.stringify(treeFromEditor(editor));
editor.on('update', () => {
  if (state.loading || state.mode !== 'web') return;
  if (webSnapshot() !== state.webSnapshot) markDirty();
});

function currentPage() {
  return state.project.web.pages.find((p) => p.id === state.webPageId);
}

function fillPageSelect() {
  el.pageSelect.innerHTML = '';
  for (const p of state.project.web.pages) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.path}.html)`;
    el.pageSelect.appendChild(opt);
  }
  el.pageSelect.value = state.webPageId;
}

// Save the canvas into the current page, then show another page.
function switchWebPage(pageId) {
  state.project = webProjectFromEditor(state.project, editor, state.webPageId);
  state.webPageId = loadWebPage(state.project, pageId, editor);
  state.webSnapshot = webSnapshot();
  fillPageSelect();
}

el.pageSelect.addEventListener('change', () => switchWebPage(el.pageSelect.value));
document.getElementById('add-page').addEventListener('click', () => {
  state.project = webProjectFromEditor(state.project, editor, state.webPageId);
  const index = state.project.web.pages.length + 1;
  state.project.web.pages.push(newWebPage(index));
  markDirty();
  switchWebPage(`page-${index}`);
});

function buildSiteProject() {
  return webProjectFromEditor(state.project, editor, state.webPageId);
}

function previewCurrentPage() {
  const project = buildSiteProject();
  const page = project.web.pages.find((p) => p.id === state.webPageId);
  document.getElementById('preview-frame').srcdoc = previewHtml(page, project.web.pages);
}

document.getElementById('preview').addEventListener('click', previewCurrentPage);

document.getElementById('export').addEventListener('click', async () => {
  const project = buildSiteProject();
  const zip = new JSZip();
  for (const [name, content] of Object.entries(siteFiles(project))) zip.file(name, content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const safe = (project.meta.name || 'site').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'site';
  a.download = `${safe}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
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
      state.project = project;
      state.webPageId = loadWebPage(project, project.web.pages[0].id, editor);
      state.webSnapshot = webSnapshot();
      fillPageSelect();
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
      : buildSiteProject();
  project.meta.name = el.name.value.trim() || 'Untitled';
  return project;
}

function saveCurrent() {
  const project = currentProjectDocument();
  downloadProject(project);
  state.project = project;
  markClean();
}

const freshProject = (mode) => (mode === 'blocks' ? newBlocksProject('Untitled blocks project') : newWebProject('Untitled website'));

async function newProject(mode) {
  if (!(await confirmDiscard())) return;
  loadIntoEditors(freshProject(mode));
}

async function switchMode(mode) {
  if (mode === state.mode) return;
  if (!(await confirmDiscard())) return;
  // Each mode has its own project file, so switching starts a new project in that mode.
  loadIntoEditors(freshProject(mode));
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
