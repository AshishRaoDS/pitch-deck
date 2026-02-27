# Meeting Bot

A full-stack meeting assistant that:
1. **Captures** live microphone audio in the browser
2. **Transcribes** it in real-time using OpenAI Whisper
3. **Extracts topics** from the conversation using GPT-4o
4. **Searches the web** for each topic using Serper.dev (Google Search API)
5. **Generates a pitch deck** (.pptx) using GPT-4o + python-pptx

---

## Architecture

```
Browser (React + AudioWorklet)
    │  raw PCM audio (WebSocket binary frames)
    │  JSON control messages {"type":"stop"}
    ▼
FastAPI backend  (/ws/session)
    ├── Transcriber  → OpenAI Whisper
    ├── topics.py    → GPT-4o (JSON mode)
    ├── search.py    → Serper.dev API
    └── pitch_deck.py → GPT-4o + python-pptx
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm / pnpm | any |

---

## Setup

### 1. Clone and configure environment

```bash
cd meeting-bot/backend
cp .env.example .env
# Edit .env and add your API keys
```

Required keys in `backend/.env`:

```
OPENAI_API_KEY=sk-...          # https://platform.openai.com/api-keys
SERPER_API_KEY=...             # https://serper.dev  (free: 2,500 searches/mo)
```

### 2. Install backend dependencies

```bash
cd meeting-bot/backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Install frontend dependencies

```bash
cd meeting-bot/frontend
npm install
```

---

## Running

### Backend (terminal 1)

```bash
cd meeting-bot/backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (terminal 2)

```bash
cd meeting-bot/frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Usage

1. Click **Start Recording** — grant microphone permission when prompted.
2. Speak naturally during your meeting. The transcript streams in real-time.
3. Click **Stop & Generate** when finished.
4. The bot will:
   - Flush remaining audio and get a final transcript segment
   - Extract 3–8 key topics using GPT-4o
   - Run a Google search for each topic via Serper
   - Generate a themed `.pptx` pitch deck
5. Click **Download .pptx** to save the deck.

---

## Project Structure

```
meeting-bot/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py        # pydantic-settings config
│   │   ├── main.py          # FastAPI app + WebSocket handler
│   │   ├── transcriber.py   # Whisper transcription (chunked PCM)
│   │   ├── topics.py        # GPT-4o topic extraction
│   │   ├── search.py        # Serper.dev web search
│   │   └── pitch_deck.py    # python-pptx deck generation
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── main.tsx
    │   ├── index.css
    │   ├── hooks/
    │   │   └── useMeetingSession.ts   # WebSocket + AudioWorklet hook
    │   └── components/
    │       ├── StatusBadge.tsx
    │       ├── TranscriptPanel.tsx
    │       ├── TopicsPanel.tsx
    │       └── DeckDownload.tsx
    ├── index.html
    ├── vite.config.ts
    └── package.json
```

---

## API Keys

| Service | Free Tier | Purpose |
|---------|-----------|---------|
| [OpenAI](https://platform.openai.com/api-keys) | Pay-as-you-go | Whisper + GPT-4o |
| [Serper.dev](https://serper.dev) | 2,500 searches/month | Web search |

---

## Notes

- Audio is captured at **16 kHz, 16-bit mono PCM** via the Web Audio API's `AudioWorklet`.
- The backend accumulates audio in **5-second chunks** before sending each to Whisper.
- Generated `.pptx` files are stored in `/tmp/meeting-bot-decks/` on the server.
- The Vite dev server proxies `/api` and `/ws` to `http://localhost:8000` automatically.
