import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';

// Block definitions (spike only). Colours are placeholders for the original palette.
const BLOCK_JSON = [
  {
    type: 'event_flag',
    message0: 'when green flag clicked',
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    colour: 185,
    tooltip: 'Runs the script when the green flag is pressed.',
  },
  {
    type: 'motion_move',
    message0: 'move %1 steps',
    args0: [{ type: 'field_number', name: 'STEPS', value: 10 }],
    previousStatement: null,
    nextStatement: null,
    colour: 215,
    tooltip: 'Moves the sprite forward in the direction it faces.',
  },
  {
    type: 'motion_turn',
    message0: 'turn %1 degrees',
    args0: [{ type: 'field_number', name: 'DEGREES', value: 15 }],
    previousStatement: null,
    nextStatement: null,
    colour: 215,
    tooltip: 'Turns the sprite clockwise.',
  },
  {
    type: 'control_repeat',
    message0: 'repeat %1',
    args0: [{ type: 'field_number', name: 'TIMES', value: 10, min: 0 }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Repeats the blocks inside.',
  },
  {
    type: 'control_wait',
    message0: 'wait %1 seconds',
    args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0 }],
    previousStatement: null,
    nextStatement: null,
    colour: 35,
    tooltip: 'Pauses the script.',
  },
];

Blockly.common.defineBlocksWithJsonArray(BLOCK_JSON);

// Generators: blocks -> JavaScript. The learner never sees this code.
javascriptGenerator.forBlock['event_flag'] = function (block) {
  const body = javascriptGenerator.statementToCode(block, 'DO');
  return `sprite.onFlag(async () => {\n${body}});\n`;
};

javascriptGenerator.forBlock['motion_move'] = function (block) {
  const steps = Number(block.getFieldValue('STEPS')) || 0;
  return `await sprite.move(${steps});\n`;
};

javascriptGenerator.forBlock['motion_turn'] = function (block) {
  const degrees = Number(block.getFieldValue('DEGREES')) || 0;
  return `await sprite.turn(${degrees});\n`;
};

javascriptGenerator.forBlock['control_repeat'] = function (block) {
  const times = Math.max(0, Math.floor(Number(block.getFieldValue('TIMES')) || 0));
  const body = javascriptGenerator.statementToCode(block, 'DO');
  return `for (let i = 0; i < ${times}; i++) {\n${body}}\n`;
};

javascriptGenerator.forBlock['control_wait'] = function (block) {
  const seconds = Number(block.getFieldValue('SECONDS')) || 0;
  return `await sprite.wait(${seconds});\n`;
};

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Events', colour: '#0E7490', contents: [{ kind: 'block', type: 'event_flag' }] },
    {
      kind: 'category',
      name: 'Motion',
      colour: '#1D4ED8',
      contents: [
        { kind: 'block', type: 'motion_move' },
        { kind: 'block', type: 'motion_turn' },
      ],
    },
    {
      kind: 'category',
      name: 'Control',
      colour: '#B45309',
      contents: [
        { kind: 'block', type: 'control_repeat' },
        { kind: 'block', type: 'control_wait' },
      ],
    },
  ],
};

export { javascriptGenerator };
