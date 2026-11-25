"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { removeMedia, uploadMedia, type UploadArea, type UploadResult } from "@/lib/supabase/media";
import { errorMessage } from "@/lib/utils/errors";
import { cn } from "@/lib/utils";
import { PrivateImage, PrivateVideo } from "./media";

export type PickedMedia = Pick<UploadResult, "path" | "kind" | "width" | "height">;

/**
 * Upload photos/videos into the private bucket and keep a list of paths.
 * Files removed before saving are deleted from storage again.
 */
export function MediaPicker({
  value,
  onChange,
  area,
  max = 10,
  accept = "image/*,video/mp4,video/quicktime,video/webm",
  privateFiles,
  label = "Fotos hinzufügen",
  className,
}: {
  value: PickedMedia[];
  onChange: (v: PickedMedia[]) => void;
  area: UploadArea;
  max?: number;
  accept?: string;
  privateFiles?: boolean;
  label?: string;
  className?: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(0);
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, max - value.length));
    if (list.length < files.length) toast(`Maximal ${max} Dateien.`);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const res = await uploadMedia(file, area, { private: privateFiles });
        if (res.kind === "audio") throw new Error("Bitte nur Fotos oder Videos.");
        valueRef.current = [...valueRef.current, { path: res.path, kind: res.kind, width: res.width, height: res.height }];
        onChange(valueRef.current);
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  };

  return (
    <div className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", className)}>
      {value.map((m) => (
        <div key={m.path} className="group relative aspect-square overflow-hidden rounded-xl">
          {m.kind === "video" ? <PrivateVideo path={m.path} className="absolute inset-0 size-full" muted /> : <PrivateImage path={m.path} className="absolute inset-0" />}
          <button
            type="button"
            onClick={() => {
              onChange(value.filter((v) => v.path !== m.path));
              void removeMedia([m.path]);
            }}
            className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
            aria-label="Entfernen"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      {Array.from({ length: uploading }).map((_, i) => (
        <div key={`u${i}`} className="skeleton grid aspect-square place-items-center rounded-xl">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ))}
      {value.length + uploading < max ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft/40 hover:text-primary"
        >
          <ImagePlus className="size-5" />
          {label}
        </button>
      ) : null}
      <input ref={input} type="file" accept={accept} multiple={max > 1} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFiles(e.target.files)} />
    </div>
  );
}
