import { AlertCircle, AlertTriangle, Check, Loader2, X } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"
import { reportIncident } from "../../deliveriesApi"
import {
  computeIncidentSignature,
  IdempotentActionTracker,
} from "../../../../shared/idempotency/idempotentAction"

export interface IncidentReportFormProps {
  readonly routeId?: string
  readonly routeStopId?: string
  readonly packageId?: string
  readonly onSuccess?: () => void
  readonly onCancel?: () => void
}

const INCIDENT_TYPE_OPTIONS = [
  { value: "VEHICLE_BREAKDOWN", label: "Avería o falla vehicular" },
  { value: "TRAFFIC_CONGESTION", label: "Tráfico o congestión vial severa" },
  { value: "ACCIDENT", label: "Accidente de tránsito" },
  { value: "WEATHER", label: "Condición climática adversa" },
  { value: "SECURITY_ALERT", label: "Alerta de seguridad o orden público" },
  {
    value: "ADDRESS_INACCESSIBLE",
    label: "Zona o dirección físicamente inaccesible",
  },
  { value: "OTHER", label: "Otro incidente operativo" },
] as const

export function IncidentReportForm({
  routeId,
  routeStopId,
  packageId,
  onSuccess,
  onCancel,
}: IncidentReportFormProps) {
  const [type, setType] = useState<string>("TRAFFIC_CONGESTION")
  const [description, setDescription] = useState<string>("")
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reported, setReported] = useState<boolean>(false)

  const tracker = useMemo(() => new IdempotentActionTracker(), [])

  const isFormValid =
    Boolean(type.trim()) &&
    Boolean(description.trim()) &&
    description.trim().length >= 5

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isFormValid || submitting) return

    setSubmitting(true)
    setErrorMessage(null)

    try {
      const signature = computeIncidentSignature({
        type: type.trim(),
        description: description.trim(),
        routeId,
        routeStopId,
        packageId,
      })
      const idempotencyKey = tracker.getKey(signature)

      await reportIncident(
        {
          type: type.trim(),
          description: description.trim(),
          routeId,
          routeStopId,
          packageId,
        },
        idempotencyKey,
      )

      setReported(true)
      setDescription("")
      onSuccess?.()
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Error inesperado al reportar la novedad.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (reported) {
    return (
      <div
        role="status"
        style={{
          background: "#f0faf5",
          border: "1px solid #b7eb8f",
          borderRadius: "var(--radius-md)",
          padding: "1rem",
          marginTop: "1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Check size={18} color="var(--success)" />
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--success)",
            }}
          >
            Novedad reportada correctamente al centro de operaciones.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setReported(false)}
          style={{
            padding: "0.35rem 0.65rem",
            background: "white",
            border: "1px solid #b7eb8f",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
            color: "var(--success)",
          }}
        >
          Reportar otra
        </button>
      </div>
    )
  }

  return (
    <div
      role="region"
      aria-labelledby="incident-form-title"
      style={{
        background: "white",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "1.25rem",
        marginTop: "1rem",
        boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "0.85rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#fff7e6",
              color: "#fa8c16",
              display: "grid",
              placeItems: "center",
            }}
          >
            <AlertTriangle size={18} />
          </span>
          <div>
            <h4
              id="incident-form-title"
              style={{
                margin: 0,
                fontSize: "0.98rem",
                fontFamily: "Space Grotesk, sans-serif",
                color: "var(--navy)",
              }}
            >
              Reportar novedad en ruta
            </h4>
            <p
              style={{
                margin: "0.15rem 0 0",
                fontSize: "0.78rem",
                color: "var(--text-muted)",
              }}
            >
              Registra incidentes viales, mecánicos o de acceso para
              conocimiento operativo.
            </p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cerrar reporte de novedad"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.25rem",
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            background: "#fff3f3",
            color: "#c0392b",
            border: "1px solid #f5c2c7",
            borderRadius: "var(--radius-sm)",
            padding: "0.65rem 0.8rem",
            fontSize: "0.82rem",
            marginBottom: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
      >
        <div>
          <label
            htmlFor="incident-type-select"
            style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "var(--navy)",
              marginBottom: "0.3rem",
            }}
          >
            Tipo de incidente *
          </label>
          <select
            id="incident-type-select"
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{
              width: "100%",
              padding: "0.6rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              fontSize: "0.82rem",
              color: "var(--text)",
              background: "white",
            }}
          >
            {INCIDENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="incident-description"
            style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "var(--navy)",
              marginBottom: "0.3rem",
            }}
          >
            Descripción detallada * (mínimo 5 caracteres)
          </label>
          <textarea
            id="incident-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe la situación ocurrida en la vía o punto de entrega..."
            required
            style={{
              width: "100%",
              padding: "0.6rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              fontSize: "0.82rem",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            marginTop: "0.25rem",
          }}
        >
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              style={{
                padding: "0.5rem 0.85rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "white",
                color: "var(--text)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={!isFormValid || submitting}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--navy)",
              color: "white",
              fontSize: "0.8rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              cursor: isFormValid && !submitting ? "pointer" : "not-allowed",
              opacity: isFormValid && !submitting ? 1 : 0.6,
            }}
          >
            {submitting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <AlertTriangle size={14} />
            )}
            {submitting ? "Enviando..." : "Reportar novedad"}
          </button>
        </div>
      </form>
    </div>
  )
}
