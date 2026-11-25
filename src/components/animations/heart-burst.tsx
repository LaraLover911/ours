"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { HeartGlyph } from "@/components/shared/heart";

/** Little hearts that float up from a point — used when sending a message or liking. */
export function useHeartBurst() {
  const [bursts, setBursts] = React.useState<{ id: number; x: number; y: number }[]>([]);
  const fire = React.useCallback((x: number, y: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, { id, x, y }]);
    window.setTimeout(() => setBursts((b) => b.filter((p) => p.id !== id)), 1100);
  }, []);

  const node = (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
      <AnimatePresence>
        {bursts.map((b) =>
          [0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={`${b.id}-${i}`}
              className="absolute text-primary"
              style={{ left: b.x, top: b.y }}
              initial={{ opacity: 0, scale: 0.4, x: -8, y: -8 }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0.4, 1 - i * 0.08, 0.8],
                x: -8 + (i - 2) * 14 + Math.sin(i) * 6,
                y: -8 - 50 - i * 12,
                rotate: (i - 2) * 12,
              }}
              transition={{ duration: 0.9 + i * 0.05, ease: "easeOut" }}
            >
              <HeartGlyph className={i % 2 ? "size-3" : "size-4"} />
            </motion.span>
          )),
        )}
      </AnimatePresence>
    </div>
  );

  return { fire, node };
}
