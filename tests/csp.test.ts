import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyse, buildDirectives, DEFAULT_OPTIONS, evidenceKey, normaliseOrigin, scanInline, serialisePolicy, sourceExpression, validReportEndpoint } from "../src/lib/csp";
import { parseHar } from "../src/lib/har";

const sample = parseHar(readFileSync(new URL("./fixtures/sample.har", import.meta.url), "utf8")).records;
const real = parseHar(readFileSync(new URL("./fixtures/clydralab-home.har", import.meta.url), "utf8")).records;
const allSelected = (a: Awaited<ReturnType<typeof analyse>>) => new Set(a.evidence.map(evidenceKey));
const directivesMap = (d: Array<[string, string[]]>) => Object.fromEntries(d);

describe("sourceExpression", () => {
  it("maps URLs to narrow sources", () => {
    expect(sourceExpression("https://shop.example.com/a.js", "https://shop.example.com")).toBe("'self'");
    expect(sourceExpression("https://cdn.example.net:8443/a.js?x=1", "https://shop.example.com")).toBe("https://cdn.example.net:8443");
    expect(sourceExpression("data:image/png;base64,AA", null)).toBe("data:");
    expect(sourceExpression("blob:https://x.example/uuid", null)).toBe("blob:");
    expect(sourceExpression("nope", null)).toBeNull();
  });
});

describe("analyse (synthetic shop)", async () => {
  const a = await analyse(sample);
  const p = directivesMap(buildDirectives(a, allSelected(a), DEFAULT_OPTIONS));

  it("detects the site's origin from the first page", () => {
    expect(a.selfOrigin).toBe("https://shop.example.com");
  });
  it("builds script-src from observed scripts plus the inline hash", () => {
    const inline = "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());";
    const expected = `'sha256-${createHash("sha256").update(inline).digest("base64")}'`;
    expect(p["script-src"]).toEqual(["'self'", "https://cdn.jsdelivr.net", "https://js.stripe.com", "https://www.googletagmanager.com", expected]);
  });
  it("does not hash JSON-LD (it never executes)", () => {
    expect(a.inline.scriptHashes).toHaveLength(1);
  });
  it("covers fonts, frames, images, connections and form targets", () => {
    expect(p["font-src"]).toEqual(["https://fonts.gstatic.com"]);
    expect(p["frame-src"]).toEqual(["https://js.stripe.com", "https://www.youtube-nocookie.com"]);
    expect(p["img-src"]).toEqual(["'self'", "data:", "http://legacy-cdn.example.org", "https://i.ytimg.com"]);
    expect(p["connect-src"]).toEqual(["'self'", "https://api.stripe.com", "https://region1.google-analytics.com", "wss://live.example.com"]);
    expect(p["form-action"]).toEqual(["'self'", "https://pay.example.net"]);
    expect(p["object-src"]).toEqual(["'none'"]);
    expect(p["frame-ancestors"]).toEqual(["'self'"]);
    expect(p["default-src"]).toEqual(["'self'"]);
  });
  it("never adds unsafe-inline or unsafe-eval", () => {
    expect(serialisePolicy(buildDirectives(a, allSelected(a), DEFAULT_OPTIONS))).not.toMatch(/unsafe-(inline|eval)/);
  });
  it("ignores the extension request and the preflight", () => {
    expect(a.ignored.extension).toBe(1);
    expect(a.ignored.preflight).toBe(1);
  });
  it("flags the insecure image host and the shared script CDN", () => {
    const http = a.evidence.find((e) => e.source === "http://legacy-cdn.example.org")!;
    expect(http.risks.map((r) => r.code)).toContain("insecure-scheme");
    const jsd = a.evidence.find((e) => e.source === "https://cdn.jsdelivr.net")!;
    expect(jsd.risks.map((r) => r.code)).toContain("shared-host");
  });
  it("counts inline handlers and style attributes", () => {
    expect(a.inline.inlineEventHandlers).toBe(1);
    expect(a.inline.styleAttributes).toBe(1);
    expect(a.inline.styleHashes).toHaveLength(1);
  });
  it("drops a source when the user unticks it", () => {
    const sel = allSelected(a);
    sel.delete("script-src https://cdn.jsdelivr.net");
    const d = directivesMap(buildDirectives(a, sel, DEFAULT_OPTIONS));
    expect(d["script-src"]).not.toContain("https://cdn.jsdelivr.net");
  });
  it("applies options", () => {
    const d = directivesMap(buildDirectives(a, allSelected(a), { ...DEFAULT_OPTIONS, frameAncestors: "'none'", upgradeInsecureRequests: true, includeInlineHashes: false, reportEndpoint: "https://r.example/csp" }));
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["upgrade-insecure-requests"]).toEqual([]);
    expect(d["report-uri"]).toEqual(["https://r.example/csp"]);
    expect(d["script-src"]!.some((s) => s.startsWith("'sha256-"))).toBe(false);
  });
  it("leaves out an invalid report endpoint", () => {
    const d = directivesMap(buildDirectives(a, allSelected(a), { ...DEFAULT_OPTIONS, reportEndpoint: "javascript:alert(1)" }));
    expect(d["report-uri"]).toBeUndefined();
  });
});

describe("analyse (real clydralab.com HAR)", async () => {
  const a = await analyse(real);
  const p = directivesMap(buildDirectives(a, allSelected(a), DEFAULT_OPTIONS));
  it("finds the Framer image CDN and keeps first-party assets as 'self'", () => {
    expect(a.selfOrigin).toBe("https://www.clydralab.com");
    expect(p["img-src"]).toEqual(["'self'", "https://framerusercontent.com"]);
    expect(p["script-src"]).toBeUndefined(); // only 'self', covered by default-src
    expect(a.inline.documentsWithoutBody).toBe(1); // recorded without content
  });
});

describe("helpers", () => {
  it("normalises origins", () => {
    expect(normaliseOrigin("example.com")).toBe("https://example.com");
    expect(normaliseOrigin("http://localhost:5173/path")).toBe("http://localhost:5173");
    expect(normaliseOrigin("ftp://x.example")).toBeNull();
    expect(normaliseOrigin("nodot")).toBeNull();
    expect(normaliseOrigin("")).toBeNull();
  });
  it("validates report endpoints", () => {
    expect(validReportEndpoint("")).toBe(true);
    expect(validReportEndpoint("https://r.example/x")).toBe(true);
    expect(validReportEndpoint("http://evil.example/x")).toBe(false);
    expect(validReportEndpoint("http://localhost:8080/r")).toBe(true);
  });
  it("ignores code inside scripts when counting handlers", async () => {
    const r = await scanInline(`<script>var s='<div onclick=x style=y>'</script><p>hi</p>`);
    expect(r.inlineEventHandlers).toBe(0);
    expect(r.styleAttributes).toBe(0);
    expect(r.scriptHashes).toHaveLength(1);
  });
});
