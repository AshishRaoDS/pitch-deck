import { useMeetingSession } from "./hooks/useMeetingSession";
import StatusBadge from "./components/StatusBadge";
import TranscriptPanel from "./components/TranscriptPanel";
import TopicsPanel from "./components/TopicsPanel";
import DeckDownload from "./components/DeckDownload";
import KnowledgeUpload from "./components/KnowledgeUpload";

export default function App() {
  const { state, start, stop, reset, uploadKnowledge } = useMeetingSession();
  const { status, transcript, topics, downloadUrl, filename, error, uploadedFiles } = state;

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

      {/* Knowledge upload (idle only) */}
      {isIdle && (
        <KnowledgeUpload uploadedFiles={uploadedFiles} onUpload={uploadKnowledge} />
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
            Stop & Generate
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
