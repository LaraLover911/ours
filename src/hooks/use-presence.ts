"use client";

import { useApp } from "@/components/providers/app-provider";
import { parseActivity } from "@/lib/activity";
import { timeAgo } from "@/lib/utils/dates";
import type { ActivityKind } from "@/lib/presence/service";

const ACTIVITY: Record<ActivityKind, string> = {
  call: "telefoniert gerade",
  listen: "hört gerade Musik mit dir",
  game: "spielt gerade",
  chat: "ist im Chat",
};

/** The partner's live presence as text, built from Realtime Presence + server timestamps. */
export function usePresence() {
  const { partner, partnerPresence: p } = useApp();
  const name = partner?.display_name ?? "Dein Schatz";
  const lastSeenAt = partner?.show_online ? partner.last_seen_at : null;
  const act = partner?.share_activity !== false ? parseActivity(partner?.last_activity) : null;
  let label: string;
  if (!p.online) {
    label = lastSeenAt ? `zuletzt online ${timeAgo(lastSeenAt)}${act ? ` · ${act.place}` : ""}` : partner?.show_online === false ? "Online-Status verborgen" : "offline";
  } else if (p.activity) {
    label = ACTIVITY[p.activity];
  } else if (p.state === "idle") {
    label = "ist kurz weg";
  } else if (p.state === "away") {
    label = "hat ours. im Hintergrund offen";
  } else {
    label = parseActivity(p.place)?.doing ?? "ist gerade da";
  }
  if (p.online && p.devices > 1) label += ` · auf ${p.devices} Geräten`;
  const tone: "online" | "idle" | "offline" = !p.online ? "offline" : p.state === "online" ? "online" : "idle";
  return { ...p, name, label, tone, lastSeenAt, lastActivityAt: partner?.share_activity !== false ? (partner?.last_activity_at ?? null) : null };
}

export const PRESENCE_DOT: Record<"online" | "idle" | "offline", string> = {
  online: "bg-[#4fbf7f]",
  idle: "bg-[#f5b94a]",
  offline: "bg-border-strong",
};
