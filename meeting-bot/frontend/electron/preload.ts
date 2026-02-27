import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose a safe, limited API to the renderer process via contextBridge.
 * This is the only way the renderer can communicate with the main process
 * when contextIsolation is enabled.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Open a file with the OS default application (PowerPoint, Keynote, etc.)
   * @param filePath - Absolute path to the file, or a URL for the download endpoint
   */
  openFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("open-file", filePath),
});
