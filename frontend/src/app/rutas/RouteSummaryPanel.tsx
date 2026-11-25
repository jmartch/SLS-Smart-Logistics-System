import {
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  TrendingUp,
} from "lucide-react"
import { formatPlannedDate, formatShortEntityId } from "./constants"
import type { RouteSummaryResult } from "./routesApi"

interface RouteSummaryPanelProps {
  readonly summary: RouteSummaryResult
}

function formatDurationSeconds(seconds: number): string {
  if (seconds < 0) return "0s"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${remainingSeconds}s`
}

export function RouteSummaryPanel({ summary }: RouteSummaryPanelProps) {
  const isCourierProjection =
    summary.notes === undefined && summary.reasonCode === undefined

  const effectivenessPercent = Math.round(
    summary.deliveryEffectivenessRatio * 100,
  )

  return (
    <div className="dashboard-panel" style={{ display: "grid", gap: "1.2rem" }}>
      <div className="panel-heading">
        <div>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: "0.65rem",
              fontWeight: 600,
            }}
          >
            Snapshot inmutable de auditoría · GET /api/v1/routes/:id/summary
          </span>
          <h2>Resumen oficial de cierre</h2>
        </div>
        <span
          className="status status--active"
          style={{
            background: "#f0fdf4",
            color: "#166534",
            border: "1px solid #bbf7d0",
            fontSize: "0.75rem",
          }}
        >
          <ShieldCheck
            size={14}
            style={{ display: "inline", marginRight: "0.25rem" }}
          />
          Modo: {summary.mode}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--blue-pale)",
            border: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            Total asignados
          </span>
          <strong style={{ fontSize: "1.3rem", color: "var(--navy)" }}>
            {summary.totalAssigned}
          </strong>
        </div>

        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
          }}
        >
          <span
            style={{ fontSize: "0.7rem", color: "#166534", display: "block" }}
          >
            Entregados
          </span>
          <strong style={{ fontSize: "1.3rem", color: "#15803d" }}>
            {summary.deliveredCount}
          </strong>
        </div>

        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "#fff1f2",
            border: "1px solid #fecdd3",
          }}
        >
          <span
            style={{ fontSize: "0.7rem", color: "#9f1239", display: "block" }}
          >
            Fallidos
          </span>
          <strong style={{ fontSize: "1.3rem", color: "#be123c" }}>
            {summary.failedCount}
          </strong>
        </div>

        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          <span
            style={{ fontSize: "0.7rem", color: "#92400e", display: "block" }}
          >
            Reprogramados
          </span>
          <strong style={{ fontSize: "1.3rem", color: "#b45309" }}>
            {summary.rescheduledCount}
          </strong>
        </div>

        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "#f8fafc",
            border: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            Devueltos
          </span>
          <strong style={{ fontSize: "1.3rem", color: "var(--navy)" }}>
            {summary.returnedCount}
          </strong>
        </div>

        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--text-muted)",
              display: "block",
            }}
          >
            Pendientes
          </span>
          <strong style={{ fontSize: "1.3rem", color: "var(--navy)" }}>
            {summary.pendingCount}
          </strong>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "white",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <TrendingUp size={24} style={{ color: "var(--blue)" }} />
          <div>
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                display: "block",
              }}
            >
              Efectividad de entrega
            </span>
            <strong style={{ fontSize: "1.05rem", color: "var(--navy)" }}>
              {effectivenessPercent}%
            </strong>
          </div>
        </div>

        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "white",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <Clock size={24} style={{ color: "var(--blue)" }} />
          <div>
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                display: "block",
              }}
            >
              Duración real
            </span>
            <strong style={{ fontSize: "1.05rem", color: "var(--navy)" }}>
              {formatDurationSeconds(summary.actualDurationS)}
            </strong>
          </div>
        </div>

        <div
          style={{
            padding: "0.8rem",
            borderRadius: "var(--radius-sm)",
            background: "white",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <MapPin size={24} style={{ color: "var(--blue)" }} />
          <div>
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                display: "block",
              }}
            >
              Distancia planificada / real
            </span>
            <strong style={{ fontSize: "0.9rem", color: "var(--navy)" }}>
              {(summary.plannedDistanceM / 1000).toFixed(2)} km /{" "}
              {summary.actualDistanceM != null
                ? `${(summary.actualDistanceM / 1000).toFixed(2)} km`
                : "No registrada"}
            </strong>
          </div>
        </div>
      </div>

      {!isCourierProjection ? (
        <div
          style={{
            padding: "0.9rem",
            background: "var(--blue-pale)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            fontSize: "0.78rem",
          }}
        >
          <strong
            style={{
              display: "block",
              color: "var(--navy)",
              marginBottom: "0.25rem",
            }}
          >
            Observaciones de cierre y motivo:
          </strong>
          <span style={{ color: "var(--navy)" }}>
            {summary.reasonCode ? `[${summary.reasonCode}] ` : ""}
            {summary.notes ?? "Sin observaciones registradas."}
          </span>
        </div>
      ) : (
        <div
          style={{
            padding: "0.75rem",
            background: "var(--surface-muted)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.74rem",
            color: "var(--text-muted)",
          }}
        >
          Proyección de mensajero activa: notas internas de cierre reservadas
          para coordinación.
        </div>
      )}

      {summary.members && summary.members.length > 0 && (
        <div>
          <h4
            style={{
              fontSize: "0.82rem",
              margin: "0 0 0.5rem",
              color: "var(--navy)",
            }}
          >
            Manifiesto reconciliado ({summary.members.length} paquetes)
          </h4>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                fontSize: "0.75rem",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "0.4rem" }}>Asignación</th>
                  <th style={{ padding: "0.4rem" }}>Paquete</th>
                  <th style={{ padding: "0.4rem" }}>Resultado</th>
                  <th style={{ padding: "0.4rem" }}>Custodia / Depósito</th>
                  <th style={{ padding: "0.4rem" }}>Motivo fallo</th>
                </tr>
              </thead>
              <tbody>
                {summary.members.map((m) => (
                  <tr
                    key={m.assignmentId}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "0.4rem" }}>
                      <abbr
                        title={m.assignmentId}
                        style={{ textDecoration: "none" }}
                      >
                        {formatShortEntityId(m.assignmentId)}
                      </abbr>
                    </td>
                    <td style={{ padding: "0.4rem" }}>
                      <abbr
                        title={m.packageId}
                        style={{ textDecoration: "none" }}
                      >
                        {formatShortEntityId(m.packageId)}
                      </abbr>
                    </td>
                    <td style={{ padding: "0.4rem" }}>
                      <span
                        className={`status ${
                          m.outcome === "DELIVERED"
                            ? "status--active"
                            : "status--draft"
                        }`}
                        style={{ fontSize: "0.68rem" }}
                      >
                        {m.outcome}
                      </span>
                    </td>
                    <td style={{ padding: "0.4rem" }}>
                      {m.receiptConfirmed ? (
                        <span
                          style={{ color: "var(--success)", fontWeight: 700 }}
                        >
                          <CheckCircle2
                            size={13}
                            style={{ display: "inline" }}
                          />{" "}
                          Recibido en depósito
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>
                          No requerida / Entregado
                        </span>
                      )}
                    </td>
                    <td
                      style={{ padding: "0.4rem", color: "var(--text-muted)" }}
                    >
                      {m.failureReasonCode ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary.stops && summary.stops.length > 0 && (
        <div>
          <h4
            style={{
              fontSize: "0.82rem",
              margin: "0 0 0.5rem",
              color: "var(--navy)",
            }}
          >
            Disposición de paradas ({summary.stops.length})
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {summary.stops.map((s) => (
              <span
                key={s.routeStopId}
                style={{
                  padding: "0.35rem 0.65rem",
                  borderRadius: "999px",
                  background:
                    s.disposition === "VISITED"
                      ? "#f0fdf4"
                      : s.disposition === "PARTIALLY_VISITED"
                        ? "#fffbeb"
                        : "#fff1f2",
                  border: `1px solid ${
                    s.disposition === "VISITED"
                      ? "#bbf7d0"
                      : s.disposition === "PARTIALLY_VISITED"
                        ? "#fde68a"
                        : "#fecdd3"
                  }`,
                  color:
                    s.disposition === "VISITED"
                      ? "#166534"
                      : s.disposition === "PARTIALLY_VISITED"
                        ? "#92400e"
                        : "#9f1239",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                }}
              >
                Parada #{s.stopNumber}: {s.disposition} ({s.stopState})
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.incidents && summary.incidents.length > 0 && (
        <div>
          <h4
            style={{
              fontSize: "0.82rem",
              margin: "0 0 0.5rem",
              color: "var(--navy)",
            }}
          >
            Incidentes reportados durante la ruta ({summary.incidents.length})
          </h4>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {summary.incidents.map((inc) => (
              <div
                key={inc.incidentId}
                style={{
                  padding: "0.5rem 0.75rem",
                  background: "var(--surface-muted)",
                  borderRadius: "4px",
                  fontSize: "0.74rem",
                }}
              >
                <strong>[{inc.type}]</strong> · Estado: {inc.status} ·{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  {formatPlannedDate(inc.reportedAt)}
                </span>
                {inc.description ? <div>{inc.description}</div> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
