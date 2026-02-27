# Meeting Bot

Record a meeting → get a **speaker-perspective pitch deck** (.pptx) that cites both web research and your org's own documents.

---

## What It Does

1. **Record** — click Start Recording; the app captures your microphone via AudioWorklet
2. **Transcribe** — audio is streamed to OpenAI Whisper in 5-second chunks; live transcript appears in real time
3. **Stop** — click Stop & Generate; the processing pipeline runs automatically:
   - Identifies **who is speaking**, their company, role, and what they're pitching (GPT-4o)
   - Extracts **speaker-POV claims** — not neutral topics, but assertive positions ("AI reduces diagnostic errors by 40%")
   - Runs **parallel research**: Serper.dev web search + your org's knowledge base (ChromaDB)
   - Generates a **first-person pitch deck** (Title → Problem → Solution → Why Now → Evidence slides → Takeaways → Ask)
4. **Download or open** the `.pptx` file directly in PowerPoint / Keynote

---

## Architecture

```
Browser / Electron Renderer (React + Vite)
    │  binary PCM frames (16kHz, 16-bit mono) every 250ms
    │  JSON control: {"type":"stop"}
    ▼
FastAPI backend  (/ws/session)
    ├── Transcriber        → OpenAI Whisper (5-second chunks)
    ├── speaker_context.py → GPT-4o: who is speaking + pitch summary
    ├── topics.py          → GPT-4o: speaker-POV claims (not neutral subjects)
    ├── search.py          → Serper.dev (web) + ChromaDB (org KB) in parallel
    └── pitch_deck.py      → GPT-4o (speaker-perspective prompt) + python-pptx

Org Knowledge Base (ChromaDB, persisted to ~/.meeting-bot/kb/)
    ├── POST /api/kb/upload         Upload PDF/DOCX/TXT/MD
    ├── GET  /api/kb/documents      List indexed docs
    ├── DEL  /api/kb/documents/{id} Remove a doc
    └── GET  /api/kb/status         Stats

Electron (optional desktop wrapper)
    ├── electron/main.ts    Spawns FastAPI backend, creates BrowserWindow
    └── electron/preload.ts Exposes window.electronAPI.openFile() via IPC
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- OpenAI API key
- Serper.dev API key (free tier: 2,500 searches/month)

### Backend

```bash
cd meeting-bot/backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and add your API keys:
#   OPENAI_API_KEY=sk-...
#   SERPER_API_KEY=...

uvicorn app.main:app --reload --port 8000
```

### Frontend (browser mode)

```bash
cd meeting-bot/frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Frontend (Electron desktop app)

```bash
cd meeting-bot/frontend
npm install
npm run dev:electron
# Opens the desktop app with the backend spawned automatically
```

### Build distributable

```bash
cd meeting-bot/frontend
npm run build:electron
# Output in dist-electron/
```

---

## Org Knowledge Base

Upload your organisation's documents so the pitch deck can cite **internal evidence** alongside web research.

**Supported formats:** `.pdf` · `.docx` · `.txt` · `.md`

**How it works:**
1. Upload docs via the Knowledge Base panel in the UI (or `POST /api/kb/upload`)
2. Documents are chunked into ~500-token segments and embedded with `text-embedding-3-small`
3. Stored in ChromaDB at `~/.meeting-bot/kb/` (persists across sessions)
4. When generating a deck, the top-3 most relevant chunks per topic are retrieved and passed to GPT-4o alongside web results
5. GPT-4o uses internal docs for claims about your own products/capabilities, and web results for market context

**API:**
```
POST   /api/kb/upload                  Upload files (multipart/form-data, field: files)
GET    /api/kb/documents               List all indexed documents
DELETE /api/kb/documents/{doc_id}      Remove a document
GET    /api/kb/status                  { document_count, chunk_count }
```

---

## WebSocket Protocol

**Client → Server:**
- Binary frames: raw PCM audio (16-bit, 16kHz, mono)
- Text: `{"type": "stop"}`

**Server → Client:**
```json
{"type": "transcript",  "text": "...", "full": "..."}
{"type": "progress",    "step": "transcribing|speaker_context|extracting_topics|searching|building_deck", "message": "..."}
{"type": "topics",      "topics": [...]}
{"type": "deck_ready",  "filename": "...", "download_url": "...", "speaker_context": {...}}
{"type": "error",       "message": "..."}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | OpenAI API key (Whisper + GPT-4o + embeddings) |
| `SERPER_API_KEY` | ✅ | Serper.dev API key for web search |
| `CORS_ORIGINS` | optional | Comma-separated allowed origins (default: `http://localhost:5173`) |
| `KB_PERSIST_DIR` | optional | ChromaDB storage path (default: `~/.meeting-bot/kb`) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, AudioWorklet |
| Desktop | Electron 31 |
| Backend | FastAPI, Python 3.11 |
| Transcription | OpenAI Whisper (`whisper-1`) |
| Intelligence | OpenAI GPT-4o |
| Embeddings | OpenAI `text-embedding-3-small` |
| Vector store | ChromaDB (in-process, persistent) |
| Web search | Serper.dev |
| Deck rendering | python-pptx |
| PDF extraction | PyMuPDF |
| DOCX extraction | python-docx |
