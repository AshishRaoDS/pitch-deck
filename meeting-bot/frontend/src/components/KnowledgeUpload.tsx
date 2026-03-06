import { useRef, useState } from "react";

interface KnowledgeUploadProps {
  uploadedFiles: string[];
  onUpload: (file: File) => Promise<void>;
}

export default function KnowledgeUpload({ uploadedFiles, onUpload }: KnowledgeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await onUpload(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset so the same file can be re-uploaded if needed
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
          Knowledge Files
        </span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            cursor: uploading ? "not-allowed" : "pointer",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? "Uploading…" : "+ Add File"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.pdf"
          style={{ display: "none" }}
          onChange={handleChange}
        />
      </div>

      {uploadError && (
        <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{uploadError}</p>
      )}

      {uploadedFiles.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          No files added. Upload .txt, .md, or .pdf files to inject context into the pitch deck.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {uploadedFiles.map((name, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
              <span style={{ color: "#4fe3c0" }}>✓</span>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
