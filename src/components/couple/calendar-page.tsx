"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Hourglass, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { berlinDateString, formatDate, formatTime, fromLocalInputValue, toLocalInputValue } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

type CalEvent = Database["public"]["Tables"]["calendar_events"]["Row"];
type Countdown = Database["public"]["Tables"]["countdowns"]["Row"];
type Item = { id: string; title: string; start: Date; end?: Date | null; allDay: boolean; kind: "event" | "date" | "countdown" | "anniversary" | "capsule" | "google"; color: string; href?: string; event?: CalEvent };

const COLORS: Record<string, string> = { rose: "bg-[#e8a3b8]", lavender: "bg-[#b9acdf]", sage: "bg-[#9fc2a6]", ocean: "bg-[#93b7d3]", peach: "bg-[#f0b79a]" };
const KIND_COLOR: Record<Item["kind"], string> = { event: "", date: "bg-[#e8a3b8]", countdown: "bg-[#f0c86a]", anniversary: "bg-primary", capsule: "bg-[#b9acdf]", google: "bg-[#93b7d3]" };
const KIND_LABEL: Record<Item["kind"], string> = { event: "Termin", date: "Date", countdown: "Countdown", anniversary: "Jahrestag", capsule: "Zeitkapsel", google: "Google (nur du)" };
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const dayKey = (d: Date) => berlinDateString(d);

export function CalendarPage() {
  const { supabase, settings } = useApp();
  const now = useNow(1000);
  const [month, setMonth] = React.useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<CalEvent | "new" | null>(null);
  const [newCountdown, setNewCountdown] = React.useState(false);

  const events = useQuery(async () => must(await supabase.from("calendar_events").select("*").order("starts_at")), [supabase]);
  const countdowns = useQuery(async () => must(await supabase.from("countdowns").select("*").order("target_at")), [supabase]);
  const dates = useQuery(async () => must(await supabase.from("date_ideas").select("id, title, planned_for, status").not("planned_for", "is", null)), [supabase]);
  const capsules = useQuery(async () => must(await supabase.from("time_capsules").select("id, title, open_at")), [supabase]);
  const google = useQuery(async () => {
    const r = await fetch("/api/google/events?days=60", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return [] as { id: string; title: string; start: string | null; end: string | null; allDay: boolean }[];
    return (await r.json()).items as { id: string; title: string; start: string | null; end: string | null; allDay: boolean }[];
  }, []);
  useRealtimeRefetch(["calendar_events"], () => void events.refetch());
  useRealtimeRefetch(["countdowns"], () => void countdowns.refetch());

  const items = React.useMemo(() => {
    const out: Item[] = [];
    for (const e of events.data ?? []) out.push({ id: e.id, title: e.title, start: new Date(e.starts_at), end: e.ends_at ? new Date(e.ends_at) : null, allDay: e.all_day, kind: "event", color: COLORS[e.color] ?? COLORS.rose, event: e });
    for (const d of dates.data ?? []) if (d.planned_for) out.push({ id: `d-${d.id}`, title: d.title, start: new Date(d.planned_for), allDay: false, kind: "date", color: KIND_COLOR.date, href: "/dates" });
    for (const c of countdowns.data ?? []) out.push({ id: `c-${c.id}`, title: `${c.emoji} ${c.title}`, start: new Date(c.target_at), allDay: false, kind: "countdown", color: KIND_COLOR.countdown });
    for (const c of capsules.data ?? []) out.push({ id: `k-${c.id}`, title: `Zeitkapsel: ${c.title}`, start: new Date(c.open_at), allDay: false, kind: "capsule", color: KIND_COLOR.capsule, href: "/capsule" });
    for (const g of google.data ?? []) if (g.start) out.push({ id: `g-${g.id}`, title: g.title, start: new Date(g.start), end: g.end ? new Date(g.end) : null, allDay: g.allDay, kind: "google", color: KIND_COLOR.google });
    if (settings.start_date) {
      const [sy, sm, sd] = settings.start_date.split("-").map(Number);
      for (let k = -1; k <= 13; k++) {
        const base = new Date(month.y, month.m + k, 1);
        const day = Math.min(sd, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate());
        const at = new Date(Date.UTC(base.getFullYear(), base.getMonth(), day, 10));
        const months = (base.getFullYear() - sy) * 12 + (base.getMonth() - (sm - 1));
        if (months <= 0) continue;
        const yearly = months % 12 === 0;
        out.push({ id: `a-${months}`, title: yearly ? `${months / 12} Jahr${months === 12 ? "" : "e"} ihr zwei ♡` : `${months} Monate zusammen`, start: at, allDay: true, kind: "anniversary", color: KIND_COLOR.anniversary });
      }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events.data, dates.data, countdowns.data, capsules.data, google.data, settings.start_date, month]);

  const byDay = React.useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      const k = dayKey(it.start);
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return m;
  }, [items]);

  // Month grid (weeks start on Monday)
  const first = new Date(month.y, month.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(month.y, month.m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + daysIn) / 7) * 7 }, (_, i) => {
    const d = i - lead + 1;
    return d >= 1 && d <= daysIn ? new Date(Date.UTC(month.y, month.m, d, 12)) : null;
  });
  const today = now ? berlinDateString(new Date(now)) : null;
  const upcoming = items.filter((i) => now != null && i.start.getTime() >= now - 3600e3 * 12).slice(0, 12);
  const list = selected ? (byDay.get(selected) ?? []) : upcoming;
  const loading = events.loading || countdowns.loading;

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="our calendar"
        title={
          <>
            plans, <em className="text-primary">together</em>
          </>
        }
        description="Eure Termine, geplanten Dates, Countdowns, Jahrestage und Zeitkapseln an einem Ort."
        actions={
          <>
            <Button variant="soft" onClick={() => setNewCountdown(true)}>
              <Hourglass /> Countdown
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus /> Termin
            </Button>
          </>
        }
      />

      {countdowns.data?.length ? (
        <ul className="no-scrollbar -mx-1 mb-5 flex gap-3 overflow-x-auto px-1 pb-1">
          {countdowns.data.map((c) => (
            <CountdownCard key={c.id} c={c} now={now} onDelete={async () => {
              const { error } = await supabase.from("countdowns").delete().eq("id", c.id);
              if (error) toast.error(errorMessage(error));
              else void countdowns.refetch();
            }} />
          ))}
        </ul>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card-surface min-w-0 self-start p-3 sm:p-5" aria-label="Monat">
          <div className="mb-3 flex items-center gap-2">
            <Button size="icon-sm" variant="ghost" aria-label="Voriger Monat" onClick={() => setMonth((m) => (m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 }))}>
              <ChevronLeft />
            </Button>
            <h2 className="flex-1 text-center font-display text-2xl">{new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(first)}</h2>
            <Button size="icon-sm" variant="ghost" aria-label="Nächster Monat" onClick={() => setMonth((m) => (m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }))}>
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11.5px] text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = dayKey(d);
              const its = byDay.get(k) ?? [];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected((s) => (s === k ? null : k))}
                  aria-pressed={selected === k}
                  aria-label={`${formatDate(d, { day: "numeric", month: "long" })}${its.length ? `, ${its.length} Einträge` : ""}`}
                  className={cn(
                    "flex aspect-square min-w-0 flex-col items-center rounded-xl p-1 text-[13px] transition-colors hover:bg-muted sm:aspect-[1/0.9]",
                    today === k && "bg-primary-soft font-semibold text-primary-soft-foreground",
                    selected === k && "ring-2 ring-primary",
                  )}
                >
                  <span>{d.getUTCDate()}</span>
                  <span className="mt-auto flex flex-wrap justify-center gap-0.5 pb-0.5">
                    {its.slice(0, 4).map((it) => (
                      <span key={it.id} className={cn("size-1.5 rounded-full", it.color)} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
            {(["event", "date", "countdown", "anniversary", "capsule", "google"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={cn("size-2 rounded-full", k === "event" ? COLORS.rose : KIND_COLOR[k])} /> {KIND_LABEL[k]}
              </span>
            ))}
          </p>
        </section>

        <Section
          icon={<CalendarDays />}
          title={selected ? formatDate(new Date(`${selected}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long" }) : "Als Nächstes"}
          actions={selected ? <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Alle</Button> : null}
        >
          {loading ? (
            <Skeleton className="h-40" />
          ) : list.length ? (
            <ul className="space-y-2">
              {list.map((it) => (
                <li key={it.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", it.color)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium break-words">{it.title}</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {formatDate(it.start, { weekday: "short", day: "numeric", month: "short" })}
                      {it.allDay ? "" : ` · ${formatTime(it.start)}${it.end ? `–${formatTime(it.end)}` : ""}`} · {KIND_LABEL[it.kind]}
                    </p>
                    {it.event?.location ? (
                      <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
                        <MapPin className="size-3" /> {it.event.location}
                      </p>
                    ) : null}
                  </div>
                  {it.event ? (
                    <div className="flex shrink-0">
                      <Button size="icon-sm" variant="ghost" aria-label="Als Kalenderdatei (.ics) speichern" onClick={() => downloadIcs(it.event!)}>
                        <Download />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Bearbeiten" onClick={() => setEditing(it.event!)}>
                        <Pencil />
                      </Button>
                    </div>
                  ) : it.href ? (
                    <Link href={it.href} className="shrink-0 text-[12.5px] text-primary underline-offset-2 hover:underline">
                      öffnen
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted-foreground">{selected ? "An diesem Tag ist nichts eingetragen." : "Noch nichts geplant. Tragt euren nächsten Termin ein."}</p>
          )}
          {!settings.start_date ? (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Jahrestage erscheinen hier, sobald ihr auf der <Link href="/" className="underline">Startseite</Link> euer Datum eingetragen habt.
            </p>
          ) : null}
        </Section>
      </div>

      <EventEditor value={editing} onClose={() => setEditing(null)} onSaved={() => void events.refetch()} />
      <CountdownEditor open={newCountdown} onClose={() => setNewCountdown(false)} onSaved={() => void countdowns.refetch()} />
    </PageContainer>
  );
}

function CountdownCard({ c, now, onDelete }: { c: Countdown; now: number | null; onDelete: () => void }) {
  const ms = now == null ? null : new Date(c.target_at).getTime() - now;
  const parts =
    ms == null ? null : ms <= 0 ? null : { d: Math.floor(ms / 86400e3), h: Math.floor((ms % 86400e3) / 3600e3), m: Math.floor((ms % 3600e3) / 60e3), s: Math.floor((ms % 60e3) / 1000) };
  return (
    <li className="card-surface relative w-56 shrink-0 p-4">
      <p className="truncate pr-8 text-[14px] font-medium">
        {c.emoji} {c.title}
      </p>
      <p className="text-[12px] text-muted-foreground">{formatDate(c.target_at, { day: "numeric", month: "long", year: "numeric" })}</p>
      {parts ? (
        <p className="mt-2 font-display text-3xl tabular-nums">
          {parts.d}
          <span className="text-base text-muted-foreground"> T </span>
          {String(parts.h).padStart(2, "0")}:{String(parts.m).padStart(2, "0")}
          <span className="text-base text-muted-foreground">:{String(parts.s).padStart(2, "0")}</span>
        </p>
      ) : (
        <p className="mt-2 font-display text-3xl">{ms == null ? "…" : "Es ist so weit ♡"}</p>
      )}
      <Button size="icon-sm" variant="ghost" className="absolute top-2 right-2" aria-label={`Countdown ${c.title} löschen`} onClick={onDelete}>
        <Trash2 />
      </Button>
    </li>
  );
}

function EventEditor({ value, onClose, onSaved }: { value: CalEvent | "new" | null; onClose: () => void; onSaved: () => void }) {
  const { supabase } = useApp();
  const ev = value && value !== "new" ? value : null;
  const [allDay, setAllDay] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState<typeof value>(null);
  if (value !== seen) {
    setSeen(value);
    setAllDay(ev?.all_day ?? false);
  }
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            const startRaw = String(fd.get("start") ?? "");
            const endRaw = String(fd.get("end") ?? "");
            const start = allDay ? (startRaw ? new Date(`${startRaw}T00:00:00`).toISOString() : null) : fromLocalInputValue(startRaw);
            const end = endRaw ? (allDay ? new Date(`${endRaw}T23:59:00`).toISOString() : fromLocalInputValue(endRaw)) : null;
            if (!title || !start) return toast.error("Titel und Beginn fehlen.");
            if (end && end < start) return toast.error("Das Ende liegt vor dem Beginn.");
            const row = { title, starts_at: start, ends_at: end, all_day: allDay, location: String(fd.get("location") ?? "").trim() || null, note: String(fd.get("note") ?? "").trim() || null, color: String(fd.get("color") ?? "rose") };
            setBusy(true);
            const { error } = ev ? await supabase.from("calendar_events").update(row).eq("id", ev.id) : await supabase.from("calendar_events").insert(row);
            setBusy(false);
            if (error) return toast.error(errorMessage(error));
            onSaved();
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{ev ? "Termin bearbeiten" : "Neuer Termin"}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Titel" htmlFor="ev-title">
              <Input id="ev-title" name="title" defaultValue={ev?.title ?? ""} maxLength={140} required />
            </Field>
            <label className="flex items-center gap-3 text-[14px]">
              <Switch checked={allDay} onCheckedChange={setAllDay} /> Ganztägig
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Beginn" htmlFor="ev-start">
                <Input
                  key={`s-${allDay}`}
                  id="ev-start"
                  name="start"
                  type={allDay ? "date" : "datetime-local"}
                  defaultValue={ev ? (allDay ? berlinDateString(new Date(ev.starts_at)) : toLocalInputValue(ev.starts_at)) : ""}
                  required
                />
              </Field>
              <Field label="Ende (optional)" htmlFor="ev-end">
                <Input
                  key={`e-${allDay}`}
                  id="ev-end"
                  name="end"
                  type={allDay ? "date" : "datetime-local"}
                  defaultValue={ev?.ends_at ? (allDay ? berlinDateString(new Date(ev.ends_at)) : toLocalInputValue(ev.ends_at)) : ""}
                />
              </Field>
            </div>
            <Field label="Ort" htmlFor="ev-loc">
              <Input id="ev-loc" name="location" defaultValue={ev?.location ?? ""} maxLength={140} />
            </Field>
            <Field label="Notiz" htmlFor="ev-note">
              <Textarea id="ev-note" name="note" defaultValue={ev?.note ?? ""} maxLength={2000} rows={3} />
            </Field>
            <Field label="Farbe" htmlFor="ev-color">
              <NativeSelect id="ev-color" name="color" defaultValue={ev?.color ?? "rose"}>
                <option value="rose">Rosé</option>
                <option value="lavender">Lavendel</option>
                <option value="sage">Salbei</option>
                <option value="ocean">Ozean</option>
                <option value="peach">Pfirsich</option>
              </NativeSelect>
            </Field>
          </DialogBody>
          <DialogFooter>
            {ev ? (
              <Button
                type="button"
                variant="danger"
                className="sm:mr-auto"
                onClick={async () => {
                  const { error } = await supabase.from("calendar_events").delete().eq("id", ev.id);
                  if (error) return toast.error(errorMessage(error));
                  onSaved();
                  onClose();
                }}
              >
                <Trash2 /> Löschen
              </Button>
            ) : null}
            <Button type="submit" disabled={busy}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CountdownEditor({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { supabase } = useApp();
  const [notify, setNotify] = React.useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            const at = fromLocalInputValue(String(fd.get("at") ?? ""));
            if (!title || !at) return toast.error("Titel und Zeitpunkt fehlen.");
            const { error } = await supabase.from("countdowns").insert({ title, target_at: at, emoji: String(fd.get("emoji") ?? "⏳").slice(0, 8) || "⏳", notify });
            if (error) return toast.error(errorMessage(error));
            onSaved();
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Neuer Countdown</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <Field label="Emoji" htmlFor="cd-emoji">
                <Input id="cd-emoji" name="emoji" defaultValue="✈️" maxLength={8} />
              </Field>
              <Field label="Worauf freut ihr euch?" htmlFor="cd-title">
                <Input id="cd-title" name="title" maxLength={100} required placeholder="z. B. Wiedersehen" />
              </Field>
            </div>
            <Field label="Wann?" htmlFor="cd-at">
              <Input id="cd-at" name="at" type="datetime-local" required />
            </Field>
            <label className="flex items-center gap-3 text-[14px]">
              <Switch checked={notify} onCheckedChange={setNotify} /> Am Tag selbst benachrichtigen
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="submit">Starten</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A standard iCalendar file for one event, so it can be added to any calendar app. */
function downloadIcs(e: CalEvent) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = (iso: string, add = 0) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + add);
    return berlinDateString(d).replace(/-/g, "");
  };
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ours//calendar//DE",
    "BEGIN:VEVENT",
    `UID:${e.id}@ours`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    e.all_day ? `DTSTART;VALUE=DATE:${day(e.starts_at)}` : `DTSTART:${stamp(e.starts_at)}`,
    e.all_day ? `DTEND;VALUE=DATE:${day(e.ends_at ?? e.starts_at, 1)}` : `DTEND:${stamp(e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 3600e3).toISOString())}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : "",
    e.note ? `DESCRIPTION:${esc(e.note)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${e.title.replace(/[^\w\- äöüÄÖÜß]/g, "").slice(0, 40) || "termin"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
