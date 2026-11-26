"use client";

import * as React from "react";
import { Pause, Play } from "lucide-react";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";

export function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

export type VoiceResult = { blob: Blob; duration: number; waveform: number[] };

const noopSubscribe = () => () => {};

/** Records a voice message with a live level meter and waveform. */
export function useVoiceRecorder() {
  const [state, setState] = React.useState<"idle" | "recording">("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [level, setLevel] = React.useState(0);
  const rec = React.useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    started: number;
    peaks: number[];
    raf: number;
    timer: number;
    ctx: AudioContext;
    resolve?: (r: VoiceResult | null) => void;
    cancelled?: boolean;
  } | null>(null);

  // Same value on the server and during hydration, the real one after.
  const supported = React.useSyncExternalStore(
    noopSubscribe,
    () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined",
    () => true,
  );

  const cleanup = () => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close();
    rec.current = null;
    setState("idle");
    setElapsed(0);
    setLevel(0);
  };

  const start = async () => {
    const mime = pickMime();
    if (mime === null) throw new Error("Sprachnachrichten werden von diesem Browser nicht unterstützt.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    // eslint-disable-next-line react-hooks/purity -- runs in an event handler, not during render
    const r: NonNullable<typeof rec.current> = { recorder, stream, chunks: [], started: Date.now(), peaks: [], raf: 0, timer: 0, ctx };
    rec.current = r;
    let lastPeak = 0;
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
      setLevel(peak);
      if (Date.now() - lastPeak > 100) {
        r.peaks.push(peak);
        lastPeak = Date.now();
      }
      r.raf = requestAnimationFrame(loop);
    };
    loop();
    r.timer = window.setInterval(() => {
      const secs = (Date.now() - r.started) / 1000;
      setElapsed(secs);
      if (secs >= 300) stop();
    }, 200);
    recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
    recorder.onstop = () => {
      const duration = (Date.now() - r.started) / 1000;
      const type = (recorder.mimeType || mime || "audio/webm").split(";")[0];
      const blob = new Blob(r.chunks, { type });
      const bars = 40;
      const step = Math.max(1, r.peaks.length / bars);
      const waveform = Array.from({ length: bars }, (_, i) => {
        const slice = r.peaks.slice(Math.floor(i * step), Math.floor((i + 1) * step));
        return Math.round(Math.min(1, (slice.length ? Math.max(...slice) : 0) * 1.6) * 100) / 100;
      });
      const resolve = r.resolve;
      const cancelled = r.cancelled;
      cleanup();
      resolve?.(cancelled || duration < 0.6 ? null : { blob, duration, waveform });
    };
    recorder.start(250);
    setState("recording");
  };

  const stop = () =>
    new Promise<VoiceResult | null>((resolve) => {
      const r = rec.current;
      if (!r) return resolve(null);
      r.resolve = resolve;
      if (r.recorder.state !== "inactive") r.recorder.stop();
    });

  const cancel = () => {
    const r = rec.current;
    if (!r) return;
    r.cancelled = true;
    if (r.recorder.state !== "inactive") r.recorder.stop();
    else cleanup();
  };

  React.useEffect(() => () => cancel(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { supported, state, elapsed, level, start, stop, cancel };
}

export function VoicePlayer({ path, duration, waveform, mine }: { path: string; duration?: number; waveform?: number[]; mine?: boolean }) {
  const url = useSignedUrl(path);
  const audio = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [time, setTime] = React.useState(0);
  const bars = waveform?.length ? waveform : Array.from({ length: 40 }, (_, i) => 0.25 + 0.35 * Math.abs(Math.sin(i * 1.7)));
  const total = duration ?? 0;

  const toggle = async () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      document.querySelectorAll("audio").forEach((el) => el !== a && el.pause());
      await a.play().catch(() => {});
    } else a.pause();
  };

  return (
    <div className="flex w-[15rem] max-w-full items-center gap-3 py-1 sm:w-[17rem]">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        className={cn("grid size-10 shrink-0 place-items-center rounded-full transition-transform active:scale-90", mine ? "bg-white/20 text-current" : "bg-primary text-primary-foreground")}
        aria-label={playing ? "Pause" : "Abspielen"}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className="flex h-8 cursor-pointer items-center gap-[2px]"
          role="slider"
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onClick={(e) => {
            const a = audio.current;
            if (!a || !a.duration || !Number.isFinite(a.duration)) return;
            const rect = e.currentTarget.getBoundingClientRect();
            a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
          }}
        >
          {bars.map((b, i) => (
            <span
              key={i}
              className={cn("w-[3px] flex-1 rounded-full transition-colors", i / bars.length < progress ? (mine ? "bg-current" : "bg-primary") : mine ? "bg-current/35" : "bg-foreground/20")}
              style={{ height: `${Math.max(12, b * 100)}%` }}
            />
          ))}
        </div>
        <p className={cn("text-[11px] tabular-nums", mine ? "opacity-75" : "text-muted-foreground")}>{formatDuration(playing || time ? time : total)}</p>
      </div>
      {url ? (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
            setTime(0);
          }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : total;
            setTime(a.currentTime);
            setProgress(d ? a.currentTime / d : 0);
          }}
        />
      ) : null}
    </div>
  );
}
