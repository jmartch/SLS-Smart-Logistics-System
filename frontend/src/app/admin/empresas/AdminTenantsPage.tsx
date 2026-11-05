import { AlertCircle, Check, CheckCircle2, Loader2, ShieldAlert } from "lucide-react"
import { type FormEvent, useState } from "react"
import { useAuth } from "../../../auth"
import { ApiError, apiFetch } from "../../../shared/api/httpClient"
import { EmptyState } from "../../../shared/ui/EmptyState"

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
