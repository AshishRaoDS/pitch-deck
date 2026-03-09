import { useState } from "react";

interface ApiKeySetupProps {
  onKeySet: (port: number) => void;
}

export default function ApiKeySetup({ onKeySet }: ApiKeySetupProps) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.startsWith("sk-") || key.length < 20) {
      setError("Enter a valid OpenAI API key (starts with sk-).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await window.electronAPI!.saveApiKey(key);
      onKeySet(result.port);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start backend.");
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "80px auto",
        padding: "40px 32px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            background: "linear-gradient(90deg, #4f8eff, #4fe3c0)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: 6,
          }}
        >
          Meeting Bot
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          Enter your OpenAI API key to get started. It is stored encrypted on
          your device and never sent anywhere except OpenAI.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          type="password"
          placeholder="sk-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={saving}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 14,
            fontFamily: "monospace",
          }}
        />

        {error && (
          <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || !key}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: saving ? "var(--border)" : "var(--accent)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Starting backend…" : "Save & Launch"}
        </button>
      </form>
    </div>
  );
}
