# PRD: Clydara HAR → CSP Builder

## 1. Research record (prompt section 4)

**User and job.** A web developer or small-team maintainer who needs to ship a `Content-Security-Policy` for a site that already exists, including pages behind a login, a checkout, or a staging host that public scanners can't reach. Job: "turn what my pages really load into a policy I can paste into my server config, without guessing every vendor host."

**Evidence the problem occurs.**
- Roth et al., *12 Angry Developers: A Qualitative Study on Developers' Struggles with CSP* (ACM CCS 2021) found developers struggle to build correct policies; several participants started from auto-generated baselines (Csper, Mozilla Laboratory, Report URI wizard). https://swag.cispa.saarland/files/usecsp_preprint.pdf · https://dl.acm.org/doi/abs/10.1145/3460120.3484780
- The W3C CSP spec itself notes "a non-trivial amount of work required to apply CSP to an existing web application." https://www.w3.org/TR/2014/WD-CSP11-20140211
- Vendors keep shipping generators for this exact job (below), which shows recurring demand; cside's docs: "Writing a Content Security Policy by hand means knowing every host your pages load from, including the ones your vendors load on your behalf." https://docs.cside.com/csp-builder

**Alternatives (observed from their public pages, 2026-10-15).**
| Alternative | Does well | Where users still struggle |
|---|---|---|
| Csper CSP Generator extension (https://csper.io/generator) | Injects a report-only policy and builds from violation reports; lists inline issues | Requires installing a browser extension that runs on your site; per-domain; results flow through Csper's service |
| Report URI CSP Wizard / Builder (https://report-uri.com/home/generate, https://docs.report-uri.com/setup/wizard/) | Learns from real visitors' reports over time; visual builder | Needs an account and a deployed report-only header before you get anything; not instant |
| Testomato CSP Generator (https://testomato.com/tools/csp-generator/) | Free, no sign-up; crawls one live URL; bypass analysis | Crawls a single public page from their server, so it can't see logged-in, checkout or staging flows |
| Google CSP Evaluator (https://csp-evaluator.withgoogle.com/) | Excellent at judging an existing policy | Doesn't generate a policy from your resources |

**Original value.** Works from a HAR file the developer already knows how to record, so it covers authenticated and multi-step flows that URL crawlers can't reach, with no extension, account, deployed header or upload. Every source is shown with its request count and example URL, can be unticked, and is flagged when risky (insecure scheme, shared script CDNs, `data:` scripts). Inline `<script>`/`<style>` blocks are hashed from the recorded HTML so the policy never needs `'unsafe-inline'`. Output in six formats (header, Nginx, Apache, vercel.json, Netlify `_headers`, `<meta>` with correct removal of meta-incompatible directives).

**Inputs/outputs, edge cases, privacy, cost.** Input: one or more `.har` files (≤ 40 MB each). Output: policy text, copy or download. Edge cases: HAR without content (no inline hashing, warned), no top-level page (user types origin), extension traffic and CORS preflights (ignored), websockets (connect-src), POST navigations (form-action). Privacy: HARs may hold cookies and tokens; the file is parsed in the tab only, and only URLs, types and the first-party HTML body are read. Running cost: static hosting only (≈ $0).

**Buildable today?** Yes; built and verified in this run.

**REA usage (honest record).** `rea-agents` 6.5.0 (MIT; https://github.com/morluto/rea) was installed via npm and its HAR capture adapter (`inspect_web_network_capture`) was run on a 50-request Playwright recording of https://www.clydralab.com/ (our own site). Output: `../research/rea-inspect-clydralab-har.json` in the tool-studio folder. It confirmed the record shape (Sec-Fetch-Dest headers, `_resourceType`, no cookies; REA reported `sensitive_value_count: 0`). REA was **not** used to inspect any competitor product; competitor behavior above comes from their public documentation pages only. No code or assets were copied from any alternative.

## 2. Goal and scope
Goal: from a real recording, produce a correct, reviewable, starter CSP in under a minute.

In scope: HAR parsing and validation; directive classification; origin detection/override; inline hash scanning; risk flags; source selection; options (mode, frame-ancestors, inline hashes, upgrade-insecure-requests, report-uri); six export formats; copy/download; synthetic sample.

Non-goals: crawling URLs; server-side storage; accounts; nonce generation (needs a server); `strict-dynamic` policy design; evaluating an existing policy; monitoring violations.

## 3. Stories
- As a developer, I drop my HAR and see every source grouped by directive, with evidence.
- I untick a source I don't trust and the policy updates.
- I copy the policy in my server's format and deploy it in Report-Only first.
- If my file is wrong, I'm told why and what to do.

## 4. Acceptance criteria (all verified, see Tracker.md)
1. Valid HAR → evidence table and policy; origin auto-detected.
2. Invalid JSON, non-HAR JSON and empty HAR each show a specific message; no results shown.
3. Inline scripts/styles in recorded HTML are hashed with SHA-256; JSON-LD is not hashed; output never contains `unsafe-inline`/`unsafe-eval`.
4. Extension requests and preflights are excluded and reported.
5. Unticking a source removes it from the policy.
6. Every option changes the output as labeled; invalid report URL is excluded and flagged.
7. Six formats; meta output removes `frame-ancestors`/`report-uri` and explains why.
8. Copy and Download produce the exact displayed text.
9. Keyboard operable; mobile has no horizontal overflow; no console errors; no network requests leave the origin.
10. "Built by Clydara" links to https://www.clydralab.com/ in a new tab; tool name returns to tool home.

## 5. Success measures (post-release, not yet measured)
Successful policy exports per visit, repeat visits, error-message rate, clicks to clydralab.com. Not deployed; nothing measured yet.
