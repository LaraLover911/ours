// Unit tests for the media search and clip metadata code, without network: fetch is stubbed
// with response shapes from the providers' official API docs. This proves our
// parsing, validation and error handling; it does NOT prove the live services work
// (that needs real keys, see docs/INTEGRATIONS.md).
// Run: node scripts/test-integrations.mjs
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "node_modules/server-only/empty.js") } });

for (const k of ["GIPHY_API_KEY", "TENOR_API_KEY", "UNSPLASH_ACCESS_KEY"]) process.env[k] = "test-key";
delete process.env.TMDB_API_TOKEN;

const { integrationStatus, rateLimited } = await jiti.import(path.join(root, "src/lib/server/integrations.ts"));
const { searchMedia } = await jiti.import(path.join(root, "src/lib/server/media.ts"));
const { parseIso6709, readVideoMeta } = await jiti.import(path.join(root, "src/lib/media/video-meta.ts"));

let n = 0;
const ok = (c, m) => (assert.ok(c, m), n++);

// Status: names of missing variables only
const st = integrationStatus();
ok(st.tmdb.configured === false && st.tmdb.missing.includes("TMDB_API_TOKEN"), "missing key listed by name");
ok(st.giphy.configured === true, "giphy configured with key");
ok(!JSON.stringify(st).includes("test-key"), "status never contains values");

// Rate limit
for (let i = 0; i < 3; i++) rateLimited("t", 3);
ok(rateLimited("t", 3) === true, "4th call in the window is limited");

// Clip metadata: location and recording time from the file itself
ok(JSON.stringify(parseIso6709("xx+52.5200+013.4050+034.000/yy")) === JSON.stringify({ lat: 52.52, lon: 13.405 }), "ISO 6709 with altitude");
ok(JSON.stringify(parseIso6709("\u00a9xyz\u0000\u0012+37.7858-122.4064/")) === JSON.stringify({ lat: 37.7858, lon: -122.4064 }), "Android ©xyz");
ok(parseIso6709("+12+345/") === null, "no decimals: not a location");
ok(parseIso6709("+95.0000+013.0000/") === null, "out of range rejected");
{
  // A fake QuickTime file: Apple keys + values somewhere in the middle of binary data.
  const enc = new TextEncoder();
  const apple = new Blob([new Uint8Array(4096), enc.encode("mdta com.apple.quicktime.location.ISO6709 mdta com.apple.quicktime.creationdate"), new Uint8Array(64), enc.encode("+48.1371+011.5754+519.000/"), new Uint8Array(8), enc.encode("2026-11-20T18:03:12+0100"), new Uint8Array(4096)]);
  const am = await readVideoMeta(apple);
  ok(am.lat === 48.1371 && am.lon === 11.5754, "apple location");
  ok(am.recordedAt?.toISOString() === "2026-11-20T17:03:12.000Z", "apple creation date with offset");
  // mvhd box: version 0, creation time in seconds since 1904.
  const mvhd = new Uint8Array(32);
  mvhd.set(enc.encode("mvhd"), 0);
  new DataView(mvhd.buffer).setUint32(8, Math.floor(Date.UTC(2025, 5, 1, 12) / 1000) + 2082844800);
  const mm = await readVideoMeta(new Blob([new Uint8Array(100), mvhd, new Uint8Array(100)]));
  ok(mm.lat === undefined && mm.recordedAt?.toISOString() === "2025-06-01T12:00:00.000Z", "mvhd creation time, no location");
  const none = await readVideoMeta(new Blob([new Uint8Array(2048)]));
  ok(none.lat === undefined && none.recordedAt === undefined, "no metadata, nothing invented");
}

// Media parsing with stubbed provider responses
const fixtures = {
  "api.giphy.com": { data: [{ id: "g1", title: "Love", url: "https://giphy.com/gifs/g1", images: { fixed_width: { url: "https://media.giphy.com/g1.gif", width: "200", height: "150" }, original: { url: "https://media.giphy.com/g1o.gif" } } }] },
  "tenor.googleapis.com": { results: [{ id: "t1", content_description: "hug", itemurl: "https://tenor.com/t1", media_formats: { tinygif: { url: "https://media.tenor.com/t1.gif", dims: [220, 180] }, gif: { url: "https://media.tenor.com/t1o.gif", dims: [498, 400] } } }] },
  "api.unsplash.com": { results: [{ id: "u1", alt_description: "beach", width: 4000, height: 3000, urls: { small: "https://images.unsplash.com/u1s", regular: "https://images.unsplash.com/u1r" }, links: { html: "https://unsplash.com/photos/u1", download_location: "https://api.unsplash.com/photos/u1/download?ixid=x" }, user: { name: "Ana", links: { html: "https://unsplash.com/@ana" } } }] },
  "api.themoviedb.org": { results: [{ id: 1, media_type: "movie", title: "Amélie", poster_path: "/a.jpg", release_date: "2001-04-25", overview: "…" }, { id: 2, media_type: "person", name: "X" }, { id: 3, media_type: "tv", name: "Dark", poster_path: null }] },
};
const seen = [];
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  seen.push({ host: u.hostname, auth: init?.headers?.Authorization ?? null, url: String(url) });
  if (u.searchParams.get("q") === "boom" || u.searchParams.get("query") === "boom") return new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 });
  return new Response(JSON.stringify(fixtures[u.hostname]), { status: 200, headers: { "Content-Type": "application/json" } });
};
const g = await searchMedia("giphy", "love");
ok(g.length === 1 && g[0].thumb.startsWith("https://") && g[0].width === 200, "giphy normalised");
const t = await searchMedia("tenor", "hug");
ok(t[0].thumb === "https://media.tenor.com/t1.gif" && t[0].full?.endsWith("t1o.gif"), "tenor normalised");
const u = await searchMedia("unsplash", "beach");
ok(u[0].credit?.text === "Foto von Ana auf Unsplash" && u[0].link.includes("utm_source=ours"), "unsplash credit + utm");
ok(seen.at(-1).auth === "Client-ID test-key", "unsplash key only in server header");
process.env.TMDB_API_TOKEN = "test-key";
const m = await searchMedia("tmdb", "amelie");
ok(m.length === 1 && m[0].id === "movie:1" && m[0].subtitle === "2001 · Film", "tmdb: only titles with posters, people dropped");
await assert.rejects(searchMedia("giphy", "boom"), /GIPHY antwortet mit 401: Invalid API key/);
n++;

console.log(`✓ media + clip metadata: ${n} checks passed (stubbed network)`);
