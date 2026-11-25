"use client";

import * as React from "react";
import { X } from "lucide-react";
import { HeartGlyph } from "@/components/shared/heart";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";
import { playScream } from "./scare";

export type PopLike = {
  kind: string;
  teaser: string | null;
  body: string | null;
  media_path: string | null;
  scream: boolean;
  /** For previews: a local object URL instead of a stored file. */
  localUrl?: string | null;
  localKind?: "image" | "video" | null;
};

/** An original creepy face (pure SVG) for jumpscares without a custom picture. */
function CreepyFace() {
  return (
    <svg viewBox="0 0 200 240" className="h-[92vh] max-h-[1000px] w-auto" aria-hidden>
      <defs>
        <filter id="pop-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <radialGradient id="pop-skin" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#e9e4dc" />
          <stop offset="0.7" stopColor="#a49c92" />
          <stop offset="1" stopColor="#3b3632" />
        </radialGradient>
        <radialGradient id="pop-eye" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.75" stopColor="#0b0606" />
          <stop offset="1" stopColor="#4a1010" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="118" rx="82" ry="112" fill="url(#pop-skin)" />
      <ellipse cx="66" cy="98" rx="24" ry="30" fill="url(#pop-eye)" />
      <ellipse cx="134" cy="96" rx="26" ry="32" fill="url(#pop-eye)" />
      <circle cx="68" cy="100" r="3" fill="#ff2a2a" />
      <circle cx="132" cy="98" r="3" fill="#ff2a2a" />
      <path d="M92 132 L100 150 L108 132" fill="#3b3330" opacity="0.6" />
      <ellipse cx="100" cy="192" rx="36" ry="34" fill="#050202" />
      <path d="M70 182 Q100 168 130 182" stroke="#2a0b0b" strokeWidth="5" fill="none" />
      <ellipse cx="100" cy="118" rx="82" ry="112" filter="url(#pop-grain)" fill="#fff" />
    </svg>
  );
}

function StoredMedia({ path, kind, className, onEnded, controls }: { path: string; kind: "image" | "video"; className?: string; onEnded?: () => void; controls?: boolean }) {
  const url = useSignedUrl(path);
  if (!url) return <div className={cn("skeleton", className)} />;
  return kind === "video" ? (
    <video src={url} autoPlay playsInline controls={controls} onEnded={onEnded} className={className} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- signed private URL
    <img src={url} alt="" className={className} />
  );
}

function Media({ pop, kind, className, onEnded, controls }: { pop: PopLike; kind: "image" | "video"; className?: string; onEnded?: () => void; controls?: boolean }) {
  if (pop.localUrl) {
    return kind === "video" ? (
      <video src={pop.localUrl} autoPlay playsInline controls={controls} onEnded={onEnded} className={className} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- local preview blob
      <img src={pop.localUrl} alt="" className={className} />
    );
  }
  if (!pop.media_path) return null;
  return <StoredMedia path={pop.media_path} kind={kind} className={className} onEnded={onEnded} controls={controls} />;
}

function mediaKindOf(pop: PopLike): "image" | "video" | null {
  if (pop.localKind) return pop.localKind;
  if (!pop.media_path) return null;
  return /\.(mp4|mov|webm)$/i.test(pop.media_path) ? "video" : "image";
}

/**
 * Full-screen player. Step 1 is an innocent teaser card (the tap also unlocks sound),
 * step 2 plays the pop itself.
 */
export function PopPlayer({ pop, fromName, onOpened, onClose }: { pop: PopLike; fromName: string; onOpened?: () => void; onClose: () => void }) {
  const [stage, setStage] = React.useState<"teaser" | "play" | "after">("teaser");
  const stopScream = React.useRef<(() => void) | null>(null);
  const mk = mediaKindOf(pop);

  React.useEffect(() => () => stopScream.current?.(), []);

  React.useEffect(() => {
    if (stage !== "play" || pop.kind !== "jumpscare") return;
    const t = window.setTimeout(() => setStage("after"), mk === "video" ? 6000 : 2300);
    return () => window.clearTimeout(t);
  }, [stage, pop.kind, mk]);

  const open = () => {
    onOpened?.();
    if (pop.kind === "jumpscare" && pop.scream) stopScream.current = playScream();
    setStage("play");
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Überraschung von ${fromName}`} className="fixed inset-0 z-[80]">
      {stage === "teaser" ? (
        <div className="animate-fade-in grid h-full place-items-center bg-[color-mix(in_oklab,var(--background)_70%,transparent)] px-6 backdrop-blur-xl">
          <div className="animate-pop-in card-surface w-full max-w-sm p-7 text-center shadow-lift">
            <div className="mx-auto grid size-16 animate-heartbeat place-items-center rounded-full bg-primary-soft text-primary">
              <HeartGlyph className="size-7" />
            </div>
            <p className="eyebrow mt-5">for you</p>
            <p className="font-display mt-2 text-[2.1rem] leading-[1.05] text-balance">{pop.teaser || `${fromName} hat dir etwas geschickt`}</p>
            <button
              type="button"
              onClick={open}
              className="mt-6 h-12 w-full rounded-full bg-primary text-[15px] font-medium text-primary-foreground shadow-soft transition-transform active:scale-[0.98]"
            >
              Öffnen ♡
            </button>
            <p className="mt-3 text-[12px] text-muted-foreground">von {fromName} · am besten mit Ton</p>
          </div>
        </div>
      ) : pop.kind === "jumpscare" && stage === "play" ? (
        <div className="pop-scare grid h-full place-items-center overflow-hidden bg-black">
          {mk ? <Media pop={pop} kind={mk} className="pop-scare-face h-full w-full object-cover" /> : <div className="pop-scare-face"><CreepyFace /></div>}
        </div>
      ) : pop.kind === "jumpscare" ? (
        <div className="animate-fade-in grid h-full place-items-center bg-charcoal px-6 text-center text-cream">
          <div>
            <p className="text-7xl">😂</p>
            <p className="font-display mt-4 text-5xl leading-none">hab dich!</p>
            <p className="mt-3 text-white/70">liebe Grüße, {fromName} ♡</p>
            <button type="button" onClick={onClose} className="mt-7 h-12 rounded-full bg-white px-7 text-[15px] font-medium text-charcoal">
              {pop.body || "Na warte…"}
            </button>
          </div>
        </div>
      ) : (
        <div className="animate-fade-in relative grid h-full place-items-center bg-black/92 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="absolute top-[calc(var(--safe-top)+1rem)] right-4 z-10 grid size-11 place-items-center rounded-full bg-white/15 backdrop-blur-md"
          >
            <X className="size-5" />
          </button>
          {mk === "video" ? (
            <Media pop={pop} kind="video" controls className="max-h-full w-full object-contain" />
          ) : mk === "image" ? (
            <Media pop={pop} kind="image" className="max-h-[78vh] w-full object-contain" />
          ) : null}
          {pop.body ? (
            <p className={cn("font-display px-6 text-center text-balance", mk ? "absolute inset-x-0 bottom-[calc(var(--safe-bottom)+2rem)] text-3xl drop-shadow-lg" : "max-w-2xl text-5xl leading-[1.05]")}>
              {pop.body}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
