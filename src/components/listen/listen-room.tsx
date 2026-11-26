"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowUp, Heart, ListMusic, Loader2, Pause, Play, Plus, Search, SkipForward, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useApp, useRealtimeActivity } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { useQuery } from "@/hooks/use-query";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/utils/errors";
import { parseLink } from "@/lib/listen/sources";
import { targetPosition } from "@/lib/listen/sync";
import { Deck, type DeckStatus } from "./deck";
import { useListenRoom, type QueueItem } from "./use-listen-room";

const EMOJI = ["♡", "🔥", "🥹", "💃", "🎶"];
const fmt = (ms: number | null | undefined) => {
  if (ms == null) return "–:––";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Candidate = { provider: "youtube" | "spotify"; ref: string; title: string; artist: string | null; thumb: string | null; duration_ms?: number | null };

export function ListenRoomPage({ id }: { id: string }) {
  const { me, partner, supabase } = useApp();
  const partnerName = partner?.display_name ?? "dein Schatz";
  const { room, queue, here, reactions, offset, live, after, control, react } = useListenRoom(id);
  const [status, setStatus] = React.useState<DeckStatus>({ drift: null, state: "idle", preview: false, error: null, kind: null });
  const now = useNow(500);
  useRealtimeActivity("listen", status.state === "playing");

  const spotify = useQuery(async () => {
    const [cfg, conn] = await Promise.all([
      fetch("/api/integrations/status").then((r) => (r.ok ? (r.json() as Promise<{ spotify: boolean }>) : { spotify: false })),
      supabase.from("spotify_connections").select("product").eq("user_id", me.id).maybeSingle(),
    ]);
    return { configured: cfg.spotify, connected: !!conn.data, premium: conn.data?.product === "premium" };
  }, [supabase, me.id]);

  const current = queue.find((q) => q.id === room?.current_item) ?? null;
  const upNext = queue.filter((q) => q.id !== room?.current_item);
  const onEnded = React.useCallback((itemId: string) => void control("ended", { expect: itemId }), [control]);

  if (room === undefined) {
    return (
      <PageContainer className="max-w-4xl">
        <Skeleton className="mt-8 h-96" />
      </PageContainer>
    );
  }
  if (room === null) {
    return (
      <PageContainer className="max-w-4xl">
        <EmptyState title="room not found" description="Diesen Raum gibt es nicht mehr." action={<Button asChild><Link href="/listen">Zurück</Link></Button>} />
      </PageContainer>
    );
  }

  const pos = now != null && current ? targetPosition(room, now, offset, current.duration_ms) : 0;
  const partnerHere = !!partner && here.includes(partner.id);
  const byName = (uid: string) => (uid === me.id ? "dir" : partnerName);

  return (
    <PageContainer className="max-w-5xl">
      <div className="flex items-center gap-2 pt-2 pb-4 md:pt-6">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/listen" aria-label="Zurück">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">listen together</p>
          <h1 className="truncate font-display text-[2.2rem] leading-none sm:text-5xl">{room.name}</h1>
        </div>
        {!live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground">
            <WifiOff className="size-3.5" /> verbinde…
          </span>
        ) : null}
        <div className="flex -space-x-2" aria-label={partnerHere ? `${partnerName} ist im Raum` : `${partnerName} ist nicht im Raum`}>
          <Avatar profile={me} size="sm" ring />
          <Avatar profile={partner} size="sm" online={partnerHere} className={cn(!partnerHere && "opacity-40")} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="card-surface relative overflow-hidden p-4 sm:p-5">
            <Deck room={room} item={current} offset={offset} useSdk={!!spotify.data?.premium} onEnded={onEnded} onStatus={setStatus} />
            {current ? (
              <div className="mt-4">
                <div className="flex items-start gap-3">
                  {current.thumb ? <img src={current.thumb} alt="" className="size-14 shrink-0 rounded-xl object-cover" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-2xl leading-tight">{current.title}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {current.artist ?? (current.provider === "youtube" ? "YouTube" : "Spotify")} · von {byName(current.added_by)}
                    </p>
                  </div>
                </div>
                {current.dedication ? (
                  <p className="mt-3 rounded-2xl bg-primary-soft px-4 py-2.5 text-[14px]">
                    <Heart className="mr-1.5 inline size-3.5 text-primary" />
                    {current.added_by === me.id ? "Deine Widmung" : `${partnerName} widmet dir das`}: „{current.dedication}“
                  </p>
                ) : null}
                <div className="mt-4">
                  <input
                    type="range"
                    min={0}
                    max={current.duration_ms ?? Math.max(pos, 1)}
                    value={Math.min(pos, current.duration_ms ?? pos)}
                    disabled={!current.duration_ms}
                    onChange={(e) => void control("seek", { pos: Number(e.target.value), expect: current.id })}
                    aria-label="Position"
                    className="w-full accent-[var(--color-primary)]"
                  />
                  <div className="flex justify-between text-[12px] text-muted-foreground tabular-nums">
                    <span>{fmt(pos)}</span>
                    <span>{fmt(current.duration_ms)}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <Button
                    size="icon"
                    className="size-14 rounded-full"
                    onClick={() => void control(room.status === "playing" ? "pause" : "play")}
                    aria-label={room.status === "playing" ? "Pause für euch beide" : "Abspielen für euch beide"}
                  >
                    {room.status === "playing" ? <Pause className="size-6" /> : <Play className="size-6" />}
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => void control("next", { expect: current.id })} aria-label="Nächster Song">
                    <SkipForward />
                  </Button>
                </div>
                <p className="mt-3 text-center text-[12px] text-muted-foreground" role="status">
                  {syncLine(status, room.status, partnerHere, partnerName)}
                </p>
                {status.preview ? (
                  <p className="mt-2 rounded-xl bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
                    Spotify spielt hier nur eine 30-Sekunden-Vorschau. Melde dich im Browser bei Spotify an{spotify.data?.configured ? " oder verbinde Spotify Premium" : ""}, dann läuft der ganze Song.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="py-10 text-center text-[15px] text-muted-foreground">Die Warteschlange ist leer. Füg einen Song hinzu ♡</p>
            )}
            <Reactions reactions={reactions} meId={me.id} />
            <div className="mt-4 flex justify-center gap-1.5">
              {EMOJI.map((e) => (
                <button key={e} type="button" onClick={() => react(e)} className="grid size-10 place-items-center rounded-full bg-muted text-lg transition-transform active:scale-90" aria-label={`Reaktion ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <AddSong roomId={id} after={after} spotify={spotify.data} />
          <Section icon={<ListMusic />} title="Als Nächstes" description={upNext.length ? `${upNext.length} ${upNext.length === 1 ? "Song" : "Songs"}` : "Noch nichts in der Warteschlange."}>
            <ul className="divide-y divide-border">
              {upNext.map((q, i) => (
                <QueueRow key={q.id} q={q} first={i === 0} last={i === upNext.length - 1} byName={byName} after={after} control={control} />
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}

function syncLine(s: DeckStatus, roomStatus: string, partnerHere: boolean, partnerName: string) {
  if (s.error) return `Player: ${s.error}`;
  if (s.state === "idle") return partnerHere ? `${partnerName} ist im Raum. Tippe auf „Mithören“.` : "Tippe auf „Mithören“, um dabei zu sein.";
  if (s.state === "loading") return "lädt…";
  if (s.state === "blocked") return "Dein Browser hat den Ton blockiert. Tippe auf den Button.";
  if (roomStatus !== "playing") return "pausiert für euch beide";
  if (s.drift == null) return "synchronisiere…";
  return `${s.drift < 900 ? "synchron" : "gleicht an"} · Abweichung ${(s.drift / 1000).toFixed(1)} s${partnerHere ? ` · ${partnerName} hört mit` : ""}`;
}

function Reactions({ reactions, meId }: { reactions: { id: string; emoji: string; from: string }[]; meId: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 h-48 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {reactions.map((r, i) => (
          <motion.span
            key={r.id}
            initial={{ y: 40, opacity: 0, scale: 0.6 }}
            animate={{ y: -140, opacity: [0, 1, 1, 0], scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
            className="absolute bottom-0 text-3xl"
            style={{ left: `${(r.from === meId ? 20 : 60) + ((i * 13) % 20)}%` }}
          >
            {r.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function QueueRow({
  q,
  first,
  last,
  byName,
  after,
  control,
}: {
  q: QueueItem;
  first: boolean;
  last: boolean;
  byName: (uid: string) => string;
  after: (res: PromiseLike<{ error: unknown }>) => Promise<boolean>;
  control: (a: "jump", o: { item: string }) => Promise<boolean>;
}) {
  const { supabase } = useApp();
  return (
    <li className="flex items-center gap-2.5 py-2.5">
      {q.thumb ? <img src={q.thumb} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-muted" />}
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void control("jump", { item: q.id })} aria-label={`${q.title} jetzt spielen`}>
        <p className="truncate text-[14px] font-medium">{q.title}</p>
        <p className="truncate text-[12px] text-muted-foreground">
          von {byName(q.added_by)}
          {q.dedication ? ` · ♡ „${q.dedication}“` : ""}
        </p>
      </button>
      <div className="flex shrink-0">
        <Button size="icon-sm" variant="ghost" disabled={first} onClick={() => void after(supabase.rpc("listen_move", { p_item: q.id, p_dir: -1 }))} aria-label="Nach oben">
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={last} onClick={() => void after(supabase.rpc("listen_move", { p_item: q.id, p_dir: 1 }))} aria-label="Nach unten">
          <ArrowDown />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => void after(supabase.rpc("listen_remove", { p_item: q.id }))} aria-label="Entfernen">
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function AddSong({
  roomId,
  after,
  spotify,
}: {
  roomId: string;
  after: (res: PromiseLike<{ error: unknown }>) => Promise<boolean>;
  spotify?: { configured: boolean; connected: boolean; premium: boolean };
}) {
  const { supabase } = useApp();
  const [text, setText] = React.useState("");
  const [dedication, setDedication] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<Candidate[] | null>(null);
  const [playlists, setPlaylists] = React.useState<{ id: string; name: string; total: number }[] | null>(null);
  const isLink = !!parseLink(text);

  const add = async (c: Candidate) => {
    const ok = await after(
      supabase.rpc("listen_add", {
        p_room: roomId,
        p_provider: c.provider,
        p_ref: c.ref,
        p_title: c.title,
        p_artist: c.artist ?? "",
        p_thumb: c.thumb ?? "",
        p_duration_ms: c.duration_ms ?? 0,
        p_dedication: dedication,
      }),
    );
    if (ok) {
      setText("");
      setDedication("");
      toast.success(`„${c.title}“ ist in der Warteschlange`);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      if (isLink) {
        const r = await fetch(`/api/listen/resolve?url=${encodeURIComponent(text.trim())}`);
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Link konnte nicht gelesen werden");
        await add(body as Candidate);
      } else if (spotify?.connected) {
        const r = await fetch(`/api/spotify/search?q=${encodeURIComponent(text.trim())}`);
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Suche fehlgeschlagen");
        setResults(body.items);
      } else {
        throw new Error(spotify?.configured ? "Füg einen Link ein oder verbinde Spotify, um zu suchen." : "Füg einen YouTube- oder Spotify-Link ein.");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const loadPlaylists = async () => {
    const r = await fetch("/api/spotify/playlists");
    const body = await r.json();
    if (!r.ok) return toast.error(body.error ?? "Playlists konnten nicht geladen werden");
    setPlaylists(body.playlists);
  };
  const importPlaylist = async (pid: string) => {
    const r = await fetch(`/api/spotify/playlists?id=${pid}`);
    const body = await r.json();
    if (!r.ok) return toast.error(body.error ?? "Import fehlgeschlagen");
    setResults(body.items);
    setPlaylists(null);
  };

  return (
    <Section icon={<Plus />} title="Song hinzufügen" description={spotify?.connected ? "Link einfügen oder auf Spotify suchen." : "YouTube- oder Spotify-Link einfügen."}>
      <form onSubmit={submit} className="grid gap-2">
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={spotify?.connected ? "Link oder Suche…" : "https://…"} aria-label="Link oder Suche" className="min-w-0 flex-1" />
          <Button type="submit" disabled={busy || !text.trim()} aria-label={isLink ? "Hinzufügen" : "Suchen"}>
            {busy ? <Loader2 className="animate-spin" /> : isLink ? <Plus /> : <Search />}
          </Button>
        </div>
        <Input value={dedication} onChange={(e) => setDedication(e.target.value.slice(0, 280))} placeholder="Widmung (optional) ♡" aria-label="Widmung" />
      </form>
      {spotify?.connected ? (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={loadPlaylists}>
            Aus meinen Spotify-Playlists
          </Button>
        </div>
      ) : spotify?.configured ? (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          <Link className="underline" href="/integrations">Spotify verbinden</Link> für Suche, Playlists und (mit Premium) ganze Songs im Browser.
        </p>
      ) : null}
      {playlists ? (
        <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto">
          {playlists.map((p) => (
            <li key={p.id}>
              <button type="button" className="w-full py-2 text-left text-[14px]" onClick={() => importPlaylist(p.id)}>
                {p.name} <span className="text-muted-foreground">· {p.total}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {results ? (
        <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
          {results.length === 0 ? <li className="py-2 text-[14px] text-muted-foreground">Nichts gefunden.</li> : null}
          {results.map((c) => (
            <li key={c.ref} className="flex items-center gap-2.5 py-2">
              {c.thumb ? <img src={c.thumb} alt="" className="size-9 shrink-0 rounded-md object-cover" /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{c.title}</p>
                <p className="truncate text-[12px] text-muted-foreground">{c.artist}</p>
              </div>
              <Button size="icon-sm" variant="soft" onClick={() => add(c)} aria-label={`${c.title} hinzufügen`}>
                <Plus />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
