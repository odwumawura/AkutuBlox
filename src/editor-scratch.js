// Blocks editor on scratch-blocks (Scratch's own editor, Apache-2.0).
// The saved project keeps the current block JSON format, so the runtime and .akutu files do not change.
// This file converts both ways: Scratch blocks <-> current block JSON.
import * as ScratchBlocks from 'scratch-blocks';

// ---- Scratch colours: scratch-blocks looks up block styles by category name ----
const SCRATCH_COLOURS = {
  motion: '#4C97FF', looks: '#9966FF', sounds: '#CF63CF', event: '#FFBF00',
  control: '#FFAB19', sensing: '#5CB1D6', operators: '#59C059', data: '#FF8C1A',
  data_lists: '#FF661A', pen: '#0FBD8C', more: '#FF6680',
};
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
const blockStyles = {};
for (const [name, hex] of Object.entries(SCRATCH_COLOURS)) {
  blockStyles[name] = { colourPrimary: hex, colourSecondary: shade(hex, 0.9), colourTertiary: shade(hex, 0.8) };
}
const ScratchTheme = new ScratchBlocks.Theme('scratch-akutu', blockStyles, {}, {
  workspaceBackgroundColour: '#F9F9F9',
  toolboxBackgroundColour: '#FFFFFF',
  flyoutBackgroundColour: '#F9F9F9',
  scrollbarColour: '#CECDCE',
});

ScratchBlocks.ScratchMsgs.setLocale('en');
ScratchBlocks.setLocale('en');

export const TOOLBOX_XML = `
<xml>
  <category name="Events" id="events" colour="#FFBF00">
    <block type="event_whenflagclicked"/>
  </category>
  <category name="Motion" id="motion" colour="#4C97FF">
    <block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>
    <block type="motion_turnright"><value name="DEGREES"><shadow type="math_number"><field name="NUM">15</field></shadow></value></block>
  </category>
  <category name="Control" id="control" colour="#FFAB19">
    <block type="control_repeat"><value name="TIMES"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>
    <block type="control_wait"><value name="DURATION"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block>
  </category>
</xml>`;

// ---- Mapping: current block type <-> Scratch opcode (see CHECKLIST A2) ----
// numberInputs: current field name -> Scratch input name (a math_number shadow).
// hat: the event block's body lives in `next` on the Scratch side and in DO on the current side.
const MAP = [
  { old: 'event_flag', scratch: 'event_whenflagclicked', hat: true, numberInputs: {}, statements: {} },
  { old: 'motion_move', scratch: 'motion_movesteps', numberInputs: { STEPS: 'STEPS' }, statements: {} },
  { old: 'motion_turn', scratch: 'motion_turnright', numberInputs: { DEGREES: 'DEGREES' }, statements: {} },
  { old: 'control_repeat', scratch: 'control_repeat', numberInputs: { TIMES: 'TIMES' }, statements: { DO: 'SUBSTACK' } },
  { old: 'control_wait', scratch: 'control_wait', numberInputs: { SECONDS: 'DURATION' }, statements: {} },
];
const byOld = Object.fromEntries(MAP.map((m) => [m.old, m]));
const byScratch = Object.fromEntries(MAP.map((m) => [m.scratch, m]));

// ---- Scratch -> current JSON ----
function numberOf(block, inputName) {
  const input = block.getInput(inputName);
  const target = input && input.connection && input.connection.targetBlock();
  if (!target) return 0;
  return Number(target.getFieldValue('NUM')) || 0;
}

function chainToOld(block) {
  if (!block) return undefined;
  const m = byScratch[block.type];
  if (!m) return undefined; // unknown block types are not saved
  const out = { type: m.old, fields: {} };
  if (m.hat) {
    const body = chainToOld(block.getNextBlock());
    if (body) out.inputs = { DO: { block: body } };
    delete out.fields;
    return out;
  }
  for (const [oldField, scratchInput] of Object.entries(m.numberInputs)) {
    out.fields[oldField] = numberOf(block, scratchInput);
  }
  if (Object.keys(m.statements).length) {
    const [oldName, scratchName] = Object.entries(m.statements)[0];
    const body = chainToOld(block.getInputTargetBlock(scratchName));
    if (body) out.inputs = { [oldName]: { block: body } };
  }
  if (!Object.keys(out.fields).length) delete out.fields;
  const next = chainToOld(block.getNextBlock());
  if (next) out.next = { block: next };
  return out;
}

// ---- Current JSON -> Scratch XML ----
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function chainToXml(json) {
  if (!json) return '';
  const m = byOld[json.type];
  if (!m) return '';
  let inner = '';
  if (m.hat) {
    inner += `<next>${chainToXml(json.inputs?.DO?.block)}</next>`;
    return `<block type="${m.scratch}">${inner}</block>`;
  }
  for (const [oldField, scratchInput] of Object.entries(m.numberInputs)) {
    const v = json.fields?.[oldField] ?? 0;
    inner += `<value name="${scratchInput}"><shadow type="math_number"><field name="NUM">${esc(v)}</field></shadow></value>`;
  }
  for (const [oldName, scratchName] of Object.entries(m.statements)) {
    const body = chainToXml(json.inputs?.[oldName]?.block);
    if (body) inner += `<statement name="${scratchName}">${body}</statement>`;
  }
  const next = chainToXml(json.next?.block);
  if (next) inner += `<next>${next}</next>`;
  return `<block type="${m.scratch}">${inner}</block>`;
}

export function scratchAdapter(ws) {
  return {
    name: 'scratch',
    ws,
    getScripts() {
      return ws.getTopBlocks(true).map((block, i) => {
        const { x, y } = block.getRelativeToSurfaceXY();
        return { id: `s-${i + 1}`, x: Math.round(x), y: Math.round(y), blocks: [chainToOld(block)].filter(Boolean) };
      });
    },
    setScripts(scripts) {
      ws.clear();
      const parts = (scripts || []).map((script) => {
        const body = (script.blocks || []).map(chainToXml).join('');
        return body.replace(/^<block /, `<block x="${Math.round(script.x || 0)}" y="${Math.round(script.y || 0)}" `);
      });
      if (!parts.length) return;
      const dom = new DOMParser().parseFromString(`<xml xmlns="http://www.w3.org/1999/xhtml">${parts.join('')}</xml>`, 'text/xml').documentElement;
      ScratchBlocks.Xml.domToWorkspace(dom, ws);
    },
    onChange(cb) {
      ws.addChangeListener((e) => {
        if (e.isUiEvent || e.type === ScratchBlocks.Events.VIEWPORT_CHANGE) return;
        cb(e);
      });
    },
    resize() {
      ScratchBlocks.svgResize(ws);
    },
    quiet(fn) {
      ScratchBlocks.Events.disable();
      try {
        return fn();
      } finally {
        ScratchBlocks.Events.enable();
      }
    },
  };
}

export function injectScratch(el) {
  const ws = ScratchBlocks.inject(el, {
    media: '/sb-media/',
    toolbox: TOOLBOX_XML,
    zoom: { controls: true, startScale: 0.675 },
    theme: ScratchTheme,
  });
  return scratchAdapter(ws);
}
