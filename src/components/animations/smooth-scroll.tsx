"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Lenis smooth scrolling — desktop with a fine pointer only, never with
 * prefers-reduced-motion, never on touch devices. Synced with GSAP ScrollTrigger.
 */
export function SmoothScroll({ disabled }: { disabled?: boolean }) {
  const pathname = usePathname();
  const lenisRef = React.useRef<import("lenis").default | null>(null);

  React.useEffect(() => {
    if (disabled) return;
    const ok =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      window.innerWidth >= 1024;
    if (!ok) return;

    let destroyed = false;
    let cleanup = () => {};
    (async () => {
      const [{ default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([
        import("lenis"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (destroyed) return;
      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95, smoothWheel: true });
      lenisRef.current = lenis;
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      cleanup = () => {
        gsap.ticker.remove(tick);
        lenis.destroy();
        lenisRef.current = null;
      };
    })();
    return () => {
      destroyed = true;
      cleanup();
    };
  }, [disabled]);

  React.useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}
