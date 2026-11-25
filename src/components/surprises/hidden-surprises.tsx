"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/providers/app-provider";
import { HeartGlyph } from "@/components/shared/heart";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PrivateImage } from "@/components/shared/media";
import { useQuery, must } from "@/hooks/use-query";
import { useRealtimeRefetch } from "@/hooks/use-realtime-refetch";
import type { Surprise } from "@/types/app";

/** Hidden messages: a tiny heart appears somewhere on the home screen until it's found. */
export function HiddenSurprises() {
  const { supabase, me, nameOf } = useApp();
  const { data, refetch, setData } = useQuery(
    async () =>
      must(
        await supabase
          .from("surprises")
          .select("*")
          .eq("recipient_id", me.id)
          .eq("kind", "hidden")
          .is("opened_at", null)
          .lte("reveal_at", new Date().toISOString())
          .order("reveal_at")
          .limit(3),
      ),
    [me.id],
  );
  useRealtimeRefetch(["surprises"], refetch, "hidden-surprises");
  const [open, setOpen] = React.useState<Surprise | null>(null);

  const spots = ["top-[38%] right-[6%]", "top-[62%] left-[4%]", "top-[20%] left-[46%]"];

  return (
    <>
      <div aria-live="polite" className="pointer-events-none absolute inset-0 z-20">
        <AnimatePresence>
          {(data ?? []).map((s, i) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 2 }}
              whileHover={{ scale: 1.25 }}
              whileTap={{ scale: 0.9 }}
              onClick={async () => {
                setOpen(s);
                await supabase.rpc("mark_surprise_opened", { surprise_id: s.id });
                setData((list) => list?.filter((x) => x.id !== s.id));
              }}
              className={`pointer-events-auto absolute grid size-11 place-items-center rounded-full text-primary ${spots[i % spots.length]}`}
              aria-label="Eine versteckte Nachricht für dich"
            >
              <span className="absolute inset-1 animate-ping rounded-full bg-primary/15" />
              <HeartGlyph className="size-5 animate-heartbeat drop-shadow" />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow">you found it ♡</p>
            <DialogTitle>{open?.title}</DialogTitle>
            <DialogDescription>von {nameOf(open?.author_id)}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {open?.image_path ? <PrivateImage path={open.image_path} className="mb-4 aspect-[4/3] rounded-2xl" /> : null}
            <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{open?.body}</p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
