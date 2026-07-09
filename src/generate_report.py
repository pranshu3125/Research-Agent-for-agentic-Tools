from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List

from schemas import AggregateInsights, ReportMetadata, ResearchResult, VerificationResult


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the static HTML case study.")
    parser.add_argument("--results", type=str, default="data/results.json", help="Path to results.json")
    parser.add_argument(
        "--verification",
        type=str,
        default="data/verification_sample.json",
        help="Path to verification_sample.json",
    )
    parser.add_argument("--site-dir", type=str, default="site", help="Directory to write the static site")
    parser.add_argument("--mode", type=str, default="real", help="Requested report mode label")
    return parser.parse_args()


def load_results(path: str) -> List[ResearchResult]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return [ResearchResult(**item) for item in payload]


def load_verification(path: str) -> VerificationResult:
    return VerificationResult(**json.loads(Path(path).read_text(encoding="utf-8")))


def export_results_csv(results: List[ResearchResult], output_path: str) -> None:
    fieldnames = [
        "app_name",
        "category",
        "website_hint",
        "one_line_description",
        "auth_methods",
        "self_serve_status",
        "api_surface",
        "api_breadth",
        "existing_mcp",
        "buildability_verdict",
        "main_blocker",
        "evidence_urls",
        "confidence_score",
        "notes",
        "last_checked_date",
        "research_mode",
        "source_quality",
        "low_confidence",
    ]
    with open(output_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow(
                {
                    "app_name": result.app_name,
                    "category": result.category,
                    "website_hint": result.website_hint,
                    "one_line_description": result.one_line_description,
                    "auth_methods": ", ".join(method.value for method in result.auth_methods),
                    "self_serve_status": result.self_serve_status.value,
                    "api_surface": result.api_surface.value,
                    "api_breadth": result.api_breadth.value,
                    "existing_mcp": result.existing_mcp.value,
                    "buildability_verdict": result.buildability_verdict.value,
                    "main_blocker": result.main_blocker,
                    "evidence_urls": ", ".join(str(url) for url in result.evidence_urls),
                    "confidence_score": result.confidence_score,
                    "notes": result.notes,
                    "last_checked_date": result.last_checked_date,
                    "research_mode": result.research_mode,
                    "source_quality": result.source_quality,
                    "low_confidence": result.low_confidence,
                }
            )


def build_aggregate_insights(results: List[ResearchResult], verification: VerificationResult) -> AggregateInsights:
    auth_counter = Counter()
    blocker_counter = Counter()
    category_stats = defaultdict(lambda: {"buildable_today": 0, "total": 0, "gated": 0})
    generic_blockers = {
        "Permission scoping matters because these APIs can mutate production state quickly.",
        "Object-model mapping and tenant permissions still require careful implementation.",
        "Plan-tier features and workspace permission models can constrain write actions.",
        "Real-time permissions, webhooks, and admin approvals can widen implementation scope.",
        "Operational complexity is usually merchant permissions and review flow, not the raw API surface.",
        "Platform review, spend-linked approvals, or paid-plan access often gate production use.",
        "Credits, rate limits, and acceptable-use policies often shape production viability.",
        "Tenant permissions and object-model quirks can still require app-specific schema work.",
        "Compliance, production approval, and sensitive financial scopes often introduce gating.",
        "API maturity varies widely, and some products expose only limited or partner-oriented surfaces.",
    }

    for result in results:
        auth_counter.update(
            method.value
            for method in result.auth_methods
            if method.value not in {"unclear", "mixed"}
        )
        if result.main_blocker and result.main_blocker not in generic_blockers:
            blocker_counter.update([result.main_blocker])
        category_stats[result.category]["total"] += 1
        if result.buildability_verdict.value == "buildable_today":
            category_stats[result.category]["buildable_today"] += 1
        if result.self_serve_status.value in {"gated", "partially_gated"}:
            category_stats[result.category]["gated"] += 1

    total = len(results)
    buildable_today = sum(1 for result in results if result.buildability_verdict.value == "buildable_today")
    buildable_with_limitations = sum(
        1 for result in results if result.buildability_verdict.value == "buildable_with_limitations"
    )
    needs_outreach = sum(1 for result in results if result.buildability_verdict.value == "needs_outreach")
    unclear_count = sum(
        1
        for result in results
        if "unclear"
        in {
            result.self_serve_status.value,
            result.api_surface.value,
            result.api_breadth.value,
            result.buildability_verdict.value,
            result.existing_mcp.value,
        }
    )
    gated = sum(
        1 for result in results if result.self_serve_status.value in {"gated", "partially_gated"}
    )

    easiest_category = max(
        category_stats.items(),
        key=lambda item: (
            item[1]["buildable_today"] / float(item[1]["total"] or 1),
            item[1]["buildable_today"],
        ),
    )[0]
    most_gated_category = max(
        category_stats.items(),
        key=lambda item: (
            item[1]["gated"] / float(item[1]["total"] or 1),
            item[1]["gated"],
        ),
    )[0]

    low_confidence = [result for result in results if result.low_confidence]
    official_mcp = sum(1 for result in results if result.existing_mcp.value == "official")
    unofficial_mcp = sum(1 for result in results if result.existing_mcp.value == "unofficial")

    headline_insights = [
        "%s is the cleanest quick-win category in this scan, driven by public docs and self-serve developer onboarding."
        % easiest_category,
        "%s is the most access-constrained category, where business approval or platform policy is often the blocker rather than raw API absence."
        % most_gated_category,
        "%s is the dominant auth pattern across the inventory, reinforcing that delegated user authorization is the normal case for agent toolkits."
        % (auth_counter.most_common(1)[0][0] if auth_counter else "unclear"),
        "%d apps look like immediate build candidates, while %d more are buildable with real but manageable implementation constraints."
        % (buildable_today, buildable_with_limitations),
        "%d apps likely need outreach because approval, enterprise setup, or commercial access gating is the real blocker."
        % needs_outreach,
        "%d apps remain low-confidence or partially unclear after real-cache research and should get human review before roadmap decisions."
        % len(low_confidence),
        "Official MCP support is rare (%d apps), while community or unofficial MCP signal exists for %d apps and should be treated as directional rather than production-ready."
        % (official_mcp, unofficial_mcp),
    ]

    return AggregateInsights(
        total_apps=total,
        buildable_today=buildable_today,
        buildable_with_limitations=buildable_with_limitations,
        needs_outreach=needs_outreach,
        unclear_count=unclear_count,
        partially_or_fully_gated=gated,
        dominant_auth_method=(auth_counter.most_common(1)[0][0] if auth_counter else "unclear"),
        most_common_blocker=(blocker_counter.most_common(1)[0][0] if blocker_counter else "unclear"),
        verification_accuracy=verification.verified_accuracy_estimate,
        report_mode=results[0].research_mode if results else "real_cached",
        headline_insights=headline_insights,
    )


def build_site_payload(
    results: List[ResearchResult],
    verification: VerificationResult,
    insights: AggregateInsights,
    metadata: ReportMetadata,
) -> Dict[str, object]:
    category_matrix = defaultdict(
        lambda: {
            "self_serve": 0,
            "gated": 0,
            "buildable_today": 0,
            "needs_outreach": 0,
            "unclear": 0,
        }
    )
    auth_patterns = Counter()
    buildability_patterns = Counter()
    mcp_patterns = Counter()
    blocker_patterns = Counter()
    easy_wins = []
    outreach_needed = []
    low_confidence = []

    for result in results:
        row = category_matrix[result.category]
        if result.self_serve_status.value == "self_serve":
            row["self_serve"] += 1
        if result.self_serve_status.value in {"gated", "partially_gated"}:
            row["gated"] += 1
        if result.buildability_verdict.value == "buildable_today":
            row["buildable_today"] += 1
        if result.buildability_verdict.value == "needs_outreach":
            row["needs_outreach"] += 1
        if result.low_confidence or result.uncertain_fields:
            row["unclear"] += 1

        auth_patterns.update(method.value for method in result.auth_methods)
        buildability_patterns.update([result.buildability_verdict.value])
        mcp_patterns.update([result.existing_mcp.value])
        blocker_patterns.update([result.main_blocker])

        if (
            result.buildability_verdict.value == "buildable_today"
            and result.self_serve_status.value == "self_serve"
            and result.confidence_score >= 0.8
        ):
            easy_wins.append(result.dict())

        if result.buildability_verdict.value == "needs_outreach":
            outreach_needed.append(result.dict())

        if result.low_confidence or result.uncertain_fields:
            low_confidence.append(result.dict())

    corrections = []
    for record in verification.records:
        record_payload = record if isinstance(record, dict) else record.dict()
        record_corrections = record_payload.get("corrections", [])
        if not record_corrections:
            continue
        corrections.append(
            {
                "app_name": record_payload["app_name"],
                "category": record_payload["category"],
                "corrections": [
                    item if isinstance(item, dict) else item.dict() for item in record_corrections
                ],
                "reviewer_note": record_payload["reviewer_note"],
            }
        )

    executive_summary = [
        f"{insights.total_apps} apps were researched from the assignment inventory and summarized into one evidence-linked readiness view.",
        f"{insights.buildable_today} apps look buildable today, while {insights.buildable_with_limitations} more are technically reachable with normal implementation constraints.",
        f"{insights.needs_outreach} apps are primarily blocked by partner approval, enterprise setup, or commercial gating rather than missing APIs.",
        f"{humanize_label(insights.dominant_auth_method)} is the dominant auth pattern, which means delegated user auth is the default integration shape for this portfolio.",
        f"The most common blocker is: {insights.most_common_blocker}",
        "The strongest easy-win categories are the ones with public docs, self-serve credentials, and broad REST or GraphQL coverage.",
    ]

    agent_did = [
        "Loaded the exact 100-app inventory from apps.csv.",
        "Gathered or replayed official-doc evidence and cached source links.",
        "Extracted structured fields for auth, API surface, MCP status, gating, blockers, and buildability.",
        "Clustered results into portfolio patterns and generated machine-readable outputs plus the static HTML page.",
        "Flagged low-confidence rows instead of forcing certainty.",
    ]
    human_did = [
        "Spot-checked official docs for a category-balanced verification sample.",
        "Resolved ambiguous gated vs partially gated cases where public docs were not enough.",
        "Confirmed edge cases around partner access, enterprise approval, and unofficial MCP claims.",
        "Applied verified corrections back into the final table and kept the original misses visible in the verification section.",
    ]

    kpi_cards = [
        {"label": "Total apps", "value": insights.total_apps, "tone": "neutral"},
        {"label": "Buildable today", "value": insights.buildable_today, "tone": "buildable_today"},
        {
            "label": "Buildable with limitations",
            "value": insights.buildable_with_limitations,
            "tone": "buildable_with_limitations",
        },
        {
            "label": "Outreach / gated",
            "value": insights.partially_or_fully_gated,
            "tone": "needs_outreach",
        },
        {
            "label": "Human review queue",
            "value": len(low_confidence),
            "tone": "unclear",
        },
        {"label": "Verification sample", "value": verification.sample_size, "tone": "neutral"},
        {
            "label": "First-pass accuracy",
            "value": verification.first_pass_app_accuracy,
            "tone": "buildable_with_limitations",
        },
        {
            "label": "Post-verification accuracy",
            "value": verification.verified_accuracy_estimate,
            "tone": "buildable_today",
        },
    ]

    correction_apps = [
        {
            "app_name": entry["app_name"],
            "category": entry["category"],
            "field_count": len(entry["corrections"]),
            "fields": [item["field_name"] for item in entry["corrections"]],
            "reviewer_note": entry["reviewer_note"],
        }
        for entry in corrections
    ]

    return {
        "metadata": metadata.dict(),
        "insights": insights.dict(),
        "verification": verification.dict(),
        "kpi_cards": kpi_cards,
        "executive_summary": executive_summary,
        "agent_did": agent_did,
        "human_did": human_did,
        "correction_apps": correction_apps,
        "corrected_app_names": [item["app_name"] for item in correction_apps],
        "category_matrix": dict(category_matrix),
        "auth_patterns": dict(auth_patterns),
        "buildability_patterns": dict(buildability_patterns),
        "mcp_patterns": dict(mcp_patterns),
        "blocker_patterns": dict(blocker_patterns.most_common(8)),
        "easy_wins": sorted(easy_wins, key=lambda item: (-item["confidence_score"], item["app_name"]))[:12],
        "outreach_needed": sorted(
            outreach_needed, key=lambda item: (-item["confidence_score"], item["app_name"])
        )[:12],
        "low_confidence": sorted(
            low_confidence, key=lambda item: (item["confidence_score"], item["app_name"])
        )[:12],
        "corrections": corrections[:10],
        "results": [result.dict() for result in results],
}


def humanize_label(value: str) -> str:
    return value.replace("_", " ")


def render_html(payload: Dict[str, object]) -> str:
    app_json = json.dumps(payload, indent=2)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Toolkit Readiness Study</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="dashboard-shell">
    <aside class="sidebar glass-panel">
      <div class="sidebar-top">
        <div>
          <p class="eyebrow">Composio Take-Home</p>
          <h2>Research Ops</h2>
        </div>
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle theme">Theme</button>
      </div>
      <div class="sidebar-copy">
        <p>Evidence-first product dashboard for 100 candidate tool integrations.</p>
      </div>
      <nav class="sidebar-nav" id="top-nav"></nav>
      <div class="sidebar-note">
        <p><strong>Run mode:</strong> real_cached submitted run</p>
        <p><strong>Live mode:</strong> Optional Composio SDK/MCP-ready adapter exists, but no live autonomous run is claimed here.</p>
      </div>
    </aside>

    <div class="page-shell">
      <header class="hero glass-panel section-anchor" id="snapshot">
        <div class="hero-grid">
          <div class="hero-main">
            <p class="eyebrow">Agent Toolkit Readiness Study</p>
            <h1>100 apps, one product-ops view of what Composio can build now.</h1>
            <p class="subtitle">This dashboard evaluates API surface, auth friction, MCP signal, and practical buildability for the exact assignment inventory, then exposes the findings through searchable evidence-first app views.</p>
            <div class="mode-banner" id="mode-banner"></div>
            <div class="hero-actions" id="hero-actions"></div>
          </div>
          <div class="hero-side">
            <div class="reading-card glass-panel" id="reading-card"></div>
          </div>
        </div>
        <div class="card-grid hero-kpis" id="insight-cards"></div>
      </header>

      <main id="app">
        <section class="section-anchor top-dual" id="build-queue">
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Best Build Queue</h2>
              <p>High-confidence buildable apps with public docs and clean onboarding paths.</p>
            </div>
            <div class="queue-grid" id="build-queue-list"></div>
          </section>
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Verification Snapshot</h2>
              <p>Trust-building sample review surfaced before the deeper portfolio scan.</p>
            </div>
            <div class="verification-grid" id="verification-summary"></div>
            <div id="verification-note" class="stack-list"></div>
          </section>
        </section>

        <section class="section-anchor split" id="patterns">
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Executive Summary</h2>
              <p>What a reviewer should understand in roughly two minutes.</p>
            </div>
            <div id="executive-summary" class="stack-list"></div>
          </section>
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Corrections Made</h2>
              <p>Human-reviewed fixes already applied back into the final table.</p>
            </div>
            <div id="correction-apps" class="stack-list"></div>
          </section>
        </section>

        <section class="panel glass-panel section-anchor" id="insights">
          <div class="section-heading">
            <h2>Headline Insights</h2>
            <p>Portfolio-level findings before app-by-app exploration.</p>
          </div>
          <div id="headline-insights" class="insight-list"></div>
        </section>

        <section class="split">
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Auth Distribution</h2>
              <p>Delegated auth dominates this inventory.</p>
            </div>
            <div id="auth-patterns"></div>
          </section>
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Buildability Buckets</h2>
              <p>Where Composio can move fast versus where sales or partner motions matter.</p>
            </div>
            <div id="buildability-patterns"></div>
          </section>
        </section>

        <section class="split">
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Category Readiness Matrix</h2>
              <p>Readiness by assignment category.</p>
            </div>
            <div class="table-wrap compact-table">
              <table id="matrix-table"></table>
            </div>
          </section>
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Blocker Distribution</h2>
              <p>Most common reasons an app is not an immediate build win.</p>
            </div>
            <div id="blocker-patterns"></div>
            <div class="subsection">
              <div class="section-heading mini-heading">
                <h3>MCP Signal</h3>
                <p>Official versus community MCP presence.</p>
              </div>
              <div id="mcp-patterns"></div>
            </div>
          </section>
        </section>

        <section class="section-anchor split" id="outreach">
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Outreach Queue</h2>
              <p>Strong examples where partner access, enterprise setup, or approval is the real blocker.</p>
            </div>
            <div class="queue-grid" id="outreach-queue"></div>
          </section>
          <section class="panel glass-panel">
            <div class="section-heading">
              <h2>Human Review Queue</h2>
              <p>Apps that should not be auto-prioritized without a second look.</p>
            </div>
            <div id="low-confidence" class="stack-list"></div>
          </section>
        </section>

        <section class="panel glass-panel section-anchor" id="verification">
          <div class="section-heading">
            <h2>Verification Details</h2>
            <p>Human-reviewed edge cases, first-pass misses, and the corrected before/after trail.</p>
          </div>
          <div id="corrections" class="correction-grid"></div>
        </section>

        <section class="panel glass-panel section-anchor" id="agent-workflow">
          <div class="section-heading">
            <h2>Agent Workflow</h2>
            <p>What was automated, what was human-reviewed, and how the final HTML report was generated.</p>
          </div>
          <div class="pipeline-strip" id="workflow-pipeline"></div>
          <div class="split compact-split" id="work-split"></div>
        </section>

        <section class="panel glass-panel section-anchor" id="explore-apps">
          <div class="section-heading">
            <div>
              <h2>Explore Apps</h2>
              <p>Search, filter, and inspect evidence-backed app records interactively.</p>
            </div>
            <div class="control-actions">
              <button id="filter-toggle" class="utility-button mobile-only" type="button">Filters</button>
              <button id="export-csv" class="utility-button" type="button">Export filtered CSV</button>
            </div>
          </div>
          <div class="explorer-layout">
            <div class="filters-panel glass-panel" id="filters-panel">
              <div class="search-wrap">
                <input id="search-input" type="search" placeholder="Search app, category, auth, API surface, blocker, notes..." />
              </div>
              <div class="quick-toggle-row">
                <button id="toggle-high-confidence" class="chip-button" type="button">Show only high-confidence apps</button>
                <button id="toggle-corrected" class="chip-button" type="button">Show corrected apps</button>
              </div>
              <div class="filters-grid">
                <select id="category-filter"></select>
                <select id="auth-filter"></select>
                <select id="buildability-filter"></select>
                <select id="gating-filter"></select>
                <select id="mcp-filter"></select>
                <select id="review-filter"></select>
                <select id="confidence-filter"></select>
              </div>
              <div class="filters-actions">
                <button id="clear-filters" class="utility-button" type="button">Clear filters</button>
                <span id="result-count" class="result-count"></span>
              </div>
            </div>
            <div>
              <div id="app-explorer-grid" class="explorer-grid"></div>
              <div id="empty-state" class="empty-state" hidden>
                <h3>No apps match these filters.</h3>
                <p>Clear filters or broaden the search to restore the full 100-app view.</p>
              </div>
            </div>
          </div>
        </section>

        <section class="panel glass-panel section-anchor" id="proof">
          <div class="section-heading">
            <h2>Proof</h2>
            <p>Exact honesty wording, run commands, and source/deployment links.</p>
          </div>
          <div id="proof-section" class="stack-list"></div>
        </section>

        <section class="panel glass-panel section-anchor" id="full-table">
          <div class="section-heading">
            <h2>Full Table</h2>
            <p>The same filtered app set rendered in dense table form for spreadsheet-style scanning.</p>
          </div>
          <div class="table-wrap">
            <table id="results-table"></table>
          </div>
        </section>
      </main>

      <footer class="footer">
        <span>Submitted run is real_cached and includes human-reviewed corrections in the final table.</span>
        <span>Optional Composio SDK/MCP live mode exists, but no fully autonomous live research run is claimed here.</span>
      </footer>
    </div>
  </div>
  <div class="drawer-backdrop" id="drawer-backdrop" hidden></div>
  <aside class="detail-drawer" id="detail-drawer" aria-hidden="true">
    <div class="drawer-header">
      <div>
        <p class="eyebrow">App Detail</p>
        <h2 id="drawer-title">App</h2>
      </div>
      <button id="drawer-close" class="theme-toggle" type="button" aria-label="Close detail panel">Close</button>
    </div>
    <div class="drawer-body" id="drawer-body"></div>
  </aside>
  <script id="report-data" type="application/json">{app_json}</script>
  <script src="script.js"></script>
</body>
</html>
"""


def generate_site(
    results: List[ResearchResult],
    verification: VerificationResult,
    site_dir: str,
    metadata: ReportMetadata,
) -> AggregateInsights:
    insights = build_aggregate_insights(results, verification)
    payload = build_site_payload(results, verification, insights, metadata)
    site_path = Path(site_dir)
    site_path.mkdir(parents=True, exist_ok=True)
    (site_path / "index.html").write_text(render_html(payload), encoding="utf-8")
    (site_path / "report_payload.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return insights


def main() -> None:
    args = parse_args()
    results = load_results(args.results)
    verification = load_verification(args.verification)
    metadata = ReportMetadata(
        mode_requested=args.mode,
        mode_resolved=results[0].research_mode if results else args.mode,
        generated_at=results[0].last_checked_date if results else "",
        results_path=args.results,
        verification_path=args.verification,
        site_path=str(Path(args.site_dir) / "index.html"),
        repo_link_placeholder="https://github.com/pranshu3125/Research-Tool-for-agents.git",
        deployed_link_placeholder="https://research-agent-for-agentic-tools-seven.vercel.app/",
        live_search_enabled=(results[0].research_mode == "live_search" if results else False),
        mode_summary=(
            "Generated from live provider"
            if results and results[0].research_mode == "live_search"
            else "This submitted run is real_cached: it uses an evidence-backed official-doc research catalog for reproducibility. The repo supports live_search through Tavily/SerpAPI, but live HTTP research was not executed in the submitted run."
        ),
    )
    generate_site(results, verification, site_dir=args.site_dir, metadata=metadata)


if __name__ == "__main__":
    main()
