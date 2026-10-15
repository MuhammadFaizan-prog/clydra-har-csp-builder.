import { describe, expect, it } from "vitest";
import { classify } from "../src/lib/classify";
import type { HarRecord } from "../src/lib/har";

const rec = (over: Partial<HarRecord>): HarRecord => ({ url: "https://a.example/x", method: "GET", status: 200, fetchDest: null, resourceType: null, mimeType: "", htmlBody: null, fileIndex: 0, ...over });

describe("classify", () => {
  it("prefers Sec-Fetch-Dest over other hints", () => {
    expect(classify(rec({ fetchDest: "iframe", resourceType: "document", mimeType: "text/html" }))).toEqual({ kind: "directive", directive: "frame-src" });
    expect(classify(rec({ fetchDest: "empty", resourceType: "fetch" }))).toEqual({ kind: "directive", directive: "connect-src" });
  });
  it("falls back to _resourceType, then MIME, then extension", () => {
    expect(classify(rec({ resourceType: "stylesheet" }))).toEqual({ kind: "directive", directive: "style-src" });
    expect(classify(rec({ mimeType: "font/woff2" }))).toEqual({ kind: "directive", directive: "font-src" });
    expect(classify(rec({ url: "https://a.example/app.mjs" }))).toEqual({ kind: "directive", directive: "script-src" });
    expect(classify(rec({ url: "https://a.example/api" }))).toEqual({ kind: "directive", directive: "connect-src" });
  });
  it("treats top-level GET documents as navigations and POST documents as form targets", () => {
    expect(classify(rec({ fetchDest: "document" }))).toEqual({ kind: "navigation" });
    expect(classify(rec({ fetchDest: "document", method: "POST" }))).toEqual({ kind: "directive", directive: "form-action" });
  });
  it("ignores extension traffic, preflights and odd schemes", () => {
    expect(classify(rec({ url: "chrome-extension://abc/x.js" }))).toMatchObject({ kind: "ignored", reason: "extension" });
    expect(classify(rec({ method: "OPTIONS" }))).toMatchObject({ kind: "ignored", reason: "preflight" });
    expect(classify(rec({ url: "about:blank" }))).toMatchObject({ kind: "ignored", reason: "unsupported-scheme" });
    expect(classify(rec({ url: "::not a url" }))).toMatchObject({ kind: "ignored" });
  });
  it("puts websockets in connect-src", () => {
    expect(classify(rec({ url: "wss://live.example/socket" }))).toEqual({ kind: "directive", directive: "connect-src" });
  });
});
