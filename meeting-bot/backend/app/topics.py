"""
Topic extraction from meeting transcript using GPT-4o.

Given a full transcript and optional speaker context, this module asks the LLM
to identify the key ARGUMENTS and CLAIMS the speaker is making — not neutral
subjects — so the pitch deck can be written from the speaker's perspective.
"""

import json

from openai import AsyncOpenAI

from .config import settings

_SYSTEM_PROMPT = """\
You are analyzing a meeting transcript to extract the KEY ARGUMENTS and THEMES
that the primary speaker is making or advocating for.

Focus on: What is the speaker trying to convince the audience of?
Extract topics as the speaker's CLAIMS or POSITIONS, not neutral subjects.

Example: Instead of "AI in healthcare", extract "AI reduces diagnostic errors by 40%"
Example: Instead of "market growth", extract "Our market is growing 3x faster than competitors"

Return a JSON object with the following shape:
{
  "topics": [
    {
      "name": "<short claim or position, 3-8 words>",
      "description": "<one sentence elaborating on this claim in context of the speaker's pitch>",
      "search_query": "<a web-search query to find supporting evidence or data for this claim>"
    }
  ]
}

Rules:
- Return 3–8 topics maximum.
- Each topic name should be a specific, assertive claim — not a vague category.
- The search_query should look for evidence that SUPPORTS the speaker's position.
- Only return valid JSON – no markdown, no extra text.
"""

_SYSTEM_PROMPT_WITH_CONTEXT = """\
You are analyzing a meeting transcript to extract the KEY ARGUMENTS and THEMES
that the primary speaker is making or advocating for.

Speaker context:
- Name: {speaker_name}
- Company: {company}
- Role: {role}
- Pitch summary: {pitch_summary}
- Audience: {audience}

Focus on: What is {speaker_name} trying to convince {audience} of?
Extract topics as the speaker's CLAIMS or POSITIONS, not neutral subjects.

Example: Instead of "AI in healthcare", extract "AI reduces diagnostic errors by 40%"
Example: Instead of "market growth", extract "Our market is growing 3x faster than competitors"

Return a JSON object with the following shape:
{
  "topics": [
    {
      "name": "<short claim or position, 3-8 words>",
      "description": "<one sentence elaborating on this claim in context of the speaker's pitch>",
      "search_query": "<a web-search query to find supporting evidence or data for this claim>"
    }
  ]
}

Rules:
- Return 3–8 topics maximum.
- Each topic name should be a specific, assertive claim — not a vague category.
- The search_query should look for evidence that SUPPORTS the speaker's position.
- Only return valid JSON – no markdown, no extra text.
"""


async def extract_topics(transcript: str, speaker_context: dict | None = None) -> list[dict]:
    """
    Extract key topics (as speaker claims/positions) from `transcript`.

    Parameters
    ----------
    transcript       : Full meeting transcript text.
    speaker_context  : Optional dict from speaker_context.extract_speaker_context().

    Returns a list of dicts:
        [{"name": str, "description": str, "search_query": str}, ...]
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    if speaker_context:
        system_prompt = _SYSTEM_PROMPT_WITH_CONTEXT.format(
            speaker_name=speaker_context.get("speaker_name", "The Speaker"),
            company=speaker_context.get("company") or "their organisation",
            role=speaker_context.get("role") or "the speaker",
            pitch_summary=speaker_context.get("pitch_summary", ""),
            audience=speaker_context.get("audience", "the audience"),
        )
    else:
        system_prompt = _SYSTEM_PROMPT

    response = await client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Extract the speaker's key claims and arguments from the following transcript:\n\n{transcript}",
            },
        ],
        temperature=0.3,
    )

    content = response.choices[0].message.content or "{}"
    data = json.loads(content)
    return data.get("topics", [])
