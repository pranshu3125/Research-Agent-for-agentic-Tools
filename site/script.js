const payload = JSON.parse(document.getElementById("report-data").textContent);
const results = payload.results;
const correctedApps = new Set(payload.corrected_app_names || []);
const correctionMap = new Map((payload.corrections || []).map((item) => [item.app_name, item]));
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
  activeDrawerApp: null,
};

function humanize(value) {
  return String(value || "").replaceAll("_", " ");
}

function safeId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function confidenceBand(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function statusTag(value) {
  return `<span class="status ${value}">${humanize(value)}</span>`;
}

function formatMetric(value) {
  return typeof value === "number" && value < 1 ? value.toFixed(2) : value;
}

function getReviewStatus(app) {
  return app.low_confidence || (app.uncertain_fields || []).length > 0 ? "required" : "not_required";
}

function getAppSearchText(app) {
  return [
    app.app_name,
    app.category,
    app.one_line_description,
    app.auth_methods.join(" "),
    app.self_serve_status,
    app.api_surface,
    app.buildability_verdict,
    app.main_blocker,
    app.notes,
    app.evidence_urls.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

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
  if (toggle) {
    toggle.textContent = state.theme === "dark" ? "Light mode" : "Dark mode";
  }
}

function initTheme() {
  applyTheme();
  document.getElementById("theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
  });
}

function renderModeBanner() {
  const metadata = payload.metadata;
  document.getElementById("mode-banner").innerHTML = `
    <div class="badge-row">
      <span class="mode-badge primary">real_cached submitted run</span>
      <span class="mode-badge secondary">Composio SDK/MCP-ready</span>
      <span class="mode-badge secondary">${metadata.live_search_enabled ? "live provider configured" : "live search not executed"}</span>
    </div>
    <p class="mode-copy">${metadata.mode_summary}</p>
  `;
}

function renderHeroMeta() {
  const metadata = payload.metadata;
  document.getElementById("hero-actions").innerHTML = `
    <a class="action-button primary" href="${metadata.deployed_link_placeholder}" target="_blank" rel="noreferrer">Open deployment</a>
    <a class="action-button secondary" href="${metadata.repo_link_placeholder}" target="_blank" rel="noreferrer">Source repo</a>
  `;
}

function renderReadingCard() {
  document.getElementById("reading-card").innerHTML = `
    <h3>How to use this dashboard</h3>
    <ul>
      <li>Scan the KPI strip and verification snapshot first.</li>
      <li>Use Build Queue and Outreach Queue to understand product actionability.</li>
      <li>Search or filter the 100 apps, then open the detail drawer to inspect evidence and reasoning.</li>
    </ul>
  `;
}

function renderInsightCards() {
  document.getElementById("insight-cards").innerHTML = payload.kpi_cards
    .map(
      (card) => `
        <article class="metric-card kpi-card ${card.tone}">
          <div class="metric-label">${card.label}</div>
          <div class="metric-value">${formatMetric(card.value)}</div>
        </article>
      `
    )
    .join("");
}

function renderExecutiveSummary() {
  document.getElementById("executive-summary").innerHTML = payload.executive_summary
    .map((item) => `<article class="mini-card"><p>${item}</p></article>`)
    .join("");
}

function renderVerification() {
  const verification = payload.verification;
  const cards = [
    ["Sample size", verification.sample_size],
    ["First-pass app accuracy", verification.first_pass_app_accuracy],
    ["First-pass field accuracy", verification.first_pass_field_accuracy],
    ["Post-verification accuracy", verification.verified_accuracy_estimate],
    ["Corrections made", payload.correction_apps.length],
  ];
  document.getElementById("verification-summary").innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="mini-card verification-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${formatMetric(value)}</div>
        </article>
      `
    )
    .join("");

  document.getElementById("verification-note").innerHTML = `
    <article class="mini-card">
      <p><strong>Selection strategy:</strong> ${verification.selection_strategy}</p>
      <p><strong>Corrected apps:</strong> ${(payload.corrected_app_names || []).join(", ") || "not available"}</p>
      <p><strong>Honesty note:</strong> Final table includes human-reviewed corrections. The submitted run remains real_cached and does not claim a fully autonomous live research pass.</p>
    </article>
  `;

  document.getElementById("corrections").innerHTML = (payload.corrections || [])
    .map(
      (entry) => `
        <article class="mini-card correction-detail-card">
          <div class="card-topline">
            <div>
              <h3>${entry.app_name}</h3>
              <div class="meta-row">
                <span class="pill">${entry.category}</span>
                <span class="pill">Corrected</span>
              </div>
            </div>
          </div>
          <p>${entry.reviewer_note}</p>
          <div class="before-after-grid">
            ${entry.corrections
              .map(
                (corr) => `
                  <div class="before-after-row">
                    <div class="before-after-label">${humanize(corr.field_name)}</div>
                    <div class="before-after-values">
                      <span class="before-chip">Before: ${corr.original_value}</span>
                      <span class="after-chip">After: ${corr.corrected_value}</span>
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

function renderCorrectionApps() {
  document.getElementById("correction-apps").innerHTML = (payload.correction_apps || [])
    .map(
      (item) => `
        <article class="mini-card correction-summary-card">
          <div class="card-topline">
            <div>
              <h3>${item.app_name}</h3>
              <div class="meta-row">
                <span class="pill">${item.category}</span>
                <span class="pill">${item.field_count} corrected field${item.field_count === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>
          <p><strong>Fields:</strong> ${item.fields.map((field) => humanize(field)).join(", ")}</p>
          <p>${item.reviewer_note}</p>
        </article>
      `
    )
    .join("");
}

function renderWorkSplit() {
  const card = (title, rows) => `
    <article class="mini-card">
      <h3>${title}</h3>
      <ul class="compact-list">
        ${rows.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    </article>
  `;
  document.getElementById("work-split").innerHTML = [
    card("Agent / pipeline did", payload.agent_did),
    card("Human did", payload.human_did),
  ].join("");
}

function renderWorkflowPipeline() {
  document.getElementById("workflow-pipeline").innerHTML = workflowSteps
    .map(
      (step, index) => `
        <div class="pipeline-step">
          <div class="pipeline-index">${index + 1}</div>
          <div class="pipeline-label">${step}</div>
        </div>
      `
    )
    .join('<div class="pipeline-arrow">→</div>');
}

function renderHeadlineInsights() {
  document.getElementById("headline-insights").innerHTML = payload.insights.headline_insights
    .map((item) => `<article class="mini-card"><p>${item}</p></article>`)
    .join("");
}

function distributionTone(label) {
  if (["buildable_today", "self_serve", "official", "oauth2", "high"].includes(label)) return "fill-green";
  if (["buildable_with_limitations", "partially_gated", "unofficial", "api_key", "token", "medium"].includes(label)) return "fill-amber";
  if (["needs_outreach", "gated", "not_buildable_now", "required"].includes(label)) return "fill-orange";
  if (["unclear", "none_found", "low", "not_required"].includes(label)) return "fill-gray";
  return "fill-blue";
}

function renderDistributionBars(targetId, data, chipLabels = true) {
  const total = Object.values(data).reduce((sum, count) => sum + count, 0) || 1;
  const target = document.getElementById(targetId);
  target.innerHTML = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => {
      const pct = Math.round((count / total) * 100);
      const labelHtml = chipLabels ? statusTag(label) : `<span class="bar-label">${label}</span>`;
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
  const rows = Object.entries(payload.category_matrix)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([category, metrics]) => `
        <tr>
          <td>${category}</td>
          <td>${metrics.self_serve}</td>
          <td>${metrics.gated}</td>
          <td>${metrics.buildable_today}</td>
          <td>${metrics.needs_outreach}</td>
          <td>${metrics.unclear}</td>
        </tr>
      `
    )
    .join("");
  document.getElementById("matrix-table").innerHTML = `
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
      ${urls
        .map((url, index) => {
          const copyButton = includeCopy
            ? `<button class="tiny-button copy-link" type="button" data-copy="${url}">Copy</button>`
            : "";
          return `
            <div class="evidence-item">
              <a class="evidence-link" href="${url}" target="_blank" rel="noreferrer">Evidence ${index + 1}</a>
              ${copyButton}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderQueue(targetId, rows, kind) {
  document.getElementById(targetId).innerHTML = rows
    .map(
      (item) => `
        <article class="queue-card mini-card" data-app-card="${item.app_name}">
          <div class="card-topline">
            <div>
              <h3>${item.app_name}</h3>
              <div class="meta-row">
                <span class="pill">${item.category}</span>
                ${statusTag(item.buildability_verdict)}
                ${statusTag(item.self_serve_status)}
              </div>
            </div>
            <div class="confidence-pill ${confidenceBand(item.confidence_score)}">${item.confidence_score.toFixed(2)}</div>
          </div>
          <p>${item.one_line_description}</p>
          <p><strong>${
            kind === "build"
              ? "Why it is attractive:"
              : kind === "review"
                ? "Why it needs human review:"
                : "Why outreach matters:"
          }</strong> ${item.main_blocker}</p>
          <p><strong>Auth:</strong> ${item.auth_methods.join(", ")}</p>
          ${evidenceLinkGroup(item.evidence_urls)}
        </article>
      `
    )
    .join("");
}

function getFilterOptions() {
  return {
    categories: ["all", ...new Set(results.map((item) => item.category))],
    authMethods: ["all", ...new Set(results.flatMap((item) => item.auth_methods))],
    buildability: ["all", ...new Set(results.map((item) => item.buildability_verdict))],
    gating: ["all", ...new Set(results.map((item) => item.self_serve_status))],
    mcp: ["all", ...new Set(results.map((item) => item.existing_mcp))],
    review: ["all", "required", "not_required"],
    confidence: ["all", "high", "medium", "low"],
  };
}

function fillSelect(selectId, options, labelPrefix) {
  const select = document.getElementById(selectId);
  select.innerHTML = options
    .map((value) => `<option value="${value}">${value === "all" ? labelPrefix : humanize(value)}</option>`)
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

  document.getElementById("search-input").addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderFilteredViews();
  });

  [
    ["category-filter", "category"],
    ["auth-filter", "auth"],
    ["buildability-filter", "buildability"],
    ["gating-filter", "gating"],
    ["mcp-filter", "mcp"],
    ["review-filter", "review"],
    ["confidence-filter", "confidence"],
  ].forEach(([id, key]) => {
    document.getElementById(id).addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      renderFilteredViews();
    });
  });

  document.getElementById("clear-filters").addEventListener("click", () => {
    state.filters = {
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
    };
    document.getElementById("search-input").value = "";
    initFilterControlState();
    renderFilteredViews();
  });

  document.getElementById("toggle-high-confidence").addEventListener("click", () => {
    state.filters.highConfidenceOnly = !state.filters.highConfidenceOnly;
    syncToggleStates();
    renderFilteredViews();
  });

  document.getElementById("toggle-corrected").addEventListener("click", () => {
    state.filters.correctedOnly = !state.filters.correctedOnly;
    syncToggleStates();
    renderFilteredViews();
  });

  document.getElementById("filter-toggle").addEventListener("click", () => {
    document.getElementById("filters-panel").classList.toggle("open");
  });

  document.getElementById("export-csv").addEventListener("click", exportFilteredCsv);
  initFilterControlState();
}

function initFilterControlState() {
  document.getElementById("category-filter").value = state.filters.category;
  document.getElementById("auth-filter").value = state.filters.auth;
  document.getElementById("buildability-filter").value = state.filters.buildability;
  document.getElementById("gating-filter").value = state.filters.gating;
  document.getElementById("mcp-filter").value = state.filters.mcp;
  document.getElementById("review-filter").value = state.filters.review;
  document.getElementById("confidence-filter").value = state.filters.confidence;
  syncToggleStates();
}

function syncToggleStates() {
  document.getElementById("toggle-high-confidence").classList.toggle("active", state.filters.highConfidenceOnly);
  document.getElementById("toggle-corrected").classList.toggle("active", state.filters.correctedOnly);
}

function getFilteredResults() {
  return results.filter((app) => {
    if (state.filters.search && !getAppSearchText(app).includes(state.filters.search)) return false;
    if (state.filters.category !== "all" && app.category !== state.filters.category) return false;
    if (state.filters.auth !== "all" && !app.auth_methods.includes(state.filters.auth)) return false;
    if (state.filters.buildability !== "all" && app.buildability_verdict !== state.filters.buildability) return false;
    if (state.filters.gating !== "all" && app.self_serve_status !== state.filters.gating) return false;
    if (state.filters.mcp !== "all" && app.existing_mcp !== state.filters.mcp) return false;
    if (state.filters.review !== "all" && getReviewStatus(app) !== state.filters.review) return false;
    if (state.filters.confidence !== "all" && confidenceBand(app.confidence_score) !== state.filters.confidence) return false;
    if (state.filters.highConfidenceOnly && app.confidence_score < 0.8) return false;
    if (state.filters.correctedOnly && !correctedApps.has(app.app_name)) return false;
    return true;
  });
}

function renderExploreCards(filtered) {
  document.getElementById("app-explorer-grid").innerHTML = filtered
    .map(
      (app) => `
        <article class="app-card mini-card" data-app-card="${app.app_name}">
          <div class="card-topline">
            <div>
              <h3>${app.app_name}</h3>
              <div class="meta-row">
                <span class="pill">${app.category}</span>
                ${statusTag(app.buildability_verdict)}
                ${statusTag(app.self_serve_status)}
              </div>
            </div>
            <div class="confidence-pill ${confidenceBand(app.confidence_score)}">${app.confidence_score.toFixed(2)}</div>
          </div>
          <p>${app.one_line_description}</p>
          <div class="meta-row">
            ${app.auth_methods.map((method) => statusTag(method)).join("")}
          </div>
          <p><strong>Blocker:</strong> ${app.main_blocker}</p>
          <div class="meta-row">
            ${correctedApps.has(app.app_name) ? '<span class="pill">Corrected</span>' : ""}
            ${getReviewStatus(app) === "required" ? '<span class="pill warning">Human review</span>' : ""}
          </div>
        </article>
      `
    )
    .join("");
}

function renderResultsTable(filtered) {
  const rows = filtered
    .map(
      (app) => `
        <tr data-app-row="${app.app_name}">
          <td><button class="table-app-button" type="button" data-app-open="${app.app_name}">${app.app_name}</button></td>
          <td>${app.category}</td>
          <td>${app.one_line_description}</td>
          <td>${app.auth_methods.map((method) => statusTag(method)).join(" ")}</td>
          <td>${statusTag(app.self_serve_status)}</td>
          <td>${statusTag(app.api_surface)}</td>
          <td>${statusTag(app.existing_mcp)}</td>
          <td>${statusTag(app.buildability_verdict)}</td>
          <td>${app.main_blocker}</td>
          <td><span class="confidence-pill ${confidenceBand(app.confidence_score)}">${app.confidence_score.toFixed(2)}</span></td>
        </tr>
      `
    )
    .join("");
  document.getElementById("results-table").innerHTML = `
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

function updateResultCount(filtered) {
  document.getElementById("result-count").textContent = `Showing ${filtered.length} of ${results.length} apps`;
  document.getElementById("empty-state").hidden = filtered.length !== 0;
}

function renderFilteredViews() {
  const filtered = getFilteredResults();
  renderExploreCards(filtered);
  renderResultsTable(filtered);
  updateResultCount(filtered);
  bindAppOpeners();
}

function buildHumanReviewNote(app) {
  if (correctionMap.has(app.app_name)) {
    return correctionMap.get(app.app_name).reviewer_note;
  }
  if (getReviewStatus(app) === "required") {
    return "This app was flagged for human review because confidence is lower or some fields remain partially unclear.";
  }
  return "No extra human review note recorded for this app.";
}

function drawerSection(label, content) {
  return `
    <div class="drawer-section">
      <div class="drawer-label">${label}</div>
      <div class="drawer-content">${content}</div>
    </div>
  `;
}

function openDrawer(appName) {
  const app = results.find((item) => item.app_name === appName);
  if (!app) return;
  state.activeDrawerApp = appName;
  const correctionEntry = correctionMap.get(app.app_name);
  document.getElementById("drawer-title").textContent = app.app_name;
  document.getElementById("drawer-body").innerHTML = `
    <div class="drawer-summary">
      <div class="meta-row">
        <span class="pill">${app.category}</span>
        ${statusTag(app.buildability_verdict)}
        ${statusTag(app.self_serve_status)}
        <span class="confidence-pill ${confidenceBand(app.confidence_score)}">${app.confidence_score.toFixed(2)}</span>
      </div>
      <p>${app.one_line_description}</p>
    </div>
    ${drawerSection("Auth methods", app.auth_methods.map((method) => statusTag(method)).join(" "))}
    ${drawerSection("API surface", `${statusTag(app.api_surface)} ${statusTag(app.existing_mcp)}`)}
    ${drawerSection("Main blocker", `<p>${app.main_blocker}</p>`)}
    ${drawerSection("Notes", `<p>${app.notes}</p>`)}
    ${drawerSection("Human review note", `<p>${buildHumanReviewNote(app)}</p>`)}
    ${drawerSection("Evidence URLs", evidenceLinkGroup(app.evidence_urls, true))}
    ${
      correctionEntry
        ? drawerSection(
            "Corrections",
            correctionEntry.corrections
              .map(
                (corr) => `
                  <div class="before-after-row">
                    <div class="before-after-label">${humanize(corr.field_name)}</div>
                    <div class="before-after-values">
                      <span class="before-chip">Before: ${corr.original_value}</span>
                      <span class="after-chip">After: ${corr.corrected_value}</span>
                    </div>
                  </div>
                `
              )
              .join("")
          )
        : ""
    }
  `;
  document.getElementById("detail-drawer").classList.add("open");
  document.getElementById("detail-drawer").setAttribute("aria-hidden", "false");
  document.getElementById("drawer-backdrop").hidden = false;
  bindCopyButtons();
}

function closeDrawer() {
  document.getElementById("detail-drawer").classList.remove("open");
  document.getElementById("detail-drawer").setAttribute("aria-hidden", "true");
  document.getElementById("drawer-backdrop").hidden = true;
  state.activeDrawerApp = null;
}

function bindCopyButtons() {
  document.querySelectorAll(".copy-link").forEach((button) => {
    button.addEventListener("click", async () => {
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
    });
  });
}

function bindAppOpeners() {
  document.querySelectorAll("[data-app-card], [data-app-open]").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("a") || event.target.closest(".copy-link") || event.target.closest(".tiny-button")) {
        return;
      }
      openDrawer(node.dataset.appCard || node.dataset.appOpen);
    });
  });
}

function initDrawer() {
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);
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
    ],
    ...filtered.map((app) => [
      app.app_name,
      app.category,
      app.auth_methods.join("|"),
      app.self_serve_status,
      app.api_surface,
      app.existing_mcp,
      app.buildability_verdict,
      app.main_blocker,
      app.confidence_score,
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",")
    )
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
  const metadata = payload.metadata;
  document.getElementById("proof-section").innerHTML = `
    <article class="mini-card">
      <p><strong>Submitted run:</strong> This submitted run is real_cached: it uses an evidence-backed official-doc research catalog for reproducibility.</p>
      <p><strong>Live mode honesty:</strong> The repo supports optional Composio SDK/MCP-ready live mode plus Tavily/SerpAPI adapters, but live HTTP research was not executed in this submitted run.</p>
      <p><strong>Correction policy:</strong> Final table includes human-reviewed corrections from the verification sample.</p>
      <p><strong>Do not overclaim:</strong> This dashboard does not claim a fully autonomous live research run.</p>
      <div class="proof-actions">
        <a class="action-button primary" href="${metadata.deployed_link_placeholder}" target="_blank" rel="noreferrer">Deployment</a>
        <a class="action-button secondary" href="${metadata.repo_link_placeholder}" target="_blank" rel="noreferrer">Repository</a>
      </div>
      <div class="proof-grid">
        <div><strong>Generate report:</strong> <code>python src/generate_report.py</code></div>
        <div><strong>Smoke check:</strong> <code>python src/smoke_check.py</code></div>
        <div><strong>Results path:</strong> ${metadata.results_path}</div>
        <div><strong>Verification path:</strong> ${metadata.verification_path}</div>
      </div>
    </article>
  `;
}

function initActiveNav() {
  const sections = navLinks()
    .map(([id]) => document.getElementById(id))
    .filter(Boolean);
  const links = Array.from(document.querySelectorAll(".nav-link"));
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
    if (event.key === "Escape" && state.activeDrawerApp) closeDrawer();
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
renderDistributionBars("auth-patterns", payload.auth_patterns);
renderDistributionBars("buildability-patterns", payload.buildability_patterns);
renderDistributionBars("mcp-patterns", payload.mcp_patterns);
renderDistributionBars("blocker-patterns", payload.blocker_patterns, false);
renderMatrix();
renderQueue("build-queue-list", payload.easy_wins, "build");
renderQueue("outreach-queue", payload.outreach_needed, "outreach");
renderQueue("low-confidence", payload.low_confidence, "review");
initFilters();
renderFilteredViews();
renderProof();
initDrawer();
initActiveNav();
initEscapeKey();
