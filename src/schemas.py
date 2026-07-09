from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, HttpUrl


class SelfServeStatus(str, Enum):
    SELF_SERVE = "self_serve"
    PARTIALLY_GATED = "partially_gated"
    GATED = "gated"
    UNCLEAR = "unclear"


class ApiSurface(str, Enum):
    REST = "rest"
    GRAPHQL = "graphql"
    REST_AND_GRAPHQL = "rest_and_graphql"
    SDK_ONLY = "sdk_only"
    UNDOCUMENTED = "undocumented"
    MIXED = "mixed"
    UNCLEAR = "unclear"


class ApiBreadth(str, Enum):
    NARROW = "narrow"
    MEDIUM = "medium"
    BROAD = "broad"
    UNCLEAR = "unclear"


class ExistingMcp(str, Enum):
    OFFICIAL = "official"
    UNOFFICIAL = "unofficial"
    NONE_FOUND = "none_found"
    UNCLEAR = "unclear"


class BuildabilityVerdict(str, Enum):
    BUILDABLE_TODAY = "buildable_today"
    BUILDABLE_WITH_LIMITATIONS = "buildable_with_limitations"
    NEEDS_OUTREACH = "needs_outreach"
    NOT_BUILDABLE_NOW = "not_buildable_now"
    UNCLEAR = "unclear"


class AuthMethod(str, Enum):
    OAUTH2 = "oauth2"
    API_KEY = "api_key"
    TOKEN = "token"
    BASIC = "basic"
    SESSION = "session"
    MIXED = "mixed"
    UNCLEAR = "unclear"


class SearchDocument(BaseModel):
    title: str
    url: HttpUrl
    snippet: str
    source_type: str = Field(
        default="secondary",
        description="official_docs, auth_docs, pricing_docs, mcp_docs, community, or manual_hint",
    )
    score: float = 0.0


class AppInput(BaseModel):
    id: int
    app_name: str
    category: str
    website_hint: str


class ResearchResult(BaseModel):
    app_id: int
    app_name: str
    category: str
    website_hint: str
    one_line_description: str
    auth_methods: List[AuthMethod]
    self_serve_status: SelfServeStatus
    api_surface: ApiSurface
    api_breadth: ApiBreadth
    existing_mcp: ExistingMcp
    buildability_verdict: BuildabilityVerdict
    main_blocker: str
    evidence_urls: List[HttpUrl]
    confidence_score: float = Field(ge=0.0, le=1.0)
    notes: str
    last_checked_date: str
    research_mode: str = "real_cached"
    source_quality: str = "official_docs"
    low_confidence: bool = False
    uncertain_fields: List[str] = []


class FieldCorrection(BaseModel):
    field_name: str
    original_value: str
    corrected_value: str
    reason: str


class VerificationRecord(BaseModel):
    app_name: str
    category: str
    verified: bool
    checked_fields: int
    corrected_fields: int
    evidence_rechecked: List[HttpUrl]
    corrections: List[FieldCorrection]
    reviewer_note: str


class VerificationResult(BaseModel):
    mode: str
    sample_size: int
    sampled_categories: List[str]
    selection_strategy: str
    first_pass_app_accuracy: float = Field(ge=0.0, le=1.0)
    first_pass_field_accuracy: float = Field(ge=0.0, le=1.0)
    verified_accuracy_estimate: float = Field(ge=0.0, le=1.0)
    correction_rate: float = Field(ge=0.0, le=1.0)
    common_error_modes: List[str]
    records: List[VerificationRecord]
    known_limitations: List[str]


class AggregateInsights(BaseModel):
    total_apps: int
    buildable_today: int
    buildable_with_limitations: int
    needs_outreach: int
    unclear_count: int
    partially_or_fully_gated: int
    dominant_auth_method: str
    most_common_blocker: str
    verification_accuracy: Optional[float] = None
    report_mode: str = "real_cached"
    headline_insights: List[str] = []


class ReportMetadata(BaseModel):
    mode_requested: str
    mode_resolved: str
    generated_at: str
    results_path: str
    verification_path: str
    site_path: str
    repo_link_placeholder: str
    deployed_link_placeholder: str
    live_search_enabled: bool
    mode_summary: str
