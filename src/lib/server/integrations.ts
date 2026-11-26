import "server-only";

/**
 * Which external services the server is set up for. Only names of missing
 * environment variables ever leave this file, never their values.
 */
type Check = { configured: boolean; missing: string[] };

const need = (...vars: string[]): Check => {
  const missing = vars.filter((v) => !process.env[v]);
  return { configured: missing.length === 0, missing };
};

export function integrationStatus() {
  return {
    giphy: need("GIPHY_API_KEY"),
    tenor: need("TENOR_API_KEY"),
    unsplash: need("UNSPLASH_ACCESS_KEY"),
    tmdb: need("TMDB_API_TOKEN"),
  } satisfies Record<string, Check>;
}

export type IntegrationStatus = ReturnType<typeof integrationStatus>;

/** Best-effort limit per person and route (per server instance) against runaway loops. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max = 30, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return list.length > max;
}

/** fetch with a timeout and a JSON body or a clear error. */
export async function getJson<T>(url: string, init?: RequestInit, label = "Der Dienst"): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } | string; status_message?: string; message?: string } | null) ?? null;
    const detail = typeof msg?.error === "string" ? msg.error : (msg?.error?.message ?? msg?.status_message ?? msg?.message);
    throw new Error(`${label} antwortet mit ${res.status}${detail ? `: ${String(detail).slice(0, 160)}` : ""}`);
  }
  return body as T;
}
