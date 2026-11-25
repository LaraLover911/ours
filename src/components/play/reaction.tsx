"use client";

import * as React from "react";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RoomProps } from "./use-game-room";

/**
 * Reaction Battle. The server decides when GO is (state.go_at, server time). This
 * device turns green at that moment (corrected by the measured clock offset) and
 * measures from the frame it turned green; the server caps the time at what really
 * passed on its clock, and anything before GO is a false start.
 */
export function Reaction(p: RoomProps) {
  const s = p.room.state;
  const round: number = s.round;
  const taps: Record<string, number> = s.taps ?? {};
  const iTapped = p.meId in taps;
  const [green, setGreen] = React.useState(false);
  const shownAt = React.useRef<number | null>(null);
  const [mine, setMine] = React.useState<number | null>(null);

  const goLocal = s.go_at ? new Date(s.go_at).getTime() - p.offset : null;

  // New round: back to "wait".
  const roundKey = `${s.phase}:${round}:${s.go_at}`;
  const [seen, setSeen] = React.useState(roundKey);
  if (seen !== roundKey) {
    setSeen(roundKey);
    setGreen(false);
    setMine(null);
  }

  // Turn green exactly at GO, measured from the next painted frame.
  React.useEffect(() => {
    shownAt.current = null;
    if (s.phase !== "play" || goLocal == null) return;
    const wait = Math.max(0, goLocal - Date.now());
    let raf = 0;
    const t = window.setTimeout(() => {
      setGreen(true);
      raf = requestAnimationFrame(() => {
        shownAt.current = performance.now();
      });
    }, wait);
    // Nobody tapped within 5 s after GO: close the round.
    const timeout = window.setTimeout(() => void p.move({ timeout: true, round }, true), wait + 5600);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, goLocal, round]);

  const tap = () => {
    if (iTapped || p.pending || s.phase !== "play") return;
    const ms = shownAt.current != null ? Math.round(performance.now() - shownAt.current) : 0;
    setMine(green ? ms : -1);
    void p.move({ tap: true, ms, round });
  };

  const log: { taps: Record<string, number>; winner: string | null }[] = s.log ?? [];
  const lastRound = log.at(-1);
  const fmt = (v: number | undefined) => (v == null ? "–" : v === -1 ? "zu früh" : v === -2 ? "nicht getippt" : v === 0 ? "–" : `${v} ms`);

  if (s.phase === "ready") {
    const ready: Record<string, boolean> = s.ready ?? {};
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-[15px] text-pretty text-muted-foreground">Sobald das Feld grün wird, tippt so schnell ihr könnt. Wer zu früh tippt, verliert die Runde. Wer zuerst drei Runden hat, gewinnt.</p>
        <div className="mt-5 flex justify-center gap-3 text-[13px]">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1", ready[p.meId] ? "bg-success/15" : "bg-muted")}>{ready[p.meId] ? <Check className="size-3.5" /> : null} du</span>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1", ready[p.partnerId] ? "bg-success/15" : "bg-muted")}>
            {ready[p.partnerId] ? <Check className="size-3.5" /> : null} {p.partnerName}
          </span>
        </div>
        {!ready[p.meId] ? (
          <Button size="lg" className="mt-5" onClick={() => p.move({ ready: true })} disabled={p.pending}>
            <Zap /> Bereit
          </Button>
        ) : (
          <p className="mt-5 text-sm">Warte auf {p.partnerName}…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <button
        type="button"
        onPointerDown={tap}
        disabled={iTapped || p.room.status !== "active"}
        aria-label={green ? "Jetzt tippen" : "Warten, bis es grün wird"}
        className={cn(
          "grid h-72 w-full touch-manipulation place-items-center rounded-[2rem] text-center transition-colors duration-75 select-none sm:h-80",
          iTapped ? "bg-muted" : green ? "bg-[#4fbf7f] text-white" : "bg-[#e9a3a3] text-[#4a1e1e] dark:bg-[#7a3c3c] dark:text-white",
        )}
      >
        <span>
          <span className="block font-display text-5xl">{iTapped ? (mine === -1 ? "zu früh!" : mine != null ? `${mine} ms` : "✓") : green ? "JETZT!" : "warte…"}</span>
          <span className="mt-2 block text-sm opacity-80">{iTapped ? `Warte auf ${p.partnerName}` : `Runde ${round}`}</span>
        </span>
      </button>
      {lastRound ? (
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          Letzte Runde: du {fmt(lastRound.taps[p.meId])} · {p.partnerName} {fmt(lastRound.taps[p.partnerId])}
          {lastRound.winner ? ` · ${lastRound.winner === p.meId ? "an dich" : `an ${p.partnerName}`}` : " · niemand"}
        </p>
      ) : null}
    </div>
  );
}
