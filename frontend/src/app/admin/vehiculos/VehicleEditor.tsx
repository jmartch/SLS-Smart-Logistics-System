import { type FormEvent, useEffect, useRef, useState } from "react"
import { ApiError } from "../../../shared/api/httpClient"
import {
  changeVehicleStatus,
  getVehicle,
  updateVehicle,
  VEHICLE_STATUS_LABELS,
  type VehicleDetail,
  type VehicleStatus,
} from "./vehiclesApi"

function message(error: unknown): string {
  if (error instanceof ApiError) {
    const labels: Record<string, string> = {
      VEHICLE_NOT_FOUND:
        "El vehículo no está disponible. Actualiza el listado.",
      VEHICLE_CAPACITY_BELOW_LOAD:
        "La capacidad no puede ser inferior a la carga asignada. Revisa el peso y volumen disponibles.",
      VEHICLE_COMMITTED:
        "El vehículo tiene una ruta comprometida o carga activa. Resuelve su asignación antes de inactivarlo o enviarlo a mantenimiento.",
      VEHICLE_PLATE_CONFLICT:
        "Ya existe un vehículo con esa placa en tu empresa.",
      VEHICLE_CONCURRENCY_CONFLICT:
        "Otro proceso modificó el vehículo. Actualiza el detalle y vuelve a intentarlo.",
      PERMISSION_DENIED: "No tienes permiso para modificar vehículos.",
    }
    return labels[error.code] ?? error.message
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación."
}

export function VehicleEditor({
  vehicleId,
  onChanged,
  onClose,
}: {
  vehicleId: string
  onChanged: () => void
  onClose: () => void
}) {
  const [reload, setReload] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [loaded, setLoaded] = useState<{
    revision: number
    vehicle?: VehicleDetail
    error?: string
  } | null>(null)
  const [form, setForm] = useState({
    plate: "",
    maxWeightKg: "",
    maxVolumeM3: "",
  })
  const [status, setStatus] = useState<VehicleStatus>("ACTIVE")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    headingRef.current?.focus()
    let active = true
    void getVehicle(vehicleId)
      .then((vehicle) => {
        if (!active) return
        setLoaded({ revision: reload, vehicle })
        setForm({
          plate: vehicle.plate,
          maxWeightKg: vehicle.maxWeightKg,
          maxVolumeM3: vehicle.maxVolumeM3,
        })
        setStatus(vehicle.status)
      })
      .catch((failure: unknown) => {
        if (active) setLoaded({ revision: reload, error: message(failure) })
      })
    return () => {
      active = false
    }
  }, [vehicleId, reload])

  const current = loaded?.revision === reload ? loaded : null
  const vehicle = current?.vehicle
  const save = async (operation: () => Promise<VehicleDetail>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    setFields({})
    try {
      const updated = await operation()
      setLoaded({ revision: reload, vehicle: updated })
      setForm({
        plate: updated.plate,
        maxWeightKg: updated.maxWeightKg,
        maxVolumeM3: updated.maxVolumeM3,
      })
      setStatus(updated.status)
      setSuccess("Cambios guardados correctamente.")
      onChanged()
    } catch (failure: unknown) {
      setError(message(failure))
      if (failure instanceof ApiError) {
        setFields(
          Object.fromEntries(
            Object.entries(failure.fields).map(([field, detail]) => [
              field,
              failure.code.startsWith("VEHICLE_") ? message(failure) : detail,
            ]),
          ),
        )
      }
    } finally {
      setBusy(false)
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    // Send only changed fields so an unrelated concurrent edit is preserved.
    const changes = Object.fromEntries(
      Object.entries(form).filter(
        ([field, value]) =>
          value.trim() !== vehicle?.[(field as keyof typeof form)],
      ),
    )
    if (!Object.keys(changes).length) {
      setSuccess("No hay cambios para guardar.")
      return
    }
    void save(() => updateVehicle(vehicleId, changes))
  }

  return (
    <section
      className="dashboard-panel"
      aria-labelledby="vehicle-edit-title"
      style={{ marginTop: "1rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <h2 id="vehicle-edit-title" tabIndex={-1} ref={headingRef}>
          Detalle y edición{vehicle ? ` · ${vehicle.plate}` : ""}
        </h2>
        <button type="button" disabled={busy} onClick={onClose}>
          Cerrar detalle
        </button>
      </div>
      {!current && <p role="status">Cargando detalle…</p>}
      {current?.error && (
        <div role="alert">
          <p>{current.error}</p>
          <button type="button" onClick={() => setReload((prev) => prev + 1)}>
            Reintentar detalle
          </button>
        </div>
      )}
      {vehicle && (
        <>
          <p>
            Peso asignado: {vehicle.assignedWeightKg} kg · Disponible:{" "}
            {vehicle.remainingWeightKg} kg
          </p>
          <p>
            Volumen asignado: {vehicle.assignedVolumeM3} m³ · Disponible:{" "}
            {vehicle.remainingVolumeM3} m³
          </p>
          {vehicle.isCommitted && (
            <p>
              Este vehículo tiene una ruta comprometida o carga activa. No se
              puede inactivar ni enviar a mantenimiento.
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null)
              setSuccess(null)
              setReload((prev) => prev + 1)
            }}
          >
            Actualizar detalle
          </button>
          <form className="portal-form" onSubmit={submit}>
            <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "1rem",
                }}
              >
                {([
                  ["plate", "Placa del vehículo"],
                  ["maxWeightKg", "Peso máximo (kg)"],
                  ["maxVolumeM3", "Volumen máximo (m³)"],
                ] as const).map(([field, label]) => (
                  <div className="field" key={field}>
                    <label htmlFor={`edit-${field}`}>{label}</label>
                    <input
                      id={`edit-${field}`}
                      required
                      value={form[field]}
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
                        fields[field] ? `edit-${field}-error` : undefined
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
                      <span className="field-error" id={`edit-${field}-error`}>
                        {fields[field]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <button className="form-submit" type="submit">
                {busy ? "Guardando…" : "Guardar cambios"}
              </button>
            </fieldset>
          </form>
          <div className="portal-form" style={{ marginTop: "1rem" }}>
            <div className="field">
              <label htmlFor="edit-status">Estado operativo</label>
              <select
                id="edit-status"
                disabled={busy}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as VehicleStatus)
                }
              >
                {Object.entries(VEHICLE_STATUS_LABELS).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                    disabled={vehicle.isCommitted && value !== "ACTIVE"}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="form-submit"
              disabled={
                busy ||
                status === vehicle.status ||
                (vehicle.isCommitted && status !== "ACTIVE")
              }
              onClick={() =>
                void save(() => changeVehicleStatus(vehicleId, status))
              }
            >
              Cambiar estado
            </button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </section>
  )
}
