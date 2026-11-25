import { cn } from "@/lib/utils";

export function HeartGlyph({ className, filled = true }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-4", className)}>
      <path
        d="M12 20.3c-.3 0-.6-.1-.8-.3C6.4 16 3 12.9 3 9.2 3 6.6 5 4.6 7.5 4.6c1.6 0 3.2.8 4.5 2.4 1.3-1.6 2.9-2.4 4.5-2.4C19 4.6 21 6.6 21 9.2c0 3.7-3.4 6.8-8.2 10.8-.2.2-.5.3-.8.3Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-4", className)}>
      <path d="M12 2c.4 4.6 2.4 7.6 8 10-5.6 2.4-7.6 5.4-8 10-.4-4.6-2.4-7.6-8-10 5.6-2.4 7.6-5.4 8-10Z" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[1.7rem] leading-none tracking-tight", className)}>
      ours<span className="text-primary">.</span>
    </span>
  );
}
