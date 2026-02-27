/**
 * AutoDetectBanner
 *
 * Shown when the meeting detector fires a 'meeting-detected' event.
 * Displays a notification with:
 *   - Which app was detected (Zoom, Google Meet in Chrome, etc.)
 *   - A 10-second countdown before auto-starting recording
 *   - "Start Now" button to start immediately
 *   - "Dismiss" button to cancel
 *
 * Also shown when a meeting ends (with option to generate deck or dismiss).
 */

import { useEffect, useRef, useState } from "react";

export interface AutoDetectBannerProps {
  /** The detected app name (e.g. "zoom.us", "Google Chrome") */
  appName: string;
  /** Whether the detected app is a browser (Google Meet, Zoom-in-browser) */
  isBrowser: boolean;
  /** Called when user confirms recording should start */
  onStartRecording: () => void;
  /** Called when user dismisses the notification */
  onDismiss: () => void;
  /** Countdown seconds before auto-start (default: 10) */
  countdownSeconds?: number;
}

export function AutoDetectBanner({
  appName,
  isBrowser,
  onStartRecording,
  onDismiss,
  countdownSeconds = 10,
}: AutoDetectBannerProps) {
  const [remaining, setRemaining] = useState(countdownSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onStartRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onStartRecording]);

  const displayName = isBrowser
    ? "Google Meet / browser call"
    : formatAppName(appName);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(480px, calc(100vw - 48px))",
        background: "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)",
        border: "1px solid #4f8eff88",
        borderRadius: 12,
        padding: "18px 20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        animation: "slideUp 0.3s ease-out",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🎙</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 3 }}>
            Meeting detected
          </div>
          <div style={{ fontSize: 13, color: "#94c6ff" }}>
            {displayName} is using your microphone
          </div>
        </div>
        {/* Countdown ring */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: `conic-gradient(#4f8eff ${(remaining / countdownSeconds) * 360}deg, #1e3a5f 0deg)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#0f2744",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#4f8eff",
            }}
          >
            {remaining}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#94c6ff" }}>
        Recording will start automatically in {remaining}s
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            onStartRecording();
          }}
          style={{
            flex: 1,
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ● Start Now
        </button>
        <button
          onClick={() => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            onDismiss();
          }}
          style={{
            background: "transparent",
            color: "#94c6ff",
            border: "1px solid #4f8eff44",
            borderRadius: 8,
            padding: "9px 16px",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MeetingEndedBanner
// ---------------------------------------------------------------------------

export interface MeetingEndedBannerProps {
  appName: string;
  onGenerateDeck: () => void;
  onDismiss: () => void;
}

export function MeetingEndedBanner({
  appName,
  onGenerateDeck,
  onDismiss,
}: MeetingEndedBannerProps) {
  const [remaining, setRemaining] = useState(5);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onGenerateDeck();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onGenerateDeck]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(480px, calc(100vw - 48px))",
        background: "linear-gradient(135deg, #1a3a1a 0%, #0f2a0f 100%)",
        border: "1px solid #4fe3c088",
        borderRadius: 12,
        padding: "18px 20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        animation: "slideUp 0.3s ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>✅</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 3 }}>
            Meeting ended
          </div>
          <div style={{ fontSize: 13, color: "#86efac" }}>
            Generating your pitch deck in {remaining}s…
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            onGenerateDeck();
          }}
          style={{
            flex: 1,
            background: "#4FE3C0",
            color: "#0f172a",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Generate Deck Now
        </button>
        <button
          onClick={() => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            onDismiss();
          }}
          style={{
            background: "transparent",
            color: "#86efac",
            border: "1px solid #4fe3c044",
            borderRadius: 8,
            padding: "9px 16px",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAppName(raw: string): string {
  const map: Record<string, string> = {
    "zoom.us": "Zoom",
    "Zoom.exe": "Zoom",
    "zoom": "Zoom",
    "Microsoft Teams": "Microsoft Teams",
    "Teams.exe": "Microsoft Teams",
    "teams": "Microsoft Teams",
    "Webex": "Webex",
    "CiscoWebexMeetings": "Webex",
    "CiscoWebexMeetings.exe": "Webex",
    "Slack": "Slack",
    "Slack.exe": "Slack",
    "slack": "Slack",
    "Discord": "Discord",
    "Discord.exe": "Discord",
    "discord": "Discord",
    "FaceTime": "FaceTime",
    "Skype": "Skype",
    "Skype.exe": "Skype",
  };
  return map[raw] ?? raw;
}
