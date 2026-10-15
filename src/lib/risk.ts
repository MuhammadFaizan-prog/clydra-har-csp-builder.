import type { Directive } from "./classify";

export interface Risk {
  level: "high" | "medium";
  code: string;
  message: string;
}

/**
 * Hosts where anyone can publish JavaScript (public package CDNs, raw Git
 * hosting) or that expose JSONP-style endpoints. Allowing the whole host in
 * script-src lets an attacker who finds an injection load their own code from
 * it. This list is intentionally short and conservative.
 */
export const SHARED_SCRIPT_HOSTS = new Set([
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
  "esm.sh",
  "cdn.skypack.dev",
  "ajax.googleapis.com",
  "www.google.com",
  "www.googletagmanager.com",
]);

export function risksFor(directive: Directive, source: string): Risk[] {
  const risks: Risk[] = [];
  if (source.startsWith("http://") || source.startsWith("ws://")) {
    risks.push({
      level: "high",
      code: "insecure-scheme",
      message: "Loaded over an unencrypted connection. Move it to HTTPS (or WSS) before allowing it.",
    });
  }
  if (directive === "script-src" && source === "data:") {
    risks.push({ level: "high", code: "data-script", message: "data: in script-src lets injected markup run arbitrary script. Serve this script as a file instead." });
  }
  if ((directive === "script-src" || directive === "worker-src") && source === "blob:") {
    risks.push({ level: "medium", code: "blob-script", message: "blob: lets any script on the page create and run new code. Keep it only if a library you trust needs it." });
  }
  if (directive === "object-src") {
    risks.push({ level: "medium", code: "plugin-content", message: "Plugin content (<object>/<embed>) is rarely needed. Consider removing it and keeping object-src 'none'." });
  }
  if (directive === "script-src") {
    try {
      const host = new URL(source).host;
      if (SHARED_SCRIPT_HOSTS.has(host)) {
        risks.push({
          level: "medium",
          code: "shared-host",
          message: "Anyone can publish scripts on this host, so allowing all of it is weak. Prefer self-hosting the file or a hash/nonce.",
        });
      }
    } catch {
      /* keyword sources like 'self' have no host */
    }
  }
  return risks;
}
