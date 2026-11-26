import "server-only";
import { getJson } from "./integrations";

/** One shape for every media search, so the UI never needs provider details. */
export type MediaItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  thumb: string;
  full?: string | null;
  width?: number | null;
  height?: number | null;
  link?: string | null;
  credit?: { text: string; url?: string | null } | null;
  meta?: Record<string, string | number | null>;
};

export const MEDIA_PROVIDERS = ["giphy", "tenor", "unsplash", "tmdb"] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

/** Attribution the providers require next to their results. */
export const MEDIA_NOTICE: Record<MediaProvider, string> = {
  giphy: "Powered by GIPHY",
  tenor: "Via Tenor",
  unsplash: "Fotos von Unsplash",
  tmdb: "Daten von TMDB. Dieses Produkt nutzt die TMDB-API, ist aber nicht von TMDB unterstützt oder zertifiziert.",
};

const UTM = "utm_source=ours&utm_medium=referral";
const https = (u: string | null | undefined) => (u && u.startsWith("https://") ? u : null);

export async function searchMedia(provider: MediaProvider, q: string): Promise<MediaItem[]> {
  const enc = encodeURIComponent(q);
  switch (provider) {
    case "giphy": {
      type G = { id: string; title: string; url: string; images: { fixed_width: { url: string; width: string; height: string }; original: { url: string } } };
      const r = await getJson<{ data: G[] }>(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${enc}&limit=24&rating=pg-13&lang=de`, undefined, "GIPHY");
      return r.data.flatMap((g) => {
        const thumb = https(g.images.fixed_width.url);
        return thumb ? [{ id: g.id, title: g.title || "GIF", thumb, full: https(g.images.original.url), width: Number(g.images.fixed_width.width), height: Number(g.images.fixed_width.height), link: https(g.url) }] : [];
      });
    }
    case "tenor": {
      type T = { id: string; content_description: string; itemurl: string; media_formats: Record<string, { url: string; dims: number[] }> };
      const r = await getJson<{ results: T[] }>(
        `https://tenor.googleapis.com/v2/search?q=${enc}&key=${process.env.TENOR_API_KEY}&client_key=ours&limit=24&media_filter=tinygif,gif&contentfilter=medium&locale=de_DE`,
        undefined,
        "Tenor",
      );
      return r.results.flatMap((t) => {
        const tiny = t.media_formats.tinygif;
        const thumb = https(tiny?.url);
        return thumb ? [{ id: t.id, title: t.content_description || "GIF", thumb, full: https(t.media_formats.gif?.url), width: tiny.dims?.[0] ?? null, height: tiny.dims?.[1] ?? null, link: https(t.itemurl) }] : [];
      });
    }
    case "unsplash": {
      type U = {
        id: string;
        alt_description: string | null;
        width: number;
        height: number;
        urls: { small: string; regular: string };
        links: { html: string; download_location: string };
        user: { name: string; links: { html: string } };
      };
      const r = await getJson<{ results: U[] }>(`https://api.unsplash.com/search/photos?query=${enc}&per_page=24&content_filter=high`, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" } }, "Unsplash");
      return r.results.map((u) => ({
        id: u.id,
        title: u.alt_description ?? "Foto",
        thumb: u.urls.small,
        full: u.urls.regular,
        width: u.width,
        height: u.height,
        link: `${u.links.html}?${UTM}`,
        credit: { text: `Foto von ${u.user.name} auf Unsplash`, url: `${u.user.links.html}?${UTM}` },
        meta: { download_location: u.links.download_location },
      }));
    }
    case "tmdb": {
      type M = { id: number; media_type: string; title?: string; name?: string; poster_path: string | null; release_date?: string; first_air_date?: string; overview?: string; vote_average?: number };
      const r = await getJson<{ results: M[] }>(`https://api.themoviedb.org/3/search/multi?query=${enc}&language=de-DE&include_adult=false&page=1`, { headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` } }, "TMDB");
      return r.results
        .filter((m) => (m.media_type === "movie" || m.media_type === "tv") && m.poster_path)
        .slice(0, 20)
        .map((m) => ({
          id: `${m.media_type}:${m.id}`,
          title: m.title ?? m.name ?? "Unbekannt",
          subtitle: [(m.release_date ?? m.first_air_date ?? "").slice(0, 4), m.media_type === "tv" ? "Serie" : "Film"].filter(Boolean).join(" · "),
          thumb: `https://image.tmdb.org/t/p/w342${m.poster_path}`,
          link: `https://www.themoviedb.org/${m.media_type}/${m.id}`,
          meta: { kind: m.media_type, year: (m.release_date ?? m.first_air_date ?? "").slice(0, 4) || null, overview: (m.overview ?? "").slice(0, 400) },
        }));
    }
  }
}
