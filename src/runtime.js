// Stage for Blocks mode. Generated code runs in a sandboxed Web Worker; this file only draws and relays messages.
const W = 480;
const H = 360;
const START = { x: 0, y: 0, dir: 90 };

export function createStage(canvas, logEl) {
  const ctx = canvas.getContext('2d');
  let sprite = { ...START };
  let worker = null;

  const log = (msg) => {
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e8f5e9';
    ctx.fillRect(0, 0, W, H);
    // Logical coordinates (origin at centre, y up) -> canvas pixels.
    ctx.save();
    ctx.translate(W / 2 + sprite.x, H / 2 - sprite.y);
    ctx.rotate(((sprite.dir - 90) * Math.PI) / 180);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, 8);
    ctx.lineTo(-6, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function spawn() {
    const w = new Worker(new URL('./sandbox.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'state') {
        sprite = msg.state;
        draw();
        w.postMessage({ type: 'continue' });
      } else if (msg.type === 'error') {
        log('error: ' + msg.message);
      }
    };
    w.onerror = (event) => log('error: ' + (event.message || 'sandbox failed'));
    return w;
  }

  function stop() {
    if (worker) {
      worker.terminate();
      worker = null;
      log('— stopped');
    }
  }

  function greenFlag(code) {
    stop();
    sprite = { ...START };
    draw();
    log('— green flag');
    worker = spawn();
    worker.postMessage({ type: 'run', code, state: sprite });
  }

  function setSprite(s) {
    sprite = { x: s.x, y: s.y, dir: s.dir };
    draw();
  }

  function getSprite() {
    return { ...sprite };
  }

  draw();
  return { greenFlag, stop, setSprite, getSprite };
}
