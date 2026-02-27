import type { Topic } from "../hooks/useMeetingSession";

interface Props {
  topics: Topic[];
}

export default function TopicsPanel({ topics }: Props) {
  if (!topics.length) return null;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 14, color: "var(--text)" }}>
        Detected Topics & Research
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {topics.map((topic) => (
          <TopicCard key={topic.name} topic={topic} />
        ))}
      </div>
    </div>
  );
}

function TopicCard({ topic }: { topic: Topic }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <span
          style={{
            display: "inline-block",
            background: "#4f8eff22",
            color: "var(--accent)",
            borderRadius: 6,
            padding: "2px 10px",
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {topic.name}
        </span>
        <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {topic.description}
        </p>
      </div>

      {topic.search_results?.length > 0 && (
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            Web Research
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topic.search_results.slice(0, 3).map((r) => (
              <a
                key={r.link}
                href={r.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "block",
                  background: "var(--surface2)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  textDecoration: "none",
                  border: "1px solid var(--border)",
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 3 }}>
                  {r.title}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {r.snippet}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
