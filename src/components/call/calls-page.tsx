"use client";

import * as React from "react";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Phone, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { formatTime, relativeDay } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import { cn } from "@/lib/utils";
import type { CallRow } from "@/types/app";
import { useCall } from "./call-provider";
import { callDuration, effectiveStatus, isMissedFor } from "./call-utils";

const LABEL: Record<string, string> = {
  declined: "abgelehnt",
  busy: "besetzt",
  failed: "Verbindung fehlgeschlagen",
  ringing: "klingelt gerade",
  accepted: "wird verbunden",
  connected: "läuft gerade",
};

export function CallsPage() {
  const { supabase, me, partner } = useApp();
  const { startCall, busy } = useCall();
  const { data, error, loading, refetch } = useQuery(
    async () => must(await supabase.from("calls").select("*").order("created_at", { ascending: false }).limit(100)),
    [supabase],
  );
  useRealtimeRefetch(["calls"], refetch);

  const groups = React.useMemo(() => {
    const out: { day: string; items: CallRow[] }[] = [];
    for (const c of data ?? []) {
      const day = relativeDay(c.created_at);
      const g = out.at(-1);
      if (g && g.day === day) g.items.push(c);
      else out.push({ day, items: [c] });
    }
    return out;
  }, [data]);

  const stats = React.useMemo(() => {
    const done = (data ?? []).filter((c) => c.connected_at && c.ended_at);
    const total = done.reduce((s, c) => s + (new Date(c.ended_at!).getTime() - new Date(c.connected_at!).getTime()), 0);
    return { count: done.length, minutes: Math.round(total / 60000) };
  }, [data]);

  async function remove(id: string) {
    const { error: err } = await supabase.from("calls").delete().eq("id", id);
    if (err) toast.error(errorMessage(err));
    else void refetch();
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="calls"
        title={
          <>
            hear your <em className="text-primary">voice</em>
          </>
        }
        description={`Ruf ${partner?.display_name ?? "deinen Schatz"} an, per Audio oder Video, direkt von Gerät zu Gerät verschlüsselt.`}
        actions={
          partner ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => startCall("audio")}>
                <Phone /> Anrufen
              </Button>
              <Button disabled={busy} onClick={() => startCall("video")}>
                <Video /> Video
              </Button>
            </>
          ) : null
        }
      />

      {data && stats.count ? (
        <p className="mb-5 text-[14px] text-muted-foreground">
          {stats.count} {stats.count === 1 ? "Anruf" : "Anrufe"} · {stats.minutes} {stats.minutes === 1 ? "Minute" : "Minuten"} zusammen telefoniert (in diesem Verlauf)
        </p>
      ) : null}

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data?.length ? (
        <EmptyState title="Noch keine Anrufe" description="Hier erscheinen eure Anrufe, auch verpasste." icon={<Phone className="size-7" />} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="eyebrow mb-2">{g.day}</h2>
              <ul className="card-surface divide-y divide-border overflow-hidden">
                {g.items.map((c) => {
                  const status = effectiveStatus(c);
                  const out = c.caller_id === me.id;
                  const missed = isMissedFor(c, me.id);
                  const Icon = missed ? PhoneMissed : out ? PhoneOutgoing : PhoneIncoming;
                  const dur = callDuration(c);
                  const text = missed
                    ? "Verpasst"
                    : dur
                      ? `${out ? "Ausgehend" : "Eingehend"} · ${dur}`
                      : status === "cancelled" || status === "missed"
                        ? out
                          ? "nicht angenommen"
                          : "Verpasst"
                        : `${out ? "Ausgehend" : "Eingehend"} · ${LABEL[status] ?? status}`;
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", missed ? "bg-danger/10 text-danger" : "bg-primary-soft text-primary")}>
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-[15px] font-medium", missed && "text-danger")}>
                          {c.kind === "video" ? "Videoanruf" : "Anruf"}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {text} · {formatTime(c.created_at)}
                          {c.end_reason && status === "failed" ? ` · ${c.end_reason}` : ""}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" aria-label="Zurückrufen" disabled={busy} onClick={() => startCall(c.kind === "video" ? "video" : "audio")}>
                        {c.kind === "video" ? <Video /> : <Phone />}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Aus dem Verlauf löschen" onClick={() => void remove(c.id)}>
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
