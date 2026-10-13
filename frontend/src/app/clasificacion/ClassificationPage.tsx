import { Check, ClipboardList, Eye, Loader2 } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import {
  PACKAGES,
  STATUS_COLOR,
  STATUS_LABELS,
  type Package as Pkg,
} from "../../mockData"
import { EmptyState } from "../../shared/ui/EmptyState"

export function ClassificationPage() {
  const queue = PACKAGES.filter((p) => p.status === "REGISTERED")
  const [classifying, setClassifying] = useState<string | null>(null)

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Clasificación</h1>
          <p>Paquetes registrados pendientes de validar coordenadas y asignar zona.</p>
        </div>
        <span className="counter" style={{ fontSize: "0.82rem", padding: "0.5rem 1rem" }}>{queue.length} pendientes</span>
      </div>

      {queue.length === 0 ? (
        <EmptyState icon={<ClipboardList size={32} />} title="Bandeja vacía" body="No hay paquetes pendientes de clasificación." />
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {queue.map((pkg) => (
            <div key={pkg.id} className="dashboard-panel" style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
                  <strong style={{ color: "var(--navy)", fontFamily: "Space Grotesk, sans-serif" }}>{pkg.trackingCode}</strong>
                  <span className={`status ${STATUS_COLOR[pkg.status]}`}>{STATUS_LABELS[pkg.status]}</span>
                  {pkg.priority !== "normal" && (
                    <span className="status status--pending">{pkg.priority === "urgent" ? "Urgente" : "Express"}</span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.4rem 1.5rem" }}>
                  {[
                    ["Remitente", pkg.sender],
                    ["Destinatario", pkg.recipient],
                    ["Dirección", pkg.recipientAddress],
                    ["Peso", `${pkg.weight} kg`],
                    ["Registrado", new Date(pkg.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</span>
                      <span style={{ display: "block", color: "var(--navy)", fontSize: "0.78rem", fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flexShrink: 0 }}>
                <button
                  className="form-submit"
                  style={{ padding: "0.65rem 1.1rem", fontSize: "0.78rem", minHeight: "auto" }}
                  onClick={() => setClassifying(pkg.id)}
                >
                  <Check size={15} /> Clasificar
                </button>
                <Link to={`/app/paquetes/${pkg.id}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", justifyContent: "center", padding: "0.6rem 1rem", color: "var(--navy)", background: "var(--blue-pale)", border: "1px solid var(--border)", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, textDecoration: "none" }}>
                  <Eye size={15} /> Detalle
                </Link>
              </div>

              {classifying === pkg.id && (
                <ClassifyModal pkg={pkg} onClose={() => setClassifying(null)} />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function ClassifyModal({ pkg, onClose }: { pkg: Pkg; onClose: () => void }) {
  const [zone, setZone] = useState(pkg.zone || "Zona Norte")
  const [sector, setSector] = useState(pkg.sector || "Sector A")
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 600))
    setLoading(false)
    setDone(true)
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", background: "rgba(7,59,92,0.3)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: "var(--radius-md)", padding: "2rem", width: "min(480px, calc(100vw - 2rem))", boxShadow: "var(--shadow-md)" }} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="success-state" style={{ padding: "1rem 0" }}>
            <span><Check size={24} /></span>
            <h2 style={{ fontSize: "1.4rem" }}>Clasificado</h2>
            <p>{pkg.trackingCode} fue asignado a {zone} · {sector} y avanzó a Clasificado.</p>
            <button className="form-submit" onClick={onClose}>Cerrar</button>
          </div>
        ) : (
          <>
            <h2 style={{ margin: "0 0 0.4rem", fontFamily: "Space Grotesk, sans-serif", color: "var(--navy-dark)" }}>Clasificar paquete</h2>
            <p style={{ margin: "0 0 1.5rem", color: "var(--text-muted)", fontSize: "0.82rem" }}>{pkg.trackingCode} · {pkg.recipient}</p>
            <div className="portal-form">
              <div className="field">
                <label>Zona</label>
                <select value={zone} onChange={(e) => setZone(e.target.value)}>
                  {["Zona Norte", "Zona Sur", "Zona Centro", "Zona Oriente"].map((z) => <option key={z}>{z}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Sector</label>
                <select value={sector} onChange={(e) => setSector(e.target.value)}>
                  {["Sector A", "Sector B", "Sector C", "Sector D"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <button type="button" onClick={onClose} style={{ padding: "0.7rem 1.2rem", background: "var(--blue-pale)", border: "1px solid var(--border)", borderRadius: "999px", fontWeight: 700, color: "var(--navy)", fontSize: "0.82rem" }}>Cancelar</button>
                <button className="form-submit" type="button" onClick={handleConfirm} disabled={loading}>
                  {loading ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
                  Confirmar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
