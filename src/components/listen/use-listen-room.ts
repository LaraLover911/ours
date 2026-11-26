"use client";

import * as React from "react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useApp } from "@/components/providers/app-provider";
import { freshChannel, uniqueTopic } from "@/lib/realtime";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

export type ListenRoom = Database["public"]["Tables"]["listening_rooms"]["Row"];
export type QueueItem = Database["public"]["Tables"]["listening_queue"]["Row"];
export type Reaction = { id: string; emoji: string; from: string };

/**
 * One Listen Together room, live: the room row (the shared clock), its queue,
 * who is here right now (Realtime Presence) and ephemeral reactions (broadcast).
 */
export function useListenRoom(id: string) {
  const { supabase, me } = useApp();
  const [room, setRoom] = React.useState<ListenRoom | null | undefined>(undefined);
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [here, setHere] = React.useState<string[]>([]);
  const [reactions, setReactions] = React.useState<Reaction[]>([]);
  const [offset, setOffset] = React.useState(0);
  const [live, setLive] = React.useState(true);
  const shared = React.useRef<RealtimeChannel | null>(null);

  const load = React.useCallback(async () => {
    const [r, q] = await Promise.all([
      supabase.from("listening_rooms").select("*").eq("id", id).maybeSingle(),
      supabase.from("listening_queue").select("*").eq("room_id", id).order("sort"),
    ]);
    if (r.error) return toast.error(errorMessage(r.error));
    setRoom((cur) => (r.data && cur && r.data.version < cur.version ? cur : (r.data ?? null)));
    if (!q.error) setQueue(q.data ?? []);
  }, [supabase, id]);

  const addReaction = React.useCallback((r: Reaction) => {
    setReactions((x) => [...x.slice(-12), r]);
    window.setTimeout(() => setReactions((x) => x.filter((y) => y.id !== r.id)), 2600);
  }, []);

  React.useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load; state is set when the request resolves
    void load();
    const db = supabase
      .channel(uniqueTopic(`ours:listen-db:${id}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "listening_rooms", filter: `id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "listening_queue", filter: `room_id=eq.${id}` }, () => void load())
      .subscribe((s) => {
        if (!alive) return;
        setLive(s === "SUBSCRIBED");
        if (s === "SUBSCRIBED") void load();
      });
    let ch: RealtimeChannel | null = null;
    void freshChannel(supabase, `ours:listen:${id}`, { config: { broadcast: { self: false }, presence: { key: me.id } } }).then((c) => {
      if (!alive) return void supabase.removeChannel(c);
      ch = c
        .on("broadcast", { event: "changed" }, () => void load())
        .on("broadcast", { event: "react" }, ({ payload }) => {
          const p = payload as Partial<Reaction>;
          if (typeof p.emoji === "string" && p.emoji.length <= 8) addReaction({ id: crypto.randomUUID(), emoji: p.emoji, from: String(p.from ?? "") });
        })
        .on("presence", { event: "sync" }, () => setHere(Object.keys(c.presenceState())))
        .subscribe((s) => {
          if (s === "SUBSCRIBED") void c.track({ at: Date.now() });
        });
      shared.current = ch;
    });
    void supabase.rpc("listen_touch_room", { p_room: id });
    const refresh = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(db);
      if (ch) void supabase.removeChannel(ch);
      shared.current = null;
    };
  }, [supabase, id, me.id, load, addReaction]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
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

  const after = React.useCallback(
    async (res: PromiseLike<{ error: unknown }>, quiet = false) => {
      const { error } = await res;
      if (error) {
        if (!quiet) toast.error(errorMessage(error));
        return false;
      }
      void shared.current?.send({ type: "broadcast", event: "changed", payload: {} });
      await load();
      return true;
    },
    [load],
  );

  const control = React.useCallback(
    (action: "play" | "pause" | "seek" | "next" | "ended" | "jump", opts: { pos?: number; expect?: string | null; item?: string } = {}) =>
      after(
        supabase.rpc("listen_control", {
          p_room: id,
          p_action: action,
          p_pos_ms: opts.pos != null ? Math.round(opts.pos) : undefined,
          p_expect: opts.expect ?? undefined,
          p_item: opts.item,
        }),
        action === "ended",
      ),
    [after, supabase, id],
  );

  const react = React.useCallback(
    (emoji: string) => {
      addReaction({ id: crypto.randomUUID(), emoji, from: me.id });
      void shared.current?.send({ type: "broadcast", event: "react", payload: { emoji, from: me.id } });
    },
    [addReaction, me.id],
  );

  return { room, queue, here, reactions, offset, live, load, after, control, react };
}
