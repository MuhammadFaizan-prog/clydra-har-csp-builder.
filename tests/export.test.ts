import { describe, expect, it } from "vitest";
import { exportPolicy } from "../src/lib/export";

const d: Array<[string, string[]]> = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", "https://js.stripe.com"]],
  ["frame-ancestors", ["'self'"]],
  ["report-uri", ["https://r.example/csp"]],
  ["upgrade-insecure-requests", []],
];

describe("exportPolicy", () => {
  it("uses the Report-Only header name in report-only mode", () => {
    expect(exportPolicy(d, "report-only", "header").text).toBe(
      "Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://js.stripe.com; frame-ancestors 'self'; report-uri https://r.example/csp; upgrade-insecure-requests",
    );
  });
  it("formats for nginx and apache", () => {
    expect(exportPolicy(d, "enforce", "nginx").text).toMatch(/^add_header Content-Security-Policy ".*" always;$/);
    expect(exportPolicy(d, "enforce", "apache").text).toMatch(/^Header always set Content-Security-Policy ".*"$/);
  });
  it("produces valid vercel.json", () => {
    const parsed = JSON.parse(exportPolicy(d, "enforce", "vercel").text);
    expect(parsed.headers[0].headers[0].key).toBe("Content-Security-Policy");
  });
  it("strips meta-incompatible directives and explains why", () => {
    const r = exportPolicy(d, "report-only", "meta");
    expect(r.text).not.toContain("frame-ancestors");
    expect(r.text).not.toContain("report-uri");
    expect(r.text).toContain("upgrade-insecure-requests");
    expect(r.notes.join(" ")).toMatch(/report-only/i);
    expect(r.notes.join(" ")).toMatch(/frame-ancestors/);
  });
});
