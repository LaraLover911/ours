"use client";

import * as React from "react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useApp } from "@/components/providers/app-provider";
import { freshChannel, uniqueTopic } from "@/lib/realtime";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GameRoom = Omit<Database["public"]["Tables"]["game_rooms"]["Row"], "state"> & { state: any };
export type GameMove = Record<string, unknown>;

export type RoomProps = {
  room: GameRoom;
  meId: string;
  partnerId: string;
  partnerName: string;
  move: (m: GameMove, silent?: boolean) => Promise<boolean>;
  pending: boolean;
  /** server time minus local time, in ms */
  offset: number;
};

/**
 * One game room, live. The row is pushed via postgres_changes; on (re)subscribe,
 * on focus and when the network comes back the row is read again, so a dropped
 * connection never leaves a stale board. Rows only replace newer-or-equal versions.
 */
export function useGameRoom(id: string) {
  const { supabase } = useApp();
  const [room, setRoom] = React.useState<GameRoom | null | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [live, setLive] = React.useState(true);
  const [offset, setOffset] = React.useState(0);
  const nudgeRef = React.useRef<RealtimeChannel | null>(null);

  const accept = React.useCallback((next: GameRoom | null) => {
    setRoom((cur) => (next && cur && next.version < cur.version ? cur : next));
  }, []);

  const load = React.useCallback(async () => {
    const { data, error: err } = await supabase.from("game_rooms").select("*").eq("id", id).maybeSingle();
    if (err) return setError(errorMessage(err));
    setError(null);
    accept((data as GameRoom | null) ?? null);
  }, [supabase, id, accept]);

  React.useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load; state is set when the request resolves
    void load();
    channel = supabase
      .channel(uniqueTopic(`ours:game:${id}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${id}` }, (payload) => {
        if (payload.eventType === "DELETE") return accept(null);
        accept(payload.new as GameRoom);
      })
      .subscribe((status) => {
        if (!alive) return;
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void load(); // catch up on anything missed while disconnected
      });
    // Fast path: after a move the mover pings "version N" over broadcast and the
    // partner reads the row right away (postgres_changes can lag a few hundred ms).
    // The ping carries no game data; the row always comes from the database.
    let nudge: RealtimeChannel | null = null;
    void freshChannel(supabase, `ours:game-nudge:${id}`, { config: { broadcast: { self: false } } }).then((c) => {
      if (!alive) return void supabase.removeChannel(c);
      nudge = c.on("broadcast", { event: "moved" }, () => void load()).subscribe();
      nudgeRef.current = nudge;
    });
    const refresh = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      if (channel) void supabase.removeChannel(channel);
      if (nudge) void supabase.removeChannel(nudge);
      nudgeRef.current = null;
    };
  }, [supabase, id, load, accept]);

  // Server clock offset (Reaction Battle needs to know when "GO" really is).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const { data } = await supabase.rpc("game_clock");
        const t1 = Date.now();
        if (data) samples.push(new Date(data).getTime() - (t0 + t1) / 2);
      }
      samples.sort((a, b) => a - b);
      if (alive && samples.length) setOffset(samples[Math.floor(samples.length / 2)]);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const run = React.useCallback(
    async (fn: () => PromiseLike<{ error: unknown }>, silent = false) => {
      setPending(true);
      try {
        const { error: err } = await fn();
        if (err) {
          if (!silent) toast.error(errorMessage(err));
          return false;
        }
        void nudgeRef.current?.send({ type: "broadcast", event: "moved", payload: {} });
        await load();
        return true;
      } finally {
        setPending(false);
      }
    },
    [load],
  );

  const move = React.useCallback(
    (m: GameMove, silent = false) => run(() => supabase.rpc("game_move", { p_room: id, p_move: m as never }), silent),
    [run, supabase, id],
  );
  const acceptInvite = React.useCallback(() => run(() => supabase.rpc("game_accept", { p_room: id })), [run, supabase, id]);
  const leave = React.useCallback(() => run(() => supabase.rpc("game_leave", { p_room: id })), [run, supabase, id]);

  return { room, error, pending, live, offset, move, acceptInvite, leave, reload: load };
}
