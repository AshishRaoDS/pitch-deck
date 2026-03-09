"""
FastAPI application entry point.

Endpoints
---------
GET  /                      Health check
WS   /ws/session            WebSocket: real-time audio → transcript → topics
POST /api/generate-deck     Generate pitch deck from transcript + topics
GET  /api/download/{name}   Download a generated .pptx file
"""

import json
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .config import settings
from .knowledge import extract_text
from .pitch_deck import OUTPUT_DIR, generate_pitch_deck
from .search import enrich_topics
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


app = FastAPI(title="Meeting Bot API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REST helpers
# ---------------------------------------------------------------------------

@app.get("/")
async def health():
    return {"status": "ok", "service": "meeting-bot"}


class DeckRequest(BaseModel):
    transcript: str
    enriched_topics: list[dict]


@app.post("/api/generate-deck")
async def api_generate_deck(body: DeckRequest):
    """
    Generate a .pptx pitch deck from the full transcript and enriched topics.
    Returns the filename that can be fetched via /api/download/{filename}.
    """
    try:
        filepath = await generate_pitch_deck(body.transcript, body.enriched_topics)
        filename = os.path.basename(filepath)
        return {"filename": filename, "download_url": f"/api/download/{filename}"}
    except Exception as exc:
        log.exception("Deck generation failed")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.post("/api/knowledge")
async def api_knowledge(file: UploadFile):
    """Extract text from an uploaded file (.txt, .md, or .pdf)."""
    content = await file.read()
    text = await extract_text(file.filename or "", content)
    return {"text": text}


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
        {"type": "stop"}       – end session, trigger topic extraction + search

    Server → Client (text):    JSON event messages
        {"type": "transcript", "text": "...", "full": "..."}
        {"type": "topics",     "topics": [...]}
        {"type": "deck_ready", "filename": "...", "download_url": "..."}
        {"type": "error",      "message": "..."}
    """
    await websocket.accept()
    log.info("WebSocket session opened")

    transcriber = Transcriber()
    full_transcript: list[str] = []

    async def send_json(data: dict):
        await websocket.send_text(json.dumps(data))

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
                    knowledge = ctrl.get("knowledge", "")
                    build_deck = ctrl.get("build_deck", True)
                    theme = ctrl.get("theme", "midnight")

                    # Flush remaining audio
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

                    # Extract topics
                    log.info("Extracting topics…")
                    topics = await extract_topics(combined)

                    # Enrich topics with web search
                    log.info("Running web searches…")
                    enriched = await enrich_topics(topics)

                    await send_json({"type": "topics", "topics": enriched})

                    if build_deck:
                        # Generate pitch deck
                        log.info("Generating pitch deck…")
                        filepath = await generate_pitch_deck(combined, enriched, knowledge, theme)
                        filename = os.path.basename(filepath)
                        await send_json({
                            "type": "deck_ready",
                            "filename": filename,
                            "download_url": f"/api/download/{filename}",
                        })
                    else:
                        log.info("Skipping deck generation (build_deck=false)")
                        await send_json({"type": "done"})
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
