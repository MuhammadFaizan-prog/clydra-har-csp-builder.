// Generates public/sample.har: a SYNTHETIC recording of a fictional shop on
// example.com (a reserved domain). Used for the "Try a sample" button and tests.
// Run: node scripts/make-sample.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const html = `<!doctype html><html><head><title>Example Shop</title>
<style>.hero{background:#111;color:#fff}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Store","name":"Example Shop"}</script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());</script>
<script src="/assets/app.js"></script>
</head><body><div class="hero" style="padding:2rem">Sale</div>
<button onclick="openCart()">Cart</button>
<form method="post" action="https://pay.example.net/checkout"><button>Pay</button></form>
</body></html>`;

const T = "2026-10-15T00:00:00.000Z";
const entry = (url, dest, type, mime, opts = {}) => ({
  startedDateTime: T,
  time: 20,
  _resourceType: type,
  request: {
    method: opts.method ?? "GET",
    url,
    httpVersion: "HTTP/2.0",
    headers: [
      { name: "sec-fetch-dest", value: dest },
      // Deliberately present so the test suite can prove secrets are never copied out.
      { name: "cookie", value: "session=SYNTHETIC-SECRET-COOKIE" },
      { name: "authorization", value: "Bearer SYNTHETIC-SECRET-TOKEN" },
    ],
    cookies: [{ name: "session", value: "SYNTHETIC-SECRET-COOKIE" }],
    queryString: [],
    headersSize: -1,
    bodySize: 0,
  },
  response: {
    status: opts.status ?? 200,
    statusText: "OK",
    httpVersion: "HTTP/2.0",
    headers: [{ name: "content-type", value: mime }],
    cookies: [],
    content: opts.body ? { size: opts.body.length, mimeType: mime, text: opts.body } : { size: 0, mimeType: mime },
    redirectURL: "",
    headersSize: -1,
    bodySize: 0,
  },
  cache: {},
  timings: { send: 0, wait: 10, receive: 10 },
});

const entries = [
  entry("https://shop.example.com/", "document", "document", "text/html", { body: html }),
  entry("https://shop.example.com/assets/app.js", "script", "script", "application/javascript"),
  entry("https://shop.example.com/assets/app.css", "style", "stylesheet", "text/css"),
  entry("https://fonts.googleapis.com/css2?family=Inter", "style", "stylesheet", "text/css"),
  entry("https://fonts.gstatic.com/s/inter/v13/inter.woff2", "font", "font", "font/woff2"),
  entry("https://www.googletagmanager.com/gtag/js?id=G-TEST", "script", "script", "application/javascript"),
  entry("https://region1.google-analytics.com/g/collect?v=2", "empty", "fetch", "text/plain"),
  entry("https://js.stripe.com/v3/", "script", "script", "application/javascript"),
  entry("https://js.stripe.com/v3/elements-inner.html", "iframe", "document", "text/html"),
  entry("https://api.stripe.com/v1/payment_methods", "empty", "xhr", "application/json"),
  entry("https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js", "script", "script", "application/javascript"),
  entry("https://i.ytimg.com/vi/abc/hqdefault.jpg", "image", "image", "image/jpeg"),
  entry("https://www.youtube-nocookie.com/embed/abc", "iframe", "document", "text/html"),
  entry("https://shop.example.com/img/logo.svg", "image", "image", "image/svg+xml"),
  entry("data:image/png;base64,iVBORw0KGgo=", "image", "image", "image/png"),
  entry("http://legacy-cdn.example.org/banner.png", "image", "image", "image/png"),
  entry("wss://live.example.com/socket", "empty", "websocket", ""),
  entry("https://shop.example.com/api/cart", "empty", "fetch", "application/json"),
  entry("https://shop.example.com/api/cart", "empty", "preflight", "", { method: "OPTIONS" }),
  entry("chrome-extension://abcdefghijklmnop/inject.js", "script", "script", "application/javascript"),
  entry("https://pay.example.net/checkout", "document", "document", "text/html", { method: "POST" }),
];

const har = {
  log: {
    version: "1.2",
    creator: { name: "Clydara synthetic sample", version: "1" },
    pages: [{ startedDateTime: T, id: "page_1", title: "Example Shop (synthetic sample)", pageTimings: {} }],
    entries,
  },
};

mkdirSync("public", { recursive: true });
mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("public/sample.har", JSON.stringify(har, null, 1));
writeFileSync("tests/fixtures/sample.har", JSON.stringify(har, null, 1));
console.log(`wrote ${entries.length} entries`);
