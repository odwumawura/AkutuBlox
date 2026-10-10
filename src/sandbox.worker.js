// Sandbox for generated Blocks code. Runs in a Web Worker: no DOM, no localStorage, no cookies.
// The only way to affect the stage is to post state to the main thread and wait for it to draw.
// Stop = terminate this worker, so even a runaway loop can be stopped.

const ROTATION_STYLES = ['all around', 'left-right', "don't rotate"];

let state = { x: 0, y: 0, dir: 90, visible: true, size: 100, costume: 0, costumes: [], rotationStyle: 'all around', draggable: false };
let handlers = [];
const waiters = []; // FIFO: each posted state waits for one 'continue'
let askSeq = 0;
const answers = new Map(); // requests waiting for the main thread's answer

// Asks the main thread (variables, mouse) and waits for the answer.
function ask(request) {
  const id = ++askSeq;
  return new Promise((resolve) => {
    answers.set(id, resolve);
    post({ type: 'ask', id, ...request });
  });
}

const W = 480;
const H = 360;

const clampX = (x) => Math.max(-W / 2, Math.min(W / 2, x));
const clampSize = (n) => Math.max(5, Math.min(500, n));
const clampY = (y) => Math.max(-H / 2, Math.min(H / 2, y));

function post(msg) {
  self.postMessage(msg);
}

// Post the current state and wait until the main thread has drawn it.
function publish() {
  return new Promise((resolve) => {
    waiters.push(resolve);
    post({ type: 'state', state: { ...state } });
  });
}

const api = {
  onFlag(fn) {
    handlers.push(fn);
  },
  async move(steps) {
    const rad = (state.dir * Math.PI) / 180;
    state.x = Math.max(-W / 2, Math.min(W / 2, state.x + steps * Math.sin(rad)));
    state.y = Math.max(-H / 2, Math.min(H / 2, state.y + steps * Math.cos(rad)));
    await publish();
  },
  async turn(deg) {
    state.dir = (state.dir + deg) % 360;
    await publish();
  },
  // Absolute and relative placement. Same stage bounds as move().
  async goTo(x, y) {
    state.x = clampX(Number(x));
    state.y = clampY(Number(y));
    await publish();
  },
  async setX(x) {
    state.x = clampX(Number(x));
    await publish();
  },
  async setY(y) {
    state.y = clampY(Number(y));
    await publish();
  },
  async changeX(dx) {
    state.x = clampX(state.x + Number(dx));
    await publish();
  },
  async changeY(dy) {
    state.y = clampY(state.y + Number(dy));
    await publish();
  },
  // Looks: visibility and size. Size is a percentage, kept between 5 and 500 like Scratch.
  async show() {
    state.visible = true;
    await publish();
  },
  async hide() {
    state.visible = false;
    await publish();
  },
  async changeSize(delta) {
    state.size = clampSize(state.size + Number(delta));
    await publish();
  },
  async setSize(size) {
    state.size = clampSize(Number(size));
    await publish();
  },
  // Costumes: switch by name (an unknown name does nothing, as in Scratch) or step to the next one, wrapping.
  async switchCostume(name) {
    const i = state.costumes.indexOf(String(name));
    if (i >= 0) state.costume = i;
    await publish();
  },
  async nextCostume() {
    if (state.costumes.length) state.costume = (state.costume + 1) % state.costumes.length;
    await publish();
  },
  // Backdrops belong to the stage, so the change is posted to the main thread (no reply needed).
  async switchBackdrop(name) {
    post({ type: 'backdrop', op: 'switch', name: String(name) });
    await api.tick();
  },
  async nextBackdrop() {
    post({ type: 'backdrop', op: 'next' });
    await api.tick();
  },
  // Rotation style and drag mode. Only the mode changes here; position comes from the stage.
  async setRotationStyle(style) {
    const s = String(style);
    if (ROTATION_STYLES.includes(s)) state.rotationStyle = s;
    await publish();
  },
  async setDraggable(on) {
    state.draggable = on === true;
    await publish();
  },
  async point(dir) {
    state.dir = ((Number(dir) % 360) + 360) % 360;
    await publish();
  },
  // Yields to the event loop so a forever loop never blocks the worker.
  async tick() {
    await new Promise((r) => setTimeout(r, 0));
  },
  // Variables are shared by all sprites and live on the main thread.
  getVar(name) {
    return ask({ what: 'var', name: String(name) });
  },
  // Sensing: where the mouse is on the stage (origin at centre, y up), and whether it is pressed.
  mouseX() {
    return ask({ what: 'mouseX' });
  },
  mouseY() {
    return ask({ what: 'mouseY' });
  },
  mouseDown() {
    return ask({ what: 'mouseDown' });
  },
  // Touching: another sprite (by name), or the stage edge.
  touching(name) {
    return ask({ what: 'touching', name: String(name) });
  },
  touchingEdge() {
    return ask({ what: 'touchingEdge' });
  },
  setVar(name, value) {
    post({ type: 'setVar', name: String(name), value });
  },
  async changeVar(name, delta) {
    const cur = await api.getVar(name);
    api.setVar(name, (Number(cur) || 0) + Number(delta));
  },
  async wait(seconds) {
    await new Promise((r) => setTimeout(r, seconds * 1000));
  },
};

function runHandlers() {
  for (const fn of handlers) {
    fn().catch((err) => post({ type: 'error', message: err.message }));
  }
}

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'continue') {
    const next = waiters.shift();
    if (next) next();
    return;
  }
  if (msg.type === 'answer') {
    const resolve = answers.get(msg.id);
    if (resolve) {
      answers.delete(msg.id);
      resolve(msg.value);
    }
    return;
  }
  if (msg.type === 'moved') {
    // The stage moved this sprite by dragging it; keep the sprite's own state in step.
    state.x = msg.x;
    state.y = msg.y;
    return;
  }
  if (msg.type === 'run') {
    state = { ...msg.state };
    handlers = [];
    try {
      // Shadow network globals so generated code can't use them, even though our generators never emit them.
      const program = new Function('sprite', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', msg.code);
      program(api, undefined, undefined, undefined, undefined);
    } catch (err) {
      post({ type: 'error', message: err.message });
      return;
    }
    publish().then(() => runHandlers());
  }
};
