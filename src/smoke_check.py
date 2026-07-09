from __future__ import annotations

import json
from pathlib import Path

from composio_research_agent import resolve_adapter
from run_research import load_apps


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    apps = load_apps(str(root / "apps.csv"))
    adapter = resolve_adapter(str(root / "data"), "2026-07-09", apps[:1])

    verification_report = root / "data" / "processed" / "verification_report.json"
    site_html = root / "site" / "index.html"
    results_json = root / "data" / "results.json"

    checks = {
        "results_json_exists": results_json.exists(),
        "site_html_exists": site_html.exists(),
        "verification_report_exists": verification_report.exists(),
        "composio_missing_key_fallback_ok": adapter.__class__.__name__ == "CachedResearchAdapter",
    }

    if verification_report.exists():
        payload = json.loads(verification_report.read_text(encoding="utf-8"))
        checks["verification_schema_has_required_keys"] = all(
            key in payload
            for key in [
                "sample_size",
                "sampled_apps",
                "fields_checked",
                "first_pass_accuracy",
                "post_verification_accuracy",
                "corrections_made",
                "apps_requiring_human_review",
                "examples_correct",
                "examples_corrected",
                "evidence_urls",
                "verification_method",
            ]
        )
    else:
        checks["verification_schema_has_required_keys"] = False

    print(json.dumps(checks, indent=2))
    if not all(checks.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
