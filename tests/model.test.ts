import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyse, buildDirectives, DEFAULT_OPTIONS, evidenceKey } from "../src/lib/csp";
import { parseHar } from "../src/lib/har";
import { carryExclusions, exclusionEffect, placementOf, recordsBySource, roleOf } from "../src/ui/model";

const sample = parseHar(readFileSync(new URL("./fixtures/sample.har", import.meta.url), "utf8")).records;

describe("UI model (explains the policy without changing it)", async () => {
  const a = await analyse(sample);
  const all = new Set(a.evidence.map(evidenceKey));

  it("maps every evidence row back to the recorded requests that produced it", () => {
    const by = recordsBySource(sample, a.selfOrigin);
    for (const ev of a.evidence) expect(by.get(evidenceKey(ev))?.length).toBe(ev.count);
  });

  it("labels pages and ignored requests", () => {
    expect(roleOf(sample[0]!, a.selfOrigin).kind).toBe("page");
    const ext = sample.find((r) => r.url.startsWith("chrome-extension:"))!;
    expect(roleOf(ext, a.selfOrigin)).toEqual({ kind: "ignored", reason: "browser extension" });
  });

  it("reports where a source lands in the policy", () => {
    const d = buildDirectives(a, all, DEFAULT_OPTIONS);
    expect(placementOf({ directive: "script-src", source: "https://js.stripe.com" }, d, all)).toBe("listed");
    // font-src has no 'self' row; style-src 'self' is listed because other style sources exist.
    expect(placementOf({ directive: "style-src", source: "'self'" }, d, all)).toBe("listed");
    const without = new Set(all);
    without.delete("script-src https://js.stripe.com");
    const d2 = buildDirectives(a, without, DEFAULT_OPTIONS);
    expect(placementOf({ directive: "script-src", source: "https://js.stripe.com" }, d2, without)).toBe("excluded");
    expect(placementOf({ directive: "form-action", source: "'self'" }, d2, without)).toBe("always");
  });

  it("describes exclusion differently for report-only and enforce", () => {
    const ev = { directive: "frame-src" as const, source: "https://www.youtube-nocookie.com", count: 1 };
    expect(exclusionEffect(ev, "report-only")).toMatch(/still load/);
    expect(exclusionEffect(ev, "enforce")).toMatch(/blocks this request: the embedded frame stays empty/);
  });

  it("keeps the user's exclusions when the recording is re-analysed", async () => {
    const sel = new Set(all);
    sel.delete("img-src http://legacy-cdn.example.org");
    const next = await analyse(sample, "https://shop.example.com");
    const carried = carryExclusions(a, sel, next);
    expect(carried.has("img-src http://legacy-cdn.example.org")).toBe(false);
    expect(carried.has("script-src https://js.stripe.com")).toBe(true);
    expect(carried.size).toBe(next.evidence.length - 1);
  });
});
