"use client";

import * as React from "react";
import { useApp } from "@/components/providers/app-provider";
import { useCall } from "@/components/call/call-provider";
import type { Pop } from "@/types/app";
import { PopPlayer } from "./pop-player";

/** Plays surprises from the Studio when the recipient (re)opens the app. */
export function PopDelivery() {
  const { supabase, me, nameOf } = useApp();
  const { busy } = useCall();
  const [queue, setQueue] = React.useState<Pop[]>([]);
  const seen = React.useRef(new Set<string>());

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from("pops")
      .select("*")
      .eq("recipient_id", me.id)
      .is("shown_at", null)
      .order("created_at", { ascending: true })
      .limit(10);
    if (!data) return;
    setQueue((q) => {
      const ids = new Set(q.map((p) => p.id));
      const fresh = data.filter((p) => !ids.has(p.id) && !seen.current.has(p.id));
      return fresh.length ? [...q, ...fresh] : q;
    });
  }, [supabase, me.id]);

  React.useEffect(() => {
    void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    const channel = supabase
      .channel(`ours:pops:${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pops", filter: `recipient_id=eq.${me.id}` }, () => void load())
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, me.id, load]);

  const current = queue[0];
  if (!current || busy) return null;

  return (
    <PopPlayer
      key={current.id}
      pop={current}
      fromName={nameOf(current.sender_id)}
      onOpened={() => {
        seen.current.add(current.id);
        void supabase.rpc("mark_pop_shown", { pop_id: current.id }).then();
      }}
      onClose={() => setQueue((q) => q.slice(1))}
    />
  );
}
