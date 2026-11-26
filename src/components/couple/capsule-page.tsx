"use client";

import * as React from "react";
import { Hourglass, Lock, MailOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { EmptyState, PageHeader } from "@/components/shared/states";
import { MediaPicker, type PickedMedia } from "@/components/shared/media-picker";
import { PrivateImage, PrivateVideo } from "@/components/shared/media";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { formatDate, fromLocalInputValue } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

type Capsule = Database["public"]["Tables"]["time_capsules"]["Row"];

/** Time capsules: sealed by the database until the chosen day, for both of you. */
export function CapsulePage() {
  const { supabase, me, nameOf } = useApp();
  const caps = useQuery(async () => must(await supabase.from("time_capsules").select("*").order("open_at")), [supabase]);
  useRealtimeRefetch(["time_capsules"], () => void caps.refetch());
  const now = useNow(30_000);
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const list = caps.data ?? [];
  const sealed = list.filter((c) => now == null || new Date(c.open_at).getTime() > now);
  const ready = list.filter((c) => now != null && new Date(c.open_at).getTime() <= now);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="time capsule"
        title={
          <>
            for us, <em className="text-primary">later</em>
          </>
        }
        description="Schreibt etwas für euer zukünftiges Ich. Bis zum gewählten Tag bleibt der Inhalt versiegelt, auch für die Person, die ihn geschrieben hat."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Zeitkapsel
          </Button>
        }
      />
      {caps.loading ? (
        <Skeleton className="h-40" />
      ) : !list.length ? (
        <EmptyState icon={<Hourglass />} title="Noch keine Zeitkapsel" description="Zum Beispiel: ein Brief an euch in einem Jahr." action={<Button onClick={() => setCreating(true)}>Erste Zeitkapsel</Button>} />
      ) : (
        <div className="space-y-8">
          {ready.length ? (
            <Grid title="Geöffnet">
              {ready.map((c) => (
                <CapsuleCard key={c.id} c={c} mine={c.author_id === me.id} by={nameOf(c.author_id)} onOpen={() => setOpenId(c.id)} />
              ))}
            </Grid>
          ) : null}
          {sealed.length ? (
            <Grid title="Versiegelt">
              {sealed.map((c) => (
                <CapsuleCard
                  key={c.id}
                  c={c}
                  mine={c.author_id === me.id}
                  by={nameOf(c.author_id)}
                  now={now}
                  onDelete={async () => {
                    const { error } = await supabase.from("time_capsules").delete().eq("id", c.id);
                    if (error) toast.error(errorMessage(error));
                    else void caps.refetch();
                  }}
                />
              ))}
            </Grid>
          ) : null}
        </div>
      )}
      <CreateCapsule open={creating} onClose={() => setCreating(false)} onSaved={() => void caps.refetch()} />
      <OpenCapsule id={openId} capsule={list.find((c) => c.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </PageContainer>
  );
}

function Grid({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
    </section>
  );
}

function CapsuleCard({ c, mine, by, now, onOpen, onDelete }: { c: Capsule; mine: boolean; by: string; now?: number | null; onOpen?: () => void; onDelete?: () => void }) {
  const days = now != null ? Math.ceil((new Date(c.open_at).getTime() - now) / 86400e3) : null;
  return (
    <li className={cn("card-surface relative p-4", onOpen && "cursor-pointer transition-transform hover:-translate-y-0.5")}>
      <button type="button" className="block w-full text-left disabled:cursor-default" onClick={onOpen} disabled={!onOpen}>
        <span className="mb-2 grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">{onOpen ? <MailOpen className="size-5" /> : <Lock className="size-5" />}</span>
        <p className="font-medium break-words">{c.title}</p>
        <p className="text-[12.5px] text-muted-foreground">
          von {mine ? "dir" : by} · {onOpen ? `geöffnet seit ${formatDate(c.open_at)}` : `öffnet am ${formatDate(c.open_at)}`}
        </p>
        {days != null && days > 0 ? <p className="mt-2 font-display text-2xl">noch {days} {days === 1 ? "Tag" : "Tage"}</p> : null}
      </button>
      {onDelete && mine ? (
        <Button size="icon-sm" variant="ghost" className="absolute top-2 right-2" onClick={onDelete} aria-label="Zeitkapsel löschen (vor dem Öffnen)">
          <Trash2 />
        </Button>
      ) : null}
    </li>
  );
}

function CreateCapsule({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { supabase } = useApp();
  const [media, setMedia] = React.useState<PickedMedia[]>([]);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const at = fromLocalInputValue(String(fd.get("open_at") ?? ""));
            setBusy(true);
            const { error } = await supabase.rpc("capsule_create", {
              p_title: String(fd.get("title") ?? "").trim(),
              p_open_at: at ?? "",
              p_body: String(fd.get("body") ?? ""),
              p_media: media.map((m) => m.path),
            });
            setBusy(false);
            if (error) return toast.error(errorMessage(error));
            setMedia([]);
            onSaved();
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Zeitkapsel vergraben</DialogTitle>
            <DialogDescription>Nach dem Speichern kann niemand mehr hineinsehen, bis sie sich öffnet.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Titel" htmlFor="tc-title">
              <Input id="tc-title" name="title" maxLength={120} required placeholder="z. B. Für uns in einem Jahr" />
            </Field>
            <Field label="Öffnet sich am" htmlFor="tc-at" hint="Frühestens in einer Stunde.">
              <Input id="tc-at" name="open_at" type="datetime-local" required />
            </Field>
            <Field label="Nachricht" htmlFor="tc-body">
              <Textarea id="tc-body" name="body" rows={6} maxLength={20000} required />
            </Field>
            <MediaPicker value={media} onChange={setMedia} area="capsule" max={10} label="Fotos oder Videos beilegen" />
          </DialogBody>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              <Lock /> Versiegeln
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenCapsule({ id, capsule, onClose }: { id: string | null; capsule: Capsule | null; onClose: () => void }) {
  const { supabase } = useApp();
  const content = useQuery<Database["public"]["Tables"]["time_capsule_contents"]["Row"] | null>(async () => {
    if (!id) return null;
    void supabase.rpc("capsule_mark_opened", { p_id: id });
    return must(await supabase.from("time_capsule_contents").select("*").eq("capsule_id", id).maybeSingle());
  }, [supabase, id]);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{capsule?.title}</DialogTitle>
          {capsule ? <DialogDescription>Vergraben am {formatDate(capsule.created_at)}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>
          {content.loading ? (
            <Skeleton className="h-32" />
          ) : content.data ? (
            <div className="space-y-4">
              <p className="text-[15px] whitespace-pre-wrap">{content.data.body}</p>
              {content.data.media_paths.map((p) =>
                /\.(mp4|mov|webm)$/i.test(p) ? <PrivateVideo key={p} path={p} controls className="w-full rounded-xl" /> : <PrivateImage key={p} path={p} alt="" className="w-full rounded-xl" />,
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Noch versiegelt.</p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
