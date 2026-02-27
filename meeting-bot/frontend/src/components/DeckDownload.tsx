interface Props {
  downloadUrl: string;
  filename: string;
}

export default function DeckDownload({ downloadUrl, filename }: Props) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)",
        border: "1px solid #4f8eff55",
        borderRadius: "var(--radius)",
        padding: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <p style={{ fontWeight: 700, fontSize: 17, color: "#fff", marginBottom: 4 }}>
          Pitch Deck Ready
        </p>
        <p style={{ fontSize: 13, color: "#94c6ff" }}>{filename}</p>
      </div>
      <a
        href={downloadUrl}
        download={filename}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "var(--accent)",
          color: "#fff",
          padding: "10px 22px",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 15,
          textDecoration: "none",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 12px #4f8eff44",
        }}
      >
        <DownloadIcon />
        Download .pptx
      </a>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
