/**
 * ProcessWatcher
 *
 * Polls running processes every 5 seconds to detect when known meeting
 * applications start or stop. Works for native desktop apps (Zoom, Teams,
 * Webex, Slack, Discord).
 *
 * For browser-based meetings (Google Meet in Chrome), this watcher alone
 * is insufficient — use MicMonitor as the primary signal for those.
 */

import { exec } from "child_process";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Known meeting app process names per platform
// ---------------------------------------------------------------------------

const MEETING_PROCESSES: Record<string, string[]> = {
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
  ],
  win32: [
    "Zoom.exe",
    "Teams.exe",
    "CiscoWebexMeetings.exe",
    "Slack.exe",
    "Discord.exe",
    "Skype.exe",
    "lync.exe",
  ],
  linux: [
    "zoom",
    "teams",
    "webex",
    "slack",
    "discord",
    "skype",
  ],
};

// ---------------------------------------------------------------------------
// Platform-specific process list commands
// ---------------------------------------------------------------------------

function getProcessListCommand(): string {
  switch (process.platform) {
    case "darwin":
      return "ps -eo comm=";
    case "win32":
      return "tasklist /fo csv /nh";
    case "linux":
      return "ps -eo comm=";
    default:
      return "ps -eo comm=";
  }
}

function parseProcessList(output: string): Set<string> {
  const names = new Set<string>();
  const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);

  if (process.platform === "win32") {
    // CSV format: "process.exe","PID","Session Name","Session#","Mem Usage"
    for (const line of lines) {
      const match = line.match(/^"([^"]+)"/);
      if (match) names.add(match[1]);
    }
  } else {
    for (const line of lines) {
      names.add(line);
    }
  }

  return names;
}

function isMeetingProcess(processName: string): boolean {
  const candidates = MEETING_PROCESSES[process.platform] ?? MEETING_PROCESSES.linux;
  return candidates.some((known) =>
    processName.toLowerCase().includes(known.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// ProcessWatcher class
// ---------------------------------------------------------------------------

export interface ProcessEvent {
  processName: string;
  platform: string;
}

export class ProcessWatcher extends EventEmitter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private activeMeetingProcesses: Set<string> = new Set();
  private readonly pollIntervalMs: number;

  constructor(pollIntervalMs = 5000) {
    super();
    this.pollIntervalMs = pollIntervalMs;
  }

  start(): void {
    if (this.intervalId) return;
    this.poll(); // immediate first check
    this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.activeMeetingProcesses.clear();
  }

  private poll(): void {
    const cmd = getProcessListCommand();
    exec(cmd, { timeout: 5000 }, (err, stdout) => {
      if (err) return; // Silently ignore errors (e.g. permission denied)

      const currentProcesses = parseProcessList(stdout);
      const currentMeetingProcesses = new Set<string>();

      for (const name of currentProcesses) {
        if (isMeetingProcess(name)) {
          currentMeetingProcesses.add(name);
        }
      }

      // Detect newly started meeting processes
      for (const name of currentMeetingProcesses) {
        if (!this.activeMeetingProcesses.has(name)) {
          this.emit("meeting-process-started", { processName: name, platform: process.platform } as ProcessEvent);
        }
      }

      // Detect stopped meeting processes
      for (const name of this.activeMeetingProcesses) {
        if (!currentMeetingProcesses.has(name)) {
          this.emit("meeting-process-stopped", { processName: name, platform: process.platform } as ProcessEvent);
        }
      }

      this.activeMeetingProcesses = currentMeetingProcesses;
    });
  }

  /** Returns true if any known meeting process is currently running */
  get hasMeetingProcess(): boolean {
    return this.activeMeetingProcesses.size > 0;
  }

  /** Returns the names of currently active meeting processes */
  get activeMeetings(): string[] {
    return Array.from(this.activeMeetingProcesses);
  }
}
