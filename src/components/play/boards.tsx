"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { MEMORY_FACES } from "@/lib/games/catalog";
import type { RoomProps } from "./use-game-room";

const myTurn = (p: RoomProps) => p.room.status === "active" && p.room.turn === p.meId && !p.pending;

/* ---------------- Tic Tac Toe ---------------- */
export function TicTacToe(p: RoomProps) {
  const s = p.room.state;
  const board: string = s.board;
  const line: number[] = s.line ?? [];
  const mine = s.x === p.meId ? "X" : "O";
  return (
    <div className="mx-auto grid w-full max-w-[22rem] grid-cols-3 gap-2" role="grid" aria-label="Tic Tac Toe">
      {board.split("").map((c, i) => (
        <button
          key={i}
          type="button"
          disabled={!myTurn(p) || c !== "."}
          onClick={() => p.move({ cell: i })}
          aria-label={`Feld ${i + 1}${c === "." ? ", frei" : `, ${c}`}`}
          className={cn(
            "grid aspect-square place-items-center rounded-2xl border border-border bg-card text-5xl font-display transition-colors sm:text-6xl",
            c === "." && myTurn(p) && "hover:bg-primary-soft",
            line.includes(i) && "border-primary bg-primary-soft",
            s.last === i && !line.includes(i) && "ring-2 ring-primary/30",
          )}
        >
          {c !== "." ? (
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={c === mine ? "text-primary" : "text-foreground/70"}>
              {c === "X" ? "×" : "○"}
            </motion.span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Connect Four ---------------- */
export function ConnectFour(p: RoomProps) {
  const s = p.room.state;
  const board: string = s.board;
  const line: number[] = s.line ?? [];
  const mine = s.red === p.meId ? "R" : "Y";
  const disc = (c: string) => (c === "R" ? "bg-primary" : c === "Y" ? "bg-[#f2b84b]" : "bg-muted");
  return (
    <div className="mx-auto w-full max-w-[28rem]">
      <div className="mb-3 flex items-center justify-center gap-4 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-full", disc(mine))} /> du
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-full", disc(mine === "R" ? "Y" : "R"))} /> {p.partnerName}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 rounded-3xl bg-primary-soft/60 p-2 sm:gap-2 sm:p-3">
        {Array.from({ length: 7 }, (_, col) => (
          <button
            key={col}
            type="button"
            disabled={!myTurn(p) || board[col] !== "."}
            onClick={() => p.move({ col })}
            aria-label={`Spalte ${col + 1}`}
            className="group flex flex-col gap-1.5 rounded-2xl p-0.5 transition-colors enabled:hover:bg-card/60 sm:gap-2"
          >
            {Array.from({ length: 6 }, (_, row) => {
              const i = row * 7 + col;
              const c = board[i];
              return (
                <span key={row} className="relative grid aspect-square place-items-center rounded-full bg-background/80">
                  {c !== "." ? (
                    <motion.span
                      initial={s.last === i ? { y: -40 * (row + 1), opacity: 0.6 } : false}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 26 }}
                      className={cn("absolute inset-[6%] rounded-full", disc(c), line.includes(i) && "ring-4 ring-foreground/60")}
                    />
                  ) : null}
                </span>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Memory ---------------- */
export function Memory(p: RoomProps) {
  const s = p.room.state;
  const cards: (number | null)[] = s.cards;
  const owner: (string | null)[] = s.owner;
  const open: number[] = s.open ?? [];
  const mismatch = open.length === 2;
  return (
    <div className="mx-auto grid w-full max-w-[26rem] grid-cols-4 gap-2">
      {cards.map((c, i) => {
        const faceUp = c !== null;
        const found = owner[i];
        return (
          <button
            key={i}
            type="button"
            disabled={!myTurn(p) || !!found || (open.includes(i) && !mismatch)}
            onClick={() => p.move({ card: i })}
            aria-label={faceUp ? `Karte ${i + 1}: ${MEMORY_FACES[c] ?? "?"}` : `Karte ${i + 1}, verdeckt`}
            className={cn(
              "grid aspect-[3/4] place-items-center rounded-2xl border text-4xl transition-all [perspective:600px]",
              faceUp ? "border-border bg-card" : "border-transparent bg-gradient-to-br from-primary/80 to-primary text-primary-foreground",
              found && (found === p.meId ? "ring-2 ring-primary" : "ring-2 ring-[#f2b84b]"),
              found && "opacity-80",
              mismatch && open.includes(i) && "ring-2 ring-danger/50",
            )}
          >
            <motion.span key={faceUp ? `u${c}` : "d"} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ duration: 0.2 }}>
              {faceUp ? MEMORY_FACES[c] : <span className="text-xl opacity-70">♡</span>}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
