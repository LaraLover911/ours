"use client";

import * as React from "react";
import { BookHeart, CalendarHeart, Gamepad2, Headphones, Images, Mail, MessageCircleHeart, PawPrint, Phone, Sparkles, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { formatTime, relativeDay } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  online: Wifi,
  message: MessageCircleHeart,
  memory: Images,
  game: Gamepad2,
  diary: BookHeart,
  letter: Mail,
  date: CalendarHeart,
  challenge: Sparkles,
  call: Phone,
  pet: PawPrint,
  listen: Headphones,
};

export function ActivityPage() {
  const { supabase, me, partner, profiles, updateMe } = useApp();
  const [who, setWho] = React.useState<"all" | string>("all");
  const q = useQuery(async () => must(await supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(200)), [supabase]);
  useRealtimeRefetch(["activity_events"], q.refetch);
  const enabled = me.share_activity_feed === true;

  const items = (q.data ?? []).filter((e) => who === "all" || e.user_id === who);
  const groups = React.useMemo(() => {
    const out: { day: string; items: typeof items }[] = [];
    for (const e of items) {
      const day = relativeDay(e.created_at);
      const g = out.at(-1);
      if (g && g.day === day) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [items]);

  async function clearMine() {
    const { error } = await supabase.from("activity_events").delete().eq("user_id", me.id);
    if (error) return void toast.error(errorMessage(error));
    toast.success("Deine Einträge sind gelöscht.");
    void q.refetch();
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="our activity"
        title={
          <>
            little <em className="text-primary">moments</em>
          </>
        }
        description="Was ihr in ours. gemacht habt, als Zeitleiste. Nur wer es einschaltet, erscheint hier. Private Tagebucheinträge und Studio-Überraschungen tauchen nie auf."
      />

      <section className="card-surface flex items-center gap-4 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Meine Aktivitäten teilen</p>
          <p className="text-[13px] text-muted-foreground">
            {enabled ? "An: neue Aktivitäten von dir erscheinen hier." : "Aus: von dir wird nichts aufgezeichnet."}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => void updateMe({ share_activity_feed: v })} aria-label="Meine Aktivitäten teilen" />
      </section>

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Filter">
        {[{ id: "all", label: "Beide" }, { id: me.id, label: me.display_name }, ...(partner ? [{ id: partner.id, label: partner.display_name }] : [])].map((f) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={who === f.id}
            onClick={() => setWho(f.id)}
            className={cn("rounded-full border px-3.5 py-1.5 text-[13px] transition-colors", who === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}
          >
            {f.label}
          </button>
        ))}
        <span className="flex-1" />
        {(q.data ?? []).some((e) => e.user_id === me.id) ? (
          <Button size="sm" variant="ghost" onClick={clearMine}>
            <Trash2 /> Meine löschen
          </Button>
        ) : null}
      </div>

      {q.error ? (
        <ErrorState message={q.error} onRetry={q.refetch} />
      ) : q.loading && !q.data ? (
        <Skeleton className="h-64 rounded-[1.4rem]" />
      ) : !items.length ? (
        <EmptyState
          title="Noch nichts hier"
          description={enabled ? "Sobald ihr etwas macht, erscheint es hier." : "Schalte „Meine Aktivitäten teilen“ ein, damit deine Momente hier auftauchen."}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="eyebrow mb-2">{g.day}</h2>
              <ol className="relative space-y-1 border-l border-border pl-5">
                {g.items.map((e) => {
                  const Icon = ICONS[e.kind] ?? Sparkles;
                  const p = profiles[e.user_id];
                  return (
                    <li key={e.id} className="relative flex items-center gap-3 py-2">
                      <span className="absolute -left-[1.85rem] grid size-6 place-items-center rounded-full bg-primary-soft text-primary ring-4 ring-background">
                        <Icon className="size-3.5" />
                      </span>
                      <Avatar profile={p} size="sm" />
                      <p className="min-w-0 flex-1 text-[14.5px]">
                        <strong className="font-medium">{p?.display_name ?? "?"}</strong> {e.summary}
                      </p>
                      <time className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{formatTime(e.created_at)}</time>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
