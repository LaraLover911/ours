"use client";

import { useSignedUrl } from "@/hooks/use-signed-url";
import { localPhotos } from "@/lib/photos";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/app";
import { LocalImage } from "./media";

/* eslint-disable @next/next/no-img-element */

const sizes = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-24 text-3xl",
};

export function Avatar({
  profile,
  size = "md",
  online,
  className,
  ring,
}: {
  profile: Pick<Profile, "display_name" | "avatar_path" | "role"> | null | undefined;
  size?: keyof typeof sizes;
  online?: boolean;
  className?: string;
  ring?: boolean;
}) {
  const url = useSignedUrl(profile?.avatar_path);
  const local = profile && !profile.avatar_path ? localPhotos(profile.role as "abdullah" | "lara")[0] : undefined;
  const initial = (profile?.display_name ?? "?").slice(0, 1).toUpperCase();
  const tint = profile?.role === "lara" ? "bg-blush text-cherry" : "bg-[#efe6e0] text-charcoal";

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "relative grid place-items-center overflow-hidden rounded-full font-display select-none",
          sizes[size],
          tint,
          ring && "ring-[3px] ring-card",
        )}
      >
        {url ? (
          <img src={url} alt={profile?.display_name ?? ""} className="absolute inset-0 size-full object-cover" />
        ) : local ? (
          <LocalImage photo={local} sizes="96px" className="absolute inset-0" alt={profile?.display_name ?? ""} />
        ) : (
          <span aria-hidden className="translate-y-[0.04em]">{initial}</span>
        )}
      </span>
      {online !== undefined ? (
        <span
          role="img"
          aria-label={online ? "online" : "offline"}
          className={cn(
            "absolute right-0 bottom-0 block rounded-full ring-2 ring-card transition-colors",
            size === "xs" || size === "sm" ? "size-2.5" : "size-3",
            online ? "bg-[#4fbf7f]" : "bg-border-strong",
          )}
        />
      ) : null}
    </span>
  );
}
