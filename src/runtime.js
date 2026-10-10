// Stage for Blocks mode. Each sprite's generated code runs in its own sandboxed Web Worker.
// The workers only post state; this file draws the stage and relays messages.
import { backdropColor, costumeColor } from './sprites.js';

const W = 480;
const H = 360;

export function createStage(canvas, logEl) {
  const ctx = canvas.getContext('2d');
  // id -> { id, name, x, y, dir, costume }
  let sprites = new Map();
  let backdrop = 'builtin:meadow';
  let workers = new Map();
  let starts = new Map();
  let variables = new Map(); // name -> value, shared by all sprites
  const mouse = { x: 0, y: 0, down: false }; // stage coordinates, origin at centre, y up

  // A sprite is drawn as a circle of this radius at size 100 (see draw()); touching uses the same circle.
  const RADIUS = 18;
  const reach = (s) => (RADIUS * s.size) / 100;
  function touchingEdge(s) {
    const r = reach(s);
    return s.x + r > W / 2 || s.x - r < -W / 2 || s.y + r > H / 2 || s.y - r < -H / 2;
  }
  function touchingSprite(a, b) {
    if (!a.visible || !b.visible) return false;
    return Math.hypot(a.x - b.x, a.y - b.y) < reach(a) + reach(b);
  }

  function answerFor(msg, id) {
    switch (msg.what) {
      case 'var': return variables.get(msg.name) ?? 0;
      case 'mouseX': return mouse.x;
      case 'mouseY': return mouse.y;
      case 'mouseDown': return mouse.down;
      case 'touchingEdge': {
        const me = sprites.get(id);
        return !!me && me.visible && touchingEdge(me);
      }
      case 'touching': {
        const me = sprites.get(id);
        const other = [...sprites.values()].find((o) => o.name === msg.name && o.id !== id);
        return !!me && !!other && touchingSprite(me, other);
      }
      default: return undefined;
    }
  }

  // Stage pixels -> stage coordinates. The canvas may be scaled by CSS, so measure it.
  function stagePoint(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) * W) / r.width - W / 2;
    const y = H / 2 - ((e.clientY - r.top) * H) / r.height;
    return { x: Math.max(-W / 2, Math.min(W / 2, x)), y: Math.max(-H / 2, Math.min(H / 2, y)) };
  }
  canvas.addEventListener('pointermove', (e) => Object.assign(mouse, stagePoint(e)));
  canvas.addEventListener('pointerdown', (e) => {
    Object.assign(mouse, stagePoint(e), { down: true });
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  const log = (msg) => {
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = backdropColor(backdrop);
    ctx.fillRect(0, 0, W, H);
    for (const s of sprites.values()) {
      if (!s.visible) continue;
      // Logical coordinates (origin at centre, y up) -> canvas pixels.
      ctx.save();
      ctx.translate(W / 2 + s.x, H / 2 - s.y);
      ctx.rotate(((s.dir - 90) * Math.PI) / 180);
      ctx.scale(s.size / 100, s.size / 100);
      ctx.fillStyle = costumeColor(s.costume);
      ctx.strokeStyle = backdrop === 'builtin:night' ? '#ffffff' : '#1f2937';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, 8);
      ctx.lineTo(-6, -8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function spawn(id) {
    const w = new Worker(new URL('./sandbox.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'state') {
        const s = sprites.get(id);
        if (s) sprites.set(id, { ...s, x: msg.state.x, y: msg.state.y, dir: msg.state.dir, visible: msg.state.visible, size: msg.state.size });
        draw();
        w.postMessage({ type: 'continue' });
      } else if (msg.type === 'ask') {
        w.postMessage({ type: 'answer', id: msg.id, value: answerFor(msg, id) });
      } else if (msg.type === 'setVar') {
        variables.set(msg.name, msg.value);
      } else if (msg.type === 'error') {
        log(`error (${sprites.get(id)?.name || id}): ${msg.message}`);
      }
    };
    w.onerror = (event) => log('error: ' + (event.message || 'sandbox failed'));
    return w;
  }

  function stop() {
    if (workers.size) {
      for (const w of workers.values()) w.terminate();
      workers = new Map();
      log('— stopped');
    }
  }

  // runs: [{ id, code }]. Every sprite goes back to its starting place before the run.
  function greenFlag(runs) {
    stop();
    for (const [id, start] of starts) {
      const s = sprites.get(id);
      if (s) sprites.set(id, { ...s, x: start.x, y: start.y, dir: start.dir, visible: start.visible, size: start.size });
    }
    draw();
    log('— green flag');
    for (const { id, code } of runs) {
      const s = sprites.get(id);
      if (!s) continue;
      const w = spawn(id);
      workers.set(id, w);
      w.postMessage({ type: 'run', code, state: { x: s.x, y: s.y, dir: s.dir, visible: s.visible, size: s.size } });
    }
  }

  // list: [{ id, name, x, y, dir, costume }]. Sets where sprites start and draw.
  function setSprites(list) {
    sprites = new Map(list.map((s) => [s.id, { ...s }]));
    starts = new Map(list.map((s) => [s.id, { x: s.x, y: s.y, dir: s.dir, visible: s.visible, size: s.size }]));
    draw();
  }

  // list: [{ name, value }]. Variables keep their values across green-flag runs.
  function setVariables(list) {
    variables = new Map((list || []).map((v) => [v.name, v.value]));
  }

  function addVariable(name) {
    if (!variables.has(name)) variables.set(name, 0);
  }

  function getVariables() {
    return [...variables].map(([name, value]) => ({ name, value }));
  }

  function setBackdrop(source) {
    backdrop = source;
    draw();
  }

  function getSprites() {
    return [...sprites.values()].map((s) => ({ ...s }));
  }

  draw();
  function getStarts() {
    return [...starts].map(([id, p]) => ({ id, ...p }));
  }

  return { greenFlag, stop, setSprites, setBackdrop, getSprites, getStarts, setVariables, addVariable, getVariables };
}
