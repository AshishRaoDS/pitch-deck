"""
Topic extraction from meeting transcript using GPT-4o.

Given a full or partial transcript, this module asks the LLM to identify the
key topics / themes discussed and returns them as a structured list.
"""

import json

from openai import AsyncOpenAI

from .config import settings

_SYSTEM_PROMPT = """\
You are an expert meeting analyst. Your task is to extract the key topics,
technologies, companies, and themes that are discussed in a meeting transcript.

Return a JSON object with the following shape:
{
  "topics": [
    {
      "name": "<short topic name, 2-5 words>",
      "description": "<one sentence description of the topic in context>",
      "search_query": "<a web-search query to learn more about this topic>"
    }
  ]
}

Rules:
- Return 3–8 topics maximum.
- Prefer specific, actionable topics over generic ones.
- Only return valid JSON – no markdown, no extra text.
"""


async def extract_topics(transcript: str) -> list[dict]:
    """
    Extract key topics from `transcript`.

    Returns a list of dicts:
        [{"name": str, "description": str, "search_query": str}, ...]
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    response = await client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Extract topics from the following meeting transcript:\n\n{transcript}",
            },
        ],
        temperature=0.3,
    )

    content = response.choices[0].message.content or "{}"
    data = json.loads(content)
    return data.get("topics", [])
