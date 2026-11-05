import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Route,
  Truck,
} from "lucide-react"
import { type FormEvent, useState } from "react"
import { Link, Navigate } from "react-router"
import { defaultHomeForUser, useAuth } from "../auth"

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
