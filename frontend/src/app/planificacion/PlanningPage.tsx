import { AlertCircle, CheckCircle2, Loader2, Package, Route } from "lucide-react"
import { useState } from "react"
import { PACKAGES, STATUS_COLOR, STATUS_LABELS } from "../../mockData"
import { EmptyState } from "../../shared/ui/EmptyState"

export function PlanningPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [shift, setShift] = useState("morning")
  const [planning, setPlanning] = useState(false)
  const [planned, setPlanned] = useState(false)

  const classified = PACKAGES.filter((p) => p.status === "CLASSIFIED" || p.status === "PENDING_ASSIGNMENT")

  const handlePlan = async () => {
    setPlanning(true)
    await new Promise((r) => setTimeout(r, 1800))
    setPlanning(false)
    setPlanned(true)
  }

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Planificar rutas</h1>
          <p>Genera asignaciones automáticas de paquetes a mensajeros y vehículos.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1rem", alignItems: "start" }}>
        <div className="dashboard-panel">
          <div className="panel-heading">
            <div><span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Configuración</span><h2>Parámetros</h2></div>
          </div>
          <div className="portal-form">
            <div className="field">
              <label>Fecha de entrega</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Turno</label>
              <select value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="morning">Mañana (08:00 – 13:00)</option>
                <option value="afternoon">Tarde (13:00 – 19:00)</option>
              </select>
            </div>
            <div className="permission-box">
              <AlertCircle size={18} />
              <div>
                <strong>Paquetes disponibles</strong>
                <p>{classified.length} paquetes listos para asignar en esta ventana.</p>
              </div>
            </div>
            <button className="form-submit" type="button" onClick={handlePlan} disabled={planning || planned} style={{ width: "100%" }}>
              {planning ? <Loader2 size={17} className="spin" /> : <Route size={17} />}
              {planning ? "Planificando…" : planned ? "Planificación enviada" : "Planificar rutas"}
            </button>
            {planned && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--success)", fontSize: "0.78rem", fontWeight: 700 }}>
                <CheckCircle2 size={16} /> Rutas generadas. Revísalas en la sección Rutas.
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-heading">
            <div><span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Paquetes</span><h2>Listos para asignar</h2></div>
            <span className="counter">{classified.length}</span>
          </div>
          {classified.length === 0 ? (
            <EmptyState icon={<Package size={28} />} title="Sin paquetes" body="No hay paquetes en estado Clasificado o Pendiente de asignación." />
          ) : (
            <div className="company-table">
              <div className="company-table__head" style={{ gridTemplateColumns: "1.2fr 1fr 0.8fr 0.6fr" }}>
                <span>Guía</span><span>Destinatario</span><span>Zona</span><span>Estado</span>
              </div>
              {classified.map((p) => (
                <div key={p.id} className="company-table__row" style={{ gridTemplateColumns: "1.2fr 1fr 0.8fr 0.6fr" }}>
                  <strong>{p.trackingCode}</strong>
                  <span>{p.recipient}</span>
                  <span>{p.zone}</span>
                  <span><span className={`status ${STATUS_COLOR[p.status]}`}>{STATUS_LABELS[p.status]}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
