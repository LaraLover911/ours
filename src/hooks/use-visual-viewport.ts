"use client";

import * as React from "react";

/**
 * Keeps a fixed full-screen element exactly inside the visual viewport, so the
 * on-screen keyboard never covers the chat input (iOS Safari doesn't resize
 * the layout viewport when the keyboard opens).
 */
export function useVisualViewport(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  React.useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!el || !vv || !enabled) return;
    const update = () => {
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      el.style.height = "";
      el.style.transform = "";
    };
  }, [ref, enabled]);
}
