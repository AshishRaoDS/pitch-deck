import type { SessionStatus } from "../hooks/useMeetingSession";

const labels: Record<SessionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  recording: "Recording",
  processing: "Processing…",
  done: "Done",
  error: "Error",
};

const colors: Record<SessionStatus, string> = {
  idle: "#94a3b8",
  connecting: "#fbbf24",
  recording: "#f87171",
  processing: "#818cf8",
  done: "#34d399",
  error: "#f87171",
};

interface Props {
  status: SessionStatus;
}

export default function StatusBadge({ status }: Props) {
  const color = colors[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {status === "recording" && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            animation: "pulse 1.2s infinite",
          }}
        />
      )}
      {labels[status]}
    </span>
  );
}
