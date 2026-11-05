import { type FormEvent, useEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { useAuth } from "../../../auth"
import {
  ACCOUNT_STATUS_LABELS,
  COURIER_STATUS_LABELS,
  changeCourierStatus,
  courierError,
  createCourier,
  eligibleUsers,
  getCourier,
  listCouriers,
  type Courier,
  type CourierQuery,
  type CourierStatus,
  type EligibleUser,
  type Page,
} from "./couriersApi"

function Pagination({
  query,
  total,
  onChange,
  label,
}: {
  query: CourierQuery
  total: number
  onChange: (query: CourierQuery) => void
  label: string
}) {
  const last = Math.max(1, Math.ceil(total / query.pageSize))
  return (
    <nav
      aria-label={label}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        alignItems: "center",
        marginTop: "1rem",
      }}
    >
      <button
        type="button"
        disabled={query.page <= 1}
        onClick={() => onChange({ ...query, page: query.page - 1 })}
      >
        Anterior
      </button>
      <span>
        Página {query.page} de {last}
      </span>
      <button
        type="button"
        disabled={query.page >= last}
        onClick={() => onChange({ ...query, page: query.page + 1 })}
      >
        Siguiente
      </button>
    </nav>
  )
}

function CourierEditor({
  id,
  onChanged,
  onClose,
}: {
  id: string
  onChanged: () => void
  onClose: () => void
}) {
  const { hasPermission } = useAuth()
  const canViewRoutes =
    hasPermission("COORDINATE_ROUTES") || hasPermission("OPERATE_DELIVERIES")
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const [revision, setRevision] = useState(0)
  const key = `${id}:${revision}`
  const [loaded, setLoaded] = useState<{
    key: string
    data?: Courier
    error?: string
  } | null>(null)
  const [target, setTarget] = useState<CourierStatus | "">("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void getCourier(id)
      .then((data) => {
        if (active) setLoaded({ key, data })
      })
      .catch((failure: unknown) => {
        if (active) setLoaded({ key, error: courierError(failure) })
      })
    return () => {
      active = false
    }
  }, [id, key])
  const current = loaded?.key === key ? loaded : null
  const data = current?.data
  const value = target || data?.status || "ACTIVE"
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!data || saving || value === data.status) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await changeCourierStatus(id, value)
      setLoaded({ key, data: updated })
      setTarget("")
      setMessage("Estado del mensajero actualizado.")
      onChanged()
    } catch (failure: unknown) {
      setError(courierError(failure))
    } finally {
      setSaving(false)
    }
  }
  return (
    <section
      className="dashboard-panel"
      aria-labelledby="courier-detail-title"
      style={{ marginBottom: "1rem" }}
    >
      <h2 id="courier-detail-title" ref={headingRef} tabIndex={-1}>
        Detalle del mensajero
      </h2>
      <button type="button" disabled={saving} onClick={onClose}>
        Cerrar detalle
      </button>
      {!current && <p role="status">Cargando detalle…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setTarget("")
          setRevision((previous) => previous + 1)
        }}
      >
        Actualizar detalle
      </button>
      {data && (
        <>
          <p>{data.email}</p>
          <p>
            Cuenta de usuario: {ACCOUNT_STATUS_LABELS[data.userStatus]}. Estado
            operativo: {COURIER_STATUS_LABELS[data.status]}.
          </p>
          <p>
            Asignaciones activas: {data.activeAssignmentCount}. Rutas sin
            cerrar: {data.activeRouteIds.length}.
          </p>
          {canViewRoutes && data.activeRouteIds.length > 0 && (
            <ul>
              {data.activeRouteIds.map((routeId) => (
                <li key={routeId}>
                  <Link to={`/app/rutas/${encodeURIComponent(routeId)}`}>
                    Consultar ruta {routeId.slice(0, 8)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.isCommitted && (
            <p>
              Debe liberar sus asignaciones y cerrar o reasignar sus rutas antes
              de inactivarlo.
            </p>
          )}
          <form className="portal-form" onSubmit={save}>
            <div className="field">
              <label htmlFor="courier-edit-status">Estado operativo</label>
              <select
                id="courier-edit-status"
                value={value}
                disabled={saving}
                onChange={(event) =>
                  setTarget(event.target.value as CourierStatus)
                }
              >
                <option
                  value="ACTIVE"
                  disabled={
                    data.status !== "ACTIVE" && data.userStatus !== "ACTIVE"
                  }
                >
                  Activo
                </option>
                <option
                  value="INACTIVE"
                  disabled={data.status !== "INACTIVE" && data.isCommitted}
                >
                  Inactivo
                </option>
              </select>
            </div>
            <p>
              Este cambio no modifica la cuenta, los roles ni los permisos del
              usuario.
            </p>
            <button
              type="submit"
              className="form-submit"
              disabled={saving || value === data.status}
            >
              {saving ? "Guardando…" : "Guardar estado"}
            </button>
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
          </form>
        </>
      )}
    </section>
  )
}

export function AdminCouriersPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission("MANAGE_TENANT")
  const [query, setQuery] = useState<CourierQuery>({ page: 1, pageSize: 20 })
  const [candidateQuery, setCandidateQuery] = useState<CourierQuery>({
    page: 1,
    pageSize: 20,
  })
  const [search, setSearch] = useState("")
  const [candidateSearch, setCandidateSearch] = useState("")
  const [revision, setRevision] = useState(0)
  const listKey = JSON.stringify({ query, revision })
  const candidateKey = JSON.stringify({ candidateQuery, revision })
  const [loaded, setLoaded] = useState<{
    key: string
    data?: Page<Courier>
    error?: string
  } | null>(null)
  const [candidates, setCandidates] = useState<{
    key: string
    data?: Page<EligibleUser>
    error?: string
  } | null>(null)
  const [selectedUser, setSelectedUser] = useState("")
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  useEffect(() => {
    if (!canManage) return
    let active = true
    void listCouriers(query)
      .then((data) => {
        if (active) setLoaded({ key: listKey, data })
      })
      .catch((failure: unknown) => {
        if (active) setLoaded({ key: listKey, error: courierError(failure) })
      })
    return () => {
      active = false
    }
  }, [canManage, query, listKey])
  useEffect(() => {
    if (!canManage) return
    let active = true
    void eligibleUsers(candidateQuery)
      .then((data) => {
        if (active) setCandidates({ key: candidateKey, data })
      })
      .catch((failure: unknown) => {
        if (active)
          setCandidates({ key: candidateKey, error: courierError(failure) })
      })
    return () => {
      active = false
    }
  }, [canManage, candidateQuery, candidateKey])
  const current = loaded?.key === listKey ? loaded : null
  const available = candidates?.key === candidateKey ? candidates : null
  const validUser = available?.data?.items.some(
    (user) => user.id === selectedUser,
  )
    ? selectedUser
    : ""
  const refresh = () => setRevision((previous) => previous + 1)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validUser || submitting) return
    setSubmitting(true)
    setFormError(null)
    setSuccess(null)
    try {
      const courier = await createCourier(validUser)
      setSelectedUser("")
      setSelectedCourier(courier.id)
      setQuery({ page: 1, pageSize: 20 })
      setSearch("")
      setSuccess("Mensajero vinculado correctamente.")
      refresh()
    } catch (failure: unknown) {
      setFormError(courierError(failure))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Mensajeros</h1>
          <p>Vincula usuarios existentes y administra su estado operativo.</p>
        </div>
      </div>
      {!canManage ? (
        <div className="dashboard-panel" role="alert">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para administrar mensajeros de esta empresa.</p>
        </div>
      ) : (
        <>
          {selectedCourier && (
            <CourierEditor
              key={selectedCourier}
              id={selectedCourier}
              onChanged={refresh}
              onClose={() => setSelectedCourier(null)}
            />
          )}
          <section
            className="dashboard-panel"
            aria-labelledby="courier-create-title"
          >
            <h2 id="courier-create-title">Vincular mensajero</h2>
            <p>
              Selecciona una cuenta activa que todavía no esté vinculada. Los
              permisos de entrega se administran en Usuarios.
            </p>
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault()
                setSelectedUser("")
                setCandidateQuery({
                  ...candidateQuery,
                  page: 1,
                  search: candidateSearch.trim() || undefined,
                })
              }}
            >
              <div className="field">
                <label htmlFor="candidate-search">
                  Buscar usuario por correo
                </label>
                <input
                  id="candidate-search"
                  value={candidateSearch}
                  maxLength={100}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                />
              </div>
              <button type="submit" className="form-submit">
                Buscar usuarios
              </button>
              <button type="button" onClick={refresh}>
                Actualizar candidatos
              </button>
            </form>
            {!available && <p role="status">Cargando usuarios elegibles…</p>}
            {available?.error && <p role="alert">{available.error}</p>}
            {available?.data && (
              <>
                {available.data.items.length === 0 ? (
                  <p>
                    No hay usuarios elegibles con estos filtros. Crea o activa
                    una cuenta en Usuarios si tienes permiso.
                  </p>
                ) : (
                  <form className="portal-form" onSubmit={submit}>
                    <div className="field">
                      <label htmlFor="courier-user">Usuario existente</label>
                      <select
                        id="courier-user"
                        required
                        value={validUser}
                        disabled={submitting}
                        onChange={(event) =>
                          setSelectedUser(event.target.value)
                        }
                      >
                        <option value="">Seleccionar usuario</option>
                        {available.data.items.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="form-submit"
                      disabled={!validUser || submitting}
                    >
                      {submitting ? "Vinculando…" : "Vincular mensajero"}
                    </button>
                  </form>
                )}
                <Pagination
                  query={candidateQuery}
                  total={available.data.total}
                  onChange={(next) => {
                    setSelectedUser("")
                    setCandidateQuery(next)
                  }}
                  label="Paginación de usuarios elegibles"
                />
              </>
            )}
            {formError && <p role="alert">{formError}</p>}
            {success && <p role="status">{success}</p>}
          </section>
          <section
            className="dashboard-panel"
            aria-labelledby="courier-list-title"
            style={{ marginTop: "1rem" }}
          >
            <h2 id="courier-list-title">Mensajeros de la empresa</h2>
            <form
              className="portal-form"
              onSubmit={(event) => {
                event.preventDefault()
                setQuery({
                  ...query,
                  page: 1,
                  search: search.trim() || undefined,
                })
              }}
            >
              <div className="field">
                <label htmlFor="courier-search">
                  Buscar mensajero por correo
                </label>
                <input
                  id="courier-search"
                  value={search}
                  maxLength={100}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="courier-filter-status">Estado</label>
                <select
                  id="courier-filter-status"
                  value={query.status || ""}
                  onChange={(event) =>
                    setQuery({
                      ...query,
                      page: 1,
                      status: (event.target.value ||
                        undefined) as CourierStatus | undefined,
                    })
                  }
                >
                  <option value="">Todos los estados</option>
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                </select>
              </div>
              <button type="submit" className="form-submit">
                Buscar mensajeros
              </button>
              <button type="button" onClick={refresh}>
                Actualizar listado
              </button>
            </form>
            {!current && <p role="status">Cargando mensajeros…</p>}
            {current?.error && <p role="alert">{current.error}</p>}
            {current?.data && (
              <>
                <p role="status">
                  {current.data.total} mensajero(s) encontrados.
                </p>
                {current.data.items.length === 0 ? (
                  <p>
                    Sin mensajeros en esta página con los filtros seleccionados.
                  </p>
                ) : (
                  <div
                    role="region"
                    aria-label="Listado de mensajeros"
                    tabIndex={0}
                    style={{ overflowX: "auto" }}
                  >
                    <table
                      style={{
                        width: "100%",
                        minWidth: 650,
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            "Usuario",
                            "Estado operativo",
                            "Cuenta",
                            "Asignaciones activas",
                            "Rutas sin cerrar",
                            "Acciones",
                          ].map((title) => (
                            <th
                              key={title}
                              scope="col"
                              style={{ textAlign: "left", padding: ".75rem" }}
                            >
                              {title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {current.data.items.map((courier) => (
                          <tr key={courier.id}>
                            <th
                              scope="row"
                              style={{ textAlign: "left", padding: ".75rem" }}
                            >
                              {courier.email}
                            </th>
                            {[
                              COURIER_STATUS_LABELS[courier.status],
                              ACCOUNT_STATUS_LABELS[courier.userStatus],
                              courier.activeAssignmentCount,
                              courier.activeRouteIds.length,
                            ].map((value, index) => (
                              <td
                                key={index}
                                style={{
                                  padding: ".75rem",
                                  borderTop: "1px solid var(--border)",
                                }}
                              >
                                {value}
                              </td>
                            ))}
                            <td>
                              <button
                                type="button"
                                aria-label={`Ver o editar ${courier.email}`}
                                onClick={() => setSelectedCourier(courier.id)}
                              >
                                Ver / editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Pagination
                  query={query}
                  total={current.data.total}
                  onChange={setQuery}
                  label="Paginación de mensajeros"
                />
              </>
            )}
          </section>
        </>
      )}
    </>
  )
}
