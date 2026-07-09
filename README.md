# Composio Agent Toolkit Readiness Study

This repository builds an AI research agent for the Composio Product Ops take-home assignment. It evaluates the exact 100-app inventory from the assignment for API readiness, auth friction, buildability, and MCP availability, then exports structured outputs and a single static HTML case-study page.

The result is meant to answer a product-ops question quickly:

- which apps are realistic toolkit wins now
- which apps are technically possible but operationally constrained
- which apps need partner outreach or enterprise access
- where uncertainty remains and human review is required

## What the project does

Input:

- `apps.csv` with the exact 100 required apps

Pipeline:

1. Read the app inventory.
2. Search or load official developer evidence.
3. Extract structured fields for auth, API surface, gating, buildability, MCP status, blockers, and confidence.
4. Save per-app evidence traces.
5. Verify a sample across categories.
6. Generate `results.json`, `results.csv`, `verification_sample.json`, and a static HTML case study.

Output:

- `data/results.json`
- `data/results.csv`
- `data/verification_sample.json`
- `data/processed/aggregate_insights.json`
- `data/processed/report_metadata.json`
- `site/index.html`

## Why Composio would need this

Composio turns apps into callable tools for AI agents. Before building a toolkit, the team has to determine:

- whether the app has a public and usable developer surface
- whether auth is self-serve or operationally gated
- whether the toolkit is buildable now or blocked by approval/commercial access
- whether existing MCP support is official, unofficial, or absent

This repo automates that first-pass screening so engineering and product teams can prioritize the right apps faster.

## Modes

The repo has two explicit modes.

### `real` mode

Command:

```bash
python src/run_research.py --mode real --limit 100
```

Behavior:

- uses the exact 100-app assignment inventory
- uses bundled official-doc research coverage for all 100 apps
- prefers official docs, official auth/pricing pages, and official repositories
- labels the results as `real_cached` unless a live provider is configured

Why `real_cached` exists:

- this environment does not guarantee outbound HTTP from the Python runtime
- the repository therefore includes a bundled official-doc research cache and rule-based extraction path so the reviewer can still run the full workflow locally
- if a live provider is configured, the same pipeline resolves to `live_search`

### `demo` mode

Command:

```bash
python src/run_research.py --mode demo
```

Behavior:

- runs a clearly marked sample/fallback mode
- uses only a small bundled fixture set
- leaves non-sampled apps `unclear`
- is intended only for reviewers who want to inspect the pipeline shape without trusting the outputs as full research

The HTML page and the JSON/CSV outputs explicitly label which mode produced the results.

## How the agent works

Core files:

- `src/schemas.py`
  Data models and enums.
- `src/search.py`
  Search provider abstraction. Supports `official_cache`, `tavily`, `serpapi`, and fallback behavior.
- `src/extract.py`
  Structured extraction layer with guardrails and enum coercion.
- `src/research_catalog.py`
  Bundled official-doc research coverage, category defaults, app-specific overrides, and verification corrections.
- `src/research_agent.py`
  Builds queries, ranks evidence, extracts structured facts, recalculates confidence, and saves raw traces.
- `src/verify.py`
  Category-balanced verification sampling plus correction tracking.
- `src/generate_report.py`
  Aggregate insights, report payload generation, and static HTML rendering.
- `src/run_research.py`
  End-to-end pipeline runner.

The agent workflow shown in the report is:

`apps.csv`
→ official docs search / evidence load
→ evidence ranking
→ structured extraction
→ buildability classification
→ verification sample
→ HTML case study

## Setup

If you have a normal Python installation:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

In this environment, the pipeline was executed with:

```powershell
& 'C:\Program Files\Unity\Hub\Editor\6000.3.10f1\Editor\Data\PlaybackEngines\WebGLSupport\BuildTools\Emscripten\python\python.exe' src/run_research.py --mode real --output data
```

## Commands

Run the full real-cache workflow:

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

Resume:

```bash
python src/run_research.py --mode real --resume
```

Verify a sample:

```bash
python src/verify.py --sample-size 15
```

Generate the static HTML page again from existing outputs:

```bash
python src/generate_report.py
```

## Environment variables

See `.env.example`.

Supported variables:

- `SEARCH_PROVIDER=official_cache|tavily|serpapi`
- `TAVILY_API_KEY=...`
- `SERPAPI_API_KEY=...`
- `OUTPUT_DIR=data`

Notes:

- with no API key, `real` mode resolves to bundled `official_cache`
- with a supported key plus implementation, `real` mode can resolve to `live_search`

## Verification

Verification is not hidden behind prose; it is part of the artifacts.

What it does:

- forces known edge cases into the sample
- adds category-balanced rows across all 10 assignment categories
- compares first-pass fields vs verified answers
- records per-field corrections
- estimates first-pass app-level and field-level accuracy

Where it saves:

- `data/verification_sample.json`

Examples of honest misses in the current verification sample:

- auth method incompleteness on `Close`
- self-serve vs gated drift on `Salesforce` and `WhatsApp Business`
- buildability overconfidence on `Clay` and `NotebookLM`

## Outputs

- `data/raw/`
  Per-app evidence trace files.
- `data/results.json`
  Full structured results.
- `data/results.csv`
  Spreadsheet-friendly export.
- `data/verification_sample.json`
  Verification records and corrections.
- `data/processed/aggregate_insights.json`
  Executive metrics.
- `data/processed/report_metadata.json`
  Mode and generation metadata.
- `site/index.html`
  Static case-study page.

## HTML report

The HTML report is intentionally front-loaded with patterns instead of only a table.

Sections:

- hero and mode label
- executive summary cards
- headline insights
- category readiness matrix
- auth and MCP patterns
- easy wins
- outreach-needed apps
- human-review queue
- workflow explanation
- verification sample and corrections
- proof / run commands
- full searchable 100-app table

Open directly:

- `site/index.html`

## Trade-offs

See `docs/tradeoffs.md` for the full write-up. The main ones are:

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

- The bundled `real` mode is `real_cached`, not live HTTP scraping from the local Python runtime.
- Some classifications are inferred from official docs visibility and product gating language rather than exhaustive endpoint-by-endpoint testing.
- A few apps remain intentionally low-confidence or `unclear` after attempted research because the public developer surface was genuinely weak or ambiguous.
- Unofficial MCP presence is treated as signal only, not as proof of production readiness.

## How to extend it

1. Implement live HTTP calls in `src/search.py` for Tavily or SerpAPI.
2. Add stronger app-specific evidence URLs or pricing/auth references in `src/research_catalog.py`.
3. Replace rule-based extraction with an LLM-backed extractor while preserving schemas and citations.
4. Add a browser-based verification pass that re-opens URLs and checks page text.
5. Deploy `site/` to GitHub Pages, Netlify, Vercel, or any static host.

## Deploying the static page

The `site/` directory is static.

Typical deployment options:

- GitHub Pages
- Netlify
- Vercel static hosting
- S3 + CloudFront

The report includes placeholders for:

- repo link
- deployed link

Replace those in `data/processed/report_metadata.json` or regenerate the report with your final URLs.
