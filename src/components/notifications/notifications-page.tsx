"use client";

import * as React from "react";
import { Bell, BellOff, Gamepad2, Heart, Images, Mail, MessageCircleHeart, MessageCircleQuestion, Phone, Send, Smartphone, Trash2, CalendarHeart } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { ErrorState, PageHeader, Spinner } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { getDeviceId } from "@/lib/device";
import { collectDeviceInfo } from "@/lib/presence/device-info";
import { currentSubscription, disablePush, enablePush, isIOS, pushSupport, type PushSupport } from "@/lib/push/client";
import { timeAgo } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";

const CATEGORIES: { id: string; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "chat", label: "Nachrichten", hint: "Neue Chat-Nachrichten", icon: MessageCircleHeart },
  { id: "call", label: "Anrufe", hint: "Eingehende und verpasste Anrufe", icon: Phone },
  { id: "letter", label: "Briefe", hint: "Ein neuer Brief für dich", icon: Mail },
  { id: "game", label: "Einladungen", hint: "Zu Spielen", icon: Gamepad2 },
  { id: "memory", label: "Erinnerungen", hint: "Neue Erinnerungen", icon: Images },
  { id: "daily_question", label: "Frage des Tages", hint: "Um 10 Uhr und wenn dein Schatz geantwortet hat", icon: MessageCircleQuestion },
  { id: "events", label: "Dates & Termine", hint: "Neue Date-Ideen und gemeinsame Termine", icon: CalendarHeart },
  { id: "surprise", label: "Überraschungen", hint: "Wenn dir jemand etwas im Studio schickt", icon: Heart },
];

type Prefs = { categories: Record<string, boolean>; previews: boolean };
const DEFAULT_PREFS: Prefs = { categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, true])), previews: true };

const noop = () => () => {};

export function NotificationsPage() {
  const { supabase, me } = useApp();
  const support = React.useSyncExternalStore<PushSupport | null>(noop, () => cachedSupport(), () => null);
  const permission = React.useSyncExternalStore(noop, () => ("Notification" in window ? Notification.permission : "unsupported"), () => "default");
  const [busy, setBusy] = React.useState(false);
  const [endpoint, setEndpoint] = React.useState<string | null>(null);
  const [prefs, setPrefs] = React.useState<Prefs | null>(null);

  const subs = useQuery(async () => must(await supabase.from("push_subscriptions").select("*").order("created_at", { ascending: false })), [supabase]);
  const prefsQ = useQuery(async () => {
    const res = await supabase.from("notification_prefs").select("*").eq("user_id", me.id).maybeSingle();
    if (res.error) throw res.error;
    return res.data ? { categories: res.data.categories as Record<string, boolean>, previews: res.data.previews } : null;
  }, [supabase, me.id]);
  const current: Prefs = prefs ?? (prefsQ.data ? { categories: { ...DEFAULT_PREFS.categories, ...prefsQ.data.categories }, previews: prefsQ.data.previews } : DEFAULT_PREFS);

  React.useEffect(() => {
    void currentSubscription().then((s) => setEndpoint(s?.endpoint ?? null));
  }, []);
  const thisDeviceSubscribed = !!endpoint && (subs.data ?? []).some((s) => s.endpoint === endpoint);

  async function savePrefs(next: Prefs) {
    setPrefs(next);
    const { error } = await supabase.from("notification_prefs").upsert({ user_id: me.id, categories: next.categories, previews: next.previews, updated_at: new Date().toISOString() });
    if (error) toast.error(errorMessage(error));
  }

  async function enable() {
    setBusy(true);
    try {
      const info = await collectDeviceInfo(getDeviceId());
      const sub = await enablePush(supabase, info.name);
      setEndpoint(sub.endpoint);
      await subs.refetch();
      toast.success("Benachrichtigungen sind auf diesem Gerät an ♡");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    await disablePush(supabase);
    setEndpoint(null);
    await subs.refetch();
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; results: { ok: boolean; error?: string }[] }>("push", { body: { action: "test", endpoint } });
    setBusy(false);
    if (error || !data?.ok) toast.error(data?.results?.[0]?.error ? `Test fehlgeschlagen: ${data.results[0].error}` : "Test fehlgeschlagen. Ist die Edge Function „push“ deployt?");
    else toast.success("Test gesendet. Kommt gleich an ♡");
  }

  async function removeSub(id: string, ep: string) {
    if (ep === endpoint) return disable();
    const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
    if (error) toast.error(errorMessage(error));
    await subs.refetch();
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="notifications"
        title={
          <>
            stay <em className="text-primary">close</em>
          </>
        }
        description="Push-Benachrichtigungen auch wenn ours. zu ist. Du bekommst nie Benachrichtigungen über deine eigenen Aktionen."
      />

      <section className="card-surface p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">{thisDeviceSubscribed ? <Bell className="size-6" /> : <BellOff className="size-6" />}</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl leading-tight">Dieses Gerät</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {support === null
                ? "…"
                : !support.ok
                  ? support.message
                  : permission === "denied"
                    ? "Benachrichtigungen sind für ours. blockiert. Erlaube sie in den Einstellungen deines Browsers (bzw. iOS: Einstellungen → Mitteilungen → ours.)."
                    : thisDeviceSubscribed
                      ? "Benachrichtigungen sind auf diesem Gerät an."
                      : "Auf diesem Gerät sind Benachrichtigungen aus."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {support?.ok && !thisDeviceSubscribed ? (
                <Button onClick={enable} disabled={busy || permission === "denied"}>
                  {busy ? <Spinner /> : <Bell />} Auf diesem Gerät aktivieren
                </Button>
              ) : null}
              {thisDeviceSubscribed ? (
                <>
                  <Button variant="outline" onClick={test} disabled={busy}>
                    <Send /> Test senden
                  </Button>
                  <Button variant="ghost" onClick={disable} disabled={busy}>
                    <BellOff /> Ausschalten
                  </Button>
                </>
              ) : null}
            </div>
            {support && !support.ok && support.reason === "ios-not-installed" ? (
              <ol className="mt-4 list-decimal space-y-1 pl-5 text-[14px] text-muted-foreground">
                <li>In Safari unten auf das Teilen-Symbol tippen</li>
                <li>„Zum Home-Bildschirm“ wählen</li>
                <li>ours. vom Home-Bildschirm öffnen und hier aktivieren</li>
              </ol>
            ) : null}
            {support?.ok && isIOS() ? <p className="mt-3 text-[12px] text-muted-foreground">iOS: Anrufe klingeln als Mitteilung, nicht wie ein echter Telefonanruf. Das erlaubt Apple Web-Apps nicht.</p> : null}
          </div>
        </div>
      </section>

      <section className="card-surface mt-5 p-5 sm:p-7">
        <h2 className="font-display text-3xl leading-tight">Worüber?</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">Gilt für alle deine Geräte.</p>
        {prefsQ.loading && !prefsQ.data && !prefs ? (
          <Skeleton className="mt-4 h-60 rounded-2xl" />
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              return (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <Icon className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium">{c.label}</p>
                    <p className="text-[13px] text-muted-foreground">{c.hint}</p>
                  </div>
                  <Switch
                    checked={current.categories[c.id] !== false}
                    onCheckedChange={(v) => void savePrefs({ ...current, categories: { ...current.categories, [c.id]: v } })}
                    aria-label={c.label}
                  />
                </li>
              );
            })}
            <li className="flex items-center gap-3 py-3">
              <MessageCircleHeart className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">Vorschau anzeigen</p>
                <p className="text-[13px] text-muted-foreground">Aus: nur „Neue Nachricht“ statt des Textes auf dem Sperrbildschirm</p>
              </div>
              <Switch checked={current.previews} onCheckedChange={(v) => void savePrefs({ ...current, previews: v })} aria-label="Vorschau anzeigen" />
            </li>
          </ul>
        )}
      </section>

      <section className="card-surface mt-5 p-5 sm:p-7">
        <h2 className="font-display text-3xl leading-tight">Deine Geräte mit Push</h2>
        {subs.error ? (
          <ErrorState message={subs.error} onRetry={subs.refetch} className="mt-4" />
        ) : !subs.data?.length ? (
          <p className="mt-2 text-[14px] text-muted-foreground">Noch kein Gerät angemeldet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {subs.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Smartphone className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">
                    {s.label ?? "Gerät"} {s.endpoint === endpoint ? <span className="text-[12px] font-normal text-primary">· dieses Gerät</span> : null}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    seit {timeAgo(s.created_at)}
                    {s.last_success_at ? ` · zuletzt zugestellt ${timeAgo(s.last_success_at)}` : ""}
                    {s.last_error ? ` · Fehler: ${s.last_error}` : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Gerät abmelden" onClick={() => void removeSub(s.id, s.endpoint)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}

let supportCache: PushSupport | null = null;
function cachedSupport() {
  supportCache ??= pushSupport();
  return supportCache;
}
