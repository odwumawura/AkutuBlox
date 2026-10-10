// Project files (.akutu): create, validate, save and load. Follows schema/project.schema.json (v0.1).
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../schema/project.schema.json';
import JSZip from 'jszip';
import { treeFromEditor, toEditor } from './web/model.js';

// Uploaded images (A8). A project with uploads is saved as a zip bundle: project.json plus assets/.
// A project without uploads stays a plain JSON file, as before.
export const UPLOAD_LIMIT = 512 * 1024; // bytes per image
export const UPLOAD_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };

const APP_VERSION = '0.0.1';
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function validateProject(project) {
  const ok = validateSchema(project);
  return {
    ok,
    errors: ok ? [] : validateSchema.errors.map((e) => `${e.instancePath || '/'} ${e.message}`),
  };
}

// Starter script: when green flag clicked -> repeat 4 times (move 40, turn 90).
const STARTER_SCRIPT = {
  type: 'event_flag',
  inputs: {
    DO: {
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
};

export function newBlocksProject(name = 'Untitled blocks project') {
  const t = nowIso();
  return {
    schemaVersion: '0.1',
    mode: 'blocks',
    meta: { name, createdAt: t, updatedAt: t, appVersion: APP_VERSION },
    blocks: {
      stage: {
        logicalWidth: 480,
        logicalHeight: 360,
        displayPreset: '480x360',
        backdrops: [{ id: 'bg1', name: 'Meadow', type: 'image', source: 'builtin:meadow' }],
      },
      sprites: [
        {
          id: 'cat',
          name: 'Cat',
          x: 0,
          y: 0,
          direction: 90,
          size: 100,
          visible: true,
          costumes: [{ id: 'cat-a', name: 'Cat', type: 'vector', source: 'builtin:cat', rotationCenterX: 50, rotationCenterY: 50 }],
          currentCostume: 0,
          scripts: [{ id: 's-start', x: 40, y: 40, blocks: [STARTER_SCRIPT] }],
        },
      ],
    },
  };
}

export function newWebProject(name = 'Untitled website') {
  const t = nowIso();
  return {
    schemaVersion: '0.1',
    mode: 'web',
    meta: { name, createdAt: t, updatedAt: t, appVersion: APP_VERSION },
    web: {
      theme: { primaryColor: '#0F766E', fontPair: 'inter-poppins', spacingScale: 'comfortable' },
      variables: [],
      pages: [
        {
          id: 'home', name: 'Home', path: 'index', title: 'Welcome', isHome: true,
          root: {
            id: 'root', type: 'section', props: {}, style: {}, children: [
              { id: 'h1', type: 'heading', props: { level: 1, text: 'Welcome to My Site' }, style: { textAlign: 'center' } },
              { id: 'btn', type: 'button', props: { text: 'Get Started' }, style: { background: '#0F766E', color: '#FFFFFF', borderRadius: 8 } },
              { id: 'msg', type: 'paragraph', props: { text: 'Hello! Welcome to my student site.', hidden: true }, style: {} },
            ],
          },
          interactions: [{ id: 'i1', targetId: 'btn', trigger: { type: 'clicked' }, actions: [{ type: 'show', params: { targetId: 'msg' } }] }],
        },
      ],
    },
  };
}

export function newWebPage(index) {
  return {
    id: `page-${index}`, name: `Page ${index}`, path: `page-${index}`, title: `Page ${index}`, isHome: false,
    root: { id: 'root', type: 'section', props: {}, style: {}, children: [] },
    interactions: [],
  };
}

// ---- Reading the live editors into a project document ----

// Saves the scripts of the sprite being edited, plus the starting place of every sprite (from the stage).
// `editor` is a blocks editor adapter (see editor-scratch.js).
export function blocksProjectFromWorkspace(base, editor, starts, selectedId) {
  const project = structuredClone(base);
  project.meta.updatedAt = nowIso();
  for (const sprite of project.blocks.sprites) {
    if (sprite.id === selectedId) sprite.scripts = editor.getScripts();
    const start = starts.find((st) => st.id === sprite.id);
    if (start) {
      sprite.x = start.x;
      sprite.y = start.y;
      sprite.direction = start.dir;
      sprite.visible = start.visible;
      sprite.size = start.size;
      sprite.currentCostume = start.costumeIndex;
      sprite.rotationStyle = start.rotationStyle;
      sprite.draggable = start.draggable;
    }
  }
  return project;
}

export function loadSpriteScripts(editor, sprite) {
  editor.setScripts(sprite.scripts || []);
}

// Stage list for a project: where each sprite starts and which costume it wears.
export function stageSpritesFromProject(project) {
  return project.blocks.sprites.map((s) => ({
    id: s.id, name: s.name, x: s.x, y: s.y, dir: s.direction, visible: s.visible !== false, size: s.size || 100,
    costume: s.costumes?.[s.currentCostume || 0]?.source || 'builtin:star',
    costumes: (s.costumes || []).map((c) => ({ name: c.name, source: c.source })),
    costumeIndex: s.currentCostume || 0,
    rotationStyle: s.rotationStyle || 'all around',
    draggable: s.draggable === true,
  }));
}

export function loadBlocksProject(project, editor, runtime, selectedId) {
  const sprite = project.blocks.sprites.find((s) => s.id === selectedId) || project.blocks.sprites[0];
  const variables = project.blocks.stage.variables || [];
  editor.setVariables(variables.map((v) => v.name));
  runtime.setVariables(variables);
  loadSpriteScripts(editor, sprite);
  runtime.setSprites(stageSpritesFromProject(project));
  return sprite.id;
}

export function webProjectFromEditor(base, editor, pageId) {
  const project = structuredClone(base);
  project.meta.updatedAt = nowIso();
  const page = project.web.pages.find((p) => p.id === pageId);
  if (page) page.root = treeFromEditor(editor);
  return project;
}

export function loadWebPage(project, pageId, editor) {
  const page = project.web.pages.find((p) => p.id === pageId) || project.web.pages[0];
  toEditor(editor, page.root);
  return page.id;
}

// ---- Files ----

// The asset paths a project uses (costumes and backdrops that were uploaded).
export function assetSources(project) {
  const out = new Set();
  for (const s of project.blocks?.sprites || []) for (const c of s.costumes || []) if (c.source?.startsWith('assets/')) out.add(c.source);
  for (const b of project.blocks?.stage?.backdrops || []) if (b.source?.startsWith('assets/')) out.add(b.source);
  return [...out];
}

// Checks an image before it is added. Returns { ok, error, source, width, height }.
export async function readImageUpload(file) {
  const ext = UPLOAD_TYPES[file.type];
  if (!ext) return { ok: false, error: 'Use a PNG, JPEG or GIF image.' };
  if (file.size > UPLOAD_LIMIT) return { ok: false, error: `That image is ${Math.round(file.size / 1024)} KB. The limit is ${UPLOAD_LIMIT / 1024} KB.` };
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, error: 'That file is not a readable image.' };
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return { ok: true, source: `assets/${id}.${ext}`, width: bitmap.width, height: bitmap.height };
}

export async function downloadProject(project, assets = new Map()) {
  const safeName = (project.meta.name || 'project').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'project';
  const used = assetSources(project).filter((src) => assets.has(src));
  let blob;
  if (used.length) {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project, null, 2));
    for (const src of used) zip.file(src, assets.get(src), { createFolders: false });
    blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  } else {
    blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.akutu`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif' };

export async function readProjectFile(file) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) return readBundle(file); // "PK": a zip bundle with assets
  const text = await file.text();
  let project;
  try {
    project = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }
  return { ...validateProject(project), project };
}

async function readBundle(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, errors: ['This project bundle could not be read.'] };
  }
  const entry = zip.file('project.json');
  if (!entry) return { ok: false, errors: ['The bundle has no project.json.'] };
  let project;
  try {
    project = JSON.parse(await entry.async('string'));
  } catch {
    return { ok: false, errors: ['The bundle has an invalid project.json.'], project: null, assets: new Map() };
  }
  const assets = new Map();
  for (const f of Object.values(zip.files)) {
    if (f.dir || !f.name.startsWith('assets/')) continue;
    const ext = f.name.split('.').pop().toLowerCase();
    const bytes = await f.async('uint8array');
    assets.set(f.name, new Blob([bytes], { type: MIME_BY_EXT[ext] || 'application/octet-stream' }));
  }
  return { ...validateProject(project), project, assets };
}
