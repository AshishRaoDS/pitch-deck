"""
Real-time audio transcription using OpenAI Whisper.

Audio chunks are sent from the browser via WebSocket as raw PCM (16-bit, 16 kHz,
mono).  We buffer them until we have enough audio (~5 s), then send the chunk to
the Whisper API and return the transcript text.
"""

import asyncio
import io
import struct
import wave

from openai import AsyncOpenAI

from .config import settings

# Sampling parameters that the frontend is expected to use.
SAMPLE_RATE = 16_000
CHANNELS = 1
SAMPLE_WIDTH = 2  # 16-bit PCM → 2 bytes per sample

# How many seconds of audio we accumulate before transcribing.
CHUNK_SECONDS = 5
CHUNK_BYTES = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH * CHUNK_SECONDS


def _build_wav(pcm_bytes: bytes) -> bytes:
    """Wrap raw PCM bytes in a minimal WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()


class Transcriber:
    """Accumulates audio bytes and yields transcript strings."""

    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)
        self._buffer: bytearray = bytearray()

    def add_audio(self, chunk: bytes) -> None:
        self._buffer.extend(chunk)

    async def flush(self) -> str | None:
        """Transcribe whatever is left in the buffer (called on session end)."""
        if not self._buffer:
            return None
        return await self._transcribe(bytes(self._buffer))

    async def process(self) -> list[str]:
        """
        Transcribe all full chunks currently in the buffer.
        Returns a list of transcript strings (one per chunk consumed).
        """
        results: list[str] = []
        while len(self._buffer) >= CHUNK_BYTES:
            chunk = bytes(self._buffer[:CHUNK_BYTES])
            del self._buffer[:CHUNK_BYTES]
            text = await self._transcribe(chunk)
            if text:
                results.append(text)
        return results

    async def _transcribe(self, pcm: bytes) -> str:
        wav_data = _build_wav(pcm)
        audio_file = io.BytesIO(wav_data)
        audio_file.name = "audio.wav"
        response = await self._client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="text",
        )
        return response.strip() if response else ""
