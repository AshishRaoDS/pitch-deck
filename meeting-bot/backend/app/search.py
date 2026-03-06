"""
Web search for topic enrichment using DuckDuckGo (no API key required).
"""

from duckduckgo_search import DDGS


async def search_topic(query: str, num_results: int = 5) -> list[dict]:
    """
    Run a DuckDuckGo search for `query` and return a list of result dicts:
        [{"title": str, "link": str, "snippet": str}, ...]
    """
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=num_results))

    return [
        {
            "title": r.get("title", ""),
            "link": r.get("href", ""),
            "snippet": r.get("body", ""),
        }
        for r in results
    ]


async def enrich_topics(topics: list[dict]) -> list[dict]:
    """
    For each topic dict (with a "search_query" key), fetch search results
    and attach them as "search_results". Returns the enriched topics list.
    """
    enriched = []
    for topic in topics:
        query = topic.get("search_query", topic.get("name", ""))
        results = await search_topic(query)
        enriched.append({**topic, "search_results": results})
    return enriched
