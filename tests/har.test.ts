import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HarError, parseHar } from "../src/lib/har";

const sample = readFileSync(new URL("./fixtures/sample.har", import.meta.url), "utf8");
const real = readFileSync(new URL("./fixtures/clydralab-home.har", import.meta.url), "utf8");

describe("parseHar", () => {
  it("reads every entry of the synthetic sample", () => {
    const p = parseHar(sample);
    expect(p.records).toHaveLength(21);
    expect(p.pageTitles[0]).toContain("synthetic");
    expect(p.records[0]!.htmlBody).toContain("<title>Example Shop</title>");
  });

  it("reads a real Playwright/Chromium HAR of clydralab.com", () => {
    const p = parseHar(real);
    expect(p.records.length).toBe(50);
    expect(p.creator).toMatch(/Playwright/);
    expect(p.records.every((r) => r.fetchDest !== null)).toBe(true);
  });

  it("never copies cookies or authorization headers out of the HAR", () => {
    const p = parseHar(sample);
    const dump = JSON.stringify(p);
    expect(dump).not.toContain("SYNTHETIC-SECRET-COOKIE");
    expect(dump).not.toContain("SYNTHETIC-SECRET-TOKEN");
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["not json", "not_json"],
    ['{"hello":1}', "not_har"],
    ['{"log":{"entries":[]}}', "empty"],
    ['{"log":{"entries":[{"foo":1}]}}', "not_har"],
  ])("rejects %j with %s", (text, code) => {
    try {
      parseHar(text);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(HarError);
      expect((e as HarError).code).toBe(code);
    }
  });

  it("decodes base64 HTML bodies", () => {
    const html = "<html><script>alert(1)</script></html>";
    const har = { log: { entries: [{ request: { url: "https://a.example/", method: "GET", headers: [] }, response: { status: 200, content: { mimeType: "text/html; charset=utf-8", text: Buffer.from(html).toString("base64"), encoding: "base64" } } }] } };
    expect(parseHar(JSON.stringify(har)).records[0]!.htmlBody).toBe(html);
  });
});
