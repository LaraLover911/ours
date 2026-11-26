export type Provider = "youtube" | "spotify";
export type SourceRef = { provider: Provider; ref: string };

/** YouTube or Spotify links (and spotify: URIs) to a playable reference, or null. */
export function parseLink(input: string): SourceRef | null {
  const s = input.trim();
  const uri = s.match(/^spotify:(track|episode):([A-Za-z0-9]{22})$/);
  if (uri) return { provider: "spotify", ref: `spotify:${uri[1]}:${uri[2]}` };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  if (host === "open.spotify.com") {
    const m = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|episode)\/([A-Za-z0-9]{22})/);
    return m ? { provider: "spotify", ref: `spotify:${m[1]}:${m[2]}` } : null;
  }
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1, 12);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", ref: id } : null;
}

export const linkFor = (s: SourceRef) =>
  s.provider === "youtube" ? `https://www.youtube.com/watch?v=${s.ref}` : `https://open.spotify.com/${s.ref.split(":")[1]}/${s.ref.split(":")[2]}`;
