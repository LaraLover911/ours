"use client";

import * as React from "react";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Heart, LayoutGrid, MapPin, Pencil, Plus, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Reveal } from "@/components/animations/reveal";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { DATE_CATEGORIES, DATE_STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, fromLocalInputValue, toLocalInputValue } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { DateIdea, DateVote } from "@/types/app";
import { useNow } from "@/hooks/use-now";

type IdeaWithVotes = DateIdea & { date_votes: DateVote[] };
const catOf = (id: string) => DATE_CATEGORIES.find((c) => c.id === id) ?? DATE_CATEGORIES[5];
const PROMPTS = ["movie night?", "let's go somewhere together", "our next little adventure", "picnic at sunset", "cook something new together"];

export function DateEditor({ open, onOpenChange, idea, preset, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; idea: DateIdea | null; preset?: Partial<DateIdea>; onSaved: () => void }) {
  const { supabase, me } = useApp();
  const [reminder, setReminder] = React.useState(idea?.reminder ?? true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const v = idea ?? preset ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            const link = String(fd.get("link") ?? "").trim();
            if (!title) return setError("Gib der Idee einen Titel.");
            if (link && !/^https?:\/\//.test(link)) return setError("Der Link muss mit https:// beginnen.");
            const planned = fromLocalInputValue(String(fd.get("planned_for") ?? ""));
            let status = String(fd.get("status"));
            if (planned && status === "idee") status = "geplant";
            const row = {
              title: title.slice(0, 140),
              description: String(fd.get("description") ?? "").trim() || null,
              category: String(fd.get("category")),
              status,
              planned_for: planned,
              location: String(fd.get("location") ?? "").trim() || null,
              link: link || null,
              reminder,
            };
            setPending(true);
            const res = idea ? await supabase.from("date_ideas").update(row).eq("id", idea.id) : await supabase.from("date_ideas").insert({ ...row, created_by: me.id });
            setPending(false);
            if (res.error) return setError(errorMessage(res.error));
            toast.success(idea ? "Gespeichert" : "Neue Date-Idee ♡");
            onSaved();
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{idea ? "edit date" : "new date idea"}</DialogTitle>
            <DialogDescription>Restaurant, Kino, Reise oder einfach Zeit zusammen.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Was?" htmlFor="di-title">
              <Input id="di-title" name="title" required maxLength={140} defaultValue={v.title ?? ""} placeholder="movie night?" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kategorie" htmlFor="di-cat">
                <NativeSelect id="di-cat" name="category" defaultValue={v.category ?? "aktivitaet"}>
                  {DATE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Status" htmlFor="di-status">
                <NativeSelect id="di-status" name="status" defaultValue={v.status ?? "idee"}>
                  {DATE_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Wann?" htmlFor="di-when">
                <Input id="di-when" name="planned_for" type="datetime-local" defaultValue={toLocalInputValue(v.planned_for)} />
              </Field>
              <Field label="Wo?" htmlFor="di-loc">
                <Input id="di-loc" name="location" maxLength={140} defaultValue={v.location ?? ""} />
              </Field>
            </div>
            <Field label="Link (optional)" htmlFor="di-link">
              <Input id="di-link" name="link" type="url" inputMode="url" defaultValue={v.link ?? ""} placeholder="https://…" />
            </Field>
            <Field label="Notizen" htmlFor="di-desc">
              <Textarea id="di-desc" name="description" maxLength={2000} defaultValue={v.description ?? ""} />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <span className="flex items-center gap-2 text-sm"><Bell className="size-4 text-primary" /> Erinnerung auf der Startseite & hier</span>
              <Switch checked={reminder} onCheckedChange={setReminder} aria-label="Erinnerung" />
            </label>
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

function IdeaCard({ idea, onEdit, onChanged }: { idea: IdeaWithVotes; onEdit: () => void; onChanged: () => void }) {
  const { supabase, me, partner, profiles } = useApp();
  const c = catOf(idea.category);
  const myVote = idea.date_votes.find((v) => v.user_id === me.id)?.value;
  const partnerVote = idea.date_votes.find((v) => v.user_id === partner?.id)?.value;
  const both = myVote === 1 && partnerVote === 1;

  const vote = async (value: 1 | -1) => {
    const res = myVote === value
      ? await supabase.from("date_votes").delete().match({ idea_id: idea.id, user_id: me.id })
      : await supabase.from("date_votes").upsert({ idea_id: idea.id, user_id: me.id, value });
    if (res.error) toast.error(errorMessage(res.error));
    onChanged();
  };

  const update = async (patch: Partial<DateIdea>) => {
    const { error } = await supabase.from("date_ideas").update(patch).eq("id", idea.id);
    if (error) toast.error(errorMessage(error));
    onChanged();
  };

  return (
    <article data-reveal className={cn("card-surface group relative flex flex-col gap-3 p-4", idea.status === "erledigt" && "opacity-75")}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-lg" aria-hidden>{c.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-medium leading-snug", idea.status === "erledigt" && "line-through decoration-primary/50")}>{idea.title}</h3>
          <p className="text-[12px] text-muted-foreground">{c.label} · von {profiles[idea.created_by]?.display_name}</p>
        </div>
        <button onClick={() => update({ is_favorite: !idea.is_favorite })} className={cn("grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted", idea.is_favorite ? "text-primary" : "text-muted-foreground")} aria-label="Favorit" aria-pressed={idea.is_favorite}>
          <Heart className={cn("size-4", idea.is_favorite && "fill-current")} />
        </button>
      </div>
      {idea.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{idea.description}</p> : null}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
        {idea.planned_for ? <span className="flex items-center gap-1 text-foreground"><CalendarDays className="size-3.5" /> {formatDate(idea.planned_for, { weekday: "short", day: "numeric", month: "short" })}, {formatTime(idea.planned_for)}</span> : null}
        {idea.location ? <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {idea.location}</span> : null}
        {idea.link ? <a href={idea.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="size-3.5" /> Link</a> : null}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-1" role="group" aria-label="Abstimmung">
          <button onClick={() => vote(1)} aria-pressed={myVote === 1} className={cn("flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px]", myVote === 1 ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border hover:bg-muted")}>
            <ThumbsUp className="size-3.5" /> ja!
          </button>
          <button onClick={() => vote(-1)} aria-pressed={myVote === -1} className={cn("flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px]", myVote === -1 ? "border-border-strong bg-muted" : "border-border hover:bg-muted")}>
            <ThumbsDown className="size-3.5" />
          </button>
          {partnerVote ? (
            <span className="ml-1 flex items-center gap-1 text-[12px] text-muted-foreground">
              <Avatar profile={partner} size="xs" /> {partnerVote === 1 ? "👍" : "👎"}
            </span>
          ) : null}
          {both ? <span className="ml-1 text-[12px] font-medium text-primary">it&apos;s a match ♡</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <label htmlFor={`st-${idea.id}`} className="sr-only">Status</label>
          <select id={`st-${idea.id}`} value={idea.status} onChange={(e) => update({ status: e.target.value })} className="h-8 rounded-full border border-border bg-card px-2.5 text-[12px] outline-none focus-visible:ring-4 focus-visible:ring-ring">
            {DATE_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={onEdit} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Bearbeiten"><Pencil className="size-3.5" /></button>
          <button
            onClick={async () => {
              if (!window.confirm("Date-Idee löschen?")) return;
              const { error } = await supabase.from("date_ideas").delete().eq("id", idea.id);
              if (error) toast.error(errorMessage(error));
              onChanged();
            }}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger"
            aria-label="Löschen"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

function CalendarView({ ideas, onPick }: { ideas: IdeaWithVotes[]; onPick: (i: IdeaWithVotes) => void }) {
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => i - first + 1);
  const todayKey = new Date().toDateString();
  const byDay = new Map<number, IdeaWithVotes[]>();
  ideas.forEach((i) => {
    if (!i.planned_for) return;
    const d = new Date(i.planned_for);
    if (d.getFullYear() === year && d.getMonth() === month) byDay.set(d.getDate(), [...(byDay.get(d.getDate()) ?? []), i]);
  });

  return (
    <div className="card-surface p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-3xl capitalize">{new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(cursor)}</h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Vorheriger Monat"><ChevronLeft /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Heute</Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Nächster Monat"><ChevronRight /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const inMonth = d >= 1 && d <= days;
          const list = inMonth ? (byDay.get(d) ?? []) : [];
          const isToday = inMonth && new Date(year, month, d).toDateString() === todayKey;
          return (
            <div key={i} className={cn("min-h-16 rounded-lg p-1 text-left sm:min-h-24 sm:p-1.5", inMonth ? "bg-background" : "opacity-0", isToday && "ring-2 ring-primary/50")}>
              {inMonth ? <span className={cn("text-[11px]", isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{d}</span> : null}
              <div className="mt-0.5 grid gap-0.5">
                {list.slice(0, 3).map((idea) => (
                  <button key={idea.id} onClick={() => onPick(idea)} className="truncate rounded-md bg-primary-soft px-1 py-0.5 text-left text-[10.5px] text-primary-soft-foreground sm:text-[11.5px]">
                    <span aria-hidden>{catOf(idea.category).emoji}</span> <span className="hidden sm:inline">{idea.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DatesPage() {
  const { supabase } = useApp();
  const [view, setView] = React.useState<"board" | "calendar">("board");
  const [status, setStatus] = React.useState("idee");
  const [category, setCategory] = React.useState("all");
  const [editor, setEditor] = React.useState<{ open: boolean; idea: DateIdea | null; preset?: Partial<DateIdea> }>({ open: false, idea: null });

  const { data, loading, error, refetch } = useQuery(async () => must(await supabase.from("date_ideas").select("*, date_votes(*)").order("planned_for", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })) as IdeaWithVotes[], []);
  useRealtimeRefetch(["date_ideas", "date_votes"], refetch, "dates");

  const filtered = (data ?? []).filter((i) => category === "all" || (category === "fav" ? i.is_favorite : i.category === category));
  const now = useNow(60_000) ?? 0;
  const upcoming = (data ?? []).filter((i) => i.reminder && i.status === "geplant" && i.planned_for && new Date(i.planned_for).getTime() > now && new Date(i.planned_for).getTime() - now < 7 * 86400000);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="date planner"
        title={<>our next little <em className="text-primary">adventure</em></>}
        description="Ideen sammeln, abstimmen, planen, erleben."
        actions={<Button size="lg" onClick={() => setEditor({ open: true, idea: null })}><Plus /> Idee</Button>}
      />

      {upcoming.length ? (
        <div className="mb-6 flex flex-col gap-2 rounded-2xl bg-primary-soft px-4 py-3 text-primary-soft-foreground sm:flex-row sm:items-center">
          <Bell className="size-4 shrink-0" />
          <p className="text-sm">
            {upcoming.map((u, i) => (
              <span key={u.id}>
                {i ? " · " : ""}<strong>{u.title}</strong> {formatDate(u.planned_for!, { weekday: "long", hour: "2-digit", minute: "2-digit" })}
              </span>
            ))}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as "board" | "calendar")}>
          <TabsList>
            <TabsTrigger panel={false} value="board"><LayoutGrid /> Board</TabsTrigger>
            <TabsTrigger panel={false} value="calendar"><CalendarDays /> Kalender</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {[{ id: "all", label: "Alle", emoji: "" }, { id: "fav", label: "Favoriten", emoji: "♥" }, ...DATE_CATEGORIES].map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)} aria-pressed={category === c.id} className={cn("h-9 shrink-0 rounded-full border px-3.5 text-[13px]", category === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
              {c.emoji ? `${c.emoji} ` : ""}{c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-[var(--radius-xl)]" />)}</div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !data?.length ? (
          <EmptyState
            title="no plans yet"
            description="Sammelt eure ersten Ideen. Ein Klick auf einen Vorschlag füllt nur das Formular aus."
            action={PROMPTS.map((p) => <Button key={p} variant="outline" size="sm" onClick={() => setEditor({ open: true, idea: null, preset: { title: p } })}>{p}</Button>)}
          />
        ) : view === "calendar" ? (
          <CalendarView ideas={filtered} onPick={(i) => setEditor({ open: true, idea: i })} />
        ) : (
          <>
            <div className="mb-4 lg:hidden">
              <Tabs value={status} onValueChange={setStatus}>
                <TabsList className="w-full">
                  {DATE_STATUS.map((s) => <TabsTrigger key={s.id} value={s.id} className="flex-1">{s.label} <span className="text-muted-foreground">{filtered.filter((i) => i.status === s.id).length}</span></TabsTrigger>)}
                </TabsList>
              </Tabs>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {DATE_STATUS.map((s) => {
                const col = filtered.filter((i) => i.status === s.id);
                return (
                  <section key={s.id} aria-label={s.label} className={cn(status !== s.id && "hidden lg:block")}>
                    <h2 className="mb-3 hidden items-center justify-between lg:flex">
                      <span className="font-display text-3xl">{s.label}</span>
                      <span className="text-sm text-muted-foreground">{col.length}</span>
                    </h2>
                    <Reveal key={`${s.id}-${category}`} className="grid gap-3" stagger={0.05} y={14}>
                      {col.map((i) => <IdeaCard key={i.id} idea={i} onEdit={() => setEditor({ open: true, idea: i })} onChanged={() => void refetch()} />)}
                      {!col.length ? <p data-reveal className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">Hier ist noch nichts.</p> : null}
                    </Reveal>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
      {editor.open ? <DateEditor open onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))} idea={editor.idea} preset={editor.preset} onSaved={() => void refetch()} /> : null}
    </PageContainer>
  );
}
