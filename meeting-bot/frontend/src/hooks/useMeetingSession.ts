/**
 * useMeetingSession
 *
 * Manages the full lifecycle of a meeting bot session:
 *   1. Open microphone → capture PCM via AudioWorklet
 *   2. Open WebSocket to backend
 *   3. Stream audio chunks → receive transcript events
 *   4. Send "stop" command → receive progress + topics + deck_ready events
 *
 * Also handles auto-detection events from the Electron main process
 * (meeting-detected / meeting-ended) via the electronAPI bridge.
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

export interface KbResult {
  text: string;
  source: string;
  score: number;
}

export interface Topic {
  name: string;
  description: string;
  search_query: string;
  search_results: SearchResult[];
  kb_results: KbResult[];
}

export interface ProgressStep {
  step: string;
  message: string;
  done: boolean;
}

export interface SpeakerContext {
  speaker_name: string;
  company: string | null;
  role: string | null;
  pitch_summary: string;
  audience: string;
  tone: string;
}

export interface AutoDetectState {
  /** Whether a meeting has been detected but not yet confirmed by the user */
  pending: boolean;
  appName: string;
  isBrowser: boolean;
  /** Whether the meeting has ended and we're prompting to generate the deck */
  meetingEnded: boolean;
}

export interface SessionState {
  status: SessionStatus;
  transcript: string;
  topics: Topic[];
  progressSteps: ProgressStep[];
  downloadUrl: string | null;
  filename: string | null;
  speakerContext: SpeakerContext | null;
  error: string | null;
  elapsedSeconds: number;
  autoDetect: AutoDetectState;
}

const WS_URL = "/ws/session";
const SAMPLE_RATE = 16_000;
// How often (ms) we flush the audio buffer to the websocket
const FLUSH_INTERVAL_MS = 250;

// Ordered list of processing steps for the progress overlay
const PROCESSING_STEPS = [
  { step: "transcribing",       label: "Finalising transcript" },
  { step: "speaker_context",    label: "Identifying speaker context" },
  { step: "extracting_topics",  label: "Extracting key themes" },
  { step: "searching",          label: "Researching topics" },
  { step: "building_deck",      label: "Building pitch deck" },
];

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

// ---------------------------------------------------------------------------
// ElectronAPI type (matches preload.ts)
// ---------------------------------------------------------------------------

interface ElectronAPI {
  openFile: (path: string) => Promise<string>;
  onMeetingDetected: (cb: (e: { appName: string; isBrowser: boolean; source: string }) => void) => () => void;
  onMeetingEnded: (cb: (e: { appName: string }) => void) => () => void;
  dismissMeetingDetect: () => void;
  confirmMeetingDetect: () => void;
}

function getElectronAPI(): ElectronAPI | undefined {
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMeetingSession() {
  const [state, setState] = useState<SessionState>({
    status: "idle",
    transcript: "",
    topics: [],
    progressSteps: [],
    downloadUrl: null,
    filename: null,
    speakerContext: null,
    error: null,
    elapsedSeconds: 0,
    autoDetect: { pending: false, appName: "", isBrowser: false, meetingEnded: false },
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcmBufferRef = useRef<ArrayBuffer[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const set = (patch: Partial<SessionState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  // ---- Electron auto-detect IPC listeners ----------------------------------

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return; // Not running in Electron

    const removeMeetingDetected = api.onMeetingDetected((event) => {
      setState((prev) => {
        // Don't show banner if already recording or processing
        if (prev.status !== "idle" && prev.status !== "error") return prev;
        return {
          ...prev,
          autoDetect: {
            pending: true,
            appName: event.appName,
            isBrowser: event.isBrowser,
            meetingEnded: false,
          },
        };
      });
    });

    const removeMeetingEnded = api.onMeetingEnded((_event) => {
      setState((prev) => {
        // Only show "meeting ended" banner if we were recording
        if (prev.status !== "recording") return prev;
        return {
          ...prev,
          autoDetect: {
            ...prev.autoDetect,
            pending: false,
            meetingEnded: true,
          },
        };
      });
    });

    return () => {
      removeMeetingDetected();
      removeMeetingEnded();
    };
  }, []);

  // ---- start ---------------------------------------------------------------

  const start = useCallback(async () => {
    set({
      status: "connecting",
      transcript: "",
      topics: [],
      progressSteps: [],
      downloadUrl: null,
      filename: null,
      speakerContext: null,
      error: null,
      elapsedSeconds: 0,
    });

    // 1. Open WebSocket
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);

      if (msg.type === "transcript") {
        set({ transcript: msg.full as string });
      } else if (msg.type === "progress") {
        const step = msg.step as string;
        setState((prev) => {
          // Mark all previous steps as done, current step as in-progress
          const stepIndex = PROCESSING_STEPS.findIndex((s) => s.step === step);
          const updatedSteps: ProgressStep[] = PROCESSING_STEPS.map((s, i) => ({
            step: s.step,
            message: i === stepIndex ? (msg.message as string) : s.label,
            done: i < stepIndex,
          }));
          return { ...prev, progressSteps: updatedSteps, status: "processing" };
        });
      } else if (msg.type === "topics") {
        set({ topics: msg.topics as Topic[] });
      } else if (msg.type === "deck_ready") {
        set({
          status: "done",
          downloadUrl: msg.download_url as string,
          filename: msg.filename as string,
          speakerContext: (msg.speaker_context as SpeakerContext) ?? null,
        });
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

    // 5. Elapsed time counter
    elapsedTimerRef.current = setInterval(() => {
      setState((prev) =>
        prev.status === "recording"
          ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }
          : prev
      );
    }, 1000);

    set({ status: "recording" });
  }, []);

  // ---- stop ----------------------------------------------------------------

  const stop = useCallback(() => {
    // Stop elapsed timer
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

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

    // Tell server to stop and generate deck
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
      set({ status: "processing" });
    }
  }, []);

  // ---- openFile (Electron IPC or fallback) ---------------------------------

  const openFile = useCallback((filePath: string) => {
    // In Electron, use the IPC bridge exposed by preload.ts
    const electronAPI = (window as unknown as { electronAPI?: { openFile: (p: string) => void } }).electronAPI;
    if (electronAPI?.openFile) {
      electronAPI.openFile(filePath);
    } else {
      // Browser fallback: open download URL
      window.open(filePath, "_blank");
    }
  }, []);

  // ---- reset ---------------------------------------------------------------

  const reset = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setState({
      status: "idle",
      transcript: "",
      topics: [],
      progressSteps: [],
      downloadUrl: null,
      filename: null,
      speakerContext: null,
      error: null,
      elapsedSeconds: 0,
      autoDetect: { pending: false, appName: "", isBrowser: false, meetingEnded: false },
    });
  }, []);

  // ---- dismissAutoDetect ---------------------------------------------------

  const dismissAutoDetect = useCallback(() => {
    getElectronAPI()?.dismissMeetingDetect();
    setState((prev) => ({
      ...prev,
      autoDetect: { pending: false, appName: "", isBrowser: false, meetingEnded: false },
    }));
  }, []);

  // ---- confirmAutoDetect (start recording from auto-detect) ----------------

  const confirmAutoDetect = useCallback(async () => {
    getElectronAPI()?.confirmMeetingDetect();
    setState((prev) => ({
      ...prev,
      autoDetect: { pending: false, appName: "", isBrowser: false, meetingEnded: false },
    }));
    await start();
  }, [start]);

  // ---- dismissMeetingEnded -------------------------------------------------

  const dismissMeetingEnded = useCallback(() => {
    setState((prev) => ({
      ...prev,
      autoDetect: { ...prev.autoDetect, meetingEnded: false },
    }));
  }, []);

  return { state, start, stop, reset, openFile, dismissAutoDetect, confirmAutoDetect, dismissMeetingEnded };
}
