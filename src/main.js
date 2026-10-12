import * as Blockly from 'blockly';
import grapesjs from 'grapesjs';
import JSZip from 'jszip';
import 'grapesjs/dist/css/grapes.min.css';
import '../style.css';
import { injectScratch, setSpriteNames, setCostumeNames, setBackdropNames } from './editor-scratch.js';
import { codeForScripts } from './codegen.js';
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
  readImageUpload,
} from './project.js';
import { siteFiles, previewHtml, treeFromEditor, PALETTE, HIDDEN_CLASS, setComponentHidden, isComponentHidden, STYLE_CSS, STYLE_OPTIONS, safeStyleValue, COMPONENT_CSS, youtubeIdFrom } from './web/model.js';
import {
  INTERACTION_TOOLBOX,
  registerInteractionBlocks,
  setInteractionContext,
  interactionsFromWorkspace,
  loadInteractions,
  elementsOf,
} from './web/interactions.js';

// ---------- Shared state ----------
const state = { mode: 'blocks', project: null, dirty: false, loading: false, webPageId: 'home', webSnapshot: '', assets: new Map() }; // assets: asset path -> Blob (uploads)
const assetUrls = new Map(); // asset path -> object URL, made once per file

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

let programsTimer = null;

function markDirty() {
  if (state.loading) return;
  state.dirty = true;
  el.dirty.hidden = false;
  schedulePrograms();
}
function markClean() {
  state.dirty = false;
  el.dirty.hidden = true;
}

// ---------- Blocks mode ----------
// Blocks editor: scratch-blocks.
const blocksEditor = injectScratch(document.getElementById('blocklyDiv'));
blocksEditor.onChange(() => markDirty());
blocksEditor.onVariableCreated((name, type) => {
  if (name.length > 40) {
    alert('Variable names can be up to 40 characters.');
    blocksEditor.removeVariable(name, type);
    return;
  }
  if (type === 'list') stage.addList(name);
  else stage.addVariable(name);
  markDirty();
});

const stage = createStage(document.getElementById('stage'), document.getElementById('log'));

// ----- Sprites and backdrops -----
const blocksUi = { selectedId: null };

// The project as it is now: the sprite being edited, sprite starts, and variable values.
function snapshotBlocksProject(base) {
  const project = blocksProjectFromWorkspace(base, blocksEditor, stage.getStarts(), blocksUi.selectedId);
  // Blocks refer to variables by name; the saved id only needs to be unique and match the schema.
  project.blocks.stage.variables = stage.getVariables().map((v, i) => ({ id: `v${i + 1}`, name: v.name, value: v.value }));
  project.blocks.stage.lists = stage.getLists().map((l, i) => ({ id: `l${i + 1}`, name: l.name, items: l.items }));
  return project;
}

// Saves the sprite being edited back into the project document.
function saveSelectedSprite() {
  if (!state.project || state.project.mode !== 'blocks' || !blocksUi.selectedId) return;
  state.project = snapshotBlocksProject(state.project);
}

// Code for one sprite, generated from its saved scripts.
function codeForSprite(sprite) {
  return codeForScripts(sprite.scripts);
}

// Gives the stage a URL for each uploaded image (see project.js for the bundle format).
function syncAssets() {
  for (const [src, blob] of state.assets) if (!assetUrls.has(src)) assetUrls.set(src, URL.createObjectURL(blob));
  stage.setAssets(assetUrls);
}

function refreshStage() {
  syncAssets();
  schedulePrograms();
  setSpriteNames(state.project.blocks.sprites.map((s) => s.name));
  syncCostumeNames();
  stage.setSprites(stageSpritesFromProject(state.project));
  stage.setBackdrops(state.project.blocks.stage.backdrops);
  renderSpriteList();
  renderBackdropSelect();
}

// The switch-costume dropdown lists the costumes of the sprite being edited;
// the switch-backdrop dropdown lists the stage's backdrops.
function syncCostumeNames() {
  const sprite = state.project?.blocks?.sprites?.find((s) => s.id === blocksUi.selectedId);
  setCostumeNames(sprite ? sprite.costumes.map((c) => c.name) : []);
  setBackdropNames((state.project?.blocks?.stage?.backdrops || []).map((b) => b.name));
}

function selectSprite(id) {
  saveSelectedSprite();
  blocksUi.selectedId = id;
  const sprite = state.project.blocks.sprites.find((s) => s.id === id);
  syncCostumeNames();
  blocksEditor.quiet(() => loadSpriteScripts(blocksEditor, sprite));
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

// Built-in backdrops, then the uploaded ones in the project.
function renderBackdropSelect() {
  const select = document.getElementById('backdrop-select');
  const backdrops = state.project?.blocks?.stage?.backdrops || [];
  const current = backdrops[0]?.source || 'builtin:meadow';
  const uploaded = backdrops.filter((b) => b.source.startsWith('assets/'));
  select.replaceChildren(
    ...Object.entries(BACKDROPS).map(([key, b]) => new Option(b.label, key, false, key === current)),
    ...uploaded.map((b) => new Option(b.name, b.source, false, b.source === current)),
  );
}

function chooseBackdrop(source) {
  const stageInfo = state.project.blocks.stage;
  const rest = stageInfo.backdrops.filter((b) => b.source !== source);
  const existing = stageInfo.backdrops.find((b) => b.source === source);
  const asset = existing || { id: `bg-${source.split(':')[1]}`, name: BACKDROPS[source]?.label || source, type: 'vector', source };
  stageInfo.backdrops = [asset, ...rest];
  markDirty();
  refreshStage();
}

// A name that is not used yet in the list: "Red", then "Red 2", "Red 3"...
function uniqueName(list, base) {
  const name = (base || 'Image').slice(0, 50);
  const taken = new Set(list.map((x) => x.name));
  let n = name, i = 2;
  while (taken.has(n)) n = `${name} ${i++}`;
  return n;
}

// ---------- Uploads (A8): a costume for the sprite being edited, or a backdrop for the stage ----------
let uploadTarget = null; // 'costume' or 'backdrop': set by the button that opened the file picker
const uploadInput = document.getElementById('upload-image');
document.getElementById('add-costume').addEventListener('click', () => { uploadTarget = 'costume'; uploadInput.click(); });
document.getElementById('add-backdrop').addEventListener('click', () => { uploadTarget = 'backdrop'; uploadInput.click(); });
uploadInput.addEventListener('change', async () => {
  const file = uploadInput.files[0];
  uploadInput.value = '';
  if (!file || !state.project || state.project.mode !== 'blocks') return;
  const target = uploadTarget;
  const result = await readImageUpload(file);
  if (!result.ok) {
    alert(result.error);
    return;
  }
  const base = file.name.replace(/\.[^.]+$/, '');
  if (target === 'costume') {
    saveSelectedSprite();
    const sprite = state.project.blocks.sprites.find((s) => s.id === blocksUi.selectedId);
    if (!sprite) return;
    sprite.costumes = sprite.costumes || [];
    sprite.costumes.push({
      id: `cos-${result.source.slice(7, -4)}`, name: uniqueName(sprite.costumes, base), type: 'image', source: result.source,
      width: result.width, height: result.height, rotationCenterX: result.width / 2, rotationCenterY: result.height / 2,
    });
  } else {
    const stageInfo = state.project.blocks.stage;
    // Like choosing a built-in backdrop: the new one becomes the starting backdrop.
    stageInfo.backdrops = [{ id: `bg-${result.source.slice(7, -4)}`, name: uniqueName(stageInfo.backdrops, base), type: 'image', source: result.source, width: result.width, height: result.height }, ...stageInfo.backdrops];
  }
  state.assets.set(result.source, file);
  markDirty();
  refreshStage();
  renderBackdropSelect();
});

document.getElementById('add-sprite').addEventListener('click', addSprite);
document.getElementById('backdrop-select').addEventListener('change', (e) => chooseBackdrop(e.target.value));
document.getElementById('new-costume').replaceChildren(...Object.entries(COSTUMES).map(([key, c]) => new Option(c.label, key)));

// Every sprite's code, from the saved scripts (the sprite being edited is saved first).
function buildRuns() {
  saveSelectedSprite();
  return state.project.blocks.sprites.map((s) => ({ id: s.id, code: codeForSprite(s) }));
}

// After an edit, the idle listeners (for key, click and message scripts when not running) are rebuilt.
function schedulePrograms() {
  if (!state.project || state.project.mode !== 'blocks') return;
  clearTimeout(programsTimer);
  programsTimer = setTimeout(() => stage.setPrograms(buildRuns()), 250);
}

document.getElementById('run').addEventListener('click', () => {
  stage.greenFlag(buildRuns());
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
  if (state.mode === 'web') {
    markDirty();
    schedulePreview();
  }
});

let previewTimer = null;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (state.mode === 'web') previewCurrentPage();
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
  fillThemeControls();  // the theme comes from the same project, so fill it at the same time
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

// ---- Page rename, delete, theme, and hidden elements ----

// Pages that link to, or run an action against, pageId. Deleting such a page would leave a broken link.
function pagesLinkingTo(pageId) {
  return state.project.web.pages.filter((p) => p.id !== pageId && (
    JSON.stringify(p.interactions || []).includes(`"${pageId}"`) || JSON.stringify(p.root).includes(`"pageId":"${pageId}"`)));
}

function renameWebPage() {
  captureWeb();
  const page = state.project.web.pages.find((p) => p.id === state.webPageId);
  const name = (prompt('New page name (up to 40 characters):', page.name) || '').trim();
  if (!name || name === page.name) return;
  if (name.length > 40) return alert('Page names can be up to 40 characters.');
  if (state.project.web.pages.some((p) => p.id !== page.id && p.name.toLowerCase() === name.toLowerCase())) return alert(`Another page is already called ${name}.`);
  page.name = name;  // The file name (path) stays the same, so links and exported files are not affected.
  markDirty();
  fillPageSelect();
  previewCurrentPage();
}

function deleteWebPage() {
  captureWeb();
  const pages = state.project.web.pages;
  const page = pages.find((p) => p.id === state.webPageId);
  if (pages.length <= 1) return alert('A site needs at least one page.');
  if (page.isHome) return alert('The home page cannot be deleted.');
  const linked = pagesLinkingTo(page.id);
  if (linked.length) return alert(`${page.name} is linked from ${linked.map((p) => p.name).join(', ')}. Remove those links first.`);
  if (!confirm(`Delete ${page.name}? Its elements and blocks will be removed.`)) return;
  const home = pages.find((p) => p.isHome && p.id !== page.id) || pages.find((p) => p.id !== page.id);
  state.project.web.pages = pages.filter((p) => p.id !== page.id);
  // Show the home page next. Set the page id first so the capture step does not write the deleted page back.
  state.webPageId = loadWebPage(state.project, home.id, editor);
  showInteractionsFor(state.webPageId);
  state.webSnapshot = webSnapshot();
  markDirty();
  fillPageSelect();
  previewCurrentPage();
}

document.getElementById('rename-page').addEventListener('click', renameWebPage);
document.getElementById('delete-page').addEventListener('click', deleteWebPage);

// Theme: stored in the file now; the look is applied in a later step (B5).
function fillThemeControls() {
  const t = state.project.web.theme || {};
  document.getElementById('theme-font').value = t.fontPair || 'inter-poppins';
  document.getElementById('theme-spacing').value = t.spacingScale || 'comfortable';
}
function setTheme(key, value) {
  captureWeb();
  state.project.web.theme = { ...(state.project.web.theme || {}), [key]: value };
  markDirty();
}
document.getElementById('theme-font').addEventListener('change', (e) => setTheme('fontPair', e.target.value));
document.getElementById('theme-spacing').addEventListener('change', (e) => setTheme('spacingScale', e.target.value));

// Hidden elements: shown on the canvas (dashed outline) by default, so they can be selected and edited.
const HIDDEN_CANVAS_CSS = `.${HIDDEN_CLASS}{opacity:.5;outline:2px dashed #94a3b8;outline-offset:-2px}.hide-hidden .${HIDDEN_CLASS}{display:none !important}`;
function applyShowHidden() {
  const on = document.getElementById('show-hidden').getAttribute('aria-pressed') === 'true';
  editor.Canvas.getBody()?.classList.toggle('hide-hidden', !on);
}
editor.on('load', () => {
  editor.Css.addRules(HIDDEN_CANVAS_CSS + COMPONENT_CSS);
  applyShowHidden();
});
document.getElementById('show-hidden').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  e.currentTarget.textContent = on ? 'Hidden elements: shown' : 'Hidden elements: hidden';
  applyShowHidden();
});

const elementPanel = document.getElementById('element-panel');
const hiddenBox = document.getElementById('el-hidden');
editor.on('component:selected', (c) => {
  const real = c && c.get('type') !== 'wrapper';
  elementPanel.hidden = !real;
  if (!real) return;
  document.getElementById('el-title').textContent = `Selected: <${c.get('tagName') || 'div'}>`;
  hiddenBox.checked = isComponentHidden(c);
  fillStyleFields(c);
  const isVideo = c.get('tagName') === 'iframe';
  document.getElementById('el-youtube-row').hidden = !isVideo;
  document.getElementById('el-youtube').value = c.getAttributes()['data-youtube-id'] || '';
  document.getElementById('el-var-row').hidden = !c.getAttributes()['data-kind'];
  document.getElementById('el-var').value = c.getAttributes()['data-show'] || '';
});

// Counter and timer display: the variable whose value is shown.
document.getElementById('el-var').addEventListener('change', (e) => {
  const c = editor.getSelected();
  if (!c || !c.getAttributes()['data-kind']) return;
  const name = e.target.value.trim();
  if (name && !/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(name)) return alert('Variable names start with a letter or _, use only letters, numbers and _, and are up to 40 characters.');
  c.addAttributes({ 'data-show': name });
  markDirty();
  previewCurrentPage();
});

// Video: paste a YouTube link or the 11-character ID. Only the privacy-enhanced embed is used.
document.getElementById('el-youtube').addEventListener('change', (e) => {
  const c = editor.getSelected();
  if (!c || c.get('tagName') !== 'iframe') return;
  const id = youtubeIdFrom(e.target.value);
  if (!id && e.target.value.trim()) return alert('Paste a YouTube link or an 11-character video ID.');
  c.addAttributes({ 'data-youtube-id': id });
  markDirty();
  previewCurrentPage();
});
editor.on('component:deselected', () => { elementPanel.hidden = true; });
hiddenBox.addEventListener('change', () => {
  const c = editor.getSelected();
  if (!c) return;
  setComponentHidden(c, hiddenBox.checked);
  markDirty();
  previewCurrentPage();
});

// ---- Style panel (B4): presets only, for the selected element ----
const styleFields = document.getElementById('style-fields');
for (const [key, opt] of Object.entries(STYLE_OPTIONS)) {
  const label = document.createElement('label');
  label.className = 'style-field';
  label.append(`${opt.label} `);
  let input;
  if (opt.kind === 'colour') {
    input = document.createElement('input');
    input.type = 'color';
    input.title = 'Use Reset style to remove the colour';
  } else {
    input = document.createElement('select');
    input.append(new Option('(default)', ''));
    for (const [value, text] of opt.options) input.append(new Option(text, value));
  }
  input.dataset.style = key;
  input.setAttribute('aria-label', opt.label);
  label.append(input);
  styleFields.append(label);
}

// Show the selected element's current style in the panel.
function fillStyleFields(c) {
  const style = c.getStyle() || {};
  for (const input of styleFields.querySelectorAll('[data-style]')) {
    const key = input.dataset.style;
    const value = safeStyleValue(key, style[STYLE_CSS[key]]);
    input.value = value ?? (input.type === 'color' ? '#000000' : '');
  }
}

// Set one style on the selected element. An empty value removes it.
function applyStyle(key, value) {
  const c = editor.getSelected();
  if (!c) return;
  const next = { ...c.getStyle() };
  delete next[STYLE_CSS[key]];
  if (value) {
    const ok = safeStyleValue(key, value);
    if (ok === null) return;
    next[STYLE_CSS[key]] = ok;
  }
  c.setStyle(next);
  markDirty();
  previewCurrentPage();
}
styleFields.addEventListener('change', (e) => {
  if (e.target.dataset.style) applyStyle(e.target.dataset.style, e.target.value);
});
document.getElementById('reset-style').addEventListener('click', () => {
  const c = editor.getSelected();
  if (!c) return;
  c.setStyle({});
  fillStyleFields(c);
  markDirty();
  previewCurrentPage();
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
  if (mode === 'blocks') blocksEditor.resize();
}

function loadIntoEditors(project, assets = new Map()) {
  state.assets = assets;
  state.loading = true;
  Blockly.Events.disable();
  try {
    if (project.mode === 'blocks') {
      state.project = project;
      // Costume names must be known before the blocks are created, or a saved costume choice would be lost.
      blocksUi.selectedId = project.blocks.sprites[0].id;
      syncCostumeNames();
      blocksUi.selectedId = blocksEditor.quiet(() => loadBlocksProject(project, blocksEditor, stage, project.blocks.sprites[0].id));
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
      ? snapshotBlocksProject(base)
      : buildSiteProject();
  project.meta.name = el.name.value.trim() || 'Untitled';
  return project;
}

async function saveCurrent() {
  const project = currentProjectDocument();
  await downloadProject(project, state.assets);
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
  loadIntoEditors(result.project, result.assets ?? new Map());
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
window.__akutu = { web: () => state.project?.web, sprites: () => stage.getSprites(), assets: () => [...state.assets.keys()], sounds: () => stage.getSoundLog(), backdrop: () => stage.getBackdrop(), variables: () => stage.getVariables(), lists: () => stage.getLists(), snapshot: () => snapshotBlocksProject(state.project), scripts: () => blocksEditor.getScripts(), loadScripts: (scripts) => { blocksEditor.quiet(() => blocksEditor.setScripts(scripts)); schedulePrograms(); } };
