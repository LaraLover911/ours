"use client";

import * as React from "react";
import { Clapperboard, Plus, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

type Item = Database["public"]["Tables"]["watch_items"]["Row"];
type Hit = { id: string; title: string; subtitle?: string | null; thumb: string; meta?: { kind?: string; year?: string | null; overview?: string } };
const STATUS = { want: "Wollen wir sehen", watching: "Schauen wir gerade", watched: "Gesehen" } as const;

/** Shared watchlist. Search uses TMDB through the server when it is set up; otherwise titles are typed in. */
export function WatchlistPage() {
  const { supabase, me, partner } = useApp();
  const items = useQuery(async () => must(await supabase.from("watch_items").select("*").order("created_at", { ascending: false })), [supabase]);
  const ratings = useQuery(async () => must(await supabase.from("watch_ratings").select("*")), [supabase]);
  useRealtimeRefetch(["watch_items", "watch_ratings"], () => {
    void items.refetch();
    void ratings.refetch();
  });
  const [tab, setTab] = React.useState<keyof typeof STATUS>("want");
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Hit[] | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [tmdb, setTmdb] = React.useState<boolean | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch(`/api/media/search?provider=tmdb&q=${encodeURIComponent(q)}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.status === 503) {
      setTmdb(false);
      return addManual();
    }
    if (!r?.ok) return toast.error(j.error ?? "Suche nicht erreichbar");
    setTmdb(true);
    setHits(j.items);
    setNotice(j.notice);
  };
  const addManual = async () => {
    if (!q.trim()) return;
    const { error } = await supabase.from("watch_items").insert({ title: q.trim().slice(0, 200), kind: "other" });
    if (error) return toast.error(errorMessage(error));
    setQ("");
    void items.refetch();
  };
  const addHit = async (h: Hit) => {
    const { error } = await supabase.from("watch_items").insert({
      title: h.title,
      kind: h.meta?.kind === "tv" ? "tv" : "movie",
      tmdb_id: h.id,
      poster_url: h.thumb,
      year: h.meta?.year ?? null,
      overview: h.meta?.overview?.slice(0, 600) || null,
    });
    if (error) return toast.error(error.code === "23505" ? "Steht schon auf eurer Liste." : errorMessage(error));
    setHits(null);
    setQ("");
    void items.refetch();
  };
  const setStatus = async (it: Item, status: keyof typeof STATUS) => {
    const { error } = await supabase.from("watch_items").update({ status, watched_at: status === "watched" ? new Date().toISOString() : null }).eq("id", it.id);
    if (error) toast.error(errorMessage(error));
  };
  const rate = async (it: Item, stars: number) => {
    const { error } = await supabase.from("watch_ratings").upsert({ item_id: it.id, user_id: me.id, stars });
    if (error) toast.error(errorMessage(error));
    else void ratings.refetch();
  };

  const list = (items.data ?? []).filter((i) => i.status === tab);
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="watchlist"
        title={
          <>
            movie night, <em className="text-primary">sorted</em>
          </>
        }
        description="Filme und Serien, die ihr zusammen sehen wollt, mit euren beiden Bewertungen."
      />
      <form onSubmit={search} className="card-surface mb-4 flex gap-2 p-3">
        <Input value={q} onChange={(e) => setQ(e.target.value.slice(0, 100))} placeholder="Film oder Serie" aria-label="Film oder Serie suchen" className="min-w-0 flex-1" />
        <Button type="submit" disabled={!q.trim()}>
          {tmdb === false ? <Plus /> : <Search />} {tmdb === false ? "Hinzufügen" : "Suchen"}
        </Button>
      </form>
      {tmdb === false ? <p className="-mt-2 mb-4 text-[12.5px] text-muted-foreground">TMDB ist nicht eingerichtet, deshalb wird der Titel so übernommen, wie du ihn eintippst.</p> : null}
      {hits ? (
        <div className="card-surface mb-5 p-3">
          {hits.length ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => addHit(h)} className="block w-full text-left">
                    {/* eslint-disable-next-line @next/next/no-img-element -- TMDB poster */}
                    <img src={h.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[2/3] w-full rounded-lg bg-muted object-cover" />
                    <p className="mt-1 truncate text-[12.5px] font-medium">{h.title}</p>
                    <p className="text-[11.5px] text-muted-foreground">{h.subtitle}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted-foreground">
              Nichts gefunden.{" "}
              <button type="button" className="underline" onClick={addManual}>
                „{q}“ trotzdem hinzufügen
              </button>
            </p>
          )}
          {notice ? <p className="mt-2 text-[11px] text-muted-foreground">{notice}</p> : null}
        </div>
      ) : null}
      <Tabs value={tab} onValueChange={(v) => setTab(v as keyof typeof STATUS)} className="mb-4">
        <TabsList>
          {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => (
            <TabsTrigger key={s} value={s} panel={false}>
              {STATUS[s]} <span className="text-muted-foreground">{(items.data ?? []).filter((i) => i.status === s).length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {items.loading ? (
        <Skeleton className="h-40" />
      ) : list.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((it) => {
            const rs = (ratings.data ?? []).filter((r) => r.item_id === it.id);
            const my = rs.find((r) => r.user_id === me.id)?.stars ?? 0;
            const theirs = rs.find((r) => r.user_id !== me.id)?.stars ?? 0;
            return (
              <li key={it.id} className="card-surface flex gap-3 p-3">
                {it.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- TMDB poster
                  <img src={it.poster_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-28 w-[4.7rem] shrink-0 rounded-lg bg-muted object-cover" />
                ) : (
                  <span className="grid h-28 w-[4.7rem] shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Clapperboard />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{it.title}</p>
                  <p className="text-[12px] text-muted-foreground">{[it.year, it.kind === "tv" ? "Serie" : it.kind === "movie" ? "Film" : null].filter(Boolean).join(" · ")}</p>
                  {it.overview ? <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{it.overview}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(Object.keys(STATUS) as (keyof typeof STATUS)[])
                      .filter((s) => s !== it.status)
                      .map((s) => (
                        <Button key={s} size="sm" variant="soft" className="h-7 px-2 text-[12px]" onClick={() => setStatus(it, s)}>
                          {s === "want" ? "Auf die Liste" : s === "watching" ? "Schauen gerade" : "Gesehen"}
                        </Button>
                      ))}
                    <Button size="icon-sm" variant="ghost" className="size-7" aria-label="Entfernen" onClick={async () => {
                      const { error } = await supabase.from("watch_items").delete().eq("id", it.id);
                      if (error) toast.error(errorMessage(error));
                    }}>
                      <Trash2 />
                    </Button>
                  </div>
                  {it.status === "watched" ? (
                    <div className="mt-2 text-[12.5px]">
                      <div className="flex items-center gap-1">
                        Du:
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} type="button" aria-label={`${n} Sterne`} onClick={() => rate(it, n)}>
                            <Star className={cn("size-4", n <= my ? "fill-primary text-primary" : "text-muted-foreground")} />
                          </button>
                        ))}
                      </div>
                      <p className="text-muted-foreground">{partner?.display_name ?? "Dein Schatz"}: {theirs ? "★".repeat(theirs) : "noch nicht bewertet"}</p>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[14px] text-muted-foreground">Hier ist noch nichts.</p>
      )}
    </PageContainer>
  );
}
