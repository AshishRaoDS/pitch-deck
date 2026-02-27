import { useEffect, useRef } from "react";

interface Props {
  text: string;
}

export default function TranscriptPanel({ text }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [text]);

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
