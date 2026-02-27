/**
 * MeetingDetector
 *
 * Orchestrates ProcessWatcher and MicMonitor to provide a unified, debounced
 * meeting detection signal.
 *
 * Detection logic:
 * - A meeting is considered "started" when EITHER:
 *   a) A known meeting app process starts (native apps: Zoom, Teams, etc.)
 *   b) A browser or meeting app claims the microphone
 *
 * - A meeting is considered "ended" when BOTH:
 *   a) No known meeting process is running
 *   b) No meeting app/browser owns the microphone
 *
 * Debouncing:
 * - Meeting start: requires the signal to persist for 3 seconds before firing
 *   (avoids false positives from brief mic access like voice search)
 * - Meeting end: requires the signal to persist for 8 seconds before firing
 *   (avoids false negatives from brief mic drops during a call)
 *
 * Events emitted:
 *   'meeting-detected'  { source: 'process' | 'mic', appName: string, isBrowser: boolean }
 *   'meeting-ended'     { appName: string }
 */

import { EventEmitter } from "events";
import { MicMonitor, MicEvent } from "./mic-monitor";
import { ProcessWatcher, ProcessEvent } from "./process-watcher";

export interface MeetingDetectedEvent {
  source: "process" | "mic";
  appName: string;
  isBrowser: boolean;
}

export interface MeetingEndedEvent {
  appName: string;
}

const START_DEBOUNCE_MS = 3000;  // 3s before firing meeting-detected
const END_DEBOUNCE_MS = 8000;    // 8s before firing meeting-ended

export class MeetingDetector extends EventEmitter {
  private processWatcher: ProcessWatcher;
  private micMonitor: MicMonitor;

  private meetingActive = false;
  private currentAppName = "";
  private currentIsBrowser = false;

  private startDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private endDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.processWatcher = new ProcessWatcher(5000);
    this.micMonitor = new MicMonitor(2000);
    this.bindEvents();
  }

  private bindEvents(): void {
    // Process watcher events
    this.processWatcher.on("meeting-process-started", (event: ProcessEvent) => {
      this.onMeetingSignal("process", event.processName, false);
    });

    this.processWatcher.on("meeting-process-stopped", (_event: ProcessEvent) => {
      this.checkMeetingEnd();
    });

    // Mic monitor events
    this.micMonitor.on("mic-claimed", (event: MicEvent) => {
      this.onMeetingSignal("mic", event.ownerProcess, event.isBrowser);
    });

    this.micMonitor.on("mic-released", (_event: MicEvent) => {
      this.checkMeetingEnd();
    });
  }

  private onMeetingSignal(
    source: "process" | "mic",
    appName: string,
    isBrowser: boolean
  ): void {
    // Cancel any pending end debounce
    if (this.endDebounceTimer) {
      clearTimeout(this.endDebounceTimer);
      this.endDebounceTimer = null;
    }

    // If meeting already active, ignore duplicate starts
    if (this.meetingActive) return;

    // Cancel any existing start debounce and restart
    if (this.startDebounceTimer) {
      clearTimeout(this.startDebounceTimer);
    }

    this.startDebounceTimer = setTimeout(() => {
      this.startDebounceTimer = null;
      this.meetingActive = true;
      this.currentAppName = appName;
      this.currentIsBrowser = isBrowser;

      const event: MeetingDetectedEvent = { source, appName, isBrowser };
      this.emit("meeting-detected", event);
    }, START_DEBOUNCE_MS);
  }

  private checkMeetingEnd(): void {
    // Only consider ending if meeting was active
    if (!this.meetingActive) return;

    // Cancel any pending start debounce
    if (this.startDebounceTimer) {
      clearTimeout(this.startDebounceTimer);
      this.startDebounceTimer = null;
    }

    // Check if both signals are gone
    const hasProcess = this.processWatcher.hasMeetingProcess;
    const hasMic = this.micMonitor.isMicActive;

    if (hasProcess || hasMic) {
      // Still active — cancel any end debounce
      if (this.endDebounceTimer) {
        clearTimeout(this.endDebounceTimer);
        this.endDebounceTimer = null;
      }
      return;
    }

    // Both signals gone — start end debounce
    if (this.endDebounceTimer) return; // already debouncing

    this.endDebounceTimer = setTimeout(() => {
      this.endDebounceTimer = null;

      // Double-check signals are still gone
      if (this.processWatcher.hasMeetingProcess || this.micMonitor.isMicActive) {
        return;
      }

      this.meetingActive = false;
      const event: MeetingEndedEvent = { appName: this.currentAppName };
      this.emit("meeting-ended", event);
      this.currentAppName = "";
      this.currentIsBrowser = false;
    }, END_DEBOUNCE_MS);
  }

  start(): void {
    this.processWatcher.start();
    this.micMonitor.start();
  }

  stop(): void {
    this.processWatcher.stop();
    this.micMonitor.stop();

    if (this.startDebounceTimer) {
      clearTimeout(this.startDebounceTimer);
      this.startDebounceTimer = null;
    }
    if (this.endDebounceTimer) {
      clearTimeout(this.endDebounceTimer);
      this.endDebounceTimer = null;
    }

    this.meetingActive = false;
  }

  get isActive(): boolean {
    return this.meetingActive;
  }

  get currentApp(): string {
    return this.currentAppName;
  }

  get isCurrentBrowser(): boolean {
    return this.currentIsBrowser;
  }
}
