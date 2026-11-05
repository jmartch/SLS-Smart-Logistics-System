import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  Route,
  Truck,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { EmptyState } from "../../shared/ui/EmptyState"
import {
  PLANNING_PACKAGE_STATE_LABELS,
  formatPendingReasonLabel,
  getPlanningWorkspace,
  replanEditableRoute,
  type PlanningWorkspaceEditableRoute,
  type PlanningWorkspacePackage,
} from "../planificacion/planningApi"
import { formatShortEntityId } from "../rutas/constants"

function formatWaitDuration(isoDate?: string | null): string {
  if (!isoDate) return "Reciente"
  const parsed = new Date(isoDate).getTime()
  if (Number.isNaN(parsed)) return "Reciente"
  const waitMins = Math.max(0, Math.floor((Date.now() - parsed) / 60000))
  if (waitMins < 60) {
    return `${waitMins} min esperando`
  }
  return `${Math.floor(waitMins / 60)}h ${waitMins % 60}min esperando`
}

export function PendingAssignmentsPage() {
  const [pendingPackages, setPendingPackages] = useState<
    readonly PlanningWorkspacePackage[]
  >([])
  const [editableRoutes, setEditableRoutes] = useState<
    readonly PlanningWorkspaceEditableRoute[]
  >([])
  const [selectedRouteByPkg, setSelectedRouteByPkg] = useState<
    Record<string, string>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assigningPkgId, setAssigningPkgId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{
    readonly kind: "success" | "error"
    readonly message: string
  } | null>(null)

  const loadPending = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const workspace = await getPlanningWorkspace()
      const pending = workspace.candidatePackages.filter(
        (pkg) => pkg.state === "PENDING_ASSIGNMENT",
      )
      setPendingPackages(pending)
      setEditableRoutes(workspace.editableRoutes)

      const defaultRouteId = workspace.editableRoutes[0]?.id ?? ""
      if (defaultRouteId) {
        const nextSelection: Record<string, string> = {}
        for (const p of pending) {
          nextSelection[p.id] = defaultRouteId
        }
        setSelectedRouteByPkg(nextSelection)
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No fue posible consultar los paquetes pendientes de asignación.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  const handleAssignToRoute = async (pkg: PlanningWorkspacePackage) => {
    const targetRouteId =
      selectedRouteByPkg[pkg.id] ?? editableRoutes[0]?.id ?? ""
    if (!targetRouteId) {
      setFeedback({
        kind: "error",
        message:
          "No hay una ruta en estado PLANNED seleccionada. Usa Planificar rutas para crear una nueva ruta.",
      })
      return
    }

    setAssigningPkgId(pkg.id)
    setFeedback(null)
    try {
      const result = await replanEditableRoute(targetRouteId, {
        packageIds: [pkg.id],
        ordering: "nearest-neighbor",
      })
      const assigned = result.outcomes.some(
        (o) => o.kind === "ASSIGNED" && o.packageId === pkg.id,
      )
      if (assigned) {
        setFeedback({
          kind: "success",
          message: `Guía ${pkg.trackingCode} asignada a la ruta ${formatShortEntityId(result.routeId)} (${result.stops.length} paradas ordenadas).`,
        })
      } else {
        const pendingOutcome = result.outcomes.find(
          (o) => o.kind === "PENDING_ASSIGNMENT" && o.packageId === pkg.id,
        )
        setFeedback({
          kind: "error",
          message: `No se pudo asignar ${pkg.trackingCode}: ${formatPendingReasonLabel(pendingOutcome?.kind === "PENDING_ASSIGNMENT" ? pendingOutcome.reasonCode : null)}.`,
        })
      }
      await loadPending()
    } catch (err: unknown) {
      setFeedback({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "No fue posible asignar el paquete a la ruta.",
      })
    } finally {
      setAssigningPkgId(null)
    }
  }

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Pendientes de asignación</h1>
          <p>
            Paquetes en estado PENDING_ASSIGNMENT expuestos para revisión y
            reasignación manual por coordinación.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span
            className="counter"
            style={{ fontSize: "0.82rem", padding: "0.5rem 1rem" }}
          >
            {pendingPackages.length} sin asignar
          </span>
          <button
            type="button"
            onClick={() => void loadPending()}
            disabled={loading || Boolean(assigningPkgId)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.55rem 0.95rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--navy)",
              fontSize: "0.76rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className="dashboard-panel"
          role="status"
          style={{
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            color: feedback.kind === "success" ? "var(--success)" : "#c0392b",
            fontWeight: 600,
            fontSize: "0.82rem",
          }}
        >
          {feedback.kind === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {loading ? (
        <EmptyState
          icon={<Loader2 size={32} className="spin" />}
          title="Consultando pendientes"
          body="Cargando paquetes en estado PENDING_ASSIGNMENT del tenant activo."
        />
      ) : error ? (
        <EmptyState
          icon={<AlertCircle size={32} />}
          title="Error al consultar pendientes"
          body={error}
        />
      ) : pendingPackages.length === 0 ? (
        <EmptyState
          icon={<Clock size={32} />}
          title="Sin pendientes"
          body="Todos los paquetes clasificados tienen ruta asignada o están listos para planificación."
        />
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {pendingPackages.map((pkg) => {
            const reason = formatPendingReasonLabel(pkg.lastPendingReasonCode)
            const waitLabel = formatWaitDuration(pkg.lastStateChangedAt)
            const selectedRouteId =
              selectedRouteByPkg[pkg.id] ?? editableRoutes[0]?.id ?? ""

            return (
              <div
                key={pkg.id}
                className="dashboard-panel"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      marginBottom: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong
                      style={{
                        color: "var(--navy)",
                        fontFamily: "Space Grotesk, sans-serif",
                      }}
                    >
                      {pkg.trackingCode}
                    </strong>
                    <span className="status status--pending">
                      {PLANNING_PACKAGE_STATE_LABELS[pkg.state]}
                    </span>
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.68rem",
                      }}
                    >
                      <Clock size={12} style={{ verticalAlign: "middle" }} />{" "}
                      {waitLabel}
                    </span>
                  </div>

                  <p
                    style={{
                      margin: "0 0 0.5rem",
                      color: "var(--text-muted)",
                      fontSize: "0.78rem",
                    }}
                  >
                    <AlertCircle
                      size={14}
                      style={{ verticalAlign: "middle", color: "#c0392b" }}
                    />{" "}
                    Razón: {reason}
                  </p>

                  <div
                    style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}
                  >
                    {[
                      ["Dirección", pkg.address],
                      [
                        "Zona",
                        `${pkg.zoneName ?? "Sin zona"}${pkg.sectorName ? ` · ${pkg.sectorName}` : ""}`,
                      ],
                      ["Peso / Volumen", `${pkg.weightKg} kg · ${pkg.volumeM3} m³`],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.62rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                          }}
                        >
                          {k}
                        </span>
                        <span
                          style={{
                            display: "block",
                            color: "var(--navy)",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                          }}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    flexShrink: 0,
                    minWidth: 230,
                  }}
                >
                  {editableRoutes.length > 0 ? (
                    <>
                      <select
                        aria-label={`Ruta editable para ${pkg.trackingCode}`}
                        value={selectedRouteId}
                        onChange={(e) =>
                          setSelectedRouteByPkg((prev) => ({
                            ...prev,
                            [pkg.id]: e.target.value,
                          }))
                        }
                        style={{
                          padding: "0.45rem 0.65rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          fontSize: "0.74rem",
                        }}
                      >
                        {editableRoutes.map((r) => (
                          <option key={r.id} value={r.id}>
                            Ruta {formatShortEntityId(r.id)} · {r.vehiclePlate}{" "}
                            (disp. {r.remainingWeightKg} kg)
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="form-submit"
                        disabled={assigningPkgId === pkg.id}
                        onClick={() => void handleAssignToRoute(pkg)}
                        style={{
                          padding: "0.65rem 1.1rem",
                          fontSize: "0.78rem",
                          minHeight: "auto",
                        }}
                      >
                        {assigningPkgId === pkg.id ? (
                          <Loader2 size={15} className="spin" />
                        ) : (
                          <Truck size={15} />
                        )}{" "}
                        Asignar a ruta PLANNED
                      </button>
                    </>
                  ) : (
                    <Link
                      to="/app/planificacion"
                      className="form-submit"
                      style={{
                        padding: "0.65rem 1.1rem",
                        fontSize: "0.78rem",
                        minHeight: "auto",
                        textDecoration: "none",
                        justifyContent: "center",
                      }}
                    >
                      <Route size={15} /> Planificar nueva ruta
                    </Link>
                  )}

                  <Link
                    to={`/app/paquetes/${pkg.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      justifyContent: "center",
                      padding: "0.6rem 1rem",
                      color: "var(--navy)",
                      background: "var(--blue-pale)",
                      border: "1px solid var(--border)",
                      borderRadius: "999px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    <Eye size={15} /> Detalle
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
