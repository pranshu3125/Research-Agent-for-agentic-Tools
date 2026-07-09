# Composio SDK / MCP Plan

## Why Composio fits this assignment

Composio's role is to turn external apps into callable tools for AI agents. That makes it a natural fit for this assignment because the research task is fundamentally about deciding which apps are practical toolkit targets:

- which apps have public, usable APIs
- which apps have self-serve versus gated auth
- which apps are blocked by partner or enterprise access
- which apps already have some MCP or agent-callable surface

## What is implemented in this repo now

The submitted run is a cached reproducible run:

- it uses an evidence-backed official-doc catalog
- it exports structured artifacts for all 100 apps
- it includes a human-reviewed verification sample
- it generates the static HTML case-study page

This keeps the submission runnable even when API keys or outbound network access are unavailable.

## Optional live mode

The repo now includes `src/composio_research_agent.py` as an adapter-style entrypoint for optional live execution.

Planned behavior:

- read `COMPOSIO_API_KEY`
- if the key is missing, fall back to cached mode without crashing
- run a small live sample only
- save query traces and evidence URLs
- retry targeted queries when auth, API surface, pricing, or MCP evidence is missing
- mark low-confidence rows for human review

## What the agent automates

- loading the 100-app assignment inventory
- generating research queries
- replaying cached evidence or calling a live provider
- ranking evidence with official sources first
- extracting structured fields
- assigning readiness verdicts
- clustering patterns across categories
- generating JSON, CSV, verification, and HTML artifacts

## What still needs human review

- gated versus partially gated edge cases
- partner-only or enterprise-only access paths
- unofficial MCP references
- low-confidence rows where public docs are weak
- final roadmap interpretation for business priority

## Why cached mode stays in the repo

Cached mode is kept for reproducibility:

- reviewers can run the full workflow without API keys
- outputs stay stable for the take-home submission
- verification examples remain inspectable
- optional live mode can evolve later without invalidating the submitted artifact set

## Recommendation

For the assignment submission, the safest framing is:

- `research-agent pipeline`
- `agentic verification loop`
- `cached reproducible run`
- `optional Composio SDK/MCP live mode`

That language is accurate, honest, and aligned with what the repository actually executes today.
