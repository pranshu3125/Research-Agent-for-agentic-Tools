from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from time import sleep
from typing import Dict, List

from generate_report import export_results_csv, generate_site
from research_agent import ResearchAgent
from schemas import AppInput, ReportMetadata, ResearchResult
from verify import verify_results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Composio app readiness research pipeline.")
    parser.add_argument("--mode", type=str, choices=["real", "demo"], default="real", help="Research mode.")
    parser.add_argument("--limit", type=int, default=None, help="Limit the number of apps processed.")
    parser.add_argument("--resume", action="store_true", help="Resume from existing results.json if present.")
    parser.add_argument("--category", type=str, default=None, help="Only process one category.")
    parser.add_argument("--output", type=str, default="data", help="Output directory.")
    parser.add_argument("--batch-size", type=int, default=10, help="Apps per polite batch.")
    parser.add_argument("--sleep-seconds", type=float, default=0.0, help="Sleep between batches.")
    parser.add_argument(
        "--sample-size",
        type=int,
        default=15,
        help="Verification sample size.",
    )
    return parser.parse_args()


def load_apps(csv_path: str) -> List[AppInput]:
    with open(csv_path, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [AppInput(**row) for row in reader]


def load_existing_results(path: Path) -> Dict[int, ResearchResult]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {item["app_id"]: ResearchResult(**item) for item in payload}


def save_results_json(results: List[ResearchResult], path: Path) -> None:
    path.write_text(json.dumps([result.dict() for result in results], indent=2), encoding="utf-8")


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    processed_dir = output_dir / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    all_apps = load_apps("apps.csv")
    if args.category:
        all_apps = [app for app in all_apps if app.category.lower() == args.category.lower()]
    if args.limit:
        all_apps = all_apps[: args.limit]

    results_json_path = output_dir / "results.json"
    existing = load_existing_results(results_json_path) if args.resume else {}

    agent = ResearchAgent(output_dir=str(output_dir), today="2026-07-09", mode=args.mode, apps=all_apps)
    results: List[ResearchResult] = [
        item for item in existing.values() if item.research_mode == agent.resolved_mode
    ]
    completed_ids = {item.app_id for item in results}

    for index, app in enumerate(all_apps, start=1):
        if app.id in completed_ids:
            continue
        result = agent.research_app(app)
        results.append(result)
        completed_ids.add(app.id)
        results.sort(key=lambda item: item.app_id)
        save_results_json(results, results_json_path)
        if args.batch_size and index % args.batch_size == 0 and args.sleep_seconds > 0:
            sleep(args.sleep_seconds)

    export_results_csv(results, str(output_dir / "results.csv"))
    verification = verify_results(
        results,
        str(output_dir / "verification_sample.json"),
        sample_size=args.sample_size,
    )
    metadata = ReportMetadata(
        mode_requested=args.mode,
        mode_resolved=agent.resolved_mode,
        generated_at="2026-07-09",
        results_path=str(results_json_path),
        verification_path=str(output_dir / "verification_sample.json"),
        site_path=str(Path("site") / "index.html"),
        repo_link_placeholder="REPO_LINK_HERE",
        deployed_link_placeholder="DEPLOYED_LINK_HERE",
        live_search_enabled=(agent.resolved_mode == "live_search"),
        mode_summary=(
            "Generated from a live search provider using official-source-first ranking."
            if agent.resolved_mode == "live_search"
            else "Generated from the bundled official-doc research cache because no live search provider/API key was configured."
        ),
    )
    insights = generate_site(results, verification, site_dir="site", metadata=metadata)
    (processed_dir / "aggregate_insights.json").write_text(insights.json(indent=2), encoding="utf-8")
    (processed_dir / "report_metadata.json").write_text(metadata.json(indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
