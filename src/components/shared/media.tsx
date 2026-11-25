"use client";

/* eslint-disable @next/next/no-img-element -- private, signed media must not go through the public image optimizer */
import * as React from "react";
import { ImageOff } from "lucide-react";
import { useSignedUrl } from "@/hooks/use-signed-url";
import type { LocalPhoto } from "@/lib/photos";
import { parsePhotoRef } from "@/lib/photos";
import { cn } from "@/lib/utils";

type ImgProps = Omit<React.ComponentProps<"img">, "src"> & { position?: string };

/** Private image from Supabase Storage via a short-lived signed URL. */
export function PrivateImage({ path, className, alt = "", position, style, ...props }: ImgProps & { path: string | null | undefined }) {
  const url = useSignedUrl(path);
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)}>
      {!loaded && !failed ? <span aria-hidden className="skeleton absolute inset-0" /> : null}
      {failed ? (
        <span className="absolute inset-0 grid place-items-center text-muted-foreground">
          <ImageOff className="size-5" />
        </span>
      ) : null}
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 size-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
          style={{ objectPosition: position ?? "50% 40%", ...style }}
          {...props}
        />
      ) : null}
    </span>
  );
}

/** Your own photos from public/images, served as responsive WebP. */
export function LocalImage({
  photo,
  className,
  alt,
  sizes = "100vw",
  priority,
  position,
  style,
  ...props
}: ImgProps & { photo: LocalPhoto; sizes?: string; priority?: boolean }) {
  const [loaded, setLoaded] = React.useState(false);
  const srcSet = photo.srcset.map((s) => `${s.src} ${s.width}w`).join(", ");
  const src = photo.srcset[Math.min(1, photo.srcset.length - 1)]?.src ?? photo.original;
  return (
    <span className={cn("relative block overflow-hidden", className)} style={{ backgroundColor: photo.color }}>
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt ?? photo.name}
        width={photo.width || undefined}
        height={photo.height || undefined}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn("absolute inset-0 size-full object-cover transition-opacity duration-700", loaded || priority ? "opacity-100" : "opacity-0")}
        style={{ objectPosition: position ?? "50% 35%", ...style }}
        {...props}
      />
    </span>
  );
}

/** Renders a stored photo reference ("local:…" or "storage:…"), or the fallback. */
export function PhotoRefImage({
  value,
  fallback,
  className,
  sizes,
  priority,
  alt = "",
}: {
  value: string | null | undefined;
  fallback?: React.ReactNode;
  className?: string;
  sizes?: string;
  priority?: boolean;
  alt?: string;
}) {
  const ref = parsePhotoRef(value);
  if (!ref) return <>{fallback ?? null}</>;
  if (ref.type === "local") return <LocalImage photo={ref.photo} className={className} sizes={sizes} priority={priority} alt={alt} />;
  return <PrivateImage path={ref.path} className={className} alt={alt} />;
}

export function PrivateVideo({ path, className, poster, ...props }: Omit<React.ComponentProps<"video">, "src"> & { path: string }) {
  const url = useSignedUrl(path);
  if (!url) return <span className={cn("skeleton block", className)} />;
  return <video src={url} poster={poster} playsInline preload="metadata" className={cn("bg-black object-cover", className)} {...props} />;
}
