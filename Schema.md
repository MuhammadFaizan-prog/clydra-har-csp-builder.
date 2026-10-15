# Schema

**This tool stores no user data.** No database, no localStorage, no cookies, no analytics, no server.

Dedicated Supabase project not used / not created (browser-only). Nothing to migrate, retain or delete.

**In-memory entities (tab lifetime only).**
- `HarRecord`: url, method, status, fetchDest, resourceType, mimeType, htmlBody (HTML responses only), fileIndex.
- `SourceEvidence`: directive, source expression, count, ≤ 3 example URLs (query strings stripped), risks.
- `InlineFindings`: script/style hashes, inline handler and style-attribute counts, documents scanned / without body.
- `PolicyOptions`: mode, frameAncestors, includeInlineHashes, upgradeInsecureRequests, reportEndpoint.

**Validation.** File ≤ 40 MiB (checked on `File.size` and on decoded text); valid JSON; `log.entries` array; ≥ 1 entry with a string `request.url`. Origin input must normalise to an http(s) origin with a dot or `localhost`. Report endpoint must be `https:` (or `http://localhost`).

**Ownership / deletion.** Everything lives in the page's memory; closing or reloading the tab deletes it. Downloads are created by the user on their own machine.
