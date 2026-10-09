// Interaction editor: blocks <-> interaction model (schema "interaction").
// Learners build triggers and actions as blocks. We store the interaction model, not the blocks.
import * as Blockly from 'blockly';

const TRIGGER_COLOR = '#0E7490';
const ACTION_COLOR = '#1D4ED8';
const LOGIC_COLOR = '#7C3AED';
const VARIABLE_COLOR = '#B45309';

// Comparison operators for "if". Values are the model's names; labels are what the learner sees.
const OPS = [['=', 'equals'], ['≠', 'notEquals'], ['<', 'less'], ['>', 'greater'], ['≤', 'lessOrEqual'], ['≥', 'greaterOrEqual']];

// One table drives the blocks, the toolbox, and both conversions.
//   parts: text strings, or { field, menu } (dropdown), { field, text } (text input), { field, number } (number input)
//   params: model param name -> field name. For triggers, "target" is the element the trigger is attached to.
//   branches: statement inputs whose blocks become nested action lists (params.then / params.else)
const SPEC = {
  triggers: {
    clicked: { parts: ['when', { field: 'TARGET', menu: 'element' }, 'is clicked'], target: 'TARGET' },
    hovered: { parts: ['when', { field: 'TARGET', menu: 'element' }, 'is hovered'], target: 'TARGET' },
    mouseLeft: { parts: ['when', { field: 'TARGET', menu: 'element' }, 'mouse leaves'], target: 'TARGET' },
    pageLoaded: { parts: ['when the page loads'] },
    pageVisited: { parts: ['when the visitor has been to', { field: 'PAGE', menu: 'page' }], params: { pageId: 'PAGE' } },
    formSubmitted: { parts: ['when', { field: 'TARGET', menu: 'form' }, 'is submitted'], target: 'TARGET' },
    textChanged: { parts: ['when text changes in', { field: 'TARGET', menu: 'textInput' }], target: 'TARGET' },
    checkboxChecked: { parts: ['when', { field: 'TARGET', menu: 'checkbox' }, 'is ticked'], target: 'TARGET' },
    timerReached: { parts: ['after', { field: 'SECONDS', number: 5 }, 'seconds on the page'], params: { seconds: 'SECONDS' } },
    variableEquals: { parts: ['when variable', { field: 'NAME', menu: 'variable' }, 'equals', { field: 'VALUE', text: '0' }], params: { name: 'NAME', value: 'VALUE' } },
  },
  actions: {
    show: { parts: ['show', { field: 'TARGET', menu: 'element' }], params: { targetId: 'TARGET' } },
    hide: { parts: ['hide', { field: 'TARGET', menu: 'element' }], params: { targetId: 'TARGET' } },
    toggle: { parts: ['toggle', { field: 'TARGET', menu: 'element' }], params: { targetId: 'TARGET' } },
    fadeIn: { parts: ['fade in', { field: 'TARGET', menu: 'element' }], params: { targetId: 'TARGET' } },
    fadeOut: { parts: ['fade out', { field: 'TARGET', menu: 'element' }], params: { targetId: 'TARGET' } },
    move: { parts: ['move', { field: 'TARGET', menu: 'element' }, 'right', { field: 'DX', number: 0 }, 'px, down', { field: 'DY', number: 0 }, 'px'], params: { targetId: 'TARGET', dx: 'DX', dy: 'DY' } },
    setText: { parts: ['set text of', { field: 'TARGET', menu: 'element' }, 'to', { field: 'TEXT', text: 'Hello!' }], params: { targetId: 'TARGET', text: 'TEXT' } },
    showVariable: { parts: ['show variable', { field: 'NAME', menu: 'variable' }, 'in', { field: 'TARGET', menu: 'element' }], params: { name: 'NAME', targetId: 'TARGET' } },
    setTextColor: { parts: ['set text color of', { field: 'TARGET', menu: 'element' }, 'to', { field: 'COLOR', text: '#1d2433' }], params: { targetId: 'TARGET', color: 'COLOR' } },
    setBackground: { parts: ['set background of', { field: 'TARGET', menu: 'element' }, 'to', { field: 'COLOR', text: '#0F766E' }], params: { targetId: 'TARGET', color: 'COLOR' } },
    setImage: { parts: ['set picture of', { field: 'TARGET', menu: 'image' }, 'to', { field: 'URL', text: 'https://' }], params: { targetId: 'TARGET', url: 'URL' } },
    playSound: { parts: ['play sound', { field: 'URL', text: 'https://' }], params: { url: 'URL' } },
    goToPage: { parts: ['go to page', { field: 'PAGE', menu: 'page' }], params: { pageId: 'PAGE' } },
    openLink: { parts: ['open link', { field: 'URL', text: 'https://' }], params: { url: 'URL' } },
    setVariable: { parts: ['set variable', { field: 'NAME', menu: 'variable' }, 'to', { field: 'VALUE', text: '0' }], params: { name: 'NAME', value: 'VALUE' } },
    changeVariable: { parts: ['change variable', { field: 'NAME', menu: 'variable' }, 'by', { field: 'BY', number: 1 }], params: { name: 'NAME', by: 'BY' } },
    readField: { parts: ['set variable', { field: 'NAME', menu: 'variable' }, 'to the text in', { field: 'TARGET', menu: 'textInput' }], params: { name: 'NAME', targetId: 'TARGET' } },
    clearForm: { parts: ['clear form', { field: 'TARGET', menu: 'form' }], params: { targetId: 'TARGET' } },
    showValidation: { parts: ['show message', { field: 'TEXT', text: 'Please check this' }, 'on', { field: 'TARGET', menu: 'textInput' }], params: { targetId: 'TARGET', message: 'TEXT' } },
    startTimer: { parts: ['start timer', { field: 'NAME', menu: 'variable' }], params: { name: 'NAME' } },
    stopTimer: { parts: ['stop timer', { field: 'NAME', menu: 'variable' }], params: { name: 'NAME' } },
    resetTimer: { parts: ['reset timer', { field: 'NAME', menu: 'variable' }], params: { name: 'NAME' } },
    if: {
      parts: ['if variable', { field: 'NAME', menu: 'variable' }, { field: 'OP', menu: 'op' }, { field: 'VALUE', text: '0' }],
      params: { name: 'NAME', op: 'OP', value: 'VALUE' },
      branches: { then: 'THEN', else: 'ELSE' },
    },
    wait: { parts: ['wait', { field: 'SECONDS', number: 1 }, 'seconds'], params: { seconds: 'SECONDS' } },
  },
};
const NUMBER_FIELDS = new Set(['SECONDS', 'DX', 'DY', 'BY']);

const TRIGGER_BY_BLOCK = Object.fromEntries(Object.keys(SPEC.triggers).map((t) => [`trigger_${t}`, t]));
const ACTION_BY_BLOCK = Object.fromEntries(Object.keys(SPEC.actions).map((a) => [`action_${a}`, a]));

// Menus read the current page and project, so they are read each time a dropdown opens.
const context = { elements: () => [], pages: () => [], variables: () => [] };
export function setInteractionContext({ elements, pages, variables }) {
  Object.assign(context, { elements, pages, variables });
}
const KIND_OF_TYPE = { form: 'form', textInput: 'textInput', checkbox: 'checkbox', image: 'image' };
function menuFor(kind) {
  return () => {
    if (kind === 'op') return OPS;
    let list;
    if (kind === 'element') list = context.elements().map((e) => [e.label, e.id]);
    else if (kind === 'page') list = context.pages().map((p) => [p.name, p.id]);
    else if (kind === 'variable') list = context.variables().map((v) => [v.name, v.name]);
    else list = context.elements().filter((e) => KIND_OF_TYPE[e.type] === kind).map((e) => [e.label, e.id]);
    return list.length ? list : [[`(no ${kind === 'element' ? 'elements' : kind} yet)`, '']];
  };
}

let registered = false;
export function registerInteractionBlocks() {
  if (registered) return;
  registered = true;
  const add = (kind, name, spec) => {
    const colour = kind === 'trigger' ? TRIGGER_COLOR : spec.branches ? LOGIC_COLOR : ACTION_COLOR;
    Blockly.Blocks[`${kind}_${name}`] = {
      init() {
        const row = this.appendDummyInput();
        for (const part of spec.parts) {
          if (typeof part === 'string') row.appendField(part);
          else if (part.menu) row.appendField(new Blockly.FieldDropdown(menuFor(part.menu)), part.field);
          else if (part.number !== undefined) row.appendField(new Blockly.FieldNumber(part.number), part.field);
          else row.appendField(new Blockly.FieldTextInput(part.text), part.field);
        }
        if (kind === 'trigger') this.appendStatementInput('DO');
        else {
          this.setPreviousStatement(true);
          this.setNextStatement(true);
        }
        if (spec.branches) {
          this.appendStatementInput(spec.branches.then).appendField('then');
          this.appendStatementInput(spec.branches.else).appendField('else');
        }
        this.setColour(colour);
        this.setTooltip(kind === 'trigger' ? 'Runs the blocks inside when this happens.' : 'Does this step.');
      },
    };
  };
  for (const [name, spec] of Object.entries(SPEC.triggers)) add('trigger', name, spec);
  for (const [name, spec] of Object.entries(SPEC.actions)) add('action', name, spec);
}

const blocksOf = (kind, names) => names.map((n) => ({ kind: 'block', type: `${kind}_${n}` }));
export const INTERACTION_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'When', colour: TRIGGER_COLOR, contents: blocksOf('trigger', Object.keys(SPEC.triggers)) },
    { kind: 'category', name: 'Show & hide', colour: ACTION_COLOR, contents: blocksOf('action', ['show', 'hide', 'toggle', 'fadeIn', 'fadeOut', 'move']) },
    { kind: 'category', name: 'Change', colour: ACTION_COLOR, contents: blocksOf('action', ['setText', 'setTextColor', 'setBackground', 'setImage']) },
    { kind: 'category', name: 'Decide', colour: LOGIC_COLOR, contents: blocksOf('action', ['if']) },
    { kind: 'category', name: 'Forms & sound', colour: ACTION_COLOR, contents: blocksOf('action', ['readField', 'clearForm', 'showValidation', 'playSound', 'openLink', 'goToPage']) },
    { kind: 'category', name: 'Variables & time', colour: VARIABLE_COLOR, contents: blocksOf('action', ['setVariable', 'changeVariable', 'showVariable', 'startTimer', 'stopTimer', 'resetTimer', 'wait']) },
  ],
};

// ---------- Blocks -> model ----------

function paramsFromBlock(block, params) {
  const out = {};
  for (const [name, field] of Object.entries(params)) {
    const raw = block.getFieldValue(field);
    out[name] = NUMBER_FIELDS.has(field) ? Number(raw) || 0 : String(raw ?? '');
  }
  return out;
}

// Reads a chain of action blocks (following "next") into a list, recursing into if/else branches.
function actionsFromChain(first) {
  const out = [];
  for (let b = first; b; b = b.getNextBlock()) {
    const type = ACTION_BY_BLOCK[b.type];
    if (!type) continue;
    const spec = SPEC.actions[type];
    const params = paramsFromBlock(b, spec.params || {});
    if (spec.branches) {
      params.then = actionsFromChain(b.getInputTargetBlock(spec.branches.then));
      params.else = actionsFromChain(b.getInputTargetBlock(spec.branches.else));
    }
    out.push({ type, params });
  }
  return out;
}

export function interactionsFromWorkspace(workspace) {
  const result = [];
  for (const top of workspace.getTopBlocks(true)) {
    const type = TRIGGER_BY_BLOCK[top.type];
    if (!type) continue;
    const spec = SPEC.triggers[type];
    const trigger = { type };
    if (spec.params) trigger.params = paramsFromBlock(top, spec.params);
    const ix = { id: `ix-${result.length + 1}`, trigger, actions: actionsFromChain(top.getInputTargetBlock('DO')) };
    if (spec.target) ix.targetId = String(top.getFieldValue(spec.target) || '');
    result.push(ix);
  }
  return result;
}

// ---------- Model -> blocks ----------

function fieldsFor(spec, params, targetId) {
  const fields = {};
  for (const [name, field] of Object.entries(spec.params || {})) {
    const value = params?.[name];
    fields[field] = value ?? (NUMBER_FIELDS.has(field) ? 0 : '');
  }
  if (spec.target) fields[spec.target] = targetId || '';
  return fields;
}

// Builds the block JSON for a list of actions, chained with "next". Returns undefined for an empty list.
function chainJson(actions) {
  const blocks = (actions || []).map((a) => {
    const spec = SPEC.actions[a.type];
    if (!spec) return null;
    const json = { type: `action_${a.type}`, fields: fieldsFor(spec, a.params, a.params?.targetId) };
    if (spec.branches) {
      json.inputs = {};
      const then = chainJson(a.params?.then);
      const otherwise = chainJson(a.params?.else);
      if (then) json.inputs[spec.branches.then] = { block: then };
      if (otherwise) json.inputs[spec.branches.else] = { block: otherwise };
    }
    return json;
  }).filter(Boolean);
  for (let k = blocks.length - 2; k >= 0; k--) blocks[k].next = { block: blocks[k + 1] };
  return blocks[0];
}

export function blocksJsonFromInteractions(interactions) {
  return interactions.map((ix, i) => {
    const trigger = SPEC.triggers[ix.trigger?.type];
    if (!trigger) return null;
    const json = { type: `trigger_${ix.trigger.type}`, x: 40, y: 40 + i * 150, fields: fieldsFor(trigger, ix.trigger.params, ix.targetId) };
    const first = chainJson(ix.actions);
    if (first) json.inputs = { DO: { block: first } };
    return json;
  }).filter(Boolean);
}

export function loadInteractions(workspace, interactions) {
  workspace.clear();
  for (const block of blocksJsonFromInteractions(interactions || [])) {
    Blockly.serialization.blocks.append(block, workspace, { recordUndo: false });
  }
}

// ---------- Targets for dropdowns ----------

export function elementsOf(root) {
  const out = [];
  const walk = (node, isRoot) => {
    if (!isRoot) out.push({ id: node.id, type: node.type, label: `${node.type}: ${String(node.props?.text || node.props?.placeholder || node.props?.label || node.id).slice(0, 30)}` });
    (node.children || []).forEach((c) => walk(c, false));
  };
  walk(root, true);
  return out;
}
