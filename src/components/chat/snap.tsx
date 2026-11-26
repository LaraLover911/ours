"use client";

/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Camera, ImagePlus, Loader2, Send, SwitchCamera, Type, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/shared/avatar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MEDIA_BUCKET } from "@/lib/supabase/env";
import { MAX_UPLOAD_BYTES, mediaKind } from "@/lib/supabase/media";
import { cn } from "@/lib/utils";
import { formatTime, timeAgo } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import { metaOf, type ChatMessage } from "./types";

const MAX_VIDEO_S = 30;
const HOLD_MS = 260;
const PHOTO_COLOR = "#ff3d7f";
const VIDEO_COLOR = "#8a5cff";
const SECONDS = [3, 5, 10, 0] as const;

export type SnapDraft = { file: File | Blob; media: "image" | "video"; caption?: string; seconds?: number; duration?: number; width?: number; height?: number };

function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}

function useLockScroll() {
  React.useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);
}

function pickRecorderType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/* -------------------------------------------------------------------------- */
/* Camera + preview                                                           */
/* -------------------------------------------------------------------------- */

export function SnapCamera({ to, onClose, onSend }: { to: string; onClose: () => void; onSend: (d: SnapDraft) => void }) {
  useLockScroll();
  const [facing, setFacing] = React.useState<"user" | "environment">("user");
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [camError, setCamError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SnapDraft | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [recStart, setRecStart] = React.useState(0);
  const [flash, setFlash] = React.useState(false);
  const video = React.useRef<HTMLVideoElement>(null);
  const recorder = React.useRef<MediaRecorder | null>(null);
  const holdTimer = React.useRef<number | undefined>(undefined);
  const stopTimer = React.useRef<number | undefined>(undefined);
  const gallery = React.useRef<HTMLInputElement>(null);

  // Start the camera only while no snap is being previewed.
  React.useEffect(() => {
    if (draft) return;
    let alive = true;
    let current: MediaStream | null = null;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("Dieser Browser kann die Kamera nicht öffnen. Du kannst ein Foto oder Video aus deiner Galerie schicken.");
        return;
      }
      const constraints = { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } };
      try {
        current = await navigator.mediaDevices
          .getUserMedia({ video: constraints, audio: true })
          .catch(() => navigator.mediaDevices.getUserMedia({ video: constraints, audio: false }));
        if (!alive) return current.getTracks().forEach((t) => t.stop());
        setCamError(null);
        setStream(current);
      } catch (err) {
        if (!alive) return;
        const name = (err as DOMException)?.name;
        setCamError(
          name === "NotAllowedError"
            ? "Kamera ist blockiert. Erlaube sie in den Website-Einstellungen deines Browsers oder schick etwas aus deiner Galerie."
            : "Kamera nicht verfügbar. Du kannst ein Foto oder Video aus deiner Galerie schicken.",
        );
      }
    };
    void start();
    return () => {
      alive = false;
      current?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [facing, draft]);

  React.useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream]);

  React.useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(stopTimer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !draft && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, onClose]);

  const takePhoto = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 160);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return void toast.error("Foto konnte nicht aufgenommen werden.");
    navigator.vibrate?.(10);
    setDraft({ file: blob, media: "image", seconds: 10, width: canvas.width, height: canvas.height });
  };

  const startRecording = () => {
    const type = pickRecorderType();
    if (!stream || type === null) return void toast.error("Videoaufnahme geht in diesem Browser nicht. Tippe für ein Foto.");
    const chunks: Blob[] = [];
    const rec = type ? new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3_000_000 }) : new MediaRecorder(stream);
    const started = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      setRecording(false);
      const duration = (Date.now() - started) / 1000;
      if (duration < 0.6 || !chunks.length) return;
      const mime = (rec.mimeType || type || "video/webm").split(";")[0];
      const blob = new Blob(chunks, { type: mime });
      if (blob.size > MAX_UPLOAD_BYTES) return void toast.error("Das Video ist zu groß. Nimm ein kürzeres auf.");
      setDraft({ file: blob, media: "video", duration, width: video.current?.videoWidth, height: video.current?.videoHeight });
    };
    rec.start(250);
    recorder.current = rec;
    navigator.vibrate?.(15);
    setRecStart(started);
    setRecording(true);
    stopTimer.current = window.setTimeout(() => rec.state === "recording" && rec.stop(), MAX_VIDEO_S * 1000);
  };

  const onShutterDown = (e: React.PointerEvent) => {
    if (!stream) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = undefined;
      startRecording();
    }, HOLD_MS);
  };
  const onShutterUp = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
      void takePhoto();
    } else if (recorder.current?.state === "recording") {
      window.clearTimeout(stopTimer.current);
      recorder.current.stop();
    }
  };

  const fromGallery = (f: File) => {
    const kind = mediaKind(f.type);
    if (kind !== "image" && kind !== "video") return void toast.error("Bitte ein Foto oder Video auswählen.");
    if (f.size > MAX_UPLOAD_BYTES) return void toast.error("Die Datei ist zu groß (max. 50 MB).");
    setDraft({ file: f, media: kind, seconds: kind === "image" ? 10 : undefined });
  };

  return (
    <Portal>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Snap an ${to}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed inset-0 z-[120] flex flex-col bg-black text-white"
      >
        <input
          ref={gallery}
          type="file"
          accept="image/*,video/mp4,video/quicktime,video/webm"
          className="sr-only"
          aria-label="Foto oder Video aus der Galerie"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) fromGallery(f);
          }}
        />
        {draft ? (
          <SnapPreview draft={draft} to={to} onChange={setDraft} onRetake={() => setDraft(null)} onSend={() => onSend(draft)} />
        ) : (
          <div className="relative mx-auto flex h-full w-full max-w-[calc(100dvh*9/16)] flex-1 flex-col overflow-hidden sm:my-4 sm:rounded-[28px]">
            {stream ? (
              <video ref={video} autoPlay playsInline muted className={cn("absolute inset-0 size-full object-cover", facing === "user" && "-scale-x-100")} />
            ) : camError ? (
              <div className="absolute inset-0 grid place-items-center px-8 text-center">
                <div>
                  <Camera className="mx-auto size-10 text-white/60" />
                  <p className="mt-4 text-[15px] text-white/85">{camError}</p>
                  <button type="button" onClick={() => gallery.current?.click()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-black">
                    <ImagePlus className="size-5" /> Aus der Galerie
                  </button>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="size-8 animate-spin text-white/60" />
              </div>
            )}
            <AnimatePresence>{flash ? <motion.div initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-0 bg-white" /> : null}</AnimatePresence>

            {/* top */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/45 to-transparent px-4 pt-[calc(var(--safe-top)+0.75rem)] pb-10">
              <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-black/30 backdrop-blur-md" aria-label="Schließen">
                <X className="size-6" />
              </button>
              <p className="rounded-full bg-black/30 px-3 py-1.5 text-[13px] font-medium backdrop-blur-md">Snap an {to}</p>
              <button
                type="button"
                onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                disabled={recording || !stream}
                className="grid size-11 place-items-center rounded-full bg-black/30 backdrop-blur-md disabled:opacity-40"
                aria-label="Kamera wechseln"
              >
                <SwitchCamera className="size-5" />
              </button>
            </div>

            {/* bottom */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black/50 to-transparent pt-12 pb-[calc(var(--safe-bottom)+1.5rem)]">
              <p className="mb-4 text-[13px] text-white/80" aria-live="polite">
                {recording ? <RecTime since={recStart} /> : stream ? "Tippen für Foto, halten für Video" : ""}
              </p>
              <div className="grid w-full grid-cols-3 items-center px-8">
                <button type="button" onClick={() => gallery.current?.click()} disabled={recording} className="grid size-12 place-items-center justify-self-start rounded-2xl bg-white/15 backdrop-blur-md disabled:opacity-40" aria-label="Aus der Galerie wählen">
                  <ImagePlus className="size-6" />
                </button>
                <button
                  type="button"
                  aria-label={recording ? "Aufnahme beenden" : "Foto aufnehmen (gedrückt halten für Video)"}
                  disabled={!stream}
                  onPointerDown={onShutterDown}
                  onPointerUp={onShutterUp}
                  onPointerCancel={onShutterUp}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void takePhoto();
                    }
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  className="relative grid size-[84px] touch-none place-items-center justify-self-center select-none disabled:opacity-40"
                >
                  <svg viewBox="0 0 84 84" className="absolute inset-0 size-full -rotate-90" aria-hidden>
                    <circle cx="42" cy="42" r="38" fill="none" stroke="white" strokeWidth="5" opacity={recording ? 0.35 : 1} />
                    {recording ? (
                      <circle
                        cx="42"
                        cy="42"
                        r="38"
                        fill="none"
                        stroke={VIDEO_COLOR}
                        strokeWidth="6"
                        strokeLinecap="round"
                        pathLength={1}
                        strokeDasharray="1 1"
                        style={{ animation: `snap-ring ${MAX_VIDEO_S}s linear forwards` }}
                      />
                    ) : null}
                  </svg>
                  <span className={cn("rounded-full transition-all duration-200", recording ? "size-9 rounded-xl bg-[#ff3b30]" : "size-[64px] bg-white/25")} />
                </button>
                <span />
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </Portal>
  );
}

function RecTime({ since }: { since: number }) {
  const [, tick] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, []);
  // eslint-disable-next-line react-hooks/purity -- a running clock is the point here
  const s = Math.min(MAX_VIDEO_S, Math.floor((Date.now() - since) / 1000));
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff3b30] px-2.5 py-1 font-semibold text-white tabular-nums">
      <span className="size-2 animate-pulse rounded-full bg-white" /> 0:{String(s).padStart(2, "0")} / 0:{MAX_VIDEO_S}
    </span>
  );
}

function SnapPreview({ draft, to, onChange, onRetake, onSend }: { draft: SnapDraft; to: string; onChange: (d: SnapDraft) => void; onRetake: () => void; onSend: () => void }) {
  const url = React.useMemo(() => URL.createObjectURL(draft.file), [draft.file]);
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [editing, setEditing] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[calc(100dvh*9/16)] flex-1 flex-col overflow-hidden bg-black sm:my-4 sm:rounded-[28px]">
      {draft.media === "image" ? (
        <img src={url} alt="Dein Snap" className="absolute inset-0 size-full object-cover" />
      ) : (
        <video
          src={url}
          autoPlay
          loop
          playsInline
          className="absolute inset-0 size-full object-cover"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (!draft.duration || !draft.width) onChange({ ...draft, duration: Number.isFinite(v.duration) ? v.duration : draft.duration, width: v.videoWidth || draft.width, height: v.videoHeight || draft.height });
          }}
        />
      )}
      <button type="button" className="absolute inset-0" aria-label="Text hinzufügen" onClick={() => setEditing(true)} />

      {/* caption bar, Snapchat style */}
      {editing || draft.caption ? (
        <div className="absolute inset-x-0 top-[58%] z-10 bg-black/55 px-4 py-2.5 backdrop-blur-sm">
          {editing ? (
            <input
              ref={input}
              value={draft.caption ?? ""}
              maxLength={200}
              onChange={(e) => onChange({ ...draft, caption: e.target.value })}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
              placeholder="Schreib was…"
              aria-label="Text auf dem Snap"
              enterKeyHint="done"
              className="w-full bg-transparent text-center text-[17px] font-medium text-white outline-none placeholder:text-white/60"
            />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="w-full text-center text-[17px] font-medium break-words">
              {draft.caption}
            </button>
          )}
        </div>
      ) : null}

      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/45 to-transparent px-4 pt-[calc(var(--safe-top)+0.75rem)] pb-10">
        <button type="button" onClick={onRetake} className="grid size-11 place-items-center rounded-full bg-black/30 backdrop-blur-md" aria-label="Verwerfen und neu aufnehmen">
          <X className="size-6" />
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className="grid size-11 place-items-center rounded-full bg-black/30 backdrop-blur-md" aria-label="Text hinzufügen">
            <Type className="size-5" />
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 pt-14 pb-[calc(var(--safe-bottom)+1.25rem)]">
        {draft.media === "image" ? (
          <div className="flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Wie lange der Snap zu sehen ist">
            {SECONDS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={(draft.seconds ?? 10) === s}
                onClick={() => onChange({ ...draft, seconds: s })}
                className={cn("h-8 min-w-11 rounded-full px-3 text-[13px] font-semibold backdrop-blur-md", (draft.seconds ?? 10) === s ? "bg-white text-black" : "bg-black/35 text-white")}
              >
                {s === 0 ? "∞" : `${s}s`}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-white/75">Kann einmal geöffnet werden und wird danach gelöscht.</p>
          <button
            type="button"
            onClick={onSend}
            className="flex h-12 shrink-0 items-center gap-2 rounded-full pr-5 pl-4 text-[15px] font-bold text-white shadow-lg transition-transform active:scale-95"
            style={{ background: `linear-gradient(135deg, ${PHOTO_COLOR}, ${VIDEO_COLOR})` }}
          >
            An {to} <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bubble in the chat                                                         */
/* -------------------------------------------------------------------------- */

export function SnapBubble({ m, mine, onOpen }: { m: ChatMessage; mine: boolean; onOpen: (m: ChatMessage) => void }) {
  const meta = metaOf(m);
  const color = meta.media === "video" ? VIDEO_COLOR : PHOTO_COLOR;
  const what = meta.media === "video" ? "Video-Snap" : "Snap";
  const opened = !!m.opened_at;
  const sending = m._local?.status === "sending";
  const failed = m._local?.status === "failed";
  const canOpen = !mine && !opened && !m._local;

  const icon = (
    <span
      aria-hidden
      className={cn("grid size-6 shrink-0 place-items-center rounded-[7px] border-[2.5px]", sending && "animate-pulse")}
      style={{ borderColor: color, background: opened ? "transparent" : color }}
    >
      {meta.media === "video" && !opened ? <span className="ml-0.5 size-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-white" /> : null}
    </span>
  );

  const label = mine
    ? sending
      ? "Wird gesendet…"
      : failed
        ? "Nicht gesendet"
        : opened
          ? "Geöffnet"
          : `${what} gesendet`
    : opened
      ? "Geöffnet"
      : `Neuer ${what}`;
  const sub = mine
    ? opened && m.opened_at
      ? `um ${formatTime(m.opened_at)} Uhr`
      : sending || failed
        ? ""
        : "noch nicht geöffnet"
    : opened
      ? m.opened_at
        ? `um ${formatTime(m.opened_at)} Uhr`
        : ""
      : "Tippen zum Ansehen";

  const body = (
    <span className="flex items-center gap-3 rounded-[1.25rem] border border-border bg-card px-3.5 py-2.5 text-left shadow-[0_1px_1px_rgb(0_0_0/0.04)]">
      {icon}
      <span className="min-w-0 leading-tight">
        <span className="block text-[15px] font-semibold" style={{ color: opened ? undefined : color }}>
          {label}
        </span>
        {sub ? <span className="block text-[12px] text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
  );

  return canOpen ? (
    <button type="button" onClick={() => onOpen(m)} className="block rounded-[1.25rem] transition-transform active:scale-[0.97]" aria-label={`${what} öffnen`}>
      {body}
    </button>
  ) : (
    body
  );
}

/* -------------------------------------------------------------------------- */
/* Viewer (recipient, once)                                                   */
/* -------------------------------------------------------------------------- */

export function SnapViewer({ m, open, onClose }: { m: ChatMessage; open: (m: ChatMessage) => Promise<string>; onClose: () => void }) {
  useLockScroll();
  const { profiles, nameOf } = useApp();
  const meta = metaOf(m);
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  const closed = React.useRef(false);
  const seconds = meta.media === "image" ? (meta.seconds ?? 10) : 0;

  const close = React.useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    // The file is gone for good once it was seen.
    if (m.attachment_path) void getSupabaseBrowserClient().storage.from(MEDIA_BUCKET).remove([m.attachment_path]);
    onClose();
  }, [m.attachment_path, onClose]);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await open(m);
        const { data, error } = await getSupabaseBrowserClient().storage.from(MEDIA_BUCKET).createSignedUrl(m.attachment_path!, 120);
        if (error || !data?.signedUrl) throw error ?? new Error("Snap nicht mehr verfügbar");
        if (alive) setUrl(data.signedUrl);
      } catch (err) {
        if (alive) setFailed(errorMessage(err));
      }
    })();
    return () => {
      alive = false;
    };
    // open once per snap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  // Photo timer.
  React.useEffect(() => {
    if (!url || meta.media !== "image" || !seconds) return;
    const started = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - started) / (seconds * 1000));
      setProgress(p);
      if (p >= 1) close();
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [url, meta.media, seconds, close]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <Portal>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Snap von ${nameOf(m.sender_id)}`}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed inset-0 z-[120] bg-black text-white"
      >
        <div className="relative mx-auto h-full w-full max-w-[calc(100dvh*9/16)] overflow-hidden sm:py-4">
          <div className="relative h-full overflow-hidden sm:rounded-[28px]">
            {failed ? (
              <div className="grid h-full place-items-center px-8 text-center">
                <div>
                  <p className="text-[16px]">{failed}</p>
                  <button type="button" onClick={close} className="mt-5 h-11 rounded-full bg-white px-6 font-semibold text-black">
                    Schließen
                  </button>
                </div>
              </div>
            ) : !url ? (
              <div className="grid h-full place-items-center">
                <Loader2 className="size-8 animate-spin text-white/60" />
              </div>
            ) : meta.media === "video" ? (
              <video
                src={url}
                autoPlay
                playsInline
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration) setProgress(v.currentTime / v.duration);
                }}
                onEnded={close}
                onError={() => setFailed("Das Video lässt sich nicht abspielen.")}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <img src={url} alt={m.body ?? "Snap"} className="absolute inset-0 size-full object-cover" />
            )}

            {url ? <button type="button" onClick={close} className="absolute inset-0 z-[1]" aria-label="Snap schließen" /> : null}

            {m.body && url ? (
              <p className="pointer-events-none absolute inset-x-0 top-[58%] z-[2] bg-black/55 px-4 py-2.5 text-center text-[17px] font-medium break-words backdrop-blur-sm">{m.body}</p>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] bg-gradient-to-b from-black/50 to-transparent px-3 pt-[calc(var(--safe-top)+0.5rem)] pb-10">
              <div className="h-[3px] overflow-hidden rounded-full bg-white/30">
                <div className="h-full bg-white" style={{ width: `${(seconds || meta.media === "video" ? progress : 0) * 100}%` }} />
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <Avatar profile={profiles[m.sender_id]} size="sm" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-[14.5px] font-semibold">{nameOf(m.sender_id)}</p>
                  <p className="text-[12px] text-white/75">{timeAgo(m.created_at)}</p>
                </div>
                <span className="pointer-events-auto">
                  <button type="button" onClick={close} className="grid size-10 place-items-center rounded-full bg-black/30 backdrop-blur-md" aria-label="Schließen">
                    <X className="size-5" />
                  </button>
                </span>
              </div>
            </div>
            {meta.media === "image" && !seconds && url ? (
              <p className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+1.5rem)] z-[2] text-center text-[12.5px] text-white/75">Tippen zum Schließen</p>
            ) : null}
          </div>
        </div>
      </motion.div>
    </Portal>
  );
}

export function SnapButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Snap senden"
      className={cn("grid size-10 shrink-0 place-items-center rounded-full text-white shadow-[0_4px_14px_-4px_rgba(138,92,255,.7)] transition-transform hover:scale-105 active:scale-95", className)}
      style={{ background: `linear-gradient(135deg, ${PHOTO_COLOR}, ${VIDEO_COLOR})` }}
    >
      <Camera className="size-5" />
    </button>
  );
}
