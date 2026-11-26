"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Camera, EyeOff, Fingerprint, Globe2, MapPinOff, Mic, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Row, Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@/hooks/use-query";

type PermState = "granted" | "denied" | "prompt" | "unsupported";
const PERMS: { name: string; label: string; icon: React.ComponentType<{ className?: string }>; why: string }[] = [
  { name: "camera", label: "Kamera", icon: Camera, why: "Nur bei Videoanrufen und Snaps, wenn du sie selbst startest." },
  { name: "microphone", label: "Mikrofon", icon: Mic, why: "Nur bei Anrufen, Sprachnachrichten und Video-Snaps, wenn du sie startest." },
  { name: "notifications", label: "Benachrichtigungen", icon: Bell, why: "Für Push-Benachrichtigungen, die du selbst aktivierst." },
  { name: "geolocation", label: "Standort", icon: MapPinOff, why: "ours. fragt nie nach deinem Standort. Einen Ort aus den Metadaten eines Clips zeigt ours. nur, wenn du ihn beim Hochladen selbst übernimmst." },
];

const PERM_TEXT: Record<PermState, string> = { granted: "erlaubt", denied: "blockiert", prompt: "noch nicht gefragt", unsupported: "nicht abfragbar" };

function usePermissions() {
  const [state, setState] = React.useState<Record<string, PermState>>({});
  React.useEffect(() => {
    let alive = true;
    const statuses: PermissionStatus[] = [];
    for (const p of PERMS) {
      navigator.permissions
        ?.query({ name: p.name as PermissionName })
        .then((s) => {
          if (!alive) return;
          statuses.push(s);
          setState((x) => ({ ...x, [p.name]: s.state as PermState }));
          s.onchange = () => setState((x) => ({ ...x, [p.name]: s.state as PermState }));
        })
        .catch(() => alive && setState((x) => ({ ...x, [p.name]: "unsupported" })));
    }
    return () => {
      alive = false;
      statuses.forEach((s) => (s.onchange = null));
    };
  }, []);
  return state;
}

export function PrivacyPage() {
  const { supabase, me, partner, updateMe } = useApp();
  const perms = usePermissions();
  const partnerName = partner?.display_name ?? "dein Schatz";

  const subs = useQuery(async () => (await supabase.from("push_subscriptions").select("id, label")).data ?? [], [supabase]);
  const prefs = useQuery(async () => (await supabase.from("notification_prefs").select("categories, previews").eq("user_id", me.id).maybeSingle()).data, [supabase, me.id]);

  const offCategories = Object.entries((prefs.data?.categories ?? {}) as Record<string, boolean>).filter(([, v]) => v === false).length;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="privacy"
        title={
          <>
            just <em className="text-primary">us two</em>
          </>
        }
        description={`Alles, was ${partnerName} über dich sieht und was ours. nie erfasst.`}
      />

      <div className="grid gap-5">
        <Section icon={<UserRound />} title={`Was ${partnerName} sieht`} description="Änderungen gelten sofort.">
          <Row label="Online-Status" hint="Ob du gerade da bist und wann du zuletzt online warst">
            <Switch checked={me.show_online} onCheckedChange={(v) => updateMe({ show_online: v })} aria-label="Online-Status zeigen" />
          </Row>
          <Row label="Aktuelle Aktivität" hint="z. B. „ist im Chat“, „telefoniert gerade“, „schaut Clips“">
            <Switch checked={me.share_activity !== false} onCheckedChange={(v) => updateMe({ share_activity: v })} aria-label="Aktivität teilen" />
          </Row>
          <Row label="Lesebestätigungen" hint="Aus: ihr seht beide kein „Gelesen“">
            <Switch checked={me.read_receipts} onCheckedChange={(v) => updateMe({ read_receipts: v })} aria-label="Lesebestätigungen" />
          </Row>
        </Section>

        <Section
          icon={<Bell />}
          title="Benachrichtigungen"
          description={
            subs.data
              ? `${subs.data.length ? `Push auf ${subs.data.length} ${subs.data.length === 1 ? "Gerät" : "Geräten"}` : "Push ist auf keinem Gerät an"}${offCategories ? `, ${offCategories} Kategorien aus` : ""}. ${prefs.data?.previews === false ? "Ohne Textvorschau." : "Mit Textvorschau."}`
              : "…"
          }
          actions={
            <Button size="sm" variant="outline" asChild>
              <Link href="/notifications">Einstellen</Link>
            </Button>
          }
        >
          <p className="text-[13px] text-muted-foreground">Benachrichtigungen enthalten nie Inhalte von Briefen oder Überraschungen und werden nie über deine eigenen Aktionen geschickt.</p>
        </Section>

        <Section icon={<ShieldCheck />} title="Browser-Berechtigungen" description="Was dieser Browser ours. gerade erlaubt. Ändern kannst du das in den Website-Einstellungen deines Browsers.">
          {PERMS.map((p) => {
            const Icon = p.icon;
            const s = perms[p.name];
            return (
              <Row
                key={p.name}
                label={
                  <span className="inline-flex items-center gap-2">
                    <Icon className="size-4 text-primary" /> {p.label}
                  </span>
                }
                hint={p.why}
              >
                <span className="shrink-0 text-[13px] text-muted-foreground">{s ? PERM_TEXT[s] : "…"}</span>
              </Row>
            );
          })}
        </Section>

        <Section icon={<EyeOff />} title="Was ours. nie macht">
          <ul className="grid gap-3 text-[14px] sm:grid-cols-2">
            {[
              { icon: Globe2, text: "Keine IP-Adressen speichern oder anzeigen." },
              { icon: MapPinOff, text: "Kein Standort, ohne dass du ihn ausdrücklich teilst." },
              { icon: Fingerprint, text: "Kein Fingerprinting: Geräte-IDs sind zufällig." },
              { icon: Mic, text: "Keine heimlichen Aufnahmen: Kamera und Mikro nur in Anrufen, die du startest oder annimmst." },
              { icon: ShieldCheck, text: "Alle Inhalte sind per Row Level Security nur für euch zwei lesbar, Dateien nur über kurzlebige Links." },
              { icon: Sparkles, text: "Keine Tracker, keine Werbung, keine Analyse-Dienste." },
            ].map((x) => (
              <li key={x.text} className="flex gap-2.5">
                <x.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </PageContainer>
  );
}
