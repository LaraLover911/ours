"use client";

import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { timeAgo } from "@/lib/utils/dates";
import { useCall } from "./call-provider";
import { isMissedFor } from "./call-utils";

const KEY = "ours-calls-seen";

/** Shows a toast for calls I missed since I last looked (per device). */
export function MissedCalls() {
  const { supabase, me, partner } = useApp();
  const { startCall } = useCall();
  const startRef = React.useRef(startCall);
  React.useEffect(() => {
    startRef.current = startCall;
  }, [startCall]);

  React.useEffect(() => {
    let cancelled = false;
    const check = async () => {
      let since: string | null = null;
      try {
        since = localStorage.getItem(KEY);
        if (!since) {
          localStorage.setItem(KEY, new Date().toISOString());
          return;
        }
      } catch {
        return;
      }
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("callee_id", me.id)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled || !data) return;
      const missed = data.filter((c) => isMissedFor(c, me.id) || (c.status === "ringing" && Date.now() - new Date(c.created_at).getTime() > 60_000));
      try {
        localStorage.setItem(KEY, new Date().toISOString());
      } catch {
        /* ignore */
      }
      if (!missed.length) return;
      const last = missed[0];
      toast(missed.length > 1 ? `${missed.length} verpasste Anrufe von ${partner?.display_name ?? "deinem Schatz"}` : `Verpasster Anruf von ${partner?.display_name ?? "deinem Schatz"}`, {
        description: timeAgo(last.created_at),
        duration: 12_000,
        action: { label: "Zurückrufen", onClick: () => startRef.current(last.kind === "video" ? "video" : "audio") },
      });
    };
    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, me.id, partner?.display_name]);

  return null;
}
