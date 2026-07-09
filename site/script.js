const payload = JSON.parse(document.getElementById("report-data").textContent);
const rawResults = Array.isArray(payload.results) ? payload.results : [];
const correctedApps = new Set((payload.corrected_app_names || []).map((value) => String(value).trim().toLowerCase()));
const correctionMap = new Map((payload.corrections || []).map((item) => [String(item.app_name).trim().toLowerCase(), item]));
const workflowSteps = [
  "apps.csv",
  "evidence retrieval",
  "extraction",
  "classification",
  "clustering",
  "verification",
  "HTML report",
];

const state = {
  theme: localStorage.getItem("dashboard-theme") || "dark",
  filters: {
    search: "",
    category: "all",
    auth: "all",
    buildability: "all",
    gating: "all",
    mcp: "all",
    review: "all",
    confidence: "all",
    highConfidenceOnly: false,
    correctedOnly: false,
  },
  activeDrawerId: null,
};

function safeArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined);
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function humanize(value) {
  return String(value || "").replaceAll("_", " ").replaceAll("-", " ").trim();
}

function displayLabel(value) {
  const normalized = cleanText(value);
  switch (normalized) {
    case "oauth2":
      return "OAuth2";
    case "api_key":
      return "API key";
    case "none_found":
      return "None found";
    case "self_serve":
      return "Self-serve";
    case "partially_gated":
      return "Partially gated";
    case "buildable_today":
      return "Buildable today";
    case "buildable_with_limitations":
      return "Buildable with limitations";
    case "needs_outreach":
      return "Needs outreach";
    case "not_buildable_now":
      return "Not buildable now";
    case "rest_and_graphql":
      return "REST + GraphQL";
    case "sdk_only":
      return "SDK only";
    default:
      return humanize(normalized);
  }
}

function safeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/oauth\s*2(\.0)?/g, "oauth2")
    .replace(/api[\s_-]*key/g, "api key")
    .replace(/self[\s_-]*serve/g, "self serve")
    .replace(/partially[\s_-]*gated/g, "partially gated")
    .replace(/none[\s_-]*found/g, "none found")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean);
}

function confidenceBand(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function formatMetric(value) {
  return typeof value === "number" && value < 1 ? value.toFixed(2) : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusTag(value) {
  return `<span class="status ${escapeHtml(String(value || ""))}">${escapeHtml(displayLabel(value))}</span>`;
}

function getField(raw, candidates, fallback = "") {
  for (const key of candidates) {
    if (raw && raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
      return raw[key];
    }
  }
  return fallback;
}

function canonicalAuthValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized.includes("oauth")) return "oauth2";
  if (normalized.includes("api key")) return "api_key";
  if (normalized === "basic") return "basic";
  if (normalized.includes("token")) return "token";
  if (normalized.includes("session")) return "session";
  if (normalized.includes("mixed")) return "mixed";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function canonicalAccessValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("partially gated")) return "partially_gated";
  if (normalized.includes("self serve")) return "self_serve";
  if (normalized.includes("gated")) return "gated";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function canonicalBuildabilityValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("buildable today")) return "buildable_today";
  if (normalized.includes("buildable with limitations") || normalized.includes("limited")) {
    return "buildable_with_limitations";
  }
  if (normalized.includes("needs outreach") || normalized.includes("outreach")) return "needs_outreach";
  if (normalized.includes("not buildable")) return "not_buildable_now";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function canonicalMcpValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("official")) return "official";
  if (normalized.includes("unofficial")) return "unofficial";
  if (normalized.includes("none found")) return "none_found";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function canonicalApiSurface(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("rest and graphql")) return "rest_and_graphql";
  if (normalized === "rest") return "rest";
  if (normalized === "graphql") return "graphql";
  if (normalized.includes("sdk only")) return "sdk_only";
  if (normalized.includes("undocumented")) return "undocumented";
  if (normalized.includes("mixed")) return "mixed";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function normalizeEvidenceUrls(rawValue) {
  return safeArray(rawValue)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function normalizeApp(rawApp) {
  const rawName = getField(rawApp, ["app_name", "name", "App", "app"], "Unknown app");
  const name = cleanText(rawName);
  const category = cleanText(getField(rawApp, ["category", "Category"], "Unknown"));
  const description = cleanText(
    getField(rawApp, ["one_line_description", "description", "Description"], "Not available")
  );
  const authRaw = safeArray(getField(rawApp, ["auth_methods", "auth", "Auth"], []));
  const authMethods = [...new Set(authRaw.map((item) => canonicalAuthValue(item)).filter(Boolean))];
  const authText = authMethods.map((item) => displayLabel(item)).join(", ");
  const accessStatus = canonicalAccessValue(
    getField(rawApp, ["self_serve_status", "self_serve_vs_gated", "access", "gated_status"], "unknown")
  );
  const apiSurface = canonicalApiSurface(getField(rawApp, ["api_surface", "api", "surface"], "unknown"));
  const mcpStatus = canonicalMcpValue(getField(rawApp, ["existing_mcp", "mcp", "mcp_status"], "unknown"));
  const buildability = canonicalBuildabilityValue(
    getField(rawApp, ["buildability_verdict", "verdict", "buildability"], "unknown")
  );
  const blocker = cleanText(getField(rawApp, ["main_blocker", "blocker"], "Not available"));
  const confidence = Number(getField(rawApp, ["confidence_score", "confidence"], 0));
  const evidenceUrls = normalizeEvidenceUrls(getField(rawApp, ["evidence_urls", "evidence", "docs_urls"], []));
  const evidenceText = normalizeText(evidenceUrls.join(" "));
  const notes = cleanText(getField(rawApp, ["notes", "note"], ""));
  const uncertainFields = safeArray(getField(rawApp, ["uncertain_fields"], [])).map((item) => cleanText(item));
  const lowConfidence = Boolean(getField(rawApp, ["low_confidence"], false));
  const normalizedName = normalizeText(name);
  const humanReviewRequired = lowConfidence || uncertainFields.length > 0;
  const correctedKey = normalizedName;
  const isCorrected = correctedApps.has(correctedKey);
  const id = cleanText(getField(rawApp, ["app_id", "id"], safeId(name)));
  const searchableParts = [
    name,
    category,
    description,
    authText,
    humanize(accessStatus),
    humanize(apiSurface),
    humanize(mcpStatus),
    humanize(buildability),
    blocker,
    notes,
    evidenceUrls.join(" "),
    humanReviewRequired ? "human review low confidence" : "",
    isCorrected ? "corrected corrected app" : "",
  ];

  return {
    id: String(id),
    raw: rawApp,
    name,
    normalizedName,
    category,
    normalizedCategory: normalizeText(category),
    description,
    authText,
    authMethods,
    accessStatus,
    apiSurface,
    mcpStatus,
    buildability,
    blocker,
    confidence,
    confidenceBucket: confidenceBand(confidence),
    evidenceText,
    evidenceUrls,
    notes,
    humanReviewRequired,
    isCorrected,
    correctedKey,
    searchableText: normalizeText(searchableParts.join(" ")),
  };
}

const normalizedApps = rawResults.map(normalizeApp);
const appsById = new Map(normalizedApps.map((app) => [app.id, app]));

function navLinks() {
  return [
    ["snapshot", "Snapshot"],
    ["build-queue", "Build Queue"],
    ["patterns", "Patterns"],
    ["verification", "Verification"],
    ["agent-workflow", "Agent Workflow"],
    ["explore-apps", "Explore Apps"],
    ["proof", "Proof"],
    ["full-table", "Full Table"],
  ];
}

function renderNav() {
  const nav = document.getElementById("top-nav");
  if (!nav) return;
  nav.innerHTML = navLinks()
    .map(
      ([id, label]) => `
        <a class="nav-link" href="#${id}" data-target="${id}">
          <span>${label}</span>
        </a>
      `
    )
    .join("");
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem("dashboard-theme", state.theme);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.textContent = state.theme === "dark" ? "Light mode" : "Dark mode";
}

function initTheme() {
  applyTheme();
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
  });
}

function renderModeBanner() {
  const metadata = payload.metadata || {};
  const node = document.getElementById("mode-banner");
  if (!node) return;
  node.innerHTML = `
    <div class="badge-row">
      <span class="mode-badge primary">real_cached submitted run</span>
      <span class="mode-badge secondary">Composio SDK/MCP-ready</span>
      <span class="mode-badge secondary">${metadata.live_search_enabled ? "live provider configured" : "live search not executed"}</span>
    </div>
    <p class="mode-copy">${escapeHtml(metadata.mode_summary || "")}</p>
  `;
}

function renderHeroMeta() {
  const metadata = payload.metadata || {};
  const node = document.getElementById("hero-actions");
  if (!node) return;
  node.innerHTML = `
    <a class="action-button primary" href="${escapeHtml(metadata.deployed_link_placeholder || "#")}" target="_blank" rel="noopener noreferrer">Open deployment</a>
    <a class="action-button secondary" href="${escapeHtml(metadata.repo_link_placeholder || "#")}" target="_blank" rel="noopener noreferrer">Source repo</a>
  `;
}

function renderReadingCard() {
  const node = document.getElementById("reading-card");
  if (!node) return;
  node.innerHTML = `
    <h3>How to use this dashboard</h3>
    <ul>
      <li>Scan the KPI strip and verification snapshot first.</li>
      <li>Use Build Queue and Outreach Queue to understand product actionability.</li>
      <li>Search or filter the 100 apps, then open the detail drawer to inspect evidence and reasoning.</li>
    </ul>
  `;
}

function renderInsightCards() {
  const node = document.getElementById("insight-cards");
  if (!node) return;
  node.innerHTML = (payload.kpi_cards || [])
    .map(
      (card) => `
        <article class="metric-card kpi-card ${escapeHtml(card.tone)}">
          <div class="metric-label">${escapeHtml(card.label)}</div>
          <div class="metric-value">${formatMetric(card.value)}</div>
        </article>
      `
    )
    .join("");
}

function renderExecutiveSummary() {
  const node = document.getElementById("executive-summary");
  if (!node) return;
  node.innerHTML = (payload.executive_summary || [])
    .map((item) => `<article class="mini-card"><p>${escapeHtml(item)}</p></article>`)
    .join("");
}

function renderVerification() {
  const verification = payload.verification || {};
  const report = payload.verification_report || {};
  const fieldsChecked = Array.isArray(report.fields_checked) ? report.fields_checked : [];
  const cards = [
    ["Sample size", verification.sample_size ?? "Not available"],
    ["Fields checked", fieldsChecked.length || "Not available"],
    ["First-pass app accuracy", verification.first_pass_app_accuracy ?? "Not available"],
    ["First-pass field accuracy", verification.first_pass_field_accuracy ?? "Not available"],
    ["Post-verification accuracy", verification.verified_accuracy_estimate ?? "Not available"],
    ["Corrections made", (payload.correction_apps || []).length],
  ];
  const summaryNode = document.getElementById("verification-summary");
  if (summaryNode) {
    summaryNode.innerHTML = cards
      .map(
        ([label, value]) => `
          <article class="mini-card verification-card">
            <div class="metric-label">${escapeHtml(label)}</div>
            <div class="metric-value">${formatMetric(value)}</div>
          </article>
        `
      )
      .join("");
  }

  const noteNode = document.getElementById("verification-note");
  if (noteNode) {
    noteNode.innerHTML = `
      <article class="mini-card">
        <p><strong>Selection strategy:</strong> ${escapeHtml(verification.selection_strategy || "Not available")}</p>
        <p><strong>Fields checked:</strong> ${fieldsChecked.length ? escapeHtml(fieldsChecked.map((item) => humanize(item)).join(", ")) : "Not available"}</p>
        <p><strong>Corrected apps:</strong> ${escapeHtml((payload.corrected_app_names || []).join(", ") || "Not available")}</p>
        <p><strong>Human review boundary:</strong> This larger sample was generated from existing cached evidence and the bundled verification rules, not from a fresh live-doc pass.</p>
      </article>
    `;
  }

  const correctionsNode = document.getElementById("corrections");
  if (correctionsNode) {
    correctionsNode.innerHTML = (payload.corrections || [])
      .map(
        (entry) => `
          <article class="mini-card correction-detail-card">
            <div class="card-topline">
              <div>
                <h3>${escapeHtml(entry.app_name)}</h3>
                <div class="meta-row">
                  <span class="pill">${escapeHtml(entry.category)}</span>
                  <span class="pill">Corrected</span>
                </div>
              </div>
            </div>
            <p>${escapeHtml(entry.reviewer_note)}</p>
            <div class="before-after-grid">
              ${(entry.corrections || [])
                .map(
                  (corr) => `
                    <div class="before-after-row">
                      <div class="before-after-label">${escapeHtml(humanize(corr.field_name))}</div>
                      <div class="before-after-values">
                        <span class="before-chip">Before: ${escapeHtml(corr.original_value)}</span>
                        <span class="after-chip">After: ${escapeHtml(corr.corrected_value)}</span>
                      </div>
                    </div>
                  `
                )
                .join("")}
            </div>
          </article>
        `
      )
      .join("");
  }
}

function renderCorrectionApps() {
  const node = document.getElementById("correction-apps");
  if (!node) return;
  node.innerHTML = (payload.correction_apps || [])
    .map(
      (item) => `
        <article class="mini-card correction-summary-card">
          <div class="card-topline">
            <div>
              <h3>${escapeHtml(item.app_name)}</h3>
              <div class="meta-row">
                <span class="pill">${escapeHtml(item.category)}</span>
                <span class="pill">${item.field_count} corrected field${item.field_count === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>
          <p><strong>Fields:</strong> ${escapeHtml((item.fields || []).map((field) => humanize(field)).join(", "))}</p>
          <p>${escapeHtml(item.reviewer_note)}</p>
        </article>
      `
    )
    .join("");
}

function renderWorkSplit() {
  const node = document.getElementById("work-split");
  if (!node) return;
  const card = (title, rows) => `
    <article class="mini-card">
      <h3>${escapeHtml(title)}</h3>
      <ul class="compact-list">${rows.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `;
  node.innerHTML = [
    card("Agent / pipeline did", payload.agent_did || []),
    card("Human did", payload.human_did || []),
  ].join("");
}

function renderWorkflowPipeline() {
  const node = document.getElementById("workflow-pipeline");
  if (!node) return;
  node.innerHTML = workflowSteps
    .map(
      (step, index) => `
        <div class="pipeline-step">
          <div class="pipeline-index">${index + 1}</div>
          <div class="pipeline-label">${escapeHtml(step)}</div>
        </div>
      `
    )
    .join('<div class="pipeline-arrow">→</div>');
}

function renderHeadlineInsights() {
  const node = document.getElementById("headline-insights");
  if (!node) return;
  node.innerHTML = ((payload.insights || {}).headline_insights || [])
    .map((item) => `<article class="mini-card"><p>${escapeHtml(item)}</p></article>`)
    .join("");
}

function distributionTone(label) {
  if (["buildable_today", "self_serve", "official", "oauth2", "high"].includes(label)) return "fill-green";
  if (["buildable_with_limitations", "partially_gated", "unofficial", "api_key", "token", "medium"].includes(label)) return "fill-amber";
  if (["needs_outreach", "gated", "not_buildable_now", "required"].includes(label)) return "fill-orange";
  if (["unclear", "none_found", "low", "not_required", "unknown"].includes(label)) return "fill-gray";
  return "fill-blue";
}

function renderDistributionBars(targetId, data, chipLabels = true) {
  const target = document.getElementById(targetId);
  if (!target || !data) return;
  const total = Object.values(data).reduce((sum, count) => sum + count, 0) || 1;
  target.innerHTML = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => {
      const pct = Math.round((count / total) * 100);
      const labelHtml = chipLabels ? statusTag(label) : `<span class="bar-label">${escapeHtml(label)}</span>`;
      return `
        <div class="distribution-row">
          <div class="distribution-meta">
            <div class="distribution-label">${labelHtml}</div>
            <div class="meta-token">${count} (${pct}%)</div>
          </div>
          <div class="distribution-track">
            <div class="distribution-fill ${distributionTone(label)}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderMatrix() {
  const node = document.getElementById("matrix-table");
  if (!node) return;
  const rows = Object.entries(payload.category_matrix || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([category, metrics]) => `
        <tr>
          <td>${escapeHtml(category)}</td>
          <td>${metrics.self_serve}</td>
          <td>${metrics.gated}</td>
          <td>${metrics.buildable_today}</td>
          <td>${metrics.needs_outreach}</td>
          <td>${metrics.unclear}</td>
        </tr>
      `
    )
    .join("");
  node.innerHTML = `
    <thead>
      <tr>
        <th>Category</th>
        <th>Self-serve</th>
        <th>Gated</th>
        <th>Buildable today</th>
        <th>Needs outreach</th>
        <th>Human review</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function evidenceLinkGroup(urls, includeCopy = false) {
  return `
    <div class="evidence-row">
      ${safeArray(urls)
        .map((url, index) => {
          const cleanUrl = cleanText(url);
          const copyButton = includeCopy
            ? `<button class="tiny-button copy-link" type="button" data-copy="${escapeHtml(cleanUrl)}">Copy</button>`
            : "";
          return `
            <div class="evidence-item">
              <a class="evidence-link" href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener noreferrer">Evidence ${index + 1}</a>
              ${copyButton}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderQueue(targetId, rows, kind) {
  const node = document.getElementById(targetId);
  if (!node) return;
  node.innerHTML = rows
    .map((app) => {
      const whyLabel =
        kind === "build"
          ? "Why it is attractive:"
          : kind === "review"
            ? "Why it needs human review:"
            : "Why outreach matters:";
      return `
        <article class="queue-card mini-card" data-app-id="${escapeHtml(app.id)}">
          <div class="card-topline">
            <div>
              <h3>${escapeHtml(app.name)}</h3>
              <div class="meta-row">
                <span class="pill">${escapeHtml(app.category)}</span>
                ${statusTag(app.buildability)}
                ${statusTag(app.accessStatus)}
                ${app.isCorrected ? '<span class="pill">Corrected</span>' : ""}
              </div>
            </div>
            <div class="confidence-pill ${app.confidenceBucket}">${app.confidence.toFixed(2)}</div>
          </div>
          <p>${escapeHtml(app.description)}</p>
          <p><strong>${whyLabel}</strong> ${escapeHtml(app.blocker)}</p>
          <p><strong>Auth:</strong> ${escapeHtml(app.authText || "Not available")}</p>
          ${evidenceLinkGroup(app.evidenceUrls)}
        </article>
      `;
    })
    .join("");
}

function uniqueSorted(values, formatter = (value) => value) {
  const seen = new Map();
  values.forEach((value) => {
    const raw = cleanText(value);
    if (!raw) return;
    const normalized = normalizeText(raw);
    if (!normalized || normalized === "unknown") return;
    if (!seen.has(normalized)) {
      seen.set(normalized, formatter(raw));
    }
  });
  return Array.from(seen.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([key, label]) => ({ key, label }));
}

function getFilterOptions() {
  return {
    categories: uniqueSorted(normalizedApps.map((app) => app.category), (value) => value),
    authMethods: uniqueSorted(normalizedApps.flatMap((app) => app.authMethods), (value) => displayLabel(value)),
    buildability: uniqueSorted(normalizedApps.map((app) => app.buildability), (value) => displayLabel(value)),
    gating: uniqueSorted(normalizedApps.map((app) => app.accessStatus), (value) => displayLabel(value)),
    mcp: uniqueSorted(normalizedApps.map((app) => app.mcpStatus), (value) => displayLabel(value)),
    review: [
      { key: "required", label: "Human review required" },
      { key: "not_required", label: "No human review" },
    ],
    confidence: [
      { key: "high", label: "High confidence" },
      { key: "medium", label: "Medium confidence" },
      { key: "low", label: "Low confidence" },
    ],
  };
}

function fillSelect(selectId, options, labelPrefix) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = [`<option value="all">${escapeHtml(labelPrefix)}</option>`]
    .concat(options.map((option) => `<option value="${escapeHtml(option.key)}">${escapeHtml(option.label)}</option>`))
    .join("");
}

function initFilters() {
  const options = getFilterOptions();
  fillSelect("category-filter", options.categories, "All categories");
  fillSelect("auth-filter", options.authMethods, "All auth methods");
  fillSelect("buildability-filter", options.buildability, "All buildability");
  fillSelect("gating-filter", options.gating, "All access types");
  fillSelect("mcp-filter", options.mcp, "All MCP states");
  fillSelect("review-filter", options.review, "All review states");
  fillSelect("confidence-filter", options.confidence, "All confidence");

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.filters.search = event.target.value.trim();
      renderFilteredViews();
    });
  }

  [
    ["category-filter", "category"],
    ["auth-filter", "auth"],
    ["buildability-filter", "buildability"],
    ["gating-filter", "gating"],
    ["mcp-filter", "mcp"],
    ["review-filter", "review"],
    ["confidence-filter", "confidence"],
  ].forEach(([id, key]) => {
    const node = document.getElementById(id);
    if (!node) return;
    node.addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      renderFilteredViews();
    });
  });

  const clearFilters = document.getElementById("clear-filters");
  if (clearFilters) {
    clearFilters.addEventListener("click", () => {
      state.filters.category = "all";
      state.filters.auth = "all";
      state.filters.buildability = "all";
      state.filters.gating = "all";
      state.filters.mcp = "all";
      state.filters.review = "all";
      state.filters.confidence = "all";
      state.filters.highConfidenceOnly = false;
      state.filters.correctedOnly = false;
      initFilterControlState();
      renderFilteredViews();
    });
  }

  const clearSearch = document.getElementById("clear-search");
  if (clearSearch) {
    clearSearch.addEventListener("click", () => {
      state.filters.search = "";
      if (searchInput) searchInput.value = "";
      renderFilteredViews();
    });
  }

  const highConfidenceToggle = document.getElementById("toggle-high-confidence");
  if (highConfidenceToggle) {
    highConfidenceToggle.addEventListener("click", () => {
      state.filters.highConfidenceOnly = !state.filters.highConfidenceOnly;
      syncToggleStates();
      renderFilteredViews();
    });
  }

  const correctedToggle = document.getElementById("toggle-corrected");
  if (correctedToggle) {
    correctedToggle.addEventListener("click", () => {
      state.filters.correctedOnly = !state.filters.correctedOnly;
      syncToggleStates();
      renderFilteredViews();
    });
  }

  const filterToggle = document.getElementById("filter-toggle");
  if (filterToggle) {
    filterToggle.addEventListener("click", () => {
      const panel = document.getElementById("filters-panel");
      if (panel) panel.classList.toggle("open");
    });
  }

  const exportButton = document.getElementById("export-csv");
  if (exportButton) exportButton.addEventListener("click", exportFilteredCsv);
  initFilterControlState();
}

function initFilterControlState() {
  const fieldMap = {
    "category-filter": state.filters.category,
    "auth-filter": state.filters.auth,
    "buildability-filter": state.filters.buildability,
    "gating-filter": state.filters.gating,
    "mcp-filter": state.filters.mcp,
    "review-filter": state.filters.review,
    "confidence-filter": state.filters.confidence,
  };
  Object.entries(fieldMap).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.value = value;
  });
  syncToggleStates();
}

function syncToggleStates() {
  const high = document.getElementById("toggle-high-confidence");
  const corrected = document.getElementById("toggle-corrected");
  if (high) high.classList.toggle("active", state.filters.highConfidenceOnly);
  if (corrected) corrected.classList.toggle("active", state.filters.correctedOnly);
}

function scoreApp(app, query) {
  if (!query) return 0;
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(normalizedQuery);
  if (!tokens.length) return 0;

  let score = 0;
  const name = app.normalizedName;
  const category = app.normalizedCategory;
  const auth = normalizeText(app.authText);
  const access = normalizeText(app.accessStatus);
  const buildability = normalizeText(app.buildability);
  const apiSurface = normalizeText(app.apiSurface);
  const mcp = normalizeText(app.mcpStatus);
  const blocker = normalizeText(app.blocker);
  const description = normalizeText(app.description);
  const notes = normalizeText(app.notes);
  const evidence = app.evidenceText;
  const searchable = app.searchableText;

  if (name === normalizedQuery) score += 100;
  else if (name.startsWith(normalizedQuery)) score += 80;
  else if (name.includes(normalizedQuery)) score += 60;

  let matchedTokens = 0;
  tokens.forEach((token) => {
    let tokenMatched = false;
    if (name === token) {
      score += 100;
      tokenMatched = true;
    } else if (name.startsWith(token)) {
      score += 80;
      tokenMatched = true;
    } else if (name.includes(token)) {
      score += 60;
      tokenMatched = true;
    }

    if (category === token || category.includes(token)) {
      score += 35;
      tokenMatched = true;
    }
    if (
      auth.includes(token) ||
      buildability.includes(token) ||
      access.includes(token) ||
      token === "oauth" && auth.includes("oauth2") ||
      token === "api" && auth.includes("api key") ||
      token === "buildable" && buildability.includes("buildable") ||
      token === "gated" && access.includes("gated") ||
      token === "mcp" && mcp !== "unknown"
    ) {
      score += 30;
      tokenMatched = true;
    }
    if (apiSurface.includes(token) || mcp.includes(token) || blocker.includes(token)) {
      score += 25;
      tokenMatched = true;
    }
    if (description.includes(token) || notes.includes(token) || evidence.includes(token)) {
      score += 10;
      tokenMatched = true;
    }
    if (!tokenMatched && searchable.includes(token)) {
      score += 8;
      tokenMatched = true;
    }
    if (tokenMatched) matchedTokens += 1;
  });

  if (matchedTokens === tokens.length) score += 20;
  return score;
}

function matchesFilters(app) {
  if (state.filters.category !== "all" && normalizeText(app.category) !== state.filters.category) return false;
  if (state.filters.auth !== "all" && !app.authMethods.includes(state.filters.auth)) return false;
  if (state.filters.buildability !== "all" && app.buildability !== state.filters.buildability) return false;
  if (state.filters.gating !== "all" && app.accessStatus !== state.filters.gating) return false;
  if (state.filters.mcp !== "all" && app.mcpStatus !== state.filters.mcp) return false;
  if (state.filters.review !== "all" && (app.humanReviewRequired ? "required" : "not_required") !== state.filters.review) {
    return false;
  }
  if (state.filters.confidence !== "all" && app.confidenceBucket !== state.filters.confidence) return false;
  if (state.filters.highConfidenceOnly && app.confidence < 0.8) return false;
  if (state.filters.correctedOnly && !app.isCorrected) return false;
  return true;
}

function getFilteredResults() {
  const searchQuery = state.filters.search;
  const withScores = normalizedApps
    .filter((app) => matchesFilters(app))
    .map((app) => ({ app, score: scoreApp(app, searchQuery) }));

  const filtered = searchQuery
    ? withScores.filter((entry) => entry.score > 0)
    : withScores;

  filtered.sort((a, b) => {
    if (searchQuery && b.score !== a.score) return b.score - a.score;
    if (b.app.confidence !== a.app.confidence) return b.app.confidence - a.app.confidence;
    return a.app.name.localeCompare(b.app.name);
  });

  return filtered.map((entry) => entry.app);
}

function renderExploreCards(filtered) {
  const node = document.getElementById("app-explorer-grid");
  if (!node) return;
  node.innerHTML = filtered
    .map((app) => {
      const matchedBadges = getMatchedFieldBadges(app, state.filters.search);
      return `
        <article class="app-card mini-card" data-app-id="${escapeHtml(app.id)}">
          <div class="card-topline">
            <div>
              <h3>${escapeHtml(app.name)}</h3>
              <div class="meta-row">
                <span class="pill">${escapeHtml(app.category)}</span>
                ${statusTag(app.buildability)}
                ${statusTag(app.accessStatus)}
              </div>
            </div>
            <div class="confidence-pill ${app.confidenceBucket}">${app.confidence.toFixed(2)}</div>
          </div>
          <p>${escapeHtml(app.description)}</p>
          <div class="meta-row">${app.authMethods.map((method) => statusTag(method)).join(" ")}</div>
          <p><strong>Blocker:</strong> ${escapeHtml(app.blocker)}</p>
          <div class="meta-row">
            ${app.isCorrected ? '<span class="pill">Corrected</span>' : ""}
            ${app.humanReviewRequired ? '<span class="pill warning">Human review</span>' : ""}
            ${matchedBadges}
          </div>
        </article>
      `;
    })
    .join("");
}

function getMatchedFieldBadges(app, query) {
  if (!query) return "";
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(normalizedQuery);
  if (!tokens.length) return "";

  const badges = new Set();
  tokens.forEach((token) => {
    if (app.normalizedName.includes(token)) badges.add("matched name");
    if (app.normalizedCategory.includes(token)) badges.add("matched category");
    if (normalizeText(app.authText).includes(token)) badges.add("matched auth");
    if (normalizeText(app.blocker).includes(token)) badges.add("matched blocker");
  });
  return Array.from(badges)
    .map((label) => `<span class="pill subtle">${escapeHtml(label)}</span>`)
    .join("");
}

function renderResultsTable(filtered) {
  const node = document.getElementById("results-table");
  if (!node) return;
  const rows = filtered
    .map(
      (app) => `
        <tr data-app-id="${escapeHtml(app.id)}">
          <td><button class="table-app-button" type="button" data-app-open="${escapeHtml(app.id)}">${escapeHtml(app.name)}</button></td>
          <td>${escapeHtml(app.category)}</td>
          <td>${escapeHtml(app.description)}</td>
          <td>${app.authMethods.map((method) => statusTag(method)).join(" ")}</td>
          <td>${statusTag(app.accessStatus)}</td>
          <td>${statusTag(app.apiSurface)}</td>
          <td>${statusTag(app.mcpStatus)}</td>
          <td>${statusTag(app.buildability)}</td>
          <td>${escapeHtml(app.blocker)}</td>
          <td><span class="confidence-pill ${app.confidenceBucket}">${app.confidence.toFixed(2)}</span></td>
        </tr>
      `
    )
    .join("");
  node.innerHTML = `
    <thead>
      <tr>
        <th>App</th>
        <th>Category</th>
        <th>Description</th>
        <th>Auth</th>
        <th>Access</th>
        <th>API surface</th>
        <th>MCP</th>
        <th>Buildability</th>
        <th>Blocker</th>
        <th>Confidence</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderActiveConstraints() {
  const node = document.getElementById("active-constraints");
  if (!node) return;
  const searchText = state.filters.search ? `Search: "${escapeHtml(state.filters.search)}"` : "Search: none";
  const filters = [];
  if (state.filters.category !== "all") filters.push(`Category = ${humanize(state.filters.category)}`);
  if (state.filters.auth !== "all") filters.push(`Auth = ${humanize(state.filters.auth)}`);
  if (state.filters.buildability !== "all") filters.push(`Buildability = ${humanize(state.filters.buildability)}`);
  if (state.filters.gating !== "all") filters.push(`Access = ${humanize(state.filters.gating)}`);
  if (state.filters.mcp !== "all") filters.push(`MCP = ${humanize(state.filters.mcp)}`);
  if (state.filters.review !== "all") filters.push(`Review = ${humanize(state.filters.review)}`);
  if (state.filters.confidence !== "all") filters.push(`Confidence = ${humanize(state.filters.confidence)}`);
  if (state.filters.highConfidenceOnly) filters.push("High-confidence only");
  if (state.filters.correctedOnly) filters.push("Corrected apps only");
  node.innerHTML = `${searchText}. Filters: ${filters.length ? escapeHtml(filters.join(", ")) : "none"}.`;
}

function updateResultCount(filtered) {
  const countNode = document.getElementById("result-count");
  const emptyNode = document.getElementById("empty-state");
  if (countNode) countNode.textContent = `Showing ${filtered.length} of ${normalizedApps.length} apps`;
  if (emptyNode) emptyNode.hidden = filtered.length !== 0;
}

function renderFilteredViews() {
  const filtered = getFilteredResults();
  renderExploreCards(filtered);
  renderResultsTable(filtered);
  updateResultCount(filtered);
  renderActiveConstraints();
  bindAppOpeners();
}

function buildHumanReviewNote(app) {
  const correctionEntry = correctionMap.get(app.correctedKey);
  if (correctionEntry) return correctionEntry.reviewer_note;
  if (app.humanReviewRequired) {
    return "This app was flagged for human review because confidence is lower or some fields remain partially unclear.";
  }
  return "No extra human review note recorded for this app.";
}

function drawerSection(label, content) {
  return `
    <div class="drawer-section">
      <div class="drawer-label">${escapeHtml(label)}</div>
      <div class="drawer-content">${content}</div>
    </div>
  `;
}

function openDrawer(appId) {
  const app = appsById.get(String(appId));
  if (!app) return;
  state.activeDrawerId = appId;
  const correctionEntry = correctionMap.get(app.correctedKey);
  const titleNode = document.getElementById("drawer-title");
  const bodyNode = document.getElementById("drawer-body");
  const drawer = document.getElementById("detail-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  if (!titleNode || !bodyNode || !drawer || !backdrop) return;
  titleNode.textContent = app.name;
  bodyNode.innerHTML = `
    <div class="drawer-summary">
      <div class="meta-row">
        <span class="pill">${escapeHtml(app.category)}</span>
        ${statusTag(app.buildability)}
        ${statusTag(app.accessStatus)}
        ${statusTag(app.apiSurface)}
        ${statusTag(app.mcpStatus)}
        <span class="confidence-pill ${app.confidenceBucket}">${app.confidence.toFixed(2)}</span>
      </div>
      <p>${escapeHtml(app.description)}</p>
    </div>
    ${drawerSection("Auth methods", app.authMethods.length ? app.authMethods.map((method) => statusTag(method)).join(" ") : "<p>Not available</p>")}
    ${drawerSection("Main blocker", `<p>${escapeHtml(app.blocker)}</p>`)}
    ${drawerSection("Notes", `<p>${escapeHtml(app.notes || "Not available")}</p>`)}
    ${drawerSection("Human review note", `<p>${escapeHtml(buildHumanReviewNote(app))}</p>`)}
    ${drawerSection("Evidence URLs", evidenceLinkGroup(app.evidenceUrls, true))}
    ${
      correctionEntry
        ? drawerSection(
            "Corrections",
            (correctionEntry.corrections || [])
              .map(
                (corr) => `
                  <div class="before-after-row">
                    <div class="before-after-label">${escapeHtml(humanize(corr.field_name))}</div>
                    <div class="before-after-values">
                      <span class="before-chip">Before: ${escapeHtml(corr.original_value)}</span>
                      <span class="after-chip">After: ${escapeHtml(corr.corrected_value)}</span>
                    </div>
                  </div>
                `
              )
              .join("")
          )
        : ""
    }
  `;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  backdrop.hidden = false;
  bindCopyButtons();
}

function closeDrawer() {
  const drawer = document.getElementById("detail-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  if (drawer) {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  if (backdrop) backdrop.hidden = true;
  state.activeDrawerId = null;
}

function bindCopyButtons() {
  document.querySelectorAll(".copy-link").forEach((button) => {
    button.onclick = async () => {
      const text = button.dataset.copy || "";
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1200);
      } catch (_error) {
        button.textContent = "Failed";
      }
    };
  });
}

function bindAppOpeners() {
  document.querySelectorAll("[data-app-id], [data-app-open]").forEach((node) => {
    node.onclick = (event) => {
      if (event.target.closest("a") || event.target.closest(".copy-link") || event.target.closest(".tiny-button")) {
        return;
      }
      openDrawer(node.dataset.appId || node.dataset.appOpen);
    };
  });
}

function initDrawer() {
  const close = document.getElementById("drawer-close");
  const backdrop = document.getElementById("drawer-backdrop");
  if (close) close.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);
}

function exportFilteredCsv() {
  const filtered = getFilteredResults();
  const rows = [
    [
      "app_name",
      "category",
      "auth_methods",
      "self_serve_status",
      "api_surface",
      "existing_mcp",
      "buildability_verdict",
      "main_blocker",
      "confidence_score",
      "notes",
    ],
    ...filtered.map((app) => [
      app.name,
      app.category,
      app.authMethods.join("|"),
      app.accessStatus,
      app.apiSurface,
      app.mcpStatus,
      app.buildability,
      app.blocker,
      app.confidence,
      app.notes,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "filtered_results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function renderProof() {
  const metadata = payload.metadata || {};
  const node = document.getElementById("proof-section");
  if (!node) return;
  node.innerHTML = `
    <article class="mini-card">
      <p><strong>Submitted run:</strong> This submitted run is real_cached: it uses an evidence-backed official-doc research catalog for reproducibility.</p>
      <p><strong>Live mode honesty:</strong> The repo supports optional Composio SDK/MCP-ready live mode plus Tavily/SerpAPI adapters, but live HTTP research was not executed in this submitted run.</p>
      <p><strong>Correction policy:</strong> Final table includes human-reviewed corrections from the verification sample.</p>
      <p><strong>Do not overclaim:</strong> This dashboard does not claim a fully autonomous live research run.</p>
      <div class="proof-actions">
        <a class="action-button primary" href="${escapeHtml(metadata.deployed_link_placeholder || "#")}" target="_blank" rel="noopener noreferrer">Deployment</a>
        <a class="action-button secondary" href="${escapeHtml(metadata.repo_link_placeholder || "#")}" target="_blank" rel="noopener noreferrer">Repository</a>
      </div>
      <div class="proof-grid">
        <div><strong>Generate report:</strong> <code>python src/generate_report.py</code></div>
        <div><strong>Smoke check:</strong> <code>python src/smoke_check.py</code></div>
        <div><strong>Results path:</strong> ${escapeHtml(metadata.results_path || "Not available")}</div>
        <div><strong>Verification path:</strong> ${escapeHtml(metadata.verification_path || "Not available")}</div>
      </div>
    </article>
  `;
}

function initActiveNav() {
  const sections = navLinks()
    .map(([id]) => document.getElementById(id))
    .filter(Boolean);
  const links = Array.from(document.querySelectorAll(".nav-link"));
  if (!sections.length || !links.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((link) => link.classList.toggle("active", link.dataset.target === entry.target.id));
        }
      });
    },
    { rootMargin: "-35% 0px -50% 0px", threshold: 0.08 }
  );
  sections.forEach((section) => observer.observe(section));
}

function initEscapeKey() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.activeDrawerId) closeDrawer();
  });
}

renderNav();
initTheme();
renderModeBanner();
renderHeroMeta();
renderReadingCard();
renderInsightCards();
renderExecutiveSummary();
renderVerification();
renderCorrectionApps();
renderWorkSplit();
renderWorkflowPipeline();
renderHeadlineInsights();
renderDistributionBars("auth-patterns", payload.auth_patterns || {});
renderDistributionBars("buildability-patterns", payload.buildability_patterns || {});
renderDistributionBars("mcp-patterns", payload.mcp_patterns || {});
renderDistributionBars("blocker-patterns", payload.blocker_patterns || {}, false);
renderMatrix();
renderQueue("build-queue-list", normalizedApps.filter((app) => app.buildability === "buildable_today" && app.accessStatus === "self_serve" && app.confidence >= 0.8).sort((a, b) => b.confidence - a.confidence).slice(0, 12), "build");
renderQueue("outreach-queue", normalizedApps.filter((app) => app.buildability === "needs_outreach").sort((a, b) => b.confidence - a.confidence).slice(0, 12), "outreach");
renderQueue("low-confidence", normalizedApps.filter((app) => app.humanReviewRequired).sort((a, b) => a.confidence - b.confidence).slice(0, 12), "review");
initFilters();
renderFilteredViews();
renderProof();
initDrawer();
initActiveNav();
initEscapeKey();
