"""
FastAPI application entry point.

Endpoints
---------
GET  /                      Health check
WS   /ws/session            WebSocket: real-time audio → transcript → topics → deck
POST /api/generate-deck     Generate pitch deck from transcript + topics
GET  /api/download/{name}   Download a generated .pptx file
POST /api/kb/upload         Upload documents to org knowledge base
GET  /api/kb/documents      List indexed documents
DEL  /api/kb/documents/{id} Remove a document
GET  /api/kb/status         KB stats
"""

import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .config import settings
from .kb_router import router as kb_router
from .pitch_deck import OUTPUT_DIR, generate_pitch_deck
from .search import enrich_topics
from .speaker_context import extract_speaker_context
from .topics import extract_topics
from .transcriber import Transcriber

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Meeting bot API starting up…")
    yield
    log.info("Meeting bot API shutting down.")


app = FastAPI(title="Meeting Bot API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount knowledge base router
app.include_router(kb_router)


# ---------------------------------------------------------------------------
# REST helpers
# ---------------------------------------------------------------------------

@app.get("/")
async def health():
    return {"status": "ok", "service": "meeting-bot", "version": "2.0.0"}


class DeckRequest(BaseModel):
    transcript: str
    enriched_topics: list[dict]
    speaker_context: dict | None = None


@app.post("/api/generate-deck")
async def api_generate_deck(body: DeckRequest):
    """
    Generate a .pptx pitch deck from the full transcript, enriched topics,
    and optional speaker context.
    Returns the filename that can be fetched via /api/download/{filename}.
    """
    try:
        filepath = await generate_pitch_deck(
            body.transcript,
            body.enriched_topics,
            body.speaker_context,
        )
        filename = os.path.basename(filepath)
        return {"filename": filename, "download_url": f"/api/download/{filename}"}
    except Exception as exc:
        log.exception("Deck generation failed")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.get("/api/download/{filename}")
async def api_download(filename: str):
    """Serve a previously generated .pptx file."""
    # Sanitise – only allow simple filenames
    if "/" in filename or ".." in filename:
        return JSONResponse(status_code=400, content={"error": "Invalid filename"})
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        return JSONResponse(status_code=404, content={"error": "File not found"})
    return FileResponse(
        filepath,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=filename,
    )


# ---------------------------------------------------------------------------
# WebSocket session
# ---------------------------------------------------------------------------

@app.websocket("/ws/session")
async def ws_session(websocket: WebSocket):
    """
    WebSocket protocol
    ------------------
    Client → Server (binary):  raw PCM audio bytes (16-bit, 16 kHz, mono)
    Client → Server (text):    JSON control messages
        {"type": "stop"}       – end session, trigger processing pipeline

    Server → Client (text):    JSON event messages
        {"type": "transcript",  "text": "...", "full": "..."}
        {"type": "progress",    "step": "...", "message": "..."}
        {"type": "topics",      "topics": [...]}
        {"type": "deck_ready",  "filename": "...", "download_url": "..."}
        {"type": "error",       "message": "..."}

    Progress steps (in order):
        transcribing        – flushing final audio
        speaker_context     – identifying speaker context
        extracting_topics   – extracting key themes
        searching           – researching topics (web + KB)
        building_deck       – generating pitch deck
    """
    await websocket.accept()
    log.info("WebSocket session opened")

    transcriber = Transcriber()
    full_transcript: list[str] = []

    async def send_json(data: dict):
        await websocket.send_text(json.dumps(data))

    async def send_progress(step: str, message: str):
        await send_json({"type": "progress", "step": step, "message": message})

    try:
        while True:
            message = await websocket.receive()

            # ---- binary audio chunk ----
            if "bytes" in message and message["bytes"]:
                transcriber.add_audio(message["bytes"])
                texts = await transcriber.process()
                for text in texts:
                    if text:
                        full_transcript.append(text)
                        combined = " ".join(full_transcript)
                        await send_json({
                            "type": "transcript",
                            "text": text,
                            "full": combined,
                        })

            # ---- control message ----
            elif "text" in message and message["text"]:
                ctrl = json.loads(message["text"])

                if ctrl.get("type") == "stop":
                    # Step 1: Flush remaining audio
                    await send_progress("transcribing", "Finalising transcript…")
                    leftover = await transcriber.flush()
                    if leftover:
                        full_transcript.append(leftover)
                        combined = " ".join(full_transcript)
                        await send_json({
                            "type": "transcript",
                            "text": leftover,
                            "full": combined,
                        })

                    combined = " ".join(full_transcript)
                    if not combined.strip():
                        await send_json({"type": "error", "message": "No transcript captured."})
                        break

                    # Step 2: Extract speaker context
                    await send_progress("speaker_context", "Identifying speaker context…")
                    log.info("Extracting speaker context…")
                    speaker_ctx = await extract_speaker_context(combined)
                    log.info(
                        "Speaker: %s (%s) — pitching to %s",
                        speaker_ctx.get("speaker_name"),
                        speaker_ctx.get("company"),
                        speaker_ctx.get("audience"),
                    )

                    # Step 3: Extract topics (speaker-POV)
                    await send_progress("extracting_topics", "Extracting key themes from your pitch…")
                    log.info("Extracting topics…")
                    topics = await extract_topics(combined, speaker_ctx)

                    # Step 4: Enrich topics (web + KB)
                    await send_progress(
                        "searching",
                        f"Researching {len(topics)} topic{'s' if len(topics) != 1 else ''}…",
                    )
                    log.info("Running web searches and KB queries…")
                    enriched = await enrich_topics(topics, use_kb=True)

                    await send_json({"type": "topics", "topics": enriched})

                    # Step 5: Generate pitch deck
                    await send_progress("building_deck", "Building your pitch deck…")
                    log.info("Generating pitch deck…")
                    filepath = await generate_pitch_deck(combined, enriched, speaker_ctx)
                    filename = os.path.basename(filepath)
                    await send_json({
                        "type": "deck_ready",
                        "filename": filename,
                        "download_url": f"/api/download/{filename}",
                        "speaker_context": speaker_ctx,
                    })
                    break

    except WebSocketDisconnect:
        log.info("WebSocket disconnected by client")
    except Exception as exc:
        log.exception("WebSocket session error")
        try:
            await send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        log.info("WebSocket session closed")
