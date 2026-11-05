import { AlertCircle, Check, Package, Route, Search, Truck } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Link, useSearchParams } from "react-router"
import {
  PACKAGES,
  STATUS_COLOR,
  STATUS_LABELS,
  type Package as Pkg,
  type PkgStatus,
} from "../mockData"

export function PublicTrackingPage() {
  const [searchParams] = useSearchParams()
  const initialCode = searchParams.get("code") ?? ""
  const [query, setQuery] = useState(initialCode)
  const [result, setResult] = useState<Pkg | null | "not_found">(() => {
    if (!initialCode) return null
    return PACKAGES.find((p) => p.trackingCode.toLowerCase() === initialCode.toLowerCase().trim()) ?? "not_found"
  })

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    const found = PACKAGES.find((p) => p.trackingCode.toLowerCase() === query.toLowerCase().trim())
    setResult(found ?? "not_found")
  }

  const steps: { status: PkgStatus; label: string }[] = [
    { status: "REGISTERED", label: "Registrado" },
    { status: "CLASSIFIED", label: "Clasificado" },
    { status: "IN_TRANSIT", label: "En tránsito" },
    { status: "DELIVERED", label: "Entregado" },
  ]

  const statusOrder: PkgStatus[] = ["REGISTERED", "CLASSIFIED", "PENDING_ASSIGNMENT", "ASSIGNED", "IN_TRANSIT", "DELIVERED"]

  const getStepState = (pkg: Pkg, step: PkgStatus) => {
    const pkgIdx = statusOrder.indexOf(pkg.status)
    const stepIdx = statusOrder.indexOf(step)
    if (pkgIdx > stepIdx) return "done"
    if (pkgIdx === stepIdx) return "current"
    return "pending"
  }

  return (
    <main className="tracking-page">
      <header className="portal-topbar">
        <Link className="brand" to="/" aria-label="SLS inicio">
          <span className="brand-mark" aria-hidden="true">
            <Route size={22} strokeWidth={2.4} />
          </span>
          <span className="brand-name">SLS</span>
        </Link>
        <nav>
          <Link to="/login" className="portal-login" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.7rem 1rem", color: "white", background: "var(--navy)", borderRadius: "999px", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none" }}>
            Acceso interno
          </Link>
        </nav>
      </header>

      <div className="tracking-hero">
        <div className="tracking-heading">
          <div className="tracking-icon" aria-hidden="true">
            <Package size={28} />
          </div>
          <h1>Rastrear envío</h1>
          <p>Ingresa el número de guía para consultar el estado de tu paquete en tiempo real.</p>
        </div>

        <form className="tracking-search" onSubmit={handleSearch}>
          <Search size={20} />
          <input
            type="text" placeholder="Ej: SLS-2026-00141"
            value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ minHeight: 46, paddingInline: "0.5rem", background: "transparent", border: 0, outline: "none", width: "100%", fontWeight: 600 }}
          />
          <button type="submit" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", minHeight: 48, padding: "0.75rem 1.3rem", color: "white", background: "linear-gradient(135deg, var(--blue), var(--blue-dark))", border: 0, borderRadius: "999px", fontWeight: 700 }}>
            <Search size={17} /> Buscar
          </button>
        </form>

        <p className="tracking-hint">
          <Check size={14} />
          Prueba con <strong>SLS-2026-00141</strong> o <strong>SLS-2026-00145</strong>
        </p>

        {result === "not_found" && (
          <div style={{ marginTop: "1.5rem", padding: "1rem 1.4rem", background: "#fff3f3", border: "1px solid #fcc", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", gap: "0.7rem", color: "#c0392b", fontWeight: 600, fontSize: "0.82rem" }}>
            <AlertCircle size={18} /> No encontramos ningún envío con ese número. Verifica que sea correcto.
          </div>
        )}

        {result && result !== "not_found" && (
          <div className="tracking-result">
            <div className="tracking-result__header">
              <div>
                <span>Número de guía</span>
                <h2>{result.trackingCode}</h2>
              </div>
              <span className={`status ${STATUS_COLOR[result.status]}`} style={{ fontSize: "0.82rem", padding: "0.55rem 1.1rem" }}>
                {STATUS_LABELS[result.status]}
              </span>
            </div>

            <div className="tracking-route">
              {steps.map((step) => {
                const state = getStepState(result, step.status)
                return (
                  <div key={step.status} className={`tracking-step tracking-step--${state}`}>
                    <span>{state === "done" ? <Check size={16} /> : state === "current" ? <Package size={16} /> : null}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>
                        {state !== "pending"
                          ? new Date(result.history.find((h) => h.status === step.status)?.at ?? result.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
                          : "—"}
                      </small>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="delivery-note">
              <Truck size={20} />
              <div>
                <strong>Entrega estimada</strong>
                <span>{new Date(result.estimatedDelivery).toLocaleDateString("es-CL", { weekday: "long", day: "2-digit", month: "long" })}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
