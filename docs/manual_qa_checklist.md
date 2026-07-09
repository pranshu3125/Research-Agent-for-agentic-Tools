# Manual Dashboard QA Checklist

Use this checklist if browser automation is not installed in the environment.

## Top-level review

1. Open `site/index.html`.
2. Confirm the first screen shows:
   - total apps
   - buildable today
   - buildable with limitations
   - outreach or gated
   - verification sample size
   - first-pass accuracy
   - post-verification accuracy
   - repo and deployment links
   - `real_cached` wording

## Search and filters

1. Search `Slack`.
2. Search `Clay`.
3. Filter by one category.
4. Toggle high-confidence only.
5. Toggle corrected apps only.
6. Clear filters and confirm the count returns to 100.

## Drawer

1. Open one app card.
2. Confirm the drawer shows:
   - app name
   - category
   - description
   - auth methods
   - access status
   - API surface
   - MCP signal
   - buildability verdict
   - blocker
   - confidence
   - evidence links
3. Press `Escape` to close.
4. Re-open and click outside to close.

## Proof and honesty

1. Confirm the Proof section says the submitted run is `real_cached`.
2. Confirm it says live HTTP research was not executed in the submitted run.
3. Confirm it does not claim a fully autonomous live research run.
