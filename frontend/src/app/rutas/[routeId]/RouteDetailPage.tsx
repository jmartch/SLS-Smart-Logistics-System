import { AlertCircle, ArrowLeft, Loader2, MapPin } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { useAuth } from "../../../auth"
import { RouteOperations } from "../RouteOperations"
import { RouteSummaryPanel } from "../RouteSummaryPanel"
import { EmptyState } from "../../../shared/ui/EmptyState"
import {
  ROUTE_STATUS_COLOR,
  ROUTE_STATUS_LABELS,
  STOP_COLOR,
  STOP_LABEL,
  formatPlannedDate,
  formatShortEntityId,
} from "../constants"
import { RouteMap } from "../RouteMap"
import {
  handleClosureSuccessState,
  handleRefreshFailureState,
  type RouteDetailClosureState,
} from "../routeClosureState"
import {
  getRouteDetail,
  getRouteSummary,
  mapRouteDetailStopsToMapStops,
  type CloseRouteResult,
  type RouteDetailResult,
  type RouteSummaryResult,
} from "../routesApi"

export function RouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>()
  return <RouteDetailView key={routeId ?? "missing"} routeId={routeId ?? ""} />
}

function RouteDetailView({ routeId }: { readonly routeId: string }) {
  const { user } = useAuth()
  const [route, setRoute] = useState<RouteDetailResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{
    readonly kind: "success" | "error"
    readonly message: string
  } | null>(null)
  const [summary, setSummary] = useState<RouteSummaryResult | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [closureConfirmed, setClosureConfirmed] = useState(false)

  const routeRef = useRef<RouteDetailResult | null>(route)
  const closureStateRef = useRef<RouteDetailClosureState>({
    route,
    closureConfirmed,
    refreshError,
    summary,
    actionFeedback,
  })

  useEffect(() => {
    routeRef.current = route
    closureStateRef.current = {
      route,
      closureConfirmed,
      refreshError,
      summary,
      actionFeedback,
    }
  }, [route, closureConfirmed, refreshError, summary, actionFeedback])

  const fetchSummary = useCallback(() => {
    if (!routeId) return
    setLoadingSummary(true)
    setSummaryError(null)

    void getRouteSummary(routeId)
      .then((sum) => {
        setSummary(sum)
      })
      .catch((err: unknown) => {
        setSummary(null)
        setSummaryError(
          err instanceof Error
            ? err.message
            : "No fue posible consultar el resumen de la ruta.",
        )
      })
      .finally(() => {
        setLoadingSummary(false)
      })
  }, [routeId])

  useEffect(() => {
    let active = true

    void getRouteDetail(routeId)
      .then((detail) => {
        if (!active) return
        setRoute(detail)
        setError(null)
        setRefreshError(null)
        if (detail.state === "COMPLETED") {
          setClosureConfirmed(true)
          fetchSummary()
        } else {
          setSummary(null)
          setSummaryError(null)
        }
      })
      .catch((err: unknown) => {
        if (!active) return
        const msg =
          err instanceof Error
            ? err.message
            : "No fue posible consultar el detalle de la ruta."
        if (routeRef.current) {
          const updated = handleRefreshFailureState(
            closureStateRef.current,
            msg,
          )
          setRefreshError(updated.refreshError)
        } else {
          setError(msg)
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [routeId, reloadCount, fetchSummary])

  const handleRetry = () => {
    setLoading(!routeRef.current)
    setError(null)
    setRefreshError(null)
    setReloadCount((current) => current + 1)
  }

  const handleClosureSuccess = (result: CloseRouteResult) => {
    const updated = handleClosureSuccessState(
      closureStateRef.current,
      result,
    )
    setClosureConfirmed(updated.closureConfirmed)
    setRoute(updated.route)
    if (updated.summary) {
      setSummary(updated.summary)
    }
    setRefreshError(updated.refreshError)
    setActionFeedback(updated.actionFeedback)
    fetchSummary()
    setReloadCount((current) => current + 1)
  }

  const runAction = async (
    label: string,
    fn: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setActionBusy(label)
    setActionFeedback(null)
    try {
      await fn()
      setActionFeedback({ kind: "success", message: successMessage })
      setReloadCount((current) => current + 1)
    } catch (err: unknown) {
      setActionFeedback({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "No fue posible ejecutar la acción sobre la ruta.",
      })
    } finally {
      setActionBusy(null)
    }
  }

  if (loading) {
    return (
      <>
        <EmptyState
          icon={<Loader2 size={32} className="spin" />}
          title="Consultando ruta"
          body="Cargando el detalle persistido de la ruta."
        />
        <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </>
    )
  }

  if (error || !route) {
    return (
      <div className="not-found" role="alert" style={{ minHeight: "60vh" }}>
        <span>
          <AlertCircle size={48} />
        </span>
        <h1>No se pudo cargar la ruta</h1>
        <p>{error ?? "La ruta solicitada no está disponible."}</p>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link
            to="/app/rutas"
            className="form-submit"
            style={{ textDecoration: "none" }}
          >
            <ArrowLeft size={17} /> Volver a rutas
          </Link>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              minHeight: 48,
              padding: "0.8rem 1.2rem",
              borderRadius: "999px",
              border: "1px solid var(--border)",
              background: "white",
              color: "var(--navy)",
              fontWeight: 700,
              fontSize: "0.86rem",
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const orderedStops = [...route.stops].sort(
    (a, b) => a.stopNumber - b.stopNumber,
  )
  const mapStops = mapRouteDetailStopsToMapStops(orderedStops)
  const totalStops = orderedStops.length
  const completedStops = orderedStops.filter(
    (stop) => stop.state === "COMPLETED",
  ).length
  const failedStops = orderedStops.filter(
    (stop) => stop.state === "FAILED",
  ).length
  const pendingStops = orderedStops.filter(
    (stop) => stop.state === "PENDING",
  ).length
  const progress =
    totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0
  const dataSourceLabel = "GET /api/v1/routes/:id"

  return (
    <>
      <div
        className="company-page-heading"
        style={{ alignItems: "flex-start" }}
      >
        <div>
          <Link
            to="/app/rutas"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "var(--text-muted)",
              fontSize: "0.8rem",
              fontWeight: 700,
              textDecoration: "none",
              marginBottom: "0.6rem",
            }}
          >
            <ArrowLeft size={15} /> Rutas
          </Link>
          <h1 style={{ fontSize: "clamp(1.4rem, 2.6vw, 2.1rem)" }}>
            Ruta{" "}
            <abbr
              title={route.id}
              aria-label={`ID completo de ruta ${route.id}`}
              style={{ textDecoration: "none" }}
            >
              {formatShortEntityId(route.id)}
            </abbr>
          </h1>
          <p>
            Mensajero:{" "}
            <abbr
              title={route.courierId}
              aria-label={`Mensajero ${route.courierEmail ?? route.courierId}`}
              style={{ textDecoration: "none" }}
            >
              {route.courierEmail ?? formatShortEntityId(route.courierId)}
            </abbr>{" "}
            · Vehículo:{" "}
            <abbr
              title={route.vehicleId}
              aria-label={`Vehículo ${route.vehiclePlate ?? route.vehicleId}`}
              style={{ textDecoration: "none" }}
            >
              {route.vehiclePlate ?? formatShortEntityId(route.vehicleId)}
            </abbr>
            {route.zoneName ? (
              <>
                {" "}
                · Zona:{" "}
                <abbr
                  title={route.zoneId ?? undefined}
                  aria-label={
                    route.zoneId ? `Zona ${route.zoneName}` : undefined
                  }
                  style={{ textDecoration: "none" }}
                >
                  {route.zoneName}
                </abbr>
              </>
            ) : null}
          </p>
        </div>
        <span
          className={`status ${ROUTE_STATUS_COLOR[route.state] ?? "status--active"}`}
          style={{
            fontSize: "0.78rem",
            padding: "0.5rem 1rem",
            flexShrink: 0,
            marginTop: "0.5rem",
          }}
        >
          {ROUTE_STATUS_LABELS[route.state] ?? route.state}
        </span>
      </div>

      {refreshError && (
        <div
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            background: "#fff3f3",
            border: "1px solid #f5c2c7",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <span
            style={{
              color: "#c0392b",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            {refreshError}
          </span>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              padding: "0.35rem 0.75rem",
              background: "white",
              border: "1px solid #f5c2c7",
              borderRadius: "var(--radius-sm)",
              color: "#c0392b",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reintentar lectura
          </button>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                  }}
                >
                  Progreso de paradas
                </span>
                <h2>Ejecución de ruta</h2>
              </div>
              <span
                style={{
                  color: "var(--navy)",
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: "1.3rem",
                  fontWeight: 700,
                }}
              >
                {completedStops}/{totalStops}
              </span>
            </div>
            <div
              style={{
                height: 10,
                background: "var(--surface-muted)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background:
                    "linear-gradient(90deg, var(--blue), var(--success))",
                  borderRadius: 999,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <p
              style={{
                margin: "0.5rem 0 0",
                color: "var(--text-muted)",
                fontSize: "0.72rem",
              }}
            >
              {progress}% completado · {pendingStops} pendientes · {failedStops}{" "}
              fallidas
            </p>
          </div>

          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                  }}
                >
                  Georreferenciación · OpenStreetMap
                </span>
                <h2>Secuencia geográfica de paradas</h2>
              </div>
              <span
                style={{
                  fontSize: "0.68rem",
                  color: "var(--blue-dark)",
                  fontWeight: 700,
                }}
              >
                {dataSourceLabel}
              </span>
            </div>
            <RouteMap stops={mapStops} dataSourceLabel={dataSourceLabel} />
          </div>

          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                  }}
                >
                  Paradas ({totalStops})
                </span>
                <h2>Orden de paradas</h2>
              </div>
            </div>
            {orderedStops.length === 0 ? (
              <EmptyState
                icon={<MapPin size={28} />}
                title="Sin paradas"
                body="Esta ruta no tiene paradas registradas."
              />
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {orderedStops.map((stop) => (
                  <div
                    key={stop.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      alignItems: "center",
                      gap: "0.9rem",
                      padding: "0.9rem 1rem",
                      background: "var(--blue-pale)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--navy)",
                        color: "white",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        fontFamily: "Space Grotesk, sans-serif",
                      }}
                    >
                      {stop.stopNumber}
                    </span>
                    <div>
                      <strong
                        style={{ color: "var(--navy)", fontSize: "0.82rem" }}
                      >
                        Parada #{stop.stopNumber}
                        {stop.trackingCode
                          ? ` · Guía: ${stop.trackingCode}`
                          : ""}
                      </strong>
                      {stop.address ? (
                        <span
                          style={{
                            display: "block",
                            color: "var(--blue-dark)",
                            fontSize: "0.74rem",
                            fontWeight: 600,
                            marginTop: "0.15rem",
                          }}
                        >
                          📍 {stop.address}
                        </span>
                      ) : null}
                      <span
                        style={{
                          display: "block",
                          color: "var(--text-muted)",
                          fontSize: "0.66rem",
                          marginTop: "0.15rem",
                        }}
                      >
                        ID:{" "}
                        <abbr
                          title={stop.id}
                          aria-label={`ID de parada ${stop.id}`}
                          style={{ textDecoration: "none" }}
                        >
                          {formatShortEntityId(stop.id)}
                        </abbr>{" "}
                        · Coordenadas: ({stop.latitude.toFixed(4)},{" "}
                        {stop.longitude.toFixed(4)})
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        className={`status ${STOP_COLOR[stop.state] ?? "status--active"}`}
                      >
                        {STOP_LABEL[stop.state] ?? stop.state}
                      </span>
                      <Link
                        to={`/app/mi-ruta/paradas/${stop.id}?routeId=${route.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.35rem 0.65rem",
                          borderRadius: "999px",
                          background: "white",
                          border: "1px solid var(--border)",
                          color: "var(--navy)",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Ver parada
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                  }}
                >
                  Resumen · Solo lectura
                </span>
                <h2>Datos de ruta</h2>
              </div>
            </div>
            <dl style={{ display: "grid", gap: "0.9rem", margin: 0 }}>
              {[
                { label: "ID de ruta", value: route.id, title: route.id },
                {
                  label: "Estado",
                  value: ROUTE_STATUS_LABELS[route.state] ?? route.state,
                },
                {
                  label: "Mensajero",
                  value:
                    route.courierEmail ?? formatShortEntityId(route.courierId),
                  title: route.courierId,
                },
                {
                  label: "Vehículo",
                  value: route.vehiclePlate
                    ? `${route.vehiclePlate} (${formatShortEntityId(route.vehicleId)})`
                    : formatShortEntityId(route.vehicleId),
                  title: route.vehicleId,
                },
                {
                  label: "Zona",
                  value:
                    route.zoneName ??
                    (route.zoneId
                      ? formatShortEntityId(route.zoneId)
                      : "Sin zona"),
                  title: route.zoneId ?? undefined,
                },
                {
                  label: "Depósito",
                  value:
                    route.depotName ??
                    (route.depotId
                      ? formatShortEntityId(route.depotId)
                      : "Sin depósito"),
                  title: route.depotId ?? undefined,
                },
                {
                  label: "Inicio planificado",
                  value: formatPlannedDate(route.plannedStartAt),
                },
                {
                  label: "Fin planificado",
                  value: formatPlannedDate(route.plannedEndAt),
                },
                {
                  label: "Inicio real",
                  value: formatPlannedDate(route.startedAt),
                },
                {
                  label: "Cierre real",
                  value: formatPlannedDate(route.completedAt),
                },
                { label: "Total paradas", value: String(totalStops) },
              ].map(({ label, value, title }) => (
                <div
                  key={label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "0.95fr 1.25fr",
                    gap: "0.5rem",
                  }}
                >
                  <dt
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      alignSelf: "center",
                    }}
                  >
                    {label}
                  </dt>
                  <dd
                    style={{
                      margin: 0,
                      color: "var(--navy)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {title ? (
                      <abbr title={title} style={{ textDecoration: "none" }}>
                        {value}
                      </abbr>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <RouteOperations
            route={route}
            permissions={user?.permissions ?? []}
            actionBusy={actionBusy}
            actionFeedback={actionFeedback}
            runAction={runAction}
            onClosureSuccess={handleClosureSuccess}
            closureConfirmed={closureConfirmed}
          />

          {loadingSummary && (
            <div
              className="dashboard-panel"
              style={{ padding: "1.2rem", textAlign: "center" }}
            >
              <Loader2
                size={24}
                className="spin"
                style={{ margin: "0 auto 0.5rem" }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                }}
              >
                Consultando resumen oficial de cierre...
              </p>
            </div>
          )}

          {summaryError && (
            <div
              role="alert"
              className="dashboard-panel"
              style={{
                border: "1px solid #ffccc7",
                background: "#fff1f0",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "#cf1322",
                  marginBottom: "0.6rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{summaryError}</span>
              </div>
              <button
                type="button"
                className="form-submit"
                onClick={fetchSummary}
                style={{ fontSize: "0.78rem", padding: "0.5rem 1rem" }}
              >
                Reintentar consulta de resumen
              </button>
            </div>
          )}

          {summary && <RouteSummaryPanel summary={summary} />}
        </div>
      </div>
    </>
  )
}
