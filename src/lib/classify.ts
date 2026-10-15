import type { HarRecord } from "./har";

export type FetchDirective =
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "media-src"
  | "frame-src"
  | "worker-src"
  | "manifest-src"
  | "object-src";

export type Directive = FetchDirective | "form-action";

export type Classification =
  | { kind: "directive"; directive: Directive }
  | { kind: "navigation" }
  | { kind: "ignored"; reason: "extension" | "unsupported-scheme" | "preflight" };

const DEST_MAP: Record<string, Directive | "navigation"> = {
  script: "script-src",
  style: "style-src",
  image: "img-src",
  font: "font-src",
  empty: "connect-src",
  audio: "media-src",
  video: "media-src",
  track: "media-src",
  iframe: "frame-src",
  frame: "frame-src",
  worker: "worker-src",
  sharedworker: "worker-src",
  serviceworker: "worker-src",
  manifest: "manifest-src",
  object: "object-src",
  embed: "object-src",
  document: "navigation",
};

const TYPE_MAP: Record<string, Directive | "navigation"> = {
  script: "script-src",
  stylesheet: "style-src",
  image: "img-src",
  font: "font-src",
  fetch: "connect-src",
  xhr: "connect-src",
  eventsource: "connect-src",
  websocket: "connect-src",
  ping: "connect-src",
  beacon: "connect-src",
  media: "media-src",
  texttrack: "media-src",
  manifest: "manifest-src",
  document: "navigation",
};

function byMime(mime: string): Directive | null {
  if (!mime) return null;
  if (mime.includes("javascript") || mime === "text/ecmascript") return "script-src";
  if (mime === "text/css") return "style-src";
  if (mime.startsWith("image/")) return "img-src";
  if (mime.startsWith("font/") || mime.includes("font-woff") || mime === "application/vnd.ms-fontobject") return "font-src";
  if (mime.startsWith("audio/") || mime.startsWith("video/") || mime === "text/vtt") return "media-src";
  if (mime === "application/manifest+json") return "manifest-src";
  if (mime.includes("json") || mime === "text/plain" || mime === "text/event-stream") return "connect-src";
  return null;
}

function byExtension(pathname: string): Directive | null {
  const m = /\.([a-z0-9]+)$/i.exec(pathname);
  if (!m) return null;
  const ext = m[1]!.toLowerCase();
  if (["js", "mjs", "cjs"].includes(ext)) return "script-src";
  if (ext === "css") return "style-src";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp"].includes(ext)) return "img-src";
  if (["woff", "woff2", "ttf", "otf", "eot"].includes(ext)) return "font-src";
  if (["mp4", "webm", "mp3", "ogg", "wav", "m4a", "vtt", "m3u8"].includes(ext)) return "media-src";
  if (ext === "webmanifest") return "manifest-src";
  return null;
}

/**
 * Decide which CSP directive a recorded request belongs to.
 * Priority: Sec-Fetch-Dest (set by the browser itself) > Chromium _resourceType
 * > response MIME type > URL extension > connect-src fallback.
 */
export function classify(record: HarRecord): Classification {
  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    return { kind: "ignored", reason: "unsupported-scheme" };
  }
  const scheme = url.protocol;
  if (["chrome-extension:", "moz-extension:", "safari-extension:", "safari-web-extension:"].includes(scheme)) {
    return { kind: "ignored", reason: "extension" };
  }
  if (!["http:", "https:", "ws:", "wss:", "data:", "blob:"].includes(scheme)) {
    return { kind: "ignored", reason: "unsupported-scheme" };
  }
  if (record.method === "OPTIONS" || record.resourceType === "preflight") {
    return { kind: "ignored", reason: "preflight" };
  }
  if (scheme === "ws:" || scheme === "wss:") return { kind: "directive", directive: "connect-src" };

  const fromDest = record.fetchDest ? DEST_MAP[record.fetchDest] : undefined;
  if (fromDest === "navigation") {
    return record.method === "POST" ? { kind: "directive", directive: "form-action" } : { kind: "navigation" };
  }
  if (fromDest) return { kind: "directive", directive: fromDest };

  const fromType = record.resourceType ? TYPE_MAP[record.resourceType] : undefined;
  if (fromType === "navigation") {
    return record.method === "POST" ? { kind: "directive", directive: "form-action" } : { kind: "navigation" };
  }
  if (fromType) return { kind: "directive", directive: fromType };

  if (record.mimeType === "text/html" && record.method === "GET") return { kind: "navigation" };
  const guess = byMime(record.mimeType) ?? byExtension(url.pathname);
  return { kind: "directive", directive: guess ?? "connect-src" };
}
