/**
 * HAR reading. Only the fields needed to build a CSP are kept:
 * URL, method, status, a resource classification hint, and (for the main
 * document only) the HTML body so inline scripts can be hashed.
 * Cookies, auth headers and other bodies are never copied out of the HAR.
 */

export const MAX_HAR_BYTES = 40 * 1024 * 1024; // 40 MiB per file

export type HarErrorCode = "too_large" | "not_json" | "not_har" | "empty";

export class HarError extends Error {
  readonly code: HarErrorCode;
  constructor(code: HarErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "HarError";
  }
}

export interface HarRecord {
  url: string;
  method: string;
  status: number;
  /** Lower-cased Sec-Fetch-Dest request header, when the browser sent one. */
  fetchDest: string | null;
  /** Chromium/Playwright `_resourceType`, when present. */
  resourceType: string | null;
  /** Response MIME type without parameters. */
  mimeType: string;
  /** Decoded response text, kept only for HTML documents. */
  htmlBody: string | null;
  /** Index of the file this record came from (multi-file merges). */
  fileIndex: number;
}

export interface ParsedHar {
  records: HarRecord[];
  creator: string;
  pageTitles: string[];
}

interface RawHeader {
  name?: unknown;
  value?: unknown;
}

function headerValue(headers: unknown, name: string): string | null {
  if (!Array.isArray(headers)) return null;
  const lower = name.toLowerCase();
  for (const h of headers as RawHeader[]) {
    if (h && typeof h.name === "string" && h.name.toLowerCase() === lower && typeof h.value === "string") {
      return h.value;
    }
  }
  return null;
}

function decodeBody(content: Record<string, unknown> | undefined): string | null {
  if (!content || typeof content.text !== "string") return null;
  if (content.encoding === "base64") {
    try {
      const bin = atob(content.text);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return null;
    }
  }
  return content.text;
}

/** Parse one HAR file's text. Throws HarError with a user-facing message. */
export function parseHar(text: string, fileIndex = 0): ParsedHar {
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > MAX_HAR_BYTES) {
    throw new HarError("too_large", `This file is ${(byteLength / 1048576).toFixed(1)} MB. The limit is 40 MB per file; record a shorter session.`);
  }
  if (text.trim() === "") {
    throw new HarError("empty", "The file is empty.");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HarError("not_json", "This is not valid JSON, so it can't be a HAR file. Export it again with “Save all as HAR”.");
  }
  const log = (data as { log?: unknown } | null)?.log as Record<string, unknown> | undefined;
  if (!log || typeof log !== "object" || !Array.isArray(log.entries)) {
    throw new HarError("not_har", "This JSON has no log.entries array, so it isn't a HAR file.");
  }
  const entries = log.entries as unknown[];
  if (entries.length === 0) {
    throw new HarError("empty", "The HAR file contains no requests. Start recording before you load the page, then export again.");
  }

  const records: HarRecord[] = [];
  for (const raw of entries) {
    const e = raw as Record<string, unknown>;
    const req = e?.request as Record<string, unknown> | undefined;
    const res = e?.response as Record<string, unknown> | undefined;
    if (!req || typeof req.url !== "string") continue;
    const content = res?.content as Record<string, unknown> | undefined;
    const mimeRaw =
      (typeof content?.mimeType === "string" && content.mimeType) || headerValue(res?.headers, "content-type") || "";
    const mimeType = mimeRaw.split(";")[0]!.trim().toLowerCase();
    const isHtml = mimeType === "text/html" || mimeType === "application/xhtml+xml";
    records.push({
      url: req.url,
      method: typeof req.method === "string" ? req.method.toUpperCase() : "GET",
      status: typeof res?.status === "number" ? res.status : 0,
      fetchDest: headerValue(req.headers, "sec-fetch-dest")?.toLowerCase() ?? null,
      resourceType: typeof e._resourceType === "string" ? e._resourceType.toLowerCase() : null,
      mimeType,
      htmlBody: isHtml ? decodeBody(content) : null,
      fileIndex,
    });
  }
  if (records.length === 0) {
    throw new HarError("not_har", "No entry in this HAR has a request URL.");
  }

  const creatorObj = log.creator as { name?: unknown; version?: unknown } | undefined;
  const creator = typeof creatorObj?.name === "string" ? `${creatorObj.name}${typeof creatorObj.version === "string" ? " " + creatorObj.version : ""}` : "unknown";
  const pageTitles = Array.isArray(log.pages)
    ? (log.pages as Array<{ title?: unknown }>).map((p) => (typeof p?.title === "string" ? p.title : "")).filter(Boolean)
    : [];
  return { records, creator, pageTitles };
}
