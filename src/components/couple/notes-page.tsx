"use client";

import * as React from "react";
import { Loader2, NotebookPen, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

type Note = Database["public"]["Tables"]["shared_notes"]["Row"];

/**
 * Shared notes. Saves are versioned on the server: if you both edit the same note
 * at once, nothing is silently overwritten. You choose which version to keep.
 */
export function NotesPage() {
  const { supabase } = useApp();
  const notes = useQuery(async () => must(await supabase.from("shared_notes").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false })), [supabase]);
  useRealtimeRefetch(["shared_notes"], () => void notes.refetch());
  const [openId, setOpenId] = React.useState<string | null>(null);
  const list = notes.data ?? [];
  const current = list.find((n) => n.id === openId) ?? null;

  const create = async () => {
    const { data, error } = await supabase.from("shared_notes").insert({ title: "", body: "" }).select().single();
    if (error) return toast.error(errorMessage(error));
    await notes.refetch();
    setOpenId(data.id);
  };

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="shared notes"
        title={
          <>
            written <em className="text-primary">together</em>
          </>
        }
        description="Einkaufslisten, Packlisten, Ideen. Ihr könnt beide schreiben, Änderungen erscheinen sofort beim anderen."
        actions={
          <Button onClick={create}>
            <Plus /> Notiz
          </Button>
        }
      />
      <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <nav aria-label="Notizen" className={cn("space-y-2", current && "max-md:hidden")}>
          {notes.loading ? <Skeleton className="h-32" /> : null}
          {list.map((n) => (
            <button key={n.id} type="button" onClick={() => setOpenId(n.id)} className={cn("card-surface block w-full p-3 text-left transition-colors hover:bg-muted", openId === n.id && "ring-2 ring-primary")}>
              <p className="flex items-center gap-1.5 truncate text-[14.5px] font-medium">
                {n.pinned ? <Pin className="size-3.5 shrink-0 text-primary" /> : null}
                {n.title || "Ohne Titel"}
              </p>
              <p className="truncate text-[12.5px] text-muted-foreground">{n.body.split("\n")[0] || "leer"}</p>
              <p className="text-[11.5px] text-muted-foreground">{timeAgo(n.updated_at)}</p>
            </button>
          ))}
          {!notes.loading && !list.length ? <p className="text-[14px] text-muted-foreground">Noch keine Notizen.</p> : null}
        </nav>
        {current ? (
          <Editor key={current.id} note={current} onBack={() => setOpenId(null)} onDeleted={() => (setOpenId(null), void notes.refetch())} />
        ) : (
          <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-border text-[14px] text-muted-foreground max-md:hidden">
            <p className="flex items-center gap-2">
              <NotebookPen className="size-4" /> Wähle eine Notiz oder leg eine neue an.
            </p>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function Editor({ note, onBack, onDeleted }: { note: Note; onBack: () => void; onDeleted: () => void }) {
  const { supabase, me, nameOf } = useApp();
  const [title, setTitle] = React.useState(note.title);
  const [body, setBody] = React.useState(note.body);
  const [version, setVersion] = React.useState(note.version);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState<Note | null>(null);

  // A newer version arrived from the partner while I have no unsaved changes: show it.
  const [seenVersion, setSeenVersion] = React.useState(note.version);
  if (note.version !== seenVersion) {
    setSeenVersion(note.version);
    if (!dirty && note.version > version) {
      setTitle(note.title);
      setBody(note.body);
      setVersion(note.version);
    }
  }

  const save = React.useCallback(
    async (t: string, b: string, v: number) => {
      setSaving(true);
      const { data, error } = await supabase.rpc("note_save", { p_id: note.id, p_title: t, p_body: b, p_version: v });
      setSaving(false);
      if (error) return toast.error(errorMessage(error));
      const res = data as { conflict: boolean; note: Note };
      if (res.conflict) setConflict(res.note);
      else {
        setVersion(res.note.version);
        setDirty(false);
      }
    },
    [supabase, note.id],
  );

  React.useEffect(() => {
    if (!dirty || conflict) return;
    const t = window.setTimeout(() => void save(title, body, version), 800);
    return () => window.clearTimeout(t);
  }, [dirty, conflict, title, body, version, save]);

  return (
    <section className="card-surface flex min-h-[60dvh] min-w-0 flex-col p-4 sm:p-5" aria-label="Notiz bearbeiten">
      <div className="mb-2 flex items-center gap-1">
        <Button size="sm" variant="ghost" className="md:hidden" onClick={onBack}>
          ← Alle
        </Button>
        <span className="ml-auto flex items-center gap-1 text-[12px] text-muted-foreground" aria-live="polite">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {saving ? "speichert…" : dirty ? "ungespeichert" : `gespeichert · ${note.updated_by === me.id ? "von dir" : `von ${nameOf(note.updated_by)}`}`}
        </span>
        <Button size="icon-sm" variant="ghost" aria-label={note.pinned ? "Lösen" : "Anheften"} onClick={async () => {
          const { error } = await supabase.from("shared_notes").update({ pinned: !note.pinned }).eq("id", note.id);
          if (error) toast.error(errorMessage(error));
        }}>
          {note.pinned ? <PinOff /> : <Pin />}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Notiz löschen" onClick={async () => {
          const { error } = await supabase.from("shared_notes").delete().eq("id", note.id);
          if (error) return toast.error(errorMessage(error));
          onDeleted();
        }}>
          <Trash2 />
        </Button>
      </div>
      {conflict ? (
        <div role="alert" className="mb-3 rounded-xl border border-primary/30 bg-primary-soft p-3 text-[13.5px] text-primary-soft-foreground">
          <p>{nameOf(conflict.updated_by)} hat diese Notiz gerade auch geändert. Welche Version soll bleiben?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              setTitle(conflict.title);
              setBody(conflict.body);
              setVersion(conflict.version);
              setDirty(false);
              setConflict(null);
            }}>
              Version von {nameOf(conflict.updated_by)}
            </Button>
            <Button size="sm" onClick={() => {
              const v = conflict.version;
              setConflict(null);
              void save(title, body, v);
            }}>
              Meine behalten
            </Button>
          </div>
        </div>
      ) : null}
      <Input
        value={title}
        onChange={(e) => (setTitle(e.target.value.slice(0, 120)), setDirty(true))}
        placeholder="Titel"
        aria-label="Titel"
        className="border-0 bg-transparent px-0 font-display text-3xl shadow-none focus-visible:ring-0"
      />
      <Textarea
        value={body}
        onChange={(e) => (setBody(e.target.value.slice(0, 50000)), setDirty(true))}
        placeholder="Schreib los…"
        aria-label="Text"
        className="min-h-0 flex-1 resize-none border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
      />
    </section>
  );
}
