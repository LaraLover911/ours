"use client";

import * as React from "react";
import { ImagePlus, Loader2, Palette, Quote, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { PrivateImage } from "@/components/shared/media";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { removeMedia, uploadMedia } from "@/lib/supabase/media";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

type Item = Database["public"]["Tables"]["moodboard_items"]["Row"];
type Hit = { id: string; title: string; thumb: string; full?: string | null; credit?: { text: string; url?: string | null } | null; meta?: { download_location?: string } };

/** Moodboard: your own photos, colors, quotes and (if set up) Unsplash/GIPHY finds with attribution. */
export function MoodboardPage() {
  const { supabase } = useApp();
  const items = useQuery(async () => must(await supabase.from("moodboard_items").select("*").order("created_at", { ascending: false })), [supabase]);
  useRealtimeRefetch(["moodboard_items"], () => void items.refetch());
  const [board, setBoard] = React.useState("us");
  const boards = Array.from(new Set(["us", ...(items.data ?? []).map((i) => i.board)]));
  const [newBoard, setNewBoard] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const file = React.useRef<HTMLInputElement>(null);

  const insert = async (row: Partial<Item> & { kind: Item["kind"] }) => {
    const { error } = await supabase.from("moodboard_items").insert({ ...row, board });
    if (error) {
      toast.error(errorMessage(error));
      return false;
    }
    void items.refetch();
    return true;
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const up = await uploadMedia(f, "moodboard");
      if (up.kind !== "image") {
        await removeMedia([up.path]);
        throw new Error("Bitte ein Bild wählen.");
      }
      if (!(await insert({ kind: "photo", path: up.path }))) await removeMedia([up.path]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  const remove = async (it: Item) => {
    const { error } = await supabase.from("moodboard_items").delete().eq("id", it.id);
    if (error) return toast.error(errorMessage(error));
    if (it.path) await removeMedia([it.path]);
    void items.refetch();
  };
  const list = (items.data ?? []).filter((i) => i.board === board);

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="moodboard"
        title={
          <>
            the vibe, <em className="text-primary">collected</em>
          </>
        }
        description="Sammelt Bilder, Farben und Sätze für eure Wohnung, eure Reise oder einfach eure Stimmung."
      />
      <div className="card-surface mb-5 flex flex-wrap items-center gap-2 p-3">
        <NativeSelect value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Board" className="w-auto min-w-36">
          {boards.map((b) => (
            <option key={b} value={b}>
              {b === "us" ? "Unser Board" : b}
            </option>
          ))}
        </NativeSelect>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (newBoard.trim()) setBoard(newBoard.trim().slice(0, 40));
            setNewBoard("");
          }}
        >
          <Input value={newBoard} onChange={(e) => setNewBoard(e.target.value)} placeholder="Neues Board" aria-label="Neues Board" className="h-9 w-36" />
        </form>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <input ref={file} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0])} />
          <Button size="sm" variant="soft" onClick={() => file.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} Foto
          </Button>
          <ColorAdd onAdd={(c) => insert({ kind: "color", color: c })} />
          <QuoteAdd onAdd={(t) => insert({ kind: "quote", body: t })} />
          <WebAdd onAdd={(h) => insert({ kind: "web", url: h.full ?? h.thumb, body: h.title.slice(0, 280), credit: h.credit ?? null })} />
        </div>
      </div>
      {items.loading ? (
        <Skeleton className="h-60" />
      ) : list.length ? (
        <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4">
          {list.map((it) => (
            <li key={it.id} className="group relative mb-3 break-inside-avoid overflow-hidden rounded-2xl bg-muted">
              {it.kind === "photo" && it.path ? <PrivateImage path={it.path} alt="" className="w-full" /> : null}
              {it.kind === "web" && it.url ? (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element -- provider image, shown with attribution */}
                  <img src={it.url} alt={it.body ?? ""} loading="lazy" referrerPolicy="no-referrer" className="w-full" />
                  {(it.credit as { text?: string; url?: string } | null)?.text ? (
                    <figcaption className="px-2 py-1 text-[11px] text-muted-foreground">
                      <a href={(it.credit as { url?: string }).url ?? undefined} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        {(it.credit as { text: string }).text}
                      </a>
                    </figcaption>
                  ) : null}
                </figure>
              ) : null}
              {it.kind === "color" && it.color ? (
                <div className="flex aspect-square items-end p-3" style={{ background: it.color }}>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-[12px] text-black">{it.color}</span>
                </div>
              ) : null}
              {it.kind === "quote" ? <p className="p-4 font-display text-2xl leading-tight text-balance">„{it.body}“</p> : null}
              <Button size="icon-sm" variant="soft" className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100" aria-label="Entfernen" onClick={() => remove(it)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-[14px] text-muted-foreground">Dieses Board ist noch leer.</p>
      )}
    </PageContainer>
  );
}

function ColorAdd({ onAdd }: { onAdd: (c: string) => void }) {
  const [c, setC] = React.useState("#e8a3b8");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="soft">
          <Palette /> Farbe
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-56 items-center gap-2">
        <input type="color" value={c} onChange={(e) => setC(e.target.value)} aria-label="Farbe wählen" className="h-10 w-14 cursor-pointer rounded" />
        <Button size="sm" onClick={() => onAdd(c.toLowerCase())}>
          Hinzufügen
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function QuoteAdd({ onAdd }: { onAdd: (t: string) => Promise<boolean> }) {
  const [t, setT] = React.useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="soft">
          <Quote /> Satz
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (t.trim() && (await onAdd(t.trim()))) setT("");
          }}
        >
          <Input value={t} onChange={(e) => setT(e.target.value.slice(0, 280))} placeholder="Ein Satz, der passt" aria-label="Satz" className="min-w-0 flex-1" />
          <Button size="sm" type="submit">
            OK
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function WebAdd({ onAdd }: { onAdd: (h: Hit) => Promise<boolean> }) {
  const [provider, setProvider] = React.useState("unsplash");
  const [q, setQ] = React.useState("");
  const [res, setRes] = React.useState<{ items: Hit[]; notice: string } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await fetch(`/api/media/search?provider=${provider}&q=${encodeURIComponent(q)}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setRes(null);
      return setErr(r?.status === 503 ? `${provider === "unsplash" ? "Unsplash" : "GIPHY"} ist noch nicht eingerichtet.` : (j.error ?? "Nicht erreichbar"));
    }
    setRes(j);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="soft">
          <Search /> Suchen
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))]">
        <form onSubmit={search} className="flex gap-2">
          <NativeSelect value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Quelle" className="h-9 w-28">
            <option value="unsplash">Unsplash</option>
            <option value="giphy">GIPHY</option>
          </NativeSelect>
          <Input value={q} onChange={(e) => setQ(e.target.value.slice(0, 100))} placeholder="Stichwort" aria-label="Stichwort" className="h-9 min-w-0 flex-1" />
        </form>
        {err ? <p className="mt-2 text-[13px] text-danger">{err}</p> : null}
        {res ? (
          <>
            <ul className="mt-2 grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto">
              {res.items.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="block aspect-square w-full overflow-hidden rounded-lg bg-muted"
                    onClick={async () => {
                      if (await onAdd(h)) {
                        // Unsplash asks to register a "download" when a photo is used.
                        if (h.meta?.download_location) void fetch("/api/media/unsplash-download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: h.meta.download_location }) });
                      }
                    }}
                    aria-label={`${h.title} hinzufügen`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- provider thumbnail */}
                    <img src={h.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">{res.notice}</p>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
