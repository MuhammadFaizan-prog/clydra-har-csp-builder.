# Rules

- TypeScript strict, `noUncheckedIndexedAccess`; no `any` leaks at boundaries. Parse untrusted HAR as `unknown` and narrow.
- Zero runtime dependencies unless one is clearly necessary; justify any addition in Techspec.md.
- Never send HAR content anywhere. No `fetch` except same-origin `/sample.har`. No analytics.
- All user-facing strings from HAR data go through `escapeHtml` before `innerHTML`.
- The generator must never emit `'unsafe-inline'` or `'unsafe-eval'`.
- Tests use realistic HARs: the synthetic `public/sample.har` (regenerate with `node scripts/make-sample.mjs`, never hand-edit) and a real Chromium recording of clydralab.com (`tests/fixtures/clydralab-home.har`, contains no cookies).
- `dist/` and `node_modules/` are generated; never commit them.
- Branding: tool name links home; "Built by Clydara" links to https://www.clydralab.com/. No CRM mention, no invented claims, testimonials or usage numbers.
- Agents: follow this repo's docs; update Tracker.md when status changes; don't deploy or make the repo public without the owner's explicit approval.
- Before commit: `npm run lint && npm run typecheck && npm test && npm run build`.
