// Sandbox for generated Blocks code. Runs in a Web Worker: no DOM, no localStorage, no cookies.
// The only way to affect the stage is to post state to the main thread and wait for it to draw.
// Stop = terminate this worker, so even a runaway loop can be stopped.

const ROTATION_STYLES = ['all around', 'left-right', "don't rotate"];

let state = { x: 0, y: 0, dir: 90, visible: true, size: 100, costume: 0, costumes: [], rotationStyle: 'all around', draggable: false, volume: 100, bubble: null };
let handlers = []; // green-flag scripts
let eventHandlers = []; // key, click and message scripts: { kind, key | name, fn }
let customBlocks = new Map(); // My Blocks defined by this sprite: name -> body
const waiters = []; // FIFO: each posted state waits for one 'continue'
// Thrown by 'stop this script' and 'stop all'. Ends the running script without an error message.
const STOP = Symbol('stop script');
let bubbleSeq = 0; // counts bubbles, so a timed bubble knows whether it was replaced

// Sets the bubble text (empty clears it). Returns the bubble's number.
function showBubble(text, kind) {
  const seq = ++bubbleSeq;
  const t = String(text ?? '');
  state.bubble = t === '' ? null : { text: t, kind };
  return seq;
}
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
  // Event hats. The main thread sends each event to the sprites; a matching script runs.
  onKey(key, fn) {
    eventHandlers.push({ kind: 'key', key: String(key), fn });
  },
  onClick(fn) {
    eventHandlers.push({ kind: 'click', fn });
  },
  onMessage(name, fn) {
    eventHandlers.push({ kind: 'message', name: String(name), fn });
  },
  // Broadcast goes to the main thread, which delivers it to every sprite (including this one).
  async broadcast(name) {
    post({ type: 'broadcast', name: String(name) });
    await api.tick();
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
  // Sound: built-in sounds, played on the main thread. Volume is a percentage for this sprite.
  // 'until done' waits for the sound to end; otherwise the sound starts and the script goes on.
  playSound(name, wait) {
    return ask({ what: 'sound', name: String(name), volume: state.volume, wait: wait === true });
  },
  async stopAllSounds() {
    post({ type: 'sound', op: 'stop' });
    await api.tick();
  },
  async setVolume(v) {
    state.volume = Math.max(0, Math.min(100, Number(v) || 0));
    await api.tick();
  },
  async changeVolume(d) {
    state.volume = Math.max(0, Math.min(100, state.volume + (Number(d) || 0)));
    await api.tick();
  },
  // Motion (beginner set). Go to a sprite by name (an unknown name does nothing).
  async goToSprite(name) {
    const at = await ask({ what: 'spritePos', name: String(name) });
    if (!at) return;
    state.x = clampX(at.x);
    state.y = clampY(at.y);
    await publish();
  },
  async goToRandom() {
    state.x = Math.floor(Math.random() * (W + 1)) - W / 2;
    state.y = Math.floor(Math.random() * (H + 1)) - H / 2;
    await publish();
  },
  // Glide: moves in a straight line over the given seconds, one frame at a time (30 frames a second).
  async glideTo(secs, x, y) {
    const sx = state.x;
    const sy = state.y;
    const tx = clampX(Number(x));
    const ty = clampY(Number(y));
    const steps = Math.max(1, Math.round((Number(secs) || 0) * 30));
    for (let i = 1; i <= steps; i++) {
      state.x = sx + ((tx - sx) * i) / steps;
      state.y = sy + ((ty - sy) * i) / steps;
      await publish();
      if (i < steps) await new Promise((r) => setTimeout(r, 1000 / 30));
    }
  },
  // Bounce: if the sprite touches the stage edge, turn it back the way it came and keep it on stage.
  async bounceOnEdge() {
    const r = (18 * state.size) / 100;
    const rad = (state.dir * Math.PI) / 180;
    const pastSide = (state.x + r > W / 2 && Math.sin(rad) > 0) || (state.x - r < -W / 2 && Math.sin(rad) < 0);
    const pastTopBottom = (state.y + r > H / 2 && Math.cos(rad) > 0) || (state.y - r < -H / 2 && Math.cos(rad) < 0);
    if (!pastSide && !pastTopBottom) return;
    if (pastSide) state.dir = (360 - state.dir + 360) % 360;
    if (pastTopBottom) state.dir = (180 - state.dir + 360) % 360;
    state.x = Math.max(-W / 2 + r, Math.min(W / 2 - r, state.x));
    state.y = Math.max(-H / 2 + r, Math.min(H / 2 - r, state.y));
    await publish();
  },
  // Point towards a sprite: 90 is right, 0 is up, as in Scratch.
  async pointTowards(name) {
    const at = await ask({ what: 'spritePos', name: String(name) });
    if (!at || (at.x === state.x && at.y === state.y)) return;
    const deg = (Math.atan2(at.x - state.x, at.y - state.y) * 180) / Math.PI;
    state.dir = (deg + 360) % 360;
    await publish();
  },
  // Position and direction reporters.
  xPosition() {
    return state.x;
  },
  yPosition() {
    return state.y;
  },
  direction() {
    return state.dir;
  },
  // Random number: whole numbers when both ends are whole, otherwise a decimal (both ends included for whole numbers).
  async pickRandom(from, to) {
    const a = Number(from);
    const b = Number(to);
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    if (Number.isInteger(a) && Number.isInteger(b)) return Math.floor(Math.random() * (high - low + 1)) + low;
    return low + Math.random() * (high - low);
  },
  // Timer: seconds since the green flag (or since timer reset). Stop does not reset it.
  timer() {
    return ask({ what: 'timer' });
  },
  async resetTimer() {
    post({ type: 'timer', op: 'reset' });
    await api.tick();
  },
  // Stop: 'this script' ends only the current script; 'all' asks the main thread to stop every sprite.
  stopThisScript() {
    throw STOP;
  },
  stopAll() {
    post({ type: 'stopAll' });
    throw STOP;
  },
  // Broadcast and wait: resumes once every running script that receives the message has finished.
  broadcastAndWait(name) {
    return ask({ what: 'broadcastWait', name: String(name) });
  },
  // Speech bubbles: say and think, until the next one or cleared. Text '' clears. "For N seconds" clears
  // only if no newer bubble has replaced it. The bubble is runtime state, not saved in the file.
  async say(text) {
    showBubble(text, 'say');
    await publish();
  },
  async sayFor(text, secs) {
    const seq = showBubble(text, 'say');
    await publish();
    await api.wait(secs);
    if (bubbleSeq === seq) {
      state.bubble = null;
      await publish();
    }
  },
  async think(text) {
    showBubble(text, 'think');
    await publish();
  },
  async thinkFor(text, secs) {
    const seq = showBubble(text, 'think');
    await publish();
    await api.wait(secs);
    if (bubbleSeq === seq) {
      state.bubble = null;
      await publish();
    }
  },
  // My Blocks (sprite-local). A define hat registers its body when the program starts; a call runs it.
  // Calling a block that was never defined does nothing.
  defineBlock(name, fn) {
    customBlocks.set(String(name), fn);
  },
  async callBlock(name) {
    const fn = customBlocks.get(String(name));
    if (fn) await fn();
  },
  async wait(seconds) {
    await new Promise((r) => setTimeout(r, seconds * 1000));
  },
};

function runHandlers() {
  for (const fn of handlers) {
    fn().catch((err) => {
      if (err !== STOP) post({ type: 'error', message: err.message });
    });
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
  if (msg.type === 'go') {
    // Sent once every sprite has registered its scripts, so no broadcast is missed at the start.
    runHandlers();
    return;
  }
  if (msg.type === 'event') {
    const hits = eventHandlers.filter((h) => h.kind === msg.kind && (h.kind === 'click' || (h.kind === 'key' ? h.key === 'any' || h.key === msg.key : h.name === msg.name)));
    // A broadcast-and-wait carries a token: reply once every hit script has finished (or stopped).
    Promise.all(hits.map((h) => h.fn().catch((err) => {
      if (err !== STOP) post({ type: 'error', message: err.message });
    }))).then(() => {
      if (msg.token !== undefined) post({ type: 'eventDone', token: msg.token });
    });
    return;
  }
  if (msg.type === 'moved') {
    // The stage moved this sprite by dragging it; keep the sprite's own state in step.
    state.x = msg.x;
    state.y = msg.y;
    return;
  }
  if (msg.type === 'run') {
    state = { ...msg.state, volume: 100, bubble: null };
    handlers = [];
    eventHandlers = [];
    customBlocks = new Map();
    try {
      // Shadow network globals so generated code can't use them, even though our generators never emit them.
      const program = new Function('sprite', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', msg.code);
      program(api, undefined, undefined, undefined, undefined);
    } catch (err) {
      post({ type: 'error', message: err.message });
      post({ type: 'ready' });
      return;
    }
    publish().then(() => post({ type: 'ready' }));
  }
};
