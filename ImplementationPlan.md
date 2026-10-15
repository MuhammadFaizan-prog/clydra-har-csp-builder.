# Implementation plan

| Slice | Content | Tests | Status |
|---|---|---|---|
| 1 | HAR parsing + validation errors | `tests/har.test.ts` | Done |
| 2 | Directive classification | `tests/classify.test.ts` | Done |
| 3 | Analysis, inline hashing, risk flags, directive assembly | `tests/csp.test.ts` | Done |
| 4 | Export formats | `tests/export.test.ts` | Done |
| 5 | UI wiring, states, accessibility | `../verify/verify_csp.py` (Playwright) | Done |
| 6 | Enforcement proof: generated policy served to Chromium | `../verify/verify_csp_enforce.py` | Done |
| 7 | Docs, video, private repo push | Tracker.md | Done |

**Dependencies.** Dev-only: vite, vitest, typescript, eslint, typescript-eslint, @eslint/js, globals, @types/node. All MIT/BSD/Apache, widely maintained. Zero runtime dependencies.

**Review gate.** Owner watches `../videos/clydra-har-csp-builder.webm`, reviews the private repo, and approves or rejects deployment.

**Deployment gate (after explicit approval only).** Reconfirm SHA; create a separate Vercel project (framework: Vite, output `dist`); add response headers including `frame-ancestors 'self'`; verify live flow, mobile, console, Clydara link.

**Recovery.** Static site: roll back by redeploying the previous commit. Nothing stateful to restore.
