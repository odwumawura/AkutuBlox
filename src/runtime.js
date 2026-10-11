// Stage for Blocks mode. Each sprite's generated code runs in its own sandboxed Web Worker.
// The workers only post state; this file draws the stage and relays messages.
import { backdropColor, costumeColor } from './sprites.js';
import { createSoundPlayer } from './sounds.js';

// Sets a sprite's costume by index, wrapping like Scratch. Keeps `costume` (the source) in step.
function atCostume(s, idx) {
  const n = s.costumes?.length || 0;
  const i = n ? ((Number(idx) || 0) % n + n) % n : 0;
  return { ...s, costumeIndex: i, costume: s.costumes?.[i]?.source ?? s.costume };
}

const W = 480;
const H = 360;

const NO_EFFECTS = { color: 0, ghost: 0, brightness: 0 };

// Canvas filter for the colour and brightness effects. Colour shifts the hue (200 is a full turn);
// brightness scales the light (0 is black, 100 doubles it). Browsers without canvas filters (Safari) show no colour change.
function effectFilter(fx) {
  const parts = [];
  if (fx.color) parts.push(`hue-rotate(${(fx.color * 360) / 200}deg)`);
  if (fx.brightness) parts.push(`brightness(${Math.max(0, 1 + fx.brightness / 100)})`);
  return parts.length ? parts.join(' ') : 'none';
}

export function createStage(canvas, logEl) {
  const ctx = canvas.getContext('2d');
  // id -> { id, name, x, y, dir, costume }
  let sprites = new Map();
  // Backdrops are stage-wide. The first in the list is the starting one; green flag goes back to it.
  let backdrops = [{ name: 'Meadow', source: 'builtin:meadow' }];
  let backdropIndex = 0;
  let backdrop = 'builtin:meadow';
  let workers = new Map();
  const images = new Map(); // asset path -> Image, for uploaded costumes and backdrops
  let lists = new Map(); // name -> array of values, shared by all sprites
  let programs = []; // [{ id, code }] for every sprite; runs idle (events only) when the project is not running
  let running = false;
  let waits = new Map(); // broadcast-and-wait tokens -> { left, resolve }
  let waitSeq = 0;
  let timerStart = performance.now(); // the timer counts from the green flag, or from the last reset
  const sound = createSoundPlayer();
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
      case 'list': return listOp(msg);
      case 'mouseX': return mouse.x;
      case 'mouseY': return mouse.y;
      case 'mouseDown': return mouse.down;
      case 'timer': return (performance.now() - timerStart) / 1000;
      case 'spritePos': {
        const other = [...sprites.values()].find((o) => o.name === msg.name);
        return other ? { x: other.x, y: other.y } : null;
      }
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
    const bg = images.get(backdrop);
    if (bg && bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, W, H);
    for (const s of sprites.values()) {
      if (!s.visible) continue;
      const fx = s.effects || NO_EFFECTS;
      // Logical coordinates (origin at centre, y up) -> canvas pixels.
      ctx.save();
      ctx.translate(W / 2 + s.x, H / 2 - s.y);
      ctx.globalAlpha = 1 - fx.ghost / 100;
      ctx.filter = effectFilter(fx);
      // Rotation style: all around turns with the direction; left-right only mirrors when facing left; don't rotate stays still.
      const style = s.rotationStyle || 'all around';
      if (style === 'all around') ctx.rotate(((s.dir - 90) * Math.PI) / 180);
      else if (style === 'left-right' && Math.sin((s.dir * Math.PI) / 180) < 0) ctx.scale(-1, 1);
      ctx.scale(s.size / 100, s.size / 100);
      const img = images.get(s.costume);
      if (img && img.complete && img.naturalWidth) {
        // An uploaded costume is drawn at its own size, scaled down to fit about 120 units, centred on the sprite.
        const k = Math.min(1, 120 / Math.max(img.naturalWidth, img.naturalHeight));
        ctx.drawImage(img, (-img.naturalWidth * k) / 2, (-img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
        ctx.restore();
        continue;
      }
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
    for (const s of sprites.values()) if (s.visible && s.bubble) drawBubble(s);
  }

  function spawn(id) {
    const w = new Worker(new URL('./sandbox.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'state') {
        const s = sprites.get(id);
        if (s) sprites.set(id, atCostume({ ...s, x: msg.state.x, y: msg.state.y, dir: msg.state.dir, visible: msg.state.visible, size: msg.state.size, rotationStyle: msg.state.rotationStyle, draggable: msg.state.draggable, bubble: msg.state.bubble ?? null, effects: msg.state.effects ?? s.effects }, msg.state.costume));
        draw();
        w.postMessage({ type: 'continue' });
      } else if (msg.type === 'ask' && msg.what === 'sound') {
        // Sounds that wait for the end are answered when they finish.
        sound.play(msg.name, msg.volume, msg.wait).then(() => w.postMessage({ type: 'answer', id: msg.id, value: null }));
      } else if (msg.type === 'sound') {
        sound.stopAll();
      } else if (msg.type === 'ask' && msg.what === 'broadcastWait') {
        deliverWait(msg.name).then(() => w.postMessage({ type: 'answer', id: msg.id, value: null }));
      } else if (msg.type === 'eventDone') {
        const wt = waits.get(msg.token);
        if (wt && --wt.left === 0) {
          waits.delete(msg.token);
          wt.resolve();
        }
      } else if (msg.type === 'stopAll') {
        stop();
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
      } else if (msg.type === 'timer') {
        timerStart = performance.now();
      } else if (msg.type === 'setVar') {
        variables.set(msg.name, msg.value);
      } else if (msg.type === 'error') {
        log(`error (${sprites.get(id)?.name || id}): ${msg.message}`);
      }
    };
    w.onerror = (event) => log('error: ' + (event.message || 'sandbox failed'));
    return w;
  }

  // Ends every script and clears what they left on the stage. Waiting broadcasts are released.
  function stopWorkers() {
    pendingReady = null;
    sound.stopAll();
    for (const [id, s] of sprites) if (s.bubble) sprites.set(id, { ...s, bubble: null });
    for (const w of workers.values()) w.terminate();
    workers = new Map();
    for (const wt of waits.values()) wt.resolve();
    waits = new Map();
    draw();
  }

  // Each sprite's program starts from where the sprite is now, but only its event hats are live.
  function spawnFor(run) {
    const s = sprites.get(run.id);
    if (!s) return null;
    const w = spawn(run.id);
    workers.set(run.id, w);
    w.postMessage({ type: 'run', code: run.code, state: runState(s) });
    return w;
  }

  function runState(s) {
    return { x: s.x, y: s.y, dir: s.dir, visible: s.visible, size: s.size, costume: s.costumeIndex, costumes: (s.costumes || []).map((c) => c.name), rotationStyle: s.rotationStyle, draggable: s.draggable };
  }

  // Not running: each sprite's event scripts still listen (key, click, message), as in Scratch.
  function startIdle() {
    for (const run of programs) spawnFor(run);
  }

  // Scripts changed in the editor: rebuild the idle listeners (a running project is left alone).
  function setPrograms(runs) {
    programs = runs;
    if (!running) {
      stopWorkers();
      startIdle();
    }
  }

  function stop() {
    const wasRunning = running || workers.size > 0;
    running = false;
    stopWorkers();
    startIdle();
    if (wasRunning) log('— stopped');
  }

  function deliverWait(name) {
    return new Promise((resolve) => {
      if (workers.size === 0) return resolve();
      const token = ++waitSeq;
      waits.set(token, { left: workers.size, resolve });
      for (const w of workers.values()) w.postMessage({ type: 'event', kind: 'message', name, token });
    });
  }

  // runs: [{ id, code }]. Every sprite goes back to its starting place before the run.
  function greenFlag(runs) {
    stopWorkers();
    running = true;
    programs = runs;
    for (const [id, start] of starts) {
      const s = sprites.get(id);
      if (s) sprites.set(id, atCostume({ ...s, x: start.x, y: start.y, dir: start.dir, visible: start.visible, size: start.size, rotationStyle: start.rotationStyle, draggable: start.draggable, bubble: null, effects: { ...NO_EFFECTS } }, start.costumeIndex));
    }
    showBackdrop(0);
    timerStart = performance.now();
    log('— green flag');
    pendingReady = new Set(runs.filter(({ id }) => sprites.has(id)).map(({ id }) => id));
    for (const { id, code } of runs) {
      const s = sprites.get(id);
      if (!s) continue;
      const w = spawn(id);
      workers.set(id, w);
      w.postMessage({ type: 'run', code, state: { x: s.x, y: s.y, dir: s.dir, visible: s.visible, size: s.size, costume: s.costumeIndex, costumes: (s.costumes || []).map((c) => c.name), rotationStyle: s.rotationStyle, draggable: s.draggable, effects: s.effects || NO_EFFECTS } });
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

  // Lists: a missing list answers as empty. Index counts from 1; 'last' is the final item, 'all' empties a list.
  function listOp(msg) {
    const items = lists.get(msg.name);
    if (!items) return msg.op === 'length' ? 0 : msg.op === 'contains' ? false : msg.op === 'item' ? '' : null;
    const n = items.length;
    const at = (v) => (String(v).toLowerCase() === 'last' ? n : Math.round(Number(v)));
    switch (msg.op) {
      case 'add': items.push(msg.value); return null;
      case 'delete': {
        if (String(msg.index).toLowerCase() === 'all') items.length = 0;
        else {
          const i = at(msg.index);
          if (i >= 1 && i <= n) items.splice(i - 1, 1);
        }
        return null;
      }
      case 'insert': {
        const i = at(msg.index);
        if (i >= 1 && i <= n + 1) items.splice(i - 1, 0, msg.value);
        return null;
      }
      case 'replace': {
        const i = at(msg.index);
        if (i >= 1 && i <= n) items[i - 1] = msg.value;
        return null;
      }
      case 'item': {
        const i = at(msg.index);
        return i >= 1 && i <= n ? items[i - 1] : '';
      }
      case 'length': return n;
      case 'contains': return items.some((v) => String(v).toLowerCase() === String(msg.value).toLowerCase());
      default: return null;
    }
  }
  // list: [{ name, items }] from the saved project.
  function setLists(list) {
    lists = new Map((list || []).map((l) => [l.name, [...(l.items || [])]]));
  }
  function addList(name) {
    if (!lists.has(name)) lists.set(name, []);
  }
  function getLists() {
    return [...lists].map(([name, items]) => ({ name, items: [...items] }));
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

  // A speech bubble above the sprite: say is a rounded box with a pointer; think is a box with a thought trail.
  function drawBubble(s) {
    const cx = W / 2 + s.x;
    const bottom = H / 2 - s.y - (RADIUS * s.size) / 100 - 8;
    ctx.save();
    ctx.font = '14px sans-serif';
    let text = s.bubble.text;
    while (ctx.measureText(text).width > 180 && text.length > 1) text = text.slice(0, -2) + '…';
    const w = Math.max(40, ctx.measureText(text).width + 16);
    const h = 26;
    const x = cx - w / 2;
    const y = bottom - h - (s.bubble.kind === 'think' ? 14 : 8);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 8, y);
    ctx.arcTo(x + w, y, x + w, y + h, 8);
    ctx.arcTo(x + w, y + h, x, y + h, 8);
    ctx.arcTo(x, y + h, x, y, 8);
    ctx.arcTo(x, y, x + w, y, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (s.bubble.kind === 'think') {
      for (const [dx, dy, r] of [[-6, 8, 3], [-10, 2, 2]]) {
        ctx.beginPath();
        ctx.arc(cx + dx, y + h + dy + 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - 5, y + h);
      ctx.lineTo(cx, y + h + 8);
      ctx.lineTo(cx + 5, y + h);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#1f2937';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 8, y + h / 2);
    ctx.restore();
  }

  // urls: Map from asset path to an object URL. Each image loads once; the stage redraws when it is ready.
  function setAssets(urls) {
    for (const [src, url] of urls) {
      if (images.has(src)) continue;
      const img = new Image();
      img.onload = () => draw();
      img.src = url;
      images.set(src, img);
    }
    draw();
  }

  function getSprites() {
    return [...sprites.values()].map((s) => ({ ...s }));
  }

  draw();
  function getStarts() {
    return [...starts].map(([id, p]) => ({ id, ...p }));
  }

  return { greenFlag, stop, setPrograms, setAssets, getSoundLog: () => sound.log(), setSprites, setBackdrops, switchBackdrop, nextBackdrop, getBackdrop, getSprites, getStarts, setVariables, addVariable, setLists, addList, getLists, getVariables };
}
