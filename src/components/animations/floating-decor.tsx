import { HeartGlyph, Sparkle } from "@/components/shared/heart";
import { cn } from "@/lib/utils";

/** Subtle decorative hearts & sparkles. Pure CSS, hidden from assistive tech, fewer on mobile. */
export function FloatingDecor({ className, tone = "rose" }: { className?: string; tone?: "rose" | "light" }) {
  const c = tone === "light" ? "text-white/50" : "text-dusty-rose/60";
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <HeartGlyph className={cn("absolute top-[12%] left-[8%] size-4 animate-float [--r:-10deg]", c)} />
      <Sparkle className={cn("absolute top-[22%] right-[10%] size-3 animate-float [animation-delay:-2s]", c)} />
      <HeartGlyph className={cn("absolute bottom-[18%] left-[16%] hidden size-3 animate-float [--r:12deg] [animation-delay:-4s] md:block", c)} />
      <Sparkle className={cn("absolute right-[22%] bottom-[12%] hidden size-4 animate-float [animation-delay:-6s] md:block", c)} />
    </div>
  );
}
