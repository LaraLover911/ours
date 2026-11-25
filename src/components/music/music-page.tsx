"use client";

import * as React from "react";
import { ExternalLink, Music2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { Reveal } from "@/components/animations/reveal";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Song } from "@/types/app";

const SONG_URL = /^https:\/\/(open\.spotify\.com|music\.apple\.com|(www\.|music\.)?youtube\.com|youtu\.be|soundcloud\.com)\//;

/** Official Spotify embed URL (no downloading, no rehosting). */
export function spotifyEmbed(url: string | null | undefined) {
  if (!url) return null;
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|playlist|album|episode)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : null;
}

function SongEditor({ open, onOpenChange, song, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; song: Song | null; onSaved: () => void }) {
  const { supabase, me, partner } = useApp();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            const artist = String(fd.get("artist") ?? "").trim();
            const url = String(fd.get("url") ?? "").trim();
            if (!title || !artist) return setError("Titel und Künstler sind nötig.");
            if (url && !SONG_URL.test(url)) return setError("Bitte einen Link von Spotify, Apple Music, YouTube oder SoundCloud.");
            const row = { title, artist, url: url || null, dedication: String(fd.get("dedication") ?? "").trim() || null };
            const res = song ? await supabase.from("songs").update(row).eq("id", song.id) : await supabase.from("songs").insert({ ...row, added_by: me.id });
            if (res.error) return setError(errorMessage(res.error));
            onSaved();
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{song ? "edit song" : "this song reminds me of you"}</DialogTitle>
            <DialogDescription>Nur Links & offizielle Player, keine Downloads.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Songtitel" htmlFor="s-title"><Input id="s-title" name="title" required maxLength={140} defaultValue={song?.title} /></Field>
              <Field label="Künstler" htmlFor="s-artist"><Input id="s-artist" name="artist" required maxLength={140} defaultValue={song?.artist} /></Field>
            </div>
            <Field label="Link (optional)" htmlFor="s-url" hint="Spotify-Links werden direkt als Player angezeigt.">
              <Input id="s-url" name="url" type="url" inputMode="url" defaultValue={song?.url ?? ""} placeholder="https://open.spotify.com/track/…" />
            </Field>
            <Field label={`Widmung für ${partner?.display_name ?? "dich"}`} htmlFor="s-ded">
              <Textarea id="s-ded" name="dedication" maxLength={1000} defaultValue={song?.dedication ?? ""} placeholder="Weil…" />
            </Field>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit">Speichern</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlaylistCard() {
  const { settings, updateSettings } = useApp();
  const [editing, setEditing] = React.useState(false);
  const embed = spotifyEmbed(settings.spotify_playlist_url);
  return (
    <section aria-labelledby="pl-title" className="card-surface overflow-hidden p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="pl-title" className="font-display text-3xl">our playlist</h2>
        <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}><Pencil /> {settings.spotify_playlist_url ? "Ändern" : "Verlinken"}</Button>
      </div>
      {editing || !settings.spotify_playlist_url ? (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            const url = String(new FormData(e.currentTarget).get("pl") ?? "").trim();
            if (url && !/^https:\/\/open\.spotify\.com\//.test(url)) return toast.error("Bitte einen open.spotify.com-Link einfügen.");
            const { error } = await updateSettings({ spotify_playlist_url: url || null });
            if (error) return toast.error(error);
            setEditing(false);
          }}
        >
          <label htmlFor="pl" className="sr-only">Spotify-Playlist-Link</label>
          <Input id="pl" name="pl" type="url" defaultValue={settings.spotify_playlist_url ?? ""} placeholder="https://open.spotify.com/playlist/…" />
          <Button type="submit">Speichern</Button>
        </form>
      ) : null}
      {embed ? (
        <iframe
          title="Unsere Spotify-Playlist"
          src={embed}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="mt-4 h-[352px] w-full rounded-2xl border-0"
        />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Verlinkt eure gemeinsame Spotify-Playlist, dann könnt ihr sie hier direkt hören.</p>
      )}
    </section>
  );
}

export function MusicPage() {
  const { supabase, me, profiles } = useApp();
  const [editor, setEditor] = React.useState<{ open: boolean; song: Song | null }>({ open: false, song: null });
  const { data, loading, error, refetch } = useQuery(async () => must(await supabase.from("songs").select("*").order("created_at", { ascending: false })), []);
  useRealtimeRefetch(["songs"], refetch, "songs");

  return (
    <PageContainer>
      <PageHeader eyebrow="our music" title={<>songs that sound like <em className="text-primary">us</em></>} actions={<Button size="lg" onClick={() => setEditor({ open: true, song: null })}><Plus /> Song</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <PlaylistCard />
        <section aria-label="Songs">
          {loading ? (
            <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : !data?.length ? (
            <EmptyState icon={<Music2 className="size-7" />} title="press play on us" description="Fügt Songs hinzu, die euch aneinander erinnern, mit einer kleinen Widmung." action={<Button onClick={() => setEditor({ open: true, song: null })}><Plus /> Ersten Song</Button>} />
          ) : (
            <Reveal as="ul" className="grid gap-3" stagger={0.05}>
              {data.map((s, i) => {
                const embed = spotifyEmbed(s.url);
                return (
                  <li key={s.id} data-reveal className="card-surface p-4">
                    <div className="flex items-start gap-4">
                      <div aria-hidden className={cn("relative grid size-14 shrink-0 place-items-center rounded-full bg-charcoal", i % 2 ? "animate-[spin_8s_linear_infinite] motion-reduce:animate-none" : "")} style={{ background: "repeating-radial-gradient(circle, #252126 0 2px, #322c33 2px 4px)" }}>
                        <span className="size-5 rounded-full bg-dusty-rose ring-2 ring-blush" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.title}</p>
                        <p className="truncate text-sm text-muted-foreground">{s.artist}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground"><Avatar profile={profiles[s.added_by]} size="xs" /> {profiles[s.added_by]?.display_name} · {timeAgo(s.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        {s.url && !embed ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Song öffnen"><ExternalLink className="size-4" /></a> : null}
                        {s.added_by === me.id ? (
                          <>
                            <button onClick={() => setEditor({ open: true, song: s })} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Bearbeiten"><Pencil className="size-4" /></button>
                            <button
                              onClick={async () => {
                                const { error } = await supabase.from("songs").delete().eq("id", s.id);
                                if (error) toast.error(errorMessage(error));
                                void refetch();
                              }}
                              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger"
                              aria-label="Löschen"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {s.dedication ? <p className="font-display mt-3 rounded-xl bg-primary-soft/60 px-4 py-3 text-[1.35rem] leading-snug text-primary-soft-foreground">“{s.dedication}”</p> : null}
                    {embed ? <iframe title={`${s.title} – ${s.artist}`} src={embed} loading="lazy" allow="encrypted-media; clipboard-write" className="mt-3 h-[80px] w-full rounded-xl border-0" /> : null}
                  </li>
                );
              })}
            </Reveal>
          )}
        </section>
      </div>
      {editor.open ? <SongEditor open onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))} song={editor.song} onSaved={() => void refetch()} /> : null}
    </PageContainer>
  );
}
