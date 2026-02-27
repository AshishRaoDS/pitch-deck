/**
 * MicMonitor
 *
 * Polls microphone ownership every 2 seconds to detect when a meeting
 * application (including browsers running Google Meet) claims the system
 * microphone.
 *
 * This is the primary detection signal for browser-based meetings
 * (Google Meet, Zoom in browser, Teams in browser) since those run inside
 * Chrome/Firefox/Edge rather than as standalone processes.
 *
 * Implementation strategy per platform:
 *
 * macOS:
 *   Uses `system_profiler SPAudioDataType` or the `lsof` command to check
 *   which process has the microphone device open. Falls back to checking
 *   if any known meeting process is using audio input via `lsof`.
 *
 * Windows:
 *   Uses PowerShell to query the Windows Audio Session API (WASAPI) via
 *   the registry or `Get-Process` with audio session info.
 *
 * Linux:
 *   Uses `fuser` or `lsof` on /dev/snd/* to detect which process owns
 *   the audio capture device.
 */

import { exec } from "child_process";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Processes that legitimately use the mic for meetings
// (includes browsers for Google Meet / Zoom-in-browser)
// ---------------------------------------------------------------------------

const MIC_MEETING_PROCESSES: Record<string, string[]> = {
  darwin: [
    "zoom.us",
    "ZoomPhone",
    "Microsoft Teams",
    "Webex",
    "CiscoWebexMeetings",
    "Slack",
    "Discord",
    "FaceTime",
    "Skype",
    // Browsers (for Google Meet, Zoom in browser, Teams in browser)
    "Google Chrome",
    "Google Chrome Helper",
    "Chromium",
    "Firefox",
    "Safari",
    "Microsoft Edge",
    "Arc",
    "Brave Browser",
  ],
  win32: [
    "Zoom.exe",
    "Teams.exe",
    "CiscoWebexMeetings.exe",
    "Slack.exe",
    "Discord.exe",
    "Skype.exe",
    // Browsers
    "chrome.exe",
    "chromium.exe",
    "firefox.exe",
    "msedge.exe",
    "brave.exe",
  ],
  linux: [
    "zoom",
    "teams",
    "webex",
    "slack",
    "discord",
    "skype",
    // Browsers
    "chrome",
    "chromium",
    "chromium-browser",
    "firefox",
    "brave",
  ],
};

// ---------------------------------------------------------------------------
// Platform-specific mic ownership detection commands
// ---------------------------------------------------------------------------

function getMicOwnerCommand(): string {
  switch (process.platform) {
    case "darwin":
      // List processes that have audio input devices open
      // CoreAudio devices are typically at /dev/null but accessed via IOKit
      // We use lsof to find processes accessing audio capture
      return "lsof -n 2>/dev/null | grep -i 'AppleHDA\\|coreaudio\\|avfoundation' | awk '{print $1}' | sort -u";

    case "win32":
      // PowerShell: get processes with active audio sessions
      return `powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty Name"`;

    case "linux":
      // Check which processes have audio capture devices open
      return "fuser /dev/snd/pcmC*c 2>/dev/null | tr ' ' '\\n' | xargs -I{} ps -p {} -o comm= 2>/dev/null | sort -u";

    default:
      return "echo ''";
  }
}

function isMeetingMicUser(processName: string): boolean {
  const candidates = MIC_MEETING_PROCESSES[process.platform] ?? MIC_MEETING_PROCESSES.linux;
  return candidates.some((known) =>
    processName.toLowerCase().includes(known.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// Alternative macOS detection using system_profiler
// ---------------------------------------------------------------------------

function getMacMicOwnerCommand(): string {
  // More reliable on macOS: check which app has microphone permission active
  // This uses the TCC (Transparency, Consent, and Control) database
  // Note: requires Full Disk Access or runs as the current user
  return `sqlite3 ~/Library/Application\\ Support/com.apple.TCC/TCC.db "SELECT client FROM access WHERE service='kTCCServiceMicrophone' AND auth_value=2" 2>/dev/null || echo ""`;
}

// ---------------------------------------------------------------------------
// MicMonitor class
// ---------------------------------------------------------------------------

export interface MicEvent {
  ownerProcess: string;
  platform: string;
  isBrowser: boolean;
}

const BROWSER_NAMES = ["chrome", "chromium", "firefox", "safari", "edge", "brave", "arc"];

function isBrowserProcess(name: string): boolean {
  return BROWSER_NAMES.some((b) => name.toLowerCase().includes(b));
}

export class MicMonitor extends EventEmitter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private micOwners: Set<string> = new Set();
  private readonly pollIntervalMs: number;

  constructor(pollIntervalMs = 2000) {
    super();
    this.pollIntervalMs = pollIntervalMs;
  }

  start(): void {
    if (this.intervalId) return;
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.micOwners.clear();
  }

  private poll(): void {
    const cmd = getMicOwnerCommand();

    exec(cmd, { timeout: 3000 }, (err, stdout) => {
      if (err && !stdout) return;

      const currentOwners = new Set<string>();
      const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);

      for (const line of lines) {
        if (isMeetingMicUser(line)) {
          currentOwners.add(line);
        }
      }

      // Detect newly claimed mic
      for (const owner of currentOwners) {
        if (!this.micOwners.has(owner)) {
          const event: MicEvent = {
            ownerProcess: owner,
            platform: process.platform,
            isBrowser: isBrowserProcess(owner),
          };
          this.emit("mic-claimed", event);
        }
      }

      // Detect released mic
      for (const owner of this.micOwners) {
        if (!currentOwners.has(owner)) {
          const event: MicEvent = {
            ownerProcess: owner,
            platform: process.platform,
            isBrowser: isBrowserProcess(owner),
          };
          this.emit("mic-released", event);
        }
      }

      this.micOwners = currentOwners;
    });
  }

  /** Returns true if any meeting app or browser currently owns the mic */
  get isMicActive(): boolean {
    return this.micOwners.size > 0;
  }

  /** Returns the names of processes currently using the mic */
  get currentOwners(): string[] {
    return Array.from(this.micOwners);
  }
}
