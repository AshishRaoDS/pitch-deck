import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import { MeetingDetector, MeetingDetectedEvent, MeetingEndedEvent } from "./meeting-detector";

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let meetingDetector: MeetingDetector | null = null;

// ---------------------------------------------------------------------------
// Backend process management
// ---------------------------------------------------------------------------

function startBackend(): void {
  const backendDir = path.join(__dirname, "../../backend");

  // Try to use a local venv first, fall back to system python
  const pythonCandidates = [
    path.join(backendDir, ".venv", "bin", "python"),
    path.join(backendDir, "venv", "bin", "python"),
    "python3",
    "python",
  ];

  const python = pythonCandidates[0]; // In production, use the bundled venv

  backendProcess = spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
    {
      cwd: backendDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  backendProcess.stdout?.on("data", (data: Buffer) => {
    console.log("[backend]", data.toString().trim());
  });

  backendProcess.stderr?.on("data", (data: Buffer) => {
    console.error("[backend]", data.toString().trim());
  });

  backendProcess.on("exit", (code) => {
    console.log(`[backend] exited with code ${code}`);
    backendProcess = null;
  });
}

function stopBackend(): void {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    backendProcess = null;
  }
}

// ---------------------------------------------------------------------------
// Meeting detector
// ---------------------------------------------------------------------------

function startMeetingDetector(): void {
  meetingDetector = new MeetingDetector();

  meetingDetector.on("meeting-detected", (event: MeetingDetectedEvent) => {
    console.log("[detector] Meeting detected:", event.appName, event.isBrowser ? "(browser)" : "(native)");

    // Send to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("meeting-detected", event);

      // Bring window to front so user sees the notification
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  meetingDetector.on("meeting-ended", (event: MeetingEndedEvent) => {
    console.log("[detector] Meeting ended:", event.appName);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("meeting-ended", event);
    }
  });

  meetingDetector.start();
  console.log("[detector] Meeting detector started");
}

function stopMeetingDetector(): void {
  if (meetingDetector) {
    meetingDetector.stop();
    meetingDetector = null;
  }
}

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 620,
    height: 820,
    minWidth: 480,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0f172a",
    title: "Meeting Bot",
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    // Development: load from Vite dev server
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: load from built files
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  startBackend();

  // Give the backend a moment to start before opening the window
  setTimeout(() => {
    createWindow();
    // Start meeting detector after window is ready
    startMeetingDetector();
  }, 1500);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopMeetingDetector();
  stopBackend();
});

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

/**
 * Open a file with the system's default application (e.g. PowerPoint, Keynote).
 */
ipcMain.handle("open-file", async (_event, filePath: string) => {
  const result = await shell.openPath(filePath);
  if (result) {
    console.error("[electron] Failed to open file:", result);
  }
  return result;
});

/**
 * Renderer tells us the user dismissed the auto-detect notification.
 * We suppress further notifications for this meeting session.
 */
ipcMain.on("meeting-detect-dismissed", () => {
  console.log("[detector] User dismissed meeting detection notification");
  // The detector keeps running but the renderer won't show the banner again
  // until the next meeting-detected event
});

/**
 * Renderer tells us the user confirmed auto-start recording.
 * Nothing to do in main process — renderer handles the recording start.
 */
ipcMain.on("meeting-detect-confirmed", () => {
  console.log("[detector] User confirmed auto-start recording");
});
