// All sounds are synthesized with Web Audio: no audio files to load.
let ctx = null;
let out = null;
let noise = null;
let enabled = true;
let lastTick = 0;

export function setEnabled(on) {
  enabled = Boolean(on);
}

export function isEnabled() {
  return enabled;
}

export function unlock() {
  if (!enabled) return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      out = ctx.createDynamicsCompressor();
      out.threshold.value = -14;
      out.ratio.value = 6;
      const master = ctx.createGain();
      master.gain.value = 0.8;
      out.connect(master).connect(ctx.destination);
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

const ready = () => enabled && ctx && ctx.state === "running";

function env(gain, t, peak, decay, attack = 0.002) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export function tick(speed = 600) {
  if (!ready()) return;
  const t = ctx.currentTime;
  if (t - lastTick < 0.024) return;
  lastTick = t;
  const level = Math.min(0.42, 0.12 + speed / 4200);

  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2600 + Math.random() * 900;
  band.Q.value = 2.2;
  const g = ctx.createGain();
  env(g, t, level, 0.035);
  src.connect(band).connect(g).connect(out);
  src.start(t, Math.random() * 0.2, 0.05);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(1150 + Math.random() * 160, t);
  body.frequency.exponentialRampToValueAtTime(420, t + 0.045);
  const g2 = ctx.createGain();
  env(g2, t, level * 0.55, 0.05);
  body.connect(g2).connect(out);
  body.start(t);
  body.stop(t + 0.08);
}

export function whoosh(strength = 1) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.75);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16 * strength, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + 0.85);
}

function bell(freq, t, level, length) {
  const partials = [
    [1, 1],
    [2.01, 0.42],
    [2.76, 0.3],
    [4.07, 0.16],
    [5.43, 0.08],
  ];
  for (const [ratio, amp] of partials) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * ratio;
    const g = ctx.createGain();
    env(g, t, level * amp, length / (1 + ratio * 0.35), 0.004);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + length + 0.1);
  }
}

export function win() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  const notes = [659.25, 783.99, 987.77, 1318.51];
  notes.forEach((f, i) => bell(f, t + i * 0.085, 0.2, i === notes.length - 1 ? 1.6 : 0.5));
  bell(1318.51 * 1.5, t + 0.42, 0.07, 1.2);

  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  src.connect(hp).connect(g).connect(out);
  src.start(t + 0.3);
  src.stop(t + 1.6);
}

export function thunk() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  const g = ctx.createGain();
  env(g, t, 0.3, 0.14);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.2);
}
