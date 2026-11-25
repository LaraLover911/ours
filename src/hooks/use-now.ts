"use client";

import { useSyncExternalStore } from "react";

type Clock = { now: number; listeners: Set<() => void>; id?: number; subscribe: (cb: () => void) => () => void; get: () => number };

/** Shared clocks: one interval per tick size, read via useSyncExternalStore. */
const clocks = new Map<number, Clock>();

function clock(interval: number): Clock {
  const existing = clocks.get(interval);
  if (existing) return existing;
  const c: Clock = {
    now: Date.now(),
    listeners: new Set(),
    get: () => c.now,
    subscribe: (cb) => {
      c.listeners.add(cb);
      if (c.id === undefined) {
        c.id = window.setInterval(() => {
          c.now = Date.now();
          c.listeners.forEach((l) => l());
        }, interval);
      }
      return () => {
        c.listeners.delete(cb);
        if (!c.listeners.size && c.id !== undefined) {
          window.clearInterval(c.id);
          c.id = undefined;
        }
      };
    },
  };
  clocks.set(interval, c);
  return c;
}

const serverSnapshot = () => null;

/** Current time (ms), re-rendering every `interval` ms. `null` during SSR. */
export function useNow(interval = 1000): number | null {
  const c = clock(interval);
  return useSyncExternalStore(c.subscribe, c.get, serverSnapshot);
}
