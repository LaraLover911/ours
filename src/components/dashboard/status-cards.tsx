"use client";

import * as React from "react";
import { Phone, Send, Video } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { useCall } from "@/components/call/call-provider";
import { Avatar } from "@/components/shared/avatar";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { berlinDateString, timeAgo } from "@/lib/utils/dates";
import { parseActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/app";

/** A thought only counts for the day it was written (Berlin time). */
function thoughtOfToday(p: Profile | null | undefined) {
  if (!p?.today_thought || !p.today_thought_at) return null;
  return berlinDateString(new Date(p.today_thought_at)) === berlinDateString() ? p.today_thought : null;
}

export function StatusCards() {
  const { me, partner, partnerOnline, updateMe } = useApp();
  const { startCall, busy } = useCall();
  useNow(30_000); // keep "vor 3 Minuten" fresh
  const partnerThought = thoughtOfToday(partner);
  const myThought = thoughtOfToday(me);
  const [draft, setDraft] = React.useState(myThought ?? "");
  const [saving, setSaving] = React.useState(false);

  const act = parseActivity(partner?.last_activity);
  const lastAt = partner?.last_activity_at ?? partner?.last_seen_at;
  const activity = partnerOnline
    ? (act?.doing ?? "ist gerade da")
    : lastAt
      ? `zuletzt aktiv ${timeAgo(lastAt)}${act ? ` · ${act.place}` : ""}`
      : "war noch nicht hier";

  async function saveThought(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    setSaving(true);
    const { error } = await updateMe({ today_thought: value || null, today_thought_at: value ? new Date().toISOString() : null });
    setSaving(false);
    if (error) toast.error("Konnte nicht gespeichert werden.");
    else toast.success(value ? "Gespeichert ♡" : "Gelöscht");
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label={`${partner?.display_name ?? "Partner"} gerade`} className="card-surface flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <Avatar profile={partner} size="lg" ring online={partnerOnline} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">right now</p>
            <p className="font-display truncate text-3xl leading-tight">{partner?.display_name ?? "…"}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-full", partnerOnline ? "bg-[#4fbf7f]" : "bg-border-strong")} />
              <span className="truncate">{activity}</span>
            </p>
          </div>
          {partner ? (
            <div className="flex shrink-0 gap-1.5">
              <Button size="icon" variant="outline" aria-label={`${partner.display_name} anrufen`} disabled={busy} onClick={() => startCall("audio")}>
                <Phone />
              </Button>
              <Button size="icon" aria-label={`Videoanruf mit ${partner.display_name}`} disabled={busy} onClick={() => startCall("video")}>
                <Video />
              </Button>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl bg-muted/70 px-4 py-3">
          <p className="text-[12px] font-medium text-muted-foreground">heute denkt {partner?.display_name ?? "dein Schatz"}…</p>
          <p className={cn("mt-1 text-[15px] text-pretty", !partnerThought && "text-muted-foreground italic")}>
            {partnerThought ?? "noch nichts geteilt"}
          </p>
        </div>
      </section>

      <form onSubmit={saveThought} className="card-surface flex flex-col gap-3 p-5 sm:p-6">
        <p className="eyebrow">today I&apos;m thinking…</p>
        <label htmlFor="today-thought" className="font-display text-3xl leading-tight">Was denkst du heute?</label>
        <div className="flex gap-2">
          <input
            id="today-thought"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={160}
            placeholder="z. B. kann’s kaum erwarten, dich zu sehen"
            className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-3.5 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" className="size-11" aria-label="Gedanken teilen" disabled={saving || draft.trim() === (myThought ?? "")}>
            <Send />
          </Button>
        </div>
        <p className="mt-auto text-[12px] text-muted-foreground">
          {myThought ? `${partner?.display_name ?? "Dein Schatz"} sieht: „${myThought}“` : "Gilt nur für heute, morgen ist wieder Platz für Neues."}
        </p>
      </form>
    </div>
  );
}
