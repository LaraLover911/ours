"use client";

import * as React from "react";
import { Eye, Film, Ghost, ImageIcon, Loader2, MessageSquareHeart, Send, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PopPlayer, type PopLike } from "@/components/pops/pop-player";
import { PageContainer } from "@/components/navigation/app-shell";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { MAX_UPLOAD_BYTES, removeMedia, uploadMedia } from "@/lib/supabase/media";
import { errorMessage } from "@/lib/utils/errors";
import { formatTime, relativeDay } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import type { Pop } from "@/types/app";

type Kind = "jumpscare" | "video" | "image" | "message";

const KINDS: { id: Kind; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "jumpscare", label: "Jumpscare", hint: "Erschrecken mit Schrei", icon: Ghost },
  { id: "video", label: "Video", hint: "spielt im Vollbild", icon: Film },
  { id: "image", label: "Foto", hint: "mit Text darüber", icon: ImageIcon },
  { id: "message", label: "Nachricht", hint: "groß auf dem Bildschirm", icon: MessageSquareHeart },
];

const DEFAULT_TEASER: Record<Kind, string> = {
  jumpscare: "Ich hab dir was Süßes geschickt 💌",
  video: "Ich hab ein Video für dich 🎬",
  image: "Schau mal, was ich gefunden hab 📸",
  message: "Ich muss dir was sagen ♡",
};

export function StudioPage() {
  const { supabase, me, partner } = useApp();
  const [kind, setKind] = React.useState<Kind>("jumpscare");
  const [teaser, setTeaser] = React.useState("");
  const [body, setBody] = React.useState("");
  const [scream, setScream] = React.useState(true);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<PopLike | null>(null);
  const [sending, setSending] = React.useState(false);
  const fileUrl = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);
  const fileKind: "image" | "video" | null = file ? (file.type.startsWith("video/") ? "video" : "image") : null;

  const { data, error, loading, refetch } = useQuery(
    async () => must(await supabase.from("pops").select("*").eq("sender_id", me.id).order("created_at", { ascending: false }).limit(30)),
    [supabase, me.id],
  );
  useRealtimeRefetch(["pops"], refetch);

  const needsFile = kind === "video" || kind === "image";
  const accept = kind === "video" ? "video/mp4,video/quicktime,video/webm" : kind === "image" ? "image/*" : "image/*,video/mp4,video/quicktime,video/webm";

  const pickKind = (k: Kind) => {
    setKind(k);
    if (file) {
      const isVideo = file.type.startsWith("video/");
      if ((k === "video" && !isVideo) || (k === "image" && isVideo) || k === "message") setFile(null);
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) return void toast.error("Die Datei ist zu groß (max. 50 MB).");
    setFile(f);
  };

  const draft: PopLike = {
    kind,
    teaser: teaser.trim() || DEFAULT_TEASER[kind],
    body: body.trim() || null,
    media_path: null,
    scream,
    localUrl: fileUrl,
    localKind: fileKind,
  };

  async function send() {
    if (!partner) return;
    if (needsFile && !file) return void toast.error(kind === "video" ? "Bitte wähle ein Video aus." : "Bitte wähle ein Foto aus.");
    if (kind === "message" && !body.trim()) return void toast.error("Schreib eine Nachricht.");
    setSending(true);
    let path: string | null = null;
    try {
      if (file && kind !== "message") path = (await uploadMedia(file, "studio")).path;
      const { error: err } = await supabase.from("pops").insert({
        recipient_id: partner.id,
        kind,
        teaser: draft.teaser,
        body: draft.body,
        media_path: path,
        scream: kind === "jumpscare" ? scream : false,
      });
      if (err) throw err;
      toast.success(`Bereit! ${partner.display_name} sieht es beim nächsten Öffnen von ours. 😈`);
      setFile(null);
      setBody("");
      setTeaser("");
      void refetch();
    } catch (err) {
      if (path) void removeMedia([path]);
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function remove(p: Pop) {
    const { error: err } = await supabase.from("pops").delete().eq("id", p.id);
    if (err) return void toast.error(errorMessage(err));
    if (p.media_path) void removeMedia([p.media_path]);
    void refetch();
  }

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="studio"
        title={
          <>
            secret <em className="text-primary">surprises</em>
          </>
        }
        description={`Jumpscares, Videos, Fotos und Nachrichten, die ${partner?.display_name ?? "dein Schatz"} beim nächsten Öffnen von ours. im Vollbild sieht.`}
      />

      <section className="card-surface p-5 sm:p-7">
        <div role="radiogroup" aria-label="Art der Überraschung" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const active = kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pickKind(k.id)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors",
                  active ? "border-primary bg-primary-soft" : "border-border hover:bg-muted",
                )}
              >
                <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                <span className="text-[15px] font-medium">{k.label}</span>
                <span className="text-[12px] text-muted-foreground">{k.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-5">
          <Field label={`Was ${partner?.display_name ?? "dein Schatz"} zuerst sieht (harmlos 😇)`} htmlFor="pop-teaser">
            <Input id="pop-teaser" value={teaser} maxLength={120} onChange={(e) => setTeaser(e.target.value)} placeholder={DEFAULT_TEASER[kind]} />
          </Field>

          {kind !== "message" ? (
            <Field label={kind === "jumpscare" ? "Eigenes Gruselbild oder -video (optional)" : kind === "video" ? "Video" : "Foto"}>
              {file && fileUrl ? (
                <div className="relative w-fit">
                  {fileKind === "video" ? (
                    <video src={fileUrl} muted playsInline className="max-h-56 rounded-2xl bg-black" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- local preview blob
                    <img src={fileUrl} alt="" className="max-h-56 rounded-2xl" />
                  )}
                  <button
                    type="button"
                    aria-label="Datei entfernen"
                    onClick={() => setFile(null)}
                    className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-strong text-sm text-muted-foreground transition-colors hover:bg-muted">
                  <Upload className="size-5" />
                  {kind === "jumpscare" ? "Ohne Datei nehme ich ein gruseliges Gesicht" : "Datei auswählen (max. 50 MB)"}
                  <input type="file" accept={accept} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              )}
            </Field>
          ) : null}

          <Field label={kind === "jumpscare" ? "Text auf dem Knopf danach (optional)" : kind === "message" ? "Deine Nachricht" : "Text dazu (optional)"} htmlFor="pop-body">
            <Textarea
              id="pop-body"
              value={body}
              maxLength={1000}
              rows={kind === "message" ? 4 : 2}
              onChange={(e) => setBody(e.target.value)}
              placeholder={kind === "jumpscare" ? "Na warte…" : kind === "message" ? "Ich liebe dich mehr als gestern ♡" : ""}
            />
          </Field>

          {kind === "jumpscare" ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
              <div>
                <p className="text-[15px] font-medium">Schrei abspielen</p>
                <p className="text-[12px] text-muted-foreground">Laut! Der Ton startet erst mit dem Tipp auf „Öffnen“.</p>
              </div>
              <Switch checked={scream} onCheckedChange={setScream} aria-label="Schrei abspielen" />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPreview(draft)} disabled={needsFile && !file}>
              <Eye /> Vorschau
            </Button>
            <Button onClick={send} disabled={sending || !partner}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} An {partner?.display_name ?? "…"} schicken
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="sent-title">
        <h2 id="sent-title" className="font-display text-4xl leading-none">verschickt</h2>
        <div className="mt-5">
          {loading ? (
            <div className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : !data?.length ? (
            <EmptyState title="noch nichts verschickt" description="Deine erste Überraschung erscheint hier, mit Uhrzeit, wann sie gesehen wurde." />
          ) : (
            <ul className="grid gap-3">
              {data.map((p) => {
                const k = KINDS.find((x) => x.id === p.kind) ?? KINDS[3];
                const Icon = k.icon;
                return (
                  <li key={p.id} className="card-surface flex items-center gap-4 p-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{p.teaser || k.label}</p>
                      <p className="text-[12.5px] text-muted-foreground">
                        {k.label} · {relativeDay(p.created_at)} {formatTime(p.created_at)} ·{" "}
                        {p.shown_at ? (
                          <span className="font-medium text-primary">gesehen {relativeDay(p.shown_at)} {formatTime(p.shown_at)} 👀</span>
                        ) : (
                          "wartet noch"
                        )}
                      </p>
                    </div>
                    {!p.shown_at ? (
                      <Button size="icon" variant="ghost" aria-label="Zurückziehen" onClick={() => remove(p)}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {preview ? <PopPlayer pop={preview} fromName={me.display_name} onClose={() => setPreview(null)} /> : null}
    </PageContainer>
  );
}
