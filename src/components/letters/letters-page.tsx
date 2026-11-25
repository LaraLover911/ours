"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Clock, Pencil, PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Reveal } from "@/components/animations/reveal";
import { MediaPicker, type PickedMedia } from "@/components/shared/media-picker";
import { PrivateImage } from "@/components/shared/media";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { LETTER_CATEGORIES } from "@/lib/constants";
import { removeMedia } from "@/lib/supabase/media";
import { cn } from "@/lib/utils";
import { formatDate, fromLocalInputValue, toLocalInputValue } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { LoveLetter } from "@/types/app";
import { Envelope } from "./envelope";

const cat = (id: string) => LETTER_CATEGORIES.find((c) => c.id === id) ?? LETTER_CATEGORIES[7];

type Sealed = { id: string; author_id: string; recipient_id: string | null; category: string; open_at: string; created_at: string };

function LetterEditor({ open, onOpenChange, letter, defaultCategory, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; letter: LoveLetter | null; defaultCategory?: string; onSaved: () => void }) {
  const { supabase, me, partner } = useApp();
  const [image, setImage] = React.useState<PickedMedia[]>(() => (letter?.image_path ? [{ path: letter.image_path, kind: "image" }] : []));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            const body = String(fd.get("body") ?? "").trim();
            const category = String(fd.get("category"));
            const to = String(fd.get("to"));
            const openAt = fromLocalInputValue(String(fd.get("open_at") ?? ""));
            if (!title || !body) return setError("Titel und Brief dürfen nicht leer sein.");
            if (openAt && new Date(openAt).getTime() < Date.now() - 60_000 && !letter) return setError("Das Öffnungsdatum liegt in der Vergangenheit.");
            setPending(true);
            setError(null);
            const row = {
              title: title.slice(0, 140),
              body: body.slice(0, 20000),
              category,
              recipient_id: to === "both" ? null : (partner?.id ?? null),
              open_at: openAt,
              image_path: image[0]?.path ?? null,
            };
            const res = letter
              ? await supabase.from("love_letters").update(row).eq("id", letter.id)
              : await supabase.from("love_letters").insert({ ...row, author_id: me.id });
            setPending(false);
            if (res.error) return setError(errorMessage(res.error));
            if (letter?.image_path && letter.image_path !== row.image_path) void removeMedia([letter.image_path]);
            toast.success(openAt ? `Versiegelt bis ${formatDate(openAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} ♡` : "Brief hinterlassen ♡");
            onSaved();
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{letter ? "edit letter" : "write a letter"}</DialogTitle>
            <DialogDescription>Für {partner?.display_name ?? "dich"}, für einen ganz bestimmten Moment.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Open when…" htmlFor="l-cat">
                <NativeSelect id="l-cat" name="category" defaultValue={letter?.category ?? defaultCategory ?? "miss"}>
                  {LETTER_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Für" htmlFor="l-to">
                <NativeSelect id="l-to" name="to" defaultValue={letter && !letter.recipient_id ? "both" : "partner"}>
                  <option value="partner">Nur {partner?.display_name ?? "Partner"} (privat)</option>
                  <option value="both">Uns beide (gemeinsam)</option>
                </NativeSelect>
              </Field>
            </div>
            <Field label="Titel" htmlFor="l-title">
              <Input id="l-title" name="title" required maxLength={140} defaultValue={letter?.title} placeholder="for the nights you can't sleep" />
            </Field>
            <Field label="Dein Brief" htmlFor="l-body">
              <Textarea id="l-body" name="body" required maxLength={20000} defaultValue={letter?.body} className="min-h-52 font-display text-[1.35rem] leading-snug" placeholder={`hey ${partner?.display_name ?? "love"},`} />
            </Field>
            <Field label="Öffnen ab (optional)" htmlFor="l-open" hint="Leer lassen = sofort lesbar. Sonst bleibt der Brief bis dahin versiegelt, auch technisch.">
              <Input id="l-open" name="open_at" type="datetime-local" defaultValue={toLocalInputValue(letter?.open_at)} />
            </Field>
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Foto (optional)</p>
              <MediaPicker value={image} onChange={setImage} area="letters" max={1} accept="image/*" label="Foto" />
            </div>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={pending}><PenLine /> {pending ? "Versiegelt…" : letter ? "Speichern" : "Versiegeln & senden"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LetterReader({ letter, onClose, onEdit, onDelete }: { letter: LoveLetter | null; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const { me, nameOf, supabase } = useApp();
  // Stage is keyed to the letter: a new letter starts closed again.
  const [stageFor, setStageFor] = React.useState<{ id: string | null; stage: "closed" | "opening" | "open" }>({ id: null, stage: "closed" });
  const stage = stageFor.id === letter?.id ? stageFor.stage : "closed";

  React.useEffect(() => {
    if (!letter) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = window.setTimeout(() => setStageFor({ id: letter.id, stage: reduced ? "open" : "opening" }), reduced ? 0 : 250);
    const t2 = window.setTimeout(() => setStageFor({ id: letter.id, stage: "open" }), reduced ? 0 : 1500);
    if (letter.author_id !== me.id && !letter.opened_at) void supabase.rpc("mark_letter_opened", { letter_id: letter.id }).then();
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [letter, me.id, supabase]);

  const c = letter ? cat(letter.category) : null;

  return (
    <Dialog open={!!letter} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,var(--primary-soft),var(--card)_60%)] sm:w-[min(40rem,calc(100vw-2rem))]">
        <DialogTitle className="sr-only">{letter?.title ?? "Brief"}</DialogTitle>
        {letter && c ? (
          <DialogBody className="pt-6">
            <AnimatePresence mode="wait">
              {stage !== "open" ? (
                <motion.div key="env" exit={{ opacity: 0, scale: 0.9, y: 30 }} transition={{ duration: 0.35 }} className="mx-auto w-full max-w-sm py-10">
                  <motion.div initial={{ y: 30, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 120, damping: 14 }}>
                    <Envelope color={c.color} open={stage === "opening"} />
                  </motion.div>
                  <p className="font-display mt-8 text-center text-2xl text-muted-foreground">{c.label}</p>
                </motion.div>
              ) : (
                <motion.article
                  key="paper"
                  initial={{ opacity: 0, y: 60, rotateX: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 110, damping: 16 }}
                  className="paper-grain relative rounded-[6px] bg-[#fffdfb] px-6 py-8 text-charcoal shadow-lift sm:px-10 sm:py-12"
                  style={{ backgroundImage: "repeating-linear-gradient(transparent 0 31px, #f1e4e8 31px 32px)" }}
                >
                  <p className="eyebrow !text-cherry/70">{c.label}</p>
                  <h2 className="font-display mt-3 text-[2.6rem] leading-[0.95]">{letter.title}</h2>
                  {letter.image_path ? (
                    <figure className="polaroid my-6 w-2/3 rotate-[-2deg]">
                      <PrivateImage path={letter.image_path} className="aspect-square rounded-[2px]" />
                    </figure>
                  ) : null}
                  <div className="font-display mt-5 text-[1.45rem] leading-[32px] whitespace-pre-wrap">{letter.body}</div>
                  <p className="font-display mt-8 text-right text-2xl">— {nameOf(letter.author_id)} ♡</p>
                  <p className="mt-6 text-[11.5px] text-charcoal/50">
                    geschrieben am {formatDate(letter.created_at)} · {letter.recipient_id ? `nur für ${nameOf(letter.recipient_id)}` : "für uns beide"}
                  </p>
                </motion.article>
              )}
            </AnimatePresence>
            {stage === "open" && letter.author_id === me.id ? (
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onEdit}><Pencil /> Bearbeiten</Button>
                <Button variant="ghost" size="sm" className="text-danger" onClick={onDelete}><Trash2 /> Löschen</Button>
              </div>
            ) : null}
          </DialogBody>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function LettersPage() {
  const { supabase, me, partner, nameOf } = useApp();
  const [tab, setTab] = React.useState<"inbox" | "sent">("inbox");
  const [reading, setReading] = React.useState<LoveLetter | null>(null);
  const [editor, setEditor] = React.useState<{ open: boolean; letter: LoveLetter | null; category?: string }>({ open: false, letter: null });

  const { data, loading, error, refetch } = useQuery(async () => {
    const [letters, sealed] = await Promise.all([supabase.from("love_letters").select("*").order("created_at", { ascending: false }), supabase.rpc("sealed_letters")]);
    return { letters: must(letters), sealed: (must(sealed) ?? []) as Sealed[] };
  }, []);
  useRealtimeRefetch(["love_letters"], refetch, "letters");

  // Re-check sealed letters every minute so they unlock on time.
  React.useEffect(() => {
    const next = data?.sealed[0]?.open_at;
    if (!next) return;
    const ms = new Date(next).getTime() - Date.now();
    if (ms > 2 ** 31 - 1) return;
    const t = window.setTimeout(() => void refetch(), Math.max(1000, ms + 1000));
    return () => window.clearTimeout(t);
  }, [data?.sealed, refetch]);

  const inbox = (data?.letters ?? []).filter((l) => l.author_id !== me.id);
  const sent = (data?.letters ?? []).filter((l) => l.author_id === me.id);
  const list = tab === "inbox" ? inbox : sent;

  const deleteLetter = async (l: LoveLetter) => {
    if (!window.confirm("Diesen Brief wirklich löschen?")) return;
    const { error } = await supabase.from("love_letters").delete().eq("id", l.id);
    if (error) return toast.error(errorMessage(error));
    if (l.image_path) void removeMedia([l.image_path]);
    setReading(null);
    void refetch();
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="love letters"
        title={<>open <em className="text-primary">when…</em></>}
        description={`Briefe für genau die richtigen Momente. Private Briefe sieht nur ${partner?.display_name ?? "der Empfänger"}, versiegelte erst ab dem geplanten Datum.`}
        actions={<Button size="lg" onClick={() => setEditor({ open: true, letter: null })}><PenLine /> Brief schreiben</Button>}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "inbox" | "sent")}>
        <TabsList>
          <TabsTrigger panel={false} value="inbox">Für mich {inbox.filter((l) => !l.opened_at).length ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{inbox.filter((l) => !l.opened_at).length}</span> : null}</TabsTrigger>
          <TabsTrigger panel={false} value="sent">Von mir</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[1.45]" />)}</div>
      ) : error ? (
        <ErrorState className="mt-8" message={error} onRetry={refetch} />
      ) : (
        <>
          {tab === "inbox" && data?.sealed.length ? (
            <section className="mt-8" aria-labelledby="sealed-title">
              <h2 id="sealed-title" className="eyebrow mb-4 flex items-center gap-2"><Clock className="size-3.5" /> versiegelt, bald für dich</h2>
              <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
                {data.sealed.map((s) => (
                  <div key={s.id} className="w-44 shrink-0">
                    <Envelope color={cat(s.category).color} sealed />
                    <p className="mt-2 text-[13px] font-medium">{cat(s.category).label}</p>
                    <p className="text-[12px] text-muted-foreground">von {nameOf(s.author_id)} · öffnet {formatDate(s.open_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8" aria-label="Briefe nach Kategorie">
            {list.length === 0 && tab === "sent" ? (
              <EmptyState title="no letters yet" description={`Schreib ${partner?.display_name ?? "deinem Schatz"} den ersten Brief für einen besonderen Moment.`} action={<Button onClick={() => setEditor({ open: true, letter: null })}><PenLine /> Ersten Brief schreiben</Button>} />
            ) : (
              <Reveal className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4" stagger={0.05}>
                {LETTER_CATEGORIES.filter((c) => c.id !== "anytime" || list.some((l) => l.category === "anytime")).map((c) => {
                  const letters = list.filter((l) => l.category === c.id);
                  const newest = letters[0];
                  const unread = tab === "inbox" && letters.some((l) => !l.opened_at);
                  return (
                    <div key={c.id} data-reveal className="group">
                      <button
                        className="block w-full text-left transition-transform duration-300 hover:-translate-y-1 hover:-rotate-1"
                        onClick={() => (newest ? setReading(newest) : setEditor({ open: true, letter: null, category: c.id }))}
                        aria-label={newest ? `${c.label}: ${letters.length} Brief(e) öffnen` : `${c.label}: Brief schreiben`}
                      >
                        <Envelope color={c.color} unread={unread} className={cn(!newest && "opacity-45 saturate-50")} />
                      </button>
                      <p className="mt-3 text-[14px] leading-tight font-medium">{c.label}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {letters.length ? `${letters.length} ${letters.length === 1 ? "Brief" : "Briefe"}` : tab === "inbox" ? "noch leer" : "schreib einen"}
                      </p>
                      {letters.length > 1 ? (
                        <ul className="mt-2 grid gap-1">
                          {letters.slice(1, 4).map((l) => (
                            <li key={l.id}>
                              <button onClick={() => setReading(l)} className="truncate text-left text-[12.5px] text-primary underline-offset-2 hover:underline">{l.title}</button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </Reveal>
            )}
          </section>
        </>
      )}

      <LetterReader
        letter={reading}
        onClose={() => setReading(null)}
        onEdit={() => {
          setEditor({ open: true, letter: reading });
          setReading(null);
        }}
        onDelete={() => reading && deleteLetter(reading)}
      />
      {editor.open ? <LetterEditor open onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))} letter={editor.letter} defaultCategory={editor.category} onSaved={() => void refetch()} /> : null}
    </PageContainer>
  );
}
