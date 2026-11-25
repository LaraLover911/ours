"use client";

import * as React from "react";
import {
  Bug,
  ChevronDown,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  Phone,
  PhoneOff,
  RotateCcw,
  SwitchCamera,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/shared/avatar";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { useCall } from "./call-provider";
import { formatClock } from "./call-utils";
import type { CallDebug, CallSnapshot } from "./engine";

function StreamVideo({ stream, className, mirror, contain }: { stream: MediaStream | null; className?: string; mirror?: boolean; contain?: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);
  // Always muted: the remote sound plays through <RemoteAudio>, so it keeps playing when minimized.
  return <video ref={ref} autoPlay playsInline muted className={cn("bg-black", contain ? "object-contain" : "object-cover", mirror && "-scale-x-100", className)} />;
}

function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function Duration({ since }: { since: number }) {
  const now = useNow(1000) ?? since;
  return <span className="tabular-nums">{formatClock(now - since)}</span>;
}

function RoundButton({
  label,
  onClick,
  className,
  children,
  pressed,
  disabled,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-transform active:scale-95 disabled:opacity-40 [&_svg]:size-6",
        className,
      )}
    >
      {children}
    </button>
  );
}

function statusLine(s: CallSnapshot) {
  switch (s.phase) {
    case "outgoing":
      return s.delivered ? "klingelt…" : "wird zugestellt…";
    case "incoming":
      return s.kind === "video" ? "möchte dich per Video sehen" : "ruft dich an";
    case "connecting":
      return "verbinde…";
    case "reconnecting":
      return "Verbindung wird wiederhergestellt…";
    case "ended":
      return s.endedReason ?? "Anruf beendet";
    default:
      return null;
  }
}

function QualityBadge({ s }: { s: CallSnapshot }) {
  const q = s.quality;
  if (!q) return null;
  const color = q.level === "gut" ? "bg-[#4fbf7f]" : q.level === "okay" ? "bg-[#f5b94a]" : "bg-[#e5484d]";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[12px] whitespace-nowrap backdrop-blur-md" title={q.rttMs != null ? `Latenz ${q.rttMs} ms${q.lossPct != null ? ` · Verlust ${q.lossPct} %` : ""}` : undefined}>
      <span className={cn("size-2 rounded-full", color)} />
      Verbindung {q.level}
      {q.label ? <span className="hidden text-white/70 sm:inline">· {q.label}</span> : null}
    </span>
  );
}

function DebugPanel({ d, s, onClose }: { d: CallDebug; s: CallSnapshot; onClose: () => void }) {
  const c = (x: CallDebug["localCands"]) => `host ${x.host} · srflx ${x.srflx} · relay ${x.relay}${x.prflx ? ` · prflx ${x.prflx}` : ""}`;
  return (
    <div className="absolute inset-x-3 top-[calc(var(--safe-top)+3.5rem)] z-10 max-h-[60dvh] overflow-auto rounded-2xl bg-black/80 p-3 font-mono text-[11px] leading-relaxed text-white/90 backdrop-blur-md sm:left-auto sm:w-96">
      <div className="mb-1 flex items-center justify-between font-sans text-[12px] font-semibold">
        Call-Debug (nur lokal)
        <button type="button" aria-label="Debug schließen" onClick={onClose} className="rounded p-1 hover:bg-white/10">
          <X className="size-4" />
        </button>
      </div>
      <p>Phase: {s.phase} · Signaling: {d.signaling}</p>
      <p>Peer: {d.connection} · ICE: {d.ice} · Sammeln: {d.gathering}</p>
      <p>SDP: {d.signalingState}</p>
      <p>Lokal: {c(d.localCands)}</p>
      <p>Partner: {c(d.remoteCands)}</p>
      <p>Weg: {d.pair ?? "–"}</p>
      <p>TURN: {d.turn}</p>
      <p>Medien: Mikro {s.micOn ? "an" : "aus"} · Kamera {s.camOn ? "an" : "aus"} · Screen {s.screenOn ? "an" : "aus"}</p>
      <p>Partner-Medien: Mikro {s.remoteMedia.mic ? "an" : "aus"} · Kamera {s.remoteMedia.cam ? "an" : "aus"} · Screen {s.remoteMedia.screen ? "an" : "aus"}</p>
      <ol className="mt-2 space-y-0.5 border-t border-white/15 pt-2">
        {d.log.slice(-25).map((l, i) => (
          <li key={`${l.t}-${i}`}>
            <span className="text-white/50">{new Date(l.t).toLocaleTimeString("de-DE")}</span> {l.msg}
          </li>
        ))}
      </ol>
    </div>
  );
}

function MiniPlayer() {
  const { partner } = useApp();
  const { state: s, setMinimized, hangup, toggleMic } = useCall();
  return (
    <div
      role="region"
      aria-label={`Anruf mit ${partner?.display_name ?? "…"}`}
      className="fixed right-3 bottom-[calc(var(--safe-bottom)+5.5rem)] z-[90] flex w-[min(19rem,calc(100vw-1.5rem))] items-center gap-3 rounded-[1.4rem] bg-charcoal/95 p-2.5 pr-3 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md animate-pop-in lg:bottom-6"
    >
      <button type="button" onClick={() => setMinimized(false)} aria-label="Anruf vergrößern" className="relative size-14 shrink-0 overflow-hidden rounded-2xl bg-black">
        {s.remoteVideoLive ? <StreamVideo stream={s.remoteStream} className="size-full" contain={s.remoteMedia.screen} /> : <Avatar profile={partner} size="lg" className="size-full rounded-none" />}
      </button>
      <button type="button" onClick={() => setMinimized(false)} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[14px] font-medium">{partner?.display_name ?? "…"}</p>
        <p className="text-[12px] text-white/70">{s.phase === "active" && s.connectedAt ? <Duration since={s.connectedAt} /> : statusLine(s)}</p>
      </button>
      <RoundButton label={s.micOn ? "Mikrofon aus" : "Mikrofon an"} pressed={!s.micOn} onClick={toggleMic} className={cn("size-10 [&_svg]:size-5", !s.micOn && "bg-white text-charcoal")}>
        {s.micOn ? <Mic /> : <MicOff />}
      </RoundButton>
      <RoundButton label="Auflegen" onClick={hangup} className="size-10 bg-[#e5484d] [&_svg]:size-5">
        <PhoneOff />
      </RoundButton>
    </div>
  );
}

export function CallScreen() {
  const { partner } = useApp();
  const call = useCall();
  const { state: s, debug } = call;
  const [showDebug, setShowDebug] = React.useState(false);
  const name = partner?.display_name ?? "…";
  const inCall = s.phase === "active" || s.phase === "reconnecting";
  const live = s.phase !== "ended" && s.phase !== "idle";
  const showRemoteVideo = inCall && s.remoteVideoLive;
  const showLocal = live && s.localStream && (s.camOn || s.screenOn);

  if (s.minimized && live && s.phase !== "incoming") {
    return (
      <>
        <RemoteAudio stream={s.remoteStream} />
        <MiniPlayer />
      </>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Anruf mit ${name}`} className="fixed inset-0 z-[90] overflow-hidden bg-charcoal text-white">
      <RemoteAudio stream={s.remoteStream} />
      {showRemoteVideo ? (
        <StreamVideo stream={s.remoteStream} className="absolute inset-0 size-full" contain={s.remoteMedia.screen} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#6f293e,transparent_70%),radial-gradient(100%_60%_at_50%_100%,#3a1420,#141113)]" />
      )}

      {/* Local preview: full screen while ringing, small once connected. */}
      {showLocal ? (
        <div
          className={cn(
            "absolute overflow-hidden shadow-2xl transition-all duration-500",
            inCall ? "top-[calc(var(--safe-top)+4rem)] right-4 aspect-[3/4] w-28 rounded-3xl ring-1 ring-white/20 sm:w-40" : "inset-0 opacity-60",
          )}
        >
          {s.camOn ? (
            <StreamVideo stream={s.localStream} mirror={s.facing === "user"} className="size-full" />
          ) : (
            <div className="grid size-full place-items-center bg-black/60 text-[12px]">Bildschirm wird geteilt</div>
          )}
        </div>
      ) : null}

      {debug && showDebug ? <DebugPanel d={s.debug} s={s} onClose={() => setShowDebug(false)} /> : null}

      <div className="relative flex h-full flex-col items-center px-5 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--safe-bottom)+2rem)]">
        {/* Top bar */}
        <div className="flex w-full items-center gap-2">
          {live && s.phase !== "incoming" ? (
            <button type="button" aria-label="Anruf verkleinern" onClick={() => call.setMinimized(true)} className="grid size-10 place-items-center rounded-full bg-black/30 backdrop-blur-md">
              <ChevronDown className="size-5" />
            </button>
          ) : null}
          {showRemoteVideo ? (
            <span className="min-w-0 truncate rounded-full bg-black/35 px-3 py-1.5 text-[13px] whitespace-nowrap backdrop-blur-md">
              {name} · {s.connectedAt ? <Duration since={s.connectedAt} /> : null}
            </span>
          ) : null}
          <span className="ml-auto" />
          {inCall ? <QualityBadge s={s} /> : null}
          {debug ? (
            <button type="button" aria-label="Debug anzeigen" onClick={() => setShowDebug((v) => !v)} className="grid size-10 place-items-center rounded-full bg-black/30 backdrop-blur-md">
              <Bug className="size-4" />
            </button>
          ) : null}
        </div>

        {!showRemoteVideo ? (
          <div className="mt-[8vh] flex flex-col items-center text-center">
            <div className={cn("rounded-full", (s.phase === "outgoing" || s.phase === "incoming") && "animate-heartbeat")}>
              <Avatar profile={partner} size="xl" ring />
            </div>
            <p className="font-display mt-5 text-5xl leading-none">{name}</p>
            <p className={cn("mt-2 max-w-sm text-[15px] text-pretty text-white/75", s.phase === "reconnecting" && "animate-pulse")}>
              {s.phase === "active" && s.connectedAt ? <Duration since={s.connectedAt} /> : s.error ? "Anruf nicht möglich" : statusLine(s)}
            </p>
            {inCall && !s.remoteMedia.mic ? <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-white/70"><MicOff className="size-3.5" /> {name} ist stumm</p> : null}
          </div>
        ) : s.phase === "reconnecting" ? (
          <p className="mt-6 animate-pulse rounded-full bg-black/40 px-4 py-2 text-[14px] backdrop-blur-md">Verbindung wird wiederhergestellt…</p>
        ) : null}

        {s.error ? (
          <div role="alert" className="mt-6 max-w-sm rounded-2xl bg-white/10 px-4 py-3 text-center text-[14px] text-pretty backdrop-blur-md">
            {s.error}
          </div>
        ) : null}

        {/* Controls */}
        <div className="mt-auto flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {s.phase === "incoming" ? (
            <>
              <RoundButton label="Ablehnen" onClick={call.decline} className="size-16 bg-[#e5484d]">
                <PhoneOff />
              </RoundButton>
              <RoundButton label="Annehmen" onClick={call.accept} className="size-16 animate-pulse bg-[#30a46c]">
                {s.kind === "video" ? <Video /> : <Phone />}
              </RoundButton>
            </>
          ) : s.phase === "ended" ? (
            <>
              {s.error ? (
                <RoundButton
                  label="Nochmal anrufen"
                  onClick={() => {
                    const kind = s.kind;
                    call.dismiss();
                    call.startCall(kind);
                  }}
                  className="w-auto gap-2 px-5 text-[15px] font-medium [&_svg]:size-5"
                >
                  <RotateCcw /> Nochmal
                </RoundButton>
              ) : null}
              <RoundButton label="Schließen" onClick={call.dismiss} className="w-auto px-6 text-[15px] font-medium">
                Schließen
              </RoundButton>
            </>
          ) : (
            <>
              <RoundButton label={s.micOn ? "Mikrofon aus" : "Mikrofon an"} pressed={!s.micOn} onClick={call.toggleMic} className={cn(!s.micOn && "bg-white text-charcoal")}>
                {s.micOn ? <Mic /> : <MicOff />}
              </RoundButton>
              <RoundButton label={s.camOn ? "Kamera aus" : "Kamera an"} pressed={!s.camOn} onClick={call.toggleCam} className={cn(!s.camOn && s.kind === "video" && "bg-white text-charcoal")}>
                {s.camOn ? <Video /> : <VideoOff />}
              </RoundButton>
              {s.camOn ? (
                <RoundButton label="Kamera wechseln" onClick={call.flipCamera}>
                  <SwitchCamera />
                </RoundButton>
              ) : null}
              {call.canShareScreen && inCall ? (
                <RoundButton label={s.screenOn ? "Teilen beenden" : "Bildschirm teilen"} pressed={s.screenOn} onClick={call.toggleScreen} className={cn(s.screenOn && "bg-white text-charcoal")}>
                  {s.screenOn ? <MonitorX /> : <MonitorUp />}
                </RoundButton>
              ) : null}
              <RoundButton label="Auflegen" onClick={call.hangup} className="bg-[#e5484d]">
                <PhoneOff />
              </RoundButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
