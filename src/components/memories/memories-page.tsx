"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { CalendarDays, Heart, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Reveal, useGsapEffect } from "@/components/animations/reveal";
import { Comments } from "@/components/shared/comments";
import { LocalImage, PrivateImage } from "@/components/shared/media";
import { Lightbox, type LightboxItem } from "@/components/shared/lightbox";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { MEMORY_CATEGORIES } from "@/lib/constants";
import { localPhotos } from "@/lib/photos";
import { removeMedia } from "@/lib/supabase/media";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import { MemoryEditor, type MemoryWithMedia } from "./memory-editor";

const catOf = (id: string) => MEMORY_CATEGORIES.find((c) => c.id === id) ?? MEMORY_CATEGORIES[5];

function sortedMedia(m: MemoryWithMedia) {
  return m.memory_media.slice().sort((a, b) => a.position - b.position);
}

function MemoryCard({ m, index, onOpen, onFavorite }: { m: MemoryWithMedia; index: number; onOpen: () => void; onFavorite: () => void }) {
  const media = sortedMedia(m);
  const cover = media.find((x) => x.kind === "image") ?? media[0];
  const polaroid = index % 5 === 2;
  const ratio = cover?.width && cover?.height ? cover.width / cover.height : [0.8, 1, 0.75, 1.25][index % 4];
  const tilt = polaroid ? (index % 2 ? "rotate-[1.4deg]" : "-rotate-[1.2deg]") : "";
  return (
    <motion.article
      data-reveal
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn("group mb-4 break-inside-avoid", tilt)}
    >
      <div className={cn("relative", polaroid ? "polaroid" : "card-surface overflow-hidden")}>
        <button onClick={onOpen} className="block w-full text-left" aria-label={`Erinnerung öffnen: ${m.title}`}>
          {cover ? (
            <div className={cn("relative overflow-hidden", polaroid ? "rounded-[2px]" : "")} style={{ aspectRatio: Math.min(1.5, Math.max(0.65, ratio)) }}>
              {cover.kind === "video" ? (
                <div className="absolute inset-0 grid place-items-center bg-charcoal text-sm text-white/80">🎬 Video</div>
              ) : (
                <PrivateImage path={cover.path} className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]" alt="" />
              )}
              {media.length > 1 ? <span className="glass absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[11px] font-medium">+{media.length - 1}</span> : null}
            </div>
          ) : (
            <div className="relative aspect-[4/3] bg-[radial-gradient(90%_80%_at_30%_20%,var(--primary-soft),var(--muted))]">
              <span className="font-display absolute inset-0 grid place-items-center p-6 text-center text-3xl leading-tight text-primary/80">{catOf(m.category).emoji}</span>
            </div>
          )}
          <div className={cn(polaroid ? "absolute inset-x-0 bottom-1 px-3 text-charcoal" : "p-4")}>
            {polaroid ? (
              <p className="font-display truncate text-center text-xl">{m.title}</p>
            ) : (
              <>
                <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span>{catOf(m.category).emoji}</span>
                  {m.happened_on ? formatDate(m.happened_on, { day: "numeric", month: "short", year: "numeric" }) : "ohne Datum"}
                  {m.location ? <span className="truncate">· {m.location}</span> : null}
                </p>
                <h3 className="font-display mt-1 text-[1.65rem] leading-[1.05]">{m.title}</h3>
                {m.description ? <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{m.description}</p> : null}
              </>
            )}
          </div>
        </button>
        <button
          onClick={onFavorite}
          className={cn(
            "absolute top-2.5 right-2.5 grid size-9 place-items-center rounded-full backdrop-blur transition-all",
            m.is_favorite ? "bg-white/90 text-cherry" : "bg-black/25 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          )}
          aria-label={m.is_favorite ? "Aus Favoriten entfernen" : "Zu Favoriten"}
          aria-pressed={m.is_favorite}
        >
          <Heart className={cn("size-4", m.is_favorite && "fill-current")} />
        </button>
      </div>
    </motion.article>
  );
}

function Timeline({ memories, onOpen }: { memories: MemoryWithMedia[]; onOpen: (id: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const dated = memories.filter((m) => m.happened_on).sort((a, b) => a.happened_on!.localeCompare(b.happened_on!));
  const undated = memories.filter((m) => !m.happened_on);

  useGsapEffect(
    ref,
    ({ gsap }, el) => {
      const line = el.querySelector("[data-line]");
      if (line) gsap.fromTo(line, { scaleY: 0 }, { scaleY: 1, ease: "none", transformOrigin: "top", scrollTrigger: { trigger: el, start: "top 70%", end: "bottom 70%", scrub: true } });
      el.querySelectorAll<HTMLElement>("[data-tl-item]").forEach((item) => {
        gsap.from(item, { autoAlpha: 0, x: item.dataset.side === "right" ? 40 : -40, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: item, start: "top 85%", once: true } });
        const img = item.querySelector("[data-tl-img]");
        if (img) gsap.from(img, { clipPath: "inset(0 0 100% 0)", duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: item, start: "top 85%", once: true } });
      });
    },
    [dated.length],
  );

  if (!memories.length) return null;
  const firstOfYear = new Set(dated.filter((m, i) => i === 0 || dated[i - 1].happened_on!.slice(0, 4) !== m.happened_on!.slice(0, 4)).map((m) => m.id));

  return (
    <div ref={ref} className="relative mx-auto max-w-4xl py-6">
      <div aria-hidden className="absolute top-0 bottom-0 left-4 w-px bg-border md:left-1/2" />
      <div aria-hidden data-line className="absolute top-0 bottom-0 left-4 w-px bg-primary md:left-1/2" />
      <ol className="relative grid gap-10">
        {dated.map((m, i) => {
          const year = m.happened_on!.slice(0, 4);
          const showYear = firstOfYear.has(m.id);
          const cover = sortedMedia(m).find((x) => x.kind === "image");
          const right = i % 2 === 1;
          return (
            <li key={m.id} className="relative">
              {showYear ? (
                <p className="font-display relative z-10 mb-6 ml-10 text-5xl text-primary md:mx-auto md:w-fit md:bg-background md:px-4">{year}</p>
              ) : null}
              <div data-tl-item data-side={right ? "right" : "left"} className={cn("relative grid pl-10 md:grid-cols-2 md:gap-12 md:pl-0")}>
                <span aria-hidden className="absolute top-3 left-4 z-10 size-3 -translate-x-1/2 rounded-full bg-primary ring-4 ring-background md:left-1/2" />
                <button onClick={() => onOpen(m.id)} className={cn("card-surface group overflow-hidden text-left transition-shadow hover:shadow-lift", right ? "md:col-start-2" : "md:col-start-1")}>
                  {cover ? (
                    <div data-tl-img className="relative aspect-[16/10] overflow-hidden">
                      <PrivateImage path={cover.path} className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.03]" />
                    </div>
                  ) : null}
                  <div className="p-5">
                    <p className="text-[12px] text-muted-foreground">
                      {formatDate(m.happened_on!, { weekday: "long", day: "numeric", month: "long" })}
                      {m.location ? ` · ${m.location}` : ""}
                    </p>
                    <h3 className="font-display mt-1 text-3xl leading-none">{m.title}</h3>
                    {m.description ? <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{m.description}</p> : null}
                  </div>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {undated.length ? (
        <div className="relative mt-14 pl-10 md:pl-0">
          <p className="eyebrow mb-4 md:text-center">ohne Datum</p>
          <div className="flex flex-wrap gap-2 md:justify-center">
            {undated.map((m) => (
              <Button key={m.id} variant="outline" size="sm" onClick={() => onOpen(m.id)}>{m.title}</Button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="font-display relative mt-14 bg-background pl-10 text-center text-4xl md:pl-0">to be continued ♡</p>
    </div>
  );
}

function MemoryDetail({ memory, onClose, onEdit, onDeleted }: { memory: MemoryWithMedia | null; onClose: () => void; onEdit: () => void; onDeleted: () => void }) {
  const { supabase, me, nameOf } = useApp();
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  const media = memory ? sortedMedia(memory) : [];
  const items: LightboxItem[] = media.map((m) => ({ type: "storage", path: m.path, kind: m.kind as "image" | "video" }));

  return (
    <>
      <Dialog open={!!memory} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:w-[min(48rem,calc(100vw-2rem))]">
          {memory ? (
            <>
              <DialogHeader>
                <p className="eyebrow">{catOf(memory.category).emoji} {catOf(memory.category).label}</p>
                <DialogTitle className="text-[2.4rem]">{memory.title}</DialogTitle>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarDays className="size-3.5" /> {memory.happened_on ? formatDate(memory.happened_on, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "ohne Datum"}</span>
                  {memory.location ? <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {memory.location}</span> : null}
                  <span>von {nameOf(memory.created_by)}</span>
                </p>
              </DialogHeader>
              <DialogBody>
                {media.length ? (
                  <div className={cn("grid gap-2", media.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
                    {media.map((m, i) => (
                      <button
                        key={m.id}
                        onClick={() => setLightbox(i)}
                        className={cn("relative overflow-hidden rounded-xl", media.length === 1 ? "aspect-[4/3]" : i === 0 ? "col-span-2 row-span-2 aspect-square sm:col-span-2" : "aspect-square")}
                        aria-label={`Medium ${i + 1} öffnen`}
                      >
                        {m.kind === "video" ? <div className="absolute inset-0 grid place-items-center bg-charcoal text-white">▶︎ Video</div> : <PrivateImage path={m.path} className="absolute inset-0" />}
                      </button>
                    ))}
                  </div>
                ) : null}
                {memory.description ? <p className="mt-5 text-[16px] leading-relaxed whitespace-pre-wrap">{memory.description}</p> : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={onEdit}><Pencil /> Bearbeiten</Button>
                  {memory.created_by === me.id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={async () => {
                        if (!window.confirm("Diese Erinnerung wirklich löschen?")) return;
                        const { error } = await supabase.from("memories").delete().eq("id", memory.id);
                        if (error) return toast.error(errorMessage(error));
                        void removeMedia(media.filter((m) => m.created_by === me.id).map((m) => m.path));
                        toast.success("Gelöscht");
                        onDeleted();
                      }}
                    >
                      <Trash2 /> Löschen
                    </Button>
                  ) : null}
                </div>
                <Comments table="memory_comments" parentKey="memory_id" parentId={memory.id} />
              </DialogBody>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Lightbox items={items} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

function PhotoWall() {
  const photos = localPhotos("memories");
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <section className="mt-16" aria-labelledby="wall-title">
      <h2 id="wall-title" className="font-display text-4xl">from our folder</h2>
      <p className="mt-1 text-sm text-muted-foreground">Fotos aus <code>public/images/memories</code></p>
      <Reveal className="mt-6 columns-2 gap-3 sm:columns-3 lg:columns-4" stagger={0.05}>
        {photos.map((p, i) => (
          <button key={p.id} data-reveal onClick={() => setLightbox(i)} className={cn("mb-3 block w-full break-inside-avoid", i % 4 === 1 && "polaroid -rotate-1")} aria-label={`Foto ${p.name} öffnen`}>
            <span className="relative block" style={{ aspectRatio: p.width && p.height ? `${p.width}/${p.height}` : "4/5" }}>
              <LocalImage photo={p} sizes="(min-width:1024px) 25vw, 50vw" className={cn("absolute inset-0", i % 4 === 1 ? "rounded-[2px]" : "rounded-2xl")} />
            </span>
          </button>
        ))}
      </Reveal>
      <Lightbox items={photos.map((p) => ({ type: "local", photo: p }))} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}

export function MemoriesPage() {
  const { supabase } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [category, setCategory] = React.useState<string>("all");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MemoryWithMedia | null>(null);
  const [tab, setTab] = React.useState(params.get("view") === "timeline" ? "timeline" : "album");
  const openId = params.get("open");

  const { data, loading, error, refetch, setData } = useQuery(
    async () =>
      must(
        await supabase
          .from("memories")
          .select("*, memory_media(*)")
          .order("happened_on", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
      ) as MemoryWithMedia[],
    [],
  );
  useRealtimeRefetch(["memories", "memory_media"], refetch, "memories");

  const openMemory = data?.find((m) => m.id === openId) ?? null;
  const setOpen = (id: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("open", id);
    else sp.delete("open");
    router.replace(`/memories${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  const toggleFavorite = async (m: MemoryWithMedia) => {
    setData((list) => list?.map((x) => (x.id === m.id ? { ...x, is_favorite: !x.is_favorite } : x)));
    const { error } = await supabase.from("memories").update({ is_favorite: !m.is_favorite }).eq("id", m.id);
    if (error) {
      toast.error(errorMessage(error));
      void refetch();
    }
  };

  const filtered = (data ?? []).filter((m) => (category === "all" ? true : category === "fav" ? m.is_favorite : m.category === category));

  return (
    <PageContainer>
      <PageHeader
        eyebrow="our memories"
        title={<>our story <em className="text-primary">so far</em></>}
        description="Alles, was wir zusammen erlebt haben, in Fotos, Videos und Worten."
        actions={
          <Button size="lg" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus /> Erinnerung
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {loading || data?.length ? (
            <TabsList>
              <TabsTrigger value="album">Album</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
          ) : null}
          {tab === "album" ? (
            <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter">
              {[{ id: "all", label: "Alle", emoji: "" }, { id: "fav", label: "Favoriten", emoji: "♥" }, ...MEMORY_CATEGORIES].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  aria-pressed={category === c.id}
                  className={cn("h-9 shrink-0 rounded-full border px-3.5 text-[13px] transition-colors", category === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}
                >
                  {c.emoji ? `${c.emoji} ` : ""}{c.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="columns-2 gap-4 lg:columns-3">
              {[260, 200, 320, 240, 280, 220].map((h, i) => (
                <div key={i} style={{ height: h }} className="mb-4 break-inside-avoid">
                  <Skeleton className="size-full rounded-[var(--radius-xl)]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : !data?.length ? (
            <EmptyState
              title="our first page is still blank"
              description="Leg eure erste gemeinsame Erinnerung an, mit Fotos, Datum und Ort. Hier wird nichts erfunden, nur eure echten Momente."
              action={<Button onClick={() => setEditorOpen(true)}><Plus /> Erste Erinnerung</Button>}
            />
          ) : (
            <>
              <TabsContent value="album" forceMount hidden={tab !== "album"}>
                {filtered.length ? (
                  <Reveal key={category} className="columns-1 gap-4 min-[420px]:columns-2 lg:columns-3 2xl:columns-4" stagger={0.06}>
                    {filtered.map((m, i) => (
                      <MemoryCard key={m.id} m={m} index={i} onOpen={() => setOpen(m.id)} onFavorite={() => toggleFavorite(m)} />
                    ))}
                  </Reveal>
                ) : (
                  <EmptyState title="nothing here yet" description="In dieser Kategorie gibt es noch keine Erinnerungen." />
                )}
              </TabsContent>
              <TabsContent value="timeline">
                <Timeline memories={data} onOpen={(id) => setOpen(id)} />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>

      <PhotoWall />

      <MemoryDetail
        memory={openMemory}
        onClose={() => setOpen(null)}
        onEdit={() => {
          setEditing(openMemory);
          setEditorOpen(true);
        }}
        onDeleted={() => {
          setOpen(null);
          void refetch();
        }}
      />
      {editorOpen ? <MemoryEditor open onOpenChange={setEditorOpen} memory={editing} onSaved={() => void refetch()} /> : null}
    </PageContainer>
  );
}
