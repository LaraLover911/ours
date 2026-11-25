"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { MediaPicker, type PickedMedia } from "@/components/shared/media-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MEMORY_CATEGORIES } from "@/lib/constants";
import { errorMessage } from "@/lib/utils/errors";
import { removeMedia } from "@/lib/supabase/media";
import type { Memory, MemoryMedia } from "@/types/app";
import { z } from "zod";

export type MemoryWithMedia = Memory & { memory_media: MemoryMedia[] };

const schema = z.object({
  title: z.string().trim().min(1, "Gib der Erinnerung einen Titel.").max(140),
  description: z.string().trim().max(4000).optional(),
  happened_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  location: z.string().trim().max(140).optional(),
  category: z.enum(["date", "reise", "alltag", "meilenstein", "feier", "sonstiges"]),
});

export function MemoryEditor({
  open,
  onOpenChange,
  memory,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  memory?: MemoryWithMedia | null;
  onSaved: (id: string) => void;
}) {
  const { supabase, me } = useApp();
  // Mounted fresh each time the dialog opens (see parent), so props seed the state.
  const existing = React.useMemo(() => memory?.memory_media.slice().sort((a, b) => a.position - b.position) ?? [], [memory]);
  const [media, setMedia] = React.useState<PickedMedia[]>(() =>
    existing.map((m) => ({ path: m.path, kind: m.kind as "image" | "video", width: m.width ?? undefined, height: m.height ?? undefined })),
  );
  const [favorite, setFavorite] = React.useState(memory?.is_favorite ?? false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    const v = parsed.data;
    setPending(true);
    setError(null);
    try {
      const row = {
        title: v.title,
        description: v.description || null,
        happened_on: v.happened_on || null,
        location: v.location || null,
        category: v.category,
        is_favorite: favorite,
      };
      let id = memory?.id;
      if (id) {
        const { error } = await supabase.from("memories").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("memories").insert({ ...row, created_by: me.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      // Sync media rows
      const keep = new Set(media.map((m) => m.path));
      const removed = existing.filter((m) => !keep.has(m.path));
      if (removed.length) {
        await supabase.from("memory_media").delete().in("id", removed.map((r) => r.id));
        void removeMedia(removed.filter((r) => r.created_by === me.id).map((r) => r.path));
      }
      const existingPaths = new Set(existing.map((m) => m.path));
      const added = media.filter((m) => !existingPaths.has(m.path));
      if (added.length) {
        const { error } = await supabase.from("memory_media").insert(
          added.map((m) => ({ memory_id: id!, path: m.path, kind: m.kind, width: m.width ?? null, height: m.height ?? null, position: media.indexOf(m), created_by: me.id })),
        );
        if (error) throw error;
      }
      toast.success(memory ? "Erinnerung aktualisiert" : "Erinnerung gespeichert ♡");
      onSaved(id!);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{memory ? "edit memory" : "a new memory"}</DialogTitle>
            <DialogDescription>Fotos, Videos und ein paar Worte, damit wir es nie vergessen.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <MediaPicker value={media} onChange={setMedia} area="memories" max={12} />
            <Field label="Titel" htmlFor="m-title">
              <Input id="m-title" name="title" required maxLength={140} defaultValue={memory?.title} placeholder="Unser erster Sonnenuntergang" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Datum" htmlFor="m-date">
                <Input id="m-date" name="happened_on" type="date" defaultValue={memory?.happened_on ?? ""} />
              </Field>
              <Field label="Ort" htmlFor="m-loc">
                <Input id="m-loc" name="location" maxLength={140} defaultValue={memory?.location ?? ""} placeholder="Wo war das?" />
              </Field>
            </div>
            <Field label="Kategorie" htmlFor="m-cat">
              <NativeSelect id="m-cat" name="category" defaultValue={memory?.category ?? "alltag"}>
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Beschreibung" htmlFor="m-desc">
              <Textarea id="m-desc" name="description" maxLength={4000} defaultValue={memory?.description ?? ""} placeholder="Was ist passiert? Was hast du gefühlt?" />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <span className="flex items-center gap-2 text-sm"><Heart className="size-4 text-primary" /> Favorit</span>
              <Switch checked={favorite} onCheckedChange={setFavorite} aria-label="Als Favorit markieren" />
            </label>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={pending}>{pending ? "Speichert…" : "Speichern"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
