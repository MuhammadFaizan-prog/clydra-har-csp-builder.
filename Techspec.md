# Techspec

**Stack.** Vite 8 + TypeScript 6 (strict), no runtime dependencies. Vitest 5 for unit tests, ESLint 10 + typescript-eslint. Output is a static `dist/` (≈ 20 KB JS, 6.5 KB CSS before gzip).

**Architecture.** Single page, framework-free DOM code.
- `src/lib/har.ts` parses and validates HAR text (size, JSON, `log.entries`, empty) and copies out only URL, method, status, `Sec-Fetch-Dest`, `_resourceType`, MIME, and the HTML body of HTML responses. Cookies and other headers are never copied.
- `src/lib/classify.ts` maps each request to a directive. Priority: `Sec-Fetch-Dest` (set by the browser) > Chromium `_resourceType` > MIME > URL extension > `connect-src`. Extension schemes, preflights and unknown schemes are ignored; top-level GET documents are navigations, POST documents are `form-action`.
- `src/lib/csp.ts` detects the site origin, builds narrow source expressions (`'self'`, `scheme://host[:port]`, `data:`, `blob:`), hashes inline `<script>`/`<style>` with Web Crypto SHA-256 (skipping `src=` scripts and non-executed types like JSON-LD), counts inline handlers/`style=` attributes, and assembles directives: `default-src 'self'`, observed fetch directives (omitted when only `'self'`), `object-src 'none'`, `base-uri 'self'`, `form-action`, `frame-ancestors`, optional `upgrade-insecure-requests`, optional `report-uri`.
- `src/lib/risk.ts` flags `http:`/`ws:` sources, `data:` in script-src, `blob:` in script/worker-src, plugin content, and shared script hosts (public npm CDNs, raw GitHub, Google Tag Manager, etc.).
- `src/lib/export.ts` renders header / Nginx / Apache / vercel.json / Netlify `_headers` / `<meta>`.
- `src/main.ts` wires file input, drag-and-drop, sample loader, options, evidence table, format tabs, copy and download.

**Data flow.** File → `File.text()` in the tab → `parseHar` → `analyse` → `buildDirectives` → `exportPolicy` → textarea / clipboard / Blob download. No network calls except loading `/sample.har` from the same origin when the user asks for the sample.

**Integrations.** None. **Supabase:** dedicated Supabase project not used / not created (browser-only). The tool processes HAR files that can contain credentials; sending them to a database would add risk with no user benefit.

**Self-protection.** Production build injects a strict CSP `<meta>` (`default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; connect-src 'self'`). Not applied in dev because Vite's HMR client needs inline code. (`frame-ancestors` can't be set by meta; set it as a header at deploy time.)

**Deployment.** Not deployed. When approved: any static host (Vercel static output from `npm run build`, output dir `dist`). No env vars.

**Tradeoffs.** Regex HTML scanning instead of a DOM parser keeps it dependency-free and works in tests; it's accurate for normal markup but could miss pathological HTML (documented limit). `report-uri` is used because it has the widest support; `report-to` needs a separate `Reporting-Endpoints` header the user must configure. Hashes only work for static inline code; dynamic inline code needs server nonces, which a static tool can't issue.
