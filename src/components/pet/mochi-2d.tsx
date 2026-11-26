"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { clamp, type Mood } from "@/lib/pet/catalog";
import type { Furniture, PetItem } from "./use-pet";

/** Flat Mochi for the 2D view and the mini game. */
export function Mochi2D({ mood, stage, className }: { mood: Mood; stage: number; className?: string }) {
  const closed = mood === "sleeping";
  const smile = mood === "happy" || mood === "missed_you";
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={`Mochi, ${mood}`}>
      <ellipse cx="60" cy="108" rx="38" ry="6" fill="currentColor" opacity="0.12" />
      <path d="M60 20v14" stroke="#6fa36b" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="68" cy="24" rx="8" ry="4" transform="rotate(-30 68 24)" fill="#7fb879" />
      {stage >= 1 ? <ellipse cx="52" cy="25" rx="8" ry="4" transform="rotate(30 52 25)" fill="#7fb879" /> : null}
      {stage === 2 ? <circle cx="60" cy="16" r="5" fill="#f28fb0" /> : null}
      {stage >= 3 ? (
        <g>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={60 + Math.cos((a * Math.PI) / 180) * 6} cy={16 + Math.sin((a * Math.PI) / 180) * 6} r="4.5" fill="#f7b6cb" />
          ))}
          <circle cx="60" cy="16" r="3.5" fill="#ffd166" />
        </g>
      ) : null}
      <path d="M14 82c0-28 20-48 46-48s46 20 46 48c0 14-10 22-24 22H38c-14 0-24-8-24-22z" fill="#fff3f0" stroke="#ead6d6" strokeWidth="1.5" />
      {closed || smile ? (
        <g stroke="#3b2a33" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d={closed ? "M38 68q6 5 12 0" : "M38 70q6-7 12 0"} />
          <path d={closed ? "M70 68q6 5 12 0" : "M70 70q6-7 12 0"} />
        </g>
      ) : (
        <g fill="#3b2a33">
          <ellipse cx="44" cy="68" rx="5" ry={mood === "sleepy" || mood === "bored" ? 3 : 6} />
          <ellipse cx="76" cy="68" rx="5" ry={mood === "sleepy" || mood === "bored" ? 3 : 6} />
          <circle cx="46" cy="65" r="1.6" fill="#fff" />
          <circle cx="78" cy="65" r="1.6" fill="#fff" />
        </g>
      )}
      <ellipse cx="33" cy="80" rx="7" ry="4" fill="#f6a9bd" opacity="0.85" />
      <ellipse cx="87" cy="80" rx="7" ry="4" fill="#f6a9bd" opacity="0.85" />
      {mood === "hungry" ? (
        <ellipse cx="60" cy="81" rx="4" ry="5" fill="#8d3a52" />
      ) : mood === "bored" || mood === "sleepy" ? (
        <path d="M55 81h10" stroke="#3b2a33" strokeWidth="2.5" strokeLinecap="round" />
      ) : (
        <path d="M54 79q6 6 12 0" stroke="#3b2a33" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
      {mood === "messy" ? (
        <g fill="#a88a72">
          <circle cx="86" cy="56" r="3" />
          <circle cx="30" cy="92" r="2.5" />
          <circle cx="68" cy="96" r="2.5" />
        </g>
      ) : null}
    </svg>
  );
}

/**
 * Floor plan of one room (seen from above). Pieces can be dragged with mouse or
 * touch; the panel next to it offers buttons and arrow keys as an alternative.
 */
export function FloorPlan({
  furniture,
  items,
  editing,
  selected,
  onSelect,
  onMove,
  floor,
  children,
}: {
  furniture: Furniture[];
  items: PetItem[];
  editing: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (f: Furniture, x: number, z: number) => void;
  floor: string;
  children?: React.ReactNode;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<{ id: string; x: number; z: number } | null>(null);
  const toRoom = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), z: clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1) };
  };
  return (
    <div
      ref={box}
      className="absolute inset-0"
      style={{ background: floor, touchAction: editing ? "none" : "pan-y" }}
      onPointerDown={(e) => e.target === e.currentTarget && onSelect(null)}
    >
      {children}
      {furniture.map((f) => {
        const it = items.find((i) => i.id === f.item_id);
        const x = drag?.id === f.id ? drag.x : Number(f.x);
        const z = drag?.id === f.id ? drag.z : Number(f.z);
        return (
          <button
            key={f.id}
            type="button"
            aria-label={`${it?.name ?? f.item_id}${editing ? ", ziehen zum Verschieben" : ""}`}
            aria-pressed={selected === f.id}
            disabled={!editing}
            className={cn(
              "absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl text-2xl select-none disabled:cursor-default",
              editing && "cursor-grab bg-white/40 ring-1 ring-white/70 active:cursor-grabbing",
              selected === f.id && "ring-2 ring-primary",
            )}
            style={{ left: `${(x + 1) * 50}%`, top: `${(z + 1) * 50}%`, rotate: `${f.rot}deg` }}
            onPointerDown={(e) => {
              if (!editing) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              onSelect(f.id);
              setDrag({ id: f.id, x: Number(f.x), z: Number(f.z) });
            }}
            onPointerMove={(e) => drag?.id === f.id && setDrag({ id: f.id, ...toRoom(e) })}
            onPointerUp={() => {
              if (drag?.id !== f.id) return;
              if (Math.abs(drag.x - Number(f.x)) + Math.abs(drag.z - Number(f.z)) > 0.01) onMove(f, drag.x, drag.z);
              setDrag(null);
            }}
          >
            {it?.emoji ?? "▫️"}
          </button>
        );
      })}
    </div>
  );
}
