import "./styles/base.css";
import "./styles/tool.css";
import { HarError, MAX_HAR_BYTES, parseHar, type HarRecord } from "./lib/har";
import {
  analyse,
  buildDirectives,
  DEFAULT_OPTIONS,
  DIRECTIVE_ORDER,
  evidenceKey,
  normaliseOrigin,
  validReportEndpoint,
  type Analysis,
  type PolicyOptions,
  type SourceEvidence,
} from "./lib/csp";
import { exportPolicy, FORMAT_LABELS, type ExportFormat } from "./lib/export";
import type { Directive } from "./lib/classify";
import {
  carryExclusions,
  DIRECTIVE_INFO,
  escapeHtml,
  exclusionEffect,
  inclusionReason,
  placementOf,
  recordsBySource,
  shortUrl,
  type PolicyPlacement,
} from "./ui/model";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type Filter = "all" | "review" | Directive;

// All state lives in memory only. Nothing is written to storage.
const state: {
  records: HarRecord[];
  fileNames: string[];
  analysis: Analysis | null;
  selected: Set<string>;
  options: PolicyOptions;
  format: ExportFormat;
  filter: Filter;
  open: Set<string>;
  bySource: Map<string, HarRecord[]>;
  directives: Array<[string, string[]]>;
  pickMode: "replace" | "add";
} = {
  records: [],
  fileNames: [],
  analysis: null,
  selected: new Set(),
  options: { ...DEFAULT_OPTIONS },
  format: "header",
  filter: "all",
  open: new Set(),
  bySource: new Map(),
  directives: [],
  pickMode: "replace",
};

const drop = $<HTMLDivElement>("drop");
const fileInput = $<HTMLInputElement>("file");
const statusEl = $<HTMLDivElement>("status");
const errorEl = $<HTMLDivElement>("error");
const results = $<HTMLElement>("results");
const originInput = $<HTMLInputElement>("origin");

// ---------- stages ----------
const STAGES: Array<[string, string]> = [
  ["load", "Load recordings"],
  ["review", "Review sources"],
  ["inspect", "Inspect policy"],
  ["export", "Export"],
];
function renderStages() {
  const loaded = !!state.analysis;
  $<HTMLOListElement>("stages").innerHTML = STAGES.map(([id, label], i) => {
    const done = loaded && i === 0;
    const current = loaded ? i === 1 : i === 0;
    if (!loaded && i > 0) return `<li class="stage is-off"><span>${label}</span></li>`;
    return `<li class="stage${done ? " is-done" : ""}${current ? " is-current" : ""}"><a href="#${id}"${current ? ' aria-current="step"' : ""}>${label}</a></li>`;
  }).join("");
}

// ---------- errors ----------
function showError(msg: string | null) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg ?? "";
}
function setOriginError(msg: string | null) {
  let el = document.getElementById("origin-error");
  if (!msg) {
    el?.remove();
    originInput.removeAttribute("aria-invalid");
    originInput.setAttribute("aria-describedby", "origin-help");
    return;
  }
  if (!el) {
    el = document.createElement("p");
    el.id = "origin-error";
    el.className = "field-error";
    originInput.insertAdjacentElement("afterend", el);
  }
  el.textContent = msg;
  originInput.setAttribute("aria-invalid", "true");
  originInput.setAttribute("aria-describedby", "origin-error origin-help");
}

// ---------- loading ----------
async function loadFiles(files: File[]) {
  showError(null);
  if (files.length === 0) return;
  const mode = state.pickMode;
  state.pickMode = "replace";
  statusEl.textContent = `Reading ${files.length} file${files.length > 1 ? "s" : ""}…`;
  document.body.setAttribute("aria-busy", "true");
  const records: HarRecord[] = [];
  const names: string[] = [];
  const offset = mode === "add" ? state.fileNames.length : 0;
  try {
    for (const [i, f] of files.entries()) {
      if (f.size > MAX_HAR_BYTES) {
        throw new HarError("too_large", `${f.name} is ${(f.size / 1048576).toFixed(1)} MB. The limit is 40 MB per file; record a shorter session.`);
      }
      const text = await f.text();
      try {
        records.push(...parseHar(text, offset + i).records);
      } catch (e) {
        if (e instanceof HarError) throw new HarError(e.code, `${f.name}: ${e.message}`);
        throw e;
      }
      names.push(f.name);
    }
  } catch (e) {
    statusEl.textContent = state.analysis ? "Your current recording is unchanged." : "";
    showError(e instanceof HarError ? e.message : "Something went wrong while reading the file. Try exporting the HAR again.");
    if (!(e instanceof HarError)) console.error(e);
    document.body.removeAttribute("aria-busy");
    return;
  }
  if (mode === "add" && state.analysis) {
    await useRecords([...state.records, ...records], [...state.fileNames, ...names], true);
  } else {
    await useRecords(records, names, false);
  }
}

async function useRecords(records: HarRecord[], names: string[], keepDecisions: boolean) {
  const prev = state.analysis;
  const prevSelected = state.selected;
  state.records = records;
  state.fileNames = names;
  state.analysis = await analyse(records);
  state.selected = keepDecisions ? carryExclusions(prev, prevSelected, state.analysis) : new Set(state.analysis.evidence.map(evidenceKey));
  if (!keepDecisions) {
    state.open = new Set();
    state.filter = "all";
  }
  state.bySource = recordsBySource(records, state.analysis.selfOrigin);
  originInput.value = state.analysis.selfOrigin ?? "";
  setOriginError(
    state.analysis.selfOrigin ? null : "No top-level page was found in this recording. Type your site's origin so its requests become 'self'.",
  );
  statusEl.textContent = `Read ${records.length} requests from ${names.join(", ")}.`;
  document.body.removeAttribute("aria-busy");
  $<HTMLElement>("load-empty").hidden = true;
  $<HTMLElement>("recording").hidden = false;
  results.hidden = false;
  render();
  if (!state.analysis.selfOrigin) originInput.focus();
  else $<HTMLHeadingElement>("review-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearAll() {
  state.records = [];
  state.fileNames = [];
  state.analysis = null;
  state.selected = new Set();
  state.open = new Set();
  state.bySource = new Map();
  state.filter = "all";
  originInput.value = "";
  setOriginError(null);
  showError(null);
  $<HTMLElement>("load-empty").hidden = false;
  $<HTMLElement>("recording").hidden = true;
  results.hidden = true;
  statusEl.textContent = "Recording cleared. Nothing was stored.";
  renderStages();
  if (location.hash) history.replaceState(null, "", location.pathname);
  drop.focus();
}

// ---------- rendering ----------
function renderRecording(a: Analysis) {
  $<HTMLParagraphElement>("rec-files").textContent = state.fileNames.join(" · ");
  const ignored = a.ignored.extension + a.ignored.unsupported + a.ignored.preflight;
  const hashed = a.inline.scriptHashes.length + a.inline.styleHashes.length;
  const stats: Array<[string, string, string?]> = [
    [String(a.totalRecords), "requests read"],
    [String(a.navigations), a.navigations === 1 ? "page" : "pages"],
    [String(a.evidence.length), "sources"],
    [String(hashed), "inline blocks hashed"],
    [String(ignored), "ignored", ignoredTitle(a)],
  ];
  $<HTMLElement>("rec-stats").innerHTML = stats
    .map(([n, l, t]) => `<div${t ? ` title="${escapeHtml(t)}"` : ""}><dt>${escapeHtml(l)}</dt><dd>${n}</dd></div>`)
    .join("");
}
function ignoredTitle(a: Analysis): string {
  const parts: string[] = [];
  if (a.ignored.extension) parts.push(`${a.ignored.extension} from browser extensions`);
  if (a.ignored.preflight) parts.push(`${a.ignored.preflight} CORS preflight`);
  if (a.ignored.unsupported) parts.push(`${a.ignored.unsupported} unsupported scheme`);
  return parts.join(", ") || "Nothing was ignored";
}

function needsReview(ev: SourceEvidence) {
  return ev.risks.length > 0;
}

function renderFilters(a: Analysis) {
  const present = DIRECTIVE_ORDER.filter((d) => a.evidence.some((e) => e.directive === d));
  const reviewCount = a.evidence.filter(needsReview).length;
  const items: Array<[Filter, string, number]> = [
    ["all", "All", a.evidence.length],
    ["review", "Needs review", reviewCount],
    ...present.map((d) => [d, d, a.evidence.filter((e) => e.directive === d).length] as [Filter, string, number]),
  ];
  if (!items.some(([f]) => f === state.filter)) state.filter = "all";
  $<HTMLDivElement>("filters").innerHTML = items
    .map(
      ([f, label, n]) =>
        `<button type="button" class="filter${f === "review" && n > 0 ? " filter-warn" : ""}" data-filter="${f}" aria-pressed="${state.filter === f}">${escapeHtml(label)} <span class="filter-n">${n}</span></button>`,
    )
    .join("");
}

const PLACEMENT_LABEL: Record<PolicyPlacement, string> = {
  listed: "Listed",
  default: "Via default-src",
  excluded: "Excluded",
  always: "Always kept",
};

function riskBadges(ev: SourceEvidence) {
  return ev.risks
    .map((r) => `<span class="badge badge-${r.level}">${r.level === "high" ? "High risk" : "Review"}</span>`)
    .join(" ");
}

function rowId(i: number) {
  return `src-${i}`;
}

function renderTable(a: Analysis) {
  const tbody = $<HTMLTableElement>("evidence").tBodies[0]!;
  if (a.evidence.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No sub-resources in this recording: no scripts, styles, images or calls to other hosts. The policy locks everything to your own origin.</td></tr>`;
    return;
  }
  let html = "";
  let current: Directive | null = null;
  a.evidence.forEach((ev, i) => {
    const visible = state.filter === "all" || (state.filter === "review" ? needsReview(ev) : ev.directive === state.filter);
    if (ev.directive !== current) {
      current = ev.directive;
      const groupVisible = a.evidence.some(
        (e) => e.directive === current && (state.filter === "all" || (state.filter === "review" ? needsReview(e) : e.directive === state.filter)),
      );
      html += `<tr class="group"${groupVisible ? "" : " hidden"}><th colspan="5" scope="colgroup"><code>${current}</code><span>${escapeHtml(DIRECTIVE_INFO[current].governs)}</span></th></tr>`;
    }
    const key = evidenceKey(ev);
    const id = rowId(i);
    const placement = placementOf(ev, state.directives, state.selected);
    const isOpen = state.open.has(key);
    const included = state.selected.has(key);
    html += `<tr class="src-row${included ? "" : " is-excluded"}${needsReview(ev) ? " has-risk" : ""}" data-key="${escapeHtml(key)}"${visible ? "" : " hidden"}>
      <td class="c-use"><input type="checkbox" id="${id}-use" data-key="${escapeHtml(key)}" ${included ? "checked" : ""} aria-label="Include ${escapeHtml(ev.source)} in ${ev.directive}"></td>
      <td class="c-src"><label for="${id}-use"><code>${escapeHtml(ev.source)}</code></label>${ev.risks.length ? `<span class="risk-inline">${riskBadges(ev)}</span>` : ""}</td>
      <td class="c-num">${ev.count}</td>
      <td class="c-pol"><span class="place place-${placement}">${PLACEMENT_LABEL[placement]}</span></td>
      <td class="c-more"><button type="button" class="more" data-toggle="${escapeHtml(key)}" aria-expanded="${isOpen}" aria-controls="${id}-detail">${isOpen ? "Hide" : "Details"}<span class="sr-only"> for ${escapeHtml(ev.source)} in ${ev.directive}</span></button></td>
    </tr>`;
    html += `<tr class="detail-row" id="${id}-detail"${isOpen && visible ? "" : " hidden"}><td colspan="5">${detailHtml(ev)}</td></tr>`;
  });
  tbody.innerHTML = html;
}

function detailHtml(ev: SourceEvidence) {
  const key = evidenceKey(ev);
  const recs = state.bySource.get(key) ?? [];
  const shown = recs.slice(0, 5);
  const more = recs.length - shown.length;
  const observed = shown
    .map((r) => `<li><span class="m">${escapeHtml(r.method)}</span><span class="s">${r.status || "–"}</span><code>${escapeHtml(shortUrl(r.url, 80))}</code></li>`)
    .join("");
  const risks = ev.risks
    .map((r) => `<p class="risk-note risk-${r.level}"><strong>${r.level === "high" ? "High risk." : "Review."}</strong> ${escapeHtml(r.message)}</p>`)
    .join("");
  return `<div class="detail">
    ${risks}
    <dl class="detail-grid">
      <div><dt>Observed</dt><dd><ol class="obs">${observed || `<li><code>${escapeHtml(ev.examples[0] ?? "")}</code></li>`}</ol>${more > 0 ? `<p class="more-n">+ ${more} more</p>` : ""}</dd></div>
      <div><dt>Directive</dt><dd><code>${ev.directive}</code> controls ${escapeHtml(DIRECTIVE_INFO[ev.directive].governs)}.</dd></div>
      <div><dt>Why it's included</dt><dd>${escapeHtml(inclusionReason(ev))}</dd></div>
      <div><dt>If you exclude it</dt><dd>${escapeHtml(exclusionEffect(ev, state.options.mode))}</dd></div>
    </dl>
  </div>`;
}

function renderReviewFoot(a: Analysis) {
  const excluded = a.evidence.filter((e) => !state.selected.has(evidenceKey(e))).length;
  $<HTMLParagraphElement>("review-foot").textContent = excluded
    ? `${excluded} of ${a.evidence.length} sources excluded. Excluded sources are left out of every export.`
    : `All ${a.evidence.length} sources are included.`;
}

function renderModeHelp() {
  $<HTMLParagraphElement>("mode-help").innerHTML =
    state.options.mode === "report-only"
      ? `<strong>Report-Only:</strong> sent as <code>Content-Security-Policy-Report-Only</code>. Browsers report what it would block and block nothing. Start here.`
      : `<strong>Enforce:</strong> sent as <code>Content-Security-Policy</code>. Browsers block anything not listed, including flows this recording didn't capture.`;
}

function tokenKey(directive: string, token: string): string {
  if (token.startsWith("'sha256-")) return "hash";
  if (directive === "default-src") return "default";
  return `${directive} ${token}`;
}

function renderPolicyLines() {
  const lines = state.directives;
  $<HTMLOListElement>("policy-lines").innerHTML = lines
    .map(([d, sources]) => {
      const toks = sources
        .map((t) => {
          const k = tokenKey(d, t);
          const isHash = k === "hash";
          const label = isHash ? `${t.slice(0, 16)}…'` : t;
          return `<span class="tok${isHash ? " tok-hash" : ""}" data-key="${escapeHtml(k)}"${isHash ? ` title="${escapeHtml(t)}"` : ""}>${escapeHtml(label)}</span>`;
        })
        .join(" ");
      return `<li><code class="dir">${escapeHtml(d)}</code><span class="toks">${toks}</span></li>`;
    })
    .join("");
}

function renderInlineNotes(a: Analysis) {
  const items: string[] = [];
  const hashed = a.inline.scriptHashes.length + a.inline.styleHashes.length;
  const noHtml = a.inline.documentsScanned === 0 && a.inline.documentsWithoutBody > 0;
  if (noHtml) {
    items.push(`<li><strong>Inline code wasn't checked:</strong> this recording has no page HTML. If your pages use inline scripts, export the HAR again with response content so they can be hashed.</li>`);
  }
  if (a.inline.inlineEventHandlers > 0) {
    items.push(`<li><strong>${a.inline.inlineEventHandlers} inline event handler${a.inline.inlineEventHandlers > 1 ? "s" : ""}</strong> (<code>onclick=</code> and similar) will be blocked. Hashes can't allow them; move them into script files.</li>`);
  }
  if (a.inline.styleAttributes > 0) {
    items.push(`<li><strong>${a.inline.styleAttributes} <code>style=""</code> attribute${a.inline.styleAttributes > 1 ? "s" : ""}</strong> will be blocked. Move them to CSS classes, or decide whether <code>'unsafe-inline'</code> in <code>style-src</code> is acceptable.</li>`);
  }
  $<HTMLDivElement>("inline-notes").innerHTML = items.length
    ? `<div class="inline-notes"><h3 class="sub-title">Inline code in your pages</h3><ul>${items.join("")}</ul></div>`
    : "";
  // Warning beside the hash setting it concerns.
  const help = $<HTMLParagraphElement>("hashes-help");
  if (noHtml) {
    help.className = "field-help field-warn";
    help.textContent = "This recording has no page HTML, so inline scripts couldn't be checked. Export the HAR again with response content, or add hashes or nonces yourself.";
  } else if (hashed > 0) {
    help.className = "field-help";
    help.textContent = `${a.inline.scriptHashes.length} script and ${a.inline.styleHashes.length} style block${hashed === 1 ? "" : "s"} found in ${a.inline.documentsScanned} recorded page${a.inline.documentsScanned === 1 ? "" : "s"}. Hashes avoid 'unsafe-inline'.`;
  } else {
    help.className = "field-help";
    help.textContent = "No inline script or style blocks were found in the recorded pages.";
  }
}

function renderTabs() {
  $<HTMLDivElement>("tabs").innerHTML = (Object.keys(FORMAT_LABELS) as ExportFormat[])
    .map(
      (f) =>
        `<button type="button" role="tab" id="tab-${f}" data-format="${f}" aria-selected="${f === state.format}" aria-controls="export-panel" tabindex="${f === state.format ? 0 : -1}">${escapeHtml(FORMAT_LABELS[f])}</button>`,
    )
    .join("");
  $<HTMLDivElement>("export-panel").setAttribute("aria-labelledby", `tab-${state.format}`);
}

function currentExport() {
  return exportPolicy(state.directives, state.options.mode, state.format);
}

function renderExport() {
  const result = currentExport();
  const ta = $<HTMLTextAreaElement>("policy");
  ta.value = result.text;
  ta.rows = Math.min(14, Math.max(4, result.text.split("\n").length + 2));
  $<HTMLUListElement>("export-notes").innerHTML = result.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  $<HTMLSpanElement>("fname").textContent = result.filename;
  $<HTMLSpanElement>("copy-status").textContent = "";
  $<HTMLButtonElement>("copy").textContent = "Copy";
}

/** Recompute the policy and every view that depends on it. Keeps scroll, focus and open rows. */
function renderPolicy() {
  const a = state.analysis;
  if (!a) return;
  state.directives = buildDirectives(a, state.selected, state.options);
  renderModeHelp();
  renderPolicyLines();
  renderExport();
  // Update row placement + excluded styling without rebuilding the table (keeps focus).
  for (const ev of a.evidence) {
    const key = evidenceKey(ev);
    const row = document.querySelector<HTMLTableRowElement>(`tr.src-row[data-key="${CSS.escape(key)}"]`);
    if (!row) continue;
    const p = placementOf(ev, state.directives, state.selected);
    const cell = row.querySelector(".c-pol")!;
    cell.innerHTML = `<span class="place place-${p}">${PLACEMENT_LABEL[p]}</span>`;
    row.classList.toggle("is-excluded", !state.selected.has(key));
    const detail = row.nextElementSibling;
    if (detail && state.open.has(key)) detail.querySelector("td")!.innerHTML = detailHtml(ev);
  }
  renderReviewFoot(a);
}

function render() {
  const a = state.analysis;
  if (!a) return;
  state.directives = buildDirectives(a, state.selected, state.options);
  renderStages();
  renderRecording(a);
  renderFilters(a);
  renderTable(a);
  renderInlineNotes(a);
  renderTabs();
  renderPolicy();
}

// ---------- relationship highlight (table row <-> policy tokens) ----------
function highlight(key: string | null) {
  document.querySelectorAll(".is-traced").forEach((el) => el.classList.remove("is-traced"));
  if (!key) return;
  const sel = CSS.escape(key);
  document.querySelectorAll(`.tok[data-key="${sel}"], tr.src-row[data-key="${sel}"]`).forEach((el) => el.classList.add("is-traced"));
}
const table = $<HTMLTableElement>("evidence");
table.addEventListener("mouseover", (e) => {
  const row = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr.src-row");
  highlight(row?.dataset.key ?? null);
});
table.addEventListener("mouseleave", () => highlight(null));
table.addEventListener("focusin", (e) => {
  const row = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr.src-row");
  highlight(row?.dataset.key ?? null);
});
$<HTMLOListElement>("policy-lines").addEventListener("mouseover", (e) => {
  const tok = (e.target as HTMLElement).closest<HTMLElement>(".tok");
  highlight(tok?.dataset.key ?? null);
});
$<HTMLOListElement>("policy-lines").addEventListener("mouseleave", () => highlight(null));

// ---------- events ----------
function pick(mode: "replace" | "add") {
  state.pickMode = mode;
  fileInput.click();
}
drop.addEventListener("click", () => pick("replace"));
drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    pick("replace");
  }
});
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  state.pickMode = "replace";
  void loadFiles([...(e.dataTransfer?.files ?? [])]);
});
// Dropping a file anywhere on the bench replaces the recording too.
results.addEventListener("dragover", (e) => e.preventDefault());
results.addEventListener("drop", (e) => {
  e.preventDefault();
  state.pickMode = "replace";
  void loadFiles([...(e.dataTransfer?.files ?? [])]);
});
fileInput.addEventListener("change", () => {
  void loadFiles([...(fileInput.files ?? [])]);
  fileInput.value = "";
});
$<HTMLButtonElement>("add-files").addEventListener("click", () => pick("add"));
$<HTMLButtonElement>("replace-files").addEventListener("click", () => pick("replace"));
$<HTMLButtonElement>("clear").addEventListener("click", clearAll);

async function loadSample() {
  showError(null);
  statusEl.textContent = "Loading the synthetic sample…";
  try {
    const res = await fetch("/sample.har");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseHar(await res.text());
    await useRecords(parsed.records, ["sample.har (synthetic)"], false);
  } catch (e) {
    statusEl.textContent = "";
    showError("Couldn't load the sample file from this site. Reload the page and try again.");
    console.error(e);
  }
}
$<HTMLButtonElement>("sample").addEventListener("click", () => void loadSample());

originInput.addEventListener("change", async () => {
  const origin = normaliseOrigin(originInput.value);
  if (!origin) {
    setOriginError("Enter an origin like https://www.example.com. The policy still uses the last valid origin.");
    return;
  }
  setOriginError(null);
  originInput.value = origin;
  const prev = state.analysis;
  state.analysis = await analyse(state.records, origin);
  state.selected = carryExclusions(prev, state.selected, state.analysis);
  state.bySource = recordsBySource(state.records, origin);
  statusEl.textContent = `Origin set to ${origin}. Sources re-grouped; your exclusions were kept.`;
  render();
});

document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) =>
  r.addEventListener("change", () => {
    state.options.mode = r.value as PolicyOptions["mode"];
    renderPolicy();
  }),
);
document.querySelectorAll<HTMLInputElement>('input[name="fa"]').forEach((r) =>
  r.addEventListener("change", () => {
    state.options.frameAncestors = r.value as PolicyOptions["frameAncestors"];
    renderPolicy();
  }),
);
$<HTMLInputElement>("hashes").addEventListener("change", (e) => {
  state.options.includeInlineHashes = (e.target as HTMLInputElement).checked;
  renderPolicy();
});
$<HTMLInputElement>("upgrade").addEventListener("change", (e) => {
  state.options.upgradeInsecureRequests = (e.target as HTMLInputElement).checked;
  renderPolicy();
});
$<HTMLInputElement>("report").addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  const ok = validReportEndpoint(input.value);
  input.setAttribute("aria-invalid", String(!ok));
  input.classList.toggle("invalid", !ok);
  const help = $<HTMLElement>("report-help");
  help.className = ok ? "field-help" : "field-error";
  help.innerHTML = ok
    ? "Must be https. Added as <code>report-uri</code>, so Report-Only mode tells you what it would block."
    : "That isn't a valid https URL, so it was left out of the policy.";
  state.options.reportEndpoint = input.value;
  renderPolicy();
});

table.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  const key = t.dataset.key;
  if (!key) return;
  if (t.checked) state.selected.add(key);
  else state.selected.delete(key);
  renderPolicy();
});
table.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-toggle]");
  if (!btn || !state.analysis) return;
  const key = btn.dataset.toggle!;
  const open = !state.open.has(key);
  if (open) state.open.add(key);
  else state.open.delete(key);
  const detail = document.getElementById(btn.getAttribute("aria-controls")!)!;
  const ev = state.analysis.evidence.find((x) => evidenceKey(x) === key)!;
  if (open) detail.querySelector("td")!.innerHTML = detailHtml(ev);
  detail.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  btn.firstChild!.textContent = open ? "Hide" : "Details";
});

$<HTMLDivElement>("filters").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-filter]");
  if (!btn || !state.analysis) return;
  state.filter = btn.dataset.filter as Filter;
  renderFilters(state.analysis);
  renderTable(state.analysis);
  $<HTMLButtonElement>("filters").querySelector<HTMLButtonElement>(`[data-filter="${CSS.escape(state.filter)}"]`)?.focus();
});

function selectFormat(f: ExportFormat) {
  state.format = f;
  renderTabs();
  renderExport();
  $<HTMLButtonElement>(`tab-${state.format}`).focus();
}
$<HTMLDivElement>("tabs").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-format]");
  if (btn) selectFormat(btn.dataset.format as ExportFormat);
});
$<HTMLDivElement>("tabs").addEventListener("keydown", (e) => {
  const formats = Object.keys(FORMAT_LABELS) as ExportFormat[];
  const i = formats.indexOf(state.format);
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    selectFormat(formats[(i + (e.key === "ArrowRight" ? 1 : formats.length - 1)) % formats.length]!);
  } else if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    selectFormat(formats[e.key === "Home" ? 0 : formats.length - 1]!);
  }
});

let copyTimer = 0;
$<HTMLButtonElement>("copy").addEventListener("click", async () => {
  const text = $<HTMLTextAreaElement>("policy").value;
  const statusSpan = $<HTMLSpanElement>("copy-status");
  const btn = $<HTMLButtonElement>("copy");
  try {
    await navigator.clipboard.writeText(text);
    statusSpan.textContent = `Copied the ${FORMAT_LABELS[state.format]} text.`;
    btn.textContent = "Copied";
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => (btn.textContent = "Copy"), 2000);
  } catch {
    $<HTMLTextAreaElement>("policy").select();
    statusSpan.textContent = "The browser blocked clipboard access. The text is selected; press Ctrl+C (⌘C on Mac).";
  }
});
$<HTMLButtonElement>("download").addEventListener("click", () => {
  if (!state.analysis) return;
  const result = currentExport();
  const blob = new Blob([result.text + "\n"], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $<HTMLSpanElement>("copy-status").textContent = `Downloaded ${result.filename}.`;
});

// ---------- entry ----------
renderStages();
if (location.hash === "#sample") void loadSample();
window.addEventListener("hashchange", () => {
  if (location.hash === "#sample" && !state.analysis) void loadSample();
});
