// Every sound is synthesized with the Web Audio API at play time: filtered
// noise for shots and impacts, swept oscillators for creatures and machines.

let ctx = null;
let master = null;
let noiseBuffer = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function out(gain, pan) {
  const g = ctx.createGain();
  g.gain.value = gain;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(master);
  } else {
    g.connect(master);
  }
  return g;
}

function noise(dest, { dur, from = 2000, to = 300, type = 'lowpass', q = 0.7, vol = 1, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(dest, { dur, from, to = from, type = 'sine', vol = 1, delay = 0, vibrato = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibrato;
    depth.gain.value = from * 0.08;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const VOICE = { warden: 1, stalker: 1.4, hurler: 0.6 };

const SOUNDS = {
  pistol: (d) => {
    noise(d, { dur: 0.16, from: 3000, to: 400, vol: 0.9 });
    tone(d, { dur: 0.1, from: 160, to: 60, vol: 0.8 });
  },
  scatter: (d) => {
    noise(d, { dur: 0.45, from: 2200, to: 150, vol: 1.2 });
    tone(d, { dur: 0.2, from: 110, to: 40, vol: 1 });
    noise(d, { dur: 0.08, from: 1800, to: 900, type: 'bandpass', vol: 0.4, delay: 0.5 });
    noise(d, { dur: 0.08, from: 1400, to: 700, type: 'bandpass', vol: 0.4, delay: 0.62 });
  },
  rivet: (d) => {
    noise(d, { dur: 0.09, from: 3500, to: 600, vol: 0.8 });
    tone(d, { dur: 0.06, from: 220, to: 90, type: 'square', vol: 0.25 });
  },
  enemyShot: (d) => noise(d, { dur: 0.18, from: 2500, to: 350, vol: 0.8 }),
  fireball: (d) => noise(d, { dur: 0.4, from: 300, to: 1800, type: 'bandpass', q: 2, vol: 0.9 }),
  explode: (d) => {
    noise(d, { dur: 0.5, from: 1200, to: 80, vol: 1 });
    tone(d, { dur: 0.3, from: 90, to: 35, vol: 0.6 });
  },
  sight: (d, kind) => tone(d, { dur: 0.5, from: 140 * VOICE[kind], to: 90 * VOICE[kind], type: 'sawtooth', vol: 0.35, vibrato: 18 }),
  pain: (d, kind) => tone(d, { dur: 0.22, from: 260 * VOICE[kind], to: 120 * VOICE[kind], type: 'square', vol: 0.3 }),
  death: (d, kind) => {
    tone(d, { dur: 0.7, from: 200 * VOICE[kind], to: 50, type: 'sawtooth', vol: 0.4, vibrato: 9 });
    noise(d, { dur: 0.5, from: 900, to: 100, vol: 0.4 });
  },
  melee: (d) => noise(d, { dur: 0.14, from: 700, to: 120, vol: 1 }),
  playerPain: (d) => tone(d, { dur: 0.25, from: 220, to: 110, type: 'sawtooth', vol: 0.35 }),
  playerDeath: (d) => tone(d, { dur: 1.1, from: 240, to: 45, type: 'sawtooth', vol: 0.45, vibrato: 6 }),
  door: (d) => {
    tone(d, { dur: 0.9, from: 55, to: 70, type: 'sawtooth', vol: 0.25 });
    noise(d, { dur: 0.9, from: 400, to: 250, type: 'bandpass', vol: 0.35 });
  },
  lift: (d) => {
    tone(d, { dur: 1.2, from: 80, to: 95, type: 'square', vol: 0.12 });
    noise(d, { dur: 1.2, from: 300, to: 300, type: 'bandpass', q: 3, vol: 0.3 });
  },
  switch: (d) => {
    tone(d, { dur: 0.05, from: 900, type: 'square', vol: 0.3 });
    tone(d, { dur: 0.08, from: 500, type: 'square', vol: 0.3, delay: 0.06 });
  },
  pickup: (d) => tone(d, { dur: 0.1, from: 660, to: 990, type: 'triangle', vol: 0.4 }),
  weapon: (d) => {
    tone(d, { dur: 0.08, from: 440, type: 'square', vol: 0.25 });
    tone(d, { dur: 0.08, from: 660, type: 'square', vol: 0.25, delay: 0.08 });
    tone(d, { dur: 0.14, from: 880, type: 'square', vol: 0.25, delay: 0.16 });
  },
  denied: (d) => tone(d, { dur: 0.25, from: 120, to: 110, type: 'square', vol: 0.3 }),
  click: (d) => tone(d, { dur: 0.03, from: 1200, type: 'square', vol: 0.15 }),
  rocket: (d) => {
    noise(d, { dur: 0.5, from: 600, to: 2400, type: 'bandpass', q: 1.5, vol: 0.9 });
    tone(d, { dur: 0.25, from: 120, to: 60, vol: 0.6 });
  },
  bounce: (d) => tone(d, { dur: 0.06, from: 420, to: 300, type: 'triangle', vol: 0.4 }),
  jump: (d) => tone(d, { dur: 0.12, from: 180, to: 240, type: 'triangle', vol: 0.15 }),
  land: (d) => noise(d, { dur: 0.08, from: 500, to: 120, vol: 0.4 }),
  exit: (d) => {
    for (let i = 0; i < 5; i++) tone(d, { dur: 0.3, from: 300 * 1.25 ** i, type: 'sine', vol: 0.25, delay: i * 0.09 });
  },
};

// `from` is an optional source point; volume falls with distance and the
// sound pans toward the side it came from.
export function play(name, from, listener, extra) {
  if (!ctx || ctx.state !== 'running') return;
  let gain = 1;
  let pan = 0;
  if (from && listener) {
    const dx = from.x - listener.x;
    const dz = from.z - listener.z;
    const d = Math.hypot(dx, dz);
    if (d > 60) return;
    gain = 1 / (1 + d / 7);
    const rel = Math.atan2(dz, dx) - listener.angle;
    pan = Math.max(-0.8, Math.min(0.8, Math.sin(rel)));
  }
  SOUNDS[name]?.(out(gain, pan), extra);
}
