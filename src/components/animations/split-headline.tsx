import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Staggered word reveal for large headlines (each line is its own row).
 * Pure CSS, so it starts with the first paint (no JS needed) and respects reduced motion.
 */
export function SplitHeadline({ lines, className, delay = 0.1 }: { lines: React.ReactNode[]; className?: string; delay?: number }) {
  let n = 0;
  const word = (content: React.ReactNode, key: React.Key) => (
    <span key={key} className="animate-word-rise inline-block" style={{ animationDelay: `${delay + n++ * 0.07}s` }}>
      {content}
    </span>
  );
  return (
    <h1 className={cn("font-display", className)}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          {typeof line === "string"
            ? line.split(" ").map((w, j, all) => word(`${w}${j < all.length - 1 ? " " : ""}`, j))
            : word(line, 0)}
        </span>
      ))}
    </h1>
  );
}
