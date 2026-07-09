const payload = JSON.parse(document.getElementById("report-data").textContent);
const results = payload.results;

function humanize(value) {
  return String(value).replaceAll("_", " ");
}

function statusTag(value) {
  return `<span class="status ${value}">${humanize(value)}</span>`;
}

function confidenceBand(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function confidenceLabel(score) {
  return `${score.toFixed(2)} ${statusTag(confidenceBand(score))}`;
}

function uniqueAnchorLinks() {
  return [
    ["overview", "Overview"],
    ["insights", "Insights"],
    ["matrix", "Matrix"],
    ["easy-wins-section", "Easy Wins"],
    ["outreach-section", "Outreach"],
    ["verification", "Verification"],
    ["full-table", "Full Table"],
    ["proof", "Proof"],
  ];
}

function renderNav() {
  const nav = document.getElementById("top-nav");
  nav.innerHTML = `
    <div class="nav-inner">
      <div class="nav-brand">Composio Case Study</div>
      <div class="nav-links">
        ${uniqueAnchorLinks()
          .map(([id, label]) => `<a class="nav-link" href="#${id}" data-target="${id}">${label}</a>`)
          .join("")}
      </div>
    </div>
  `;
}

function renderModeBanner() {
  const metadata = payload.metadata;
  document.getElementById("mode-banner").innerHTML = `
    <div class="mode-panel">
      <div class="mini-tags">
        <span class="mode-chip">${humanize(metadata.mode_resolved)}</span>
        <span class="helper-chip">${metadata.live_search_enabled ? "live provider" : "submission run"}</span>
      </div>
      <p>${metadata.mode_summary}</p>
    </div>
  `;
}

function renderHeroMeta() {
  const metadata = payload.metadata;
  const target = document.getElementById("hero-actions");
  target.innerHTML = `
    <a class="action-button primary" href="${metadata.deployed_link_placeholder}" target="_blank" rel="noreferrer">Open Live Site</a>
    <a class="action-button secondary" href="${metadata.repo_link_placeholder}" target="_blank" rel="noreferrer">View Source Repo</a>
  `;
}

function renderReadingCard() {
  document.getElementById("reading-card").innerHTML = `
    <h3>How to read this report</h3>
    <ul>
      <li>Start with the insight cards and headline findings for the portfolio view.</li>
      <li>Use the recommended build queue and outreach queue to see where Composio should act first.</li>
      <li>Use the verification section to understand where the first pass was wrong and how corrections were applied.</li>
    </ul>
  `;
}

function renderInsightCards() {
  document.getElementById("insight-cards").innerHTML = payload.kpi_cards
    .map(
      (card) => `
        <article class="metric-card kpi-card ${card.tone}">
          <h3>${card.label}</h3>
          <div class="value">${typeof card.value === "number" && card.value < 1 ? card.value.toFixed(2) : card.value}</div>
          <div class="kpi-label">${card.label}</div>
        </article>
      `
    )
    .join("");
}

function renderExecutiveSummary() {
  document.getElementById("executive-summary").innerHTML = payload.executive_summary
    .map(
      (item) => `
        <article class="list-card">
          <p>${item}</p>
        </article>
      `
    )
    .join("");
}

function renderWorkSplit() {
  const card = (title, rows) => `
    <article class="mini-panel">
      <h3>${title}</h3>
      <ul class="compact-list">
        ${rows.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    </article>
  `;

  document.getElementById("work-split").innerHTML = [
    card("Agent / pipeline handled", payload.agent_did),
    card("Human review handled", payload.human_did),
  ].join("");
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

function distributionTone(label) {
  if (["buildable_today", "self_serve", "official", "oauth2"].includes(label)) return "fill-green";
  if (["buildable_with_limitations", "partially_gated", "unofficial", "api_key", "token"].includes(label)) return "fill-amber";
  if (["needs_outreach", "gated", "not_buildable_now"].includes(label)) return "fill-orange";
  if (["unclear", "none_found"].includes(label)) return "fill-gray";
  return "fill-blue";
}

function renderDistributionBars(targetId, data) {
  const total = Object.values(data).reduce((sum, count) => sum + count, 0) || 1;
  const html = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => {
      const pct = Math.round((count / total) * 100);
      return `
        <div class="distribution-row">
          <div class="distribution-meta">
            <div class="distribution-label">
              ${statusTag(label)}
            </div>
            <div>${count} <span class="meta-token">(${pct}%)</span></div>
          </div>
          <div class="distribution-track">
            <div class="distribution-fill ${distributionTone(label)}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
  document.getElementById(targetId).innerHTML = `<div class="distribution-list">${html}</div>`;
}

function renderNarrativeBars(targetId, data) {
  const total = Object.values(data).reduce((sum, count) => sum + count, 0) || 1;
  const html = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => {
      const pct = Math.round((count / total) * 100);
      return `
        <div class="distribution-row">
          <div class="distribution-meta narrative-meta">
            <div class="narrative-label">${label}</div>
            <div>${count} <span class="meta-token">(${pct}%)</span></div>
          </div>
          <div class="distribution-track">
            <div class="distribution-fill fill-blue" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
  document.getElementById(targetId).innerHTML = `<div class="distribution-list">${html}</div>`;
}

function evidenceLinks(urls) {
  return `
    <div class="evidence-row">
      ${urls
        .map(
          (url, index) =>
            `<a class="evidence-link" href="${url}" target="_blank" rel="noreferrer">Evidence ${index + 1}</a>`
        )
        .join("")}
    </div>
  `;
}

function renderQueue(targetId, rows, kind) {
  document.getElementById(targetId).innerHTML = rows
    .map((item) => {
      const whyLine =
        kind === "build"
          ? "Public docs, clear auth, and a relatively direct integration path make this a strong candidate for an early toolkit."
          : "This app looks strategically relevant, but access or approval friction makes outreach the practical next step.";
      const nextAction =
        kind === "build"
          ? "Prototype scoped CRUD flows and validate permission boundaries."
          : "Validate partner access, plan gating, or enterprise approval path before committing build time.";
      return `
        <article class="expand-card queue-card">
          <div class="queue-header">
            <div>
              <h3>${item.app_name}</h3>
              <div class="queue-meta">
                <span class="meta-token">${item.category}</span>
                ${statusTag(item.buildability_verdict)}
                ${statusTag(item.self_serve_status)}
              </div>
            </div>
            <div class="confidence-wrap">
              <div class="confidence-line">
                ${statusTag(confidenceBand(item.confidence_score))}
                <span class="meta-token">${item.confidence_score.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <p><strong>Why this matters:</strong> ${whyLine}</p>
          <p><strong>Auth:</strong> ${item.auth_methods.join(", ")}</p>
          <p><strong>Main blocker:</strong> ${item.main_blocker}</p>
          <p><strong>Suggested next action:</strong> ${nextAction}</p>
          ${evidenceLinks(item.evidence_urls)}
        </article>
      `;
    })
    .join("");
}

function renderLowConfidenceQueue() {
  const rows = payload.low_confidence.map(
    (item) => `
      <article class="expand-card queue-card">
        <div class="queue-header">
          <div>
            <h3>${item.app_name}</h3>
            <div class="queue-meta">
              <span class="meta-token">${item.category}</span>
              ${statusTag(item.buildability_verdict)}
            </div>
          </div>
          <div class="confidence-wrap">
            <div class="confidence-line">
              ${statusTag(confidenceBand(item.confidence_score))}
              <span class="meta-token">${item.confidence_score.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <p>${item.one_line_description}</p>
        <p><strong>Uncertain fields:</strong> ${(item.uncertain_fields || []).join(", ") || "none"}</p>
        <p><strong>Blocker:</strong> ${item.main_blocker}</p>
        ${evidenceLinks(item.evidence_urls)}
      </article>
    `
  );
  document.getElementById("low-confidence").innerHTML = rows.join("");
}

function renderExploreCards() {
  document.getElementById("explore-apps").innerHTML = results
    .map(
      (item, index) => `
        <article class="expand-card" data-expand-card>
          <button class="expand-toggle" type="button" aria-expanded="false" aria-controls="expand-${index}">
            <div class="expand-summary">
              <div>
                <h3>${item.app_name}</h3>
                <div class="expand-meta">
                  <span>${item.category}</span>
                  ${statusTag(item.buildability_verdict)}
                  <span>Confidence ${item.confidence_score.toFixed(2)}</span>
                </div>
              </div>
              <span class="expand-chevron">⌄</span>
            </div>
          </button>
          <div class="expand-content" id="expand-${index}">
            <p>${item.one_line_description}</p>
            <p><strong>Auth:</strong> ${item.auth_methods.join(", ")}</p>
            <p><strong>Self-serve status:</strong> ${humanize(item.self_serve_status)}</p>
            <p><strong>API surface:</strong> ${humanize(item.api_surface)}</p>
            <p><strong>MCP status:</strong> ${humanize(item.existing_mcp)}</p>
            <p><strong>Main blocker:</strong> ${item.main_blocker}</p>
            <p><strong>Notes:</strong> ${item.notes}</p>
            <p><strong>Uncertain fields:</strong> ${(item.uncertain_fields || []).join(", ") || "none"}</p>
            ${evidenceLinks(item.evidence_urls)}
          </div>
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
    ["Verified estimate", verification.verified_accuracy_estimate],
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

  document.getElementById("verification-note").innerHTML = `
    <article class="list-card">
      <p><strong>Selection strategy:</strong> ${verification.selection_strategy}</p>
      <p><strong>Correction policy:</strong> Verified corrections were applied back into the final results table, while this section preserves the original first-pass misses for transparency.</p>
      <p><strong>Accuracy note:</strong> First-pass app accuracy was ${verification.first_pass_app_accuracy.toFixed(2)} and the post-verification estimate is ${verification.verified_accuracy_estimate.toFixed(2)} for the sampled set.</p>
    </article>
  `;

  document.getElementById("corrections").innerHTML = payload.corrections
    .map(
      (entry) => `
        <article class="expand-card correction-card">
          <div class="section-heading">
            <h3>${entry.app_name}</h3>
            <span class="pill">${entry.category}</span>
          </div>
          <p>${entry.reviewer_note}</p>
          <div class="before-after">
            ${entry.corrections
              .map(
                (corr) => `
                  <div class="before-after-row">
                    <strong>${humanize(corr.field_name)}</strong>
                    <span>Before: ${corr.original_value}</span>
                    <span>After: ${corr.corrected_value}</span>
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
  document.getElementById("correction-apps").innerHTML = payload.correction_apps
    .map(
      (item) => `
        <article class="list-card correction-summary-card">
          <div class="card-topline">
            <div>
              <h3>${item.app_name}</h3>
              <div class="queue-meta">
                <span class="meta-token">${item.category}</span>
                <span class="meta-token">${item.field_count} corrected field${item.field_count === 1 ? "" : "s"}</span>
              </div>
            </div>
            <div class="status buildable_with_limitations">${item.fields.map((field) => humanize(field)).join(", ")}</div>
          </div>
          <p>${item.reviewer_note}</p>
        </article>
      `
    )
    .join("");
}

function renderBuildabilityBuckets() {
  renderDistributionBars("buildability-buckets", payload.buildability_patterns);
}

function renderProof() {
  const metadata = payload.metadata;
  document.getElementById("proof-section").innerHTML = `
    <article class="list-card">
      <div class="proof-list">
        <p><strong>Submitted run note:</strong> This submitted run is real_cached: it uses an evidence-backed official-doc research catalog for reproducibility. The repo supports live_search through Tavily/SerpAPI, but live HTTP research was not executed in the submitted run.</p>
        <p><strong>Run real mode:</strong> <code>python src/run_research.py --mode real --limit 100</code></p>
        <p><strong>Run demo mode:</strong> <code>python src/run_research.py --mode demo</code></p>
        <p><strong>Run optional Composio live mode:</strong> <code>python src/composio_research_agent.py --limit 5</code></p>
        <p><strong>Run verification:</strong> <code>python src/verify.py --sample-size 15</code></p>
        <p><strong>Generate report:</strong> <code>python src/generate_report.py</code></p>
        <p><strong>Results saved to:</strong> ${metadata.results_path}</p>
        <p><strong>Verification saved to:</strong> ${metadata.verification_path}</p>
        <p><strong>Static page:</strong> ${metadata.site_path}</p>
        <p><strong>Repository:</strong> <a href="${metadata.repo_link_placeholder}" target="_blank" rel="noreferrer">${metadata.repo_link_placeholder}</a></p>
        <p><strong>Deployment:</strong> <a href="${metadata.deployed_link_placeholder}" target="_blank" rel="noreferrer">${metadata.deployed_link_placeholder}</a></p>
      </div>
    </article>
  `;
}

function initFilters() {
  const categories = ["all", ...new Set(results.map((item) => item.category))];
  const categoryFilter = document.getElementById("category-filter");
  const buildabilityFilter = document.getElementById("buildability-filter");
  const gatingFilter = document.getElementById("gating-filter");
  const confidenceFilter = document.getElementById("confidence-filter");

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
    .map((value) => `<option value="${value}">${humanize(value)}</option>`)
    .join("");

  gatingFilter.innerHTML = ["all", "self_serve", "partially_gated", "gated", "unclear"]
    .map((value) => `<option value="${value}">${humanize(value)}</option>`)
    .join("");

  confidenceFilter.innerHTML = ["all", "high", "medium", "low"]
    .map((value) => `<option value="${value}">${humanize(value)}</option>`)
    .join("");

  ["text-filter", "category-filter", "buildability-filter", "gating-filter", "confidence-filter"].forEach(
    (id) => {
      document.getElementById(id).addEventListener("input", renderResultsTable);
      document.getElementById(id).addEventListener("change", renderResultsTable);
    }
  );
}

function getFilteredResults() {
  const text = document.getElementById("text-filter").value.trim().toLowerCase();
  const category = document.getElementById("category-filter").value;
  const buildability = document.getElementById("buildability-filter").value;
  const gating = document.getElementById("gating-filter").value;
  const confidence = document.getElementById("confidence-filter").value;

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

    if (text && !haystack.includes(text)) return false;
    if (category !== "all" && item.category !== category) return false;
    if (buildability !== "all" && item.buildability_verdict !== buildability) return false;
    if (gating !== "all" && item.self_serve_status !== gating) return false;
    if (confidence !== "all" && confidenceBand(item.confidence_score) !== confidence) return false;
    return true;
  });
}

function renderResultsTable() {
  const filtered = getFilteredResults();
  const rows = filtered
    .map(
      (item) => `
        <tr>
          <td><strong>${item.app_name}</strong></td>
          <td>${item.category}</td>
          <td>${item.one_line_description}</td>
          <td>${item.auth_methods.map((method) => statusTag(method)).join(" ")}</td>
          <td>${statusTag(item.self_serve_status)}</td>
          <td>${statusTag(item.api_surface)}</td>
          <td>${statusTag(item.existing_mcp)}</td>
          <td>${statusTag(item.buildability_verdict)}</td>
          <td>${item.main_blocker}</td>
          <td>
            <div class="confidence-wrap">
              <div class="confidence-line">
                <span>${item.confidence_score.toFixed(2)}</span>
                ${statusTag(confidenceBand(item.confidence_score))}
              </div>
              <div class="confidence-track">
                <div class="confidence-fill" style="width:${Math.round(item.confidence_score * 100)}%"></div>
              </div>
            </div>
          </td>
          <td>${item.evidence_urls.map((url, index) => `<a class="evidence-link" href="${url}" target="_blank" rel="noreferrer">Source ${index + 1}</a>`).join(" ")}</td>
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

function initExpandCards() {
  document.querySelectorAll("[data-expand-card]").forEach((card) => {
    const button = card.querySelector(".expand-toggle");
    const content = card.querySelector(".expand-content");
    if (!button || !content) return;
    button.addEventListener("click", () => {
      const open = card.classList.toggle("open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
}

function initActiveNav() {
  const sections = uniqueAnchorLinks()
    .map(([id]) => document.getElementById(id))
    .filter(Boolean);
  const links = Array.from(document.querySelectorAll(".nav-link"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((link) => {
            link.classList.toggle("active", link.dataset.target === entry.target.id);
          });
        }
      });
    },
    { rootMargin: "-40% 0px -45% 0px", threshold: 0.05 }
  );

  sections.forEach((section) => observer.observe(section));
}

renderNav();
renderModeBanner();
renderHeroMeta();
renderReadingCard();
renderInsightCards();
renderExecutiveSummary();
renderVerification();
renderCorrectionApps();
renderWorkSplit();
renderQueue("build-queue", payload.easy_wins, "build");
renderQueue("outreach-queue", payload.outreach_needed, "outreach");
renderHeadlineInsights();
renderMatrix();
renderDistributionBars("auth-patterns", payload.auth_patterns);
renderDistributionBars("buildability-patterns", payload.buildability_patterns);
renderNarrativeBars("blocker-patterns", payload.blocker_patterns);
renderDistributionBars("mcp-patterns", payload.mcp_patterns);
renderBuildabilityBuckets();
renderLowConfidenceQueue();
renderExploreCards();
renderProof();
initFilters();
renderResultsTable();
initExpandCards();
initActiveNav();
