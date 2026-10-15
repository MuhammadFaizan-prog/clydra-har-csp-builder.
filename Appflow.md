# Appflow

Two directly reachable pages (multi-page Vite build):

- `/` (`index.html`, `src/landing.ts`): product page.
- `/tool.html` (`tool.html`, `src/tool.ts`): workspace. `/tool.html#sample` opens it with the synthetic sample loaded.

## Landing
Nav: product identity (→ `/`), How it works, Example, Privacy & limits, FAQ, **Open the builder** (`/tool.html`), Built by Clydara (https://www.clydralab.com/, new tab, noopener). Under 900 px the links collapse behind a Menu button (`aria-expanded`).

Sections: hero (headline, who it is for, **Open the builder**, **Load the sample recording** → `/tool.html#sample`) → live trace of the sample (Recorded requests → Allowed sources → Policy; hover/focus a source to trace it; lines drawn on desktop) → annotated sample header (A hash, B shared CDN, C plain HTTP, Report-Only) → How it works (4 steps + glossary) → use-case table → Privacy / Limits → FAQ → closing actions → footer. The trace and annotated header are computed in the browser from `/sample.har` with the same `lib/` code the workspace uses.

## Workspace journey
Load recordings → Review sources → Inspect policy → Export (stage rail in the app bar; later stages are plain text until a recording is loaded).

1. **Load**: drop or choose `.har` files (Enter/Space on the drop zone), or **Load the sample recording**. After loading, the recording strip shows files, counts (requests, pages, sources, inline blocks hashed, ignored with a tooltip breakdown), editable origin, **Add recording** (merge, keeps exclusions), **Replace**, **Clear**, and the coverage note.
2. **Review sources**: table grouped by directive. Columns: Include (checkbox), Source (+ Review / High risk badge, left-edge severity rule), Requests, In policy (Listed / Via default-src / Excluded / Always kept), Details. Filter chips: All, Needs review, each directive (with counts). Details row: risk note, Observed requests (method, status, URL), Directive, Why it's included, If you exclude it (wording follows Report-Only/Enforce).
3. **Inspect policy**: mode switch with explanation; directive-per-line policy; hovering a row highlights its token and vice versa; inline-code warnings; collapsed **Policy settings** (frame-ancestors, hashes, upgrade-insecure-requests, report URL) with warnings beside each setting.
4. **Export**: tabs (HTTP header, Nginx, Apache, vercel.json, Netlify _headers, HTML <meta>; arrows/Home/End), read-only text, format notes, **Copy** (button turns "Copied", status line) and **Download** (shows the file name).

## States
- First visit: drop zone, what is read / not copied, sample, how to record.
- Processing: "Reading N files…" (aria-live), `aria-busy` on body.
- Invalid input: alert naming the file and reason (not JSON / no log.entries / no requests / empty / over 40 MB); described-by the drop zone; an existing recording is kept and the status says so.
- Partial: no top-level page → error under the origin field (`aria-invalid`, described-by); no page HTML → warning beside the hash setting and in the policy pane; inline handlers / style attributes → policy pane note; extension and preflight requests → ignored count.
- No findings: table explains the policy locks everything to the site's origin.
- Clipboard blocked: text selected, status explains Ctrl+C / ⌘C.
- Clear: back to first visit, "Recording cleared. Nothing was stored."

## Responsive
≥1025 px: table + sticky policy pane side by side. ≤1024 px: single column with a sticky jump bar (Sources / Policy / Export). ≤720 px: table rows become stacked records; no page-level horizontal scroll (verified at 390, 768, 1440 and 720×450 for 200 % zoom).
