"use client";

import * as React from "react";
import { Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PIECES, isWhite, legalTargets } from "@/lib/games/chess";
import type { RoomProps } from "./use-game-room";

const FILES = "abcdefgh";

export function ChessBoard(p: RoomProps) {
  const s = p.room.state;
  const board: string = s.board;
  const white = s.white === p.meId;
  const myColor = white ? "w" : "b";
  const canMove = p.room.status === "active" && p.room.turn === p.meId && !p.pending;
  const [sel, setSel] = React.useState<number | null>(null);
  const [promo, setPromo] = React.useState<{ from: number; to: number } | null>(null);
  const last: number[] = s.last ?? [];
  const kingInCheck = s.check ? board.indexOf(s.color === "w" ? "K" : "k") : -1;

  // Reset the selection whenever the position changes.
  const [seenVersion, setSeenVersion] = React.useState(p.room.version);
  if (seenVersion !== p.room.version) {
    setSeenVersion(p.room.version);
    setSel(null);
    setPromo(null);
  }

  const targets = React.useMemo(() => (sel == null ? [] : legalTargets(board, sel, s.castling, s.ep)), [board, sel, s.castling, s.ep]);
  const order = Array.from({ length: 64 }, (_, i) => (white ? i : 63 - i));

  const tap = (sq: number) => {
    if (!canMove) return;
    const piece = board[sq];
    if (sel != null && targets.includes(sq)) {
      const moving = board[sel];
      if (moving.toUpperCase() === "P" && (sq < 8 || sq >= 56)) return setPromo({ from: sel, to: sq });
      void p.move({ from: sel, to: sq });
      return;
    }
    if (piece !== "." && isWhite(piece) === white) setSel(sq === sel ? null : sq);
    else setSel(null);
  };

  const moves: string[] = s.moves ?? [];
  const offer = s.draw_offer as string | undefined;

  return (
    <div className="mx-auto grid w-full max-w-[44rem] gap-5 md:grid-cols-[minmax(0,1fr)_11rem]">
      <div className="min-w-0">
        <div className="relative grid aspect-square w-full grid-cols-8 overflow-hidden rounded-2xl border border-border shadow-soft" role="grid" aria-label="Schachbrett">
          {order.map((sq) => {
            const r = Math.floor(sq / 8), c = sq % 8;
            const dark = (r + c) % 2 === 1;
            const piece = board[sq];
            const isTarget = targets.includes(sq);
            return (
              <button
                key={sq}
                type="button"
                onClick={() => tap(sq)}
                aria-label={`${FILES[c]}${8 - r}${piece !== "." ? `, ${piece}` : ""}`}
                className={cn(
                  "relative grid aspect-square place-items-center text-[min(9vw,2.6rem)] leading-none select-none",
                  dark ? "bg-[#c99aa9] dark:bg-[#6e4d58]" : "bg-[#f7e9ee] dark:bg-[#a98591]",
                  last.includes(sq) && "after:absolute after:inset-0 after:bg-[#f2d46b]/45",
                  sel === sq && "after:absolute after:inset-0 after:bg-primary/35",
                  kingInCheck === sq && "after:absolute after:inset-0 after:bg-danger/45",
                )}
              >
                {piece !== "." ? (
                  <span className={cn("relative z-10", isWhite(piece) ? "text-white [text-shadow:0_0_1px_#3b2128,0_0_1px_#3b2128,0_1px_3px_rgba(0,0,0,.55)]" : "text-[#2b1a20]")}>{PIECES[piece]}</span>
                ) : null}
                {isTarget ? (
                  <span className={cn("absolute z-20 rounded-full", piece === "." ? "size-[28%] bg-foreground/25" : "inset-[6%] border-4 border-foreground/30")} />
                ) : null}
                {(white ? r === 7 : r === 0) ? <span className="absolute bottom-0.5 left-1 z-10 text-[9px] opacity-60">{FILES[c]}</span> : null}
                {(white ? c === 0 : c === 7) ? <span className="absolute top-0.5 left-1 z-10 text-[9px] opacity-60">{8 - r}</span> : null}
              </button>
            );
          })}
          {promo ? (
            <div className="absolute inset-0 z-30 grid place-items-center bg-background/70 backdrop-blur-sm">
              <div className="card-surface flex gap-2 p-3" role="dialog" aria-label="Umwandlung">
                {["q", "r", "b", "n"].map((x) => (
                  <button
                    key={x}
                    type="button"
                    className="grid size-14 place-items-center rounded-xl border border-border bg-card text-4xl hover:bg-muted"
                    onClick={() => {
                      void p.move({ from: promo.from, to: promo.to, promo: x });
                      setPromo(null);
                    }}
                    aria-label={{ q: "Dame", r: "Turm", b: "Läufer", n: "Springer" }[x]}
                  >
                    {PIECES[white ? x.toUpperCase() : x]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-center text-[13px] text-muted-foreground">
          Du spielst {white ? "Weiß" : "Schwarz"}
          {s.check && p.room.status === "active" ? (s.color === myColor ? " · du stehst im Schach!" : " · Schach!") : ""}
        </p>
      </div>
      <aside className="min-w-0 space-y-3">
        {p.room.status === "active" ? (
          offer && offer !== p.meId ? (
            <div className="rounded-2xl border border-primary/40 bg-primary-soft p-3 text-[13px]">
              <p className="mb-2">{p.partnerName} bietet Remis an.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => p.move({ answer_draw: true })} disabled={p.pending}>
                  Annehmen
                </Button>
                <Button size="sm" variant="outline" onClick={() => p.move({ answer_draw: false })} disabled={p.pending}>
                  Nein
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full" disabled={p.pending || offer === p.meId} onClick={() => p.move({ offer_draw: true })}>
              <Handshake /> {offer === p.meId ? "Remis angeboten" : "Remis anbieten"}
            </Button>
          )
        ) : null}
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="eyebrow mb-2">Züge</p>
          {moves.length ? (
            <ol className="grid max-h-56 grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 overflow-y-auto font-mono text-[12px]">
              {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
                <React.Fragment key={i}>
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span>{moves[i * 2]}</span>
                  <span>{moves[i * 2 + 1] ?? ""}</span>
                </React.Fragment>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted-foreground">Noch keine Züge.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
