"use client";

import * as React from "react";
import { animate, useInView, useMotionValue, useReducedMotion } from "motion/react";

/** Counts up to `value` once in view (inspired by Magic UI's NumberTicker). */
export function NumberTicker({ value, className, pad = 0 }: { value: number; className?: string; pad?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const done = React.useRef(false);
  const format = React.useCallback((n: number) => String(Math.round(n)).padStart(pad, "0"), [pad]);

  React.useEffect(() => {
    if (!inView) return;
    if (done.current || reduced) {
      if (ref.current) ref.current.textContent = new Intl.NumberFormat("de-DE").format(value).padStart(pad, "0");
      done.current = true;
      return;
    }
    const controls = animate(mv, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onComplete: () => (done.current = true) });
    const unsub = mv.on("change", (v) => {
      if (ref.current) ref.current.textContent = pad ? format(v) : new Intl.NumberFormat("de-DE").format(Math.round(v));
    });
    return () => {
      controls.stop();
      unsub();
    };
  }, [inView, value, mv, reduced, pad, format]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {pad ? format(0) : "0"}
    </span>
  );
}
