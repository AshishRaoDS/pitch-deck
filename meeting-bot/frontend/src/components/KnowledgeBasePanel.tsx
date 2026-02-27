/**
 * KnowledgeBasePanel
 *
 * Allows users to upload org documents (PDF, DOCX, TXT, MD) to the
 * knowledge base so the pitch deck can reference internal knowledge
 * alongside web search results.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface KbDocument {
  doc_id: string;
  filename: string;
  chunk_count: number;
}

interface KbStatus {
  document_count: number;
  chunk_count: number;
}

export default function KnowledgeBasePanel() {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [status, setStatus] = useState<KbStatus>({ document_count: 0, chunk_count: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const [docsRes, statusRes] = await Promise.all([
        fetch("/api/kb/documents"),
        fetch("/api/kb/status"),
      ]);
      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents ?? []);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
      }
    } catch {
      // Silently ignore — KB may not be available yet
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setUploadError(null);

      const formData = new FormData();
      for (const file of Array.from(files)) {
        formData.append("files", file);
      }

      try {
        const res = await fetch("/api/kb/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.errors && data.errors.length > 0) {
          const msgs = data.errors.map((e: { filename: string; error: string }) => `${e.filename}: ${e.error}`);
          setUploadError(msgs.join("\n"));
        }

        await fetchDocuments();
      } catch (err) {
        setUploadError("Upload failed. Is the backend running?");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [fetchDocuments]
  );

  const handleDelete = useCallback(
    async (docId: string) => {
      setDeletingId(docId);
      try {
        await fetch(`/api/kb/documents/${encodeURIComponent(docId)}`, {
          method: "DELETE",
        });
        await fetchDocuments();
      } catch {
        // ignore
      } finally {
        setDeletingId(null);
      }
    },
    [fetchDocuments]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "20px 24px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: 2,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>📁</span>
            Org Knowledge Base
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Upload internal docs so the pitch deck can cite your own data alongside web research
          </p>
        </div>
        {status.document_count > 0 && (
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "3px 10px",
              whiteSpace: "nowrap",
            }}
          >
            {status.document_count} doc{status.document_count !== 1 ? "s" : ""} · {status.chunk_count} chunks
          </span>
        )}
      </div>

      {/* Drop zone / upload button */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        style={{
          border: "2px dashed var(--border)",
          borderRadius: 8,
          padding: "16px 20px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 16,
          transition: "border-color 0.15s",
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown"
          style={{ display: "none" }}
          onChange={(e) => handleUpload(e.target.files)}
        />
        {uploading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-muted)", fontSize: 13 }}>
            <Spinner />
            Uploading and indexing…
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
            <span style={{ fontSize: 20, display: "block", marginBottom: 4 }}>⬆️</span>
            <strong style={{ color: "var(--text)" }}>Click to upload</strong> or drag &amp; drop
            <br />
            <span style={{ fontSize: 11 }}>.pdf · .docx · .txt · .md (max 20 MB each)</span>
          </div>
        )}
      </div>

      {/* Upload error */}
      {uploadError && (
        <div
          style={{
            background: "#f8717122",
            border: "1px solid #f87171",
            borderRadius: 6,
            padding: "10px 14px",
            color: "#f87171",
            fontSize: 12,
            marginBottom: 12,
            whiteSpace: "pre-line",
          }}
        >
          {uploadError}
        </div>
      )}

      {/* Document list */}
      {documents.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {documents.map((doc) => (
            <li
              key={doc.doc_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ color: "#4FE3C0", flexShrink: 0 }}>✓</span>
                <span
                  style={{
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.filename}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {doc.chunk_count} chunk{doc.chunk_count !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(doc.doc_id);
                  }}
                  disabled={deletingId === doc.doc_id}
                  style={{
                    background: "none",
                    border: "none",
                    color: deletingId === doc.doc_id ? "var(--text-muted)" : "#f87171",
                    cursor: deletingId === doc.doc_id ? "default" : "pointer",
                    fontSize: 14,
                    padding: "2px 4px",
                    lineHeight: 1,
                  }}
                  title="Remove document"
                >
                  {deletingId === doc.doc_id ? "…" : "✕"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {documents.length === 0 && !uploading && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
          No documents indexed yet. Upload your org's docs to enrich the pitch deck.
        </p>
      )}
    </section>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        border: "2px solid var(--border)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}
