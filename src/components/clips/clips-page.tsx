"use client";

import * as React from "react";
import { Camera, CloudUpload, Heart, Loader2, MapPin, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { useHeartBurst } from "@/components/animations/heart-burst";
import { Avatar } from "@/components/shared/avatar";
import { ErrorState } from "@/components/shared/states";
import { HeartGlyph } from "@/components/shared/heart";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { MAX_UPLOAD_BYTES, removeMedia, uploadMedia } from "@/lib/supabase/media";
import { errorMessage } from "@/lib/utils/errors";
import { formatDateTime, timeAgo } from "@/lib/utils/dates";
import { readVideoMeta } from "@/lib/media/video-meta";
import { cn } from "@/lib/utils";
import type { Clip, ClipLike } from "@/types/app";

type Feed = { clips: Clip[]; likes: ClipLike[] };
type Order = "new" | "old";
const ORDER_KEY = "ours-clips-order";

export function ClipsPage() {
  const { supabase, me } = useApp();
  const [order, setOrder] = React.useState<Order>("new");
  React.useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- per-device preference, read after hydration
      if (localStorage.getItem(ORDER_KEY) === "old") setOrder("old");
    } catch {
      /* storage blocked */
    }
  }, []);
  const { data, error, loading, refetch, setData } = useQuery<Feed>(async () => {
    const clips = must(await supabase.from("clips").select("*").order("created_at", { ascending: order === "old" }).limit(60));
    const likes = clips.length ? must(await supabase.from("clip_likes").select("*").in("clip_id", clips.map((c) => c.id))) : [];
    return { clips, likes };
  }, [supabase, order]);
  useRealtimeRefetch(["clips", "clip_likes"], refetch);

  const [active, setActive] = React.useState<string | null>(null);
  const [muted, setMuted] = React.useState(true);
  const [upload, setUpload] = React.useState<File | null>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const { fire, node: hearts } = useHeartBurst();
  const fileInput = React.useRef<HTMLInputElement>(null);

  // After switching the order, start at the top once the new list is there.
  const toTop = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!toTop.current || loading) return;
    toTop.current = false;
    scroller.current?.scrollTo({ top: 0 });
  }, [data, loading]);

  const switchOrder = (next: Order) => {
    if (next === order) return;
    toTop.current = true;
    setOrder(next);
    setActive(null);
    scroller.current?.scrollTo({ top: 0 });
    try {
      localStorage.setItem(ORDER_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const clips = data?.clips ?? [];
  const activeId = active ?? clips[0]?.id ?? null;
  const activeIndex = clips.findIndex((c) => c.id === activeId);

  // Which clip fills the screen?
  React.useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.clip ?? null);
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-clip]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [clips.length]);

  const toggleLike = async (clip: Clip, force?: boolean) => {
    const liked = data?.likes.some((l) => l.clip_id === clip.id && l.user_id === me.id);
    if (liked && force) return;
    setData((d) =>
      d
        ? {
            ...d,
            likes: liked
              ? d.likes.filter((l) => !(l.clip_id === clip.id && l.user_id === me.id))
              : [...d.likes, { clip_id: clip.id, user_id: me.id, created_at: new Date().toISOString() }],
          }
        : d,
    );
    const res = liked
      ? await supabase.from("clip_likes").delete().eq("clip_id", clip.id).eq("user_id", me.id)
      : await supabase.from("clip_likes").insert({ clip_id: clip.id });
    if (res.error) {
      toast.error(errorMessage(res.error));
      void refetch();
    }
  };

  const remove = async (clip: Clip) => {
    const { error: err } = await supabase.from("clips").delete().eq("id", clip.id);
    if (err) return void toast.error(errorMessage(err));
    void removeMedia([clip.video_path]);
    void refetch();
    toast.success("Clip gelöscht");
  };

  return (
    <div className="relative h-[calc(100dvh-var(--bottom-nav-h)-var(--safe-bottom))] bg-black lg:h-dvh">
      {hearts}
      <input
        ref={fileInput}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="sr-only"
        aria-label="Video auswählen"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > MAX_UPLOAD_BYTES) return void toast.error("Das Video ist zu groß (max. 50 MB). Kürze es oder nimm es in 1080p auf.");
          setUpload(f);
        }}
      />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-y-2 bg-gradient-to-b from-black/60 to-transparent px-4 pt-[calc(var(--safe-top)+0.75rem)] pb-8 text-white lg:px-8">
        <h1 className="font-display text-3xl leading-none">clips</h1>
        <div role="radiogroup" aria-label="Reihenfolge" className="pointer-events-auto order-last flex w-full justify-center sm:order-none sm:w-auto">
          <div className="flex rounded-full bg-white/15 p-1 backdrop-blur-md">
            {(
              [
                ["new", "Neueste"],
                ["old", "Älteste"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={order === id}
                onClick={() => switchOrder(id)}
                className={cn("h-8 rounded-full px-4 text-[13px] font-medium transition-colors", order === id ? "bg-white text-black" : "text-white/85 hover:text-white")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Ton an" : "Ton aus"}
            className="grid size-10 place-items-center rounded-full bg-white/15 backdrop-blur-md"
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-black"
          >
            <Plus className="size-4" /> Clip
          </button>
        </div>
      </div>

      <div ref={scroller} className="no-scrollbar mx-auto h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain [overflow-anchor:none] lg:max-w-[calc(100dvh*9/16)]">
        {loading ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-7 animate-spin text-white/70" />
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center px-6">
            <ErrorState message={error} onRetry={refetch} />
          </div>
        ) : !clips.length ? (
          <div className="grid h-full place-items-center px-8 text-center text-white">
            <div>
              <HeartGlyph className="mx-auto size-10 text-dusty-rose" />
              <p className="font-display mt-4 text-4xl leading-none">no clips yet</p>
              <p className="mt-3 text-white/70">Dreh euren ersten Clip, nur für euch zwei. Hochformat, bis 50 MB.</p>
              <Button className="mt-6" onClick={() => fileInput.current?.click()}>
                <Plus /> Ersten Clip posten
              </Button>
            </div>
          </div>
        ) : (
          clips.map((clip, i) => {
            const likes = data?.likes.filter((l) => l.clip_id === clip.id) ?? [];
            return (
              <ClipItem
                key={clip.id}
                clip={clip}
                active={clip.id === activeId}
                near={Math.abs(i - activeIndex) <= 1}
                muted={muted}
                onUnmute={() => setMuted(false)}
                liked={likes.some((l) => l.user_id === me.id)}
                likes={likes}
                onLike={(x, y) => {
                  if (x !== undefined && y !== undefined) fire(x, y);
                  void toggleLike(clip, x !== undefined);
                }}
                onDelete={clip.author_id === me.id ? () => remove(clip) : undefined}
              />
            );
          })
        )}
      </div>

      {upload ? <UploadDialog file={upload} onClose={() => setUpload(null)} onPosted={() => void refetch()} /> : null}
    </div>
  );
}

function ClipItem({
  clip,
  active,
  near,
  muted,
  onUnmute,
  liked,
  likes,
  onLike,
  onDelete,
}: {
  clip: Clip;
  active: boolean;
  near: boolean;
  muted: boolean;
  onUnmute: () => void;
  liked: boolean;
  likes: ClipLike[];
  onLike: (x?: number, y?: number) => void;
  onDelete?: () => void;
}) {
  const { profiles, nameOf } = useApp();
  const url = useSignedUrl(near ? clip.video_path : null);
  const video = React.useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const tapTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && !paused) {
      void v.play().catch(() => {
        // Autoplay with sound blocked: fall back to muted playback.
        v.muted = true;
        void v.play().catch(() => {});
      });
    } else v.pause();
    if (!active) v.currentTime = 0;
  }, [active, paused, url]);

  const onTap = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    if (tapTimer.current) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = undefined;
      onLike(clientX, clientY);
      return;
    }
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = undefined;
      if (muted) onUnmute();
      else setPaused((p) => !p);
    }, 260);
  };

  const author = profiles[clip.author_id];
  return (
    <section data-clip={clip.id} aria-label={`Clip von ${nameOf(clip.author_id)}`} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      {url ? (
        <video
          ref={video}
          src={url}
          loop
          playsInline
          muted={muted}
          preload={active ? "auto" : "metadata"}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="size-6 animate-spin text-white/50" />
        </div>
      )}
      <button type="button" aria-label={paused ? "Abspielen" : "Pausieren"} onClick={onTap} className="absolute inset-0 z-[1] cursor-pointer" />
      {paused ? (
        <div className="pointer-events-none absolute inset-0 z-[2] grid place-items-center">
          <span className="grid size-16 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm">▶</span>
        </div>
      ) : null}

      {/* Right rail */}
      <div className="absolute right-3 bottom-[calc(var(--safe-bottom)+5.5rem)] z-[3] flex flex-col items-center gap-5 text-white lg:bottom-24">
        <Avatar profile={author} size="md" ring />
        <button type="button" onClick={() => onLike()} aria-pressed={liked} aria-label={liked ? "Gefällt mir nicht mehr" : "Gefällt mir"} className="flex flex-col items-center gap-1">
          <Heart className={cn("size-8 drop-shadow transition-transform active:scale-90", liked && "fill-[#ff4d6d] text-[#ff4d6d]")} />
          <span className="text-[12px] font-medium drop-shadow">{likes.length || ""}</span>
        </button>
        {onDelete ? (
          <button type="button" onClick={onDelete} aria-label="Clip löschen" className="opacity-80">
            <Trash2 className="size-6 drop-shadow" />
          </button>
        ) : null}
      </div>

      {/* Caption */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 pt-16 pb-[calc(var(--safe-bottom)+1.25rem)] pr-16 text-white lg:pb-8">
        <p className="text-[15px] font-semibold">
          {nameOf(clip.author_id)} <span className="font-normal text-white/65">· {timeAgo(clip.created_at)}</span>
        </p>
        {clip.caption ? <p className="mt-1 line-clamp-3 text-[14px] text-white/90">{clip.caption}</p> : null}
        <dl className="mt-2 grid gap-0.5 text-[12.5px] text-white/80">
          <div className="flex items-center gap-1.5">
            <dt className="flex items-center gap-1.5">
              <CloudUpload className="size-3.5" aria-hidden /> Hochgeladen
            </dt>
            <dd>
              <time dateTime={clip.created_at}>{formatDateTime(clip.created_at)} Uhr</time>
            </dd>
          </div>
          {clip.recorded_at ? (
            <div className="flex items-center gap-1.5">
              <dt className="flex items-center gap-1.5">
                <Camera className="size-3.5" aria-hidden /> Gefilmt
              </dt>
              <dd>
                <time dateTime={clip.recorded_at}>{formatDateTime(clip.recorded_at)} Uhr</time>
              </dd>
            </div>
          ) : null}
          {clip.place ? (
            <div className="flex items-center gap-1.5">
              <dt>
                <MapPin className="size-3.5" aria-label="Ort" />
              </dt>
              <dd className="truncate">{clip.place}</dd>
            </div>
          ) : null}
        </dl>
        {likes.length ? (
          <p className="mt-1.5 text-[12px] text-white/70">♥ {likes.map((l) => nameOf(l.user_id)).join(" & ")}</p>
        ) : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[3] h-0.5 bg-white/15">
        <div className="h-full bg-white/80" style={{ width: `${progress * 100}%` }} />
      </div>
    </section>
  );
}

function UploadDialog({ file, onClose, onPosted }: { file: File; onClose: () => void; onPosted: () => void }) {
  const { supabase } = useApp();
  const [caption, setCaption] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const url = React.useMemo(() => URL.createObjectURL(file), [file]);
  const meta = React.useRef<{ width?: number; height?: number; duration?: number }>({});
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const found = useFileMeta(file);
  const [keepPlace, setKeepPlace] = React.useState(true);

  async function post() {
    setPending(true);
    let path: string | null = null;
    try {
      path = (await uploadMedia(file, "clips")).path;
      const { error } = await supabase.from("clips").insert({
        video_path: path,
        caption: caption.trim() || null,
        width: meta.current.width ?? null,
        height: meta.current.height ?? null,
        duration: meta.current.duration ?? null,
        recorded_at: found.recordedAt?.toISOString() ?? null,
        place: keepPlace && found.place ? found.place : null,
      });
      if (error) throw error;
      toast.success("Clip gepostet ♡");
      onPosted();
      onClose();
    } catch (err) {
      if (path) void removeMedia([path]);
      toast.error(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>new clip</DialogTitle>
          <DialogDescription>Nur ihr zwei könnt ihn sehen.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <video
            src={url}
            muted
            autoPlay
            loop
            playsInline
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              meta.current = { width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : undefined };
            }}
            className="mx-auto max-h-[45dvh] rounded-2xl bg-black"
          />
          <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} rows={2} placeholder="Bildunterschrift (optional)" aria-label="Bildunterschrift" />
          <div className="grid gap-2 rounded-2xl border border-border bg-muted/40 p-3 text-[13.5px]">
            <p className="flex items-center gap-2 text-muted-foreground">
              <CloudUpload className="size-4 shrink-0" /> Upload-Datum wird beim Posten gespeichert
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Camera className="size-4 shrink-0" />
              {found.status === "reading" ? "Metadaten werden gelesen…" : found.recordedAt ? `Gefilmt am ${formatDateTime(found.recordedAt)} Uhr` : "Kein Aufnahmedatum in der Datei"}
            </p>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-muted-foreground" />
              <span className={cn("min-w-0 flex-1", !found.place && "text-muted-foreground")}>
                {found.status === "reading"
                  ? "Ort wird gesucht…"
                  : found.status === "locating"
                    ? "Ort aus den Metadaten wird bestimmt…"
                    : found.place
                      ? found.place
                      : found.hadCoords
                        ? "Ort konnte nicht bestimmt werden"
                        : "Kein Ort in den Metadaten"}
              </span>
              {found.place ? <Switch checked={keepPlace} onCheckedChange={setKeepPlace} aria-label="Ort beim Clip anzeigen" /> : null}
            </div>
            {found.place ? <p className="text-[12px] text-muted-foreground">Nur der Ortsname wird gespeichert, keine Koordinaten.</p> : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Abbrechen
          </Button>
          <Button onClick={post} disabled={pending || found.status !== "done"}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} {pending ? "Lädt hoch…" : "Posten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FileMeta = { status: "reading" | "locating" | "done"; recordedAt?: Date; place?: string; hadCoords?: boolean };

/** Recording time and place from the video's own metadata (read on this device). */
function useFileMeta(file: File): FileMeta {
  const [state, setState] = React.useState<FileMeta>({ status: "reading" });
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const m = await readVideoMeta(file);
      if (!alive) return;
      if (m.lat == null || m.lon == null) return setState({ status: "done", recordedAt: m.recordedAt });
      setState({ status: "locating", recordedAt: m.recordedAt, hadCoords: true });
      const r = await fetch(`/api/geo/reverse?lat=${m.lat}&lon=${m.lon}`, { cache: "no-store" }).catch(() => null);
      const j = r?.ok ? ((await r.json().catch(() => null)) as { place?: string | null } | null) : null;
      if (alive) setState({ status: "done", recordedAt: m.recordedAt, hadCoords: true, place: j?.place ?? undefined });
    })();
    return () => {
      alive = false;
    };
  }, [file]);
  return state;
}
