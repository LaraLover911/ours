/**
 * Reads where and when a video was filmed from the file's own metadata, on the
 * device, without uploading anything. Works for iPhone .mov/.mp4
 * (com.apple.quicktime.location.ISO6709 / creationdate) and Android .mp4
 * (©xyz / mvhd). WebM and screen recordings usually have neither.
 */
export type VideoMeta = { lat?: number; lon?: number; recordedAt?: Date };

const CHUNK = 8 * 1024 * 1024;
const MAC_EPOCH = 2082844800; // seconds between 1904-01-01 and 1970-01-01

async function chunks(file: Blob): Promise<Uint8Array[]> {
  if (file.size <= CHUNK * 2) return [new Uint8Array(await file.arrayBuffer())];
  return [new Uint8Array(await file.slice(0, CHUNK).arrayBuffer()), new Uint8Array(await file.slice(file.size - CHUNK).arrayBuffer())];
}

/** "+52.5200+013.4050+034.000/" → { lat, lon } */
export function parseIso6709(text: string): { lat: number; lon: number } | null {
  const re = /([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?(?:CRS[^/]*)?\//g;
  for (const m of text.matchAll(re)) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    // Needs real precision, so random digits in binary data do not count.
    if (!m[1].includes(".") || !m[2].includes(".")) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;
    return { lat, lon };
  }
  return null;
}

function plausible(d: Date) {
  return Number.isFinite(d.getTime()) && d.getFullYear() >= 2000 && d.getTime() <= Date.now() + 24 * 3600 * 1000;
}

/** Apple's creationdate key: "2026-11-20T18:03:12+0100" */
function parseAppleDate(text: string): Date | null {
  if (!text.includes("com.apple.quicktime.creationdate")) return null;
  for (const m of text.matchAll(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}):?(\d{2})/g)) {
    const d = new Date(`${m[1]}${m[2]}:${m[3]}`);
    if (plausible(d)) return d;
  }
  return null;
}

/** The movie header box: creation time in seconds since 1904 (UTC). */
function parseMvhd(bytes: Uint8Array): Date | null {
  for (let i = 4; i < bytes.length - 20; i++) {
    if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue; // "mvhd"
    const view = new DataView(bytes.buffer, bytes.byteOffset + i + 4);
    const version = view.getUint8(0);
    const secs = version === 1 ? Number(view.getBigUint64(4)) : view.getUint32(4);
    if (!secs) return null;
    const d = new Date((secs - MAC_EPOCH) * 1000);
    return plausible(d) ? d : null;
  }
  return null;
}

export async function readVideoMeta(file: Blob): Promise<VideoMeta> {
  const out: VideoMeta = {};
  try {
    const decoder = new TextDecoder("latin1");
    for (const bytes of await chunks(file)) {
      const text = decoder.decode(bytes);
      if (out.lat == null) {
        const at = parseIso6709(text);
        if (at) Object.assign(out, at);
      }
      out.recordedAt ??= parseAppleDate(text) ?? parseMvhd(bytes) ?? undefined;
      if (out.lat != null && out.recordedAt) break;
    }
  } catch {
    /* unreadable file: no metadata */
  }
  return out;
}
