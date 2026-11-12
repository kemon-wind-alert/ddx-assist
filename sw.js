// オフライン対応：一度開いたらファイルをスマホ内に保存し、電波が無くても動く。
// 表示は保存済みのものを即座に使い（速さ優先）、裏で最新版を取りに行って次回から反映する。
const CACHE = "ddx-v2";
const SHELL = [
  "./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "data/regions.json", "data/my_stars.json",
  "data/neck.json", "data/shoulder.json", "data/elbow.json", "data/hand.json", "data/back.json", "data/hip.json", "data/foot.json", "data/knee.json",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then((r) => {
        if (r.ok) c.put(e.request, r.clone());
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
