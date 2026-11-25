"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type GsapModules = {
  gsap: typeof import("gsap").gsap;
  ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
};

let gsapPromise: Promise<GsapModules> | null = null;
/** Loads GSAP + ScrollTrigger once, on demand (keeps it out of the initial bundle). */
export function loadGsap(): Promise<GsapModules> {
  if (!gsapPromise) {
    gsapPromise = Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      gsap.registerPlugin(ScrollTrigger);
      return { gsap, ScrollTrigger };
    });
  }
  return gsapPromise;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Runs a GSAP setup inside gsap.context() scoped to `ref`, with full cleanup
 * (kills tweens and ScrollTriggers on unmount — no duplicates, no leaks).
 */
export function useGsapEffect(
  ref: React.RefObject<HTMLElement | null>,
  setup: (m: GsapModules, el: HTMLElement) => void | (() => void),
  deps: React.DependencyList = [],
) {
  const setupRef = React.useRef(setup);
  React.useEffect(() => {
    setupRef.current = setup;
  });
  React.useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let ctx: { revert: () => void } | null = null;
    let alive = true;
    loadGsap().then((m) => {
      if (!alive || !ref.current) return;
      ctx = m.gsap.context(() => setupRef.current(m, el), el);
    });
    return () => {
      alive = false;
      ctx?.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Scroll reveal: children with [data-reveal] fade/slide in, staggered. */
export function Reveal({
  children,
  className,
  as: Tag = "div",
  stagger = 0.08,
  y = 24,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "ul" | "header";
  stagger?: number;
  y?: number;
}) {
  const ref = React.useRef<HTMLElement>(null);
  useGsapEffect(ref, ({ gsap }, el) => {
    const items = el.querySelectorAll<HTMLElement>("[data-reveal]");
    const targets = items.length ? items : [el];
    const small = window.innerWidth < 768;
    gsap.from(targets, {
      autoAlpha: 0,
      y: small ? y * 0.5 : y,
      duration: small ? 0.5 : 0.8,
      ease: "power3.out",
      stagger: small ? stagger * 0.6 : stagger,
      clearProps: "transform,opacity,visibility",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });
  return React.createElement(Tag, { ref, className: cn(className) }, children);
}
