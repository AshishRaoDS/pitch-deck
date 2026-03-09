import { useEffect, useRef } from "react";

interface Props {
  text: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

export default function TranscriptPanel({ text, editable = false, onChange, disabled = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editable) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [editable, text]);

  if (editable) {
    return (
      <textarea
        value={text}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder="Review and edit the transcript before generating the pitch deck…"
        style={{
          width: "100%",
          minHeight: 320,
          resize: "vertical",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 20,
          fontSize: 15,
          lineHeight: 1.7,
          color: "var(--text)",
          fontFamily: "inherit",
          outline: "none",
        }}
      />
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 20,
        minHeight: 160,
        maxHeight: 320,
        overflowY: "auto",
        fontSize: 15,
        lineHeight: 1.7,
        color: text ? "var(--text)" : "var(--text-muted)",
        whiteSpace: "pre-wrap",
      }}
    >
      {text || "Transcript will appear here as you speak…"}
      <div ref={bottomRef} />
    </div>
  );
}
