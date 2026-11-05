import { AlertCircle, Check, Loader2, ShieldAlert, User } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { useAuth } from "../../../auth"
import { ApiError, apiFetch } from "../../../shared/api/httpClient"
import { EmptyState } from "../../../shared/ui/EmptyState"

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
