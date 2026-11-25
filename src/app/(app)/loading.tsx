import { HeartGlyph } from "@/components/shared/heart";

export default function Loading() {
  return (
    <div role="status" aria-label="Lädt" className="grid min-h-[70dvh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-primary">
        <HeartGlyph className="size-8 animate-heartbeat" />
        <span className="font-display text-xl text-muted-foreground">just a sec, love…</span>
      </div>
    </div>
  );
}
