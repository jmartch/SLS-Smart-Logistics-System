import { Check, MapPin, Truck, XCircle } from "lucide-react"
import { Link } from "react-router"
import { useAuth } from "../../auth"
import { ROUTES } from "../../mockData"
import { EmptyState } from "../../shared/ui/EmptyState"
import { STOP_COLOR, STOP_LABEL } from "../rutas/constants"

export function MyRoutePage() {
  const { user } = useAuth()
  const myRoute = ROUTES.find((r) => r.courierId === user?.id && r.status === "in_progress")

  if (!myRoute) {
    return (
      <>
        <div className="company-page-heading">
          <div><h1>Mi ruta</h1><p>Tu ruta activa de hoy.</p></div>
        </div>
        <EmptyState icon={<Truck size={36} />} title="Sin ruta activa" body="No tienes ninguna ruta en ejecución por el momento. El coordinador te asignará una cuando esté lista." />
      </>
    )
  }

  const nextStop = myRoute.stops.find((s) => s.status === "pending")
  const progress = Math.round((myRoute.delivered / myRoute.packageCount) * 100)

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Mi ruta</h1>
          <p>{myRoute.id.toUpperCase()} · {myRoute.zone} · {myRoute.shift === "morning" ? "Turno mañana" : "Turno tarde"}</p>
        </div>
        <span className="status status--active" style={{ fontSize: "0.78rem", padding: "0.5rem 1rem" }}>En ejecución</span>
      </div>

      <div style={{ display: "grid", gap: "1rem" }}>
        <div className="dashboard-panel">
          <div className="panel-heading">
            <div><span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Progreso general</span><h2>{myRoute.delivered} de {myRoute.packageCount} entregas</h2></div>
            <span style={{ color: "var(--navy)", fontFamily: "Space Grotesk, sans-serif", fontSize: "1.5rem", fontWeight: 700 }}>{progress}%</span>
          </div>
          <div style={{ height: 12, background: "var(--surface-muted)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--blue), var(--success))", borderRadius: 999 }} />
          </div>
        </div>

        {nextStop && (
          <div className="dashboard-panel" style={{ background: "linear-gradient(135deg, var(--navy-dark) 0%, #0b608b 100%)", border: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.8rem" }}>
              <MapPin size={18} color="var(--blue-light)" />
              <span style={{ color: "var(--blue-light)", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Siguiente parada</span>
            </div>
            <h2 style={{ margin: "0 0 0.3rem", color: "white", fontFamily: "Space Grotesk, sans-serif", fontSize: "1.2rem" }}>{nextStop.recipient}</h2>
            <p style={{ margin: "0 0 1.2rem", color: "rgba(255,255,255,0.7)", fontSize: "0.82rem" }}>{nextStop.address}</p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Link
                to={`/app/mi-ruta/paradas/${nextStop.id}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.8rem 1.4rem", background: "var(--blue)", color: "white", borderRadius: "999px", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none" }}
              >
                <Check size={16} /> Registrar entrega
              </Link>
              <button style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.8rem 1.2rem", background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "999px", fontSize: "0.82rem", fontWeight: 700 }}>
                <XCircle size={16} /> Marcar fallo
              </button>
            </div>
          </div>
        )}

        <div className="dashboard-panel">
          <div className="panel-heading">
            <div><span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Paradas</span><h2>Orden del día</h2></div>
          </div>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {myRoute.stops.map((stop) => (
              <div key={stop.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "0.9rem", padding: "0.85rem 1rem", background: stop.status === "delivered" ? "#f0faf5" : "var(--blue-pale)", borderRadius: "var(--radius-sm)", border: `1px solid ${stop.status === "delivered" ? "#b8e8d4" : "var(--border)"}` }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: stop.status === "delivered" ? "var(--success)" : "var(--navy)", color: "white", display: "grid", placeItems: "center", fontSize: "0.7rem", fontWeight: 800 }}>
                  {stop.status === "delivered" ? <Check size={14} /> : stop.order}
                </span>
                <div>
                  <strong style={{ display: "block", color: "var(--navy)", fontSize: "0.82rem" }}>{stop.recipient}</strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{stop.address}</span>
                </div>
                <span className={`status ${STOP_COLOR[stop.status]}`}>{STOP_LABEL[stop.status]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
