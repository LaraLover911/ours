"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { collectDeviceInfo } from "@/lib/presence/device-info";
import { getDeviceId } from "@/lib/device";
import { registerServiceWorker, syncPush } from "@/lib/push/client";

/** Registers the service worker, refreshes this device's push registration and shows pushes that arrive while the app is open. */
export function PushBootstrap() {
  const { supabase } = useApp();
  const router = useRouter();
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      await registerServiceWorker();
      if (cancelled) return;
      const info = await collectDeviceInfo(getDeviceId());
      await syncPush(supabase, info.name);
    })();
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; data?: { title?: string; body?: string; url?: string; category?: string } };
      if (msg?.type !== "push" || !msg.data || msg.data.category === "chat") return;
      const url = msg.data.url;
      toast(msg.data.title ?? "ours. ♡", {
        description: msg.data.body,
        action: url ? { label: "Öffnen", onClick: () => router.push(url) } : undefined,
      });
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [supabase, router]);
  return null;
}
