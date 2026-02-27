# Meeting Bot — Speaker-Perspective Pitch Deck Plan

## Overview

Transform the existing browser-based meeting bot into a polished **Electron desktop app** that:

1. User clicks **Record** before a meeting starts
2. App captures everything spoken via the system microphone
3. User clicks **Stop** when the meeting ends
4. App automatically generates a **pitch deck from the speaker's perspective** — as if the speaker is presenting their ideas to an audience
5. The `.pptx` file opens automatically in PowerPoint/Keynote

---

## Current Architecture (What Exists)

```
Browser (React + AudioWorklet)
    │  raw PCM audio (WebSocket binary frames)
    │  JSON control messages {"type":"stop"}
    ▼
FastAPI backend  (/ws/session)
    ├── Transcriber  → OpenAI Whisper (5-second chunks)
    ├── topics.py    → GPT-4o (JSON mode) — generic topic extraction
    ├── search.py    → Serper.dev API
    └── pitch_deck.py → GPT-4o + python-pptx (generic meeting summary deck)
```

**Gaps vs. desired use case:**
- No Electron wrapper — runs in browser only
- Pitch deck is a generic meeting summary, NOT from the speaker's perspective
- No speaker identity/context extraction
- UI has too many panels; not a simple "one button" experience
- No step-by-step progress feedback during processing
- No auto-open of the generated file

---

## Target Architecture

```
Electron Desktop App
    ├── Main Process (electron/main.ts)
    │     ├── Spawns FastAPI backend as child process on startup
    │     ├── Creates BrowserWindow loading Vite-built React renderer
    │     └── IPC: openFile(path) → shell.openPath() to open .pptx
    │
    └── Renderer Process (React + Vite)
          ├── Minimal UI: one big Record/Stop button
          ├── Live transcript scrolling during recording
          ├── Step-by-step progress overlay during processing
          └── "Open Pitch Deck" button → IPC → shell.openPath()

FastAPI backend  (/ws/session)
    ├── Transcriber       → OpenAI Whisper
    ├── speaker_context.py → GPT-4o: who is speaking, what are they pitching?
    ├── topics.py          → GPT-4o: topics from SPEAKER's POV
    ├── search.py          → Serper.dev enrichment
    └── pitch_deck.py      → GPT-4o (speaker-perspective prompt) + python-pptx
```

---

## WebSocket Protocol Changes

### New progress events (Server → Client)

```json
{"type": "progress", "step": "transcribing",       "message": "Finalising transcript..."}
{"type": "progress", "step": "speaker_context",    "message": "Identifying speaker context..."}
{"type": "progress", "step": "extracting_topics",  "message": "Extracting key themes..."}
{"type": "progress", "step": "searching",          "message": "Researching 5 topics..."}
{"type": "progress", "step": "building_deck",      "message": "Building your pitch deck..."}
```

### Existing events (unchanged)
```json
{"type": "transcript", "text": "...", "full": "..."}
{"type": "topics",     "topics": [...]}
{"type": "deck_ready", "filename": "...", "download_url": "..."}
{"type": "error",      "message": "..."}
```

---

## Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `frontend/electron/main.ts` | Electron main process: window creation, backend spawn, IPC |
| `frontend/electron/preload.ts` | Contextbridge: exposes `window.electronAPI.openFile(path)` to renderer |
| `backend/app/speaker_context.py` | GPT-4o: extract speaker name, company, role, pitch summary |

### Modified Files

| File | What Changes |
|------|-------------|
| `frontend/package.json` | Add `electron`, `electron-builder`, `concurrently`, `@types/node` |
| `frontend/vite.config.ts` | Add `base: './'` for Electron file:// loading; keep dev proxy |
| `frontend/src/App.tsx` | Minimal one-button UI with progress overlay |
| `frontend/src/hooks/useMeetingSession.ts` | Handle `progress` events; expose `openFile` via IPC |
| `backend/app/main.py` | Add progress events; call `speaker_context.py` before topics |
| `backend/app/pitch_deck.py` | Speaker-perspective system prompt; accept `speaker_context` param |
| `backend/app/topics.py` | Speaker-POV system prompt |
| `meeting-bot/README.md` | Electron setup, new usage flow |

---

## Detailed Implementation

### 1. `frontend/electron/main.ts`

```typescript
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'

let backendProcess: ChildProcess | null = null

function startBackend() {
  // Spawn uvicorn from the bundled venv or system python
  backendProcess = spawn('python', ['-m', 'uvicorn', 'app.main:app',
    '--host', '127.0.0.1', '--port', '8000'], {
    cwd: path.join(__dirname, '../../backend'),
    env: { ...process.env }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  startBackend()
  createWindow()
})

ipcMain.handle('open-file', async (_event, filePath: string) => {
  await shell.openPath(filePath)
})

app.on('before-quit', () => {
  backendProcess?.kill()
})
```

### 2. `frontend/electron/preload.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
})
```

### 3. `backend/app/speaker_context.py` (New)

GPT-4o prompt:
```
You are analyzing a meeting transcript to identify the primary speaker's context.

Return JSON:
{
  "speaker_name": "<name if mentioned, else 'The Speaker'>",
  "company": "<company/org if mentioned, else null>",
  "role": "<role/title if mentioned, else null>",
  "pitch_summary": "<1-2 sentence summary of what the speaker is pitching/advocating>",
  "audience": "<who the speaker seems to be addressing, e.g. 'investors', 'customers', 'team'>",
  "tone": "<professional | startup | technical | executive>"
}
```

### 4. Updated `pitch_deck.py` System Prompt

Key changes:
- Receives `speaker_context` dict alongside transcript + topics
- Frames all slides in first-person from the speaker's perspective
- Uses classic pitch structure: Title → Problem → Solution → Why Now → Topics/Evidence → Traction → Ask/Next Steps
- Bullet points written as presenter talking points ("We have built...", "Our customers tell us...")

```
You are a professional pitch deck writer helping {speaker_name} from {company} 
create a compelling presentation.

The speaker is pitching: {pitch_summary}
Audience: {audience}

Write all slide content from the SPEAKER'S perspective, as if they are presenting 
to {audience}. Use first-person language ("We", "Our", "I have found...").

Structure:
1. Title slide — speaker name, company, one-line value prop
2. The Problem — what pain point the speaker is addressing
3. The Solution — what the speaker is proposing
4. Why Now — market timing, trends supporting the speaker's thesis
5. [One slide per key topic] — evidence and insights supporting the pitch
6. Key Takeaways — the speaker's main arguments
7. Next Steps / Ask — what the speaker wants from the audience
```

### 5. Updated `topics.py` System Prompt

```
You are analyzing a meeting transcript to extract the KEY ARGUMENTS and THEMES 
that the primary speaker is making or advocating for.

Focus on: What is the speaker trying to convince the audience of?
Extract topics as the speaker's CLAIMS or POSITIONS, not neutral subjects.

Example: Instead of "AI in healthcare", extract "AI reduces diagnostic errors by 40%"
```

### 6. Updated `main.py` WebSocket Handler

```python
# After flush + transcript assembled:
await send_json({"type": "progress", "step": "speaker_context", 
                 "message": "Identifying speaker context..."})
speaker_ctx = await extract_speaker_context(combined)

await send_json({"type": "progress", "step": "extracting_topics",
                 "message": "Extracting key themes from your pitch..."})
topics = await extract_topics(combined, speaker_ctx)

await send_json({"type": "progress", "step": "searching",
                 "message": f"Researching {len(topics)} topics..."})
enriched = await enrich_topics(topics)

await send_json({"type": "progress", "step": "building_deck",
                 "message": "Building your pitch deck..."})
filepath = await generate_pitch_deck(combined, enriched, speaker_ctx)
```

### 7. Redesigned `App.tsx` UI

Three states:

**Idle:**
```
┌─────────────────────────────┐
│  🎙                          │
│                              │
│  [  ● Start Recording  ]     │  ← large centered button
│                              │
│  Click to capture your       │
│  meeting and generate a      │
│  pitch deck                  │
└─────────────────────────────┘
```

**Recording:**
```
┌─────────────────────────────┐
│  ● REC  00:03:42             │
│                              │
│  [  ■ Stop & Generate  ]     │
│                              │
│  ┌─ Live Transcript ───────┐ │
│  │ "...and our platform    │ │
│  │ reduces churn by..."    │ │
│  └────────────────────────┘ │
└─────────────────────────────┘
```

**Processing:**
```
┌─────────────────────────────┐
│                              │
│  ✓ Transcript finalised      │
│  ✓ Speaker context identified│
│  ⟳ Extracting key themes...  │
│  ○ Researching topics        │
│  ○ Building pitch deck       │
│                              │
└─────────────────────────────┘
```

**Done:**
```
┌─────────────────────────────┐
│  ✅ Pitch Deck Ready!        │
│                              │
│  [  ↗ Open in PowerPoint  ]  │
│  [  ↓ Download .pptx      ]  │
│                              │
│  [  + New Session          ] │
└─────────────────────────────┘
```

### 8. `useMeetingSession.ts` Changes

- Add `progressSteps: ProgressStep[]` to `SessionState`
- Handle `{"type": "progress"}` messages → update step list
- Add `openFile(path)` that calls `window.electronAPI?.openFile(path)` (falls back to download link in browser)

```typescript
export interface ProgressStep {
  step: string;
  message: string;
  done: boolean;
}
```

### 9. `vite.config.ts` Changes

```typescript
export default defineConfig({
  base: process.env.ELECTRON ? './' : '/',  // file:// paths for Electron
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    }
  },
  build: {
    outDir: 'dist',
  }
})
```

### 10. `package.json` Changes

```json
{
  "main": "electron/main.js",
  "scripts": {
    "dev": "vite",
    "dev:electron": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "tsc && vite build",
    "build:electron": "npm run build && electron-builder",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "electron": "^29.0.0",
    "electron-builder": "^24.0.0",
    "concurrently": "^8.0.0",
    "wait-on": "^7.0.0",
    "@types/node": "^20.0.0",
    ...
  },
  "build": {
    "appId": "com.meetingbot.app",
    "productName": "Meeting Bot",
    "mac": { "category": "public.app-category.productivity" },
    "win": { "target": "nsis" },
    "files": ["dist/**/*", "electron/**/*"]
  }
}
```

---

## Data Flow Diagram

```
User clicks RECORD
       │
       ▼
AudioWorklet captures mic PCM (16kHz, 16-bit mono)
       │  every 250ms
       ▼
WebSocket binary frames → FastAPI /ws/session
       │  every 5 seconds
       ▼
Whisper API → transcript text
       │  streamed back as {"type":"transcript"}
       ▼
User clicks STOP
       │
       ├─► progress: "Finalising transcript..."
       ├─► Whisper flush remaining audio
       │
       ├─► progress: "Identifying speaker context..."
       ├─► speaker_context.py → GPT-4o
       │     {speaker_name, company, role, pitch_summary, audience, tone}
       │
       ├─► progress: "Extracting key themes..."
       ├─► topics.py → GPT-4o (speaker-POV prompt + speaker_ctx)
       │     [{name, description, search_query}, ...]
       │
       ├─► progress: "Researching N topics..."
       ├─► search.py → Serper.dev (parallel)
       │     [{...topic, search_results: [...]}, ...]
       │
       ├─► progress: "Building your pitch deck..."
       ├─► pitch_deck.py → GPT-4o (speaker-perspective prompt)
       │     structured slide JSON
       ├─► python-pptx → .pptx file
       │
       └─► {"type":"deck_ready", "filename":"...", "download_url":"..."}
              │
              ▼
       Electron IPC → shell.openPath() → PowerPoint/Keynote opens
```

---

## Implementation Order for Code Mode

1. **`backend/app/speaker_context.py`** — new module, no dependencies on other changes
2. **`backend/app/topics.py`** — update system prompt (small change)
3. **`backend/app/pitch_deck.py`** — update system prompt + accept `speaker_context` param
4. **`backend/app/main.py`** — wire in speaker_context step + progress events
5. **`frontend/src/hooks/useMeetingSession.ts`** — add progress state + openFile IPC
6. **`frontend/src/App.tsx`** — redesign UI
7. **`frontend/electron/main.ts`** — Electron main process
8. **`frontend/electron/preload.ts`** — IPC preload
9. **`frontend/package.json`** — add Electron deps
10. **`frontend/vite.config.ts`** — Electron build config
11. **`meeting-bot/README.md`** — updated docs
