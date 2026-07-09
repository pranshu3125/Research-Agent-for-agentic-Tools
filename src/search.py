from __future__ import annotations

import os
import json
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from schemas import AppInput, SearchDocument


class SearchProvider(ABC):
    name = "base"
    live = False

    @abstractmethod
    def search(self, app: AppInput, query: str) -> List[SearchDocument]:
        raise NotImplementedError


class StaticResearchProvider(SearchProvider):
    name = "official_cache"

    def __init__(self, document_map: Dict[str, List[SearchDocument]]) -> None:
        self.document_map = document_map

    def search(self, app: AppInput, query: str) -> List[SearchDocument]:
        return list(self.document_map.get(app.app_name, []))


class ManualFallbackProvider(SearchProvider):
    name = "manual_fallback"

    def search(self, app: AppInput, query: str) -> List[SearchDocument]:
        base = app.website_hint.rstrip("/")
        return [
            SearchDocument(
                title=f"{app.app_name} official hint",
                url=("https://" + base.lstrip("/")) if not base.startswith("http") else base,
                snippet=(
                    "Manual fallback result. Reviewer should use the official hint URL to locate API, auth, and pricing information."
                ),
                source_type="manual_hint",
                score=0.25,
            )
        ]


class TavilySearchProvider(SearchProvider):
    name = "tavily"
    live = True

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def search(self, app: AppInput, query: str) -> List[SearchDocument]:
        payload = json.dumps(
            {
                "query": query,
                "max_results": 5,
                "search_depth": "advanced",
                "include_answer": False,
                "include_raw_content": False,
            }
        ).encode("utf-8")
        request = Request(
            "https://api.tavily.com/search",
            data=payload,
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.api_key},
            method="POST",
        )
        with urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
        docs: List[SearchDocument] = []
        for item in body.get("results", []):
            url = item.get("url", "")
            docs.append(
                SearchDocument(
                    title=item.get("title", app.app_name + " result"),
                    url=url,
                    snippet=item.get("content", "")[:400],
                    source_type=_classify_source_type(url, app),
                    score=float(item.get("score", 0.6)),
                )
            )
        return docs


class SerpApiSearchProvider(SearchProvider):
    name = "serpapi"
    live = True

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def search(self, app: AppInput, query: str) -> List[SearchDocument]:
        url = (
            "https://serpapi.com/search.json?engine=google&q="
            + quote_plus(query)
            + "&num=5&api_key="
            + quote_plus(self.api_key)
        )
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
        docs: List[SearchDocument] = []
        for item in body.get("organic_results", []):
            result_url = item.get("link", "")
            docs.append(
                SearchDocument(
                    title=item.get("title", app.app_name + " result"),
                    url=result_url,
                    snippet=item.get("snippet", ""),
                    source_type=_classify_source_type(result_url, app),
                    score=0.7,
                )
            )
        return docs


def get_search_provider(
    mode: str,
    document_map: Optional[Dict[str, List[SearchDocument]]] = None,
) -> SearchProvider:
    provider_name = os.getenv("SEARCH_PROVIDER", "official_cache").strip().lower()
    document_map = document_map or {}

    if mode == "demo":
        return StaticResearchProvider(document_map) if document_map else ManualFallbackProvider()

    if provider_name == "tavily":
        api_key = os.getenv("TAVILY_API_KEY", "")
        if api_key:
            return TavilySearchProvider(api_key)
    if provider_name == "serpapi":
        api_key = os.getenv("SERPAPI_API_KEY", "")
        if api_key:
            return SerpApiSearchProvider(api_key)

    if document_map:
        return StaticResearchProvider(document_map)
    return ManualFallbackProvider()


def _classify_source_type(url: str, app: AppInput) -> str:
    lowered = url.lower()
    if any(marker in lowered for marker in ["developer", "developers", "docs", "api"]):
        return "official_docs"
    if any(marker in lowered for marker in ["oauth", "auth", "authentication"]):
        return "auth_docs"
    if any(marker in lowered for marker in ["pricing", "plan", "partner"]):
        return "pricing_docs"
    if "mcp" in lowered:
        return "mcp_docs"
    domain_hint = app.website_hint.split("/")[0].lower()
    if domain_hint and domain_hint in lowered:
        return "official_docs"
    return "community"
