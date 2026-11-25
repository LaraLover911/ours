"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, Gift, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Reveal } from "@/components/animations/reveal";
import { HeartGlyph } from "@/components/shared/heart";
import { MediaPicker, type PickedMedia } from "@/components/shared/media-picker";
import { PrivateImage } from "@/components/shared/media";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { removeMedia } from "@/lib/supabase/media";
import { cn } from "@/lib/utils";
import { formatDate, fromLocalInputValue, toLocalInputValue } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Surprise } from "@/types/app";
import { GiftBox, WRAPS } from "./gift-box";

const KINDS = [
  { id: "gift", label: "Digitales Geschenk", hint: "Eine Geschenkbox zum Auspacken" },
  { id: "message", label: "Überraschungsnachricht", hint: "Eine Nachricht, die zur richtigen Zeit erscheint" },
  { id: "hidden", label: "Versteckte Nachricht", hint: "Ein kleines Herz versteckt sich auf der Startseite" },
] as const;

function SurpriseEditor({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { supabase, me, partner } = useApp();
  const [kind, setKind] = React.useState<string>("gift");
  const [wrap, setWrap] = React.useState("cherry");
  const [image, setImage] = React.useState<PickedMedia[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!partner) return setError("Dein Partner hat noch kein Profil.");
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            const body = String(fd.get("body") ?? "").trim();
            if (!title || !body) return setError("Titel und Nachricht sind nötig.");
            const reveal = fromLocalInputValue(String(fd.get("reveal_at") ?? "")) ?? new Date().toISOString();
            setPending(true);
            const { error } = await supabase.from("surprises").insert({ title, body, kind, wrap, reveal_at: reveal, image_path: image[0]?.path ?? null, recipient_id: partner.id, author_id: me.id });
            setPending(false);
            if (error) return setError(errorMessage(error));
            toast.success(new Date(reveal) > new Date() ? `Geplant für ${formatDate(reveal, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} 🤫` : `${partner.display_name} kann es jetzt finden ♡`);
            onSaved();
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>a little surprise</DialogTitle>
            <DialogDescription>Nur {partner?.display_name ?? "dein Schatz"} kann es öffnen, und erst ab dem Zeitpunkt, den du wählst.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <fieldset className="grid gap-2 sm:grid-cols-3">
              <legend className="sr-only">Art</legend>
              {KINDS.map((k) => (
                <label key={k.id} className={cn("flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-[13px]", kind === k.id ? "border-primary bg-primary-soft" : "border-border hover:bg-muted")}>
                  <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} className="sr-only" />
                  <span className="font-medium">{k.label}</span>
                  <span className="text-muted-foreground">{k.hint}</span>
                </label>
              ))}
            </fieldset>
            {kind === "gift" ? (
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium">Geschenkpapier</legend>
                <div className="flex gap-2">
                  {Object.entries(WRAPS).map(([id, w]) => (
                    <button key={id} type="button" onClick={() => setWrap(id)} aria-pressed={wrap === id} aria-label={w.label} className={cn("size-12 rounded-xl border-2 transition-transform", wrap === id ? "scale-110 border-primary" : "border-transparent")} style={{ background: `linear-gradient(90deg, ${w.box} 42%, ${w.ribbon} 42% 58%, ${w.box} 58%)` }} />
                  ))}
                </div>
              </fieldset>
            ) : null}
            <Field label="Titel" htmlFor="sp-title"><Input id="sp-title" name="title" required maxLength={140} placeholder="for you, because…" /></Field>
            <Field label="Nachricht" htmlFor="sp-body"><Textarea id="sp-body" name="body" required maxLength={4000} /></Field>
            <Field label="Erscheint ab" htmlFor="sp-at" hint="Leer = sofort. Sonst bleibt es bis dahin versiegelt (Überraschungskalender).">
              <Input id="sp-at" name="reveal_at" type="datetime-local" defaultValue={toLocalInputValue(null)} />
            </Field>
            <MediaPicker value={image} onChange={setImage} area="surprises" max={1} accept="image/*" label="Foto" />
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={pending}><Gift /> Verpacken</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Opening({ surprise, onClose }: { surprise: Surprise | null; onClose: () => void }) {
  const { supabase, nameOf } = useApp();
  const [openedId, setOpenedId] = React.useState<string | null>(null);
  const opened = !!surprise && openedId === surprise.id;
  React.useEffect(() => {
    if (!surprise) return;
    if (!surprise.opened_at) void supabase.rpc("mark_surprise_opened", { surprise_id: surprise.id });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setOpenedId(surprise.id), reduced ? 0 : 900);
    return () => window.clearTimeout(t);
  }, [surprise, supabase]);

  return (
    <Dialog open={!!surprise} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-hidden sm:w-[min(32rem,calc(100vw-2rem))]">
        <DialogTitle className="sr-only">{surprise?.title ?? "Überraschung"}</DialogTitle>
        {surprise ? (
          <DialogBody className="relative pt-6 text-center">
            <AnimatePresence>
              {opened
                ? Array.from({ length: 14 }).map((_, i) => (
                    <motion.span
                      key={i}
                      aria-hidden
                      className="pointer-events-none absolute top-1/3 left-1/2 text-primary"
                      initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
                      animate={{ x: Math.cos((i / 14) * Math.PI * 2) * (90 + (i % 3) * 30), y: Math.sin((i / 14) * Math.PI * 2) * (70 + (i % 4) * 20) - 40, opacity: 0, scale: 1, rotate: i * 25 }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                    >
                      <HeartGlyph className={i % 2 ? "size-3" : "size-5"} />
                    </motion.span>
                  ))
                : null}
            </AnimatePresence>
            {surprise.kind === "gift" ? (
              <motion.div className="mx-auto w-44" animate={opened ? { y: 40, scale: 0.8, opacity: 0.25 } : { rotate: [0, -4, 4, -3, 3, 0] }} transition={opened ? { duration: 0.6 } : { duration: 0.8 }}>
                <GiftBox wrap={surprise.wrap} open={opened} />
              </motion.div>
            ) : null}
            <AnimatePresence>
              {opened || surprise.kind !== "gift" ? (
                <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 140, damping: 16, delay: surprise.kind === "gift" ? 0.15 : 0 }} className={cn("relative", surprise.kind === "gift" && "-mt-24")}>
                  <p className="eyebrow">from {nameOf(surprise.author_id)}, for you</p>
                  <h2 className="font-display mt-2 text-5xl leading-none">{surprise.title}</h2>
                  {surprise.image_path ? <PrivateImage path={surprise.image_path} className="mx-auto mt-5 aspect-[4/3] max-w-sm rounded-2xl" /> : null}
                  <p className="mx-auto mt-5 max-w-md text-[16px] leading-relaxed whitespace-pre-wrap">{surprise.body}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </DialogBody>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function SurprisesPage() {
  const { supabase, me, partner } = useApp();
  const [tab, setTab] = React.useState<"forme" | "fromme">("forme");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [opening, setOpening] = React.useState<Surprise | null>(null);

  const { data, loading, error, refetch } = useQuery(async () => {
    const [all, sealed] = await Promise.all([supabase.from("surprises").select("*").order("reveal_at", { ascending: false }), supabase.rpc("sealed_surprises")]);
    return { all: must(all), sealed: must(sealed) ?? [] };
  }, []);
  useRealtimeRefetch(["surprises"], refetch, "surprises");

  React.useEffect(() => {
    const next = data?.sealed[0]?.reveal_at;
    if (!next) return;
    const ms = new Date(next).getTime() - Date.now();
    if (ms > 2 ** 31 - 1) return;
    const t = window.setTimeout(() => void refetch(), Math.max(1000, ms + 1000));
    return () => window.clearTimeout(t);
  }, [data?.sealed, refetch]);

  const forMe = (data?.all ?? []).filter((s) => s.recipient_id === me.id && s.kind !== "hidden");
  const hiddenForMe = (data?.all ?? []).filter((s) => s.recipient_id === me.id && s.kind === "hidden");
  const fromMe = (data?.all ?? []).filter((s) => s.author_id === me.id);

  return (
    <PageContainer>
      <PageHeader eyebrow="surprise box" title={<>something <em className="text-primary">for you</em></>} description="Digitale Geschenke, geheime Nachrichten und kleine Überraschungen mit Timer." actions={<Button size="lg" onClick={() => setEditorOpen(true)}><Plus /> Überraschung</Button>} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as "forme" | "fromme")}>
        <TabsList>
          <TabsTrigger panel={false} value="forme">Für mich</TabsTrigger>
          <TabsTrigger panel={false} value="fromme">Von mir</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
      ) : error ? (
        <ErrorState className="mt-8" message={error} onRetry={refetch} />
      ) : tab === "forme" ? (
        <>
          {data?.sealed.length ? (
            <section className="mt-8" aria-labelledby="cal-title">
              <h2 id="cal-title" className="eyebrow mb-4 flex items-center gap-2"><CalendarClock className="size-3.5" /> Überraschungskalender</h2>
              <ol className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
                {data.sealed.map((s) => (
                  <li key={s.id} className="w-36 shrink-0 text-center">
                    <div className="rounded-2xl border border-border bg-card p-3">
                      <p className="font-display text-4xl leading-none">{formatDate(s.reveal_at, { day: "numeric" })}</p>
                      <p className="text-[12px] text-muted-foreground uppercase">{formatDate(s.reveal_at, { month: "short" })}</p>
                      <GiftBox wrap={s.wrap} locked className="mx-auto mt-2 w-20" />
                    </div>
                    <p className="mt-2 text-[12px] text-muted-foreground">ab {formatDate(s.reveal_at, { hour: "2-digit", minute: "2-digit" })}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {forMe.length ? (
            <Reveal className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4" stagger={0.06}>
              {forMe.map((s) => (
                <motion.button key={s.id} data-reveal whileHover={{ y: -6, rotate: -1 }} whileTap={{ scale: 0.96 }} onClick={() => setOpening(s)} className="group text-left">
                  {s.kind === "gift" ? (
                    <GiftBox wrap={s.wrap} className={cn(!s.opened_at && "animate-[float_6s_ease-in-out_infinite]")} />
                  ) : (
                    <div className="grid aspect-square place-items-center rounded-[var(--radius-xl)] bg-primary-soft">
                      <HeartGlyph className="size-12 text-primary" />
                    </div>
                  )}
                  <p className="mt-2 font-medium">{s.opened_at ? s.title : s.kind === "gift" ? "Ein Geschenk für dich" : "Eine Nachricht für dich"}</p>
                  <p className="text-[12px] text-muted-foreground">{s.opened_at ? `geöffnet ${formatDate(s.opened_at, { day: "numeric", month: "short" })}` : "noch nicht geöffnet ✨"}</p>
                </motion.button>
              ))}
            </Reveal>
          ) : !data?.sealed.length ? (
            <EmptyState className="mt-8" icon={<Gift className="size-7" />} title="nothing here… yet" description={`Wenn ${partner?.display_name ?? "dein Schatz"} dir etwas schenkt, wartet es hier auf dich.`} />
          ) : null}
          {hiddenForMe.length ? <p className="mt-8 text-sm text-muted-foreground">🤫 {hiddenForMe.filter((h) => !h.opened_at).length ? "Auf der Startseite versteckt sich gerade etwas für dich…" : `${hiddenForMe.length} versteckte Nachricht(en) gefunden.`}</p> : null}
        </>
      ) : !fromMe.length ? (
        <EmptyState className="mt-8" icon={<Gift className="size-7" />} title="make their day" description={`Verpacke etwas Kleines für ${partner?.display_name ?? "deinen Schatz"}.`} action={<Button onClick={() => setEditorOpen(true)}><Plus /> Überraschung</Button>} />
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {fromMe.map((s) => {
            const pending = new Date(s.reveal_at) > new Date();
            return (
              <li key={s.id} className="card-surface flex items-center gap-4 p-4">
                <GiftBox wrap={s.wrap} className="w-16 shrink-0" locked={pending} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {KINDS.find((k) => k.id === s.kind)?.label} · {pending ? `erscheint ${formatDate(s.reveal_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : s.opened_at ? "geöffnet ♡" : "wartet aufs Öffnen"}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!window.confirm("Überraschung löschen?")) return;
                    const { error } = await supabase.from("surprises").delete().eq("id", s.id);
                    if (error) return toast.error(errorMessage(error));
                    if (s.image_path) void removeMedia([s.image_path]);
                    void refetch();
                  }}
                  className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger"
                  aria-label="Löschen"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editorOpen ? <SurpriseEditor open onOpenChange={setEditorOpen} onSaved={() => void refetch()} /> : null}
      <Opening surprise={opening} onClose={() => { setOpening(null); void refetch(); }} />
    </PageContainer>
  );
}
