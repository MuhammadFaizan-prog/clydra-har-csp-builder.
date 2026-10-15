import type { HarRecord } from "./har";
import { classify, type Directive } from "./classify";
import { risksFor, type Risk } from "./risk";

export interface SourceEvidence {
  directive: Directive;
  /** CSP source expression, e.g. 'self', https://cdn.example.com, data: */
  source: string;
  count: number;
  /** Up to three example request URLs (query strings removed). */
  examples: string[];
  risks: Risk[];
}

export interface InlineFindings {
  scriptHashes: string[];
  styleHashes: string[];
  inlineEventHandlers: number;
  styleAttributes: number;
  documentsScanned: number;
  documentsWithoutBody: number;
}

export interface Analysis {
  selfOrigin: string | null;
  evidence: SourceEvidence[];
  inline: InlineFindings;
  ignored: { extension: number; unsupported: number; preflight: number };
  navigations: number;
  totalRecords: number;
}

export const DIRECTIVE_ORDER: Directive[] = [
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "media-src",
  "frame-src",
  "worker-src",
  "manifest-src",
  "object-src",
  "form-action",
];

/** Origin of the first top-level GET document in the recording. */
export function detectSelfOrigin(records: HarRecord[]): string | null {
  for (const r of records) {
    const c = classify(r);
    if (c.kind === "navigation") {
      try {
        const u = new URL(r.url);
        if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
      } catch {
        /* skip */
      }
    }
  }
  return null;
}

/** Normalise a user-typed origin ("example.com", "https://example.com/path") to an origin or null. */
export function normaliseOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Turn a request URL into the narrowest sensible CSP source expression. */
export function sourceExpression(rawUrl: string, selfOrigin: string | null): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol === "data:") return "data:";
  if (u.protocol === "blob:") return "blob:";
  if (selfOrigin && u.origin === selfOrigin) return "'self'";
  if (["http:", "https:", "ws:", "wss:"].includes(u.protocol)) return `${u.protocol}//${u.host}`;
  return null;
}

function exampleOf(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === "data:") return rawUrl.slice(0, 40) + (rawUrl.length > 40 ? "…" : "");
    return `${u.origin}${u.pathname}`;
  } catch {
    return rawUrl.slice(0, 80);
  }
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin);
}

const NON_EXECUTED_SCRIPT_TYPES = /^(application\/(ld\+)?json|text\/(template|x-template|html|plain)|importmap|speculationrules)$/i;

/**
 * Hash inline <script> and <style> blocks in an HTML document so they can be
 * allowed with 'sha256-…' instead of 'unsafe-inline'. Also counts inline event
 * handlers and style attributes, which hashes alone cannot allow.
 */
export async function scanInline(html: string): Promise<Omit<InlineFindings, "documentsScanned" | "documentsWithoutBody">> {
  const scriptHashes = new Set<string>();
  const styleHashes = new Set<string>();
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const m of html.matchAll(scriptRe)) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (typeMatch && NON_EXECUTED_SCRIPT_TYPES.test(typeMatch[1]!)) continue;
    if (body.trim() === "") continue;
    scriptHashes.add(`'sha256-${await sha256Base64(body)}'`);
  }
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  for (const m of html.matchAll(styleRe)) {
    const body = m[1] ?? "";
    if (body.trim() === "") continue;
    styleHashes.add(`'sha256-${await sha256Base64(body)}'`);
  }
  // Strip script/style bodies before counting attributes so code text isn't mistaken for markup.
  const markup = html.replace(scriptRe, "<script></script>").replace(styleRe, "<style></style>");
  const tagRe = /<[a-z][a-z0-9-]*\b[^>]*>/gi;
  let inlineEventHandlers = 0;
  let styleAttributes = 0;
  for (const t of markup.matchAll(tagRe)) {
    const tag = t[0];
    inlineEventHandlers += (tag.match(/\son[a-z]+\s*=/gi) ?? []).length;
    styleAttributes += (tag.match(/\sstyle\s*=/gi) ?? []).length;
  }
  return { scriptHashes: [...scriptHashes], styleHashes: [...styleHashes], inlineEventHandlers, styleAttributes };
}

export async function analyse(records: HarRecord[], selfOriginOverride?: string | null): Promise<Analysis> {
  const selfOrigin = selfOriginOverride ?? detectSelfOrigin(records);
  const map = new Map<string, SourceEvidence>();
  const ignored = { extension: 0, unsupported: 0, preflight: 0 };
  let navigations = 0;
  const inline: InlineFindings = {
    scriptHashes: [],
    styleHashes: [],
    inlineEventHandlers: 0,
    styleAttributes: 0,
    documentsScanned: 0,
    documentsWithoutBody: 0,
  };
  const scriptHashes = new Set<string>();
  const styleHashes = new Set<string>();

  for (const r of records) {
    const c = classify(r);
    if (c.kind === "ignored") {
      if (c.reason === "extension") ignored.extension++;
      else if (c.reason === "preflight") ignored.preflight++;
      else ignored.unsupported++;
      continue;
    }
    const isSelfDoc = (() => {
      try {
        return selfOrigin !== null && new URL(r.url).origin === selfOrigin;
      } catch {
        return false;
      }
    })();
    if (c.kind === "navigation") {
      navigations++;
      if (isSelfDoc) {
        if (r.htmlBody) {
          const found = await scanInline(r.htmlBody);
          found.scriptHashes.forEach((h) => scriptHashes.add(h));
          found.styleHashes.forEach((h) => styleHashes.add(h));
          inline.inlineEventHandlers += found.inlineEventHandlers;
          inline.styleAttributes += found.styleAttributes;
          inline.documentsScanned++;
        } else {
          inline.documentsWithoutBody++;
        }
      }
      continue;
    }
    const source = sourceExpression(r.url, selfOrigin);
    if (!source) {
      ignored.unsupported++;
      continue;
    }
    const key = `${c.directive} ${source}`;
    let ev = map.get(key);
    if (!ev) {
      ev = { directive: c.directive, source, count: 0, examples: [], risks: risksFor(c.directive, source) };
      map.set(key, ev);
    }
    ev.count++;
    const ex = exampleOf(r.url);
    if (ev.examples.length < 3 && !ev.examples.includes(ex)) ev.examples.push(ex);
  }

  inline.scriptHashes = [...scriptHashes];
  inline.styleHashes = [...styleHashes];
  const evidence = [...map.values()].sort((a, b) => {
    const d = DIRECTIVE_ORDER.indexOf(a.directive) - DIRECTIVE_ORDER.indexOf(b.directive);
    if (d !== 0) return d;
    if (a.source === "'self'") return -1;
    if (b.source === "'self'") return 1;
    return a.source.localeCompare(b.source);
  });
  return { selfOrigin, evidence, inline, ignored, navigations, totalRecords: records.length };
}

export interface PolicyOptions {
  mode: "report-only" | "enforce";
  frameAncestors: "'self'" | "'none'";
  upgradeInsecureRequests: boolean;
  includeInlineHashes: boolean;
  reportEndpoint: string;
}

export const DEFAULT_OPTIONS: PolicyOptions = {
  mode: "report-only",
  frameAncestors: "'self'",
  upgradeInsecureRequests: false,
  includeInlineHashes: true,
  reportEndpoint: "",
};

export function validReportEndpoint(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

/** Ordered list of [directive, sources[]] for the selected evidence. */
export function buildDirectives(
  analysis: Analysis,
  selected: Set<string>,
  opts: PolicyOptions,
): Array<[string, string[]]> {
  const groups = new Map<string, string[]>();
  for (const ev of analysis.evidence) {
    if (!selected.has(evidenceKey(ev))) continue;
    const list = groups.get(ev.directive) ?? [];
    if (!list.includes(ev.source)) list.push(ev.source);
    groups.set(ev.directive, list);
  }
  if (opts.includeInlineHashes) {
    if (analysis.inline.scriptHashes.length) {
      groups.set("script-src", [...(groups.get("script-src") ?? ["'self'"]), ...analysis.inline.scriptHashes]);
    }
    if (analysis.inline.styleHashes.length) {
      groups.set("style-src", [...(groups.get("style-src") ?? ["'self'"]), ...analysis.inline.styleHashes]);
    }
  }

  const out: Array<[string, string[]]> = [["default-src", ["'self'"]]];
  for (const d of DIRECTIVE_ORDER) {
    if (d === "form-action" || d === "object-src") continue;
    const list = groups.get(d);
    if (!list || list.length === 0) continue;
    // A directive that only allows 'self' is already covered by default-src 'self'.
    if (list.length === 1 && list[0] === "'self'") continue;
    out.push([d, list]);
  }
  out.push(["object-src", groups.get("object-src") ?? ["'none'"]]);
  out.push(["base-uri", ["'self'"]]);
  const formTargets = groups.get("form-action") ?? [];
  out.push(["form-action", ["'self'", ...formTargets.filter((s) => s !== "'self'")]]);
  out.push(["frame-ancestors", [opts.frameAncestors]]);
  if (opts.upgradeInsecureRequests) out.push(["upgrade-insecure-requests", []]);
  const endpoint = opts.reportEndpoint.trim();
  if (endpoint && validReportEndpoint(endpoint)) out.push(["report-uri", [endpoint]]);
  return out;
}

export function evidenceKey(ev: Pick<SourceEvidence, "directive" | "source">): string {
  return `${ev.directive} ${ev.source}`;
}

export function serialisePolicy(directives: Array<[string, string[]]>): string {
  return directives.map(([d, s]) => (s.length ? `${d} ${s.join(" ")}` : d)).join("; ");
}
