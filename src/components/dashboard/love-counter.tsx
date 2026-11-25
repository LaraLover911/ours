"use client";

import * as React from "react";
import { CalendarHeart } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberTicker } from "@/components/animations/number-ticker";
import { elapsedSince, formatDate } from "@/lib/utils/dates";
import { toast } from "sonner";
import { useNow as useNowMs } from "@/hooks/use-now";

function useNow(interval = 1000) {
  const ms = useNowMs(interval);
  return ms === null ? null : new Date(ms);
}

export function SetStartDate({ compact }: { compact?: boolean }) {
  const { updateSettings } = useApp();
  const [value, setValue] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className={compact ? "flex gap-2" : "mt-5 flex flex-col gap-2 sm:flex-row"}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value) return;
        setPending(true);
        const { error } = await updateSettings({ start_date: value });
        setPending(false);
        if (error) toast.error(error);
        else toast.success("Unser Tag ist gespeichert ♡");
      }}
    >
      <label htmlFor="start-date" className="sr-only">Unser Startdatum</label>
      <Input id="start-date" type="date" max={today} value={value} onChange={(e) => setValue(e.target.value)} required className="sm:max-w-[12rem]" />
      <Button type="submit" disabled={!value || pending}>
        <CalendarHeart /> Speichern
      </Button>
    </form>
  );
}

export function LoveCounter() {
  const { settings } = useApp();
  const now = useNow();

  if (!settings.start_date) {
    return (
      <div className="card-surface relative overflow-hidden p-6 sm:p-8">
        <p className="eyebrow">love counter</p>
        <h2 className="font-display mt-3 text-4xl leading-none sm:text-5xl">when did <em>us</em> begin?</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Trag euer Startdatum ein, dann zählt ours. jeden gemeinsamen Tag, jede Stunde, jede Sekunde mit.
        </p>
        <SetStartDate />
      </div>
    );
  }

  const e = now ? elapsedSince(settings.start_date, now) : null;
  const units = [
    { label: "Tage", value: e?.days ?? 0, ticker: true },
    { label: "Stunden", value: e?.hours ?? 0 },
    { label: "Minuten", value: e?.minutes ?? 0 },
    { label: "Sekunden", value: e?.seconds ?? 0 },
  ];

  return (
    <section aria-labelledby="counter-title" className="card-surface relative overflow-hidden p-6 sm:p-8">
      <div aria-hidden className="absolute -top-24 -right-16 size-64 rounded-full bg-primary-soft blur-2xl" />
      <div className="relative flex flex-wrap items-baseline justify-between gap-2">
        <p id="counter-title" className="eyebrow">together since {formatDate(settings.start_date)}</p>
        {e ? <p className="text-xs text-muted-foreground">{new Intl.NumberFormat("de-DE").format(e.totalHours)} Stunden voller uns</p> : null}
      </div>
      <dl className="relative mt-5 grid grid-cols-4 gap-2 sm:gap-4">
        {units.map((u) => (
          <div key={u.label} className="min-w-0">
            <dt className="sr-only">{u.label}</dt>
            <dd className="font-display text-[2.6rem] leading-none tabular-nums sm:text-7xl" aria-live={u.label === "Tage" ? "polite" : "off"}>
              {u.ticker && e ? <NumberTicker value={u.value} /> : String(u.value).padStart(2, "0")}
            </dd>
            <p className="mt-2 text-[11px] tracking-wide text-muted-foreground uppercase sm:text-xs">{u.label}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}

export { useNow };
