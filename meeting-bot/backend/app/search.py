"""
Web search for topic enrichment using Serper.dev API.

Serper provides a Google Search JSON API with a generous free tier.
Docs: https://serper.dev
"""

import httpx

from .config import settings

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


async def enrich_topics(topics: list[dict]) -> list[dict]:
    """
    For each topic dict (with a "search_query" key), fetch search results
    and attach them as "search_results".  Returns the enriched topics list.
    """
    enriched = []
    for topic in topics:
        query = topic.get("search_query", topic.get("name", ""))
        results = await search_topic(query)
        enriched.append({**topic, "search_results": results})
    return enriched
