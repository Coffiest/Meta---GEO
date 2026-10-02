/**
 * Poker ART の Service Worker。
 *
 * 目的はプッシュ通知の受信だけに絞っている。fetch を横取りしてキャッシュを返すことは
 * 一切しない —— 対戦はリアルタイム性が命で、古いキャッシュを返すと状態のズレという
 * 最悪の不具合につながるため、意図的にオフラインキャッシュは持たない。
 */

// 新しいSWを即座に有効化する(古いSWが通知を持ったまま残らないように)。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "Poker ART";
  const options = {
    body: payload.body || "",
    icon: "/logos/Logo_app_icon.png",
    badge: "/logos/Logo_app_icon.png",
    tag: payload.tag || "poker-art",
    data: { path: payload.path || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // 既に開いているウィンドウがあればそれを前面に出す(新しいタブを増やさない)。
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client && client.url && !client.url.endsWith(path)) {
            return client.navigate(path).then((c) => (c ? c.focus() : undefined));
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(path);
    }),
  );
});
