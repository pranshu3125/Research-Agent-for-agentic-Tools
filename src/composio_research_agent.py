from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List

from research_agent import ResearchAgent
from run_research import load_apps, save_results_json
from schemas import AppInput, ResearchResult


class CachedResearchAdapter:
    def __init__(self, output_dir: str, today: str, apps: List[AppInput]) -> None:
        self.agent = ResearchAgent(output_dir=output_dir, today=today, mode="real", apps=apps)
        self.output_dir = Path(output_dir)

    def research_apps(self, apps: List[AppInput]) -> List[ResearchResult]:
        results = [self.agent.research_app(app) for app in apps]
        self._write_status("cached_fallback", [])
        return results

    def _write_status(self, execution_status: str, traces: List[Dict[str, object]]) -> None:
        processed_dir = self.output_dir / "processed"
        processed_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "mode": "cached_research_adapter",
            "execution_status": execution_status,
            "live_mode_executed": False,
            "traces": traces,
        }
        (processed_dir / "composio_live_status.json").write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )


class ComposioResearchAdapter:
    def __init__(self, output_dir: str, today: str, apps: List[AppInput], composio_api_key: str) -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.agent = ResearchAgent(output_dir=output_dir, today=today, mode="real", apps=apps)
        self.composio_api_key = composio_api_key

    def research_apps(self, apps: List[AppInput]) -> List[ResearchResult]:
        traces: List[Dict[str, object]] = []
        results: List[ResearchResult] = []
        for app in apps:
            result, trace = self.research_app(app)
            results.append(result)
            traces.append(trace)
        self._write_status("live_sample_attempted", traces)
        return results

    def research_app(self, app: AppInput) -> tuple[ResearchResult, Dict[str, object]]:
        attempted_queries: List[str] = []
        gathered_documents = []

        def run_queries(queries: List[str]) -> None:
            for query in queries:
                attempted_queries.append(query)
                try:
                    gathered_documents.extend(self.agent.search_provider.search(app, query))
                except Exception as exc:  # pragma: no cover - defensive trace capture
                    gathered_documents.append(
                        self.agent.document_map.get(app.app_name, [])[0]
                        if self.agent.document_map.get(app.app_name)
                        else None
                    )
                    attempted_queries.append(f"query_error:{type(exc).__name__}")

        base_queries = self.agent.build_queries(app)
        run_queries(base_queries)

        ranked = self.agent.rank_sources([doc for doc in gathered_documents if doc is not None])
        result = self.agent.extractor.extract(app, ranked)

        targeted_retries = []
        if "auth_methods" in result.uncertain_fields:
            targeted_retries.append(f"{app.app_name} developer docs authentication oauth api key")
        if "api_surface" in result.uncertain_fields:
            targeted_retries.append(f"{app.app_name} REST GraphQL API documentation")
        if "self_serve_status" in result.uncertain_fields:
            targeted_retries.append(f"{app.app_name} API pricing developer access partner approval")
        if result.existing_mcp.value == "unclear":
            targeted_retries.append(f"{app.app_name} MCP server GitHub")

        if targeted_retries:
            run_queries(targeted_retries)
            ranked = self.agent.rank_sources([doc for doc in gathered_documents if doc is not None])
            result = self.agent.extractor.extract(app, ranked)

        result = self.agent._recalculate_confidence(result, ranked)
        self.agent._save_raw_evidence(app, ranked, result)
        trace = {
            "app_name": app.app_name,
            "queries": attempted_queries,
            "evidence_urls": [str(doc.url) for doc in ranked[:6]],
            "human_review_required": result.low_confidence,
            "execution_status": (
                "live_search" if self.agent.resolved_mode == "live_search" else "composio_requested_cached_fallback"
            ),
        }
        return result, trace

    def _write_status(self, execution_status: str, traces: List[Dict[str, object]]) -> None:
        processed_dir = self.output_dir / "processed"
        processed_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "mode": "optional_composio_live",
            "execution_status": execution_status,
            "live_mode_executed": self.agent.resolved_mode == "live_search",
            "provider_resolved": self.agent.resolved_mode,
            "trace_count": len(traces),
            "traces": traces,
            "note": (
                "This adapter is an optional live-mode harness. In this repository it remains honest about whether "
                "a true live provider was available."
            ),
        }
        (processed_dir / "composio_live_status.json").write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Optional Composio live-mode research harness.")
    parser.add_argument("--limit", type=int, default=5, help="Small sample size for live-mode attempts.")
    parser.add_argument("--output", type=str, default="data", help="Output directory.")
    return parser.parse_args()


def resolve_adapter(output_dir: str, today: str, apps: List[AppInput]):
    composio_api_key = os.getenv("COMPOSIO_API_KEY", "").strip()
    if not composio_api_key:
        print("Composio live mode requires COMPOSIO_API_KEY. Falling back to cached mode.")
        return CachedResearchAdapter(output_dir=output_dir, today=today, apps=apps)
    return ComposioResearchAdapter(
        output_dir=output_dir,
        today=today,
        apps=apps,
        composio_api_key=composio_api_key,
    )


def main() -> None:
    args = parse_args()
    apps = load_apps("apps.csv")[: args.limit]
    adapter = resolve_adapter(args.output, "2026-07-09", apps)
    results = adapter.research_apps(apps)
    save_results_json(results, Path(args.output) / "composio_live_results.json")


if __name__ == "__main__":
    main()
