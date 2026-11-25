"use client";

/**
 * Synthesized jumpscare scream (no audio files): detuned sawtooth "voices" with a wild
 * vibrato plus filtered noise, very loud attack. Must be started from a tap (autoplay rules).
 */
export function playScream(durationSec = 1.6) {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return () => {};
  }
  void ctx.resume().catch(() => {});
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
  master.gain.setValueAtTime(0.9, t + durationSec - 0.35);
  master.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 3.2);
  }
  shaper.curve = curve;
  shaper.connect(master).connect(ctx.destination);

  [520, 760, 1180, 1630].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 ? "sawtooth" : "square";
    o.frequency.setValueAtTime(f * 0.7, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.25);
    o.frequency.exponentialRampToValueAtTime(f * 0.85, t + durationSec);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 9 + i * 3.1;
    lfoGain.gain.value = f * 0.09;
    lfo.connect(lfoGain).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.16;
    o.connect(g).connect(shaper);
    o.start(t);
    lfo.start(t);
    o.stop(t + durationSec);
    lfo.stop(t + durationSec);
  });

  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durationSec), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1800, t);
  bp.frequency.exponentialRampToValueAtTime(3400, t + durationSec);
  bp.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.value = 0.35;
  src.connect(bp).connect(ng).connect(shaper);
  src.start(t);

  if ("vibrate" in navigator) navigator.vibrate?.([400, 80, 400, 80, 600]);
  const close = window.setTimeout(() => void ctx.close().catch(() => {}), durationSec * 1000 + 300);
  return () => {
    window.clearTimeout(close);
    void ctx.close().catch(() => {});
  };
}
