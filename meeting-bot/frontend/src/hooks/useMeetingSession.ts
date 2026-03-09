/**
 * useMeetingSession
 *
 * Manages the full lifecycle of a meeting bot session:
 *   1. Open microphone → capture PCM via AudioWorklet
 *   2. Open WebSocket to backend
 *   3. Stream audio chunks → receive transcript events
 *   4. Send "stop" command → receive topics + deck_ready events
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "recording"
  | "processing"
  | "done"
  | "error";

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface Topic {
  name: string;
  description: string;
  search_query: string;
  search_results: SearchResult[];
}

export type DeckTheme = "midnight" | "slate" | "forest" | "corporate";

export interface SessionState {
  status: SessionStatus;
  transcript: string;
  topics: Topic[];
  downloadUrl: string | null;
  filename: string | null;
  error: string | null;
  knowledgeText: string;
  uploadedFiles: string[];
  buildDeck: boolean | null; // null = not yet chosen (banner shown)
  theme: DeckTheme;
}

const SAMPLE_RATE = 16_000;
// How often (ms) we flush the audio buffer to the websocket
const FLUSH_INTERVAL_MS = 250;

// ---------------------------------------------------------------------------
// AudioWorklet processor inline (as a blob URL)
// ---------------------------------------------------------------------------
const WORKLET_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const float32 = input[0];
    // Convert float32 [-1, 1] to int16
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}
registerProcessor("pcm-processor", PcmProcessor);
`;

function createWorkletBlobUrl(): string {
  const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMeetingSession(backendPort: number | null = null) {
  const baseUrlRef = useRef(backendPort ? `http://127.0.0.1:${backendPort}` : "");
  const wsUrlRef = useRef(backendPort ? `ws://127.0.0.1:${backendPort}/ws/session` : "/ws/session");

  useEffect(() => {
    baseUrlRef.current = backendPort ? `http://127.0.0.1:${backendPort}` : "";
    wsUrlRef.current = backendPort ? `ws://127.0.0.1:${backendPort}/ws/session` : "/ws/session";
  }, [backendPort]);

  const [state, setState] = useState<SessionState>({
    status: "idle",
    transcript: "",
    topics: [],
    downloadUrl: null,
    filename: null,
    error: null,
    knowledgeText: "",
    uploadedFiles: [],
    buildDeck: null,
    theme: "midnight",
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcmBufferRef = useRef<ArrayBuffer[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs so stop() always reads the latest values without stale closures
  const knowledgeTextRef = useRef<string>("");
  const buildDeckRef = useRef<boolean | null>(null);
  const themeRef = useRef<DeckTheme>("midnight");

  const set = (patch: Partial<SessionState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  // ---- uploadKnowledge -----------------------------------------------------

  const uploadKnowledge = useCallback(async (file: File): Promise<void> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${baseUrlRef.current}/api/knowledge`, { method: "POST", body: formData });
    if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
    const { text } = await response.json() as { text: string };
    setState((prev) => {
      const newText = prev.knowledgeText ? prev.knowledgeText + "\n\n" + text : text;
      knowledgeTextRef.current = newText;
      return { ...prev, knowledgeText: newText, uploadedFiles: [...prev.uploadedFiles, file.name] };
    });
  }, []);

  // ---- start ---------------------------------------------------------------

  const start = useCallback(async () => {
    buildDeckRef.current = null;
    set({ status: "connecting", transcript: "", topics: [], downloadUrl: null, filename: null, error: null, buildDeck: null });

    // 1. Open WebSocket
    const ws = new WebSocket(wsUrlRef.current);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);

      if (msg.type === "transcript") {
        set({ transcript: msg.full as string });
      } else if (msg.type === "topics") {
        set({ topics: msg.topics as Topic[], status: "processing" });
      } else if (msg.type === "deck_ready") {
        const rawUrl = msg.download_url as string;
        const downloadUrl = rawUrl.startsWith("http") ? rawUrl : `${baseUrlRef.current}${rawUrl}`;
        set({ status: "done", downloadUrl, filename: msg.filename as string });
      } else if (msg.type === "done") {
        set({ status: "done" });
      } else if (msg.type === "error") {
        set({ status: "error", error: msg.message as string });
      }
    };

    ws.onerror = () => set({ status: "error", error: "WebSocket connection error." });

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket failed to open"));
    });

    // 2. Request microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;

    // 3. Set up AudioContext + AudioWorklet
    const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioCtxRef.current = audioCtx;

    const workletUrl = createWorkletBlobUrl();
    await audioCtx.audioWorklet.addModule(workletUrl);

    const source = audioCtx.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      pcmBufferRef.current.push(e.data);
    };

    source.connect(workletNode);
    // Don't connect to destination — we don't want speaker feedback

    // 4. Flush buffer to WebSocket periodically
    flushTimerRef.current = setInterval(() => {
      const chunks = pcmBufferRef.current.splice(0);
      if (!chunks.length) return;
      // Concatenate all chunks into a single ArrayBuffer
      const total = chunks.reduce((s, b) => s + b.byteLength, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(merged.buffer);
      }
    }, FLUSH_INTERVAL_MS);

    set({ status: "recording" });
  }, []);

  // ---- stop ----------------------------------------------------------------

  const stop = useCallback(() => {
    // Stop flushing
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    // Stop microphone
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Disconnect worklet
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    // Close audio context
    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    // Flush remaining buffer then send stop
    const chunks = pcmBufferRef.current.splice(0);
    if (chunks.length && wsRef.current?.readyState === WebSocket.OPEN) {
      const total = chunks.reduce((s, b) => s + b.byteLength, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      wsRef.current.send(merged.buffer);
    }

    // Tell server to stop; pass build_deck preference (default true)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "stop",
        knowledge: knowledgeTextRef.current,
        build_deck: buildDeckRef.current ?? true,
        theme: themeRef.current,
      }));
      set({ status: "processing" });
    }
  }, []);

  // ---- chooseBuildDeck -----------------------------------------------------

  const chooseBuildDeck = useCallback((build: boolean) => {
    buildDeckRef.current = build;
    set({ buildDeck: build });
  }, []);

  // ---- setTheme ------------------------------------------------------------

  const setTheme = useCallback((t: DeckTheme) => {
    themeRef.current = t;
    set({ theme: t });
  }, []);

  // ---- reset ---------------------------------------------------------------

  const reset = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    knowledgeTextRef.current = "";
    buildDeckRef.current = null;
    setState((prev) => ({
      status: "idle",
      transcript: "",
      topics: [],
      downloadUrl: null,
      filename: null,
      error: null,
      knowledgeText: "",
      uploadedFiles: [],
      buildDeck: null,
      theme: prev.theme, // preserve selected theme across sessions
    }));
  }, []);

  return { state, start, stop, reset, uploadKnowledge, chooseBuildDeck, setTheme };
}
