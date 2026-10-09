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

  return { greenFlag, stop, setSprites, setBackdrop, getSprites, getStarts };
}
