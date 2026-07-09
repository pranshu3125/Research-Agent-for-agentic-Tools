from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List

from schemas import (
    ApiBreadth,
    ApiSurface,
    AppInput,
    AuthMethod,
    BuildabilityVerdict,
    ExistingMcp,
    ResearchResult,
    SearchDocument,
    SelfServeStatus,
)


class ExtractionEngine(ABC):
    @abstractmethod
    def extract(self, app: AppInput, documents: List[SearchDocument]) -> ResearchResult:
        raise NotImplementedError


class StructuredExtractionEngine(ExtractionEngine):
    def __init__(self, profile_map: Dict[str, dict], today: str, research_mode: str) -> None:
        self.profile_map = profile_map
        self.today = today
        self.research_mode = research_mode

    def extract(self, app: AppInput, documents: List[SearchDocument]) -> ResearchResult:
        profile = self.profile_map[app.app_name]
        evidence_urls = profile.get("evidence_urls") or [doc.url for doc in documents[:3]]
        uncertain_fields = self._collect_uncertain_fields(profile)
        confidence = round(float(profile["confidence_score"]), 2)
        return ResearchResult(
            app_id=app.id,
            app_name=app.app_name,
            category=app.category,
            website_hint=app.website_hint,
            one_line_description=profile["one_line_description"],
            auth_methods=[AuthMethod(value) for value in profile["auth_methods"]],
            self_serve_status=SelfServeStatus(profile["self_serve_status"]),
            api_surface=ApiSurface(profile["api_surface"]),
            api_breadth=ApiBreadth(profile["api_breadth"]),
            existing_mcp=ExistingMcp(profile["existing_mcp"]),
            buildability_verdict=BuildabilityVerdict(profile["buildability_verdict"]),
            main_blocker=profile["main_blocker"],
            evidence_urls=evidence_urls,
            confidence_score=confidence,
            notes=profile["notes"],
            last_checked_date=self.today,
            research_mode=self.research_mode,
            source_quality=profile.get("source_quality", "official_docs"),
            low_confidence=confidence < 0.65 or bool(uncertain_fields),
            uncertain_fields=uncertain_fields,
        )

    def _collect_uncertain_fields(self, profile: dict) -> List[str]:
        uncertain = []
        for field_name in [
            "self_serve_status",
            "api_surface",
            "api_breadth",
            "existing_mcp",
            "buildability_verdict",
        ]:
            if profile[field_name] == "unclear":
                uncertain.append(field_name)
        if "unclear" in profile["auth_methods"]:
            uncertain.append("auth_methods")
        return uncertain


def build_guardrail_prompt() -> str:
    return (
        "Extraction guardrails:\n"
        "- prefer official developer docs, auth docs, pricing docs, and official repositories\n"
        "- every non-unclear claim should be supportable by at least one evidence URL\n"
        "- use partially_gated when docs are public but access requires paid plans, admin approval, or review\n"
        "- use needs_outreach when partner approval, enterprise access, or commercial coordination is the real blocker\n"
        "- confidence should stay moderate when the classification is inferred from public docs structure rather than explicit policy text"
    )
