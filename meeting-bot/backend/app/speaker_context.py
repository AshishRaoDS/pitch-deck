"""
Speaker context extraction using GPT-4o.

Given a meeting transcript, identifies who is speaking, what they are pitching,
who the audience is, and the overall tone — so the pitch deck can be written
from the speaker's first-person perspective.
"""

import json

from openai import AsyncOpenAI

from .config import settings

_SYSTEM_PROMPT = """\
You are analyzing a meeting transcript to identify the primary speaker's context.

Return a JSON object with the following shape:
{
  "speaker_name": "<name if mentioned, else 'The Speaker'>",
  "company": "<company/org if mentioned, else null>",
  "role": "<role/title if mentioned, else null>",
  "pitch_summary": "<1-2 sentence summary of what the speaker is pitching or advocating>",
  "audience": "<who the speaker seems to be addressing, e.g. 'investors', 'customers', 'team', 'conference attendees'>",
  "tone": "<one of: professional | startup | technical | executive>"
}

Rules:
- If the speaker's name is not mentioned, use 'The Speaker'.
- If company or role cannot be inferred, use null.
- pitch_summary must capture the core argument or proposal being made.
- Only return valid JSON — no markdown, no extra text.
"""


async def extract_speaker_context(transcript: str) -> dict:
    """
    Extract speaker context from `transcript`.

    Returns a dict:
        {
            "speaker_name": str,
            "company": str | None,
            "role": str | None,
            "pitch_summary": str,
            "audience": str,
            "tone": str,
        }
    """
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    response = await client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Analyze the following meeting transcript and identify the "
                    "primary speaker's context:\n\n" + transcript
                ),
            },
        ],
        temperature=0.2,
    )

    content = response.choices[0].message.content or "{}"
    data = json.loads(content)

    # Ensure required fields have defaults
    return {
        "speaker_name": data.get("speaker_name", "The Speaker"),
        "company": data.get("company"),
        "role": data.get("role"),
        "pitch_summary": data.get("pitch_summary", ""),
        "audience": data.get("audience", "the audience"),
        "tone": data.get("tone", "professional"),
    }
