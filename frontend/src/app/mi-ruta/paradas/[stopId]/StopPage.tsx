import { ArrowLeft, Check, CheckCircle2, Loader2, MapPin, XCircle } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { useAuth } from "../../../../auth"
import { ROUTES } from "../../../../mockData"

export function StopPage() {
  const { stopId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const myRoute = ROUTES.find((r) => r.courierId === user?.id)
  const stop = myRoute?.stops.find((s) => s.id === stopId)
  const [outcome, setOutcome] = useState<"" | "delivered" | "failed">("")
  const [note, setNote] = useState("")
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!stop) {
    return (
      <div className="not-found" style={{ minHeight: "60vh" }}>
        <span>404</span>
        <h1>Parada no encontrada</h1>
        <Link to="/app/mi-ruta" className="form-submit" style={{ textDecoration: "none" }}><ArrowLeft size={17} /> Mi ruta</Link>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!outcome) return
    setLoading(true)
    await new Promise((r) => setTimeout(r, 700))
    setLoading(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="success-state" style={{ paddingTop: "3rem" }}>
        <span>{outcome === "delivered" ? <Check size={32} /> : <XCircle size={32} style={{ color: "white" }} />}</span>
        <h2>{outcome === "delivered" ? "Entrega registrada" : "Fallo registrado"}</h2>
        <p>{stop.recipient} · {stop.address}</p>
        <button className="form-submit" onClick={() => navigate("/app/mi-ruta")} style={{ minWidth: 200 }}>
          <ArrowLeft size={17} /> Volver a mi ruta
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="company-page-heading" style={{ alignItems: "flex-start" }}>
        <div>
          <Link to="/app/mi-ruta" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none", marginBottom: "0.6rem" }}>
            <ArrowLeft size={15} /> Mi ruta
          </Link>
          <h1 style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)" }}>Parada #{stop.order}</h1>
          <p>{stop.recipient}</p>
        </div>
      </div>

      <div style={{ maxWidth: 560 }}>
        <div className="dashboard-panel" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", gap: "0.7rem", alignItems: "flex-start" }}>
            <span style={{ width: 40, height: 40, background: "var(--blue-pale)", borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <MapPin size={20} color="var(--blue-dark)" />
            </span>
            <div>
              <strong style={{ display: "block", color: "var(--navy)", fontFamily: "Space Grotesk, sans-serif" }}>{stop.recipient}</strong>
              <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{stop.address}</span>
              <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.68rem", marginTop: "0.2rem" }}>{stop.trackingCode}</span>
            </div>
          </div>
        </div>

        <div className="company-form-card">
          <form className="portal-form" onSubmit={handleSubmit}>
            <div className="form-section-heading">
              <span><Check size={20} /></span>
              <div><h2>Resultado de la parada</h2><p>Registra el resultado y añade observaciones si es necesario.</p></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {(["delivered", "failed"] as const).map((o) => (
                <button
                  key={o} type="button"
                  onClick={() => setOutcome(o)}
                  style={{
                    padding: "1.1rem", borderRadius: "var(--radius-sm)", border: `2px solid ${outcome === o ? (o === "delivered" ? "var(--success)" : "#e74c3c") : "var(--border)"}`,
                    background: outcome === o ? (o === "delivered" ? "#f0faf5" : "#fff3f3") : "white",
                    color: outcome === o ? (o === "delivered" ? "var(--success)" : "#c0392b") : "var(--text-muted)",
                    fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  }}
                >
                  {o === "delivered" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  {o === "delivered" ? "Entregado" : "Fallido"}
                </button>
              ))}
            </div>
            <div className="field">
              <label>Observación {outcome === "failed" ? "(requerida)" : "(opcional)"}</label>
              <textarea
                placeholder={outcome === "failed" ? "Motivo del fallo…" : "Instrucciones dejadas, persona que recibió, etc."}
                rows={3} value={note}
                onChange={(e) => setNote(e.target.value)}
                required={outcome === "failed"}
                style={{ padding: "0.75rem 0.9rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "rgba(255,255,255,0.9)", resize: "vertical", fontFamily: "inherit", color: "var(--text)", outline: "none", width: "100%" }}
              />
            </div>
            <button className="form-submit" type="submit" disabled={!outcome || loading} style={{ width: "100%" }}>
              {loading ? <Loader2 size={17} className="spin" /> : <Check size={17} />}
              {loading ? "Guardando…" : "Confirmar resultado"}
            </button>
          </form>
        </div>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
