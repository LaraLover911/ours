"use client";

import { useEffect, useState } from "react";
import { getCachedSignedUrl, getSignedUrl } from "@/lib/supabase/media";

export function useSignedUrl(path: string | null | undefined) {
  const [state, setState] = useState<{ path: string | null | undefined; url: string | null }>(() => ({
    path,
    url: path ? getCachedSignedUrl(path) : null,
  }));

  if (state.path !== path) {
    setState({ path, url: path ? getCachedSignedUrl(path) : null });
  }

  useEffect(() => {
    if (!path || state.url) return;
    let alive = true;
    getSignedUrl(path).then((url) => {
      if (alive) setState((s) => (s.path === path ? { path, url } : s));
    });
    return () => {
      alive = false;
    };
  }, [path, state.url]);

  return state.path === path ? state.url : null;
}
