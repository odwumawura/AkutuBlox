// Blocks editor on scratch-blocks (Scratch's own editor, Apache-2.0).
// The saved project keeps our block format (see codegen.js), so the runtime and .akutu files stay simple.
// This file converts both ways: Scratch blocks <-> our format.
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

// Sprite names for the "touching" dropdown. main.js keeps this up to date.
let spriteNames = [];
export function setSpriteNames(names) {
  spriteNames = names;
}
const spriteOptions = () => (spriteNames.length ? spriteNames.map((n) => [n, n]) : [['(no sprites)', '']]);

ScratchBlocks.defineBlocksWithJsonArray([
  { type: 'sensing_touchingedge', message0: 'touching edge?', extensions: ['colours_sensing', 'output_boolean'] },
  {
    type: 'sensing_touchingsprite',
    message0: 'touching %1 ?',
    args0: [{ type: 'field_dropdown', name: 'SPRITE', options: spriteOptions }],
    extensions: ['colours_sensing', 'output_boolean'],
  },
]);

ScratchBlocks.ScratchMsgs.setLocale('en');
ScratchBlocks.setLocale('en');

const num = (name, value) => `<value name="${name}"><shadow type="math_number"><field name="NUM">${value}</field></shadow></value>`;
const txt = (name, value) => `<value name="${name}"><shadow type="text"><field name="TEXT">${value}</field></shadow></value>`;

export const TOOLBOX_XML = `
<xml>
  <category name="Events" id="events" colour="#FFBF00">
    <block type="event_whenflagclicked"/>
  </category>
  <category name="Motion" id="motion" colour="#4C97FF">
    <block type="motion_movesteps">${num('STEPS', 10)}</block>
    <block type="motion_turnright">${num('DEGREES', 15)}</block>
    <block type="motion_gotoxy">${num('X', 0)}${num('Y', 0)}</block>
    <block type="motion_changexby">${num('DX', 10)}</block>
    <block type="motion_setx">${num('X', 0)}</block>
    <block type="motion_changeyby">${num('DY', 10)}</block>
    <block type="motion_sety">${num('Y', 0)}</block>
    <block type="motion_pointindirection">${num('DIRECTION', 90)}</block>
  </category>
  <category name="Looks" id="looks" colour="#9966FF">
    <block type="looks_show"/>
    <block type="looks_hide"/>
    <block type="looks_changesizeby">${num('CHANGE', 10)}</block>
    <block type="looks_setsizeto">${num('SIZE', 100)}</block>
  </category>
  <category name="Control" id="control" colour="#FFAB19">
    <block type="control_forever"/>
    <block type="control_if"/>
    <block type="control_wait_until"/>
    <block type="control_repeat">${num('TIMES', 10)}</block>
    <block type="control_wait">${num('DURATION', 1)}</block>
  </category>
  <category name="Sensing" id="sensing" colour="#5CB1D6">
    <block type="sensing_mousex"/>
    <block type="sensing_mousey"/>
    <block type="sensing_mousedown"/>
    <block type="sensing_touchingedge"/>
    <block type="sensing_touchingsprite"/>
  </category>
  <category name="Variables" id="variables" colour="#FF8C1A" custom="VARIABLE"/>
  <category name="Operators" id="operators" colour="#59C059">
    <block type="operator_add">${num('NUM1', 0)}${num('NUM2', 0)}</block>
    <block type="operator_subtract">${num('NUM1', 0)}${num('NUM2', 0)}</block>
    <block type="operator_multiply">${num('NUM1', 0)}${num('NUM2', 0)}</block>
    <block type="operator_divide">${num('NUM1', 0)}${num('NUM2', 0)}</block>
    <block type="operator_lt">${txt('OPERAND1', '')}${txt('OPERAND2', '50')}</block>
    <block type="operator_gt">${txt('OPERAND1', '')}${txt('OPERAND2', '50')}</block>
    <block type="operator_equals">${txt('OPERAND1', '')}${txt('OPERAND2', '50')}</block>
    <block type="operator_and"/>
    <block type="operator_or"/>
    <block type="operator_not"/>
  </category>
</xml>`;

// ---- Mapping: our block type <-> Scratch opcode (see CHECKLIST A2) ----
// numberInputs: our field name -> Scratch input name. Each one is a literal (shadow) or a reporter.
// statements: our input name -> Scratch statement input name.
// boolInputs: our input name -> Scratch input name for a true/false reporter.
// hat: the event block's body lives in `next` on the Scratch side and in DO in our format.
const MAP = [
  { old: 'event_flag', scratch: 'event_whenflagclicked', hat: true, numberInputs: {}, statements: {}, boolInputs: {} },
  { old: 'motion_move', scratch: 'motion_movesteps', numberInputs: { STEPS: 'STEPS' }, statements: {}, boolInputs: {} },
  { old: 'motion_turn', scratch: 'motion_turnright', numberInputs: { DEGREES: 'DEGREES' }, statements: {}, boolInputs: {} },
  { old: 'motion_goto', scratch: 'motion_gotoxy', numberInputs: { X: 'X', Y: 'Y' }, statements: {}, boolInputs: {} },
  { old: 'motion_changex', scratch: 'motion_changexby', numberInputs: { DX: 'DX' }, statements: {}, boolInputs: {} },
  { old: 'motion_setx', scratch: 'motion_setx', numberInputs: { X: 'X' }, statements: {}, boolInputs: {} },
  { old: 'motion_changey', scratch: 'motion_changeyby', numberInputs: { DY: 'DY' }, statements: {}, boolInputs: {} },
  { old: 'motion_sety', scratch: 'motion_sety', numberInputs: { Y: 'Y' }, statements: {}, boolInputs: {} },
  { old: 'motion_point', scratch: 'motion_pointindirection', numberInputs: { DIRECTION: 'DIRECTION' }, statements: {}, boolInputs: {} },
  { old: 'looks_show', scratch: 'looks_show', numberInputs: {}, statements: {}, boolInputs: {} },
  { old: 'looks_hide', scratch: 'looks_hide', numberInputs: {}, statements: {}, boolInputs: {} },
  { old: 'looks_changesize', scratch: 'looks_changesizeby', numberInputs: { CHANGE: 'CHANGE' }, statements: {}, boolInputs: {} },
  { old: 'looks_setsize', scratch: 'looks_setsizeto', numberInputs: { SIZE: 'SIZE' }, statements: {}, boolInputs: {} },
  { old: 'control_forever', scratch: 'control_forever', numberInputs: {}, statements: { DO: 'SUBSTACK' }, boolInputs: {} },
  { old: 'control_if', scratch: 'control_if', numberInputs: {}, statements: { DO: 'SUBSTACK' }, boolInputs: { CONDITION: 'CONDITION' } },
  { old: 'control_wait_until', scratch: 'control_wait_until', numberInputs: {}, statements: {}, boolInputs: { CONDITION: 'CONDITION' } },
  { old: 'control_repeat', scratch: 'control_repeat', numberInputs: { TIMES: 'TIMES' }, statements: { DO: 'SUBSTACK' }, boolInputs: {} },
  { old: 'control_wait', scratch: 'control_wait', numberInputs: { SECONDS: 'DURATION' }, statements: {}, boolInputs: {} },
  { old: 'data_setvariableto', scratch: 'data_setvariableto', numberInputs: { VALUE: 'VALUE' }, textInputs: ['VALUE'], varField: 'VARIABLE', statements: {}, boolInputs: {} },
  { old: 'data_changevariableby', scratch: 'data_changevariableby', numberInputs: { VALUE: 'VALUE' }, varField: 'VARIABLE', statements: {}, boolInputs: {} },
];
const byOld = Object.fromEntries(MAP.map((m) => [m.old, m]));
const byScratch = Object.fromEntries(MAP.map((m) => [m.scratch, m]));

// Reporters: same name on both sides. Operands are numbers, or booleans for and/or/not.
const REPORTERS = {
  sensing_touchingedge: [],
  sensing_mousex: [],
  sensing_mousey: [],
  sensing_mousedown: [],
  operator_add: ['NUM1', 'NUM2'],
  operator_subtract: ['NUM1', 'NUM2'],
  operator_multiply: ['NUM1', 'NUM2'],
  operator_divide: ['NUM1', 'NUM2'],
  operator_lt: ['OPERAND1', 'OPERAND2'],
  operator_gt: ['OPERAND1', 'OPERAND2'],
  operator_equals: ['OPERAND1', 'OPERAND2'],
  operator_and: ['OPERAND1', 'OPERAND2'],
  operator_or: ['OPERAND1', 'OPERAND2'],
  operator_not: ['OPERAND'],
};
// Operands that are text in Scratch (comparisons) use a text shadow; the rest use a number shadow.
const TEXT_OPERANDS = new Set(['operator_lt', 'operator_gt', 'operator_equals']);

// ---- Variables ----
// Variables are global. Ids are derived from names, so blocks and the palette agree.
const varId = (name) => `var_${name}`;
const variableName = (block) => block.getField('VARIABLE')?.getText() ?? '';

// The Variables palette: make a variable, one reporter per variable, and set/change for the first one.
function variableFlyout(ws) {
  const vars = ws.getVariableMap().getAllVariables().slice().sort((a, b) => a.name.localeCompare(b.name));
  const field = (name) => `<field name="VARIABLE" id="${esc(varId(name))}" variabletype="">${esc(name)}</field>`;
  const parts = ['<button text="Make a Variable" callbackKey="CREATE_VARIABLE"/>'];
  for (const v of vars) parts.push(`<block type="data_variable">${field(v.name)}</block>`);
  if (vars.length) {
    parts.push(`<block type="data_setvariableto">${field(vars[0].name)}${txt('VALUE', 0)}</block>`);
    parts.push(`<block type="data_changevariableby">${field(vars[0].name)}${num('VALUE', 1)}</block>`);
  }
  const dom = new DOMParser().parseFromString(`<xml xmlns="http://www.w3.org/1999/xhtml">${parts.join('')}</xml>`, 'text/xml').documentElement;
  return Array.from(dom.children);
}

// ---- Reading a Scratch input value ----
function literalOf(target) {
  const raw = target.getFieldValue('NUM') ?? target.getFieldValue('TEXT');
  const n = Number(raw);
  return { type: 'math_number', fields: { NUM: raw !== '' && Number.isFinite(n) ? n : String(raw ?? '') } };
}

// Reads a Scratch input into our format: a reporter, a literal, or nothing.
function inputToOld(block, scratchName) {
  const target = block.getInputTargetBlock(scratchName);
  if (!target) return { kind: 'none' };
  if (target.isShadow()) return { kind: 'literal', value: literalOf(target).fields.NUM };
  return { kind: 'reporter', block: reporterToOld(target) };
}

function reporterToOld(block) {
  if (block.type === 'data_variable') return { type: 'data_variable', fields: { VARIABLE: variableName(block) } };
  if (block.type === 'sensing_touchingsprite') return { type: 'sensing_touchingsprite', fields: { SPRITE: block.getFieldValue('SPRITE') ?? '' } };
  const names = REPORTERS[block.type];
  if (!names) return undefined; // unknown reporters are not saved
  const out = { type: block.type };
  for (const name of names) {
    const input = inputToOld(block, name);
    if (input.kind === 'reporter') out.inputs = { ...(out.inputs || {}), [name]: { block: input.block } };
    else if (input.kind === 'literal') out.inputs = { ...(out.inputs || {}), [name]: { block: { type: 'math_number', fields: { NUM: input.value } } } };
  }
  return out;
}

// ---- Scratch -> our format ----
function chainToOld(block) {
  if (!block) return undefined;
  const m = byScratch[block.type];
  if (!m) return undefined; // unknown block types are not saved
  const out = {};
  out.type = m.old;
  if (m.varField) out.fields = { VARIABLE: variableName(block) };
  if (m.hat) {
    const body = chainToOld(block.getNextBlock());
    if (body) out.inputs = { DO: { block: body } };
    return out;
  }
  for (const [oldName, scratchName] of Object.entries(m.numberInputs)) {
    const input = inputToOld(block, scratchName);
    if (input.kind === 'literal') out.fields = { ...(out.fields || {}), [oldName]: input.value };
    if (input.kind === 'reporter') out.inputs = { ...(out.inputs || {}), [oldName]: { block: input.block } };
  }
  for (const [oldName, scratchName] of Object.entries(m.boolInputs)) {
    const input = inputToOld(block, scratchName);
    if (input.kind === 'reporter') out.inputs = { ...(out.inputs || {}), [oldName]: { block: input.block } };
  }
  for (const [oldName, scratchName] of Object.entries(m.statements)) {
    const body = chainToOld(block.getInputTargetBlock(scratchName));
    if (body) out.inputs = { ...(out.inputs || {}), [oldName]: { block: body } };
  }
  if (out.fields && !Object.keys(out.fields).length) delete out.fields;
  const next = chainToOld(block.getNextBlock());
  if (next) out.next = { block: next };
  return out;
}

// ---- Our format -> Scratch XML ----
const variableField = (name) => `<field name="VARIABLE" id="${esc(varId(name ?? ''))}" variabletype="">${esc(name ?? '')}</field>`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A reporter (or literal) placed in an input.
function reporterXml(e, inputName, textShadow = false) {
  if (e.type === 'math_number') {
    const v = esc(e.fields?.NUM ?? 0);
    return textShadow
      ? `<value name="${inputName}"><shadow type="text"><field name="TEXT">${v}</field></shadow></value>`
      : `<value name="${inputName}"><shadow type="math_number"><field name="NUM">${v}</field></shadow></value>`;
  }
  return `<value name="${inputName}">${blockXml(e)}</value>`;
}

function operandsXml(e, names) {
  const textShadow = TEXT_OPERANDS.has(e.type);
  return names.map((name) => {
    const reporter = e.inputs?.[name]?.block;
    return reporter ? reporterXml(reporter, name, textShadow) : '';
  }).join('');
}

// Any block (statement or reporter), without its `next` chain.
function blockXml(e) {
  if (e.type === 'sensing_touchingsprite') return `<block type="sensing_touchingsprite"><field name="SPRITE">${esc(e.fields?.SPRITE ?? '')}</field></block>`;
  if (e.type === 'data_variable') return `<block type="data_variable">${variableField(e.fields?.VARIABLE)}</block>`;
  if (REPORTERS[e.type]) return `<block type="${e.type}">${operandsXml(e, REPORTERS[e.type])}</block>`;
  return '';
}

function chainToXml(json) {
  if (!json) return '';
  const m = byOld[json.type];
  if (!m) return '';
  let inner = '';
  if (m.hat) {
    inner += `<next>${chainToXml(json.inputs?.DO?.block)}</next>`;
    return `<block type="${m.scratch}">${inner}</block>`;
  }
  if (m.varField) inner += variableField(json.fields?.VARIABLE);
  for (const [oldName, scratchName] of Object.entries(m.numberInputs)) {
    if (json.inputs?.[oldName]?.block) {
      inner += reporterXml(json.inputs[oldName].block, scratchName);
    } else {
      const v = json.fields?.[oldName] ?? 0;
      const text = (m.textInputs || []).includes(scratchName);
      inner += text
        ? `<value name="${scratchName}"><shadow type="text"><field name="TEXT">${esc(v)}</field></shadow></value>`
        : `<value name="${scratchName}"><shadow type="math_number"><field name="NUM">${esc(v)}</field></shadow></value>`;
    }
  }
  for (const [oldName, scratchName] of Object.entries(m.boolInputs)) {
    if (json.inputs?.[oldName]?.block) inner += `<value name="${scratchName}">${blockXml(json.inputs[oldName].block)}</value>`;
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
    // Replaces the variables in the editor with these names (call inside quiet()).
    setVariables(names) {
      ws.getVariableMap().clear();
      for (const name of names) ws.createVariable(name, '', varId(name));
    },
    removeVariable(name) {
      const v = ws.getVariable(name);
      if (v) ws.deleteVariableById(v.getId());
    },
    // Calls cb(name) when the user makes a variable from the palette.
    onVariableCreated(cb) {
      ws.addChangeListener((e) => {
        if (e.type !== ScratchBlocks.Events.VAR_CREATE) return;
        const v = ws.getVariableById(e.varId);
        if (v) cb(v.name);
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
  ws.registerToolboxCategoryCallback('VARIABLE', variableFlyout);
  return scratchAdapter(ws);
}
