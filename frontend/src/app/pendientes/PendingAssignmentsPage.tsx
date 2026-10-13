import { AlertCircle, Clock, Eye, Truck } from "lucide-react"
import { Link } from "react-router"
import { PACKAGES, STATUS_LABELS } from "../../mockData"
import { EmptyState } from "../../shared/ui/EmptyState"

export function PendingAssignmentsPage() {
  const pending = PACKAGES.filter((p) => p.status === "PENDING_ASSIGNMENT")

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Pendientes de asignación</h1>
          <p>Paquetes clasificados que no pudieron asignarse automáticamente.</p>
        </div>
        <span className="counter" style={{ fontSize: "0.82rem", padding: "0.5rem 1rem" }}>{pending.length} sin asignar</span>
      </div>

      {pending.length === 0 ? (
        <EmptyState icon={<Clock size={32} />} title="Sin pendientes" body="Todos los paquetes clasificados tienen mensajero asignado." />
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {pending.map((pkg) => {
            const lastHistory = pkg.history[pkg.history.length - 1]
            const reason = lastHistory?.note ?? "Capacidad insuficiente en la zona"
            const waitMins = Math.floor((Date.now() - new Date(lastHistory?.at ?? "").getTime()) / 60000)
            return (
              <div key={pkg.id} className="dashboard-panel" style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--navy)", fontFamily: "Space Grotesk, sans-serif" }}>{pkg.trackingCode}</strong>
                    <span className="status status--pending">{STATUS_LABELS[pkg.status]}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>
                      <Clock size={12} style={{ verticalAlign: "middle" }} /> {waitMins < 60 ? `${waitMins} min esperando` : `${Math.floor(waitMins / 60)}h ${waitMins % 60}min esperando`}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 0.5rem", color: "var(--text-muted)", fontSize: "0.78rem" }}>
                    <AlertCircle size={14} style={{ verticalAlign: "middle", color: "#c0392b" }} /> Razón: {reason}
                  </p>
                  <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                    {[["Destinatario", pkg.recipient], ["Zona", `${pkg.zone} · ${pkg.sector}`], ["Peso", `${pkg.weight} kg`]].map(([k, v]) => (
                      <div key={k}>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase" }}>{k}</span>
                        <span style={{ display: "block", color: "var(--navy)", fontSize: "0.78rem", fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flexShrink: 0 }}>
                  <button className="form-submit" style={{ padding: "0.65rem 1.1rem", fontSize: "0.78rem", minHeight: "auto" }}>
                    <Truck size={15} /> Asignar
                  </button>
                  <Link to={`/app/paquetes/${pkg.id}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", justifyContent: "center", padding: "0.6rem 1rem", color: "var(--navy)", background: "var(--blue-pale)", border: "1px solid var(--border)", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, textDecoration: "none" }}>
                    <Eye size={15} /> Detalle
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
