from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    html_path = root / "site" / "index.html"
    payload_path = root / "site" / "report_payload.json"
    verification_report_path = root / "data" / "processed" / "verification_report.json"

    html_text = html_path.read_text(encoding="utf-8")
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    verification_report = json.loads(verification_report_path.read_text(encoding="utf-8"))

    checks = {
        "html_references_assets": 'href="styles.css"' in html_text and 'src="script.js"' in html_text,
        "html_contains_kpi_values": all(
            token in html_text
            for token in [
                ">100<",
                ">46<",
                ">33<",
                ">17<",
                "0.65",
                "0.96",
            ]
        ),
        "html_contains_repo_url": "https://github.com/pranshu3125/Research-Tool-for-agents.git" in html_text,
        "html_contains_deployed_url": "https://research-agent-for-agentic-tools-seven.vercel.app/" in html_text,
        "html_contains_real_cached": "real_cached" in html_text,
        "html_contains_corrected_app": "Salesforce" in html_text,
        "html_has_no_placeholders": all(
            marker not in html_text
            for marker in ["REPO_LINK_HERE", "DEPLOYED_LINK_HERE", "repo link placeholder", "deployed link placeholder"]
        ),
        "payload_has_results": bool(payload.get("results")),
        "payload_has_kpis": bool(payload.get("kpi_cards")),
        "payload_has_corrected_apps": bool(payload.get("corrected_app_names")),
        "verification_report_schema_ok": all(
            key in verification_report
            for key in [
                "sample_size",
                "sampled_apps",
                "fields_checked",
                "first_pass_accuracy",
                "post_verification_accuracy",
                "corrections_made",
            ]
        ),
        "composio_honesty_present": "Optional Composio SDK/MCP" in html_text and "fully autonomous live research run" in html_text,
    }

    print(json.dumps(checks, indent=2))
    if not all(checks.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
