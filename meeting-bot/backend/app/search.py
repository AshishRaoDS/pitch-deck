"""
Web search for topic enrichment using Serper.dev API, combined with
optional org knowledge base retrieval.

Serper provides a Google Search JSON API with a generous free tier.
Docs: https://serper.dev
"""

import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)

SERPER_URL = "https://google.serper.dev/search"


async def search_topic(query: str, num_results: int = 5) -> list[dict]:
    """
    Run a Google search for `query` and return a list of result dicts:
        [{"title": str, "link": str, "snippet": str}, ...]
    """
    headers = {
        "X-API-KEY": settings.serper_api_key,
        "Content-Type": "application/json",
    }
    payload = {"q": query, "num": num_results}

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(SERPER_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

    results = []
    for item in data.get("organic", [])[:num_results]:
        results.append(
            {
                "title": item.get("title", ""),
                "link": item.get("link", ""),
                "snippet": item.get("snippet", ""),
            }
        )
    return results


async def enrich_topics(topics: list[dict], use_kb: bool = True) -> list[dict]:
    """
    For each topic dict (with a "search_query" key), fetch:
      - Web search results via Serper.dev → "search_results"
      - Internal org knowledge base results → "kb_results" (if use_kb=True and KB has docs)

    Returns the enriched topics list.
    """
    enriched = []
    for topic in topics:
        query = topic.get("search_query", topic.get("name", ""))

        # Web search
        try:
            web_results = await search_topic(query)
        except Exception as exc:
            log.warning("Web search failed for '%s': %s", query, exc)
            web_results = []

        # Knowledge base retrieval
        kb_results: list[dict] = []
        if use_kb:
            try:
                from .knowledge_base import query_kb
                kb_results = await query_kb(query, top_k=3)
            except Exception as exc:
                log.warning("KB query failed for '%s': %s", query, exc)
                kb_results = []

        enriched.append({
            **topic,
            "search_results": web_results,
            "kb_results": kb_results,
        })

    return enriched
