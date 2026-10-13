import { AlertCircle, ArrowLeft, Loader2, MapPin } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useParams } from "react-router"
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
  getRouteDetail,
  mapRouteDetailStopsToMapStops,
  type RouteDetailResult,
} from "../routesApi"

export function RouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>()
  return <RouteDetailView key={routeId ?? "missing"} routeId={routeId ?? ""} />
}

function RouteDetailView({ routeId }: { readonly routeId: string }) {
  const [route, setRoute] = useState<RouteDetailResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let active = true

    void getRouteDetail(routeId)
      .then((detail) => {
        if (!active) return
        setRoute(detail)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setRoute(null)
        setError(
          err instanceof Error
            ? err.message
            : "No fue posible consultar el detalle de la ruta.",
        )
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [routeId, reloadCount])

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    setReloadCount((current) => current + 1)
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
      <div className="company-page-heading" style={{ alignItems: "flex-start" }}>
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
              aria-label={`ID de mensajero ${route.courierId}`}
              style={{ textDecoration: "none", fontFamily: "monospace" }}
            >
              {formatShortEntityId(route.courierId)}
            </abbr>{" "}
            · Vehículo:{" "}
            <abbr
              title={route.vehicleId}
              aria-label={`ID de vehículo ${route.vehicleId}`}
              style={{ textDecoration: "none", fontFamily: "monospace" }}
            >
              {formatShortEntityId(route.vehicleId)}
            </abbr>
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
                  background: "linear-gradient(90deg, var(--blue), var(--success))",
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
                      </strong>
                      <span
                        style={{
                          display: "block",
                          color: "var(--text-muted)",
                          fontSize: "0.68rem",
                          fontFamily: "monospace",
                        }}
                      >
                        ID:{" "}
                        <abbr
                          title={stop.id}
                          aria-label={`ID de parada ${stop.id}`}
                          style={{ textDecoration: "none" }}
                        >
                          {formatShortEntityId(stop.id)}
                        </abbr>
                      </span>
                      <span
                        style={{
                          display: "block",
                          color: "var(--text-muted)",
                          fontSize: "0.65rem",
                        }}
                      >
                        Coordenadas: ({stop.latitude.toFixed(4)},{" "}
                        {stop.longitude.toFixed(4)})
                      </span>
                    </div>
                    <span
                      className={`status ${STOP_COLOR[stop.state] ?? "status--active"}`}
                    >
                      {STOP_LABEL[stop.state] ?? stop.state}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                Resumen · Solo lectura
              </span>
              <h2>Datos de ruta</h2>
            </div>
          </div>
          <dl style={{ display: "grid", gap: "0.9rem", margin: 0 }}>
            {[
              ["ID de ruta", route.id],
              ["Estado", ROUTE_STATUS_LABELS[route.state] ?? route.state],
              ["Mensajero (ID)", route.courierId],
              ["Vehículo (ID)", route.vehicleId],
              ["Depósito (ID)", route.depotId ?? "Sin depósito"],
              ["Inicio planificado", formatPlannedDate(route.plannedStartAt)],
              ["Fin planificado", formatPlannedDate(route.plannedEndAt)],
              ["Inicio real", formatPlannedDate(route.startedAt)],
              ["Cierre real", formatPlannedDate(route.completedAt)],
              ["Total paradas", String(totalStops)],
            ].map(([k, v]) => (
              <div
                key={k}
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
                  {k}
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
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </>
  )
}
