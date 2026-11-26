import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for OAuth tokens before they are stored. The key lives only in the
 * server env (INTEGRATIONS_ENCRYPTION_KEY, 32 bytes as base64 or 64 hex chars);
 * the database only ever sees ciphertext.
 */
function key(): Buffer | null {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

export const canEncrypt = () => key() !== null;

export function seal(value: unknown): string {
  const k = key();
  if (!k) throw new Error("INTEGRATIONS_ENCRYPTION_KEY fehlt oder ist ungültig");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function open<T>(sealed: string): T {
  const k = key();
  if (!k) throw new Error("INTEGRATIONS_ENCRYPTION_KEY fehlt oder ist ungültig");
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Unbekanntes Token-Format");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8")) as T;
}
