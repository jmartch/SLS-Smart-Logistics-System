import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ClipboardList,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Package,
  PackagePlus,
  Route,
  Search,
  ShieldAlert,
  Truck,
  User,
  XCircle,
} from "lucide-react"
import { FormEvent, useEffect, useState } from "react"
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router"
import { useAuth, defaultHomeForUser } from "./auth"
import { ApiError, apiFetch } from "./shared/api/httpClient"
import {
  NOTIFICATIONS,
  PACKAGES,
  ROUTES,
  STATUS_COLOR,
  STATUS_LABELS,
  Package as Pkg,
  PkgStatus,
  Stop,
} from "./mockData"
import { RouteMap, type RouteMapStop } from "./features/routes/RouteMap"
import {
  fetchRouteDetailFromBackend,
  isUuidRouteId,
  mapBackendStopsToRouteMapStops,
  mapFixtureStopsToRouteMapStops,
} from "./features/routes/routeDetailApi"

// ──────────────────────────────────────────────────────────
// Login Page
// ──────────────────────────────────────────────────────────

export function LoginPage() {
  const { login, user, initializing } = useAuth()
  const [mode, setMode] = useState<"tenant" | "platform">("tenant")
  const [slug, setSlug] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  if (!initializing && user) {
    return <Navigate to={defaultHomeForUser(user)} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setFieldErrors({})
    setLoading(true)
    const result = await login({
      mode,
      slug: mode === "tenant" ? slug : undefined,
      email,
      password,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? "Credenciales inválidas.")
      setFieldErrors(result.fields ?? {})
      return
    }
  }

  return (
    <main className="auth-page" style={{ minHeight: "100svh" }}>
      <header className="auth-header">
        <Link className="brand" to="/" aria-label="SLS inicio">
          <span className="brand-mark" aria-hidden="true">
            <Route size={22} strokeWidth={2.4} />
          </span>
          <span className="brand-name">SLS</span>
        </Link>
        <Link className="back-link" to="/">
          <ArrowLeft size={17} />
          Volver al inicio
        </Link>
      </header>

      <section className="auth-layout">
        <aside className="auth-aside">
          <div className="auth-aside__content">
            <span className="auth-aside__icon">
              <Route size={28} strokeWidth={2.2} />
            </span>
            <p className="auth-aside__eyebrow">SLS Connect</p>
            <h2>Portal operativo</h2>
            <p>Accede a tu bandeja de trabajo según tu rol. Cada usuario ve solo lo que necesita para operar.</p>
            <div className="auth-benefits">
              <span><CheckCircle2 size={17} /> Navegación por permisos</span>
              <span><CheckCircle2 size={17} /> Datos aislados por empresa</span>
              <span><CheckCircle2 size={17} /> Sesión segura HttpOnly</span>
            </div>
          </div>
          <div className="auth-route" aria-hidden="true">
            <span />
            <Truck size={24} />
            <span />
            <MapPin size={24} />
          </div>
        </aside>

        <div className="auth-form-panel">
          <div className="auth-form-heading">
            <p className="eyebrow">Acceso al sistema</p>
            <h1>Iniciar sesión</h1>
            <p>Ingresa el identificador de tu empresa y tus credenciales para acceder al portal.</p>
          </div>

          <div
            role="tablist"
            aria-label="Tipo de acceso"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.4rem",
              padding: "0.3rem",
              background: "var(--blue-pale)",
              borderRadius: "var(--radius-sm)",
              marginBottom: "1.2rem",
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "tenant"}
              onClick={() => {
                setMode("tenant")
                setError("")
                setFieldErrors({})
              }}
              style={{
                padding: "0.55rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: mode === "tenant" ? "white" : "transparent",
                color: mode === "tenant" ? "var(--navy)" : "var(--text-muted)",
                fontWeight: 700,
                fontSize: "0.78rem",
              }}
            >
              Acceso de empresa
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "platform"}
              onClick={() => {
                setMode("platform")
                setError("")
                setFieldErrors({})
              }}
              style={{
                padding: "0.55rem 0.8rem",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: mode === "platform" ? "white" : "transparent",
                color: mode === "platform" ? "var(--navy)" : "var(--text-muted)",
                fontWeight: 700,
                fontSize: "0.78rem",
              }}
            >
              Plataforma SaaS
            </button>
          </div>

          <form className="portal-form" onSubmit={(e) => void handleSubmit(e)}>
            {mode === "tenant" && (
              <div className="field">
                <label htmlFor="slug">Identificador de empresa (slug)</label>
                <input
                  id="slug"
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="ej. logistica-del-norte"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
                {fieldErrors.slug && (
                  <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                    {fieldErrors.slug}
                  </small>
                )}
              </div>
            )}

            <div className="field">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder={
                  mode === "platform"
                    ? "superadmin@sls.local"
                    : "usuario@empresa.com"
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {fieldErrors.email && (
                <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                  {fieldErrors.email}
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <div className="input-with-action">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="field-action"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {fieldErrors.password && (
                <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                  {fieldErrors.password}
                </small>
              )}
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  padding: "0.8rem 1rem",
                  background: "#fff3f3",
                  border: "1px solid #fcc",
                  borderRadius: "var(--radius-sm)",
                  color: "#c0392b",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              className="form-submit"
              type="submit"
              disabled={loading}
              style={{ width: "100%" }}
            >
              {loading ? <Loader2 size={17} className="spin" /> : <ArrowRight size={17} />}
              {loading ? "Verificando..." : "Entrar"}
            </button>
          </form>
        </div>
      </section>

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  )
}

// ──────────────────────────────────────────────────────────
// Packages List
// ──────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: { value: PkgStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "REGISTERED", label: "Registrado" },
  { value: "CLASSIFIED", label: "Clasificado" },
  { value: "PENDING_ASSIGNMENT", label: "Pendiente asignación" },
  { value: "ASSIGNED", label: "Asignado" },
  { value: "IN_TRANSIT", label: "En tránsito" },
  { value: "DELIVERED", label: "Entregado" },
  { value: "FAILED", label: "Fallido" },
]

export function PackagesListPage() {
  const { user } = useAuth()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<PkgStatus | "">("")

  const filtered = PACKAGES.filter((p) => {
    const matchQuery =
      !query ||
      p.trackingCode.toLowerCase().includes(query.toLowerCase()) ||
      p.recipient.toLowerCase().includes(query.toLowerCase()) ||
      p.sender.toLowerCase().includes(query.toLowerCase())
    const matchStatus = !statusFilter || p.status === statusFilter
    return matchQuery && matchStatus
  })

  const canCreate = user?.role === "reception" || user?.role === "admin"

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Paquetes</h1>
          <p>Busca y gestiona todos los paquetes del sistema.</p>
        </div>
        {canCreate && (
          <Link to="/app/paquetes/nuevo" className="form-submit company-primary-action" style={{ textDecoration: "none" }}>
            <PackagePlus size={17} /> Nuevo paquete
          </Link>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.2rem", flexWrap: "wrap" }}>
        <div className="tracking-search" style={{ flex: 1, minWidth: 220, borderRadius: "var(--radius-sm)" }}>
          <Search size={17} style={{ marginLeft: "0.7rem", color: "var(--blue-dark)" }} />
          <input
            type="search" placeholder="Guía, destinatario o remitente…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            style={{ minHeight: 42, paddingInline: "0.5rem", background: "transparent", border: 0, outline: "none", width: "100%", fontWeight: 600 }}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PkgStatus | "")}
            style={{ minHeight: 44, paddingInline: "0.9rem", background: "white", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)" }}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="dashboard-panel recent-panel">
        <div className="company-table">
          <div className="company-table__head" style={{ gridTemplateColumns: "1.4fr 1.2fr 1fr 0.8fr 0.4fr" }}>
            <span>Guía / Remitente</span>
            <span>Destinatario</span>
            <span>Zona</span>
            <span>Estado</span>
            <span></span>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={<Package size={32} />} title="Sin resultados" body="Ajusta los filtros o registra un nuevo paquete." />
          ) : (
            filtered.map((pkg) => (
              <div key={pkg.id} className="company-table__row" style={{ gridTemplateColumns: "1.4fr 1.2fr 1fr 0.8fr 0.4fr" }}>
                <strong style={{ display: "grid", gap: "0.15rem" }}>
                  <span style={{ fontSize: "0.82rem" }}>{pkg.trackingCode}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 400 }}>{pkg.sender}</span>
                </strong>
                <span>{pkg.recipient}</span>
                <span>{pkg.zone} · {pkg.sector}</span>
                <span>
                  <span className={`status ${STATUS_COLOR[pkg.status]}`}>{STATUS_LABELS[pkg.status]}</span>
                </span>
                <span>
                  <Link to={`/app/paquetes/${pkg.id}`} style={{ display: "grid", width: 32, height: 32, placeItems: "center", color: "var(--blue-dark)", borderRadius: 8 }} aria-label={`Ver detalle ${pkg.trackingCode}`}>
                    <ChevronRight size={17} />
                  </Link>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────
// Package Detail
// ──────────────────────────────────────────────────────────

export function PackageDetailPage() {
  const { packageId } = useParams()
  const pkg = PACKAGES.find((p) => p.id === packageId)

  if (!pkg) {
    return (
      <div className="not-found" style={{ minHeight: "60vh" }}>
        <span>404</span>
        <h1>Paquete no encontrado</h1>
        <p>El identificador no corresponde a ningún paquete registrado.</p>
        <Link to="/app/paquetes" className="form-submit" style={{ textDecoration: "none" }}>
          <ArrowLeft size={17} /> Volver a paquetes
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="company-page-heading" style={{ alignItems: "flex-start" }}>
        <div>
          <Link to="/app/paquetes" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none", marginBottom: "0.6rem" }}>
            <ArrowLeft size={15} /> Paquetes
          </Link>
          <h1 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}>{pkg.trackingCode}</h1>
          <p style={{ marginTop: "0.4rem" }}>{pkg.sender} → {pkg.recipient}</p>
        </div>
        <span className={`status ${STATUS_COLOR[pkg.status]}`} style={{ fontSize: "0.78rem", padding: "0.5rem 1rem", flexShrink: 0, marginTop: "0.5rem" }}>
          {STATUS_LABELS[pkg.status]}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "1rem", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Resumen</span>
                <h2>Información del envío</h2>
              </div>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 2rem" }}>
              {[
                ["Remitente", pkg.sender],
                ["Destinatario", pkg.recipient],
                ["Dirección", pkg.recipientAddress],
                ["Teléfono", pkg.recipientPhone],
                ["Zona", `${pkg.zone} · ${pkg.sector}`],
                ["Tipo de envío", pkg.shipmentType],
                ["Peso", `${pkg.weight} kg`],
                ["Volumen", `${(pkg.volume * 1000).toFixed(0)} L`],
                ["Prioridad", pkg.priority === "urgent" ? "Urgente" : pkg.priority === "express" ? "Express" : "Normal"],
                ["Entrega estimada", new Date(pkg.estimatedDelivery).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>{k}</dt>
                  <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.82rem", fontWeight: 600 }}>{v}</dd>
                </div>
              ))}
            </dl>
            {pkg.notes && (
              <div className="delivery-note" style={{ marginTop: "1.2rem" }}>
                <AlertCircle size={18} />
                <div>
                  <strong>Observación</strong>
                  <span>{pkg.notes}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Historial</span>
              <h2>Línea de tiempo</h2>
            </div>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>
            {[...pkg.history].reverse().map((h, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 0.9rem", paddingBottom: i < pkg.history.length - 1 ? "1.2rem" : 0, position: "relative" }}>
                {i < pkg.history.length - 1 && (
                  <span style={{ position: "absolute", left: "10px", top: "24px", bottom: 0, width: "2px", background: "var(--border)" }} aria-hidden="true" />
                )}
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "var(--blue)" : "var(--border)", display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1 }}>
                  {i === 0 && <span style={{ width: 8, height: 8, background: "white", borderRadius: "50%" }} />}
                </span>
                <div>
                  <strong style={{ display: "block", color: "var(--navy)", fontSize: "0.78rem" }}>{STATUS_LABELS[h.status]}</strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.67rem" }}>
                    {new Date(h.at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.by}
                  </span>
                  {h.note && <p style={{ margin: "0.2rem 0 0", color: "var(--text-muted)", fontSize: "0.67rem" }}>{h.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────
// New Package (Recepción)
// ──────────────────────────────────────────────────────────

export function NewPackagePage() {
  const navigate = useNavigate()
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    sender: "", recipient: "", recipientAddress: "", recipientPhone: "",
    zone: "", sector: "", weight: "", volume: "", priority: "normal",
    shipmentType: "Estándar", notes: "",
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise((r) => setTimeout(r, 800))
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    const code = `SLS-2026-${String(Math.floor(Math.random() * 900) + 100).padStart(5, "0")}`
    return (
      <div className="success-state" style={{ paddingTop: "3rem" }}>
        <span><Check size={32} /></span>
        <h2>Paquete registrado</h2>
        <p>Se generó la guía <strong>{code}</strong> para <strong>{form.recipient}</strong>. El paquete quedó en estado Registrado y está listo para clasificación.</p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.5rem" }}>
          <button className="form-submit" onClick={() => setSubmitted(false)} style={{ minWidth: 180 }}>
            <PackagePlus size={17} /> Registrar otro
          </button>
          <Link to="/app/paquetes" className="form-submit" style={{ textDecoration: "none", background: "var(--navy)", minWidth: 180 }}>
            <ArrowRight size={17} /> Ver paquetes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="company-page-heading company-page-heading--form">
        <div>
          <h1>Registrar paquete</h1>
          <p>Completa los datos del envío. Los campos marcados son obligatorios.</p>
        </div>
      </div>

      <div className="company-content--form">
        <div className="company-form-card">
          <form className="portal-form" onSubmit={handleSubmit}>
            <div className="form-section-heading">
              <span><User size={20} /></span>
              <div>
                <h2>Remitente y destinatario</h2>
                <p>Datos de origen y entrega del paquete</p>
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label>Remitente *</label>
                <input type="text" required placeholder="Empresa o persona" value={form.sender} onChange={set("sender")} />
              </div>
              <div className="field">
                <label>Destinatario *</label>
                <input type="text" required placeholder="Nombre completo" value={form.recipient} onChange={set("recipient")} />
              </div>
            </div>
            <div className="field">
              <label>Dirección de entrega *</label>
              <input type="text" required placeholder="Calle, número, comuna" value={form.recipientAddress} onChange={set("recipientAddress")} />
            </div>
            <div className="field">
              <label>Teléfono del destinatario</label>
              <input type="tel" placeholder="+56 9 0000 0000" value={form.recipientPhone} onChange={set("recipientPhone")} />
            </div>

            <div className="form-section-heading form-section-heading--spaced">
              <span><Package size={20} /></span>
              <div>
                <h2>Características del envío</h2>
                <p>Dimensiones, tipo y prioridad</p>
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label>Tipo de envío *</label>
                <select value={form.shipmentType} onChange={set("shipmentType")}>
                  <option>Estándar</option>
                  <option>Express</option>
                  <option>Carga</option>
                  <option>Frágil</option>
                </select>
              </div>
              <div className="field">
                <label>Prioridad</label>
                <select value={form.priority} onChange={set("priority")}>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgente</option>
                  <option value="express">Express</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Peso (kg) *</label>
                <input type="number" required min="0.1" step="0.1" placeholder="0.0" value={form.weight} onChange={set("weight")} />
              </div>
              <div className="field">
                <label>Volumen estimado (L)</label>
                <input type="number" min="0" step="0.1" placeholder="0.0" value={form.volume} onChange={set("volume")} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Zona</label>
                <select value={form.zone} onChange={set("zone")}>
                  <option value="">Seleccionar (clasificación asignará)</option>
                  <option>Zona Norte</option>
                  <option>Zona Sur</option>
                  <option>Zona Centro</option>
                  <option>Zona Oriente</option>
                </select>
              </div>
              <div className="field">
                <label>Sector</label>
                <select value={form.sector} onChange={set("sector")}>
                  <option value="">Sector (clasificación asignará)</option>
                  <option>Sector A</option>
                  <option>Sector B</option>
                  <option>Sector C</option>
                  <option>Sector D</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Observaciones</label>
              <textarea
                placeholder="Instrucciones especiales, fragilidad, etc."
                rows={3}
                value={form.notes} onChange={set("notes")}
                style={{ padding: "0.75rem 0.9rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "rgba(255,255,255,0.9)", resize: "vertical", fontFamily: "inherit", fontSize: "inherit", color: "var(--text)", outline: "none" }}
              />
            </div>

            <div className="company-form-actions">
              <Link to="/app/paquetes" style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none" }}>Cancelar</Link>
              <button className="form-submit" type="submit" disabled={loading}>
                {loading ? <Loader2 size={17} className="spin" /> : <Check size={17} />}
                {loading ? "Registrando…" : "Registrar paquete"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}

// ──────────────────────────────────────────────────────────
// Classification Queue
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// Pending Assignments
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// Route Planning
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// Routes List
// ──────────────────────────────────────────────────────────

const ROUTE_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  prepared: "Preparada",
  in_progress: "En ejecución",
  closed: "Cerrada",
}

const ROUTE_STATUS_COLOR: Record<string, string> = {
  draft: "status--active",
  prepared: "status--pending",
  in_progress: "status--active",
  closed: "status--success",
}

export function RoutesListPage() {
  return (
    <>
      <div className="company-page-heading">
        <div><h1>Rutas</h1><p>Listado de rutas planificadas y activas.</p></div>
      </div>

      <div className="dashboard-panel recent-panel">
        <div className="company-table">
          <div className="company-table__head" style={{ gridTemplateColumns: "0.75fr 0.7fr 1fr 1fr 0.8fr 0.5fr 0.4fr" }}>
            <span>ID</span><span>Fecha</span><span>Mensajero</span><span>Vehículo</span><span>Zona</span><span>Estado</span><span></span>
          </div>
          {ROUTES.map((r) => (
            <div key={r.id} className="company-table__row" style={{ gridTemplateColumns: "0.75fr 0.7fr 1fr 1fr 0.8fr 0.5fr 0.4fr" }}>
              <strong>{isUuidRouteId(r.id) ? `RT-DEMO · ${r.id.slice(0, 8).toUpperCase()}` : r.id.toUpperCase()}</strong>
              <span>{new Date(r.date).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })} · {r.shift === "morning" ? "AM" : "PM"}</span>
              <span>{r.courier}</span>
              <span style={{ fontSize: "0.68rem" }}>{r.vehicle}</span>
              <span>{r.zone}</span>
              <span><span className={`status ${ROUTE_STATUS_COLOR[r.status]}`}>{ROUTE_STATUS_LABELS[r.status]}</span></span>
              <span>
                <Link to={`/app/rutas/${r.id}`} style={{ display: "grid", width: 32, height: 32, placeItems: "center", color: "var(--blue-dark)", borderRadius: 8 }}>
                  <ChevronRight size={17} />
                </Link>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────
// Route Detail
// ──────────────────────────────────────────────────────────

const STOP_LABEL: Record<Stop["status"], string> = { pending: "Pendiente", delivered: "Entregado", failed: "Fallido", skipped: "Omitido" }
const STOP_COLOR: Record<Stop["status"], string> = { pending: "status--active", delivered: "status--success", failed: "status--danger", skipped: "status--pending" }

export function RouteDetailPage() {
  const { routeId } = useParams()
  const { user } = useAuth()
  const route = ROUTES.find((r) => r.id === routeId)
  const [backendStops, setBackendStops] = useState<RouteMapStop[] | null>(null)
  const [backendState, setBackendState] = useState<string | null>(null)
  const [dataSourceLabel, setDataSourceLabel] = useState<string>(
    "Fixture determinista preparado para demo (sin seguimiento GPS)",
  )

  useEffect(() => {
    let active = true
    if (!routeId || !isUuidRouteId(routeId)) {
      setBackendStops(null)
      setBackendState(null)
      setDataSourceLabel(
        "Fixture determinista preparado para demo (sin seguimiento GPS)",
      )
      return () => {
        active = false
      }
    }

    void (async () => {
      try {
        const detail = await fetchRouteDetailFromBackend(routeId, {
          tenantId: user?.tenantId,
          userId: user?.id,
        })
        if (!active) return
        if (detail) {
          setBackendStops(
            mapBackendStopsToRouteMapStops(detail.stops, route?.stops ?? []),
          )
          setBackendState(detail.state)
          setDataSourceLabel("Datos reales GET /api/v1/routes/:id")
        }
      } catch {
        if (!active) return
        setBackendStops(null)
        setBackendState(null)
        setDataSourceLabel(
          "Fixture determinista preparado para demo (sin seguimiento GPS)",
        )
      }
    })()

    return () => {
      active = false
    }
  }, [routeId, user?.tenantId, user?.id, route])

  if (!route) {
    return (
      <div className="not-found" style={{ minHeight: "60vh" }}>
        <span>404</span>
        <h1>Ruta no encontrada</h1>
        <Link to="/app/rutas" className="form-submit" style={{ textDecoration: "none" }}><ArrowLeft size={17} /> Volver a rutas</Link>
      </div>
    )
  }

  const mapStops =
    backendStops ?? mapFixtureStopsToRouteMapStops(route.stops)
  const progress = route.packageCount > 0 ? Math.round((route.delivered / route.packageCount) * 100) : 0

  return (
    <>
      <div className="company-page-heading" style={{ alignItems: "flex-start" }}>
        <div>
          <Link to="/app/rutas" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none", marginBottom: "0.6rem" }}>
            <ArrowLeft size={15} /> Rutas
          </Link>
          <h1 style={{ fontSize: "clamp(1.4rem, 2.6vw, 2.1rem)" }}>{route.id.toUpperCase()}</h1>
          <p>{route.courier} · {route.vehicle}</p>
        </div>
        <span className={`status ${ROUTE_STATUS_COLOR[route.status]}`} style={{ fontSize: "0.78rem", padding: "0.5rem 1rem", flexShrink: 0, marginTop: "0.5rem" }}>
          {backendState ? `${ROUTE_STATUS_LABELS[route.status]} (${backendState})` : ROUTE_STATUS_LABELS[route.status]}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1rem", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="dashboard-panel">
            <div className="panel-heading">
              <div><span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Progreso</span><h2>Entregas</h2></div>
              <span style={{ color: "var(--navy)", fontFamily: "Space Grotesk, sans-serif", fontSize: "1.3rem", fontWeight: 700 }}>{route.delivered}/{route.packageCount}</span>
            </div>
            <div style={{ height: 10, background: "var(--surface-muted)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--blue), var(--success))", borderRadius: 999, transition: "width 0.5s ease" }} />
            </div>
            <p style={{ margin: "0.5rem 0 0", color: "var(--text-muted)", fontSize: "0.72rem" }}>{progress}% completado · {route.totalWeight} kg totales</p>
          </div>

          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Georreferenciación · OpenStreetMap</span>
                <h2>Secuencia geográfica de paradas</h2>
              </div>
              <span style={{ fontSize: "0.68rem", color: "var(--blue-dark)", fontWeight: 700 }}>
                {dataSourceLabel}
              </span>
            </div>
            <RouteMap stops={mapStops} dataSourceLabel={dataSourceLabel} />
          </div>

          <div className="dashboard-panel">
            <div className="panel-heading">
              <div><span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Paradas</span><h2>Orden de entrega</h2></div>
            </div>
            {route.stops.length === 0 ? (
              <EmptyState icon={<MapPin size={28} />} title="Sin paradas" body="Esta ruta no tiene paradas registradas." />
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {route.stops.map((stop) => (
                  <div key={stop.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "0.9rem", padding: "0.9rem 1rem", background: "var(--blue-pale)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                    <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--navy)", color: "white", display: "grid", placeItems: "center", fontSize: "0.7rem", fontWeight: 800, fontFamily: "Space Grotesk, sans-serif" }}>{stop.order}</span>
                    <div>
                      <strong style={{ color: "var(--navy)", fontSize: "0.82rem" }}>{stop.recipient}</strong>
                      <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.68rem" }}>{stop.address}</span>
                      <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.65rem" }}>
                        {stop.trackingCode}
                        {typeof stop.latitude === "number" && typeof stop.longitude === "number"
                          ? ` · (${stop.latitude.toFixed(4)}, ${stop.longitude.toFixed(4)})`
                          : ""}
                      </span>
                    </div>
                    <span className={`status ${STOP_COLOR[stop.status]}`}>{STOP_LABEL[stop.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-heading">
            <div><span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>Resumen</span><h2>Datos de ruta</h2></div>
          </div>
          <dl style={{ display: "grid", gap: "0.9rem" }}>
            {[
              ["Mensajero", route.courier],
              ["Vehículo", route.vehicle],
              ["Fecha", new Date(route.date).toLocaleDateString("es-CL", { weekday: "long", day: "2-digit", month: "long" })],
              ["Turno", route.shift === "morning" ? "Mañana" : "Tarde"],
              ["Zona", route.zone],
              ["Paquetes", String(route.packageCount)],
              ["Peso total", `${route.totalWeight} kg`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr" }}>
                <dt style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", alignSelf: "center" }}>{k}</dt>
                <dd style={{ margin: 0, color: "var(--navy)", fontSize: "0.78rem", fontWeight: 600 }}>{v}</dd>
              </div>
            ))}
          </dl>
          {route.status === "prepared" && (
            <button className="form-submit" style={{ width: "100%", marginTop: "1.5rem" }}>
              <Truck size={17} /> Iniciar ruta
            </button>
          )}
          {route.status === "in_progress" && (
            <button className="form-submit" style={{ width: "100%", marginTop: "1.5rem", background: "var(--navy)" }}>
              <Check size={17} /> Cerrar ruta
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────
// My Route (Courier)
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// Stop Execution
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// Public Tracking (/track)
// ──────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────
// Admin: Users & Tenants (Real Backend API)
// ──────────────────────────────────────────────────────────

interface EmployeeApiItem {
  readonly id: string
  readonly email: string
  readonly status: "ACTIVE" | "DISABLED"
  readonly roleIds: readonly string[]
}

interface RoleApiItem {
  readonly id: string
  readonly name: string
  readonly permissions: readonly string[]
}

export function AdminUsersPage() {
  const { hasPermission } = useAuth()
  const [employees, setEmployees] = useState<EmployeeApiItem[]>([])
  const [roles, setRoles] = useState<RoleApiItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  const canManage = hasPermission("MANAGE_EMPLOYEES")

  const loadData = async () => {
    setLoading(true)
    setLoadError(null)
    setForbidden(false)
    try {
      const [empList, roleList] = await Promise.all([
        apiFetch<EmployeeApiItem[]>("/users"),
        apiFetch<RoleApiItem[]>("/users/roles"),
      ])
      setEmployees(empList)
      setRoles(roleList)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true)
      } else if (err instanceof ApiError) {
        setLoadError(err.message)
      } else {
        setLoadError("No se pudo cargar la lista de usuarios.")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [empList, roleList] = await Promise.all([
          apiFetch<EmployeeApiItem[]>("/users"),
          apiFetch<RoleApiItem[]>("/users/roles"),
        ])
        if (active) {
          setEmployees(empList)
          setRoles(roleList)
        }
      } catch (err) {
        if (!active) return
        if (err instanceof ApiError && err.status === 403) {
          setForbidden(true)
        } else if (err instanceof ApiError) {
          setLoadError(err.message)
        } else {
          setLoadError("No se pudo cargar la lista de usuarios.")
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const toggleCreateRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    )
  }

  const handleCreateEmployee = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const created = await apiFetch<EmployeeApiItem>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          roleIds: selectedRoleIds,
        }),
      })
      setEmployees((prev) => [...prev, created])
      setEmail("")
      setPassword("")
      setSelectedRoleIds([])
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
        setFieldErrors(err.fields)
      } else {
        setFormError("Ocurrió un error al crear el empleado.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleStatus = async (emp: EmployeeApiItem) => {
    const nextStatus = emp.status === "ACTIVE" ? "DISABLED" : "ACTIVE"
    setActionBusyId(emp.id)
    setFormError(null)
    try {
      await apiFetch<{ ok: boolean }>(`/users/${emp.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      })
      setEmployees((prev) =>
        prev.map((item) =>
          item.id === emp.id ? { ...item, status: nextStatus } : item,
        ),
      )
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError("No se pudo actualizar el estado del empleado.")
      }
    } finally {
      setActionBusyId(null)
    }
  }

  const handleToggleEmployeeRole = async (
    emp: EmployeeApiItem,
    roleId: string,
  ) => {
    const hasRole = emp.roleIds.includes(roleId)
    const nextRoleIds = hasRole
      ? emp.roleIds.filter((id) => id !== roleId)
      : [...emp.roleIds, roleId]
    if (nextRoleIds.length === 0) {
      setFormError("El empleado debe conservar al menos un rol asignado.")
      return
    }
    setActionBusyId(emp.id)
    setFormError(null)
    try {
      await apiFetch<{ ok: boolean }>(`/users/${emp.id}/roles`, {
        method: "PATCH",
        body: JSON.stringify({ roleIds: nextRoleIds }),
      })
      setEmployees((prev) =>
        prev.map((item) =>
          item.id === emp.id ? { ...item, roleIds: nextRoleIds } : item,
        ),
      )
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError("No se pudieron actualizar los roles del empleado.")
      }
    } finally {
      setActionBusyId(null)
    }
  }

  if (forbidden || !canManage) {
    return (
      <>
        <div className="company-page-heading">
          <div>
            <h1>Usuarios y roles</h1>
            <p>Gestiona empleados, estados y roles de tu empresa.</p>
          </div>
        </div>
        <div
          className="dashboard-panel"
          style={{ display: "grid", placeItems: "center", minHeight: 260, textAlign: "center" }}
        >
          <div>
            <ShieldAlert size={36} color="#c0392b" style={{ marginBottom: "0.8rem" }} />
            <h2 style={{ margin: "0 0 0.4rem", color: "var(--navy)" }}>Acceso restringido (403)</h2>
            <p style={{ margin: 0, color: "var(--text-muted)", maxWidth: 380 }}>
              No cuentas con el permiso <code>MANAGE_EMPLOYEES</code> para administrar usuarios de la empresa.
            </p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Usuarios y roles</h1>
          <p>Registra empleados de tu empresa, asigna roles y controla su estado operativo.</p>
        </div>
      </div>

      {formError && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.85rem 1.1rem",
            marginBottom: "1rem",
            background: "#fff3f3",
            border: "1px solid #fcc",
            borderRadius: "var(--radius-sm)",
            color: "#c0392b",
            fontSize: "0.82rem",
            fontWeight: 600,
          }}
        >
          <AlertCircle size={17} />
          {formError}
        </div>
      )}

      <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        <div className="company-form-card">
          <form className="portal-form" onSubmit={(e) => void handleCreateEmployee(e)}>
            <div className="form-section-heading">
              <span><User size={20} /></span>
              <div>
                <h2>Nuevo empleado</h2>
                <p>Las credenciales quedan aisladas dentro de tu empresa actual.</p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="emp-email">Correo electrónico</label>
              <input
                id="emp-email"
                type="email"
                required
                placeholder="empleado@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {fieldErrors.email && (
                <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                  {fieldErrors.email}
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="emp-password">Contraseña inicial (mín. 8 caracteres)</label>
              <input
                id="emp-password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {fieldErrors.password && (
                <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                  {fieldErrors.password}
                </small>
              )}
            </div>

            <div className="field">
              <label>Roles asignados</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {roles.map((role) => {
                  const active = selectedRoleIds.includes(role.id)
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleCreateRole(role.id)}
                      style={{
                        padding: "0.45rem 0.85rem",
                        borderRadius: "999px",
                        border: `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
                        background: active ? "var(--blue)" : "var(--blue-pale)",
                        color: active ? "white" : "var(--navy)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {role.name}
                    </button>
                  )
                })}
              </div>
              {fieldErrors.roleIds && (
                <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                  {fieldErrors.roleIds}
                </small>
              )}
            </div>

            <button
              className="form-submit"
              type="submit"
              disabled={submitting || selectedRoleIds.length === 0}
              style={{ width: "100%" }}
            >
              {submitting ? <Loader2 size={17} className="spin" /> : <Check size={17} />}
              {submitting ? "Creando empleado..." : "Crear empleado"}
            </button>
          </form>
        </div>

        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>
                Directorio del tenant
              </span>
              <h2>Empleados ({employees.length})</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              style={{
                padding: "0.45rem 0.9rem",
                background: "var(--blue-pale)",
                border: "1px solid var(--border)",
                borderRadius: "999px",
                color: "var(--navy)",
                fontSize: "0.74rem",
                fontWeight: 700,
              }}
            >
              Actualizar
            </button>
          </div>

          {loading ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Cargando empleados...</p>
          ) : loadError ? (
            <div style={{ color: "#c0392b", fontSize: "0.82rem", fontWeight: 600 }}>
              {loadError}
            </div>
          ) : employees.length === 0 ? (
            <EmptyState
              icon={<User size={32} />}
              title="Sin empleados registrados"
              body="Crea el primer empleado usando el formulario."
            />
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  style={{
                    padding: "0.95rem 1rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: emp.status === "ACTIVE" ? "white" : "var(--surface-muted)",
                    display: "grid",
                    gap: "0.6rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ color: "var(--navy)", fontSize: "0.86rem", display: "block" }}>
                        {emp.email}
                      </strong>
                      <span
                        className={`status ${emp.status === "ACTIVE" ? "status--active" : "status--Alert"}`}
                        style={{ fontSize: "0.68rem", marginTop: "0.2rem", display: "inline-block" }}
                      >
                        {emp.status === "ACTIVE" ? "Activo" : "Deshabilitado"}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={actionBusyId === emp.id}
                      onClick={() => void handleToggleStatus(emp)}
                      style={{
                        padding: "0.4rem 0.85rem",
                        borderRadius: "999px",
                        border: "1px solid var(--border)",
                        background: emp.status === "ACTIVE" ? "#fff3f3" : "#f0faf5",
                        color: emp.status === "ACTIVE" ? "#c0392b" : "var(--success)",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                      }}
                    >
                      {emp.status === "ACTIVE" ? "Desactivar" : "Activar"}
                    </button>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {roles.map((role) => {
                      const assigned = emp.roleIds.includes(role.id)
                      return (
                        <button
                          key={role.id}
                          type="button"
                          disabled={actionBusyId === emp.id}
                          onClick={() => void handleToggleEmployeeRole(emp, role.id)}
                          style={{
                            padding: "0.3rem 0.7rem",
                            borderRadius: "999px",
                            border: `1px solid ${assigned ? "var(--navy)" : "var(--border)"}`,
                            background: assigned ? "var(--navy)" : "transparent",
                            color: assigned ? "white" : "var(--text-muted)",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                          }}
                        >
                          {role.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function AdminStub({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="company-page-heading">
        <div><h1>{title}</h1><p>{description}</p></div>
      </div>
      <div className="dashboard-panel" style={{ display: "grid", placeItems: "center", minHeight: 280, textAlign: "center" }}>
        <div>
          <ShieldAlert size={36} color="var(--text-muted)" style={{ marginBottom: "1rem" }} />
          <h2 style={{ margin: "0 0 0.5rem", color: "var(--navy)", fontFamily: "Space Grotesk, sans-serif", fontSize: "1.2rem" }}>Próximamente</h2>
          <p style={{ margin: 0, color: "var(--text-muted)", maxWidth: 360 }}>Esta sección está en desarrollo y estará disponible cuando el backend publique los controladores correspondientes.</p>
        </div>
      </div>
    </>
  )
}

export function AdminVehiclesPage() {
  return <AdminStub title="Vehículos" description="Capacidad, disponibilidad y estado de los vehículos." />
}

export function AdminTenantsPage() {
  const { user } = useAuth()
  const [name, setName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [createdTenants, setCreatedTenants] = useState<
    Array<{ tenantId: string; slug: string; name: string; adminEmail: string }>
  >([])

  if (user?.kind !== "PLATFORM_ADMIN") {
    return (
      <>
        <div className="company-page-heading">
          <div>
            <h1>Empresas</h1>
            <p>Aprovisionamiento de tenants del SaaS.</p>
          </div>
        </div>
        <div
          className="dashboard-panel"
          style={{ display: "grid", placeItems: "center", minHeight: 260, textAlign: "center" }}
        >
          <div>
            <ShieldAlert size={36} color="#c0392b" style={{ marginBottom: "0.8rem" }} />
            <h2 style={{ margin: "0 0 0.4rem", color: "var(--navy)" }}>Acceso restringido (403)</h2>
            <p style={{ margin: 0, color: "var(--text-muted)", maxWidth: 380 }}>
              Solo un superadministrador de plataforma puede aprovisionar empresas.
            </p>
          </div>
        </div>
      </>
    )
  }

  const handleProvision = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const created = await apiFetch<{ tenantId: string; slug: string }>(
        "/platform/tenants",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            adminEmail: adminEmail.trim(),
            adminPassword,
          }),
        },
      )
      setCreatedTenants((prev) => [
        {
          tenantId: created.tenantId,
          slug: created.slug,
          name: name.trim(),
          adminEmail: adminEmail.trim(),
        },
        ...prev,
      ])
      setName("")
      setAdminEmail("")
      setAdminPassword("")
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        setFieldErrors(err.fields)
      } else {
        setError("Ocurrió un error al aprovisionar la empresa.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Empresas (SaaS)</h1>
          <p>Aprovisiona nuevos tenants con su catálogo inicial de roles y primer administrador.</p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.85rem 1.1rem",
            marginBottom: "1rem",
            background: "#fff3f3",
            border: "1px solid #fcc",
            borderRadius: "var(--radius-sm)",
            color: "#c0392b",
            fontSize: "0.82rem",
            fontWeight: 600,
          }}
        >
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: "1.2rem", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        <div className="company-form-card">
          <form className="portal-form" onSubmit={(e) => void handleProvision(e)}>
            <div className="form-section-heading">
              <span><CheckCircle2 size={20} /></span>
              <div>
                <h2>Aprovisionar empresa</h2>
                <p>Crea el tenant, sus roles iniciales y el usuario administrador de forma atómica.</p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="tenant-name">Nombre de la empresa</label>
              <input
                id="tenant-name"
                type="text"
                required
                placeholder="Logística del Norte S.A."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {fieldErrors.name && (
                <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                  {fieldErrors.name}
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="tenant-admin-email">Correo del primer administrador</label>
              <input
                id="tenant-admin-email"
                type="email"
                required
                placeholder="admin@empresa.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
              {fieldErrors.adminEmail && (
                <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                  {fieldErrors.adminEmail}
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="tenant-admin-password">Contraseña inicial (mín. 8 caracteres)</label>
              <input
                id="tenant-admin-password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
              {fieldErrors.adminPassword && (
                <small style={{ color: "#c0392b", fontSize: "0.72rem", fontWeight: 600 }}>
                  {fieldErrors.adminPassword}
                </small>
              )}
            </div>

            <button
              className="form-submit"
              type="submit"
              disabled={submitting}
              style={{ width: "100%" }}
            >
              {submitting ? <Loader2 size={17} className="spin" /> : <Check size={17} />}
              {submitting ? "Aprovisionando..." : "Crear empresa"}
            </button>
          </form>
        </div>

        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontWeight: 600 }}>
                Sesión actual
              </span>
              <h2>Empresas creadas recientemente</h2>
            </div>
          </div>
          {createdTenants.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={32} />}
              title="Listo para aprovisionar"
              body="Las empresas aprovisionadas en esta sesión aparecerán aquí con su slug asignado."
            />
          ) : (
            <div style={{ display: "grid", gap: "0.7rem" }}>
              {createdTenants.map((t) => (
                <div
                  key={t.tenantId}
                  style={{
                    padding: "0.9rem 1rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--blue-pale)",
                  }}
                >
                  <strong style={{ color: "var(--navy)", display: "block" }}>{t.name}</strong>
                  <small style={{ color: "var(--text-muted)", display: "block" }}>
                    Slug: <code>{t.slug}</code> · Admin: {t.adminEmail}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ display: "grid", placeItems: "center", textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)" }}>
      <span style={{ marginBottom: "1rem", opacity: 0.5 }}>{icon}</span>
      <strong style={{ display: "block", color: "var(--navy)", marginBottom: "0.4rem", fontFamily: "Space Grotesk, sans-serif" }}>{title}</strong>
      <p style={{ margin: 0, fontSize: "0.82rem", maxWidth: 320 }}>{body}</p>
    </div>
  )
}
