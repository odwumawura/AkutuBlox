// Interaction editor: blocks <-> interaction model (schema "interaction").
// Learners build triggers and actions as blocks. We store the interaction model, not the blocks.
import * as Blockly from 'blockly';

const COLOR = '#0E7490';
const ACTION_COLOR = '#1D4ED8';
const HEX = /^#[0-9a-fA-F]{6}$/;

export const TRIGGERS = {
  clicked: { block: 'trigger_clicked', needsTarget: true },
  hovered: { block: 'trigger_hovered', needsTarget: true },
  mouseLeft: { block: 'trigger_mouseLeft', needsTarget: true },
  pageLoaded: { block: 'trigger_pageLoaded', needsTarget: false },
};

// Action block type -> model action type. Fields define how params map to the block.
export const ACTIONS = {
  show: { block: 'action_show', fields: ['TARGET'] },
  hide: { block: 'action_hide', fields: ['TARGET'] },
  toggle: { block: 'action_toggle', fields: ['TARGET'] },
  setText: { block: 'action_setText', fields: ['TARGET', 'TEXT'] },
  setTextColor: { block: 'action_setTextColor', fields: ['TARGET', 'COLOR'] },
  setBackground: { block: 'action_setBackground', fields: ['TARGET', 'COLOR'] },
  goToPage: { block: 'action_goToPage', fields: ['PAGE'] },
  openLink: { block: 'action_openLink', fields: ['URL'] },
};
const ACTION_BY_BLOCK = Object.fromEntries(Object.entries(ACTIONS).map(([type, def]) => [def.block, type]));
const TRIGGER_BY_BLOCK = Object.fromEntries(Object.entries(TRIGGERS).map(([type, def]) => [def.block, type]));

// Options come from the current page, so they are read when the menu opens.
const context = { targets: () => [], pages: () => [] };
export function setInteractionContext({ targets, pages }) {
  context.targets = targets;
  context.pages = pages;
}
const targetMenu = () => {
  const list = context.targets().map((t) => [t.label, t.id]);
  return list.length ? list : [['(no elements on this page)', '']];
};
const pageMenu = () => {
  const list = context.pages().map((p) => [p.name, p.id]);
  return list.length ? list : [['(no pages)', '']];
};

let registered = false;
export function registerInteractionBlocks() {
  if (registered) return;
  registered = true;

  const hat = (type, label, needsTarget) => {
    Blockly.Blocks[type] = {
      init() {
        const row = this.appendDummyInput().appendField('when');
        if (needsTarget) row.appendField(new Blockly.FieldDropdown(targetMenu), 'TARGET').appendField(label);
        else row.appendField(label);
        this.appendStatementInput('DO');
        this.setColour(COLOR);
        this.setTooltip('Runs the blocks inside when this happens.');
      },
    };
  };
  hat('trigger_clicked', 'is clicked', true);
  hat('trigger_hovered', 'is hovered', true);
  hat('trigger_mouseLeft', 'mouse leaves', true);
  hat('trigger_pageLoaded', 'the page loads', false);

  const action = (type, build) => {
    Blockly.Blocks[type] = {
      init() {
        build(this);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(ACTION_COLOR);
      },
    };
  };
  const target = (verb) => (b) => b.appendDummyInput().appendField(verb).appendField(new Blockly.FieldDropdown(targetMenu), 'TARGET');
  action('action_show', target('show'));
  action('action_hide', target('hide'));
  action('action_toggle', target('toggle'));
  action('action_setText', (b) => {
    b.appendDummyInput().appendField('set text of').appendField(new Blockly.FieldDropdown(targetMenu), 'TARGET');
    b.appendDummyInput().appendField('to').appendField(new Blockly.FieldTextInput('Hello!'), 'TEXT');
  });
  action('action_setTextColor', (b) => {
    b.appendDummyInput().appendField('set text color of').appendField(new Blockly.FieldDropdown(targetMenu), 'TARGET');
    b.appendDummyInput().appendField('to').appendField(new Blockly.FieldTextInput('#1d2433'), 'COLOR');
  });
  action('action_setBackground', (b) => {
    b.appendDummyInput().appendField('set background of').appendField(new Blockly.FieldDropdown(targetMenu), 'TARGET');
    b.appendDummyInput().appendField('to').appendField(new Blockly.FieldTextInput('#0F766E'), 'COLOR');
  });
  action('action_goToPage', (b) => b.appendDummyInput().appendField('go to page').appendField(new Blockly.FieldDropdown(pageMenu), 'PAGE'));
  action('action_openLink', (b) => b.appendDummyInput().appendField('open link').appendField(new Blockly.FieldTextInput('https://'), 'URL'));
}

export const INTERACTION_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'When', colour: COLOR, contents: [
        { kind: 'block', type: 'trigger_clicked' },
        { kind: 'block', type: 'trigger_hovered' },
        { kind: 'block', type: 'trigger_mouseLeft' },
        { kind: 'block', type: 'trigger_pageLoaded' },
      ],
    },
    {
      kind: 'category', name: 'Show & hide', colour: ACTION_COLOR, contents: [
        { kind: 'block', type: 'action_show' },
        { kind: 'block', type: 'action_hide' },
        { kind: 'block', type: 'action_toggle' },
      ],
    },
    {
      kind: 'category', name: 'Change', colour: ACTION_COLOR, contents: [
        { kind: 'block', type: 'action_setText' },
        { kind: 'block', type: 'action_setTextColor' },
        { kind: 'block', type: 'action_setBackground' },
      ],
    },
    {
      kind: 'category', name: 'Navigate', colour: ACTION_COLOR, contents: [
        { kind: 'block', type: 'action_goToPage' },
        { kind: 'block', type: 'action_openLink' },
      ],
    },
  ],
};

// ---------- Blocks -> model ----------

function actionFromBlock(block) {
  const type = ACTION_BY_BLOCK[block.type];
  if (!type) return null;
  const f = (name) => String(block.getFieldValue(name) ?? '');
  switch (type) {
    case 'show':
    case 'hide':
    case 'toggle':
      return { type, params: { targetId: f('TARGET') } };
    case 'setText':
      return { type, params: { targetId: f('TARGET'), text: f('TEXT') } };
    case 'setTextColor':
    case 'setBackground': {
      const color = f('COLOR');
      return { type, params: { targetId: f('TARGET'), color: HEX.test(color) ? color : '' } };
    }
    case 'goToPage':
      return { type, params: { pageId: f('PAGE') } };
    case 'openLink': {
      const url = f('URL').trim();
      return { type, params: { url: /^https?:\/\//.test(url) ? url : '' } };
    }
    default:
      return null;
  }
}

export function interactionsFromWorkspace(workspace) {
  const result = [];
  for (const top of workspace.getTopBlocks(true)) {
    const trigger = TRIGGER_BY_BLOCK[top.type];
    if (!trigger) continue;
    const actions = [];
    let b = top.getInputTargetBlock('DO');
    while (b) {
      const a = actionFromBlock(b);
      if (a) actions.push(a);
      b = b.getNextBlock();
    }
    const ix = { id: `ix-${result.length + 1}`, trigger: { type: trigger }, actions };
    if (TRIGGERS[trigger].needsTarget) ix.targetId = top.getFieldValue('TARGET') || '';
    result.push(ix);
  }
  return result;
}

// ---------- Model -> blocks ----------

function blockJsonForAction(a) {
  const def = ACTIONS[a.type];
  if (!def) return null;
  const p = a.params || {};
  const fields = {};
  if (def.fields.includes('TARGET')) fields.TARGET = p.targetId || '';
  if (def.fields.includes('TEXT')) fields.TEXT = p.text ?? '';
  if (def.fields.includes('COLOR')) fields.COLOR = p.color || (a.type === 'setBackground' ? '#0F766E' : '#1d2433');
  if (def.fields.includes('PAGE')) fields.PAGE = p.pageId || '';
  if (def.fields.includes('URL')) fields.URL = p.url || 'https://';
  return { type: def.block, fields };
}

export function blocksJsonFromInteractions(interactions) {
  return interactions.map((ix, i) => {
    const trigger = TRIGGERS[ix.trigger.type];
    if (!trigger) return null;
    const fields = trigger.needsTarget ? { TARGET: ix.targetId || '' } : {};
    const actionBlocks = ix.actions.map(blockJsonForAction).filter(Boolean);
    // Chain the actions with "next" links, as Blockly expects.
    for (let k = actionBlocks.length - 2; k >= 0; k--) actionBlocks[k].next = { block: actionBlocks[k + 1] };
    const block = { type: trigger.block, x: 40, y: 40 + i * 140, fields };
    if (actionBlocks.length) block.inputs = { DO: { block: actionBlocks[0] } };
    return block;
  }).filter(Boolean);
}

export function loadInteractions(workspace, interactions) {
  workspace.clear();
  const blocks = blocksJsonFromInteractions(interactions || []);
  for (const block of blocks) Blockly.serialization.blocks.append(block, workspace, { recordUndo: false });
}

// ---------- Targets for dropdowns ----------

export function elementsOf(root, pages) {
  const out = [];
  const walk = (node) => {
    if (node.type !== 'section' || node.id !== 'root') out.push({ id: node.id, label: `${node.type}: ${(node.props?.text || node.id).toString().slice(0, 30)}` });
    (node.children || []).forEach(walk);
  };
  walk(root);
  return out;
}

export { ACTION_BY_BLOCK, TRIGGER_BY_BLOCK };
