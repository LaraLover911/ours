"use client";

import * as React from "react";
import { Camera, Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { PageContainer } from "@/components/navigation/app-shell";
import { PageHeader } from "@/components/shared/states";
import { Section } from "@/components/shared/section";
import { PrivateImage } from "@/components/shared/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { must, useQuery } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import { removeMedia, uploadMedia } from "@/lib/supabase/media";
import { berlinDateString, formatDate } from "@/lib/utils/dates";
import { errorMessage } from "@/lib/utils/errors";

/** Photo of the day: post yours to see your partner's. */
export function PhotoPage() {
  const { supabase, me, partner, nameOf } = useApp();
  const photos = useQuery(async () => must(await supabase.from("daily_photos").select("*").order("day", { ascending: false }).limit(120)), [supabase]);
  const status = useQuery(async () => must(await supabase.rpc("daily_photo_status")), [supabase]);
  useRealtimeRefetch(["daily_photos"], () => {
    void photos.refetch();
    void status.refetch();
  });
  const input = React.useRef<HTMLInputElement>(null);
  const [caption, setCaption] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const today = berlinDateString();
  const mine = photos.data?.find((p) => p.day === today && p.user_id === me.id);
  const theirs = partner ? photos.data?.find((p) => p.day === today && p.user_id === partner.id) : null;
  const partnerPosted = !!status.data?.find((s) => s.user_id === partner?.id)?.posted;

  const post = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadMedia(file, "photo");
      if (up.kind !== "image") {
        await removeMedia([up.path]);
        throw new Error("Bitte ein Foto wählen.");
      }
      const { error } = await supabase.from("daily_photos").insert({ path: up.path, caption: caption.trim() || null });
      if (error) {
        await removeMedia([up.path]);
        throw error;
      }
      setCaption("");
      void photos.refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const remove = async () => {
    if (!mine) return;
    const { error } = await supabase.from("daily_photos").delete().eq("id", mine.id);
    if (error) return toast.error(errorMessage(error));
    await removeMedia([mine.path]);
    void photos.refetch();
  };

  const past = Array.from(new Set((photos.data ?? []).map((p) => p.day))).filter((d) => d !== today);
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        eyebrow="photo of the day"
        title={
          <>
            one photo, <em className="text-primary">every day</em>
          </>
        }
        description={`Ein Foto aus eurem Tag. ${partner?.display_name ?? "Dein Schatz"}s Foto von heute siehst du, sobald du deins gepostet hast.`}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Slot title="Du">
          {photos.loading ? (
            <Skeleton className="size-full" />
          ) : mine ? (
            <>
              <PrivateImage path={mine.path} alt={mine.caption ?? "Dein Foto von heute"} className="size-full object-cover" />
              <Button size="icon-sm" variant="soft" className="absolute top-2 right-2" aria-label="Mein Foto von heute löschen" onClick={remove}>
                <Trash2 />
              </Button>
              {mine.caption ? <Caption text={mine.caption} /> : null}
            </>
          ) : (
            <div className="grid size-full place-items-center p-6 text-center">
              <div className="w-full max-w-xs space-y-3">
                <Input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 200))} placeholder="Bildunterschrift (optional)" aria-label="Bildunterschrift" />
                <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => post(e.target.files?.[0])} />
                <Button size="lg" onClick={() => input.current?.click()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Camera />} Foto von heute
                </Button>
              </div>
            </div>
          )}
        </Slot>
        <Slot title={partner?.display_name ?? "Dein Schatz"}>
          {theirs ? (
            <>
              <PrivateImage path={theirs.path} alt={theirs.caption ?? "Foto von heute"} className="size-full object-cover" />
              {theirs.caption ? <Caption text={theirs.caption} /> : null}
            </>
          ) : (
            <div className="grid size-full place-items-center p-6 text-center text-[14px] text-muted-foreground">
              {partnerPosted ? (
                <p>
                  <Lock className="mx-auto mb-2 size-6" />
                  {partner?.display_name} hat schon gepostet. Zeig deins, um es zu sehen.
                </p>
              ) : (
                <p>Noch kein Foto von heute.</p>
              )}
            </div>
          )}
        </Slot>
      </div>

      <Section icon={<Camera />} title="Eure Tage" className="mt-6">
        {past.length ? (
          <ul className="space-y-4">
            {past.slice(0, 30).map((d) => (
              <li key={d}>
                <p className="mb-1.5 text-[12.5px] text-muted-foreground">{formatDate(d, { weekday: "long", day: "numeric", month: "long" })}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(photos.data ?? [])
                    .filter((p) => p.day === d)
                    .sort((a) => (a.user_id === me.id ? -1 : 1))
                    .map((p) => (
                      <figure key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                        <PrivateImage path={p.path} alt={p.caption ?? `Foto von ${nameOf(p.user_id)}`} className="size-full object-cover" />
                        <figcaption className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pt-6 pb-1.5 text-[12px] text-white">
                          {p.user_id === me.id ? "Du" : nameOf(p.user_id)}
                          {p.caption ? ` · ${p.caption}` : ""}
                        </figcaption>
                      </figure>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted-foreground">Hier sammeln sich eure Tage, sobald ihr Fotos postet.</p>
        )}
      </Section>
    </PageContainer>
  );
}

function Slot({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-surface overflow-hidden p-0" aria-label={title}>
      <p className="px-4 pt-3 pb-2 text-[13px] font-medium">{title}</p>
      <div className="relative aspect-[4/5] bg-muted">{children}</div>
    </section>
  );
}

function Caption({ text }: { text: string }) {
  return <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pt-8 pb-2 text-[13px] text-white">{text}</p>;
}
