/* ours. service worker: push notifications only (no offline caching of private data). */
const IS_IOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent) || (/Macintosh/.test(self.navigator.userAgent) && self.navigator.maxTouchPoints > 1);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ours. ♡", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = windows.find((c) => c.visibilityState === "visible" && c.focused);
      // The open app shows chats in-app; no double notification. Calls always ring.
      // iOS revokes push permission when a push shows nothing, so it always shows.
      if (visible && data.kind !== "call" && !IS_IOS) {
        // An older notification with the same tag (e.g. "ringing") is now outdated.
        if (data.tag) (await self.registration.getNotifications({ tag: data.tag })).forEach((n) => n.close());
        visible.postMessage({ type: "push", data });
        return;
      }
      await self.registration.showNotification(data.title || "ours. ♡", {
        body: data.body || "",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        requireInteraction: !!data.requireInteraction,
        icon: "/icon",
        badge: "/icon",
        data: { url: data.url || "/" },
        vibrate: data.kind === "call" ? [300, 150, 300, 150, 300] : [80],
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of windows) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          if (c.url !== url && "navigate" in c) await c.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
