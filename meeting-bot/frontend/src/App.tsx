import { useMeetingSession, ProgressStep } from "./hooks/useMeetingSession";
import DeckDownload from "./components/DeckDownload";
import KnowledgeBasePanel from "./components/KnowledgeBasePanel";
import { AutoDetectBanner, MeetingEndedBanner } from "./components/AutoDetectBanner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const { state, start, stop, reset, openFile, dismissAutoDetect, confirmAutoDetect, dismissMeetingEnded } = useMeetingSession();
  const {
    status,
    transcript,
    progressSteps,
    downloadUrl,
    filename,
    speakerContext,
    error,
    elapsedSeconds,
    autoDetect,
  } = state;

  const isIdle = status === "idle" || status === "error";
  const isRecording = status === "recording";
  const isProcessing = status === "processing" || status === "connecting";
  const isDone = status === "done";

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <header style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎙</div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            background: "linear-gradient(90deg, #4f8eff, #4fe3c0)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 6,
          }}
        >
          Meeting Bot
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          Record your meeting · Get a speaker-perspective pitch deck
        </p>
      </header>

      {/* ── IDLE STATE ── */}
      {isIdle && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <BigButton variant="primary" onClick={start} icon="●">
            Start Recording
          </BigButton>
          {error && (
            <div
              style={{
                background: "#f8717122",
                border: "1px solid #f87171",
                borderRadius: 8,
                padding: "12px 16px",
                color: "#f87171",
                fontSize: 13,
                width: "100%",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── CONNECTING STATE ── */}
      {status === "connecting" && (
        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          <Spinner size={24} />
          <p style={{ marginTop: 12 }}>Connecting to server…</p>
        </div>
      )}

      {/* ── RECORDING STATE ── */}
      {isRecording && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* REC indicator + timer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#f87171",
                animation: "pulse 1.2s ease-in-out infinite",
              }}
            />
            <span style={{ color: "#f87171" }}>REC</span>
            <span style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 16 }}>
              {formatTime(elapsedSeconds)}
            </span>
          </div>

          <BigButton variant="danger" onClick={stop} icon="■">
            Stop &amp; Generate Deck
          </BigButton>

          {/* Live transcript */}
          {transcript && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "14px 16px",
                maxHeight: 200,
                overflowY: "auto",
                fontSize: 13,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Live Transcript
              </div>
              {transcript}
            </div>
          )}
        </div>
      )}

      {/* ── PROCESSING STATE ── */}
      {isProcessing && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
            Processing your meeting…
          </div>
          {progressSteps.length > 0 ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {progressSteps.map((step, i) => (
                <ProgressItem key={step.step} step={step} isActive={!step.done && i === progressSteps.findIndex((s) => !s.done)} />
              ))}
            </ul>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", fontSize: 13 }}>
              <Spinner size={16} />
              Initialising…
            </div>
          )}
        </div>
      )}

      {/* ── DONE STATE ── */}
      {isDone && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Speaker context badge */}
          {speakerContext && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "12px 16px",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                ✅ Pitch Deck Ready
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text)" }}>{speakerContext.speaker_name}</strong>
                {speakerContext.company && (
                  <> · {speakerContext.company}</>
                )}
                {speakerContext.role && (
                  <> · {speakerContext.role}</>
                )}
              </div>
              {speakerContext.pitch_summary && (
                <div style={{ color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
                  "{speakerContext.pitch_summary}"
                </div>
              )}
            </div>
          )}

          {/* Download / open */}
          {downloadUrl && filename && (
            <DeckDownload
              downloadUrl={downloadUrl}
              filename={filename}
              onOpenFile={openFile}
            />
          )}

          <BigButton variant="secondary" onClick={reset} icon="↺">
            New Session
          </BigButton>
        </div>
      )}

      {/* ── KNOWLEDGE BASE PANEL (always visible) ── */}
      <KnowledgeBasePanel />

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── AUTO-DETECT BANNERS (fixed overlays, Electron only) ── */}
      {autoDetect.pending && (
        <AutoDetectBanner
          appName={autoDetect.appName}
          isBrowser={autoDetect.isBrowser}
          onStartRecording={confirmAutoDetect}
          onDismiss={dismissAutoDetect}
          countdownSeconds={10}
        />
      )}
      {autoDetect.meetingEnded && (
        <MeetingEndedBanner
          appName={autoDetect.appName}
          onGenerateDeck={() => {
            dismissMeetingEnded();
            stop();
          }}
          onDismiss={dismissMeetingEnded}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface BigButtonProps {
  variant: "primary" | "secondary" | "danger";
  onClick: () => void;
  icon?: string;
  children: React.ReactNode;
}

const bigBtnStyles: Record<BigButtonProps["variant"], React.CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "#fff",
    boxShadow: "0 4px 20px #4f8eff44",
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

function BigButton({ variant, onClick, icon, children }: BigButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "14px 32px",
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 16,
        border: "none",
        cursor: "pointer",
        width: "100%",
        transition: "opacity 0.15s, transform 0.1s",
        ...bigBtnStyles[variant],
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.opacity = "0.88";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.opacity = "1";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
      }}
    >
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      {children}
    </button>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `${Math.max(2, size / 8)}px solid var(--border)`,
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function ProgressItem({ step, isActive }: { step: ProgressStep; isActive: boolean }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        color: step.done ? "#4FE3C0" : isActive ? "var(--text)" : "var(--text-muted)",
      }}
    >
      <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>
        {step.done ? "✓" : isActive ? <Spinner size={14} /> : "○"}
      </span>
      <span>{step.message}</span>
    </li>
  );
}
