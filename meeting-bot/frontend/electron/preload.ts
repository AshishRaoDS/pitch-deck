import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose a safe, limited API to the renderer process via contextBridge.
 * This is the only way the renderer can communicate with the main process
 * when contextIsolation is enabled.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Open a file with the OS default application (PowerPoint, Keynote, etc.)
   */
  openFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("open-file", filePath),

  /**
   * Listen for meeting-detected events from the main process.
   * Fired when a meeting app or browser claims the microphone.
   *
   * @param callback - Called with { appName, isBrowser, source }
   * @returns Cleanup function to remove the listener
   */
  onMeetingDetected: (
    callback: (event: { appName: string; isBrowser: boolean; source: string }) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { appName: string; isBrowser: boolean; source: string }) => {
      callback(data);
    };
    ipcRenderer.on("meeting-detected", handler);
    return () => ipcRenderer.removeListener("meeting-detected", handler);
  },

  /**
   * Listen for meeting-ended events from the main process.
   * Fired when the meeting app exits or releases the microphone.
   *
   * @param callback - Called with { appName }
   * @returns Cleanup function to remove the listener
   */
  onMeetingEnded: (
    callback: (event: { appName: string }) => void
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { appName: string }) => {
      callback(data);
    };
    ipcRenderer.on("meeting-ended", handler);
    return () => ipcRenderer.removeListener("meeting-ended", handler);
  },

  /**
   * Notify main process that the user dismissed the auto-detect notification.
   */
  dismissMeetingDetect: (): void => {
    ipcRenderer.send("meeting-detect-dismissed");
  },

  /**
   * Notify main process that the user confirmed auto-start recording.
   */
  confirmMeetingDetect: (): void => {
    ipcRenderer.send("meeting-detect-confirmed");
  },
});
