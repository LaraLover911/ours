"use client";

import * as React from "react";
import { BatteryCharging, BatteryMedium, Check, Laptop, LogOut, Monitor, Pencil, ShieldCheck, Smartphone, Tablet, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useNow } from "@/hooks/use-now";
import { useQuery } from "@/hooks/use-query";
import { getDeviceId } from "@/lib/device";
import { APP_VERSION, collectDeviceInfo, type DeviceInfo } from "@/lib/presence/device-info";
import { errorMessage } from "@/lib/utils/errors";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type Device = Database["public"]["Functions"]["devices_overview"]["Returns"][number];
type Share = Record<string, boolean>;

const NA = "Nicht verfügbar";
const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "visible", label: "Gerät zeigen", hint: "Aus: dieses Gerät ist für {partner} unsichtbar" },
  { key: "os", label: "Betriebssystem", hint: "z. B. iOS 18.2" },
  { key: "browser", label: "Browser", hint: "z. B. Safari 18" },
  { key: "screen", label: "Bildschirm & Fenster", hint: "Auflösung und Fenstergröße" },
  { key: "pwa", label: "App-Modus", hint: "Ob ours. als App installiert ist" },
  { key: "app", label: "App-Version", hint: "Welche Version von ours. läuft" },
  { key: "connection", label: "Verbindungsart", hint: "WLAN/Mobilfunk, falls der Browser es verrät" },
  { key: "battery", label: "Akku", hint: "Stand und ob es lädt, falls der Browser es verrät" },
];

function DeviceIcon({ type, className }: { type: string; className?: string }) {
  const Icon = type === "mobile" ? Smartphone : type === "tablet" ? Tablet : type === "desktop" ? Laptop : Monitor;
  return <Icon className={className} />;
}

function ago(iso: string | null, serverOffset: number, now: number | null) {
  if (!iso) return "verborgen";
  if (now == null) return "…";
  const s = Math.max(0, Math.round((now + serverOffset - new Date(iso).getTime()) / 1000));
  if (s < 10) return "gerade eben";
  if (s < 60) return `vor ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 48) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

function Fact({ label, value, hidden }: { label: string; value: React.ReactNode; hidden?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className={cn("truncate text-[14px]", (hidden || value === NA) && "text-muted-foreground italic")}>{hidden ? "verborgen" : value}</dd>
    </div>
  );
}

function DeviceCard({
  d,
  live,
  here,
  online,
  offset,
  onRename,
  onEnd,
  onShare,
  partnerName = "dein Schatz",
}: {
  d: Device;
  live: DeviceInfo | null;
  here: boolean;
  online: boolean;
  offset: number;
  onRename?: (name: string) => Promise<void>;
  onEnd?: () => void;
  onShare?: (share: Share) => void;
  partnerName?: string;
}) {
  const now = useNow(5000);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(d.name);
  const [showShare, setShowShare] = React.useState(false);
  const share = (d.share ?? {}) as Share;
  const v = here && live ? { ...d, ...live, name: d.name } : d;
  const hiddenFor = (k: string) => !d.mine && v[k as keyof Device] == null && k !== "battery";
  const version = v.app_version ? (v.app_version === APP_VERSION ? `${v.app_version} (aktuell)` : `${v.app_version} (älter, neu laden)`) : NA;
  const battery =
    v.battery_level == null ? (d.mine ? NA : "verborgen") : `${v.battery_level} %${v.battery_charging ? " · lädt" : ""}`;

  return (
    <li className="card-surface p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={cn("relative grid size-11 shrink-0 place-items-center rounded-2xl", online ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground")}>
          <DeviceIcon type={d.device_type} className="size-5" />
          <span className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card", online ? "bg-[#4fbf7f]" : "bg-border-strong")} />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await onRename?.(name.trim() || d.name);
                setEditing(false);
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Gerätename" className="h-9" autoFocus />
              <Button size="icon" type="submit" className="size-9" aria-label="Speichern">
                <Check />
              </Button>
              <Button size="icon" variant="ghost" type="button" className="size-9" aria-label="Abbrechen" onClick={() => setEditing(false)}>
                <X />
              </Button>
            </form>
          ) : (
            <p className="flex items-center gap-1.5 text-[16px] font-medium">
              <span className="truncate">{d.name}</span>
              {here ? <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-normal text-primary">dieses Gerät</span> : null}
              {onRename ? (
                <button type="button" aria-label="Umbenennen" className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" />
                </button>
              ) : null}
            </p>
          )}
          <p className="text-[13px] text-muted-foreground">
            {online ? "online" : "offline"} · zuletzt synchronisiert {ago(d.last_heartbeat_at, offset, now)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Fact label="System" value={v.os ? `${v.os}${v.os_version ? ` ${v.os_version}` : ""}` : NA} hidden={hiddenFor("os")} />
        <Fact label="Browser" value={v.browser ? `${v.browser}${v.browser_version ? ` ${v.browser_version.split(".")[0]}` : ""}` : NA} hidden={hiddenFor("browser")} />
        <Fact label="Bildschirm" value={v.screen ?? NA} hidden={hiddenFor("screen")} />
        <Fact label="Fenster" value={v.viewport ?? NA} hidden={hiddenFor("viewport")} />
        <Fact label="App-Modus" value={v.pwa == null ? NA : v.pwa ? "installiert (PWA)" : "im Browser"} hidden={hiddenFor("pwa")} />
        <Fact label="Version" value={version} hidden={hiddenFor("app_version")} />
        <Fact label="Verbindung" value={v.connection ?? (d.mine ? NA : "verborgen")} />
        <Fact
          label="Akku"
          value={
            <span className="inline-flex items-center gap-1">
              {v.battery_level != null ? v.battery_charging ? <BatteryCharging className="size-3.5" /> : <BatteryMedium className="size-3.5" /> : null}
              {battery}
            </span>
          }
        />
      </dl>

      {d.mine ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowShare((s) => !s)} aria-expanded={showShare}>
            <ShieldCheck /> Was {partnerName} sieht
          </Button>
          {!here && onEnd ? (
            <Button size="sm" variant="ghost" onClick={onEnd}>
              <LogOut /> Gerät abmelden
            </Button>
          ) : null}
        </div>
      ) : null}
      {d.mine && showShare ? (
        <ul className="mt-3 divide-y divide-border rounded-2xl border border-border px-3">
          {FIELDS.map((f) => (
            <li key={f.key} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[14px]">{f.label}</p>
                <p className="text-[12px] text-muted-foreground">{f.hint.replace("{partner}", partnerName)}</p>
              </div>
              <Switch checked={share[f.key] !== false && (f.key === "visible" || share[f.key] === true)} onCheckedChange={(on) => onShare?.({ ...share, [f.key]: on })} aria-label={f.label} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function DevicesPage() {
  const { supabase, me, partner, presence } = useApp();
  const deviceId = React.useMemo(() => (typeof window === "undefined" ? "" : getDeviceId()), []);
  const [live, setLive] = React.useState<DeviceInfo | null>(null);
  const q = useQuery(async () => {
    const { data, error } = await supabase.rpc("devices_overview");
    if (error) throw error;
    return data ?? [];
  }, [supabase]);
  const refetch = q.refetch;

  // Live values of THIS device, straight from the browser.
  React.useEffect(() => {
    let alive = true;
    const read = () => void collectDeviceInfo(getDeviceId()).then((i) => alive && setLive(i));
    read();
    const id = window.setInterval(() => {
      read();
      void refetch();
    }, 20_000);
    window.addEventListener("resize", read);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("resize", read);
    };
  }, [refetch]);

  const presentIds = React.useMemo(() => new Set(presence.devices.map((d) => d.device_id)), [presence.devices]);
  const offset = presence.clockOffset;
  const mine = (q.data ?? []).filter((d) => d.mine);
  const theirs = (q.data ?? []).filter((d) => !d.mine);

  async function rename(id: string, name: string) {
    const { error } = await supabase.from("device_sessions").update({ name }).eq("id", id);
    if (error) toast.error(errorMessage(error));
    void refetch();
  }
  async function setShare(id: string, share: Share) {
    const { error } = await supabase.from("device_sessions").update({ share }).eq("id", id);
    if (error) toast.error(errorMessage(error));
    void refetch();
  }
  async function end(id: string) {
    const { error } = await supabase.rpc("device_end", { device_id: id });
    if (error) return void toast.error(errorMessage(error));
    toast.success("Das Gerät meldet sich beim nächsten Kontakt ab.");
    void refetch();
  }
  async function endAllOthers() {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) return void toast.error(errorMessage(error));
    await Promise.all(mine.filter((d) => d.id !== deviceId).map((d) => supabase.rpc("device_end", { device_id: d.id })));
    toast.success("Alle anderen Geräte wurden abgemeldet.");
    void refetch();
  }

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="our devices"
        title={
          <>
            where we <em className="text-primary">are</em>
          </>
        }
        description={`Eure Geräte mit den Werten, die der Browser selbst meldet. Ohne IP-Adressen, ohne Standort, ohne Fingerprinting. Was ${partner?.display_name ?? "dein Schatz"} sieht, entscheidest du pro Feld.`}
      />

      {q.error ? (
        <ErrorState message={q.error.includes("devices_overview") ? "Die Datenbank ist für diese Seite noch nicht aktualisiert." : q.error} onRetry={refetch} />
      ) : q.loading && !q.data ? (
        <div className="grid gap-3">
          <Skeleton className="h-48 rounded-[1.4rem]" />
          <Skeleton className="h-48 rounded-[1.4rem]" />
        </div>
      ) : (
        <div className="grid gap-8">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Avatar profile={me} size="sm" />
              <h2 className="font-display flex-1 text-3xl">Deine Geräte</h2>
              {mine.length > 1 ? (
                <Button size="sm" variant="outline" onClick={endAllOthers}>
                  <LogOut /> Alle anderen sofort abmelden
                </Button>
              ) : null}
            </div>
            <ul className="grid gap-3">
              {mine.map((d) => (
                <DeviceCard
                  key={d.id}
                  d={d}
                  live={live}
                  here={d.id === deviceId}
                  online={d.id === deviceId || presentIds.has(d.id) || d.online}
                  offset={offset}
                  onRename={(n) => rename(d.id, n)}
                  onEnd={() => void end(d.id)}
                  onShare={(s) => void setShare(d.id, s)}
                  partnerName={partner?.display_name}
                />
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-3">
              <Avatar profile={partner} size="sm" />
              <h2 className="font-display text-3xl">Geräte von {partner?.display_name ?? "deinem Schatz"}</h2>
            </div>
            {theirs.length ? (
              <ul className="grid gap-3">
                {theirs.map((d) => (
                  <DeviceCard key={d.id} d={d} live={null} here={false} online={presentIds.has(d.id) || d.online} offset={offset} />
                ))}
              </ul>
            ) : (
              <EmptyState title="Keine geteilten Geräte" description={`${partner?.display_name ?? "Dein Schatz"} war noch nicht online oder teilt keine Geräte.`} />
            )}
          </div>

          <Section icon={<ShieldCheck />} title="So funktioniert's" description="Damit ihr wisst, was wirklich passiert.">
            <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-muted-foreground">
              <li>Jedes Gerät bekommt eine zufällige ID, die nur in diesem Browser gespeichert ist. Sie wird aus keinem Geräte-Merkmal berechnet.</li>
              <li>Alle 25 Sekunden meldet sich ein offenes Gerät mit Server-Zeit. Online heißt: die App ist gerade verbunden.</li>
              <li>Akku und Verbindungsart gibt es nur, wenn der Browser sie anbietet (z. B. Chrome auf Android). Safari gibt sie nicht heraus, dann steht hier „{NA}“.</li>
              <li>„Gerät abmelden“ meldet das Gerät beim nächsten Öffnen ab. „Alle anderen sofort abmelden“ beendet zusätzlich alle anderen Anmeldungen bei Supabase.</li>
            </ul>
          </Section>
        </div>
      )}
    </PageContainer>
  );
}
