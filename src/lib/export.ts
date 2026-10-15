import { serialisePolicy } from "./csp";

export type ExportFormat = "header" | "nginx" | "apache" | "vercel" | "netlify" | "meta";

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  header: "HTTP header",
  nginx: "Nginx",
  apache: "Apache",
  vercel: "vercel.json",
  netlify: "Netlify _headers",
  meta: "HTML <meta>",
};

/** Directives a <meta http-equiv> policy cannot carry (per the CSP spec). */
const META_UNSUPPORTED = new Set(["frame-ancestors", "report-uri", "report-to", "sandbox"]);

export interface ExportResult {
  text: string;
  filename: string;
  notes: string[];
}

export function exportPolicy(
  directives: Array<[string, string[]]>,
  mode: "report-only" | "enforce",
  format: ExportFormat,
): ExportResult {
  const headerName = mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
  const policy = serialisePolicy(directives);
  const notes: string[] = [];
  switch (format) {
    case "header":
      return { text: `${headerName}: ${policy}`, filename: "csp-header.txt", notes };
    case "nginx":
      return {
        text: `add_header ${headerName} "${policy.replace(/"/g, '\\"')}" always;`,
        filename: "csp-nginx.conf",
        notes,
      };
    case "apache":
      return {
        text: `Header always set ${headerName} "${policy.replace(/"/g, '\\"')}"`,
        filename: "csp-apache.conf",
        notes,
      };
    case "vercel":
      return {
        text: JSON.stringify(
          { headers: [{ source: "/(.*)", headers: [{ key: headerName, value: policy }] }] },
          null,
          2,
        ),
        filename: "vercel.json",
        notes: ["Merge the headers entry into your existing vercel.json rather than replacing the file."],
      };
    case "netlify":
      return { text: `/*\n  ${headerName}: ${policy}`, filename: "_headers", notes };
    case "meta": {
      const kept = directives.filter(([d]) => !META_UNSUPPORTED.has(d));
      const dropped = directives.filter(([d]) => META_UNSUPPORTED.has(d)).map(([d]) => d);
      if (mode === "report-only") {
        notes.push("Browsers ignore report-only policies delivered in <meta>. This snippet enforces the policy; test with the header first.");
      }
      if (dropped.length) notes.push(`Removed ${dropped.join(", ")}: browsers ignore these in <meta>. Send them as a header.`);
      const content = serialisePolicy(kept).replace(/"/g, "&quot;");
      return {
        text: `<meta http-equiv="Content-Security-Policy" content="${content}">`,
        filename: "csp-meta.html",
        notes,
      };
    }
  }
}
