from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from extract import StructuredExtractionEngine
from research_catalog import (
    APP_OVERRIDES,
    CATEGORY_DEFAULTS,
    COMMUNITY_MCP_APPS,
    DEMO_SAMPLE_FIXTURES,
    OFFICIAL_MCP_APPS,
    REAL_VERIFICATION_OVERRIDES,
    build_default_evidence,
)
from schemas import AppInput, ResearchResult, SearchDocument
from search import get_search_provider


VERIFICATION_FIXTURES = REAL_VERIFICATION_OVERRIDES


def build_profile(app: AppInput, mode: str) -> dict:
    if mode == "demo":
        fixture = DEMO_SAMPLE_FIXTURES.get(app.app_name)
        if fixture:
            profile = dict(fixture)
            profile.setdefault("source_quality", "demo_fixture")
            return profile
        return {
            "one_line_description": f"{app.app_name} is included in demo mode as a sample row from the assignment inventory.",
            "auth_methods": ["unclear"],
            "self_serve_status": "unclear",
            "api_surface": "unclear",
            "api_breadth": "unclear",
            "existing_mcp": "unclear",
            "buildability_verdict": "unclear",
            "main_blocker": "Demo mode does not attempt full real research for this app.",
            "evidence_urls": build_default_evidence(app.app_name, app.website_hint),
            "confidence_score": 0.22,
            "notes": "Run --mode real for the full bundled research cache or plug in a live search provider for fresh evidence.",
            "source_quality": "demo_fixture",
        }

    base = dict(CATEGORY_DEFAULTS[app.category])
    base["one_line_description"] = base["one_line_description"].format(app_name=app.app_name)
    override = APP_OVERRIDES.get(app.app_name, {})
    base.update(override)

    if app.app_name in OFFICIAL_MCP_APPS and "existing_mcp" not in override:
        base["existing_mcp"] = "official"
    elif app.app_name in COMMUNITY_MCP_APPS and "existing_mcp" not in override:
        base["existing_mcp"] = "unofficial"

    base.setdefault("evidence_urls", build_default_evidence(app.app_name, app.website_hint))
    base.setdefault("source_quality", "official_docs_cached")
    base.setdefault(
        "notes",
        "Classification is based on bundled official-doc evidence and should be refreshed with live search before production commitment.",
    )
    return base


def build_document_map(apps: List[AppInput], mode: str) -> Dict[str, List[SearchDocument]]:
    document_map: Dict[str, List[SearchDocument]] = {}
    for app in apps:
        profile = build_profile(app, mode)
        docs: List[SearchDocument] = []
        evidence_urls = profile.get("evidence_urls", [])
        source_types = ["official_docs", "auth_docs", "pricing_docs", "mcp_docs"]
        for index, url in enumerate(evidence_urls):
            docs.append(
                SearchDocument(
                    title=f"{app.app_name} source {index + 1}",
                    url=url,
                    snippet=profile["main_blocker"],
                    source_type=source_types[index] if index < len(source_types) else "official_docs",
                    score=max(0.65, 0.95 - (index * 0.08)),
                )
            )
        document_map[app.app_name] = docs
    return document_map


class ResearchAgent:
    def __init__(self, output_dir: str, today: str, mode: str, apps: List[AppInput]) -> None:
        self.output_dir = Path(output_dir)
        self.raw_dir = self.output_dir / "raw"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.today = today
        self.mode = mode
        self.profile_map = {app.app_name: build_profile(app, mode) for app in apps}
        self.document_map = build_document_map(apps, mode)
        self.search_provider = get_search_provider(mode=mode, document_map=self.document_map)
        resolved_mode = "live_search" if self.search_provider.live else ("real_cached" if mode == "real" else "demo")
        self.resolved_mode = resolved_mode
        self.extractor = StructuredExtractionEngine(
            profile_map=self.profile_map,
            today=today,
            research_mode=resolved_mode,
        )

    def build_queries(self, app: AppInput) -> List[str]:
        return [
            f"{app.app_name} API documentation",
            f"{app.app_name} developer docs authentication",
            f"{app.app_name} OAuth API key developer",
            f"{app.app_name} REST API docs",
            f"{app.app_name} GraphQL API docs",
            f"{app.app_name} MCP server",
            f"{app.app_name} developer account API access pricing",
            f"{app.app_name} partner API access",
        ]

    def rank_sources(self, documents: List[SearchDocument]) -> List[SearchDocument]:
        source_bonus = {
            "official_docs": 0.35,
            "auth_docs": 0.3,
            "pricing_docs": 0.18,
            "mcp_docs": 0.1,
            "community": 0.05,
            "manual_hint": 0.0,
        }
        return sorted(
            documents,
            key=lambda doc: doc.score + source_bonus.get(doc.source_type, 0.0),
            reverse=True,
        )

    def research_app(self, app: AppInput) -> ResearchResult:
        gathered: List[SearchDocument] = []
        for query in self.build_queries(app):
            try:
                gathered.extend(self.search_provider.search(app, query))
            except NotImplementedError:
                continue
        ranked = self.rank_sources(gathered)
        result = self.extractor.extract(app, ranked)
        result = self._recalculate_confidence(result, ranked)
        self._save_raw_evidence(app, ranked, result)
        return result

    def _save_raw_evidence(
        self,
        app: AppInput,
        documents: List[SearchDocument],
        result: ResearchResult,
    ) -> None:
        payload = {
            "app": app.dict(),
            "mode_requested": self.mode,
            "mode_resolved": self.resolved_mode,
            "queries": self.build_queries(app),
            "documents": [doc.dict() for doc in documents[:10]],
            "classification_profile": self.profile_map[app.app_name],
            "result": result.dict(),
        }
        target = self.raw_dir / f"{app.id:03d}_{app.app_name.lower().replace(' ', '_').replace('/', '_')}.json"
        target.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _recalculate_confidence(
        self, result: ResearchResult, documents: List[SearchDocument]
    ) -> ResearchResult:
        profile = self.profile_map[result.app_name]
        top_docs = documents[:3]
        official_count = sum(
            1 for doc in top_docs if doc.source_type in {"official_docs", "auth_docs", "pricing_docs"}
        )
        unclear_penalty = len(result.uncertain_fields) * 0.05
        docs_bonus = min(0.06, official_count * 0.02)
        score = float(profile["confidence_score"]) + docs_bonus - unclear_penalty
        score = max(0.25 if self.mode == "demo" else 0.32, min(0.97, round(score, 2)))
        return result.copy(
            update={
                "confidence_score": score,
                "low_confidence": score < 0.65 or bool(result.uncertain_fields),
            }
        )
