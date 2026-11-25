"use client";

import * as React from "react";
import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/shared/avatar";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { useCall } from "./call-provider";

function StreamVideo({ stream, muted, className, mirror }: { stream: MediaStream | null; muted?: boolean; className?: string; mirror?: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={cn("bg-black object-cover", mirror && "-scale-x-100", className)} />;
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
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="tabular-nums">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>;
}

function RoundButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-14 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-transform active:scale-95 [&_svg]:size-6",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CallScreen() {
  const { partner } = useApp();
  const { state, accept, decline, hangup, toggleMic, toggleCam, flipCamera, dismiss } = useCall();
  const { status, kind, localStream, remoteStream } = state;
  const isVideo = kind === "video";
  const remoteHasVideo = !!remoteStream?.getVideoTracks().length;
  const name = partner?.display_name ?? "…";

  const label =
    status === "outgoing"
      ? "klingelt…"
      : status === "incoming"
        ? isVideo
          ? "möchte dich per Video sehen"
          : "ruft dich an"
        : status === "connecting"
          ? "verbinde…"
          : status === "ended"
            ? (state.endedReason ?? "Anruf beendet")
            : null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Anruf mit ${name}`} className="fixed inset-0 z-[90] overflow-hidden bg-charcoal text-white">
      {/* Remote video (or a soft background for audio calls) */}
      {isVideo && remoteHasVideo && status === "active" ? (
        <StreamVideo stream={remoteStream} className="absolute inset-0 size-full" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#6f293e,transparent_70%),radial-gradient(100%_60%_at_50%_100%,#3a1420,#141113)]" />
      )}
      {!isVideo || !remoteHasVideo ? <RemoteAudio stream={remoteStream} /> : null}

      {/* Local preview */}
      {isVideo && localStream && status !== "ended" ? (
        <div
          className={cn(
            "absolute overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/20 transition-all duration-500",
            status === "active" ? "top-[calc(var(--safe-top)+1rem)] right-4 aspect-[3/4] w-28 sm:w-40" : "inset-0 rounded-none opacity-60 ring-0",
          )}
        >
          <StreamVideo stream={localStream} muted mirror={state.facing === "user"} className={cn("size-full", !state.camOn && "opacity-0")} />
        </div>
      ) : null}

      {/* Header */}
      <div className="relative flex h-full flex-col items-center px-6 pt-[calc(var(--safe-top)+3.5rem)] pb-[calc(var(--safe-bottom)+2.5rem)]">
        {status !== "active" || !isVideo || !remoteHasVideo ? (
          <div className="flex flex-col items-center text-center">
            <div className={cn("rounded-full", (status === "outgoing" || status === "incoming") && "animate-heartbeat")}>
              <Avatar profile={partner} size="xl" ring />
            </div>
            <p className="font-display mt-5 text-5xl leading-none">{name}</p>
            <p className="mt-2 text-[15px] text-white/75">
              {status === "active" && state.startedAt ? <Duration since={state.startedAt} /> : label}
            </p>
          </div>
        ) : (
          <div className="self-start rounded-full bg-black/35 px-3 py-1.5 text-[13px] backdrop-blur-md">
            {name} · {state.startedAt ? <Duration since={state.startedAt} /> : null}
            {state.quality ? <span className="text-white/70"> · {state.quality}</span> : null}
          </div>
        )}

        {/* Controls */}
        <div className="mt-auto flex items-center justify-center gap-4">
          {status === "incoming" ? (
            <>
              <RoundButton label="Ablehnen" onClick={decline} className="size-16 bg-[#e5484d]">
                <PhoneOff />
              </RoundButton>
              <RoundButton label="Annehmen" onClick={accept} className="size-16 animate-pulse bg-[#30a46c]">
                {isVideo ? <Video /> : <Phone />}
              </RoundButton>
            </>
          ) : status === "ended" ? (
            <RoundButton label="Schließen" onClick={dismiss} className="w-auto px-6 text-[15px] font-medium">
              Schließen
            </RoundButton>
          ) : (
            <>
              <RoundButton label={state.micOn ? "Mikrofon aus" : "Mikrofon an"} onClick={toggleMic} className={cn(!state.micOn && "bg-white text-charcoal")}>
                {state.micOn ? <Mic /> : <MicOff />}
              </RoundButton>
              {isVideo ? (
                <>
                  <RoundButton label={state.camOn ? "Kamera aus" : "Kamera an"} onClick={toggleCam} className={cn(!state.camOn && "bg-white text-charcoal")}>
                    {state.camOn ? <Video /> : <VideoOff />}
                  </RoundButton>
                  <RoundButton label="Kamera wechseln" onClick={flipCamera}>
                    <SwitchCamera />
                  </RoundButton>
                </>
              ) : null}
              <RoundButton label="Auflegen" onClick={hangup} className="bg-[#e5484d]">
                <PhoneOff />
              </RoundButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
