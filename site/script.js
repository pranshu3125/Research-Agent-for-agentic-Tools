const payload = JSON.parse(document.getElementById("report-data").textContent);
const results = payload.results;

function statusTag(value) {
  return `<span class="status ${value}">${value.replaceAll("_", " ")}</span>`;
}

function renderModeBanner() {
  const metadata = payload.metadata;
  document.getElementById("mode-banner").innerHTML = `
    <div class="mode-card">
      <strong>Report mode:</strong> ${metadata.mode_resolved.replaceAll("_", " ")}
      <span>${metadata.mode_summary}</span>
    </div>
  `;
}

function renderInsightCards() {
  const insights = payload.insights;
  const cards = [
    ["Total apps researched", insights.total_apps],
    ["Buildable today", insights.buildable_today],
    ["Buildable with limitations", insights.buildable_with_limitations],
    ["Needs outreach", insights.needs_outreach],
    ["Unclear or low-confidence", insights.unclear_count],
    ["Dominant auth", insights.dominant_auth_method],
    ["Common blocker", insights.most_common_blocker],
    ["Verification accuracy", insights.verification_accuracy],
  ];
  document.getElementById("insight-cards").innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <h3>${label}</h3>
          <div class="value">${value}</div>
        </article>
      `
    )
    .join("");
}

function renderHeadlineInsights() {
  document.getElementById("headline-insights").innerHTML = payload.insights.headline_insights
    .map(
      (item) => `
        <article class="list-card">
          <p>${item}</p>
        </article>
      `
    )
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
        <th>Gated / partially gated</th>
        <th>Buildable today</th>
        <th>Needs outreach</th>
        <th>Unclear / low confidence</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderCounterCards(targetId, data) {
  const items = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([label, count]) => `
        <article class="mini-card">
          <h3>${label.replaceAll("_", " ")}</h3>
          <div class="value">${count}</div>
        </article>
      `
    )
    .join("");
  document.getElementById(targetId).innerHTML = `<div class="card-grid">${items}</div>`;
}

function renderStackList(targetId, rows, showUncertain = false) {
  document.getElementById(targetId).innerHTML = rows
    .map(
      (item) => `
        <article class="list-card">
          <div class="section-heading">
            <h3>${item.app_name}</h3>
            ${statusTag(item.buildability_verdict)}
          </div>
          <p>${item.one_line_description}</p>
          <p><strong>Blocker:</strong> ${item.main_blocker}</p>
          <p><strong>Auth:</strong> ${item.auth_methods.join(", ")}</p>
          ${showUncertain ? `<p><strong>Uncertain fields:</strong> ${(item.uncertain_fields || []).join(", ") || "none"}</p>` : ""}
        </article>
      `
    )
    .join("");
}

function renderVerification() {
  const verification = payload.verification;
  const cards = [
    ["Sample size", verification.sample_size],
    ["First-pass app accuracy", verification.first_pass_app_accuracy],
    ["First-pass field accuracy", verification.first_pass_field_accuracy],
    ["Verified accuracy estimate", verification.verified_accuracy_estimate],
    ["Correction rate", verification.correction_rate],
  ];
  document.getElementById("verification-summary").innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="mini-card">
          <h3>${label}</h3>
          <div class="value">${value}</div>
        </article>
      `
    )
    .join("");

  document.getElementById("corrections").innerHTML = payload.corrections
    .map(
      (entry) => `
        <article class="list-card">
          <div class="section-heading">
            <h3>${entry.app_name}</h3>
            <span class="pill">${entry.category}</span>
          </div>
          <p>${entry.reviewer_note}</p>
          <p>${entry.corrections.map((c) => `${c.field_name}: ${c.original_value} -> ${c.corrected_value}`).join(" | ")}</p>
        </article>
      `
    )
    .join("");
}

function renderProof() {
  const metadata = payload.metadata;
  document.getElementById("proof-section").innerHTML = `
    <article class="list-card">
      <p><strong>Run real mode:</strong> <code>python src/run_research.py --mode real --limit 100</code></p>
      <p><strong>Run demo mode:</strong> <code>python src/run_research.py --mode demo</code></p>
      <p><strong>Run verification:</strong> <code>python src/verify.py --sample-size 15</code></p>
      <p><strong>Generate report:</strong> <code>python src/generate_report.py</code></p>
      <p><strong>Results saved to:</strong> ${metadata.results_path}</p>
      <p><strong>Verification saved to:</strong> ${metadata.verification_path}</p>
      <p><strong>Static page:</strong> ${metadata.site_path}</p>
      <p><strong>Repo link placeholder:</strong> ${metadata.repo_link_placeholder}</p>
      <p><strong>Deployed link placeholder:</strong> ${metadata.deployed_link_placeholder}</p>
    </article>
  `;
}

function initFilters() {
  const categories = ["all", ...new Set(results.map((item) => item.category))];
  const categoryFilter = document.getElementById("category-filter");
  const buildabilityFilter = document.getElementById("buildability-filter");
  const gatingFilter = document.getElementById("gating-filter");

  categoryFilter.innerHTML = categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");

  buildabilityFilter.innerHTML = [
    "all",
    "buildable_today",
    "buildable_with_limitations",
    "needs_outreach",
    "not_buildable_now",
    "unclear",
  ]
    .map((value) => `<option value="${value}">${value.replaceAll("_", " ")}</option>`)
    .join("");

  gatingFilter.innerHTML = ["all", "self_serve", "partially_gated", "gated", "unclear"]
    .map((value) => `<option value="${value}">${value.replaceAll("_", " ")}</option>`)
    .join("");

  ["text-filter", "category-filter", "buildability-filter", "gating-filter"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderResultsTable);
    document.getElementById(id).addEventListener("change", renderResultsTable);
  });
}

function getFilteredResults() {
  const text = document.getElementById("text-filter").value.trim().toLowerCase();
  const category = document.getElementById("category-filter").value;
  const buildability = document.getElementById("buildability-filter").value;
  const gating = document.getElementById("gating-filter").value;

  return results.filter((item) => {
    const haystack = [
      item.app_name,
      item.category,
      item.one_line_description,
      item.main_blocker,
      item.notes,
    ]
      .join(" ")
      .toLowerCase();

    if (text && !haystack.includes(text)) {
      return false;
    }
    if (category !== "all" && item.category !== category) {
      return false;
    }
    if (buildability !== "all" && item.buildability_verdict !== buildability) {
      return false;
    }
    if (gating !== "all" && item.self_serve_status !== gating) {
      return false;
    }
    return true;
  });
}

function renderResultsTable() {
  const filtered = getFilteredResults();
  const rows = filtered
    .map(
      (item) => `
        <tr>
          <td>${item.app_name}</td>
          <td>${item.category}</td>
          <td>${item.one_line_description}</td>
          <td>${item.auth_methods.join(", ")}</td>
          <td>${statusTag(item.self_serve_status)}</td>
          <td>${statusTag(item.api_surface)}</td>
          <td>${statusTag(item.existing_mcp)}</td>
          <td>${statusTag(item.buildability_verdict)}</td>
          <td>${item.main_blocker}</td>
          <td>${item.confidence_score}</td>
          <td>${item.evidence_urls.map((url) => `<a href="${url}" target="_blank" rel="noreferrer">source</a>`).join(" / ")}</td>
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
        <th>Evidence</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

renderModeBanner();
renderInsightCards();
renderHeadlineInsights();
renderMatrix();
renderCounterCards("auth-patterns", payload.auth_patterns);
renderCounterCards("mcp-patterns", payload.mcp_patterns);
renderStackList("easy-wins", payload.easy_wins);
renderStackList("outreach-needed", payload.outreach_needed);
renderStackList("low-confidence", payload.low_confidence, true);
renderVerification();
renderProof();
initFilters();
renderResultsTable();
