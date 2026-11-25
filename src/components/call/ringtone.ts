"use client";

/** Soft synthesized ring tones (no audio files). Browsers may keep them silent until the first tap. */
export type Ringer = { stop: () => void };

export function createRinger(kind: "incoming" | "outgoing"): Ringer {
  let ctx: AudioContext | null = null;
  let timer: number | undefined;
  let stopped = false;
  try {
    ctx = new AudioContext();
  } catch {
    return { stop: () => {} };
  }
  void ctx.resume().catch(() => {});

  const tone = (freq: number, at: number, dur: number, vol: number) => {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.02);
    g.gain.setValueAtTime(vol, at + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + dur);
  };

  const ring = () => {
    if (stopped || !ctx) return;
    const t = ctx.currentTime + 0.05;
    if (kind === "incoming") {
      // little two-note melody, repeated
      [659.25, 830.61, 987.77, 830.61].forEach((f, i) => tone(f, t + i * 0.16, 0.15, 0.18));
      [659.25, 830.61, 987.77, 830.61].forEach((f, i) => tone(f, t + 0.8 + i * 0.16, 0.15, 0.18));
      if ("vibrate" in navigator) navigator.vibrate?.([300, 150, 300]);
    } else {
      tone(440, t, 0.9, 0.06);
      tone(480, t, 0.9, 0.06);
    }
  };
  ring();
  timer = window.setInterval(ring, kind === "incoming" ? 2600 : 3500);

  return {
    stop: () => {
      stopped = true;
      window.clearInterval(timer);
      timer = undefined;
      if ("vibrate" in navigator) navigator.vibrate?.(0);
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
