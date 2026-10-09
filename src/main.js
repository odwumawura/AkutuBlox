import * as Blockly from 'blockly';
import grapesjs from 'grapesjs';
import JSZip from 'jszip';
import 'grapesjs/dist/css/grapes.min.css';
import '../style.css';
import { javascriptGenerator, TOOLBOX } from './blocks.js';
import { COSTUMES, BACKDROPS, newSprite } from './sprites.js';
import { createStage } from './runtime.js';
import {
  newBlocksProject,
  newWebProject,
  newWebPage,
  blocksProjectFromWorkspace,
  loadSpriteScripts,
  stageSpritesFromProject,
  webProjectFromEditor,
  loadBlocksProject,
  loadWebPage,
  downloadProject,
  readProjectFile,
} from './project.js';
import { siteFiles, previewHtml, treeFromEditor, PALETTE } from './web/model.js';
import {
  INTERACTION_TOOLBOX,
  registerInteractionBlocks,
  setInteractionContext,
  interactionsFromWorkspace,
  loadInteractions,
  elementsOf,
} from './web/interactions.js';

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

// ----- Sprites and backdrops -----
const blocksUi = { selectedId: null };

// Saves the sprite being edited back into the project document.
function saveSelectedSprite() {
  if (!state.project || state.project.mode !== 'blocks' || !blocksUi.selectedId) return;
  state.project = blocksProjectFromWorkspace(state.project, workspace, stage.getStarts(), blocksUi.selectedId);
}

// Code for one sprite, generated from its saved scripts on a headless workspace.
function codeForSprite(sprite) {
  const headless = new Blockly.Workspace();
  loadSpriteScripts(headless, sprite);
  const code = javascriptGenerator.workspaceToCode(headless);
  headless.dispose();
  return code;
}

function refreshStage() {
  stage.setSprites(stageSpritesFromProject(state.project));
  stage.setBackdrop(state.project.blocks.stage.backdrops[0]?.source || 'builtin:meadow');
  renderSpriteList();
  renderBackdropSelect();
}

function selectSprite(id) {
  saveSelectedSprite();
  blocksUi.selectedId = id;
  const sprite = state.project.blocks.sprites.find((s) => s.id === id);
  Blockly.Events.disable();
  try {
    loadSpriteScripts(workspace, sprite);
  } finally {
    Blockly.Events.enable();
  }
  renderSpriteList();
}

function renderSpriteList() {
  const list = document.getElementById('sprite-list');
  list.replaceChildren();
  const sprites = state.project?.blocks?.sprites || [];
  for (const s of sprites) {
    const chip = document.createElement('span');
    chip.className = 'chip sprite-chip' + (s.id === blocksUi.selectedId ? ' selected' : '');
    const pick = document.createElement('button');
    pick.className = 'chip-name';
    pick.textContent = s.name;
    pick.setAttribute('aria-pressed', String(s.id === blocksUi.selectedId));
    pick.addEventListener('click', () => selectSprite(s.id));
    chip.append(pick);
    if (sprites.length > 1) {
      const del = document.createElement('button');
      del.textContent = '×';
      del.title = `Delete ${s.name}`;
      del.setAttribute('aria-label', `Delete ${s.name}`);
      del.addEventListener('click', () => deleteSprite(s.id));
      chip.append(del);
    }
    list.append(chip);
  }
}

function addSprite() {
  saveSelectedSprite();
  const costume = document.getElementById('new-costume').value;
  const sprite = newSprite(state.project.blocks.sprites.length + 1, costume);
  state.project.blocks.sprites.push(sprite);
  markDirty();
  refreshStage();
  selectSprite(sprite.id);
}

function deleteSprite(id) {
  const sprites = state.project.blocks.sprites;
  const sprite = sprites.find((s) => s.id === id);
  if (sprites.length <= 1 || !sprite) return;
  if (!confirm(`Delete ${sprite.name} and its scripts?`)) return;
  saveSelectedSprite();
  state.project.blocks.sprites = sprites.filter((s) => s.id !== id);
  const next = state.project.blocks.sprites[0];
  markDirty();
  refreshStage();
  selectSprite(next.id);
}

function renderBackdropSelect() {
  const select = document.getElementById('backdrop-select');
  const current = state.project?.blocks?.stage?.backdrops?.[0]?.source || 'builtin:meadow';
  select.replaceChildren(...Object.entries(BACKDROPS).map(([key, b]) => new Option(b.label, key, false, key === current)));
}

function chooseBackdrop(source) {
  const stageInfo = state.project.blocks.stage;
  const rest = stageInfo.backdrops.filter((b) => b.source !== source);
  const asset = { id: `bg-${source.split(':')[1]}`, name: BACKDROPS[source]?.label || source, type: 'vector', source };
  stageInfo.backdrops = [asset, ...rest];
  markDirty();
  refreshStage();
}

document.getElementById('add-sprite').addEventListener('click', addSprite);
document.getElementById('backdrop-select').addEventListener('change', (e) => chooseBackdrop(e.target.value));
document.getElementById('new-costume').replaceChildren(...Object.entries(COSTUMES).map(([key, c]) => new Option(c.label, key)));

document.getElementById('run').addEventListener('click', () => {
  saveSelectedSprite();
  const runs = state.project.blocks.sprites.map((s) => ({ id: s.id, code: codeForSprite(s) }));
  stage.greenFlag(runs);
});
document.getElementById('stop').addEventListener('click', () => stage.stop());

// ---------- Web mode ----------
const editor = grapesjs.init({
  container: '#gjs',
  height: '100%',
  width: 'auto',
  storageManager: false,
  components: '',
  // No GrapesJS panels: no device switcher, style manager, layers, or code view. We provide our own controls.
  panels: { defaults: [] },
  blockManager: { appendTo: '#palette' },
});

document.getElementById('delete-el').addEventListener('click', () => {
  const selected = editor.getSelected();
  if (selected) selected.remove();
});
for (const item of PALETTE) editor.Blocks.add(item.id, { label: item.label, content: item.content, category: 'Components' });
// GrapesJS reports updates after loading too, so only count a change when the canvas really differs from the last snapshot.
const webSnapshot = () => JSON.stringify(treeFromEditor(editor));
// Interaction editor (right pane). Hidden until the Interactions tab is opened.
registerInteractionBlocks();
const iws = Blockly.inject('iblockly', {
  toolbox: INTERACTION_TOOLBOX,
  trashcan: true,
  renderer: 'geras',
  grid: { spacing: 20, length: 3, colour: '#dfe4ec', snap: true },
});
setInteractionContext({
  elements: () => elementsOf(treeFromEditor(editor)),
  pages: () => (state.project?.web?.pages || []),
  variables: () => (state.project?.web?.variables || []),
});

// ----- Variables (project-wide) -----
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
function renderVariables() {
  const list = document.getElementById('vars-list');
  list.replaceChildren();
  for (const v of state.project?.web?.variables || []) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${v.name} = ${v.value}`;
    const del = document.createElement('button');
    del.textContent = '×';
    del.title = `Delete ${v.name}`;
    del.setAttribute('aria-label', `Delete ${v.name}`);
    del.addEventListener('click', () => deleteVariable(v.name));
    chip.append(del);
    list.append(chip);
  }
}
function addVariable() {
  const name = document.getElementById('var-name').value.trim();
  const raw = document.getElementById('var-value').value;
  if (!VAR_NAME.test(name)) return alert('Variable names start with a letter or _, use letters, numbers, or _, and are up to 40 characters.');
  const vars = state.project.web.variables || (state.project.web.variables = []);
  if (vars.some((v) => v.name === name)) return alert(`A variable called ${name} already exists.`);
  vars.push({ id: `v-${name}`, name, value: raw });
  document.getElementById('var-name').value = '';
  document.getElementById('var-value').value = '';
  renderVariables();
  markDirty();
}
function deleteVariable(name) {
  const used = state.project.web.pages.some((p) => JSON.stringify(p.interactions || []).includes(`"${name}"`)) || JSON.stringify(interactionsFromWorkspace(iws)).includes(`"${name}"`);
  if (used) return alert(`${name} is used in a block. Remove those blocks first.`);
  state.project.web.variables = (state.project.web.variables || []).filter((v) => v.name !== name);
  renderVariables();
  markDirty();
}
document.getElementById('var-add').addEventListener('click', addVariable);
iws.addChangeListener((e) => {
  if (e.isUiEvent || e.type === Blockly.Events.VIEWPORT_CHANGE) return;
  if (state.mode === 'web') markDirty();
});

let previewTimer = null;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (state.mode === 'web' && document.getElementById('interactions-pane').hidden) previewCurrentPage();
  }, 300);
}

editor.on('update', () => {
  if (state.loading || state.mode !== 'web') return;
  schedulePreview();
  if (webSnapshot() !== state.webSnapshot) markDirty();
});

// Reads the canvas and the interaction blocks into the project document.
function captureWeb() {
  const project = webProjectFromEditor(state.project, editor, state.webPageId);
  const page = project.web.pages.find((p) => p.id === state.webPageId);
  if (page) page.interactions = interactionsFromWorkspace(iws);
  state.project = project;
  return project;
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
  captureWeb();
  state.webPageId = loadWebPage(state.project, pageId, editor);
  showInteractionsFor(state.webPageId);
  state.webSnapshot = webSnapshot();
  fillPageSelect();
  previewCurrentPage();
}

function showInteractionsFor(pageId) {
  renderVariables();
  const page = state.project.web.pages.find((p) => p.id === pageId);
  state.loading = true;
  Blockly.Events.disable();
  try {
    loadInteractions(iws, page?.interactions || []);
  } finally {
    Blockly.Events.enable();
    state.loading = false;
  }
}

el.pageSelect.addEventListener('change', () => switchWebPage(el.pageSelect.value));
document.getElementById('add-page').addEventListener('click', () => {
  captureWeb();
  const index = state.project.web.pages.length + 1;
  state.project.web.pages.push(newWebPage(index));
  markDirty();
  switchWebPage(`page-${index}`);
});

function buildSiteProject() {
  return captureWeb();
}

function previewCurrentPage() {
  const project = buildSiteProject();
  const page = project.web.pages.find((p) => p.id === state.webPageId);
  document.getElementById('preview-frame').srcdoc = previewHtml(page, project.web.pages, project.web.variables || []);
}

document.getElementById('preview').addEventListener('click', previewCurrentPage);

function showSideTab(name) {
  const isInteractions = name === 'interactions';
  document.getElementById('side-preview').classList.toggle('active', !isInteractions);
  document.getElementById('side-interactions').classList.toggle('active', isInteractions);
  document.getElementById('preview-frame').hidden = isInteractions;
  document.getElementById('interactions-pane').hidden = !isInteractions;
  if (isInteractions) Blockly.svgResize(iws);
  else previewCurrentPage();
}
document.getElementById('side-preview').addEventListener('click', () => showSideTab('preview'));
document.getElementById('side-interactions').addEventListener('click', () => showSideTab('interactions'));

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
      state.project = project;
      blocksUi.selectedId = loadBlocksProject(project, workspace, stage, project.blocks.sprites[0].id);
      refreshStage();
    } else {
      state.project = project;
      state.webPageId = loadWebPage(project, project.web.pages[0].id, editor);
      showInteractionsFor(state.webPageId);
      state.webSnapshot = webSnapshot();
      previewCurrentPage();
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
      ? blocksProjectFromWorkspace(base, workspace, stage.getStarts(), blocksUi.selectedId)
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

// Test hook: lets the browser tests read the stage. Harmless in production.
window.__akutu = { sprites: () => stage.getSprites() };
