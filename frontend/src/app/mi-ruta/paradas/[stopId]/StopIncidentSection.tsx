import { AlertTriangle } from "lucide-react"
import { IncidentReportForm } from "./IncidentReportForm"

export interface StopIncidentSectionProps {
  readonly routeId: string
  readonly stopId: string
  readonly routeState: string
  readonly canExecute: boolean
  readonly showIncidentForm: boolean
  readonly onToggleIncidentForm: () => void
}

export function StopIncidentSection({
  routeId,
  stopId,
  routeState,
  canExecute,
  showIncidentForm,
  onToggleIncidentForm,
}: StopIncidentSectionProps) {
  const isRouteClosed =
    routeState === "COMPLETED" || routeState === "CANCELLED"

  if (isRouteClosed || !canExecute) {
    return null
  }

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "1.25rem",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: "1.02rem",
              fontFamily: "Space Grotesk, sans-serif",
              color: "var(--navy)",
            }}
          >
            Novedades operativas de la parada
          </h3>
          <p
            style={{
              margin: "0.15rem 0 0",
              fontSize: "0.8rem",
              color: "var(--text-muted)",
            }}
          >
            Reporta bloqueos, condiciones climáticas o accidentes durante la
            atención de esta parada.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleIncidentForm}
          style={{
            padding: "0.45rem 0.9rem",
            background: showIncidentForm ? "var(--surface)" : "white",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            color: "var(--navy)",
          }}
        >
          <AlertTriangle size={15} color="#fa8c16" />
          {showIncidentForm ? "Ocultar formulario" : "Reportar novedad"}
        </button>
      </div>

      {showIncidentForm && (
        <IncidentReportForm
          routeId={routeId}
          routeStopId={stopId}
          onCancel={onToggleIncidentForm}
        />
      )}
    </div>
  )
}
