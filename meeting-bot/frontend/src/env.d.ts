/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    hasApiKey: () => Promise<boolean>;
    saveApiKey: (key: string) => Promise<{ port: number }>;
    getBackendPort: () => Promise<number | null>;
    onBackendReady: (cb: (port: number) => void) => void;
    onBackendError: (cb: (message: string) => void) => void;
    getMicStatus: () => Promise<"granted" | "denied" | "not-determined" | "restricted">;
    requestMicAccess: () => Promise<boolean>;
  };
}
