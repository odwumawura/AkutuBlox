// Stage for Blocks mode. Each sprite's generated code runs in its own sandboxed Web Worker.
// The workers only post state; this file draws the stage and relays messages.
import { backdropColor, costumeColor } from './sprites.js';

// Sets a sprite's costume by index, wrapping like Scratch. Keeps `costume` (the source) in step.
function atCostume(s, idx) {
  const n = s.costumes?.length || 0;
  const i = n ? ((Number(idx) || 0) % n + n) % n : 0;
  return { ...s, costumeIndex: i, costume: s.costumes?.[i]?.source ?? s.costume };
}

const W = 480;
const H = 360;

export function createStage(canvas, logEl) {
  const ctx = canvas.getContext('2d');
  // id -> { id, name, x, y, dir, costume }
  let sprites = new Map();
  // Backdrops are stage-wide. The first in the list is the starting one; green flag goes back to it.
  let backdrops = [{ name: 'Meadow', source: 'builtin:meadow' }];
  let backdropIndex = 0;
  let backdrop = 'builtin:meadow';
  let workers = new Map();
  let starts = new Map();
  let variables = new Map(); // name -> value, shared by all sprites
  const mouse = { x: 0, y: 0, down: false }; // stage coordinates, origin at centre, y up

  // A sprite is drawn as a circle of this radius at size 100 (see draw()); touching uses the same circle.
  const RADIUS = 18;
  const reach = (s) => (RADIUS * s.size) / 100;
  let drag = null; // { id, dx, dy } while a draggable sprite is held
  let press = null; // { id, x, y, moved }: a pointer down on a sprite, for click detection
  let pendingReady = null; // ids still registering their scripts in this green-flag run
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
  // The top-most visible sprite under the pointer.
  function spriteUnder(p) {
    return [...sprites.values()].reverse().find((s) => s.visible && Math.hypot(p.x - s.x, p.y - s.y) <= reach(s));
  }
  function moveDragged(p) {
    const s = sprites.get(drag.id);
    if (!s) return;
    const x = Math.max(-W / 2, Math.min(W / 2, p.x + drag.dx));
    const y = Math.max(-H / 2, Math.min(H / 2, p.y + drag.dy));
    sprites.set(drag.id, { ...s, x, y });
    workers.get(drag.id)?.postMessage({ type: 'moved', x, y });
    draw();
  }
  function endDrag() {
    if (!drag) return;
    const s = sprites.get(drag.id);
    // Where a sprite is dropped becomes its starting place, so saving keeps it there.
    if (s && starts.has(drag.id)) starts.set(drag.id, { ...starts.get(drag.id), x: s.x, y: s.y });
    drag = null;
  }
  canvas.addEventListener('pointermove', (e) => {
    const p = stagePoint(e);
    Object.assign(mouse, p);
    if (press && Math.hypot(p.x - press.x, p.y - press.y) > 3) press.moved = true;
    if (drag) moveDragged(p);
  });
  canvas.addEventListener('pointerdown', (e) => {
    const p = stagePoint(e);
    Object.assign(mouse, p, { down: true });
    const s = spriteUnder(p);
    press = s ? { id: s.id, x: p.x, y: p.y, moved: false } : null;
    if (s && s.draggable) {
      drag = { id: s.id, dx: s.x - p.x, dy: s.y - p.y };
      canvas.setPointerCapture(e.pointerId);
    }
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
    // "When this sprite clicked": a press and release on the sprite without dragging it.
    if (press && !press.moved) workers.get(press.id)?.postMessage({ type: 'event', kind: 'click' });
    press = null;
    endDrag();
  });

  // Key events go to every running sprite, except while someone is typing in a field.
  const KEY_NAMES = { ' ': 'space', ArrowUp: 'up arrow', ArrowDown: 'down arrow', ArrowLeft: 'left arrow', ArrowRight: 'right arrow' };
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.isComposing) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const key = KEY_NAMES[e.key] || (e.key.length === 1 ? e.key.toLowerCase() : null);
    if (!key) return;
    for (const w of workers.values()) w.postMessage({ type: 'event', kind: 'key', key });
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
      // Rotation style: all around turns with the direction; left-right only mirrors when facing left; don't rotate stays still.
      const style = s.rotationStyle || 'all around';
      if (style === 'all around') ctx.rotate(((s.dir - 90) * Math.PI) / 180);
      else if (style === 'left-right' && Math.sin((s.dir * Math.PI) / 180) < 0) ctx.scale(-1, 1);
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
        if (s) sprites.set(id, atCostume({ ...s, x: msg.state.x, y: msg.state.y, dir: msg.state.dir, visible: msg.state.visible, size: msg.state.size, rotationStyle: msg.state.rotationStyle, draggable: msg.state.draggable }, msg.state.costume));
        draw();
        w.postMessage({ type: 'continue' });
      } else if (msg.type === 'ask') {
        w.postMessage({ type: 'answer', id: msg.id, value: answerFor(msg, id) });
      } else if (msg.type === 'ready') {
        if (pendingReady) {
          pendingReady.delete(id);
          if (pendingReady.size === 0) {
            pendingReady = null;
            for (const w of workers.values()) w.postMessage({ type: 'go' });
          }
        }
      } else if (msg.type === 'broadcast') {
        for (const w of workers.values()) w.postMessage({ type: 'event', kind: 'message', name: msg.name });
      } else if (msg.type === 'backdrop') {
        if (msg.op === 'switch') switchBackdrop(msg.name);
        else nextBackdrop();
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
    pendingReady = null;
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
      if (s) sprites.set(id, atCostume({ ...s, x: start.x, y: start.y, dir: start.dir, visible: start.visible, size: start.size, rotationStyle: start.rotationStyle, draggable: start.draggable }, start.costumeIndex));
    }
    showBackdrop(0);
    log('— green flag');
    pendingReady = new Set(runs.filter(({ id }) => sprites.has(id)).map(({ id }) => id));
    for (const { id, code } of runs) {
      const s = sprites.get(id);
      if (!s) continue;
      const w = spawn(id);
      workers.set(id, w);
      w.postMessage({ type: 'run', code, state: { x: s.x, y: s.y, dir: s.dir, visible: s.visible, size: s.size, costume: s.costumeIndex, costumes: (s.costumes || []).map((c) => c.name), rotationStyle: s.rotationStyle, draggable: s.draggable } });
    }
  }

  // list: [{ id, name, x, y, dir, costume }]. Sets where sprites start and draw.
  function setSprites(list) {
    sprites = new Map(list.map((s) => [s.id, atCostume({ ...s }, s.costumeIndex)]));
    starts = new Map(list.map((s) => [s.id, { x: s.x, y: s.y, dir: s.dir, visible: s.visible, size: s.size, costumeIndex: atCostume(s, s.costumeIndex).costumeIndex, rotationStyle: s.rotationStyle || 'all around', draggable: !!s.draggable }]));
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

  function showBackdrop(i) {
    backdropIndex = i;
    backdrop = backdrops[i].source;
    draw();
  }

  // list: [{ name, source }]. Replaces the backdrops and goes back to the first one.
  function setBackdrops(list) {
    backdrops = list && list.length ? list.map((b) => ({ name: b.name, source: b.source })) : [{ name: 'Meadow', source: 'builtin:meadow' }];
    showBackdrop(0);
  }

  // Scratch-style: an unknown name does nothing.
  function switchBackdrop(name) {
    const i = backdrops.findIndex((b) => b.name === String(name));
    if (i >= 0) showBackdrop(i);
  }

  function nextBackdrop() {
    showBackdrop((backdropIndex + 1) % backdrops.length);
  }

  function getBackdrop() {
    return { index: backdropIndex, name: backdrops[backdropIndex].name, source: backdrop };
  }

  function getSprites() {
    return [...sprites.values()].map((s) => ({ ...s }));
  }

  draw();
  function getStarts() {
    return [...starts].map(([id, p]) => ({ id, ...p }));
  }

  return { greenFlag, stop, setSprites, setBackdrops, switchBackdrop, nextBackdrop, getBackdrop, getSprites, getStarts, setVariables, addVariable, getVariables };
}
