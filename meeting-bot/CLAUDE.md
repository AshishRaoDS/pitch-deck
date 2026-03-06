# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # tsc + vite build
```

## Environment

Copy `backend/.env.example` to `backend/.env` and set:
- `OPENAI_API_KEY` — used for Whisper (transcription) and GPT-4o (topics + deck content)
- `SERPER_API_KEY` — used for Google Search via Serper.dev
- `CORS_ORIGINS` — defaults to `http://localhost:5173`

`backend/app/config.py` loads these via pydantic-settings; the `.env` file must be present or the app will fail to start.

## Architecture

The app is a real-time meeting assistant with a WebSocket-driven pipeline:

```
Browser AudioWorklet (16-bit PCM, 16 kHz mono)
  → WebSocket /ws/session (binary frames every 250 ms)
  → Transcriber (buffers PCM, transcribes per 5-second chunk via Whisper)
  → On "stop": extract_topics (GPT-4o JSON mode) → enrich_topics (Serper) → generate_pitch_deck (GPT-4o + python-pptx)
  → deck .pptx stored in /tmp/meeting-bot-decks/, served via GET /api/download/{filename}
```

### Key backend flow (`app/main.py` WebSocket handler)

1. Binary messages → `Transcriber.add_audio()` + `Transcriber.process()` → streams `transcript` events back to client
2. Text `{"type":"stop"}` → `Transcriber.flush()` → `extract_topics()` → `enrich_topics()` → `generate_pitch_deck()` → sends `topics` then `deck_ready` events

### Frontend (`useMeetingSession.ts`)

Single React hook manages the entire session lifecycle: WebSocket connection, AudioWorklet setup (inline blob URL), PCM buffer accumulation, 250ms flush timer, and state transitions (`idle → connecting → recording → processing → done/error`). All UI components read from the hook's `SessionState`.

### Vite proxy

In dev, Vite proxies `/api` and `/ws` to `http://localhost:8000`, so the frontend uses relative URLs — no hardcoded backend URL.

### Audio format contract

Frontend captures at exactly 16 kHz, 16-bit signed int, mono. `Transcriber` wraps raw PCM bytes in a WAV container before calling the Whisper API. Changing audio parameters in either side requires updating both.
