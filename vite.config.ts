import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

// The tool practises what it preaches: production builds ship a strict CSP.
// (Not applied in dev, where Vite's HMR client needs inline code.)
const CSP = "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; connect-src 'self'";

function cspMeta(): Plugin {
  return {
    name: "clydara-csp-meta",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  plugins: [cspMeta()],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: { input: { main: resolve(import.meta.dirname, "index.html"), tool: resolve(import.meta.dirname, "tool.html") } },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
