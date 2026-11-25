"use client";

import * as React from "react";
import { BookHeart, Lock, MessageCircle, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Reveal } from "@/components/animations/reveal";
import { Avatar } from "@/components/shared/avatar";
import { Comments } from "@/components/shared/comments";
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
import { MOODS } from "@/lib/constants";
import { removeMedia } from "@/lib/supabase/media";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, fromLocalInputValue, toLocalInputValue } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { DiaryEntry } from "@/types/app";

const VIS = [
  { id: "mine", label: "Mein Eintrag", hint: "Von dir, für beide lesbar", icon: BookHeart },
  { id: "ours", label: "Our Entry", hint: "Gemeinsam, beide können bearbeiten", icon: Users },
  { id: "private", label: "Privat", hint: "Nur du kannst ihn lesen", icon: Lock },
] as const;

function EntryEditor({ open, onOpenChange, entry, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; entry: DiaryEntry | null; onSaved: () => void }) {
  const { supabase, me } = useApp();
  const [mood, setMood] = React.useState<string | null>(entry?.mood ?? null);
  const [visibility, setVisibility] = React.useState<string>(entry?.visibility ?? "mine");
  const [images, setImages] = React.useState<PickedMedia[]>(() => (entry?.image_paths ?? []).map((p) => ({ path: p, kind: "image" as const })));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isAuthor = !entry || entry.author_id === me.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body = String(fd.get("body") ?? "").trim();
            if (!body) return setError("Schreib ein paar Worte.");
            setPending(true);
            const row = {
              title: String(fd.get("title") ?? "").trim().slice(0, 140) || null,
              body: body.slice(0, 20000),
              mood,
              entry_at: fromLocalInputValue(String(fd.get("entry_at") ?? "")) ?? new Date().toISOString(),
              image_paths: images.map((i) => i.path),
              ...(isAuthor ? { visibility } : {}),
            };
            const res = entry ? await supabase.from("diary_entries").update(row).eq("id", entry.id) : await supabase.from("diary_entries").insert({ ...row, visibility, author_id: me.id });
            setPending(false);
            if (res.error) return setError(errorMessage(res.error));
            const removed = (entry?.image_paths ?? []).filter((p) => !row.image_paths.includes(p) && p.startsWith(me.id));
            if (removed.length) void removeMedia(removed);
            toast.success("Eintrag gespeichert");
            onSaved();
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{entry ? "edit entry" : "dear diary,"}</DialogTitle>
            <DialogDescription>Wie war dein Tag? Was willst du nicht vergessen?</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            {isAuthor ? (
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium">Sichtbarkeit</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {VIS.map((v) => (
                    <label key={v.id} className={cn("flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-[13px] transition-colors", visibility === v.id ? "border-primary bg-primary-soft" : "border-border hover:bg-muted")}>
                      <input type="radio" name="vis" value={v.id} checked={visibility === v.id} onChange={() => setVisibility(v.id)} className="sr-only" />
                      <span className="flex items-center gap-1.5 font-medium"><v.icon className="size-3.5" /> {v.label}</span>
                      <span className="text-muted-foreground">{v.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium">Emotion des Tages</legend>
              <div className="flex flex-wrap gap-1.5">
                {MOODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMood(mood === m.id ? null : m.id)}
                    aria-pressed={mood === m.id}
                    className={cn("h-9 rounded-full border px-3 text-[13px] transition-all", mood === m.id ? "scale-105 border-primary bg-primary-soft" : "border-border hover:bg-muted")}
                  >
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Titel (optional)" htmlFor="d-title">
                <Input id="d-title" name="title" maxLength={140} defaultValue={entry?.title ?? ""} />
              </Field>
              <Field label="Datum & Uhrzeit" htmlFor="d-at">
                <Input id="d-at" name="entry_at" type="datetime-local" defaultValue={toLocalInputValue(entry?.entry_at ?? new Date().toISOString())} />
              </Field>
            </div>
            <Field label="Eintrag" htmlFor="d-body">
              <Textarea id="d-body" name="body" required maxLength={20000} defaultValue={entry?.body} className="min-h-48 text-[16px] leading-relaxed" />
            </Field>
            <MediaPicker value={images} onChange={setImages} area="diary" max={6} accept="image/*" privateFiles={visibility === "private"} label="Bild" />
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={pending}>Speichern</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DiaryPage() {
  const { supabase, me, partner, profiles } = useApp();
  const [filter, setFilter] = React.useState("all");
  const [editor, setEditor] = React.useState<{ open: boolean; entry: DiaryEntry | null }>({ open: false, entry: null });
  const [commentsFor, setCommentsFor] = React.useState<string | null>(null);

  const { data, loading, error, refetch } = useQuery(async () => must(await supabase.from("diary_entries").select("*").order("entry_at", { ascending: false })), []);
  useRealtimeRefetch(["diary_entries"], refetch, "diary");

  const filtered = (data ?? []).filter((e) =>
    filter === "all" ? true : filter === "ours" ? e.visibility === "ours" : filter === "me" ? e.author_id === me.id && e.visibility !== "ours" : e.author_id === partner?.id && e.visibility !== "ours",
  );

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="our diary"
        title={<>dear <em className="text-primary">us,</em></>}
        description="Ein Tagebuch für zwei. Private Einträge kann wirklich nur der Ersteller lesen."
        actions={<Button size="lg" onClick={() => setEditor({ open: true, entry: null })}><Plus /> Eintrag</Button>}
      />
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger panel={false} value="all">Alle</TabsTrigger>
          <TabsTrigger panel={false} value="me">{me.display_name}&apos;s Entries</TabsTrigger>
          <TabsTrigger panel={false} value="partner">{partner?.display_name ?? "…"}&apos;s Entries</TabsTrigger>
          <TabsTrigger panel={false} value="ours">Our Entries</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-[var(--radius-xl)]" />)}</div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !filtered.length ? (
          <EmptyState title="a blank page" description="Noch keine Einträge hier. Schreib den ersten, vielleicht über heute?" action={<Button onClick={() => setEditor({ open: true, entry: null })}><Plus /> Schreiben</Button>} />
        ) : (
          <Reveal as="ul" className="grid gap-5" stagger={0.06}>
            {filtered.map((e) => {
              const author = profiles[e.author_id];
              const mood = MOODS.find((m) => m.id === e.mood);
              const ours = e.visibility === "ours";
              const mine = e.author_id === me.id;
              const tone = ours ? "border-l-primary" : author?.role === "lara" ? "border-l-dusty-rose" : "border-l-charcoal/40 dark:border-l-cream/40";
              return (
                <li key={e.id} data-reveal>
                  <article className={cn("card-surface overflow-hidden border-l-4", tone, ours && "bg-[linear-gradient(135deg,var(--card)_60%,var(--primary-soft))]")}>
                    <div className="p-5 sm:p-7">
                      <header className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {ours ? (
                            <span className="flex -space-x-2"><Avatar profile={me} size="sm" ring /><Avatar profile={partner} size="sm" ring /></span>
                          ) : (
                            <Avatar profile={author} size="sm" />
                          )}
                          <div className="text-[13px] leading-tight">
                            <p className="font-medium">
                              {ours ? "Our Entry" : `${author?.display_name ?? "?"}'s Entry`}
                              {e.visibility === "private" ? <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><Lock className="size-3" /> privat</span> : null}
                            </p>
                            <p className="text-muted-foreground">{formatDate(e.entry_at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {formatTime(e.entry_at)}</p>
                          </div>
                        </div>
                        {mood ? <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[12px]" title={mood.label}>{mood.emoji} {mood.label}</span> : null}
                      </header>
                      {e.title ? <h2 className="font-display mt-4 text-[2rem] leading-none">{e.title}</h2> : null}
                      <p className="mt-3 text-[15.5px] leading-relaxed whitespace-pre-wrap">{e.body}</p>
                      {e.image_paths.length ? (
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          {e.image_paths.map((p) => <PrivateImage key={p} path={p} className="aspect-square rounded-xl" />)}
                        </div>
                      ) : null}
                      <footer className="mt-5 flex flex-wrap items-center gap-1">
                        {e.visibility !== "private" ? (
                          <Button variant="ghost" size="sm" onClick={() => setCommentsFor(commentsFor === e.id ? null : e.id)} aria-expanded={commentsFor === e.id}>
                            <MessageCircle /> Kommentare
                          </Button>
                        ) : null}
                        {mine || ours ? <Button variant="ghost" size="sm" onClick={() => setEditor({ open: true, entry: e })}><Pencil /> Bearbeiten</Button> : null}
                        {mine ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onClick={async () => {
                              if (!window.confirm("Eintrag löschen?")) return;
                              const { error } = await supabase.from("diary_entries").delete().eq("id", e.id);
                              if (error) return toast.error(errorMessage(error));
                              void removeMedia(e.image_paths.filter((p) => p.startsWith(me.id)));
                              void refetch();
                            }}
                          >
                            <Trash2 /> Löschen
                          </Button>
                        ) : null}
                      </footer>
                      {commentsFor === e.id ? <Comments table="diary_comments" parentKey="entry_id" parentId={e.id} /> : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </Reveal>
        )}
      </div>
      {editor.open ? <EntryEditor open onOpenChange={(o) => setEditor((s) => ({ ...s, open: o }))} entry={editor.entry} onSaved={() => void refetch()} /> : null}
    </PageContainer>
  );
}
