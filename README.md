# Clydara HAR → CSP Builder

Build a `Content-Security-Policy` from what your site actually loads. Record a browsing session as a HAR file (DevTools → Network → Save all as HAR), drop it in, review every source with its evidence, and copy a policy for your server.

- Works for logged-in pages, checkouts and staging sites that public URL scanners can't reach.
- Runs entirely in your browser. The HAR (which can contain cookies and tokens) is never uploaded.
- Hashes inline `<script>`/`<style>` from the recorded HTML instead of using `'unsafe-inline'`.
- Flags risky sources: plain `http:`, shared script CDNs, `data:` scripts, `blob:` workers.
- Exports: HTTP header, Nginx, Apache, `vercel.json`, Netlify `_headers`, `<meta>`.

## Pages
- `/`: product page with a live trace of the sample (requests → sources → policy) and an annotated example policy.
- `/tool.html`: the workspace. `/tool.html#sample` opens it with the synthetic sample loaded.

## Develop
```bash
npm ci
npm run dev        # http://localhost:5173 (landing) and /tool.html (workspace)
npm run lint && npm run typecheck && npm test && npm run build
npm run preview    # serves dist/ on http://localhost:4173
node scripts/make-sample.mjs   # regenerate the synthetic sample
```
No environment variables. No backend. Supabase is not used.

## Limits
A HAR only contains what you clicked through, so deploy in **Report-Only** first and watch for violations. Inline code can only be hashed when the HAR includes page content, and dynamic inline scripts need server-generated nonces. Inline event handlers (`onclick=`) and `style=""` attributes are reported but not allowed.

## Docs
PRD.md · Techspec.md · Appflow.md · Schema.md · ImplementationPlan.md · Tracker.md · Rules.md · Security.md · Structure.md

Built by [Clydara](https://www.clydralab.com/).
