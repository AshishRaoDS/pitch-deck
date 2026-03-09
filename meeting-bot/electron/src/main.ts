import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  systemPreferences,
  Tray,
} from "electron";
import { ChildProcess, exec, spawn } from "child_process";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort: number | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Mic-polling globals
let micDetectorBinary: string | null = null;
let micPollInterval: ReturnType<typeof setInterval> | null = null;
let prevMicInUse = false;

const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Port utilities
// ---------------------------------------------------------------------------

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function waitForBackend(port: number, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const sock = net.createConnection({ port, host: "127.0.0.1" });
      sock.on("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Backend did not start in time"));
        } else {
          setTimeout(attempt, 300);
        }
      });
    }
    attempt();
  });
}

// ---------------------------------------------------------------------------
// API key storage
// ---------------------------------------------------------------------------

function keyFilePath(): string {
  return path.join(app.getPath("userData"), "encrypted_api_key");
}

function loadApiKey(): string | null {
  const fp = keyFilePath();
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = fs.readFileSync(fp);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw);
    }
    return raw.toString("utf-8");
  } catch {
    return null;
  }
}

function saveApiKey(key: string): void {
  const fp = keyFilePath();
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(fp, safeStorage.encryptString(key));
  } else {
    fs.writeFileSync(fp, Buffer.from(key, "utf-8"));
  }
}

// ---------------------------------------------------------------------------
// Backend process
// ---------------------------------------------------------------------------

async function startBackend(apiKey: string): Promise<number> {
  if (backendProcess) stopBackend();

  const port = await findFreePort();
  backendPort = port;

  const env = {
    ...process.env,
    OPENAI_API_KEY: apiKey,
    CORS_ORIGINS: "*",
    PORT: String(port),
    HOST: "127.0.0.1",
  };

  if (isDev) {
    const backendDir = path.join(__dirname, "..", "..", "backend");
    backendProcess = spawn(
      "python3",
      ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)],
      { cwd: backendDir, env, stdio: "inherit" }
    );
  } else {
    const ext = process.platform === "win32" ? ".exe" : "";
    const binary = path.join(
      process.resourcesPath,
      "backend",
      "meeting-bot-server",
      `meeting-bot-server${ext}`
    );
    backendProcess = spawn(binary, [], { env, stdio: "inherit" });
  }

  backendProcess.on("error", (err) => {
    mainWindow?.webContents.send("backend:error", err.message);
  });

  backendProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      mainWindow?.webContents.send("backend:error", `Backend exited with code ${code}`);
    }
  });

  await waitForBackend(port);
  return port;
}

function stopBackend(): void {
  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    backendProcess = null;
    backendPort = null;
  }
}

// ---------------------------------------------------------------------------
// Mic detection (macOS only — uses CoreAudio to detect any app using the mic)
// Checks ALL input devices, not just the default, so virtual/aggregate devices
// used by browsers (Chrome, Firefox) are also detected.
// ---------------------------------------------------------------------------

// Checks every audio input device for kAudioDevicePropertyDeviceIsRunningSomewhere.
// Returns "1\n" if ANY input device is being used by any process, "0\n" otherwise.
const MIC_DETECT_SRC = `
#include <stdio.h>
#include <stdlib.h>
#include <CoreAudio/CoreAudio.h>
int main() {
    AudioObjectPropertyAddress devicesAddr = {
        kAudioHardwarePropertyDevices,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    UInt32 dataSize = 0;
    AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &devicesAddr, 0, NULL, &dataSize);
    UInt32 deviceCount = dataSize / sizeof(AudioDeviceID);
    if (deviceCount == 0) { printf("0\\n"); return 0; }

    AudioDeviceID *devices = (AudioDeviceID *)malloc(dataSize);
    AudioObjectGetPropertyData(kAudioObjectSystemObject, &devicesAddr, 0, NULL, &dataSize, devices);

    for (UInt32 i = 0; i < deviceCount; i++) {
        /* Skip devices with no input streams */
        AudioObjectPropertyAddress streamAddr = {
            kAudioDevicePropertyStreams,
            kAudioDevicePropertyScopeInput,
            kAudioObjectPropertyElementMain
        };
        UInt32 streamSize = 0;
        AudioObjectGetPropertyDataSize(devices[i], &streamAddr, 0, NULL, &streamSize);
        if (streamSize == 0) continue;

        UInt32 isRunning = 0;
        UInt32 propSize = sizeof(UInt32);
        AudioObjectPropertyAddress runAddr = {
            kAudioDevicePropertyDeviceIsRunningSomewhere,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        AudioObjectGetPropertyData(devices[i], &runAddr, 0, NULL, &propSize, &isRunning);
        if (isRunning) { free(devices); printf("1\\n"); return 0; }
    }
    free(devices);
    printf("0\\n");
    return 0;
}
`;

async function compileMicDetector(): Promise<void> {
  if (process.platform !== "darwin") return;
  const srcPath = path.join(os.tmpdir(), "mic-detect-v2.c");
  const binPath = path.join(os.tmpdir(), "mic-detect-v2");
  fs.writeFileSync(srcPath, MIC_DETECT_SRC);
  console.log("[mic-detect] Compiling mic detector binary...");
  await new Promise<void>((resolve) => {
    exec(
      `/usr/bin/cc -framework CoreAudio "${srcPath}" -o "${binPath}"`,
      { timeout: 30_000 },
      (err, _stdout, stderr) => {
        if (!err) {
          micDetectorBinary = binPath;
          console.log("[mic-detect] Compilation succeeded:", binPath);
        } else {
          console.error("[mic-detect] Compilation FAILED:", err.message, stderr);
        }
        resolve();
      }
    );
  });
}

function checkMicInUse(): Promise<boolean> {
  if (!micDetectorBinary) return Promise.resolve(false);
  return new Promise((resolve) => {
    exec(`"${micDetectorBinary}"`, { timeout: 3_000 }, (err, stdout) => {
      resolve(!err && stdout.trim() === "1");
    });
  });
}

function startMicPolling(): void {
  if (micPollInterval || process.platform !== "darwin") return;
  if (!micDetectorBinary) {
    console.warn("[mic-detect] Binary not compiled — polling skipped.");
    return;
  }
  console.log("[mic-detect] Starting mic polling (1 s interval)...");
  micPollInterval = setInterval(async () => {
    const inUse = await checkMicInUse();
    if (inUse !== prevMicInUse) {
      console.log(`[mic-detect] State changed: ${prevMicInUse} → ${inUse}`);
    }
    if (inUse && !prevMicInUse) {
      console.log("[mic-detect] Call detected — notifying renderer.");
      mainWindow?.show();
      mainWindow?.webContents.send("mic:call-detected");
    }
    prevMicInUse = inUse;
  }, 1_000);
}

function stopMicPolling(): void {
  if (micPollInterval) {
    clearInterval(micPollInterval);
    micPollInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function createTray(): void {
  // Use an empty image + emoji title — works on macOS without needing an icon file.
  // On Windows/Linux a real icon would be needed; swap nativeImage.createEmpty()
  // for nativeImage.createFromPath(...) pointing to a .ico / .png asset.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle("🎙");
  tray.setToolTip("Meeting Bot");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Window",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Simulate Call Detected (Test)",
      click: () => {
        console.log("[mic-detect] Manual simulate triggered from tray.");
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send("mic:call-detected");
      },
    },
    { type: "separator" },
    {
      label: "Quit Meeting Bot",
      click: () => {
        isQuitting = true;
        stopBackend();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Left-click toggles the window
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Allow mic access from the renderer (getUserMedia)
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === "media") {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  mainWindow.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) => permission === "media"
  );

  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(
      path.join(process.resourcesPath, "frontend", "dist", "index.html")
    );
  }

  // Hide to tray instead of closing
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  const apiKey = loadApiKey();
  if (apiKey) {
    try {
      const port = await startBackend(apiKey);
      mainWindow?.webContents.send("backend:ready", { port });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      mainWindow?.webContents.send("backend:error", msg);
    }
  }
  // If no API key, renderer shows ApiKeySetup; backend:ready is never sent.
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle("api-key:has", () => loadApiKey() !== null);

ipcMain.handle("api-key:save", async (_event, key: string) => {
  saveApiKey(key);
  try {
    const port = await startBackend(key);
    mainWindow?.webContents.send("backend:ready", { port });
    return { port };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    mainWindow?.webContents.send("backend:error", msg);
    throw err;
  }
});

ipcMain.handle("backend:port", () => backendPort);

// ---------------------------------------------------------------------------
// Mic permission
// ---------------------------------------------------------------------------

ipcMain.handle("mic:status", () => {
  if (process.platform !== "darwin") return "granted";
  return systemPreferences.getMediaAccessStatus("microphone");
});

ipcMain.handle("mic:request", async () => {
  if (process.platform !== "darwin") return true;
  return systemPreferences.askForMediaAccess("microphone");
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  await createWindow();
  createTray();
  await compileMicDetector();
  startMicPolling();
});

app.on("window-all-closed", () => {
  // On macOS the app stays alive in the tray — only quit via tray menu
  if (process.platform !== "darwin") {
    stopBackend();
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopMicPolling();
  stopBackend();
});

app.on("activate", () => {
  // Clicking the Dock icon shows the window
  mainWindow?.show();
  mainWindow?.focus();
});
