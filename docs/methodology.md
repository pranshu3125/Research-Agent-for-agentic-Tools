# Methodology

## Goal

Screen 100 requested apps for agent-toolkit readiness by answering:

- does the app expose a usable API surface
- is auth self-serve or gated
- is there enough evidence to build now
- does the app likely require outreach or partnership
- how confident is the classification

## Research flow

1. Load `apps.csv` as the source-of-truth inventory.
2. Generate research queries for API docs, auth docs, pricing/access, GraphQL/REST, and MCP.
3. Prefer official sources in this order:
   1. official developer docs
   2. official API docs
   3. official auth docs
   4. official pricing / access docs
   5. official GitHub repositories
   6. trusted community references only when official evidence is weak
4. Extract structured fields into the result schema.
5. Classify buildability and blockers.
6. Save per-app raw evidence traces.
7. Verify a sample and record corrections.
8. Export machine-readable outputs and render the static HTML case study.

## Real vs Demo

### Real mode

- aims for full 100-app coverage
- uses official-source-first evidence
- resolves to `real_cached` in this repository when no live provider is configured

### Demo mode

- keeps the pipeline runnable for reviewers without keys
- uses a limited sample fixture set
- is clearly labeled and should not be confused with the final research output

## Confidence logic

Confidence rises when:

- multiple official pages support the classification
- the auth path is explicit
- developer onboarding is clearly self-serve
- the API surface is public and mature

Confidence falls when:

- access is enterprise-led or request-driven
- MCP evidence is indirect
- the developer surface is weak or ambiguous
- the classification depends on platform reputation more than explicit docs

## Verification logic

The verification sample:

- forces known edge cases into the sample
- spreads across all 10 assignment categories
- compares first-pass fields to a second-pass answer set
- records exact corrections and error modes

The output is intentionally honest about misses rather than smoothing them away.
