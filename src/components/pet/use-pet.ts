"use client";

import * as React from "react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useApp } from "@/components/providers/app-provider";
import { freshChannel, uniqueTopic } from "@/lib/realtime";
import { errorMessage } from "@/lib/utils/errors";
import { clamp, type Cue, type Mood, type RoomId, type Stats } from "@/lib/pet/catalog";
import type { Database } from "@/types/database";

type T = Database["public"]["Tables"];
export type Pet = T["pets"]["Row"];
export type PetItem = T["pet_items"]["Row"] & { effect: Record<string, number | string> };
export type InventoryRow = T["pet_inventory"]["Row"];
export type HouseRow = T["pet_house"]["Row"] & { room: RoomId };
export type Furniture = T["pet_furniture"]["Row"] & { room: RoomId };
export type Quest = T["pet_quests"]["Row"];
export type Achievement = T["pet_achievements"]["Row"];
export type PetEvent = T["pet_events"]["Row"] & { data: Record<string, unknown> };

export type PetState = { pet: Pet; stats: Stats; mood: Mood; bond: { points: number; level: number }; away_hours: number; server_time: string };

export type PetData = {
  state: PetState;
  items: PetItem[];
  inventory: InventoryRow[];
  house: HouseRow[];
  furniture: Furniture[];
  quests: Quest[];
  achievements: Achievement[];
  events: PetEvent[];
  evolution: T["pet_evolution"]["Row"][];
};

/**
 * Mochi, live. Everything is decided on the server (pet_* functions); the UI only
 * shows the result right away (optimistic) and rolls back if the server says no.
 * Every change bumps pets.version, which is pushed via Realtime, plus a broadcast
 * nudge for the partner so their screen follows within a moment.
 */
export function usePet() {
  const { supabase, me } = useApp();
  const [data, setData] = React.useState<PetData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cue, setCue] = React.useState<Cue | null>(null);
  const [busy, setBusy] = React.useState(false);
  const dataRef = React.useRef<PetData | null>(null);
  const lastEvent = React.useRef<number | null>(null);
  const nudge = React.useRef<RealtimeChannel | null>(null);

  const commit = React.useCallback((next: PetData | null) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const load = React.useCallback(async () => {
    const [st, items, inv, house, furn, quests, ach, ev, evo] = await Promise.all([
      supabase.rpc("pet_state"),
      supabase.from("pet_items").select("*").order("sort"),
      supabase.from("pet_inventory").select("*"),
      supabase.from("pet_house").select("*"),
      supabase.from("pet_furniture").select("*").order("placed_at"),
      supabase.from("pet_quests").select("*").eq("user_id", me.id).order("day", { ascending: false }).limit(10),
      supabase.from("pet_achievements").select("*"),
      supabase.from("pet_events").select("*").order("created_at", { ascending: false }).limit(25),
      supabase.from("pet_evolution").select("*").order("stage"),
    ]);
    const err = st.error ?? items.error ?? inv.error ?? house.error ?? furn.error ?? quests.error ?? ach.error ?? ev.error ?? evo.error;
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setError(null);
    const state = st.data as unknown as PetState;
    const cur = dataRef.current;
    // Never step back to an older snapshot than one we already have.
    if (cur && state.pet.version < cur.state.pet.version) return;
    const q = (quests.data ?? []) as Quest[];
    const today = q[0]?.day;
    const events = (ev.data ?? []) as PetEvent[];
    // A new event by the partner: let Mochi react to it, too.
    const newest = events[0];
    if (newest && lastEvent.current != null && newest.id > lastEvent.current && newest.actor !== me.id) {
      setCue({ kind: newest.kind, at: Date.now(), by: newest.actor });
    }
    if (newest) lastEvent.current = Math.max(lastEvent.current ?? 0, newest.id);
    else lastEvent.current ??= 0;
    commit({
      state,
      items: (items.data ?? []) as PetItem[],
      inventory: inv.data ?? [],
      house: (house.data ?? []) as HouseRow[],
      furniture: (furn.data ?? []) as Furniture[],
      quests: q.filter((x) => x.day === today),
      achievements: ach.data ?? [],
      events,
      evolution: evo.data ?? [],
    });
  }, [supabase, me.id, commit]);

  React.useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 120);
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load; state is set when the request resolves
    void load();
    const db = supabase
      .channel(uniqueTopic("ours:pet-db"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pets" }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "pet_furniture" }, soon)
      .subscribe((s) => s === "SUBSCRIBED" && soon());
    let ch: RealtimeChannel | null = null;
    void freshChannel(supabase, "ours:pet", { config: { broadcast: { self: false } } }).then((c) => {
      if (!alive) return void supabase.removeChannel(c);
      ch = c.on("broadcast", { event: "changed" }, soon).subscribe();
      nudge.current = ch;
    });
    // Needs change with time (decay is computed by the server): read them again every minute.
    const tick = window.setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    const onVis = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", soon);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", soon);
      void supabase.removeChannel(db);
      if (ch) void supabase.removeChannel(ch);
      nudge.current = null;
    };
  }, [supabase, load]);

  /** Optimistic call: show `guess` now, keep the server's answer, or roll back. */
  const run = React.useCallback(
    async (guess: ((d: PetData) => PetData) | null, call: PromiseLike<{ data: unknown; error: unknown }>, opts: { cue?: string } = {}) => {
      const before = dataRef.current;
      if (before && guess) commit(guess(before));
      if (opts.cue) setCue({ kind: opts.cue, at: Date.now(), by: me.id });
      setBusy(true);
      const { data: res, error: err } = await call;
      setBusy(false);
      if (err) {
        if (before && guess) commit(before);
        toast.error(errorMessage(err));
        void load();
        return null;
      }
      const cur = dataRef.current;
      if (cur && res && typeof res === "object" && "pet" in res) commit({ ...cur, state: res as PetState });
      void nudge.current?.send({ type: "broadcast", event: "changed", payload: {} });
      void load();
      return res as Record<string, unknown> | null;
    },
    [commit, load, me.id],
  );

  const itemById = React.useCallback((id: string) => dataRef.current?.items.find((i) => i.id === id), []);

  const act = React.useCallback(
    (action: "feed" | "play" | "clean" | "pet" | "sleep" | "wake", item?: string) => {
      const it = item ? itemById(item) : undefined;
      const eff = (it?.effect ?? (action === "pet" ? { joy: 6 } : {})) as Record<string, number>;
      return run(
        (d) => {
          const s = d.state.stats;
          const stats: Stats = {
            hunger: clamp(s.hunger + (Number(eff.hunger) || 0)),
            energy: clamp(s.energy + (Number(eff.energy) || 0)),
            joy: clamp(s.joy + (Number(eff.joy) || 0)),
            clean: clamp(s.clean + (Number(eff.clean) || 0)),
          };
          const sleeping = action === "sleep" ? true : action === "wake" ? false : d.state.pet.sleeping;
          const inventory = action === "feed" || action === "clean" ? d.inventory.map((r) => (r.item_id === item ? { ...r, qty: Math.max(0, r.qty - 1) } : r)) : d.inventory;
          return {
            ...d,
            inventory,
            state: { ...d.state, stats, pet: { ...d.state.pet, sleeping }, mood: sleeping ? "sleeping" : d.state.mood === "sleeping" ? "calm" : d.state.mood },
          };
        },
        supabase.rpc("pet_act", { p_action: action, p_item: item }),
        { cue: action },
      );
    },
    [run, supabase, itemById],
  );

  const buy = React.useCallback(
    (item: string) => {
      const it = itemById(item);
      return run(
        (d) => {
          if (!it) return d;
          const has = d.inventory.some((r) => r.item_id === item);
          return {
            ...d,
            state: { ...d.state, pet: { ...d.state.pet, coins: d.state.pet.coins - it.price } },
            house: it.kind === "room" ? d.house.map((h) => (h.room === it.effect.room ? { ...h, unlocked: true } : h)) : d.house,
            inventory:
              it.kind === "room"
                ? d.inventory
                : has
                  ? d.inventory.map((r) => (r.item_id === item ? { ...r, qty: r.qty + 1 } : r))
                  : [...d.inventory, { pet_id: d.state.pet.id, item_id: item, qty: 1 }],
          };
        },
        supabase.rpc("pet_buy", { p_item: item, p_qty: 1 }),
        { cue: "buy" },
      );
    },
    [run, supabase, itemById],
  );

  const place = React.useCallback(
    (item: string, room: RoomId, x: number, z: number) =>
      run(
        (d) => ({
          ...d,
          inventory: d.inventory.map((r) => (r.item_id === item ? { ...r, qty: Math.max(0, r.qty - 1) } : r)),
          furniture: [
            ...d.furniture,
            { id: `tmp-${Date.now()}`, pet_id: d.state.pet.id, item_id: item, room, x, z, rot: 0, placed_by: me.id, placed_at: new Date().toISOString() },
          ],
        }),
        supabase.rpc("pet_furnish", { p_action: "place", p_item: item, p_room: room, p_x: round(x), p_z: round(z), p_rot: 0 }),
      ),
    [run, supabase, me.id],
  );

  const move = React.useCallback(
    (f: Furniture, x: number, z: number, rot: number) => {
      if (f.id.startsWith("tmp-")) return Promise.resolve(null);
      return run(
        (d) => ({ ...d, furniture: d.furniture.map((g) => (g.id === f.id ? { ...g, x, z, rot } : g)) }),
        supabase.rpc("pet_furnish", { p_action: "move", p_id: f.id, p_x: round(x), p_z: round(z), p_rot: rot }),
      );
    },
    [run, supabase],
  );

  const store = React.useCallback(
    (f: Furniture) => {
      if (f.id.startsWith("tmp-")) return Promise.resolve(null);
      return run(
        (d) => {
          const has = d.inventory.some((r) => r.item_id === f.item_id);
          return {
            ...d,
            furniture: d.furniture.filter((g) => g.id !== f.id),
            inventory: has ? d.inventory.map((r) => (r.item_id === f.item_id ? { ...r, qty: r.qty + 1 } : r)) : [...d.inventory, { pet_id: f.pet_id, item_id: f.item_id, qty: 1 }],
          };
        },
        supabase.rpc("pet_furnish", { p_action: "store", p_id: f.id }),
      );
    },
    [run, supabase],
  );

  const claim = React.useCallback(
    (quest: string) =>
      run(
        (d) => {
          const q = d.quests.find((x) => x.quest === quest);
          return {
            ...d,
            quests: d.quests.map((x) => (x.quest === quest ? { ...x, claimed_at: new Date().toISOString() } : x)),
            state: { ...d.state, pet: { ...d.state.pet, coins: d.state.pet.coins + (q?.reward ?? 0) } },
          };
        },
        supabase.rpc("pet_claim", { p_quest: quest }),
        { cue: "quest" },
      ),
    [run, supabase],
  );

  const minigame = React.useCallback((score: number) => run(null, supabase.rpc("pet_minigame", { p_score: score }), { cue: "play" }), [run, supabase]);

  const rename = React.useCallback(
    (name: string) => run((d) => ({ ...d, state: { ...d.state, pet: { ...d.state.pet, name } } }), supabase.rpc("pet_rename", { p_name: name })),
    [run, supabase],
  );

  return { data, error, cue, busy, load, act, buy, place, move, store, claim, minigame, rename };
}

const round = (v: number) => Math.round(clamp(v, -1, 1) * 100) / 100;
