"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Camera, Check, ImageOff, KeyRound, LogOut, Monitor, Moon, Palette, Shield, Sun, Upload } from "lucide-react";
import { toast } from "sonner";
import { applyTheme, useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Avatar } from "@/components/shared/avatar";
import { LocalImage, PhotoRefImage } from "@/components/shared/media";
import { PageHeader, Spinner } from "@/components/shared/states";
import { SetStartDate } from "@/components/dashboard/love-counter";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ACCENTS } from "@/lib/constants";
import { allLocalPhotos, localPhotos } from "@/lib/photos";
import { removeMedia, uploadMedia } from "@/lib/supabase/media";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Accent, ThemePref } from "@/types/app";

function Section({ id, icon, title, description, children }: { id?: string; icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-h`} className="card-surface scroll-mt-24 p-5 sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&_svg]:size-[18px]">{icon}</span>
        <div>
          <h2 id={`${id ?? title}-h`} className="font-display text-[1.9rem] leading-none">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-3.5 first:border-0 first:pt-0">
      <div>
        <p className="text-[15px]">{label}</p>
        {hint ? <p className="text-[12.5px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ProfileSection() {
  const { me, partner, updateMe } = useApp();
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const file = React.useRef<HTMLInputElement>(null);

  return (
    <Section id="profile" icon={<Camera />} title="profiles" description="Jeder bearbeitet sein eigenes Profil.">
      <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr]">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") ?? "").trim();
            if (!name) return toast.error("Der Name darf nicht leer sein.");
            setPending(true);
            const { error } = await updateMe({ display_name: name.slice(0, 40), bio: String(fd.get("bio") ?? "").trim().slice(0, 280) || null });
            setPending(false);
            if (error) toast.error(errorMessage(error));
            else toast.success("Profil gespeichert");
          }}
        >
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => file.current?.click()} className="group relative rounded-full" aria-label="Profilbild ändern">
              <Avatar profile={me} size="xl" />
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {uploading ? <Spinner /> : <Camera className="size-6" />}
              </span>
            </button>
            <div>
              <p className="eyebrow">{me.role === "abdullah" ? "Abdullah-Profil" : "Lara-Profil"} · du</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => file.current?.click()} disabled={uploading}><Upload /> Neues Foto</Button>
                {me.avatar_path ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const old = me.avatar_path;
                      await updateMe({ avatar_path: null });
                      void removeMedia([old]);
                    }}
                  >
                    Entfernen
                  </Button>
                ) : null}
              </div>
            </div>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  const res = await uploadMedia(f, "avatars");
                  const old = me.avatar_path;
                  const { error } = await updateMe({ avatar_path: res.path });
                  if (error) throw new Error(error);
                  if (old) void removeMedia([old]);
                  toast.success("Neues Profilbild ♡");
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setUploading(false);
                  e.target.value = "";
                }
              }}
            />
          </div>
          <Field label="Name" htmlFor="p-name"><Input id="p-name" name="name" maxLength={40} defaultValue={me.display_name} required /></Field>
          <Field label="Über mich" htmlFor="p-bio"><Textarea id="p-bio" name="bio" maxLength={280} defaultValue={me.bio ?? ""} className="min-h-20" /></Field>
          <Button type="submit" disabled={pending} className="justify-self-start">Speichern</Button>
        </form>
        <div aria-hidden className="hidden w-px bg-border md:block" />
        <div className="rounded-2xl bg-muted/60 p-5">
          <div className="flex items-center gap-4">
            <Avatar profile={partner} size="xl" />
            <div>
              <p className="eyebrow">{partner?.role === "lara" ? "Lara-Profil" : "Abdullah-Profil"}</p>
              <p className="font-display mt-1 text-3xl">{partner?.display_name ?? "noch nicht registriert"}</p>
            </div>
          </div>
          {partner?.bio ? <p className="mt-4 text-sm">{partner.bio}</p> : null}
          <p className="mt-4 text-[12.5px] text-muted-foreground">
            {partner ? `${partner.display_name} kann das eigene Profil in den eigenen Einstellungen ändern.` : "Sobald die Einladung angenommen wurde, erscheint das Profil hier."}
          </p>
        </div>
      </div>
    </Section>
  );
}

function StorySection() {
  const { settings, updateSettings } = useApp();
  return (
    <Section id="story" icon={<Check />} title="our story" description="Euer Startdatum steuert den Love Counter und die Jahrestage.">
      {settings.start_date ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px]">Zusammen seit <strong>{formatDate(settings.start_date)}</strong></p>
          <Button variant="ghost" size="sm" onClick={async () => { if (window.confirm("Startdatum zurücksetzen?")) await updateSettings({ start_date: null }); }}>Ändern</Button>
        </div>
      ) : (
        <SetStartDate />
      )}
    </Section>
  );
}

function PhotoChoice({ value, onPick, label }: { value: string | null; onPick: (v: string | null) => void; label: string }) {
  const photos = allLocalPhotos();
  const [uploading, setUploading] = React.useState(false);
  const file = React.useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium">{label}</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        <button type="button" onClick={() => onPick(null)} aria-pressed={!value} className={cn("grid aspect-square place-items-center rounded-xl border text-muted-foreground", !value ? "border-primary ring-2 ring-primary/40" : "border-border")}>
          <ImageOff className="size-5" />
          <span className="sr-only">Keins / Standard</span>
        </button>
        {value?.startsWith("storage:") ? (
          <div className="relative aspect-square overflow-hidden rounded-xl ring-2 ring-primary/40">
            <PhotoRefImage value={value} className="absolute inset-0" />
          </div>
        ) : null}
        {photos.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(`local:${p.id}`)} aria-pressed={value === `local:${p.id}`} className={cn("relative aspect-square overflow-hidden rounded-xl", value === `local:${p.id}` && "ring-2 ring-primary ring-offset-2 ring-offset-card")} aria-label={p.name}>
            <LocalImage photo={p} sizes="120px" className="absolute inset-0" />
          </button>
        ))}
        <button type="button" onClick={() => file.current?.click()} disabled={uploading} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong text-[11px] text-muted-foreground hover:bg-muted">
          {uploading ? <Spinner /> : <Upload className="size-4" />} hochladen
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setUploading(true);
            try {
              const res = await uploadMedia(f, "backgrounds");
              onPick(`storage:${res.path}`);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setUploading(false);
              e.target.value = "";
            }
          }}
        />
      </div>
    </div>
  );
}

function PhotosSection() {
  const { settings, updateSettings } = useApp();
  const counts = (["abdullah", "lara", "together", "memories", "backgrounds"] as const).map((f) => `${f}: ${localPhotos(f).length}`).join(" · ");
  const save = async (patch: { hero_image?: string | null; background_image?: string | null }) => {
    const { error } = await updateSettings(patch);
    if (error) toast.error(error);
    else toast.success("Gespeichert");
  };
  return (
    <Section id="photos" icon={<Camera />} title="our photos" description="Wähle das Hauptfoto für die Startseite und einen Hintergrund. Fotos aus public/images erscheinen hier automatisch.">
      <div className="grid gap-6">
        <PhotoChoice label="Hauptmotiv (Startseite)" value={settings.hero_image} onPick={(v) => save({ hero_image: v })} />
        <PhotoChoice label="Hintergrundbild (dezent hinter der App)" value={settings.background_image} onPick={(v) => save({ background_image: v })} />
        <p className="text-[12px] text-muted-foreground">Gefundene Fotos im Projekt: {counts}</p>
      </div>
    </Section>
  );
}

function AppearanceSection() {
  const { me, updateMe } = useApp();
  const set = async (patch: { theme?: ThemePref; accent?: Accent }) => {
    applyTheme(patch.theme ?? me.theme, patch.accent ?? me.accent);
    const { error } = await updateMe(patch);
    if (error) toast.error(error);
  };
  const themes: { id: ThemePref; label: string; icon: React.ReactNode }[] = [
    { id: "light", label: "Light", icon: <Sun /> },
    { id: "dark", label: "Dark", icon: <Moon /> },
    { id: "system", label: "System", icon: <Monitor /> },
  ];
  return (
    <Section id="appearance" icon={<Palette />} title="look & feel" description="Nur für dich, dein Schatz kann eigene Farben wählen.">
      <p className="mb-2 text-[13px] font-medium">Modus</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Farbmodus">
        {themes.map((t) => (
          <button key={t.id} role="radio" aria-checked={me.theme === t.id} onClick={() => set({ theme: t.id })} className={cn("flex h-12 items-center justify-center gap-2 rounded-xl border text-sm [&_svg]:size-4", me.theme === t.id ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border hover:bg-muted")}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <p className="mt-5 mb-2 text-[13px] font-medium">Akzentfarbe</p>
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Akzentfarbe">
        {ACCENTS.map((a) => (
          <button key={a.id} role="radio" aria-checked={me.accent === a.id} onClick={() => set({ accent: a.id })} className="flex flex-col items-center gap-1.5 text-[11.5px]">
            <span className={cn("grid size-11 place-items-center rounded-full text-white transition-transform", me.accent === a.id && "scale-110 ring-2 ring-offset-2 ring-offset-card")} style={{ background: a.swatch, ["--tw-ring-color" as string]: a.swatch }}>
              {me.accent === a.id ? <Check className="size-4" /> : null}
            </span>
            {a.label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function NotificationsSection() {
  const { me, updateMe } = useApp();
  const [asked, setPerm] = React.useState<NotificationPermission | null>(null);
  const system = React.useSyncExternalStore<NotificationPermission | "unsupported">(
    () => () => {},
    () => ("Notification" in window ? Notification.permission : "unsupported"),
    () => "default",
  );
  const perm = asked ?? system;
  return (
    <Section id="notifications" icon={<Bell />} title="notifications" description="Benachrichtigungen bei neuen Nachrichten, solange ours. in einem Tab oder als App geöffnet ist.">
      <Row label="Neue Nachrichten" hint="Wenn der Tab im Hintergrund ist">
        <Switch checked={me.notify_messages} onCheckedChange={(v) => updateMe({ notify_messages: v })} aria-label="Benachrichtigungen für Nachrichten" />
      </Row>
      <Row label="Browser-Erlaubnis" hint={perm === "granted" ? "erlaubt" : perm === "denied" ? "blockiert, bitte in den Browser-Einstellungen erlauben" : perm === "unsupported" ? "von diesem Browser nicht unterstützt" : "noch nicht gefragt"}>
        {perm === "default" ? (
          <Button size="sm" variant="outline" onClick={async () => setPerm(await Notification.requestPermission())}>Erlauben</Button>
        ) : (
          <span className="text-sm text-muted-foreground">{perm === "granted" ? "✓" : "–"}</span>
        )}
      </Row>
    </Section>
  );
}

function PrivacySection() {
  const { me, updateMe } = useApp();
  return (
    <Section id="privacy" icon={<Shield />} title="privacy" description="Alle Inhalte sind durch Row Level Security geschützt und nur für euch zwei sichtbar.">
      <Row label="Online-Status zeigen" hint="Sonst sieht dein Schatz nicht, wann du online bist">
        <Switch checked={me.show_online} onCheckedChange={(v) => updateMe({ show_online: v })} aria-label="Online-Status zeigen" />
      </Row>
      <Row label="Lesebestätigungen" hint="Aus = ihr seht beide kein „Gelesen“">
        <Switch checked={me.read_receipts} onCheckedChange={(v) => updateMe({ read_receipts: v })} aria-label="Lesebestätigungen" />
      </Row>
    </Section>
  );
}

function AccountSection() {
  const { supabase } = useApp();
  const router = useRouter();
  const [email, setEmail] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, [supabase]);
  return (
    <Section id="account" icon={<KeyRound />} title="account">
      <p className="mb-4 text-sm text-muted-foreground">Angemeldet als <strong className="text-foreground">{email}</strong></p>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const pw = String(fd.get("pw") ?? "");
          if (pw.length < 8) return toast.error("Mindestens 8 Zeichen.");
          if (pw !== fd.get("pw2")) return toast.error("Die Passwörter stimmen nicht überein.");
          setPending(true);
          const { error } = await supabase.auth.updateUser({ password: pw });
          setPending(false);
          if (error) return toast.error(errorMessage(error));
          form.reset();
          toast.success("Passwort geändert");
        }}
      >
        <Field label="Neues Passwort" htmlFor="pw"><Input id="pw" name="pw" type="password" autoComplete="new-password" minLength={8} /></Field>
        <Field label="Wiederholen" htmlFor="pw2"><Input id="pw2" name="pw2" type="password" autoComplete="new-password" minLength={8} /></Field>
        <Button type="submit" disabled={pending}>Ändern</Button>
      </form>
      <Button
        variant="outline"
        className="mt-6"
        onClick={async () => {
          await supabase.auth.signOut();
          router.replace("/login");
          router.refresh();
        }}
      >
        <LogOut /> Abmelden
      </Button>
    </Section>
  );
}

export function SettingsPage() {
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader eyebrow="settings" title={<>make it <em className="text-primary">ours</em></>} description="Profile, Fotos, Farben und Privatsphäre." />
      <nav aria-label="Abschnitte" className="no-scrollbar -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4">
        {[["profile", "Profile"], ["story", "Startdatum"], ["photos", "Fotos"], ["appearance", "Design"], ["notifications", "Benachrichtigungen"], ["privacy", "Privatsphäre"], ["account", "Account"]].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="h-9 shrink-0 rounded-full border border-border bg-card px-3.5 text-[13px] leading-9 hover:bg-muted">{l}</a>
        ))}
      </nav>
      <div className="grid gap-5">
        <ProfileSection />
        <StorySection />
        <PhotosSection />
        <AppearanceSection />
        <NotificationsSection />
        <PrivacySection />
        <AccountSection />
      </div>
    </PageContainer>
  );
}
