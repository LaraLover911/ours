"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Globe2, MapPin, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";

const MapView = dynamic(() => import("./map-view"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });
type Hit = { name: string; region: string | null; country: string | null; lat: number; lon: number };

/** Our world map: places you have been together and places you dream of. */
export function MapPage() {
  const { supabase, me, nameOf } = useApp();
  const places = useQuery(async () => must(await supabase.from("places").select("*").order("created_at", { ascending: false })), [supabase]);
  useRealtimeRefetch(["places"], () => void places.refetch());
  const [kind, setKind] = React.useState<"visited" | "dream">("visited");
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Hit[] | null>(null);
  const [date, setDate] = React.useState("");
  const [focus, setFocus] = React.useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return toast.error(j.error ?? "Ortssuche nicht erreichbar");
    setHits(j.items);
  };
  const add = async (h: Hit) => {
    const { error } = await supabase.from("places").insert({ name: h.name, country: h.country, lat: h.lat, lon: h.lon, kind, visited_on: kind === "visited" && date ? date : null });
    if (error) return toast.error(errorMessage(error));
    setHits(null);
    setQ("");
    setDate("");
    void places.refetch();
  };
  const list = React.useMemo(() => places.data ?? [], [places.data]);
  const pins = React.useMemo(() => list.map((p) => ({ id: p.id, name: p.name, lat: Number(p.lat), lon: Number(p.lon), kind: p.kind as "visited" | "dream" })), [list]);
  const visited = list.filter((p) => p.kind === "visited");
  const countries = new Set(visited.map((p) => p.country).filter(Boolean)).size;
  const onSelect = React.useCallback((id: string) => setFocus(id), []);

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="our world"
        title={
          <>
            where we’ve been, <em className="text-primary">where we’ll go</em>
          </>
        }
        description="Orte, an denen ihr zusammen wart, und Orte, von denen ihr träumt. Ihr tragt sie selbst ein, es wird nie ein Standort automatisch ermittelt."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="card-surface relative aspect-[4/3] overflow-hidden p-0 lg:aspect-auto lg:min-h-[32rem]">
          <MapView places={pins} focus={focus} onSelect={onSelect} />
          <p className="pointer-events-none absolute top-3 right-3 z-[500] rounded-full bg-background/85 px-3 py-1 text-[12.5px] backdrop-blur-sm">
            <span className="mr-1 inline-block size-2 rounded-full bg-[#b3476a]" /> zusammen da
            <span className="mr-1 ml-3 inline-block size-2 rounded-full bg-[#7b6bc4]" /> Traumziel
          </p>
        </div>
        <div className="space-y-5">
          <Section icon={<Globe2 />} title="Ort hinzufügen">
            <Tabs value={kind} onValueChange={(v) => setKind(v as "visited" | "dream")} className="mb-3">
              <TabsList>
                <TabsTrigger value="visited" panel={false}>
                  Waren wir
                </TabsTrigger>
                <TabsTrigger value="dream" panel={false}>
                  Wollen wir hin
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <form onSubmit={search} className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))} placeholder="Stadt oder Ort" aria-label="Ort suchen" className="min-w-0 flex-1" />
              <Button type="submit" variant="soft" disabled={q.trim().length < 2}>
                <Search />
              </Button>
            </form>
            {kind === "visited" ? <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Wann wart ihr dort? (optional)" className="mt-2" /> : null}
            {hits ? (
              hits.length ? (
                <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                  {hits.map((h) => (
                    <li key={`${h.lat},${h.lon}`}>
                      <button type="button" onClick={() => add(h)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-muted">
                        <MapPin className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{[h.name, h.region, h.country].filter(Boolean).join(", ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-muted-foreground">Nichts gefunden.</p>
              )
            ) : null}
          </Section>
          <Section title="Eure Orte" description={visited.length ? `${visited.length} Orte zusammen${countries ? `, ${countries} ${countries === 1 ? "Land" : "Länder"}` : ""}` : undefined}>
            {places.loading ? (
              <Skeleton className="h-24" />
            ) : list.length ? (
              <ul className="divide-y divide-border">
                {list.map((p) => (
                  <li key={p.id} className={cn("flex items-center gap-2 py-2", focus === p.id && "text-primary")}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setFocus(p.id)}>
                      <p className="truncate text-[14px] font-medium">
                        <span className={cn("mr-1.5 inline-block size-2 rounded-full", p.kind === "visited" ? "bg-[#b3476a]" : "bg-[#7b6bc4]")} />
                        {p.name}
                        {p.country ? <span className="font-normal text-muted-foreground">, {p.country}</span> : null}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {p.kind === "visited" ? (p.visited_on ? formatDate(p.visited_on) : "zusammen da") : "Traumziel"} · von {p.created_by === me.id ? "dir" : nameOf(p.created_by)}
                      </p>
                    </button>
                    <Button size="icon-sm" variant="ghost" aria-label={`${p.name} entfernen`} onClick={async () => {
                      const { error } = await supabase.from("places").delete().eq("id", p.id);
                      if (error) toast.error(errorMessage(error));
                    }}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted-foreground">Noch keine Orte. Fangt mit eurem ersten gemeinsamen Ort an.</p>
            )}
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}
