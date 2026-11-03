import type { ReactNode } from "react"

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: ReactNode
  title: string
  body: string
}) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: "3rem 1rem",
        color: "var(--text-muted)",
      }}
    >
      <span style={{ marginBottom: "1rem", opacity: 0.5 }}>{icon}</span>
      <strong
        style={{
          display: "block",
          color: "var(--navy)",
          marginBottom: "0.4rem",
          fontFamily: "Space Grotesk, sans-serif",
        }}
      >
        {title}
      </strong>
      <p style={{ margin: 0, fontSize: "0.82rem", maxWidth: 320 }}>{body}</p>
    </div>
  )
}
