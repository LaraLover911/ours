"use client";

import type { TypedClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/device";
import { isStandalone } from "@/lib/presence/device-info";

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: "no-sw" | "no-push" | "ios-not-installed" | "insecure"; message: string };

export function isIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return { ok: false, reason: "insecure", message: "Benachrichtigungen brauchen eine sichere Verbindung (https)." };
  if (isIOS() && !isStandalone())
    return {
      ok: false,
      reason: "ios-not-installed",
      message: "Auf iPhone und iPad gehen Benachrichtigungen nur, wenn ours. auf dem Home-Bildschirm ist: Teilen-Symbol → „Zum Home-Bildschirm“, dann von dort öffnen.",
    };
  if (!("serviceWorker" in navigator)) return { ok: false, reason: "no-sw", message: "Dieser Browser unterstützt keine Service Worker." };
  if (!("PushManager" in window) || !("Notification" in window)) return { ok: false, reason: "no-push", message: "Dieser Browser unterstützt keine Push-Benachrichtigungen." };
  return { ok: true };
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function serverKey(supabase: TypedClient): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ publicKey?: string; error?: string }>("push", { body: { action: "key" } });
  if (error || !data?.publicKey) throw new Error("Der Push-Server ist noch nicht eingerichtet (Edge Function „push“).");
  return data.publicKey;
}

const FLAG = "ours-push";
export function markPushActive(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
}
export function pushActiveHere() {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

async function save(supabase: TypedClient, sub: PushSubscription, label: string) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc("push_register", {
    sub_endpoint: sub.endpoint,
    sub_p256dh: json.keys?.p256dh ?? "",
    sub_auth: json.keys?.auth ?? "",
    sub_device: getDeviceId(),
    sub_label: label,
  });
  if (error) throw new Error(error.message);
}

/** Must be called from a click (iOS requires a user gesture for the permission prompt). */
export async function enablePush(supabase: TypedClient, label: string) {
  const support = pushSupport();
  if (!support.ok) throw new Error(support.message);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Benachrichtigungen sind für diese Seite blockiert. Du kannst sie in den Browser-Einstellungen wieder erlauben." : "Benachrichtigungen wurden nicht erlaubt.");
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  const key = await serverKey(supabase);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server key cannot receive our pushes.
  const existingKey = sub?.options.applicationServerKey;
  if (sub && existingKey && btoa(String.fromCharCode(...new Uint8Array(existingKey))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== key) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await save(supabase, sub, label);
  markPushActive(true);
  return sub;
}

export async function disablePush(supabase: TypedClient) {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
  markPushActive(false);
}

export async function currentSubscription() {
  const reg = await navigator.serviceWorker?.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** On every app start: keep this device's registration fresh (keys can rotate). */
export async function syncPush(supabase: TypedClient, label: string) {
  if (!pushSupport().ok || Notification.permission !== "granted") {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") markPushActive(false);
    return;
  }
  const sub = await currentSubscription();
  if (!sub) return markPushActive(false);
  try {
    await save(supabase, sub, label);
    markPushActive(true);
  } catch {
    /* offline: try next time */
  }
}
