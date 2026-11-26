"use client";

import { getSupabaseBrowserClient } from "./client";
import { MEDIA_BUCKET } from "./env";

/* ------------------------------------------------------------------ */
/* Signed URLs (bucket is private — no public URLs exist)             */
/* ------------------------------------------------------------------ */
const TTL_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; expires: number }>();
const inflight = new Map<string, Promise<string | null>>();
let queue: { path: string; resolve: (url: string | null) => void }[] = [];
let scheduled = false;

function flush() {
  scheduled = false;
  const batch = queue;
  queue = [];
  const paths = [...new Set(batch.map((b) => b.path))];
  if (!paths.length) return;
  getSupabaseBrowserClient()
    .storage.from(MEDIA_BUCKET)
    .createSignedUrls(paths, TTL_SECONDS)
    .then(({ data }) => {
      const map = new Map<string, string | null>();
      data?.forEach((d) => {
        if (d.path && d.signedUrl) {
          cache.set(d.path, { url: d.signedUrl, expires: Date.now() + (TTL_SECONDS - 120) * 1000 });
          map.set(d.path, d.signedUrl);
        }
      });
      batch.forEach((b) => b.resolve(map.get(b.path) ?? null));
    })
    .catch(() => batch.forEach((b) => b.resolve(null)))
    .finally(() => paths.forEach((p) => inflight.delete(p)));
}

export function getCachedSignedUrl(path: string) {
  const hit = cache.get(path);
  return hit && hit.expires > Date.now() ? hit.url : null;
}

export function getSignedUrl(path: string): Promise<string | null> {
  const hit = getCachedSignedUrl(path);
  if (hit) return Promise.resolve(hit);
  const existing = inflight.get(path);
  if (existing) return existing;
  const p = new Promise<string | null>((resolve) => {
    queue.push({ path, resolve });
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 16);
    }
  });
  inflight.set(path, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Uploads                                                            */
/* ------------------------------------------------------------------ */
export type UploadArea = "chat" | "memories" | "diary" | "letters" | "surprises" | "avatars" | "backgrounds" | "clips" | "studio" | "voice" | "capsule" | "photo" | "moodboard" | "snaps";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/aac", "audio/x-m4a"];

export function mediaKind(mime: string): "image" | "video" | "audio" | null {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (IMAGE_TYPES.includes(base)) return "image";
  if (VIDEO_TYPES.includes(base)) return "video";
  if (AUDIO_TYPES.includes(base)) return "audio";
  return null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif", "image/avif": "avif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/aac": "aac", "audio/x-m4a": "m4a",
};

/** Downscales large photos in the browser before upload (keeps GIFs untouched). */
async function compressImage(file: File): Promise<{ blob: Blob; width?: number; height?: number }> {
  if (file.type === "image/gif" || typeof createImageBitmap === "undefined") return { blob: file };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const max = 2048;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file };
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.86));
    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
    if (!blob || (blob.size > file.size && scale === 1 && IMAGE_TYPES.includes(file.type) && file.type !== "image/heic")) {
      return { blob: file, width, height };
    }
    return { blob, width, height };
  } catch {
    return { blob: file };
  }
}

export type UploadResult = {
  path: string;
  kind: "image" | "video" | "audio";
  mime: string;
  size: number;
  width?: number;
  height?: number;
};

export async function uploadMedia(
  file: File | Blob,
  area: UploadArea,
  opts: { private?: boolean; name?: string } = {},
): Promise<UploadResult> {
  const supabase = getSupabaseBrowserClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) throw new Error("Bitte melde dich erneut an.");

  const originalType = (file.type || "").split(";")[0].toLowerCase();
  const kind = mediaKind(originalType);
  if (!kind) throw new Error("Dieses Dateiformat wird nicht unterstützt.");

  let blob: Blob = file;
  let width: number | undefined;
  let height: number | undefined;
  if (kind === "image" && file instanceof File) {
    ({ blob, width, height } = await compressImage(file));
  }
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("Die Datei ist zu groß (max. 50 MB).");

  const mime = (blob.type || originalType).split(";")[0].toLowerCase();
  const ext = EXT[mime] ?? "bin";
  const folder = opts.private ? `private/${area}` : area;
  const path = `${uid}/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: mime,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  await supabase.from("uploads").insert({
    path,
    area: opts.private ? "private" : area,
    mime_type: mime,
    size_bytes: blob.size,
  });

  return { path, kind, mime, size: blob.size, width, height };
}

export async function removeMedia(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (!list.length) return;
  const supabase = getSupabaseBrowserClient();
  await supabase.storage.from(MEDIA_BUCKET).remove(list);
  await supabase.from("uploads").delete().in("path", list);
  list.forEach((p) => cache.delete(p));
}
