# Tracker

Status (2026-10-15, redesign): built and verified locally. Committed locally only; GitHub push blocked (see below). Not deployed.

| Criterion | Result (fresh run, redesign) |
|---|---|
| lint, typecheck, build | pass |
| unit tests (vitest) | 40/40 pass (35 existing + 5 new in tests/model.test.ts) |
| browser checks (../verify/verify_csp.py) | 101/101 pass: landing actions, live sample trace, invalid/empty/partial/no-findings states, review/exclude/details, mode/settings, 6 export formats, copy/download, keyboard + focus ring, sampled contrast ≥ 4.5:1, 390/768/1440 and 720×450 (200 % zoom) with no horizontal overflow, no storage, 0 console errors, 0 off-origin requests |
| enforcement test (../verify/verify_csp_enforce.py) | 7/7: generated enforce header applied in Chromium; hashed inline script/style ran; only inline handler/style attribute blocked (by design) |
| before/after screenshots | ../redesign/before, ../redesign/after |
| demo video | ../videos/clydra-har-csp-builder-redesign.mp4 (H.264, 77 s) |

Decisions: landing (`/`) and workspace (`/tool.html`) are separate pages; browser-only, no Supabase. No nonces (need a server). Processing logic in `src/lib` unchanged.
Limitations: policy is only as complete as the recorded session; inline attributes (onclick=, style=) are not allowed and must be refactored or allowed manually; landing trace lines are drawn only above 900 px.
GitHub: push blocked (connector 403 "Resource not accessible by integration" on repo_create; git smart-HTTP blocked). Local commit + bundle only.
Next: owner review of the video; deploy only after approval.
