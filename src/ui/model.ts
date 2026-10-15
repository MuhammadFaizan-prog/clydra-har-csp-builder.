/**
 * View-model helpers shared by the landing preview and the workspace.
 * Pure functions over the existing lib/ output: they never change how a policy
 * is built, they only explain it (which request produced which source, what a
 * source does in the final policy, what excluding it would mean).
 */
import type { HarRecord } from "../lib/har";
import { classify, type Directive } from "../lib/classify";
import { evidenceKey, sourceExpression, type Analysis, type SourceEvidence } from "../lib/csp";

export interface DirectiveInfo {
  /** Plain-language name of what the directive governs. */
  governs: string;
  /** What breaks for a request of this kind when its source is not allowed. */
  blocked: string;
}

export const DIRECTIVE_INFO: Record<Directive, DirectiveInfo> = {
  "script-src": { governs: "JavaScript files", blocked: "the script will not run" },
  "style-src": { governs: "stylesheets", blocked: "the stylesheet will not apply" },
  "img-src": { governs: "images", blocked: "the image will not display" },
  "font-src": { governs: "web fonts", blocked: "the browser falls back to another font" },
  "connect-src": { governs: "fetch, XHR and WebSocket calls", blocked: "the call fails in your JavaScript" },
  "media-src": { governs: "audio and video", blocked: "the media will not play" },
  "frame-src": { governs: "embedded frames", blocked: "the embedded frame stays empty" },
  "worker-src": { governs: "web and service workers", blocked: "the worker will not start" },
  "manifest-src": { governs: "the web app manifest", blocked: "the manifest is ignored" },
  "object-src": { governs: "plugin content (object, embed)", blocked: "the plugin content will not load" },
  "form-action": { governs: "form submission targets", blocked: "the form submission is stopped" },
};

/** Role of one HAR record in the analysis. */
export type RecordRole =
  | { kind: "source"; key: string; directive: Directive; source: string }
  | { kind: "page" }
  | { kind: "ignored"; reason: string };

export function roleOf(record: HarRecord, selfOrigin: string | null): RecordRole {
  const c = classify(record);
  if (c.kind === "navigation") return { kind: "page" };
  if (c.kind === "ignored") {
    const reason = c.reason === "extension" ? "browser extension" : c.reason === "preflight" ? "CORS preflight" : "unsupported scheme";
    return { kind: "ignored", reason };
  }
  const source = sourceExpression(record.url, selfOrigin);
  if (!source) return { kind: "ignored", reason: "unsupported scheme" };
  return { kind: "source", key: `${c.directive} ${source}`, directive: c.directive, source };
}

/** Records grouped by the evidence key they produced. */
export function recordsBySource(records: HarRecord[], selfOrigin: string | null): Map<string, HarRecord[]> {
  const map = new Map<string, HarRecord[]>();
  for (const r of records) {
    const role = roleOf(r, selfOrigin);
    if (role.kind !== "source") continue;
    const list = map.get(role.key) ?? [];
    list.push(r);
    map.set(role.key, list);
  }
  return map;
}

/** Short display form of a request URL: host + path, query removed, data: truncated. */
export function shortUrl(raw: string, max = 64): string {
  let out = raw;
  try {
    const u = new URL(raw);
    if (u.protocol === "data:") out = raw.slice(0, 28) + "…";
    else out = `${u.host}${u.pathname}`;
  } catch {
    /* keep raw */
  }
  return out.length > max ? out.slice(0, max - 1) + "…" : out;
}

export type PolicyPlacement = "listed" | "default" | "excluded" | "always";

/**
 * Where a source ends up in the final directive list. 'self' sources whose
 * directive is omitted are still allowed through default-src 'self'.
 */
export function placementOf(
  ev: Pick<SourceEvidence, "directive" | "source">,
  directives: Array<[string, string[]]>,
  selected: Set<string>,
): PolicyPlacement {
  if (ev.directive === "form-action" && ev.source === "'self'") return "always";
  const line = directives.find(([d]) => d === ev.directive);
  const listed = !!line && line[1].includes(ev.source);
  if (!selected.has(evidenceKey(ev))) {
    // Excluded 'self' in a directive that is omitted is still covered by default-src.
    if (ev.source === "'self'" && !line) return "default";
    return "excluded";
  }
  if (listed) return "listed";
  if (ev.source === "'self'") return "default";
  return "excluded";
}

/** Plain-language consequence of excluding a source, given the current mode. */
export function exclusionEffect(
  ev: Pick<SourceEvidence, "directive" | "source" | "count">,
  mode: "report-only" | "enforce",
): string {
  const info = DIRECTIVE_INFO[ev.directive];
  const n = ev.count === 1 ? "this request" : `these ${ev.count} requests`;
  if (ev.directive === "form-action" && ev.source === "'self'") {
    return "Your own origin is always kept in form-action, so excluding it has no effect.";
  }
  if (ev.source === "'self'") {
    return `Your own origin stays allowed through default-src 'self' unless ${ev.directive} lists other sources. If it does, ${n} from your origin would be ${mode === "enforce" ? "blocked" : "reported"}.`;
  }
  if (mode === "report-only") {
    return `In Report-Only mode ${n} would still load, but each one is reported as a violation. After you enforce, ${info.blocked}.`;
  }
  return `With the policy enforced, the browser blocks ${n}: ${info.blocked}.`;
}

/** One sentence on why the source is in the table. */
export function inclusionReason(ev: Pick<SourceEvidence, "directive" | "source" | "count">): string {
  const info = DIRECTIVE_INFO[ev.directive];
  const times = ev.count === 1 ? "1 request" : `${ev.count} requests`;
  const what = ev.source === "'self'" ? "your own origin" : ev.source === "data:" ? "inline data: URLs" : ev.source === "blob:" ? "blob: URLs created by page script" : ev.source;
  return `The recording has ${times} for ${info.governs} from ${what}, so ${ev.directive} needs this source for those requests to keep working.`;
}

/**
 * Keys the user excluded under the previous analysis that still exist in the new one.
 * Used to keep review decisions when the origin is changed and the recording is re-analysed.
 */
export function carryExclusions(prev: Analysis | null, prevSelected: Set<string>, next: Analysis): Set<string> {
  const excluded = new Set<string>();
  if (prev) for (const ev of prev.evidence) if (!prevSelected.has(evidenceKey(ev))) excluded.add(evidenceKey(ev));
  return new Set(next.evidence.map(evidenceKey).filter((k) => !excluded.has(k)));
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
