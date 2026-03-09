import { useEffect, useRef, useState } from "react";
import { useMeetingSession, type DeckTheme } from "./hooks/useMeetingSession";
import StatusBadge from "./components/StatusBadge";
import TranscriptPanel from "./components/TranscriptPanel";
import TopicsPanel from "./components/TopicsPanel";
import DeckDownload from "./components/DeckDownload";
import KnowledgeUpload from "./components/KnowledgeUpload";
import ApiKeySetup from "./components/ApiKeySetup";

type BootState = "loading" | "needs-key" | "backend-starting" | "ready" | "backend-error";
type MicStatus = "granted" | "denied" | "not-determined" | "restricted" | null;

export default function App() {
  const isElectron = !!window.electronAPI;
  const [bootState, setBootState] = useState<BootState>(isElectron ? "loading" : "ready");
  const [backendPort, setBackendPort] = useState<number | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<MicStatus>(null);
  const [showCallPrompt, setShowCallPrompt] = useState(false);
  const statusRef = useRef<string>("idle");

  useEffect(() => {
    if (!isElectron) return;

    const api = window.electronAPI!;

    api.onBackendReady((port) => {
      setBackendPort(port);
      setBootState("ready");
    });

    api.onBackendError((msg) => {
      setBootError(msg);
      setBootState("backend-error");
    });

    api.hasApiKey().then((has) => {
      if (!has) {
        setBootState("needs-key");
      }
      // If has key, main process starts backend and fires backend:ready
    });

    api.getMicStatus().then(setMicStatus);

  }, [isElectron]);

  // Listen for call-detected DOM event dispatched by the preload.
  // Using a CustomEvent instead of a contextBridge callback is more reliable
  // because DOM event listeners are never garbage-collected by the bridge.
  useEffect(() => {
    if (!isElectron) return;
    const handler = () => {
      if (statusRef.current === "idle" || statusRef.current === "error") {
        setShowCallPrompt(true);
      }
    };
    window.addEventListener("meetingbot:call-detected", handler);
    return () => window.removeEventListener("meetingbot:call-detected", handler);
  }, [isElectron]);

  async function handleRequestMic() {
    const api = window.electronAPI!;
    const granted = await api.requestMicAccess();
    const status = await api.getMicStatus();
    setMicStatus(status ?? (granted ? "granted" : "denied"));
  }

  const { state, start, stop, reset, uploadKnowledge, chooseBuildDeck, setTheme } = useMeetingSession(backendPort);
  const { status, transcript, topics, downloadUrl, filename, error, uploadedFiles, buildDeck, theme } = state;

  // Keep ref in sync for use inside the onCallDetected callback
  useEffect(() => { statusRef.current = status; }, [status]);

  if (bootState === "needs-key") {
    return (
      <ApiKeySetup
        onKeySet={(port) => {
          setBackendPort(port);
          setBootState("ready");
        }}
      />
    );
  }

  if (bootState === "loading" || bootState === "backend-starting") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, color: "var(--text-muted)" }}>
        <Spinner />
        {bootState === "loading" ? "Starting backend…" : "Restarting backend…"}
      </div>
    );
  }

  if (bootState === "backend-error") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "32px", background: "#f8717122", border: "1px solid #f87171", borderRadius: 12, color: "#f87171" }}>
        <strong>Backend failed to start</strong>
        <p style={{ marginTop: 8, fontSize: 14 }}>{bootError}</p>
      </div>
    );
  }

  const isRecording = status === "recording";
  const isProcessing = status === "processing" || status === "connecting";
  const isDone = status === "done";
  const isIdle = status === "idle" || status === "error";

  return (
    <div
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              background: "linear-gradient(90deg, #4f8eff, #4fe3c0)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: 4,
            }}
          >
            Meeting Bot
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Record → Transcribe → Research → Pitch Deck
          </p>
        </div>
        <StatusBadge status={status} />
      </header>

      {/* Mic permission banner */}
      {isElectron && micStatus === "not-determined" && (
        <div
          style={{
            background: "#1e3a5f",
            border: "1px solid #4f8eff",
            borderRadius: "var(--radius)",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 14,
          }}
        >
          <span style={{ color: "var(--text)" }}>
            Microphone access is required for recording. Allow access to get started.
          </span>
          <button
            onClick={handleRequestMic}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Allow Microphone
          </button>
        </div>
      )}
      {isElectron && (micStatus === "denied" || micStatus === "restricted") && (
        <div
          style={{
            background: "#3b1f1f",
            border: "1px solid #f87171",
            borderRadius: "var(--radius)",
            padding: "14px 18px",
            fontSize: 14,
            color: "#fca5a5",
          }}
        >
          <strong>Microphone access is blocked.</strong> Open{" "}
          <strong>System Settings → Privacy &amp; Security → Microphone</strong> and enable access
          for this app, then restart.
        </div>
      )}

      {/* Call detected prompt */}
      {showCallPrompt && isIdle && (
        <div
          style={{
            background: "#1a2a3a",
            border: "1px solid #4f8eff",
            borderRadius: "var(--radius)",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 14,
          }}
        >
          <span style={{ color: "var(--text)" }}>
            It looks like you're on a call. Start transcribing?
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setShowCallPrompt(false); start(); }}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "7px 14px",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Yes, transcribe
            </button>
            <button
              onClick={() => setShowCallPrompt(false)}
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "7px 14px",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Knowledge upload (idle only) */}
      {isIdle && (
        <KnowledgeUpload uploadedFiles={uploadedFiles} onUpload={uploadKnowledge} />
      )}

      {/* Deck theme selector (idle only) */}
      {isIdle && (
        <ThemeSelector selected={theme} onChange={setTheme} />
      )}

      {/* Pitch deck choice banner — appears when recording starts */}
      {isRecording && buildDeck === null && (
        <div
          style={{
            background: "#1a2a1a",
            border: "1px solid #4ade80",
            borderRadius: "var(--radius)",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 14,
          }}
        >
          <span style={{ color: "var(--text)" }}>
            Build a pitch deck from this meeting?
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => chooseBuildDeck(true)}
              style={{
                background: "#4ade80",
                color: "#052e16",
                border: "none",
                borderRadius: 6,
                padding: "7px 14px",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Yes, build deck
            </button>
            <button
              onClick={() => chooseBuildDeck(false)}
              style={{
                background: "transparent",
                color: "#86efac",
                border: "1px solid #4ade8066",
                borderRadius: 6,
                padding: "7px 14px",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Transcribe only
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {isIdle && (
          <Button variant="primary" onClick={start} icon={<MicIcon />}>
            Start Recording
          </Button>
        )}
        {isRecording && (
          <Button variant="danger" onClick={stop} icon={<StopIcon />}>
            {buildDeck === false ? "Stop & Save Transcript" : "Stop & Generate"}
          </Button>
        )}
        {(isDone || status === "error") && (
          <Button variant="secondary" onClick={reset} icon={<ResetIcon />}>
            New Session
          </Button>
        )}
        {isProcessing && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", fontSize: 14 }}>
            <Spinner />
            {status === "connecting" ? "Connecting to server…" : "Analysing, searching web, building deck…"}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: "#f8717122",
            border: "1px solid #f87171",
            borderRadius: "var(--radius)",
            padding: "14px 18px",
            color: "#f87171",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Transcript */}
      {(transcript || isRecording) && (
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, color: "var(--text-muted)" }}>
            Live Transcript
          </h2>
          <TranscriptPanel text={transcript} />
        </section>
      )}

      {/* Deck download */}
      {isDone && downloadUrl && filename && (
        <DeckDownload downloadUrl={downloadUrl} filename={filename} />
      )}

      {/* Topics */}
      <TopicsPanel topics={topics} />

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small reusable sub-components
// ---------------------------------------------------------------------------

interface ButtonProps {
  variant: "primary" | "secondary" | "danger";
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const btnStyles: Record<ButtonProps["variant"], React.CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "#fff",
    boxShadow: "0 4px 14px #4f8eff33",
  },
  secondary: {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
  },
  danger: {
    background: "#7f1d1d",
    color: "#fca5a5",
    border: "1px solid #f87171",
  },
};

function Button({ variant, onClick, icon, children }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 15,
        border: "none",
        transition: "opacity 0.15s",
        ...btnStyles[variant],
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.opacity = "0.85")}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.opacity = "1")}
    >
      {icon}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 16,
        height: 16,
        border: "2px solid var(--border)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.72L1 10" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Theme selector
// ---------------------------------------------------------------------------

const THEME_OPTIONS: { value: DeckTheme; label: string; accent: string; bg: string }[] = [
  { value: "midnight", label: "Midnight",  accent: "#4F8EFF", bg: "#0F172A" },
  { value: "slate",    label: "Slate",     accent: "#7C3AED", bg: "#0F0F1A" },
  { value: "forest",   label: "Forest",    accent: "#10B981", bg: "#0D1F12" },
  { value: "corporate",label: "Corporate", accent: "#1E3A5F", bg: "#FFFFFF" },
];

function ThemeSelector({ selected, onChange }: { selected: DeckTheme; onChange: (t: DeckTheme) => void }) {
  return (
    <div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 10, fontWeight: 500 }}>
        Deck theme
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {THEME_OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 8,
                border: isSelected ? `2px solid ${opt.accent}` : "2px solid var(--border)",
                background: isSelected ? `${opt.accent}18` : "var(--surface)",
                color: isSelected ? opt.accent : "var(--text-muted)",
                fontWeight: isSelected ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {/* mini slide preview swatch */}
              <span
                style={{
                  display: "inline-flex",
                  width: 28,
                  height: 18,
                  borderRadius: 3,
                  background: opt.bg,
                  border: `1px solid ${opt.accent}55`,
                  position: "relative",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: "absolute",
                  left: 0, top: 0,
                  width: "100%", height: 3,
                  background: opt.accent,
                }} />
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
