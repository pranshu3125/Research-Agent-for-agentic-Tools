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

    corrections = [
        {
            "app_name": record.app_name,
            "category": record.category,
            "corrections": [item.dict() for item in record.corrections],
            "reviewer_note": record.reviewer_note,
        }
        for record in verification.records
        if record.corrections
    ]

    return {
        "metadata": metadata.dict(),
        "insights": insights.dict(),
        "verification": verification.dict(),
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
  <div class="page-shell">
    <div class="top-nav" id="top-nav"></div>
    <header class="hero">
      <div class="hero-grid">
        <div class="hero-main">
          <p class="eyebrow">Composio Take-Home</p>
          <h1>Agent Toolkit Readiness Study: 100 Apps</h1>
          <p class="subtitle">This evaluates 100 requested apps for API, auth, access friction, and practical buildability for AI-agent toolkits, then turns the findings into a static case study for product decisions.</p>
          <div class="mode-banner" id="mode-banner"></div>
          <div class="hero-meta">
            <span>Patterns first</span>
            <span>Evidence-linked</span>
            <span>Verification-aware</span>
            <span>Deploy-ready static report</span>
          </div>
          <div class="hero-actions" id="hero-actions"></div>
        </div>
        <div class="hero-side">
          <div class="reading-card" id="reading-card"></div>
        </div>
      </div>
    </header>

    <main id="app">
      <section class="section-anchor overview-grid" id="overview">
        <section class="panel">
          <div class="section-heading">
            <h2>Overview</h2>
            <p>Fast portfolio snapshot for product prioritization.</p>
          </div>
          <div class="card-grid" id="insight-cards"></div>
        </section>
        <section class="panel">
          <div class="section-heading">
            <h2>Recommended Build Queue</h2>
            <p>High-confidence easy wins worth prototyping first.</p>
          </div>
          <div class="queue-grid" id="build-queue"></div>
        </section>
      </section>

      <section class="panel section-anchor" id="insights">
        <div class="section-heading">
          <h2>Headline Insights</h2>
          <p>The reviewer should understand the topline patterns before reading the full table.</p>
        </div>
        <div id="headline-insights" class="insight-list"></div>
      </section>

      <section class="panel section-anchor" id="matrix">
        <div class="section-heading">
          <h2>Category Readiness Matrix</h2>
          <p>Each of the 10 assignment categories summarized by access friction and buildability.</p>
        </div>
        <div class="table-wrap">
          <table id="matrix-table"></table>
        </div>
      </section>

      <section class="split">
        <div class="panel">
          <div class="section-heading">
            <h2>Auth Patterns</h2>
            <p>Distribution of auth approaches across the 100-app inventory.</p>
          </div>
          <div id="auth-patterns"></div>
        </div>
        <div class="panel">
          <div class="section-heading">
            <h2>Buildability Patterns</h2>
            <p>Distribution of portfolio readiness states.</p>
          </div>
          <div id="buildability-patterns"></div>
        </div>
      </section>

      <section class="split">
        <div class="panel">
          <div class="section-heading">
            <h2>MCP Pattern</h2>
            <p>Official MCP support is rare; community MCP signal is directional, not production proof.</p>
          </div>
          <div id="mcp-patterns"></div>
        </div>
        <div class="panel section-anchor" id="easy-wins-section">
          <div class="section-heading">
            <h2>Easy Wins</h2>
            <p>Likely buildable now with public docs, self-serve auth, and usable evidence.</p>
          </div>
          <div id="easy-wins" class="stack-list"></div>
        </div>
      </section>

      <section class="panel section-anchor" id="outreach-section">
        <div class="section-heading">
          <h2>Outreach Queue</h2>
          <p>Apps where partnership, approval, or enterprise setup is the real blocker.</p>
        </div>
        <div class="queue-grid" id="outreach-queue"></div>
      </section>

      <section class="split">
        <div class="panel">
          <div class="section-heading">
            <h2>Human Review Queue</h2>
            <p>Low-confidence or partially unclear cases that should not be auto-prioritized.</p>
          </div>
          <div id="low-confidence" class="stack-list"></div>
        </div>
        <div class="panel">
          <div class="section-heading">
            <h2>Agent Workflow</h2>
            <p>How the app research agent turns an inventory into a case-study artifact.</p>
          </div>
          <ol class="workflow">
            <li>Load `apps.csv` as the source-of-truth inventory.</li>
            <li>Search official docs, auth docs, pricing docs, and MCP signals.</li>
            <li>Rank evidence with official sources first.</li>
            <li>Extract structured fields into enums plus notes and blocker text.</li>
            <li>Classify buildability and flag uncertainty instead of forcing certainty.</li>
            <li>Re-check a sample, record corrections, and estimate first-pass accuracy.</li>
            <li>Export results and generate the static HTML case study.</li>
          </ol>
        </div>
      </section>

      <section class="panel">
        <div class="section-heading">
          <h2>Explore Apps</h2>
          <p>Collapsed cards for quick scanning before diving into the full table.</p>
        </div>
        <div class="explore-grid" id="explore-apps"></div>
      </section>

      <section class="panel section-anchor" id="verification">
        <div class="section-heading">
          <h2>Verification</h2>
          <p>Sample-based QA with honest misses surfaced explicitly rather than hidden.</p>
        </div>
        <div class="verification-grid" id="verification-summary"></div>
        <div id="verification-note" class="stack-list"></div>
        <div id="corrections" class="correction-grid"></div>
      </section>

      <section class="panel section-anchor" id="proof">
        <div class="section-heading">
          <h2>Proof</h2>
          <p>How to run the agent, where the outputs land, and what mode produced this page.</p>
        </div>
        <div id="proof-section" class="stack-list"></div>
      </section>

      <section class="panel section-anchor" id="full-table">
        <div class="section-heading">
          <h2>Full 100-App Table</h2>
          <p>Searchable and filterable details for the full inventory.</p>
        </div>
        <div class="filters">
          <input id="text-filter" type="search" placeholder="Search app, category, blocker..." />
          <select id="category-filter"></select>
          <select id="buildability-filter"></select>
          <select id="gating-filter"></select>
          <select id="confidence-filter"></select>
        </div>
        <div class="table-wrap">
          <table id="results-table"></table>
        </div>
      </section>
    </main>

    <footer class="footer">
      <span>Methodology and trade-offs live in the repository docs.</span>
      <span>Source repo and live deployment are included in the Proof section.</span>
    </footer>
  </div>
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
        repo_link_placeholder="https://github.com/pranshu3125/Research-Agent-for-agentic-Tools.git",
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
