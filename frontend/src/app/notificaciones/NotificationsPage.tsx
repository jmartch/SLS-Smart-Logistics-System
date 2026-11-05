import { Bell, Check, ChevronRight } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { NOTIFICATIONS } from "../../mockData"
import { EmptyState } from "../../shared/ui/EmptyState"

export function NotificationsPage() {
  const [notifications, setNotifications] = useState(NOTIFICATIONS)

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  const unread = notifications.filter((n) => !n.read).length

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Notificaciones</h1>
          <p>{unread > 0 ? `${unread} notificaciones sin leer` : "Todo al día"}</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.7rem 1.2rem", background: "var(--blue-pale)", border: "1px solid var(--border)", borderRadius: "999px", color: "var(--navy)", fontWeight: 700, fontSize: "0.78rem" }}>
            <Check size={15} /> Marcar todas como leídas
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={<Bell size={32} />} title="Sin notificaciones" body="No tienes notificaciones en este momento." />
      ) : (
        <div style={{ display: "grid", gap: "0.6rem" }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              className="dashboard-panel"
              style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "1rem", background: n.read ? "white" : "var(--blue-pale)", border: `1px solid ${n.read ? "var(--border)" : "rgba(21,151,212,0.3)"}` }}
            >
              <span style={{ width: 40, height: 40, borderRadius: "50%", background: n.read ? "var(--surface-muted)" : "var(--blue)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Bell size={18} color={n.read ? "var(--text-muted)" : "white"} />
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <strong style={{ color: "var(--navy)", fontSize: "0.85rem" }}>{n.title}</strong>
                  {!n.read && <span style={{ width: 7, height: 7, background: "var(--blue)", borderRadius: "50%" }} aria-label="No leída" />}
                </div>
                <p style={{ margin: "0.15rem 0 0", color: "var(--text-muted)", fontSize: "0.78rem" }}>{n.body}</p>
                <span style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>
                  {new Date(n.at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {n.entityId && (
                <Link
                  to={`/app/paquetes/${n.entityId}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0.9rem", color: "var(--blue-dark)", background: "white", border: "1px solid var(--border)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 700, textDecoration: "none", flexShrink: 0 }}
                >
                  Ver <ChevronRight size={13} />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
