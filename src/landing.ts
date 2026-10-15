import "./styles/base.css";
import "./styles/landing.css";
import { parseHar } from "./lib/har";
import { analyse, buildDirectives, DEFAULT_OPTIONS, evidenceKey, type Analysis } from "./lib/csp";
import { exportPolicy } from "./lib/export";
import { escapeHtml, roleOf, shortUrl } from "./ui/model";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- mobile navigation ----------
const toggle = $<HTMLButtonElement>("nav-toggle");
const links = $<HTMLElement>("nav-links");
toggle.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  links.classList.toggle("is-open", open);
});
links.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a")) {
    toggle.setAttribute("aria-expanded", "false");
    links.classList.remove("is-open");
  }
});

// ---------- live sample: the hero trace and the annotated policy are real builder output ----------
const DEFAULT_TRACE = "script-src https://js.stripe.com";

function tokenKey(directive: string, token: string): string {
  if (token.startsWith("'sha256-")) return "hash";
  if (directive === "default-src") return "default";
  return `${directive} ${token}`;
}

function renderTrace(a: Analysis, records: ReturnType<typeof parseHar>["records"], directives: Array<[string, string[]]>) {
  const self = a.selfOrigin;
  $<HTMLOListElement>("req-list").innerHTML = records
    .map((r, i) => {
      const role = roleOf(r, self);
      const tag = role.kind === "source" ? "" : role.kind === "page" ? "page" : "ignored";
      const key = role.kind === "source" ? role.key : "";
      const note = role.kind === "ignored" ? ` <span class="req-why">${escapeHtml(role.reason)}</span>` : role.kind === "page" ? ` <span class="req-why">the page itself</span>` : "";
      return `<li class="req${tag ? " req-" + tag : ""}" id="req-${i}" data-key="${escapeHtml(key)}"><span class="req-m">${escapeHtml(r.method)}</span><code>${escapeHtml(shortUrl(r.url, 46))}</code>${note}</li>`;
    })
    .join("");
  $<HTMLUListElement>("src-list").innerHTML = a.evidence
    .map((ev) => {
      const key = evidenceKey(ev);
      const risk = ev.risks.some((r) => r.level === "high") ? "high" : ev.risks.length ? "medium" : "";
      const label = `${ev.directive} ${ev.source}, ${ev.count} request${ev.count === 1 ? "" : "s"}${risk === "high" ? ", high risk" : risk ? ", needs review" : ""}`;
      return `<li><button type="button" class="src${risk ? " src-" + risk : ""}" data-key="${escapeHtml(key)}" aria-label="${escapeHtml(label)}"><span class="src-dir">${ev.directive}</span><code>${escapeHtml(ev.source)}</code>${risk ? `<span class="src-flag">${risk === "high" ? "risk" : "review"}</span>` : ""}</button></li>`;
    })
    .join("");
  $<HTMLOListElement>("pol-list").innerHTML = directives
    .map(
      ([d, s]) =>
        `<li data-dir="${escapeHtml(d)}"><code class="pd">${escapeHtml(d)}</code> ${s
          .map((t) => `<span class="pt${t.startsWith("'sha256-") ? " pt-hash" : ""}" data-key="${escapeHtml(tokenKey(d, t))}">${escapeHtml(t.startsWith("'sha256-") ? t.slice(0, 14) + "…'" : t)}</span>`)
          .join(" ")}</li>`,
    )
    .join("");
  $<HTMLSpanElement>("count-req").textContent = String(records.length);
  $<HTMLSpanElement>("count-src").textContent = String(a.evidence.length);
  $<HTMLSpanElement>("count-pol").textContent = `${directives.length} directives`;
  $<HTMLElement>("trace").setAttribute("aria-busy", "false");
}

const traceEl = () => $<HTMLDivElement>("trace");
let activeKey = DEFAULT_TRACE;

function drawLinks() {
  const svg = document.getElementById("trace-links") as unknown as SVGSVGElement;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const grid = traceEl();
  if (window.matchMedia("(max-width: 900px)").matches) return;
  const box = grid.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  svg.setAttribute("width", String(box.width));
  svg.setAttribute("height", String(box.height));
  const src = grid.querySelector<HTMLElement>(`.src[data-key="${CSS.escape(activeKey)}"]`);
  if (!src) return;
  const s = src.getBoundingClientRect();
  const ns = "http://www.w3.org/2000/svg";
  const path = (x1: number, y1: number, x2: number, y2: number) => {
    const p = document.createElementNS(ns, "path");
    const mx = (x1 + x2) / 2;
    p.setAttribute("d", `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    p.setAttribute("class", "link");
    svg.appendChild(p);
  };
  grid.querySelectorAll<HTMLElement>(`.req[data-key="${CSS.escape(activeKey)}"]`).forEach((r) => {
    const b = r.getBoundingClientRect();
    path(b.right - box.left + 4, b.top + b.height / 2 - box.top, s.left - box.left - 4, s.top + s.height / 2 - box.top);
  });
  grid.querySelectorAll<HTMLElement>(`.pt[data-key="${CSS.escape(activeKey)}"]`).forEach((t) => {
    const b = t.getBoundingClientRect();
    path(s.right - box.left + 4, s.top + s.height / 2 - box.top, b.left - box.left - 4, b.top + b.height / 2 - box.top);
  });
}

function trace(key: string) {
  activeKey = key;
  const grid = traceEl();
  grid.querySelectorAll(".is-on").forEach((el) => el.classList.remove("is-on"));
  const sel = CSS.escape(key);
  grid.querySelectorAll(`[data-key="${sel}"]`).forEach((el) => el.classList.add("is-on"));
  grid.querySelectorAll(`.pol-list li`).forEach((li) => {
    if (li.querySelector(`[data-key="${sel}"]`)) li.classList.add("is-on");
  });
  grid.querySelector(`.src[data-key="${sel}"]`)?.setAttribute("aria-pressed", "true");
  grid.querySelectorAll<HTMLElement>(`.src:not([data-key="${sel}"])`).forEach((b) => b.setAttribute("aria-pressed", "false"));
  drawLinks();
  const reqs = grid.querySelectorAll(`.req[data-key="${sel}"]`).length;
  const [dir, ...rest] = key.split(" ");
  const src = rest.join(" ");
  const listed = grid.querySelectorAll(`.pt[data-key="${sel}"]`).length > 0;
  const foot = `${reqs} recorded request${reqs === 1 ? "" : "s"} → ${src} → ${listed ? `listed in ${dir}` : src === "'self'" ? `allowed through default-src 'self'` : "not in the policy"}.`;
  $<HTMLParagraphElement>("trace-foot").textContent = foot;
}

function renderAnnotated(a: Analysis, header: string) {
  const pre = $<HTMLPreElement>("sample-policy");
  const [name, policy] = [header.slice(0, header.indexOf(": ")), header.slice(header.indexOf(": ") + 2)];
  const hash = a.inline.scriptHashes[0];
  const shared = a.evidence.find((e) => e.risks.some((r) => r.code === "shared-host"));
  const insecure = a.evidence.find((e) => e.risks.some((r) => r.code === "insecure-scheme"));
  const marks: Array<[string, string]> = [];
  if (hash) marks.push([hash, "A"]);
  if (shared) marks.push([shared.source, "B"]);
  if (insecure) marks.push([insecure.source, "C"]);
  const lines = policy.split("; ").map((d) => {
    let html = escapeHtml(d);
    const sp = html.indexOf(" ");
    html = sp > 0 ? `<span class="pd">${html.slice(0, sp)}</span>${html.slice(sp)}` : `<span class="pd">${html}</span>`;
    for (const [tok, m] of marks) {
      const t = escapeHtml(tok);
      if (html.includes(t)) html = html.replace(t, `<mark data-m="${m}">${t}<sup>${m}</sup></mark>`);
    }
    return html;
  });
  pre.innerHTML = `<span class="ph">${escapeHtml(name)}:</span>\n  ${lines.join(";\n  ")}`;
  const items: string[] = [];
  if (hash)
    items.push(`<li data-m="A"><h3>Inline scripts are hashed, not trusted wholesale</h3><p>The recorded page had an inline script. Its SHA-256 hash is allowed, so the policy needs no <code>'unsafe-inline'</code>. If that script changes, the hash must change too.</p></li>`);
  if (shared)
    items.push(`<li data-m="B"><h3><code>${escapeHtml(shared.source)}</code> is flagged for review</h3><p>Anyone can publish scripts on this public CDN, so allowing the whole host is weak. In the builder you can exclude it and self-host the file instead.</p></li>`);
  if (insecure)
    items.push(`<li data-m="C"><h3><code>${escapeHtml(insecure.source)}</code> is high risk</h3><p>The image was loaded over plain HTTP. The builder keeps it so nothing breaks unannounced, and marks it so you move it to HTTPS or drop it.</p></li>`);
  items.push(`<li data-m="✓"><h3>It starts as Report-Only</h3><p>The header name is <code>${escapeHtml(name)}</code>: browsers report violations without blocking. Switch to Enforce in the builder once reports are quiet.</p></li>`);
  $<HTMLOListElement>("callouts").innerHTML = items.join("");
}

async function boot() {
  try {
    const res = await fetch("/sample.har");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { records } = parseHar(await res.text());
    const a = await analyse(records);
    const selected = new Set(a.evidence.map(evidenceKey));
    const directives = buildDirectives(a, selected, DEFAULT_OPTIONS);
    renderTrace(a, records, directives);
    trace(a.evidence.some((e) => evidenceKey(e) === DEFAULT_TRACE) ? DEFAULT_TRACE : evidenceKey(a.evidence[0]!));
    renderAnnotated(a, exportPolicy(directives, "report-only", "header").text);

    const grid = traceEl();
    grid.addEventListener("mouseover", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(".src, .req[data-key]:not([data-key='']), .pt");
      const k = el?.dataset.key;
      if (k && k !== "hash" && k !== "default" && k !== activeKey) trace(k);
    });
    grid.addEventListener("focusin", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(".src");
      if (el?.dataset.key) trace(el.dataset.key);
    });
    grid.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(".src");
      if (el?.dataset.key) trace(el.dataset.key);
    });
    let raf = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(drawLinks);
    });
  } catch (e) {
    $<HTMLOListElement>("req-list").innerHTML = `<li class="loading-row">The sample preview couldn't load. <a href="/tool.html#sample">Open it in the builder</a>.</li>`;
    $<HTMLPreElement>("sample-policy").textContent = "The sample policy couldn't be generated here. Open the builder to load it.";
    console.error(e);
  }
}
void boot();
