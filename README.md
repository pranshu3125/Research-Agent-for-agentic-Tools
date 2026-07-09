# Composio Agent Toolkit Readiness Study

This repository is the submission repo for the Composio "AI Product Ops Intern" take-home assignment. It evaluates the exact 100-app inventory from the assignment for API readiness, auth friction, buildability, and MCP availability, then exports structured outputs and a single static HTML case-study page.

This submission is intentionally described as a `research-agent pipeline` with an `agentic verification loop`, a `cached reproducible run`, and an `optional Composio SDK/MCP live mode`. It does not claim that a fully autonomous live research run was executed in this environment.

## What this project does

It answers a product-ops question quickly:

- which apps are realistic toolkit wins now
- which apps are technically reachable but operationally constrained
- which apps need partner outreach or enterprise approval
- where uncertainty remains and human review is still required

Input:

- `apps.csv` with the exact 100 required apps

Outputs:

- `data/results.json`
- `data/results.csv`
- `data/verification_sample.json`
- `data/processed/aggregate_insights.json`
- `data/processed/report_metadata.json`
- `data/processed/verification_report.json`
- `data/processed/verification_report.csv`
- `site/index.html`

## Why Composio would need this

Composio turns apps into callable tools for AI agents. Before building a toolkit, the team needs to know:

- whether the app has a usable public developer surface
- whether auth is self-serve or effectively gated
- whether the integration is buildable today or blocked by access friction
- whether MCP support is official, unofficial, or absent

This repo automates that first-pass screening so product and engineering can prioritize build queues, outreach queues, and human-review queues faster.

## Modes

### `real` mode

```bash
python src/run_research.py --mode real --limit 100
```

Behavior:

- uses the exact 100-app assignment inventory
- uses bundled official-doc research coverage for all 100 apps
- prefers official docs, official auth docs, official pricing/access docs, and official repositories
- labels the output as `real_cached` unless a live provider is configured

Why `real_cached` exists:

- this environment does not guarantee outbound HTTP from the Python runtime
- the repository therefore ships with an evidence-backed official-doc research catalog for reproducibility
- the reviewer can still run the complete workflow locally without API keys

### `demo` mode

```bash
python src/run_research.py --mode demo
```

Behavior:

- runs a clearly marked fallback mode
- uses only a small fixture set
- leaves non-sampled apps `unclear`
- is useful for reviewing pipeline shape, not for trusting final findings

### Optional Composio live mode

```bash
python src/composio_research_agent.py --limit 5
```

Behavior:

- reads `COMPOSIO_API_KEY` from the environment
- if the key is missing, prints `Composio live mode requires COMPOSIO_API_KEY. Falling back to cached mode.`
- runs a small evidence-retrieval sample only
- records query retries and evidence traces
- marks low-confidence rows for human review instead of pretending a live pass succeeded

## How the pipeline works

Core files:

- `src/schemas.py`
  Data models and enums.
- `src/search.py`
  Search provider abstraction. Supports `official_cache`, `tavily`, `serpapi`, and manual fallback behavior.
- `src/extract.py`
  Structured extraction layer with guardrails and enum coercion.
- `src/research_catalog.py`
  Bundled official-doc research coverage, category defaults, app overrides, and verification corrections.
- `src/research_agent.py`
  Builds queries, ranks evidence, extracts structured facts, recalculates confidence, and saves raw traces.
- `src/composio_research_agent.py`
  Optional adapter-based live mode entrypoint with graceful fallback to cached research.
- `src/verify.py`
  Category-balanced verification sampling plus correction tracking and verification report generation.
- `src/generate_report.py`
  Aggregate insights, report payload generation, and static HTML rendering.
- `src/run_research.py`
  End-to-end pipeline runner.

Workflow:

`apps.csv`
-> official docs search / evidence load
-> evidence ranking
-> structured extraction
-> buildability classification
-> verification sample
-> HTML case study

## Setup

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

In this environment, `python` was not on PATH, so the pipeline was run with an embedded Python executable instead.

## Commands

Run the full cached reproducible workflow:

```bash
python src/run_research.py --mode real --limit 100
```

Run demo mode:

```bash
python src/run_research.py --mode demo
```

Run one category:

```bash
python src/run_research.py --mode real --category CRM
```

Resume an interrupted cached run:

```bash
python src/run_research.py --mode real --resume
```

Run optional Composio live mode:

```bash
python src/composio_research_agent.py --limit 5
```

Regenerate the verification artifacts:

```bash
python src/verify.py --sample-size 15
```

Regenerate the static HTML page:

```bash
python src/generate_report.py
```

Run smoke checks:

```bash
python src/smoke_check.py
```

## Environment variables

See `.env.example`.

Supported variables:

- `SEARCH_PROVIDER=official_cache|tavily|serpapi`
- `TAVILY_API_KEY=...`
- `SERPAPI_API_KEY=...`
- `COMPOSIO_API_KEY=...`
- `OUTPUT_DIR=data`

Notes:

- with no API key, `real` mode resolves to bundled `official_cache`
- with a supported search provider and key, the same pipeline can resolve to `live_search`
- the submitted report still makes clear whether live search actually ran

## Verification

Verification is an explicit artifact, not a footnote.

What it does:

- forces known edge cases into the sample
- adds category-balanced rows across all 10 assignment categories
- compares first-pass fields vs verified answers
- records per-field corrections
- estimates first-pass app-level and field-level accuracy
- writes a durable verification summary artifact for reviewer inspection

Artifacts:

- `data/verification_sample.json`
- `data/processed/verification_report.json`
- `data/processed/verification_report.csv`

Examples of honest misses in the current sample:

- auth method incompleteness on `Close`
- self-serve vs gated drift on `Salesforce` and `WhatsApp Business`
- buildability overconfidence on `Clay` and `NotebookLM`

## What the agent did vs what humans reviewed

The pipeline handled:

- loading the 100-app inventory
- replaying cached official-doc evidence or live-provider results
- extracting structured fields and confidence
- assigning buildability verdicts
- clustering portfolio patterns
- generating JSON, CSV, verification, and HTML artifacts

Human review handled:

- spot-checking official docs for the verification sample
- resolving ambiguous gated vs partially gated cases
- confirming enterprise or partner-access edge cases
- deciding when low-confidence rows should remain uncertain

## Trade-offs

See [docs/tradeoffs.md](docs/tradeoffs.md). The main ones are:

- speed vs accuracy
- breadth vs depth
- official docs vs general web
- LLM extraction vs deterministic parsing
- self-serve ambiguity
- MCP detection ambiguity
- buildability vs business priority
- paid/gated apps are not failures
- verification cost
- presentation vs completeness

## Known limitations

- The shipped submission run is `real_cached`, not a fresh live HTTP scrape.
- Some classifications are inferred from official docs visibility and platform gating language rather than exhaustive endpoint-by-endpoint testing.
- A few apps remain intentionally low-confidence or `unclear` after attempted research because the public developer surface is genuinely weak or ambiguous.
- Unofficial MCP presence is treated as signal only, not as proof of production readiness.

## What not to claim

- Do not claim a fully autonomous live web agent ran in this repository unless `live_search` or an actual Composio-backed run was executed and recorded.
- Do not claim the submitted report is fresh live scraping; the shipped submission run is a reproducible `real_cached` run.
- Do not treat unofficial MCP references as official production support.
- Do not treat public docs alone as proof that auth is self-serve.

Exact wording added to the HTML and metadata:

`This submitted run is real_cached: it uses an evidence-backed official-doc research catalog for reproducibility. The repo supports live_search through Tavily/SerpAPI, but live HTTP research was not executed in the submitted run.`

## How to extend it

1. Swap the cached evidence adapter for a real Composio-backed provider or a live search provider.
2. Add deeper app-specific pricing and access references in `src/research_catalog.py`.
3. Replace rule-based extraction with an LLM-backed extractor while preserving schemas and citations.
4. Add browser-based verification that re-opens URLs and checks page text.
5. Expand the live mode beyond sample size once API keys and network access are available.

## Deploying the static page

The `site/` directory is static and can be deployed directly to Vercel, Netlify, GitHub Pages, or any other static host.

If you fork the project, update the source repo URL and deployed site URL in `src/run_research.py` and `src/generate_report.py`, then regenerate the site.
