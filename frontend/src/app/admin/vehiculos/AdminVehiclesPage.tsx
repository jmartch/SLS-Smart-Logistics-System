import { ShieldAlert, Truck } from "lucide-react"
import { type FormEvent, useEffect, useState } from "react"
import { useAuth } from "../../../auth"
import { ApiError } from "../../../shared/api/httpClient"
import { EmptyState } from "../../../shared/ui/EmptyState"
import { VehicleEditor } from "./VehicleEditor"
import {
  createVehicle,
  listVehicles,
  VEHICLE_STATUS_LABELS,
  type VehicleStatus,
  type VehiclesPage,
  type VehicleListQuery,
} from "./vehiclesApi"

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403)
    return "No tienes permiso para administrar vehículos."
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación."
}

const emptyForm = { plate: "", maxWeightKg: "", maxVolumeM3: "" }

export function AdminVehiclesPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission("MANAGE_TENANT")
  const [query, setQuery] = useState<VehicleListQuery>({
    page: 1,
    pageSize: 20,
  })
  const [search, setSearch] = useState("")
  const [revision, setRevision] = useState(0)
  const key = JSON.stringify({ ...query, revision })
  const [loaded, setLoaded] = useState<{
    key: string
    data?: VehiclesPage
    error?: string
    forbidden?: boolean
  } | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (!canManage) return
    let active = true
    void listVehicles(query)
      .then((data) => {
        if (active) setLoaded({ key, data })
      })
      .catch((error: unknown) => {
        if (active)
          setLoaded({
            key,
            error: errorMessage(error),
            forbidden: error instanceof ApiError && error.status === 403,
          })
      })
    return () => {
      active = false
    }
  }, [canManage, key, query])

  const current = loaded?.key === key ? loaded : null
  const data = current?.data
  const loading = canManage && current === null
  const forbidden = !canManage || current?.forbidden
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setQuery((prev) => ({
      ...prev,
      page: 1,
      search: search.trim() || undefined,
    }))
  }

  const submitVehicle = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting || !canManage) return
    setSubmitting(true)
    setFormError(null)
    setFields({})
    setSuccess(null)
    try {
      const created = await createVehicle({
        plate: form.plate.trim(),
        maxWeightKg: form.maxWeightKg.trim(),
        maxVolumeM3: form.maxVolumeM3.trim(),
      })
      setForm(emptyForm)
      setSuccess(`Vehículo ${created.plate} registrado correctamente.`)
      setSearch("")
      setQuery({ page: 1, pageSize: query.pageSize })
      setRevision((prev) => prev + 1)
    } catch (error: unknown) {
      setFormError(errorMessage(error))
      if (error instanceof ApiError) setFields(error.fields)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Vehículos</h1>
          <p>Registra vehículos y consulta su estado y capacidad disponible.</p>
        </div>
      </div>
      {forbidden ? (
        <div className="dashboard-panel" role="alert">
          <ShieldAlert size={28} />
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para administrar vehículos de esta empresa.</p>
        </div>
      ) : (
        <>
          {selectedVehicleId && (
            <VehicleEditor
              key={selectedVehicleId}
              vehicleId={selectedVehicleId}
              onChanged={() => setRevision((prev) => prev + 1)}
              onClose={() => setSelectedVehicleId(null)}
            />
          )}
          <section
            className="dashboard-panel"
            aria-labelledby="vehicle-create-title"
          >
            <h2 id="vehicle-create-title">Registrar vehículo</h2>
            <form className="portal-form" onSubmit={submitVehicle}>
              <fieldset
                disabled={submitting}
                style={{ border: 0, padding: 0, margin: 0 }}
              >
                <div
                  className="form-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "1rem",
                  }}
                >
                  {([
                    ["plate", "Placa", "ABC123"],
                    ["maxWeightKg", "Capacidad máxima (kg)", "1200.500"],
                    ["maxVolumeM3", "Capacidad máxima (m³)", "8.250000"],
                  ] as const).map(([field, label, placeholder]) => (
                    <div className="field" key={field}>
                      <label htmlFor={`vehicle-${field}`}>{label}</label>
                      <input
                        id={`vehicle-${field}`}
                        required
                        value={form[field]}
                        placeholder={placeholder}
                        type={field === "plate" ? "text" : "number"}
                        min={
                          field === "plate"
                            ? undefined
                            : field === "maxWeightKg"
                              ? "0.001"
                              : "0.000001"
                        }
                        step={
                          field === "plate"
                            ? undefined
                            : field === "maxWeightKg"
                              ? "0.001"
                              : "0.000001"
                        }
                        aria-invalid={Boolean(fields[field])}
                        aria-describedby={
                          fields[field] ? `vehicle-${field}-error` : undefined
                        }
                        onChange={(event) => {
                          setForm((prev) => ({
                            ...prev,
                            [field]: event.target.value,
                          }))
                          setFields((prev) => ({ ...prev, [field]: "" }))
                        }}
                      />
                      {fields[field] && (
                        <span
                          id={`vehicle-${field}-error`}
                          className="field-error"
                        >
                          {fields[field]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <button type="submit" className="form-submit">
                  {submitting ? "Registrando…" : "Registrar vehículo"}
                </button>
              </fieldset>
              {formError && <p role="alert">{formError}</p>}
              {success && <p role="status">{success}</p>}
            </form>
          </section>

          <section
            className="dashboard-panel"
            aria-labelledby="vehicle-list-title"
            style={{ marginTop: "1rem" }}
          >
            <h2 id="vehicle-list-title">Flota de vehículos</h2>
            <form className="portal-form" onSubmit={submitSearch}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "end",
                  gap: "0.75rem",
                }}
              >
                <div className="field" style={{ flex: "1 1 180px" }}>
                  <label htmlFor="vehicle-search">Buscar placa</label>
                  <input
                    id="vehicle-search"
                    value={search}
                    maxLength={100}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Ej. ABC"
                  />
                </div>
                <div className="field">
                  <label htmlFor="vehicle-status">Estado</label>
                  <select
                    id="vehicle-status"
                    value={query.status ?? ""}
                    onChange={(event) =>
                      setQuery((prev) => ({
                        ...prev,
                        page: 1,
                        status: (event.target.value ||
                          undefined) as VehicleStatus | undefined,
                      }))
                    }
                  >
                    <option value="">Todos los estados</option>
                    {Object.entries(VEHICLE_STATUS_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <button type="submit" className="form-submit">
                  Buscar
                </button>
                <button
                  type="button"
                  className="form-submit"
                  disabled={loading}
                  onClick={() => setRevision((prev) => prev + 1)}
                >
                  Actualizar
                </button>
              </div>
            </form>
            {loading && <p role="status">Cargando vehículos…</p>}
            {current?.error && (
              <div role="alert">
                <p>{current.error}</p>
                <button
                  type="button"
                  className="form-submit"
                  onClick={() => setRevision((prev) => prev + 1)}
                >
                  Reintentar
                </button>
              </div>
            )}
            {data && (
              <>
                <p role="status">{data.total} vehículo(s) encontrados.</p>
                {data.items.length === 0 ? (
                  <EmptyState
                    icon={<Truck size={32} />}
                    title="Sin vehículos"
                    body="No hay vehículos en esta página con los filtros seleccionados."
                  />
                ) : (
                  <div
                    role="region"
                    aria-label="Listado de vehículos"
                    tabIndex={0}
                    style={{ overflowX: "auto" }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 650,
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            "Placa",
                            "Estado",
                            "Peso máximo (kg)",
                            "Peso asignado (kg)",
                            "Peso disponible (kg)",
                            "Volumen máximo (m³)",
                            "Volumen asignado (m³)",
                            "Volumen disponible (m³)",
                            "Acciones",
                          ].map((label) => (
                            <th
                              scope="col"
                              key={label}
                              style={{ textAlign: "left", padding: "0.75rem" }}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((vehicle) => (
                          <tr key={vehicle.id}>
                            <th
                              scope="row"
                              style={{ textAlign: "left", padding: "0.75rem" }}
                            >
                              {vehicle.plate}
                            </th>
                            {[
                              VEHICLE_STATUS_LABELS[vehicle.status],
                              vehicle.maxWeightKg,
                              vehicle.assignedWeightKg,
                              vehicle.remainingWeightKg,
                              vehicle.maxVolumeM3,
                              vehicle.assignedVolumeM3,
                              vehicle.remainingVolumeM3,
                            ].map((value, index) => (
                              <td
                                key={index}
                                style={{
                                  padding: "0.75rem",
                                  borderTop: "1px solid var(--border)",
                                }}
                              >
                                {value}
                              </td>
                            ))}
                            <td style={{ padding: "0.75rem" }}>
                              <button
                                type="button"
                                onClick={() => setSelectedVehicleId(vehicle.id)}
                                aria-label={`Ver o editar ${vehicle.plate}`}
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
                <nav
                  aria-label="Paginación de vehículos"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "1rem",
                    marginTop: "1rem",
                  }}
                >
                  <button
                    type="button"
                    disabled={query.page <= 1}
                    onClick={() =>
                      setQuery((prev) => ({ ...prev, page: prev.page - 1 }))
                    }
                  >
                    Anterior
                  </button>
                  <span>
                    Página {query.page} de {lastPage}
                  </span>
                  <button
                    type="button"
                    disabled={query.page >= lastPage}
                    onClick={() =>
                      setQuery((prev) => ({ ...prev, page: prev.page + 1 }))
                    }
                  >
                    Siguiente
                  </button>
                  <label htmlFor="vehicle-page-size">Por página</label>
                  <select
                    id="vehicle-page-size"
                    value={query.pageSize}
                    onChange={(event) =>
                      setQuery((prev) => ({
                        ...prev,
                        page: 1,
                        pageSize: Number(event.target.value),
                      }))
                    }
                  >
                    {[10, 20, 50].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </nav>
              </>
            )}
          </section>
        </>
      )}
    </>
  )
}
