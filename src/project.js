// Project files (.akutu): create, validate, save and load. Follows schema/project.schema.json (v0.1).
import * as Blockly from 'blockly';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../schema/project.schema.json';

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
          costumes: [{ id: 'cat-a', name: 'cat-a', type: 'vector', source: 'builtin:cat', rotationCenterX: 50, rotationCenterY: 50 }],
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
      pages: [{ id: 'home', name: 'Home', path: 'index', title: 'Welcome', isHome: true, root: { id: 'root', type: 'section', children: [] } }],
    },
  };
}

// ---- Reading the live editors into a project document ----

export function blocksProjectFromWorkspace(base, workspace, sprite) {
  const project = structuredClone(base);
  project.meta.updatedAt = nowIso();
  const scripts = workspace.getTopBlocks(true).map((block, i) => {
    const { x, y } = block.getRelativeToSurfaceXY();
    return { id: `s-${i + 1}`, x: Math.round(x), y: Math.round(y), blocks: [Blockly.serialization.blocks.save(block)] };
  });
  const cat = project.blocks.sprites[0];
  cat.x = sprite.x;
  cat.y = sprite.y;
  cat.direction = sprite.dir;
  cat.scripts = scripts;
  return project;
}

export function webProjectFromEditor(base, editor) {
  const project = structuredClone(base);
  project.meta.updatedAt = nowIso();
  project.web.editorState = editor.getProjectData();
  return project;
}

// ---- Loading a document into the live editors ----

export function loadBlocksProject(project, workspace, runtime) {
  workspace.clear();
  const cat = project.blocks.sprites[0];
  for (const script of cat.scripts) {
    for (const block of script.blocks) {
      Blockly.serialization.blocks.append(block, workspace, { recordUndo: false });
    }
  }
  runtime.setSprite({ x: cat.x, y: cat.y, dir: cat.direction });
}

export function loadWebProject(project, editor) {
  if (project.web.editorState) {
    editor.loadProjectData(project.web.editorState);
  } else {
    editor.setComponents('');
  }
}

// ---- Files ----

export function downloadProject(project) {
  const safeName = (project.meta.name || 'project').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'project';
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.akutu`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readProjectFile(file) {
  const text = await file.text();
  let project;
  try {
    project = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON.'] };
  }
  return { ...validateProject(project), project };
}
