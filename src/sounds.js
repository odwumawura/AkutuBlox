// Built-in sounds for Blocks mode. They are made with the Web Audio API, so no sound files are needed.
// Only the main thread plays sound (workers have no audio); sprites ask for it through the runtime.
export const SOUND_NAMES = ['Pop', 'Chime', 'Boing', 'Click'];

// Each sound schedules its notes at time t and returns how long it lasts, in seconds.
function sweep(ctx, out, type, f0, f1, t, dur, peak) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SYNTH = {
  Pop: (ctx, out, t) => { sweep(ctx, out, 'sine', 640, 160, t, 0.14, 0.8); return 0.14; },
  Chime: (ctx, out, t) => {
    sweep(ctx, out, 'sine', 880, 880, t, 0.6, 0.6);
    sweep(ctx, out, 'sine', 1320, 1320, t + 0.12, 0.5, 0.4);
    return 0.62;
  },
  Boing: (ctx, out, t) => {
    sweep(ctx, out, 'sawtooth', 220, 520, t, 0.12, 0.5);
    sweep(ctx, out, 'sawtooth', 520, 140, t + 0.12, 0.4, 0.5);
    return 0.55;
  },
  Click: (ctx, out, t) => { sweep(ctx, out, 'square', 1800, 900, t, 0.03, 0.3); return 0.03; },
};

export function createSoundPlayer() {
  let ctx = null;
  const playing = new Set(); // { out, finish } for sounds that have not ended
  const played = []; // { name, volume }, in the order they were started (checked by the tests)

  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Starts a sound. An unknown name does nothing. If wait is true, resolves when the sound has ended.
  function play(name, volume, wait) {
    if (!SYNTH[name]) return Promise.resolve();
    const c = audio();
    const out = c.createGain();
    out.gain.value = Math.max(0, Math.min(100, Number(volume) || 0)) / 100;
    played.push({ name, volume: out.gain.value * 100 });
    out.connect(c.destination);
    const dur = SYNTH[name](c, out, c.currentTime);
    let timer = null;
    const entry = { out, finish: null };
    const done = new Promise((resolve) => {
      entry.finish = () => {
        clearTimeout(timer);
        playing.delete(entry);
        resolve();
      };
      // The timer is the end of the sound, so a suspended audio context never leaves a sprite waiting forever.
      timer = setTimeout(entry.finish, dur * 1000 + 20);
    });
    playing.add(entry);
    return wait ? done : Promise.resolve();
  }

  // Stop all sounds: silences what is playing and lets any waiting "until done" continue.
  function stopAll() {
    for (const entry of [...playing]) {
      entry.out.disconnect();
      entry.finish();
    }
  }

  return { play, stopAll, log: () => [...played] };
}
