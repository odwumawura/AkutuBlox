// Turns saved block scripts into the JavaScript that a sprite runs. Plain JS, no editor library.
//
// Saved format (see CHECKLIST A2 and batches 2-5):
//  - A number input holds a literal in `fields` (e.g. fields: { STEPS: 10 }),
//    or a reporter in `inputs` (e.g. inputs: { STEPS: { block: { type: 'operator_add', ... } } }).
//  - Reporter operands are blocks too; a literal operand is { type: 'math_number', fields: { NUM: 5 } }.
// Unknown block types produce nothing.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Code for a reporter (expression) block or a literal.
function expr(e) {
  if (!e) return 'undefined';
  if (e.type === 'math_number') return String(num(e.fields?.NUM));
  const gen = EXPR[e.type];
  return gen ? gen(e) : 'undefined';
}

// A numeric input: its reporter if it has one, otherwise the literal in fields.
function value(b, name) {
  const reporter = b.inputs?.[name]?.block;
  if (reporter) return `(${expr(reporter)})`;
  return String(num(b.fields?.[name]));
}

// A value that can be text or a number: a reporter, or the literal as saved.
function literalOrReporter(b, name) {
  const reporter = b.inputs?.[name]?.block;
  if (reporter) return `(${expr(reporter)})`;
  return JSON.stringify(b.fields?.[name] ?? 0);
}

// A boolean input: a reporter, or false when empty.
function condition(b, name) {
  const reporter = b.inputs?.[name]?.block;
  return reporter ? `(${expr(reporter)})` : 'false';
}

const operand = (e, name) => {
  const reporter = e.inputs?.[name]?.block;
  return reporter ? expr(reporter) : '0';
};
const bool = (e, name) => {
  const reporter = e.inputs?.[name]?.block;
  return reporter ? expr(reporter) : 'false';
};

// Reporters (expressions). Each returns a JS expression.
const EXPR = {
  sensing_touchingedge: () => '(await sprite.touchingEdge())',
  sensing_touchingsprite: (e) => `(await sprite.touching(${JSON.stringify(e.fields?.SPRITE ?? '')}))`,
  sensing_mousex: () => '(await sprite.mouseX())',
  sensing_mousey: () => '(await sprite.mouseY())',
  sensing_mousedown: () => '(await sprite.mouseDown())',
  data_variable: (e) => `(await sprite.getVar(${JSON.stringify(e.fields?.VARIABLE ?? '')}))`,
  operator_add: (e) => `(${operand(e, 'NUM1')} + ${operand(e, 'NUM2')})`,
  operator_subtract: (e) => `(${operand(e, 'NUM1')} - ${operand(e, 'NUM2')})`,
  operator_multiply: (e) => `(${operand(e, 'NUM1')} * ${operand(e, 'NUM2')})`,
  operator_divide: (e) => `(${operand(e, 'NUM1')} / ${operand(e, 'NUM2')})`,
  operator_lt: (e) => `(${operand(e, 'OPERAND1')} < ${operand(e, 'OPERAND2')})`,
  operator_gt: (e) => `(${operand(e, 'OPERAND1')} > ${operand(e, 'OPERAND2')})`,
  operator_equals: (e) => `(${operand(e, 'OPERAND1')} === ${operand(e, 'OPERAND2')})`,
  operator_and: (e) => `(${bool(e, 'OPERAND1')} && ${bool(e, 'OPERAND2')})`,
  operator_or: (e) => `(${bool(e, 'OPERAND1')} || ${bool(e, 'OPERAND2')})`,
  operator_not: (e) => `(!${bool(e, 'OPERAND')})`,
};

// Blocks that do things. Each returns JS statements.
const GEN = {
  event_flag: (b) => `sprite.onFlag(async () => {\n${body(b, 'DO')}});\n`,
  event_key: (b) => `sprite.onKey(${JSON.stringify(b.fields?.KEY ?? 'space')}, async () => {\n${body(b, 'DO')}});\n`,
  event_click: (b) => `sprite.onClick(async () => {\n${body(b, 'DO')}});\n`,
  event_message: (b) => `sprite.onMessage(${JSON.stringify(b.fields?.MSG ?? '')}, async () => {\n${body(b, 'DO')}});\n`,
  event_broadcast: (b) => `await sprite.broadcast(${JSON.stringify(b.fields?.MSG ?? '')});\n`,
  motion_move: (b) => `await sprite.move(${value(b, 'STEPS')});\n`,
  motion_turn: (b) => `await sprite.turn(${value(b, 'DEGREES')});\n`,
  motion_goto: (b) => `await sprite.goTo(${value(b, 'X')}, ${value(b, 'Y')});\n`,
  motion_changex: (b) => `await sprite.changeX(${value(b, 'DX')});\n`,
  motion_setx: (b) => `await sprite.setX(${value(b, 'X')});\n`,
  motion_changey: (b) => `await sprite.changeY(${value(b, 'DY')});\n`,
  motion_sety: (b) => `await sprite.setY(${value(b, 'Y')});\n`,
  motion_point: (b) => `await sprite.point(${value(b, 'DIRECTION')});\n`,
  looks_show: () => 'await sprite.show();\n',
  looks_hide: () => 'await sprite.hide();\n',
  looks_changesize: (b) => `await sprite.changeSize(${value(b, 'CHANGE')});\n`,
  looks_setsize: (b) => `await sprite.setSize(${value(b, 'SIZE')});\n`,
  looks_switchcostume: (b) => `await sprite.switchCostume(${JSON.stringify(b.fields?.COSTUME ?? '')});\n`,
  looks_nextcostume: () => 'await sprite.nextCostume();\n',
  looks_switchbackdrop: (b) => `await sprite.switchBackdrop(${JSON.stringify(b.fields?.BACKDROP ?? '')});\n`,
  looks_nextbackdrop: () => 'await sprite.nextBackdrop();\n',
  motion_setrotation: (b) => `await sprite.setRotationStyle(${JSON.stringify(b.fields?.STYLE ?? 'all around')});\n`,
  sensing_setdrag: (b) => `await sprite.setDraggable(${b.fields?.MODE === 'draggable'});\n`,
  control_repeat: (b) => `{\nconst n = Math.max(0, Math.floor(${value(b, 'TIMES')}));\nfor (let i = 0; i < n; i++) {\n${body(b, 'DO')}}\n}\n`,
  control_forever: (b) => `for (;;) {\nawait sprite.tick();\n${body(b, 'DO')}}\n`,
  control_if: (b) => `if (${condition(b, 'CONDITION')}) {\n${body(b, 'DO')}}\n`,
  control_wait_until: (b) => `while (!${condition(b, 'CONDITION')}) {\nawait sprite.tick();\n}\n`,
  data_setvariableto: (b) => `await sprite.setVar(${JSON.stringify(b.fields?.VARIABLE ?? '')}, ${literalOrReporter(b, 'VALUE')});\n`,
  data_changevariableby: (b) => `await sprite.changeVar(${JSON.stringify(b.fields?.VARIABLE ?? '')}, ${value(b, 'VALUE')});\n`,
  sound_playuntil: (b) => `await sprite.playSound(${JSON.stringify(b.fields?.SOUND ?? 'Pop')}, true);\n`,
  sound_start: (b) => `await sprite.playSound(${JSON.stringify(b.fields?.SOUND ?? 'Pop')}, false);\n`,
  sound_stopall: () => 'await sprite.stopAllSounds();\n',
  sound_setvolume: (b) => `await sprite.setVolume(${value(b, 'VOLUME')});\n`,
  sound_changevolume: (b) => `await sprite.changeVolume(${value(b, 'VOLUME')});\n`,
  myblock_define: (b) => `sprite.defineBlock(${JSON.stringify(b.fields?.NAME ?? '')}, async () => {\n${body(b, 'DO')}});\n`,
  myblock_call: (b) => `await sprite.callBlock(${JSON.stringify(b.fields?.BLOCK ?? '')});\n`,
  control_wait: (b) => `await sprite.wait(${value(b, 'SECONDS')});\n`,
};

// Code for a chain of blocks (a block, then its `next` blocks).
function chain(block) {
  let code = '';
  for (let b = block; b; b = b.next?.block) {
    const gen = GEN[b.type];
    if (gen) code += gen(b);
  }
  return code;
}

function body(block, input) {
  return chain(block.inputs?.[input]?.block);
}

// Code for one sprite's saved scripts (an array of { blocks: [chain] }).
export function codeForScripts(scripts) {
  return (scripts || []).map((s) => (s.blocks || []).map((b) => chain(b)).join('')).join('');
}
