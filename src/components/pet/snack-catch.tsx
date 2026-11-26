"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Mood } from "@/lib/pet/catalog";
import { Mochi2D } from "./mochi-2d";

type Snack = { id: number; x: number; y: number; v: number; emoji: string; pts: number };
type View = { x: number; snacks: Snack[]; score: number; left: number };

const ROUND_MS = 30_000;
const SNACKS = ["🍎", "🍙", "🍡", "🥛", "🍓"];

/**
 * "Snack-Fangen": catch falling snacks with Mochi for 30 seconds.
 * Mouse/touch moves Mochi, so do ← → or the two buttons. The score is sent
 * to the server once, which decides what (if anything) it is worth.
 */
export function SnackCatch({ stage, mood, onFinish }: { stage: number; mood: Mood; onFinish: (score: number) => Promise<Record<string, unknown> | null> }) {
  const area = React.useRef<HTMLDivElement>(null);
  const game = React.useRef({ x: 0.5, snacks: [] as Snack[], score: 0, start: 0, last: 0, spawn: 0, id: 0, dir: 0 });
  const [view, setView] = React.useState<View | null>(null);
  const [phase, setPhase] = React.useState<"idle" | "playing" | "sending" | "done">("idle");
  const [result, setResult] = React.useState<{ score: number; reward: number; left: number } | null>(null);

  const finish = React.useCallback(
    async (score: number) => {
      setPhase("sending");
      const res = await onFinish(score);
      setResult({ score, reward: Number(res?.reward ?? 0), left: Number(res?.paid_rounds_left ?? 0) });
      setPhase("done");
    },
    [onFinish],
  );

  React.useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    const step = (now: number) => {
      const g = game.current;
      const dt = Math.min(50, now - (g.last || now));
      g.last = now;
      const elapsed = now - g.start;
      if (g.dir) g.x = Math.min(0.94, Math.max(0.06, g.x + g.dir * dt * 0.0011));
      // New snack roughly every 650 ms, a little faster over time.
      g.spawn -= dt;
      if (g.spawn <= 0) {
        g.spawn = 650 - Math.min(250, elapsed / 120);
        const star = Math.random() < 0.08;
        g.snacks.push({ id: ++g.id, x: 0.06 + Math.random() * 0.88, y: -0.08, v: 0.00034 + Math.random() * 0.00018 + elapsed / 90_000_000, emoji: star ? "⭐" : SNACKS[g.id % SNACKS.length], pts: star ? 6 : 2 });
      }
      for (const s of g.snacks) s.y += s.v * dt;
      g.snacks = g.snacks.filter((s) => {
        if (s.y > 0.8 && s.y < 0.95 && Math.abs(s.x - g.x) < 0.11) {
          g.score = Math.min(200, g.score + s.pts);
          return false;
        }
        return s.y < 1.08;
      });
      const left = Math.max(0, ROUND_MS - elapsed);
      setView({ x: g.x, snacks: g.snacks.map((s) => ({ ...s })), score: g.score, left });
      if (left <= 0) {
        void finish(g.score);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, finish]);

  const start = () => {
    game.current = { x: 0.5, snacks: [], score: 0, start: performance.now(), last: 0, spawn: 300, id: 0, dir: 0 };
    setResult(null);
    setPhase("playing");
    area.current?.focus();
  };

  const point = (e: React.PointerEvent) => {
    if (phase !== "playing") return;
    const r = area.current!.getBoundingClientRect();
    game.current.x = Math.min(0.94, Math.max(0.06, (e.clientX - r.left) / r.width));
  };
  const key = (e: React.KeyboardEvent, down: boolean) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    game.current.dir = down ? (e.key === "ArrowLeft" ? -1 : 1) : 0;
  };
  const setDir = React.useCallback((dir: number) => {
    game.current.dir = dir;
  }, []);

  return (
    <div className="space-y-3">
      <div
        ref={area}
        tabIndex={0}
        role="application"
        aria-label="Snack-Fangen. Mit den Pfeiltasten links und rechts bewegst du Mochi."
        className="relative h-72 touch-none overflow-hidden rounded-2xl bg-gradient-to-b from-primary-soft to-card outline-none select-none focus-visible:ring-4 focus-visible:ring-ring"
        onPointerMove={point}
        onPointerDown={point}
        onKeyDown={(e) => key(e, true)}
        onKeyUp={(e) => key(e, false)}
      >
        {view && phase === "playing"
          ? view.snacks.map((s) => (
              <span key={s.id} className="absolute -translate-x-1/2 text-2xl" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}>
                {s.emoji}
              </span>
            ))
          : null}
        <div className="absolute bottom-1 w-16 -translate-x-1/2" style={{ left: `${(view?.x ?? 0.5) * 100}%` }}>
          <Mochi2D mood={phase === "playing" ? "happy" : mood === "sleeping" ? "calm" : mood} stage={stage} className="w-16 text-foreground" />
        </div>
        <div className="absolute top-2 right-3 left-3 flex justify-between text-[13px] font-medium tabular-nums">
          <span>{view?.score ?? 0} Punkte</span>
          <span>{phase === "playing" && view ? `${Math.ceil(view.left / 1000)} s` : ""}</span>
        </div>
        {phase !== "playing" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/55 p-4 text-center backdrop-blur-[2px]">
            <div className="space-y-3">
              {result ? (
                <p className="text-[15px]">
                  <span className="font-display text-3xl">{result.score} Punkte</span>
                  <br />
                  {result.reward > 0 ? `+${result.reward} Münzen für euch` : "Heute gibt es keine Münzen mehr dafür (3 Runden pro Tag), aber Mochi hatte Spaß."}
                  {result.reward > 0 ? <span className="block text-[12.5px] text-muted-foreground">Noch {result.left} Runde(n) mit Münzen heute</span> : null}
                </p>
              ) : (
                <p className="max-w-xs text-[14px] text-muted-foreground">30 Sekunden: Fang so viele Snacks wie möglich. ⭐ zählt dreifach.</p>
              )}
              <Button onClick={start} disabled={phase === "sending"}>
                <Play /> {phase === "sending" ? "Wird gezählt…" : result ? "Nochmal" : "Los geht’s"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex justify-center gap-3 sm:hidden">
        <Button variant="soft" size="lg" aria-label="Nach links" onPointerDown={() => setDir(-1)} onPointerUp={() => setDir(0)} onPointerLeave={() => setDir(0)} disabled={phase !== "playing"}>
          <ChevronLeft />
        </Button>
        <Button variant="soft" size="lg" aria-label="Nach rechts" onPointerDown={() => setDir(1)} onPointerUp={() => setDir(0)} onPointerLeave={() => setDir(0)} disabled={phase !== "playing"}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
