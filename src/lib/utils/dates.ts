const TZ = "Europe/Berlin";

export function berlinDateString(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function formatDate(value: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  const d = typeof value === "string" ? parseDateish(value) : value;
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).format(d);
}

export function formatTime(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Parses "YYYY-MM-DD" as a local calendar date (noon, so no TZ day shift) or a full ISO timestamp. */
export function parseDateish(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12));
  }
  return new Date(value);
}

export function relativeDay(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  const today = berlinDateString();
  const that = berlinDateString(d);
  if (today === that) return "Heute";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (berlinDateString(y) === that) return "Gestern";
  const diffDays = Math.abs(Date.now() - d.getTime()) / 86400000;
  if (diffDays < 6) return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(d);
  return formatDate(d, { day: "numeric", month: "long", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function timeAgo(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "gerade eben";
  const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
  const m = Math.round(s / 60);
  if (m < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const days = Math.round(h / 24);
  if (days < 30) return rtf.format(-days, "day");
  return formatDate(d);
}

/** Time since a start date (local midnight), split into units. */
export function elapsedSince(startDate: string, now = new Date()) {
  const [y, m, d] = startDate.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0);
  const ms = Math.max(0, now.getTime() - start.getTime());
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalHours: Math.floor(totalSeconds / 3600),
    future: now.getTime() < start.getTime(),
  };
}

/** Next yearly anniversary of a start date (today counts if it's today). */
export function nextAnniversary(startDate: string, now = new Date()) {
  const [y, m, d] = startDate.split("-").map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let year = Math.max(now.getFullYear(), y + 1);
  let next = new Date(year, m - 1, d);
  if (next < today) {
    year += 1;
    next = new Date(year, m - 1, d);
  }
  const days = Math.round((next.getTime() - today.getTime()) / 86400000);
  return { date: next, years: year - y, days };
}

/** Next monthly "monthsary" (e.g. the 14th of every month). */
export function nextMonthsary(startDate: string, now = new Date()) {
  const [y, m, d] = startDate.split("-").map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let cand = new Date(now.getFullYear(), now.getMonth(), Math.min(d, daysInMonth(now.getFullYear(), now.getMonth())));
  if (cand < today) {
    const ny = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const nm = (now.getMonth() + 1) % 12;
    cand = new Date(ny, nm, Math.min(d, daysInMonth(ny, nm)));
  }
  const months = (cand.getFullYear() - y) * 12 + (cand.getMonth() - (m - 1));
  const days = Math.round((cand.getTime() - today.getTime()) / 86400000);
  return { date: cand, months, days };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(v: string) {
  return v ? new Date(v).toISOString() : null;
}

/** "26.11.2026, 07:15" in Berlin time. */
export function formatDateTime(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}
