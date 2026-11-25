"use client";

import * as React from "react";
import { errorMessage } from "@/lib/utils/errors";

type State<T> = { data: T | undefined; error: string | null; loading: boolean };

/**
 * Tiny data hook for Supabase reads: loading / error / refetch / optimistic setData.
 * `fn` must throw (or return { error }) on failure.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = React.useState<State<T>>({ data: undefined, error: null, loading: true });
  const fnRef = React.useRef(fn);
  React.useEffect(() => {
    fnRef.current = fn;
  });
  const seq = React.useRef(0);

  const run = React.useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: s.data === undefined, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (id === seq.current) setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
    }
  }, []);

  React.useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = React.useCallback((updater: (prev: T | undefined) => T | undefined) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return { ...state, refetch: () => run(true), setData };
}

/** Unwraps a Supabase response, throwing on error. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw res.error;
  return res.data as T;
}
