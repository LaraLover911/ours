// Unit tests for the integrations server code, without network: fetch is stubbed
// with response shapes from the providers' official API docs. This proves our
// parsing, validation and error handling; it does NOT prove the live services work
// (that needs real keys, see docs/INTEGRATIONS.md).
// Run: node scripts/test-integrations.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createJiti } from "jiti";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src"), "server-only": path.join(root, "node_modules/server-only/empty.js") } });

process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
for (const k of ["GIPHY_API_KEY", "TENOR_API_KEY", "UNSPLASH_ACCESS_KEY", "TMDB_API_TOKEN", "YOUTUBE_API_KEY"]) process.env[k] = "test-key";
delete process.env.SPOTIFY_CLIENT_ID;

const { seal, open } = await jiti.import(path.join(root, "src/lib/server/crypto.ts"));
const { integrationStatus, rateLimited } = await jiti.import(path.join(root, "src/lib/server/integrations.ts"));
const { searchMedia } = await jiti.import(path.join(root, "src/lib/server/media.ts"));
const { DISCORD_WEBHOOK } = await jiti.import(path.join(root, "src/lib/server/discord.ts"));
const { weatherLabel } = await jiti.import(path.join(root, "src/lib/weather.ts"));

let n = 0;
const ok = (c, m) => (assert.ok(c, m), n++);

// Crypto: round trip, tamper detection, no plaintext in the sealed string
const s = seal({ access_token: "secret-token-123" });
ok(!s.includes("secret-token-123"), "sealed text hides the token");
ok(open(s).access_token === "secret-token-123", "round trip");
const parts = s.split(".");
parts[3] = Buffer.from("x" + Buffer.from(parts[3], "base64url").toString("latin1")).toString("base64url");
assert.throws(() => open(parts.join(".")), "tampered ciphertext is rejected");
n++;

// Status: names of missing variables only
const st = integrationStatus();
ok(st.spotify.configured === false && st.spotify.missing.includes("SPOTIFY_CLIENT_ID"), "spotify missing listed");
ok(st.giphy.configured === true, "giphy configured with key");
ok(!JSON.stringify(st).includes("test-key"), "status never contains values");

// Rate limit
for (let i = 0; i < 3; i++) rateLimited("t", 3);
ok(rateLimited("t", 3) === true, "4th call in the window is limited");

// Discord webhook URL validation
ok(DISCORD_WEBHOOK.test("https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-0123"), "valid webhook");
ok(!DISCORD_WEBHOOK.test("https://discord.com.evil.io/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz"), "lookalike host rejected");
ok(!DISCORD_WEBHOOK.test("http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz"), "http rejected");

// Weather codes
ok(weatherLabel(0).text === "klar" && weatherLabel(63).text === "Regen" && weatherLabel(95).emoji === "⛈️", "WMO codes");

// Media parsing with stubbed provider responses
const fixtures = {
  "api.giphy.com": { data: [{ id: "g1", title: "Love", url: "https://giphy.com/gifs/g1", images: { fixed_width: { url: "https://media.giphy.com/g1.gif", width: "200", height: "150" }, original: { url: "https://media.giphy.com/g1o.gif" } } }] },
  "tenor.googleapis.com": { results: [{ id: "t1", content_description: "hug", itemurl: "https://tenor.com/t1", media_formats: { tinygif: { url: "https://media.tenor.com/t1.gif", dims: [220, 180] }, gif: { url: "https://media.tenor.com/t1o.gif", dims: [498, 400] } } }] },
  "api.unsplash.com": { results: [{ id: "u1", alt_description: "beach", width: 4000, height: 3000, urls: { small: "https://images.unsplash.com/u1s", regular: "https://images.unsplash.com/u1r" }, links: { html: "https://unsplash.com/photos/u1", download_location: "https://api.unsplash.com/photos/u1/download?ixid=x" }, user: { name: "Ana", links: { html: "https://unsplash.com/@ana" } } }] },
  "api.themoviedb.org": { results: [{ id: 1, media_type: "movie", title: "Amélie", poster_path: "/a.jpg", release_date: "2001-04-25", overview: "…" }, { id: 2, media_type: "person", name: "X" }, { id: 3, media_type: "tv", name: "Dark", poster_path: null }] },
  "www.googleapis.com": { items: [{ id: { videoId: "abcdefghijk" }, snippet: { title: "Our &amp; song", channelTitle: "Band", thumbnails: { medium: { url: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg" } } } }] },
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
const m = await searchMedia("tmdb", "amelie");
ok(m.length === 1 && m[0].id === "movie:1" && m[0].subtitle === "2001 · Film", "tmdb: only titles with posters, people dropped");
const y = await searchMedia("youtube", "song");
ok(y[0].title === "Our & song" && y[0].link === "https://www.youtube.com/watch?v=abcdefghijk", "youtube normalised");
await assert.rejects(searchMedia("giphy", "boom"), /GIPHY antwortet mit 401: Invalid API key/);
n++;

console.log(`✓ integrations: ${n} checks passed (stubbed network)`);
