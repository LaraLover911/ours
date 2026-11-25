"use client";

import * as React from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { LocalImage } from "./media";
import type { LocalPhoto } from "@/lib/photos";

/* eslint-disable @next/next/no-img-element */

export type LightboxItem =
  | { type: "storage"; path: string; kind: "image" | "video"; caption?: string }
  | { type: "local"; photo: LocalPhoto; caption?: string };

function Slide({ item }: { item: LightboxItem }) {
  const url = useSignedUrl(item.type === "storage" ? item.path : null);
  if (item.type === "local") {
    return <LocalImage photo={item.photo} sizes="100vw" className="size-full bg-transparent! [&_img]:object-contain!" />;
  }
  if (!url) return <div className="size-10 animate-spin rounded-full border-2 border-white/60 border-r-transparent" />;
  if (item.kind === "video") {
    return <video src={url} controls playsInline autoPlay className="max-h-full max-w-full rounded-lg" />;
  }
  return <img src={url} alt={item.caption ?? ""} className="max-h-full max-w-full rounded-lg object-contain select-none" draggable={false} />;
}

export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null && items.length > 0;
  const i = index ?? 0;
  const [dir, setDir] = React.useState(0);
  const go = React.useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next < 0 || next >= items.length) return;
      setDir(delta);
      onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  const current = items[i];
  const downloadUrl = useSignedUrl(current?.type === "storage" ? current.path : null);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.y) > 120 && Math.abs(info.offset.y) > Math.abs(info.offset.x)) return onClose();
    if (info.offset.x < -60 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 60 || info.velocity.x > 400) go(-1);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/92 backdrop-blur-sm data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <DialogPrimitive.Content className="fixed inset-0 z-[70] flex flex-col text-white outline-none" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Medienansicht</DialogPrimitive.Title>
          <div className="flex items-center justify-between px-3 pt-[calc(var(--safe-top)+0.5rem)] pb-2">
            <span className="px-2 text-sm text-white/70 tabular-nums">
              {i + 1} / {items.length}
            </span>
            <div className="flex gap-1">
              {downloadUrl ? (
                <a href={downloadUrl} download target="_blank" rel="noreferrer" className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Herunterladen">
                  <Download className="size-5" />
                </a>
              ) : null}
              <DialogPrimitive.Close className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Schließen">
                <X className="size-6" />
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div
                key={i}
                custom={dir}
                initial={{ opacity: 0, x: dir * 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -80 }}
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
                drag
                dragSnapToOrigin
                dragElastic={0.6}
                onDragEnd={onDragEnd}
                className="absolute inset-0 flex touch-none items-center justify-center p-3 sm:p-10"
              >
                {current ? <Slide item={current} /> : null}
              </motion.div>
            </AnimatePresence>
            {i > 0 ? (
              <button onClick={() => go(-1)} className="absolute top-1/2 left-3 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid" aria-label="Vorheriges">
                <ChevronLeft className="size-6" />
              </button>
            ) : null}
            {i < items.length - 1 ? (
              <button onClick={() => go(1)} className="absolute top-1/2 right-3 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid" aria-label="Nächstes">
                <ChevronRight className="size-6" />
              </button>
            ) : null}
          </div>
          {current?.caption ? <p className="px-6 pt-2 pb-[calc(var(--safe-bottom)+1rem)] text-center text-sm text-white/80">{current.caption}</p> : <div className="h-[calc(var(--safe-bottom)+1rem)]" />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
