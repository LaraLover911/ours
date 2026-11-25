"use client";

import * as React from "react";
import { useApp } from "@/components/providers/app-provider";

/** Re-runs `refetch` whenever one of the given tables changes (RLS applies to the stream). */
export function useRealtimeRefetch(tables: string[], refetch: () => void, key = tables.join(",")) {
  const { supabase } = useApp();
  const ref = React.useRef(refetch);
  React.useEffect(() => {
    ref.current = refetch;
  });

  React.useEffect(() => {
    let timer: number | undefined;
    const trigger = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ref.current(), 150);
    };
    let channel = supabase.channel(`ours:rt:${key}:${Math.random().toString(36).slice(2, 8)}`);
    for (const table of key.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, trigger);
    }
    channel.subscribe();
    const onFocus = () => document.visibilityState === "visible" && trigger();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [supabase, key]);
}
