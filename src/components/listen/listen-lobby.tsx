"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronRight, Headphones, History, Music2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { errorMessage } from "@/lib/utils/errors";
import { timeAgo } from "@/lib/utils/dates";

type Stats = { songs: number; minutes: number; top: { title: string; artist: string | null; plays: number }[]; by_person: Record<string, number>; dedications: number };

export function ListenLobby() {
  const { supabase, me, partner } = useApp();
  const router = useRouter();
  const partnerName = partner?.display_name ?? "dein Schatz";
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const rooms = useQuery(async () => must(await supabase.from("listening_rooms").select("*").order("updated_at", { ascending: false }).limit(20)), [supabase]);
  const history = useQuery(async () => must(await supabase.from("listening_history").select("*").order("ended_at", { ascending: false }).limit(30)), [supabase]);
  const stats = useQuery(async () => (must(await supabase.rpc("listen_stats")) ?? null) as Stats | null, [supabase]);
  useRealtimeRefetch(["listening_rooms"], () => void rooms.refetch());

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("listen_create", { p_name: name.trim() || "Unser Raum" });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    router.push(`/listen/${data}`);
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("listening_rooms").delete().eq("id", id);
    if (error) return toast.error(errorMessage(error));
    void rooms.refetch();
  };

  const s = stats.data;
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="listen together"
        title={
          <>
            same song, <em className="text-primary">same second</em>
          </>
        }
        description={`Ein Raum, eine Warteschlange, eine gemeinsame Uhr. Play, Pause und Skip gelten für euch beide. ${partnerName} bekommt eine Einladung, wenn du einen Raum öffnest.`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section icon={<Headphones />} title="Räume">
          <form onSubmit={create} className="mb-4 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Name, z. B. Sonntagsmusik" aria-label="Name des Raums" className="min-w-0 flex-1" />
            <Button type="submit" disabled={busy}>
              <Plus /> Öffnen
            </Button>
          </form>
          {rooms.loading ? (
            <Skeleton className="h-24" />
          ) : rooms.data?.length ? (
            <ul className="divide-y divide-border">
              {rooms.data.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <Link href={`/listen/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Music2 className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">
                        {r.status === "playing" ? "läuft gerade" : r.status === "paused" ? "pausiert" : "leer"} · {timeAgo(r.updated_at)}
                      </span>
                    </span>
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                  </Link>
                  <Button size="icon-sm" variant="ghost" onClick={() => remove(r.id)} aria-label={`${r.name} löschen`}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted-foreground">Noch kein Raum. Öffne einen und füg einen Song hinzu.</p>
          )}
        </Section>

        <Section icon={<BarChart3 />} title="Eure Musik" description="Aus eurem echten Hörverlauf (Songs ab 30 Sekunden).">
          {stats.loading ? (
            <Skeleton className="h-24" />
          ) : s && s.songs + s.minutes > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="font-display text-4xl tabular-nums">{s.songs}</p>
                  <p className="text-[12px] text-muted-foreground">Songs</p>
                </div>
                <div>
                  <p className="font-display text-4xl tabular-nums">{s.minutes}</p>
                  <p className="text-[12px] text-muted-foreground">Minuten</p>
                </div>
                <div>
                  <p className="font-display text-4xl tabular-nums">{s.dedications}</p>
                  <p className="text-[12px] text-muted-foreground">Widmungen</p>
                </div>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Hinzugefügt: du {s.by_person[me.id] ?? 0} · {partnerName} {s.by_person[partner?.id ?? ""] ?? 0}
              </p>
              {s.top.length ? (
                <ol className="space-y-1 text-[14px]">
                  {s.top.map((t, i) => (
                    <li key={`${t.title}${i}`} className="flex gap-2">
                      <span className="w-4 text-muted-foreground">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate">
                        {t.title}
                        {t.artist ? <span className="text-muted-foreground"> · {t.artist}</span> : null}
                      </span>
                      <span className="text-muted-foreground tabular-nums">{t.plays}×</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : (
            <p className="text-[14px] text-muted-foreground">Noch nichts zusammen gehört.</p>
          )}
        </Section>
      </div>

      <Section icon={<History />} title="Verlauf" className="mt-5">
        {history.loading ? (
          <Skeleton className="h-24" />
        ) : history.data?.length ? (
          <ul className="divide-y divide-border">
            {history.data.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                {h.thumb ? <img src={h.thumb} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{h.title}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {h.artist ? `${h.artist} · ` : ""}
                    {Math.round(h.listened_ms / 60000) || "<1"} Min. · {h.reason === "ended" ? "zu Ende gehört" : "übersprungen"} · {timeAgo(h.ended_at)}
                    {h.dedication ? ` · ♡ „${h.dedication}“` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">Hier erscheint, was ihr zusammen gehört habt.</p>
        )}
      </Section>
    </PageContainer>
  );
}
