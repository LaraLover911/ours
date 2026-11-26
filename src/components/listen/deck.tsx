"use client";

import * as React from "react";
import { Headphones, Loader2 } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SpotifyEmbedPlayer, SpotifySdkPlayer, YouTubePlayer, type Player } from "@/lib/listen/players";
import { decide, targetPosition } from "@/lib/listen/sync";
import type { ListenRoom, QueueItem } from "./use-listen-room";

export type DeckStatus = { drift: number | null; state: string; preview: boolean; error: string | null; kind: Player["kind"] | null };

/**
 * The local player for the current item, kept in step with the room clock.
 * Sound needs one tap ("Mithören") because browsers block autoplay.
 */
export function Deck({
  room,
  item,
  offset,
  useSdk,
  onEnded,
  onStatus,
}: {
  room: ListenRoom;
  item: QueueItem | null;
  offset: number;
  useSdk: boolean;
  onEnded: (itemId: string) => void;
  onStatus: (s: DeckStatus) => void;
}) {
  const { supabase } = useApp();
  const ytHost = React.useRef<HTMLDivElement>(null);
  const spHost = React.useRef<HTMLDivElement>(null);
  const players = React.useRef<{ yt?: YouTubePlayer; embed?: SpotifyEmbedPlayer; sdk?: SpotifySdkPlayer }>({});
  const loaded = React.useRef<{ item: string | null; player: Player | null }>({ item: null, player: null });
  const endedFor = React.useRef<string | null>(null);
  const [joined, setJoined] = React.useState(false);
  const [pstate, setPState] = React.useState<string>("idle");
  const errorRef = React.useRef<string | null>(null);
  const roomRef = React.useRef(room);
  const itemRef = React.useRef(item);
  React.useEffect(() => {
    roomRef.current = room;
    itemRef.current = item;
  });

  const offsetRef = React.useRef(offset);
  const statusRef = React.useRef(onStatus);
  React.useEffect(() => {
    offsetRef.current = offset;
    statusRef.current = onStatus;
  });

  // Called by the players (and a timer): publish the real local status.
  const bump = React.useCallback(() => {
    const p = loaded.current.player;
    const it = itemRef.current;
    const pos = p?.position() ?? null;
    const st = p?.state() ?? "idle";
    const drift = p && it && pos != null && st === "playing" ? Math.abs(pos - targetPosition(roomRef.current, Date.now(), offsetRef.current, it.duration_ms)) : null;
    setPState(st);
    statusRef.current({ drift, state: st, preview: p?.previewOnly?.() ?? false, error: errorRef.current, kind: p?.kind ?? null });
  }, []);

  const playerFor = React.useCallback(
    (it: QueueItem): Player => {
      const p = players.current;
      if (it.provider === "youtube") return (p.yt ??= new YouTubePlayer(ytHost.current!, bump));
      if (useSdk) return (p.sdk ??= new SpotifySdkPlayer(bump));
      return (p.embed ??= new SpotifyEmbedPlayer(spHost.current!, bump, it.ref));
    },
    [useSdk, bump],
  );

  React.useEffect(
    () => () => {
      const p = players.current;
      p.yt?.destroy();
      p.embed?.destroy();
      p.sdk?.destroy();
      players.current = {};
    },
    [],
  );

  // The sync loop: load the current item, then follow the clock.
  React.useEffect(() => {
    if (!joined) return;
    let busy = false;
    const step = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = roomRef.current;
        const it = itemRef.current;
        if (!it) {
          if (loaded.current.player && loaded.current.player.state() === "playing") await loaded.current.player.pause();
          return;
        }
        const target = targetPosition(r, Date.now(), offset, it.duration_ms);
        if (loaded.current.item !== it.id) {
          const prev = loaded.current.player;
          const next = playerFor(it);
          if (prev && prev !== next && prev.state() === "playing") await prev.pause();
          loaded.current = { item: it.id, player: next };
          endedFor.current = null;
          await next.load(it.ref, target, r.status === "playing");
          return;
        }
        const p = loaded.current.player!;
        if (p.state() === "loading") return;
        // Learn the real length once (Spotify previews are only 30 s, so ignore those).
        const d = p.duration();
        if (!it.duration_ms && d && (it.provider === "youtube" || d > 31_000)) {
          void supabase.rpc("listen_set_duration", { p_item: it.id, p_ms: d });
        }
        for (const a of decide({ room: r, target, position: p.position(), playing: p.state() === "playing", durationMs: it.duration_ms })) {
          if (a.type === "ended") {
            if (endedFor.current !== it.id) {
              endedFor.current = it.id;
              onEnded(it.id);
            }
          } else if (a.type === "seek") await p.seek(a.ms);
          else if (a.type === "play" && p.state() !== "blocked") await p.play();
          else if (a.type === "pause") await p.pause();
        }
        if (p.state() === "ended" && r.status === "playing" && !it.duration_ms && endedFor.current !== it.id) {
          endedFor.current = it.id;
          onEnded(it.id);
        }
        errorRef.current = null;
      } catch (e) {
        errorRef.current = e instanceof Error ? e.message : "Player-Fehler";
        bump();
      } finally {
        busy = false;
      }
    };
    void step();
    const t = window.setInterval(step, 1000);
    return () => window.clearInterval(t);
  }, [joined, offset, playerFor, onEnded, supabase, room.version, item?.id, bump]);

  React.useEffect(() => {
    if (!joined) return;
    const t = window.setInterval(bump, 2000);
    return () => window.clearInterval(t);
  }, [joined, bump]);

  const state = pstate;
  const needsTap = !joined || state === "blocked";
  const showYt = item?.provider === "youtube";
  const showEmbed = item?.provider === "spotify" && !useSdk;

  return (
    <div className="relative">
      <div className={cn("relative aspect-video w-full overflow-hidden rounded-2xl bg-black/90", !showYt && "hidden")}>
        <div ref={ytHost} className="absolute inset-0 [&>iframe]:size-full" />
      </div>
      <div ref={spHost} className={cn("overflow-hidden rounded-2xl", !showEmbed && "hidden")} />
      {item?.provider === "spotify" && useSdk ? (
        <div className="grid h-24 place-items-center rounded-2xl bg-[#1db954]/10 text-[13px] text-muted-foreground">Spielt über Spotify auf diesem Gerät („ours. Listen Together“)</div>
      ) : null}
      {needsTap && item ? (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-background/80 backdrop-blur-sm">
          <Button
            size="lg"
            onClick={async () => {
              setJoined(true);
              const p = loaded.current.player;
              if (p && state === "blocked" && roomRef.current.status === "playing") await p.play();
              bump();
            }}
          >
            <Headphones /> {state === "blocked" ? "Tippen, um den Ton zu starten" : "Mithören"}
          </Button>
        </div>
      ) : null}
      {joined && state === "loading" ? (
        <div className="absolute top-2 right-2 z-10 rounded-full bg-background/80 p-1.5">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : null}
    </div>
  );
}
