# Security

**Trust boundary.** The only untrusted input is the HAR file (and two text fields). Everything runs in the user's tab; there is no server, API or database.

**Sensitive data in HARs.** HAR files often contain cookies, `Authorization` headers and response bodies. The parser copies only URL, method, status, `Sec-Fetch-Dest`, `_resourceType`, MIME and HTML bodies of HTML responses; a unit test asserts cookies/auth headers are not copied. Example URLs shown in the table have query strings removed (tokens often live there). Nothing is persisted or transmitted. The UI states this next to the drop zone.

**Injection.** HAR-derived strings rendered via `innerHTML` are escaped (`escapeHtml`). The policy output is placed in a `<textarea>` via `.value`. The production build ships its own strict CSP meta (no inline script, `connect-src 'self'`), which also prevents exfiltration if an injection were found.

**Abuse / resource limits.** 40 MiB per file limit (checked before reading via `File.size`). Parsing is synchronous in the tab; a huge HAR can only slow the user's own tab.

**Secrets.** None exist. `.env.example` is intentionally empty of values. Verified: no secrets in source, bundle or Git history (see Tracker.md).

**Output correctness risks.** A HAR only shows what was clicked through; the tool defaults to Report-Only and says so. Allowing a whole shared CDN host in script-src is weak; flagged. Hashes break when inline code changes; noted in the UI.

**Dependencies.** Dev-only toolchain; `npm audit` result recorded in Tracker.md. No runtime packages ship to users.

**Supabase.** Not used; no keys, no RLS surface.

**Incidents.** None.
