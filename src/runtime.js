// Minimal sprite runtime for the spike. Runs generated code with only the sprite API in scope.
const W = 480;
const H = 360;

export function createStage(canvas, logEl) {
  const ctx = canvas.getContext('2d');
  const sprite = { x: 0, y: 0, dir: 90, running: 0 };
  let token = 0;
  let handlers = [];

  const log = (msg) => {
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e8f5e9';
    ctx.fillRect(0, 0, W, H);
    // Convert logical coordinates (origin at centre, y up) to canvas pixels.
    const px = W / 2 + sprite.x;
    const py = H / 2 - sprite.y;
    ctx.save();
    ctx.translate(px, py);
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

  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const check = (t) => {
    if (t !== token) throw new Error('stopped');
  };

  // The API generated code can call. Nothing else is in scope.
  const api = (t) => ({
    onFlag(fn) {
      handlers.push(fn);
    },
    async move(steps) {
      check(t);
      const rad = (sprite.dir * Math.PI) / 180;
      sprite.x += steps * Math.sin(rad);
      sprite.y += steps * Math.cos(rad);
      sprite.x = Math.max(-W / 2, Math.min(W / 2, sprite.x));
      sprite.y = Math.max(-H / 2, Math.min(H / 2, sprite.y));
      draw();
      await frame();
      check(t);
    },
    async turn(deg) {
      check(t);
      sprite.dir = (sprite.dir + deg) % 360;
      draw();
      await frame();
      check(t);
    },
    async wait(seconds) {
      check(t);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      check(t);
    },
  });

  function stop() {
    token++;
    handlers = [];
    log('— stopped');
  }

  function greenFlag(code) {
    stop();
    const t = ++token;
    handlers = [];
    sprite.x = 0;
    sprite.y = 0;
    sprite.dir = 90;
    draw();
    log('— green flag');
    try {
      // Generated code only contains sprite.* calls built from our block generators.
      const program = new Function('sprite', code);
      program(api(t));
    } catch (err) {
      log('error: ' + err.message);
      return;
    }
    handlers.forEach((fn) =>
      fn().catch((err) => {
        if (err.message !== 'stopped') log('error: ' + err.message);
      }),
    );
  }

  draw();
  return { greenFlag, stop, state: sprite };
}
