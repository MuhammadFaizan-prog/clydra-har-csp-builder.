# Structure

```
clydra-har-csp-builder/
├── index.html              Landing page (nav, hero, live trace, annotated example, how it works, use cases, privacy/limits, FAQ)
├── tool.html               Workspace (stage rail, load, recording strip, source table, policy pane, settings, export)
├── src/
│   ├── landing.ts          Landing: mobile menu, live sample trace + SVG links, annotated sample policy
│   ├── tool.ts             Workspace state (memory only), events, rendering, copy/download
│   ├── ui/model.ts         View helpers over lib output: request→source mapping, policy placement, why/if-excluded text, carried exclusions
│   ├── styles/base.css     Tokens (white / deep ink / teal), type scale, buttons, identity
│   ├── styles/landing.css  Landing layout
│   ├── styles/tool.css     Workspace layout (bench, table, policy pane, responsive stacking)
│   └── lib/                Unchanged processing logic
│       ├── har.ts          HAR parse/validate; minimal field extraction
│       ├── classify.ts     Request → CSP directive
│       ├── csp.ts          Origin detection, sources, inline hashing, analysis, directive assembly
│       ├── risk.ts         Risk flags per directive/source
│       └── export.ts       Header/Nginx/Apache/vercel.json/Netlify/meta output
├── public/
│   ├── clydara-logo.png    Approved Clydara avatar, resized to 128 px
│   └── sample.har          Synthetic sample (generated)
├── scripts/make-sample.mjs Generates public/sample.har and tests/fixtures/sample.har
├── tests/
│   ├── har.test.ts, classify.test.ts, csp.test.ts, export.test.ts, model.test.ts
│   └── fixtures/           sample.har (synthetic), clydralab-home.har (real Chromium recording, no cookies)
├── vite.config.ts          Multi-page build (index + tool), production CSP meta plugin, Vitest config
├── eslint.config.js, tsconfig.json, package.json, package-lock.json
├── .env.example, .gitignore, LICENSE
└── README.md + PRD, Techspec, Appflow, Schema, ImplementationPlan, Tracker, Rules, Security, Structure
```
Browser verification scripts live outside the repo in the tool-studio folder (`../verify/verify_csp.py`, `../verify/verify_csp_enforce.py`, `../verify/shots_csp_after.py`, `../verify/record_csp_redesign.py`).
