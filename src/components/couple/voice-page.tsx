"use client";

import * as React from "react";
import { Lock, Mic, Send, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VoicePlayer, formatDuration, useVoiceRecorder, type VoiceResult } from "@/components/chat/voice";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { removeMedia, uploadMedia } from "@/lib/supabase/media";
import { timeAgo } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

type Note = Database["public"]["Tables"]["voice_notes"]["Row"];

/** Voice notes: to your partner, or private memos only you can hear. Recording starts only when you tap. */
export function VoicePage() {
  const { supabase, me, partner } = useApp();
  const notes = useQuery(async () => must(await supabase.from("voice_notes").select("*").order("created_at", { ascending: false }).limit(100)), [supabase]);
  useRealtimeRefetch(["voice_notes"], () => void notes.refetch());
  const rec = useVoiceRecorder();
  const [take, setTake] = React.useState<VoiceResult | null>(null);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const start = async () => {
    try {
      setTake(null);
      await rec.start();
    } catch (e) {
      toast.error(e instanceof DOMException && e.name === "NotAllowedError" ? "Mikrofon nicht erlaubt. Du kannst es in den Website-Einstellungen freigeben." : errorMessage(e));
    }
  };
  const send = async (to: string | null) => {
    if (!take) return;
    setBusy(true);
    try {
      const up = await uploadMedia(take.blob, "voice", { private: to === null });
      const { error } = await supabase.from("voice_notes").insert({
        recipient_id: to,
        path: up.path,
        duration_ms: Math.round(take.duration * 1000),
        waveform: take.waveform.map((w) => Math.round(w * 100)),
        title: title.trim() || null,
      });
      if (error) {
        await removeMedia([up.path]);
        throw error;
      }
      setTake(null);
      setTitle("");
      toast.success(to ? "Gesendet ♡" : "Gespeichert, nur für dich");
      void notes.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (n: Note) => {
    const { error } = await supabase.from("voice_notes").delete().eq("id", n.id);
    if (error) return toast.error(errorMessage(error));
    await removeMedia([n.path]);
    void notes.refetch();
  };

  const all = notes.data ?? [];
  const forMe = all.filter((n) => n.recipient_id === me.id);
  const sent = all.filter((n) => n.author_id === me.id && n.recipient_id);
  const memos = all.filter((n) => n.author_id === me.id && !n.recipient_id);
  const partnerName = partner?.display_name ?? "dein Schatz";

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        eyebrow="voice notes"
        title={
          <>
            just your <em className="text-primary">voice</em>
          </>
        }
        description={`Kleine Sprachnotizen für ${partnerName}, oder private Notizen nur für dich. Das Mikrofon läuft nur, während du aufnimmst.`}
      />
      <section className="card-surface p-5" aria-label="Aufnehmen">
        {rec.state === "recording" ? (
          <div className="flex items-center gap-4">
            <span className="relative grid size-14 place-items-center rounded-full bg-danger/15 text-danger">
              <span className="absolute inset-0 rounded-full bg-danger/20" style={{ transform: `scale(${1 + rec.level * 0.6})` }} />
              <Mic className="relative size-6" />
            </span>
            <p className="flex-1 font-display text-3xl tabular-nums">{formatDuration(rec.elapsed)}</p>
            <Button variant="ghost" onClick={rec.cancel} aria-label="Verwerfen">
              <X />
            </Button>
            <Button onClick={async () => setTake(await rec.stop())}>
              <Square /> Stopp
            </Button>
          </div>
        ) : take ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <VoicePlayerLocal take={take} />
              <Button size="icon-sm" variant="ghost" onClick={() => setTake(null)} aria-label="Verwerfen">
                <Trash2 />
              </Button>
            </div>
            <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Titel (optional)" aria-label="Titel" />
            <div className="flex flex-wrap gap-2">
              {partner ? (
                <Button onClick={() => send(partner.id)} disabled={busy}>
                  <Send /> An {partnerName}
                </Button>
              ) : null}
              <Button variant="soft" onClick={() => send(null)} disabled={busy}>
                <Lock /> Nur für mich
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <Button size="lg" onClick={start} disabled={!rec.supported}>
              <Mic /> Aufnehmen
            </Button>
            <p className="text-[12.5px] text-muted-foreground">{rec.supported ? "Bis zu 5 Minuten." : "Dieser Browser kann keine Sprachnotizen aufnehmen."}</p>
          </div>
        )}
      </section>

      {notes.loading ? <Skeleton className="mt-5 h-40" /> : null}
      <NoteList title={`Von ${partnerName}`} notes={forMe} empty="Noch keine Sprachnotiz für dich." onPlay={(n) => !n.listened_at && void supabase.rpc("voice_listened", { p_id: n.id })} />
      <NoteList title="Gesendet" notes={sent} empty="Du hast noch nichts geschickt." onDelete={remove} showListened />
      <NoteList title="Nur für mich" notes={memos} empty="Private Notizen landen hier. Niemand sonst kann sie hören." onDelete={remove} />
    </PageContainer>
  );
}

function NoteList({ title, notes, empty, onDelete, onPlay, showListened }: { title: string; notes: Note[]; empty: string; onDelete?: (n: Note) => void; onPlay?: (n: Note) => void; showListened?: boolean }) {
  return (
    <Section title={title} className="mt-5">
      {notes.length ? (
        <ul className="divide-y divide-border">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-x-3 py-2.5" onClickCapture={() => onPlay?.(n)}>
              <VoicePlayer path={n.path} duration={n.duration_ms / 1000} waveform={n.waveform.map((w) => w / 100)} />
              <div className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
                {n.title ? <p className="truncate text-[14px] text-foreground">{n.title}</p> : null}
                <p>
                  {timeAgo(n.created_at)}
                  {onPlay && !n.listened_at ? <span className="ml-1 font-medium text-primary">· neu</span> : null}
                  {showListened ? (n.listened_at ? " · angehört ✓" : " · noch nicht angehört") : ""}
                </p>
              </div>
              {onDelete ? (
                <Button size="icon-sm" variant="ghost" onClick={() => onDelete(n)} aria-label="Löschen">
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted-foreground">{empty}</p>
      )}
    </Section>
  );
}

/** Preview of a fresh recording before it is uploaded. */
function VoicePlayerLocal({ take }: { take: VoiceResult }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    const u = URL.createObjectURL(take.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL lifecycle is tied to this effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [take.blob]);
  return url ? <audio src={url} controls className="h-10 w-full max-w-xs" aria-label={`Vorschau, ${formatDuration(take.duration)}`} /> : null;
}
