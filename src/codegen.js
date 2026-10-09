// Turns saved block scripts into the JavaScript that a sprite runs. Plain JS, no editor library.
// Block types are the current project format (see CHECKLIST A2). Unknown types produce nothing.
const num = (v) => Number(v) || 0;

const GEN = {
  event_flag: (b) => `sprite.onFlag(async () => {\n${body(b, 'DO')}});\n`,
  motion_move: (b) => `await sprite.move(${num(b.fields?.STEPS)});\n`,
  motion_turn: (b) => `await sprite.turn(${num(b.fields?.DEGREES)});\n`,
  control_repeat: (b) => {
    const times = Math.max(0, Math.floor(num(b.fields?.TIMES)));
    return `for (let i = 0; i < ${times}; i++) {\n${body(b, 'DO')}}\n`;
  },
  motion_goto: (b) => `await sprite.goTo(${num(b.fields?.X)}, ${num(b.fields?.Y)});\n`,
  motion_changex: (b) => `await sprite.changeX(${num(b.fields?.DX)});\n`,
  motion_setx: (b) => `await sprite.setX(${num(b.fields?.X)});\n`,
  motion_changey: (b) => `await sprite.changeY(${num(b.fields?.DY)});\n`,
  motion_sety: (b) => `await sprite.setY(${num(b.fields?.Y)});\n`,
  motion_point: (b) => `await sprite.point(${num(b.fields?.DIRECTION)});\n`,
  looks_show: () => 'await sprite.show();\n',
  looks_hide: () => 'await sprite.hide();\n',
  looks_changesize: (b) => `await sprite.changeSize(${num(b.fields?.CHANGE)});\n`,
  looks_setsize: (b) => `await sprite.setSize(${num(b.fields?.SIZE)});\n`,
  control_forever: (b) => `for (;;) {\nawait sprite.tick();\n${body(b, 'DO')}}\n`,
  control_wait: (b) => `await sprite.wait(${num(b.fields?.SECONDS)});\n`,
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
