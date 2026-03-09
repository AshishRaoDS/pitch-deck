import { contextBridge, ipcRenderer } from "electron";

// Register the mic-call-detected IPC listener once here in the preload context.
// Dispatching a DOM CustomEvent is more reliable than proxying a callback
// through the contextBridge, which can lose the reference after a delay.
// window is available in the preload's browser-like context at runtime,
// but not in the Node tsconfig's lib. Cast via globalThis to satisfy TS.
ipcRenderer.on("mic:call-detected", () => {
  (globalThis as { dispatchEvent?: (e: Event) => void }).dispatchEvent?.(
    new CustomEvent("meetingbot:call-detected")
  );
});

contextBridge.exposeInMainWorld("electronAPI", {
  hasApiKey: () => ipcRenderer.invoke("api-key:has"),
  saveApiKey: (key: string) => ipcRenderer.invoke("api-key:save", key),
  getBackendPort: () => ipcRenderer.invoke("backend:port"),
  onBackendReady: (cb: (port: number) => void) =>
    ipcRenderer.on("backend:ready", (_event, data: { port: number }) => cb(data.port)),
  onBackendError: (cb: (message: string) => void) =>
    ipcRenderer.on("backend:error", (_event, message: string) => cb(message)),
  getMicStatus: () => ipcRenderer.invoke("mic:status"),
  requestMicAccess: () => ipcRenderer.invoke("mic:request"),
});
