// Scans public/images/* for your real photos and builds responsive WebP versions
// into public/photos/ plus a manifest the app reads. Runs automatically before
// `dev` and `build`. Never invents photos: if a folder is empty, the app shows
// a fallback instead.
import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "public", "images");
const outDir = path.join(root, "public", "photos");
const manifestPath = path.join(root, "src", "generated", "photos.json");
const FOLDERS = ["abdullah", "lara", "together", "memories", "backgrounds"];
const WIDTHS = [480, 960, 1600];
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"]);

let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("[photos] sharp not available, using original files only");
}

const slug = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo";

const manifest = Object.fromEntries(FOLDERS.map((f) => [f, []]));
await rm(outDir, { recursive: true, force: true });

for (const folder of FOLDERS) {
  const dir = path.join(srcDir, folder);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => EXT.has(path.extname(f).toLowerCase())).sort();
  } catch {
    continue;
  }
  for (const file of files) {
    const abs = path.join(dir, file);
    const base = slug(path.parse(file).name);
    const original = `/images/${folder}/${encodeURIComponent(file)}`;
    const entry = { id: `${folder}/${base}`, folder, name: path.parse(file).name, original, width: 0, height: 0, color: "#f3dde5", srcset: [] };
    if (sharp) {
      try {
        const img = sharp(abs, { failOn: "none" }).rotate();
        const meta = await img.metadata();
        const oriented = (meta.orientation ?? 1) >= 5;
        entry.width = (oriented ? meta.height : meta.width) ?? 0;
        entry.height = (oriented ? meta.width : meta.height) ?? 0;
        const { dominant } = await sharp(abs).rotate().resize(32).stats();
        entry.color = `rgb(${dominant.r} ${dominant.g} ${dominant.b})`;
        await mkdir(path.join(outDir, folder), { recursive: true });
        const widths = WIDTHS.filter((w) => w < entry.width);
        if (!widths.length || widths[widths.length - 1] < entry.width) widths.push(Math.min(entry.width, 2000));
        for (const w of [...new Set(widths)]) {
          const name = `${base}-${w}.webp`;
          await sharp(abs).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(outDir, folder, name));
          entry.srcset.push({ src: `/photos/${folder}/${name}`, width: w });
        }
      } catch (err) {
        console.warn(`[photos] could not process ${folder}/${file}: ${err.message}`);
      }
    }
    if (!entry.srcset.length) entry.srcset.push({ src: original, width: entry.width || 1200 });
    manifest[folder].push(entry);
  }
}

await mkdir(path.dirname(manifestPath), { recursive: true });
const json = JSON.stringify({ generatedAt: new Date().toISOString(), photos: manifest }, null, 2);
await writeFile(manifestPath, json + "\n");
const total = Object.values(manifest).reduce((n, l) => n + l.length, 0);
console.log(`[photos] ${total} photo(s) prepared${total ? "" : " — add your pictures to public/images/*"}`);

