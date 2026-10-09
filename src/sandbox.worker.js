// Sandbox for generated Blocks code. Runs in a Web Worker: no DOM, no localStorage, no cookies.
// The only way to affect the stage is to post state to the main thread and wait for it to draw.
// Stop = terminate this worker, so even a runaway loop can be stopped.

let state = { x: 0, y: 0, dir: 90 };
let handlers = [];
const waiters = []; // FIFO: each posted state waits for one 'continue'

const W = 480;
const H = 360;

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
