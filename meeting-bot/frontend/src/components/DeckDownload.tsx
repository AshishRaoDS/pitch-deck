interface Props {
  downloadUrl: string;
  filename: string;
  /** Optional: called when user wants to open the file directly (Electron IPC) */
  onOpenFile?: (path: string) => void;
}

export default function DeckDownload({ downloadUrl, filename, onOpenFile }: Props) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)",
        border: "1px solid #4f8eff55",
        borderRadius: "var(--radius)",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>
        <p style={{ fontWeight: 700, fontSize: 17, color: "#fff", marginBottom: 4 }}>
          🎉 Pitch Deck Ready
        </p>
        <p style={{ fontSize: 13, color: "#94c6ff" }}>{filename}</p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* Open in PowerPoint / Keynote (Electron only, falls back to new tab) */}
        {onOpenFile && (
          <button
            onClick={() => onOpenFile(downloadUrl)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#4FE3C0",
              color: "#0f172a",
              padding: "10px 20px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px #4fe3c044",
            }}
          >
            <OpenIcon />
            Open in PowerPoint
          </button>
        )}

        {/* Download .pptx */}
        <a
          href={downloadUrl}
          download={filename}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--accent)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px #4f8eff44",
          }}
        >
          <DownloadIcon />
          Download .pptx
        </a>
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
