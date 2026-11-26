"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, CircleAlert, CircleDashed, ExternalLink, Link2, Loader2, MapPin, Plug, Search, Send, Trash2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { errorMessage } from "@/lib/utils/errors";
import { timeAgo } from "@/lib/utils/dates";
import { weatherLabel, type WeatherResponse } from "@/lib/weather";

type Check = { configured: boolean; missing: string[] };
type Services = Record<"spotify" | "google_calendar" | "discord" | "open_meteo" | "osm" | "youtube" | "youtube_search" | "giphy" | "tenor" | "unsplash" | "tmdb", Check>;
type MediaItem = { id: string; title: string; subtitle?: string | null; thumb: string; link?: string | null; credit?: { text: string; url?: string | null } | null };

const ERRORS: Record<string, string> = {
  spotify_not_configured: "Spotify ist auf dem Server noch nicht eingerichtet.",
  spotify_denied: "Du hast die Spotify-Freigabe abgelehnt. Nichts wurde gespeichert.",
  spotify_state: "Die Spotify-Anmeldung ist abgelaufen. Bitte nochmal versuchen.",
  spotify_failed: "Spotify-Verbindung fehlgeschlagen. Ist dein Konto in der Spotify-App freigeschaltet?",
  google_not_configured: "Google Kalender ist auf dem Server noch nicht eingerichtet.",
  google_denied: "Du hast die Google-Freigabe abgelehnt. Nichts wurde gespeichert.",
  google_state: "Die Google-Anmeldung ist abgelaufen. Bitte nochmal versuchen.",
  google_scope: "Ohne Kalender-Leserecht kann ours. nichts anzeigen. Bitte die Kalender-Freigabe erlauben.",
  google_failed: "Google-Verbindung fehlgeschlagen.",
};
const CONNECTED: Record<string, string> = { spotify: "Spotify ist verbunden ♡", google_calendar: "Google Kalender ist verbunden ♡" };

export function IntegrationsPage() {
  const { supabase, me, partner, nameOf } = useApp();
  const router = useRouter();
  const status = useQuery(async () => {
    const r = await fetch("/api/integrations/status", { cache: "no-store" });
    if (!r.ok) throw new Error(`Status nicht abrufbar (${r.status})`);
    return ((await r.json()) as { services: Services }).services;
  }, []);
  const conns = useQuery(async () => must(await supabase.from("integration_connections").select("*")), [supabase]);
  useRealtimeRefetch(["integration_connections"], () => void conns.refetch());

  const handled = React.useRef(false);
  React.useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const q = new URLSearchParams(window.location.search);
    const err = q.get("error");
    const ok = q.get("connected");
    if (err) toast.error(ERRORS[err] ?? "Verbindung fehlgeschlagen.");
    if (ok) toast.success(CONNECTED[ok] ?? "Verbunden");
    if (err || ok) router.replace("/integrations");
  }, [router]);

  const conn = (provider: string, user = me.id) => conns.data?.find((c) => c.provider === provider && c.user_id === user) ?? null;
  const s = status.data;

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="integrations"
        title={
          <>
            connected, <em className="text-primary">carefully</em>
          </>
        }
        description="Alle Dienste laufen über den Server, Schlüssel und Tokens bleiben dort (verschlüsselt). Hier seht ihr, was verbunden ist, welche Rechte es hat und was noch fehlt."
      />
      {status.error ? <p className="mb-4 text-[14px] text-danger">{status.error}</p> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <OAuthCard
          title="Spotify"
          emoji="🎧"
          what="Listen Together: Songs suchen, Playlists, Wiedergabe in voller Länge (Premium) über das offizielle Web Playback SDK."
          perms="Profilname, Wiedergabe steuern, Playlists lesen. Kein Zugriff auf Passwort oder Zahlungsdaten."
          check={s?.spotify}
          mine={conn("spotify")}
          partnerConn={partner ? conn("spotify", partner.id) : null}
          partnerName={partner?.display_name ?? "dein Schatz"}
          connectHref="/api/integrations/spotify/connect"
          disconnect={async () => fetch("/api/integrations/spotify/disconnect", { method: "POST" })}
          onChanged={() => void conns.refetch()}
          note="Spotify-Apps im Entwicklungsmodus funktionieren nur für Konten, die im Spotify-Dashboard freigeschaltet sind."
        />
        <OAuthCard
          title="Google Kalender"
          emoji="📅"
          what="Zeigt deine nächsten Termine neben euren gemeinsamen Plänen. Nur lesen, ours. ändert nichts in Google."
          perms="E-Mail-Adresse (als Name der Verbindung), Termine lesen. Nur du siehst deine Google-Termine."
          check={s?.google_calendar}
          mine={conn("google_calendar")}
          partnerConn={partner ? conn("google_calendar", partner.id) : null}
          partnerName={partner?.display_name ?? "dein Schatz"}
          connectHref="/api/integrations/google/connect"
          disconnect={async () => fetch("/api/integrations/google/disconnect", { method: "POST" })}
          onChanged={() => void conns.refetch()}
          extra={conn("google_calendar")?.status === "connected" ? <GoogleEvents /> : null}
        />
        <DiscordCard check={s?.discord} mine={conn("discord")} onChanged={() => void conns.refetch()} />
        <WeatherCard meId={me.id} partnerId={partner?.id ?? null} nameOf={nameOf} />
        <SimpleCard title="OpenStreetMap" emoji="🗺️" check={s?.osm} what="Kartenbasis für eure Weltkarte. Orte gebt ihr selbst ein, es wird nie ein Standort automatisch ermittelt." perms="Keine Konten, keine Schlüssel. Kartenkacheln © OpenStreetMap-Mitwirkende." />
        <MediaCard title="YouTube" emoji="▶️" provider="youtube" check={s?.youtube_search} what="Links in Listen Together funktionieren immer (oEmbed, ohne Schlüssel). Die Suche braucht einen API-Schlüssel." />
        <MediaCard title="GIPHY" emoji="🎞️" provider="giphy" check={s?.giphy} what="GIFs suchen, z. B. für Nachrichten und Moodboards." />
        <MediaCard title="Tenor" emoji="🎬" provider="tenor" check={s?.tenor} what="Zweite GIF-Quelle (Google Tenor API)." />
        <MediaCard title="Unsplash" emoji="📷" provider="unsplash" check={s?.unsplash} what="Freie Fotos für euer Moodboard, immer mit Namensnennung." />
        <MediaCard title="TMDB" emoji="🍿" provider="tmdb" check={s?.tmdb} what="Filme und Serien für eure gemeinsame Watchlist." />
      </div>
      <p className="mt-6 text-[12.5px] text-muted-foreground">
        Was eingerichtet werden muss, steht in <code>docs/INTEGRATIONS.md</code> im Repository. Fehlende Werte werden nur mit Namen angezeigt, nie mit Inhalt.
      </p>
    </PageContainer>
  );
}

function StatusBadge({ check, connected, error }: { check: Check | undefined; connected?: boolean; error?: string | null }) {
  if (!check)
    return (
      <Badge variant="muted">
        <Loader2 className="animate-spin" /> prüfe…
      </Badge>
    );
  if (!check.configured)
    return (
      <Badge variant="outline">
        <CircleDashed /> nicht eingerichtet
      </Badge>
    );
  if (error)
    return (
      <Badge variant="outline" className="border-danger/40 text-danger">
        <CircleAlert /> Fehler
      </Badge>
    );
  if (connected === false)
    return (
      <Badge variant="muted">
        <Plug /> bereit
      </Badge>
    );
  return (
    <Badge>
      <CheckCircle2 /> {connected ? "verbunden" : "aktiv"}
    </Badge>
  );
}

function Missing({ check }: { check: Check | undefined }) {
  if (!check || check.configured) return null;
  return (
    <p className="mt-3 rounded-xl bg-muted p-3 text-[12.5px] text-muted-foreground">
      Auf dem Server fehlt: {check.missing.map((m, i) => (
        <React.Fragment key={m}>
          {i ? ", " : ""}
          <code className="text-foreground">{m}</code>
        </React.Fragment>
      ))}
    </p>
  );
}

function Card({ title, emoji, badge, children }: { title: string; emoji: string; badge: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card-surface min-w-0 p-5" aria-label={title}>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-xl" aria-hidden>
          {emoji}
        </span>
        <h2 className="min-w-0 flex-1 truncate font-display text-[1.7rem] leading-none">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

type Conn = { status: string; account_label: string | null; last_error: string | null; connected_at: string; scopes: string[] } | null;

function OAuthCard({
  title,
  emoji,
  what,
  perms,
  check,
  mine,
  partnerConn,
  partnerName,
  connectHref,
  disconnect,
  onChanged,
  note,
  extra,
}: {
  title: string;
  emoji: string;
  what: string;
  perms: string;
  check: Check | undefined;
  mine: Conn;
  partnerConn: Conn;
  partnerName: string;
  connectHref: string;
  disconnect: () => Promise<Response>;
  onChanged: () => void;
  note?: string;
  extra?: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);
  const err = mine && mine.status !== "connected" ? (mine.last_error ?? (mine.status === "expired" ? "Anmeldung abgelaufen, bitte neu verbinden" : "Fehler")) : null;
  return (
    <Card title={title} emoji={emoji} badge={<StatusBadge check={check} connected={!!mine} error={err} />}>
      <p className="text-[14px] text-pretty">{what}</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">Rechte: {perms}</p>
      {mine ? (
        <p className="mt-3 text-[13px]">
          Du: verbunden{mine.account_label ? ` als ${mine.account_label}` : ""} · {timeAgo(mine.connected_at)}
          {err ? <span className="block text-danger">{err}</span> : null}
        </p>
      ) : null}
      <p className="mt-1 text-[13px] text-muted-foreground">
        {partnerName}: {partnerConn ? (partnerConn.status === "connected" ? "verbunden" : "Verbindung gestört") : "nicht verbunden"}
      </p>
      <Missing check={check} />
      {note && check?.configured ? <p className="mt-2 text-[12px] text-muted-foreground">{note}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {check?.configured ? (
          <Button asChild size="sm" variant={mine && !err ? "outline" : "default"}>
            <a href={connectHref}>
              <Link2 /> {mine ? "Neu verbinden" : "Verbinden"}
            </a>
          </Button>
        ) : null}
        {mine ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await disconnect().catch(() => null);
              setBusy(false);
              if (!r?.ok) return toast.error("Trennen fehlgeschlagen");
              toast.success(`${title} getrennt. Gespeicherte Tokens sind gelöscht.`);
              onChanged();
            }}
          >
            <Unplug /> Trennen
          </Button>
        ) : null}
      </div>
      {extra}
    </Card>
  );
}

function GoogleEvents() {
  const [state, setState] = React.useState<{ loading: boolean; error: string | null; items: { id: string; title: string; start: string | null; allDay: boolean }[] | null }>({ loading: false, error: null, items: null });
  const load = async () => {
    setState({ loading: true, error: null, items: null });
    const r = await fetch("/api/google/events?days=14", { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    const ok = r?.ok && j.connected !== false;
    setState({ loading: false, error: ok ? null : (j.connected === false ? "Google Kalender ist nicht verbunden" : (j.error ?? "Nicht erreichbar")), items: ok ? j.items : null });
  };
  return (
    <div className="mt-4 border-t border-border pt-3">
      <Button size="sm" variant="soft" onClick={load} disabled={state.loading}>
        <CalendarDays /> Nächste 14 Tage
      </Button>
      {state.error ? <p className="mt-2 text-[13px] text-danger">{state.error}</p> : null}
      {state.items ? (
        state.items.length ? (
          <ul className="mt-2 space-y-1 text-[13px]">
            {state.items.slice(0, 8).map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                  {e.start ? new Date(e.start).toLocaleString("de-DE", e.allDay ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
                <span className="min-w-0 truncate">{e.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground">Keine Termine in den nächsten 14 Tagen.</p>
        )
      ) : null}
    </div>
  );
}

function DiscordCard({ check, mine, onChanged }: { check: Check | undefined; mine: Conn; onChanged: () => void }) {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const call = async (key: string, path: string, init: RequestInit, ok: string) => {
    setBusy(key);
    const r = await fetch(path, init).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return toast.error(j.error ?? "Fehlgeschlagen");
    toast.success(ok);
    onChanged();
    return true;
  };
  const err = mine && mine.status !== "connected" ? mine.last_error : null;
  return (
    <Card title="Discord" emoji="💬" badge={<StatusBadge check={check} connected={!!mine} error={err} />}>
      <p className="text-[14px] text-pretty">Schickt Nachrichten von ours. in einen Discord-Kanal deiner Wahl, über einen offiziellen Kanal-Webhook (kein Bot, kein Login).</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">Rechte: nur in diesen einen Kanal schreiben. Die Webhook-Adresse wird verschlüsselt gespeichert und nie wieder angezeigt.</p>
      {mine ? (
        <p className="mt-3 text-[13px]">
          Verbunden mit „{mine.account_label}“ · {timeAgo(mine.connected_at)}
          {err ? <span className="block text-danger">{err}</span> : null}
        </p>
      ) : null}
      <Missing check={check} />
      {check?.configured ? (
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("save", "/api/integrations/discord", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }, "Discord-Webhook gespeichert")) setUrl("");
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value.slice(0, 300))}
            placeholder="https://discord.com/api/webhooks/…"
            aria-label="Discord-Webhook-URL"
            className="min-w-0 flex-1"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" size="sm" disabled={!url || busy === "save"}>
            {mine ? "Ersetzen" : "Speichern"}
          </Button>
        </form>
      ) : null}
      {mine ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="soft" disabled={busy === "test"} onClick={() => call("test", "/api/integrations/discord/test", { method: "POST" }, "Testnachricht gesendet")}>
            <Send /> Testnachricht
          </Button>
          <Button size="sm" variant="ghost" disabled={busy === "del"} onClick={() => call("del", "/api/integrations/discord", { method: "DELETE" }, "Discord getrennt")}>
            <Unplug /> Trennen
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

type Place = { name: string; region: string | null; country: string | null; lat: number; lon: number; timezone: string | null };

function WeatherCard({ meId, partnerId, nameOf }: { meId: string; partnerId: string | null; nameOf: (id: string) => string }) {
  const { supabase } = useApp();
  const places = useQuery(async () => must(await supabase.from("weather_places").select("*")), [supabase]);
  useRealtimeRefetch(["weather_places"], () => void places.refetch());
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Place[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const mine = places.data?.find((p) => p.user_id === meId);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    const r = await fetch(`/api/weather/geocode?q=${encodeURIComponent(q)}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setSearching(false);
    if (!r?.ok) return toast.error(j.error ?? "Ortssuche nicht erreichbar");
    setHits(j.items);
  };
  const choose = async (p: Place) => {
    const { error } = await supabase.from("weather_places").upsert({ user_id: meId, name: p.name, country: p.country, lat: p.lat, lon: p.lon, timezone: p.timezone, updated_at: new Date().toISOString() });
    if (error) return toast.error(errorMessage(error));
    setHits(null);
    setQ("");
    void places.refetch();
  };
  const remove = async () => {
    const { error } = await supabase.from("weather_places").delete().eq("user_id", meId);
    if (error) return toast.error(errorMessage(error));
    void places.refetch();
  };

  return (
    <Card title="Wetter" emoji="🌦️" badge={<StatusBadge check={{ configured: true, missing: [] }} />}>
      <p className="text-[14px] text-pretty">Das Wetter bei euch beiden, von Open-Meteo (ohne Konto, ohne Schlüssel).</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">Den Ort gibst du selbst ein, z. B. deine Stadt. Es wird nie dein Standort abgefragt oder aus deiner Verbindung abgeleitet. Beide sehen die gespeicherte Stadt.</p>
      <div className="mt-3 space-y-2">
        {places.loading ? <Skeleton className="h-14" /> : null}
        {[meId, partnerId].filter(Boolean).map((uid) => (
          <WeatherRow key={uid} user={uid!} label={uid === meId ? "Du" : nameOf(uid!)} hasPlace={!!places.data?.some((p) => p.user_id === uid)} version={places.data?.find((p) => p.user_id === uid)?.updated_at ?? ""} />
        ))}
      </div>
      <form onSubmit={search} className="mt-3 flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))} placeholder={mine ? `Ort ändern (jetzt: ${mine.name})` : "Deine Stadt"} aria-label="Ort suchen" className="min-w-0 flex-1" />
        <Button type="submit" size="sm" variant="soft" disabled={q.trim().length < 2 || searching}>
          <Search /> Suchen
        </Button>
      </form>
      {hits ? (
        hits.length ? (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {hits.map((h) => (
              <li key={`${h.lat},${h.lon}`}>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-muted" onClick={() => choose(h)}>
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate">{[h.name, h.region, h.country].filter(Boolean).join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground">Nichts gefunden.</p>
        )
      ) : null}
      {mine ? (
        <Button size="sm" variant="ghost" className="mt-2" onClick={remove}>
          <Trash2 /> Meinen Ort löschen
        </Button>
      ) : null}
    </Card>
  );
}

function WeatherRow({ user, label, hasPlace, version }: { user: string; label: string; hasPlace: boolean; version: string }) {
  const w = useQuery(async () => {
    if (!hasPlace) return null;
    const r = await fetch(`/api/weather?user=${user}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Wetter nicht erreichbar");
    return j as WeatherResponse;
  }, [user, hasPlace, version]);
  if (!hasPlace) return <p className="text-[13px] text-muted-foreground">{label}: noch kein Ort gespeichert</p>;
  if (w.loading) return <Skeleton className="h-12" />;
  if (w.error || !w.data?.current) return <p className="text-[13px] text-danger">{label}: {w.error ?? "keine Daten"}</p>;
  const c = w.data.current;
  const l = weatherLabel(c.weather_code, c.is_day === 1);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
      <span className="text-2xl" aria-hidden>
        {l.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px]">
          <b className="font-medium">{label}</b> · {w.data.place.name}
        </p>
        <p className="text-[12.5px] text-muted-foreground">
          {Math.round(c.temperature_2m)}° ({l.text}, gefühlt {Math.round(c.apparent_temperature)}°)
          {w.data.daily ? ` · morgen ${Math.round(w.data.daily.temperature_2m_min[1])}–${Math.round(w.data.daily.temperature_2m_max[1])}°` : ""}
        </p>
      </div>
    </div>
  );
}

function SimpleCard({ title, emoji, check, what, perms }: { title: string; emoji: string; check: Check | undefined; what: string; perms: string }) {
  return (
    <Card title={title} emoji={emoji} badge={<StatusBadge check={check} />}>
      <p className="text-[14px] text-pretty">{what}</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{perms}</p>
    </Card>
  );
}

function MediaCard({ title, emoji, provider, check, what }: { title: string; emoji: string; provider: string; check: Check | undefined; what: string }) {
  const [q, setQ] = React.useState("");
  const [res, setRes] = React.useState<{ items: MediaItem[]; notice: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/media/search?provider=${provider}&q=${encodeURIComponent(q)}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) {
      setRes(null);
      return setError(j.error ?? "Nicht erreichbar");
    }
    setRes(j);
  };
  return (
    <Card title={title} emoji={emoji} badge={<StatusBadge check={check} />}>
      <p className="text-[14px] text-pretty">{what}</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">Keine Konten. Suchanfragen laufen über den Server, der Schlüssel bleibt dort.</p>
      <Missing check={check} />
      {check?.configured ? (
        <form onSubmit={run} className="mt-3 flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value.slice(0, 100))} placeholder="Probe-Suche" aria-label={`${title} durchsuchen`} className="min-w-0 flex-1" />
          <Button type="submit" size="sm" variant="soft" disabled={!q.trim() || busy}>
            <Search /> Testen
          </Button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
      {res ? (
        res.items.length ? (
          <>
            <ul className="mt-3 grid grid-cols-4 gap-1.5">
              {res.items.slice(0, 8).map((i) => (
                <li key={i.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote provider thumbnails, shown as-is with attribution */}
                  <img src={i.thumb} alt={i.title} loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {res.notice}
              {res.items[0]?.link ? (
                <a href={res.items[0].link} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline underline-offset-2">
                  Quelle <ExternalLink className="size-3" />
                </a>
              ) : null}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground">Keine Treffer.</p>
        )
      ) : null}
    </Card>
  );
}
