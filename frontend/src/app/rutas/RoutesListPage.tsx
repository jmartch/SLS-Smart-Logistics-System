import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Route as RouteIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { EmptyState } from "../../shared/ui/EmptyState"
import {
  ROUTE_STATUS_COLOR,
  ROUTE_STATUS_LABELS,
  formatPlannedDate,
  formatShortEntityId,
} from "./constants"
import { listRoutes, type PaginatedRoutesResult } from "./routesApi"

const DEFAULT_PAGE_SIZE = 20

export function RoutesListPage() {
  const [page, setPage] = useState(1)
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<PaginatedRoutesResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void listRoutes({ page, pageSize: DEFAULT_PAGE_SIZE })
      .then((data) => {
        if (!active) return
        setResult(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setResult(null)
        setError(
          err instanceof Error
            ? err.message
            : "No fue posible consultar las rutas.",
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
  }, [page, reloadCount])

  const items = result?.items ?? []
  const currentPage = result?.page ?? page
  const pageSize = result?.pageSize ?? DEFAULT_PAGE_SIZE
  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canGoPrev = !loading && currentPage > 1
  const canGoNext = !loading && currentPage * pageSize < total

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage === page) return
    setLoading(true)
    setError(null)
    setPage(nextPage)
  }

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    setReloadCount((current) => current + 1)
  }

  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Rutas</h1>
          <p>Listado de rutas planificadas y activas.</p>
        </div>
      </div>

      <div className="dashboard-panel recent-panel">
        {error && (
          <div
            className="form-error"
            role="alert"
            style={{
              justifyContent: "space-between",
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}>
              <AlertCircle size={17} /> {error}
            </span>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: "999px",
                border: "1px solid var(--danger-border)",
                background: "white",
                color: "var(--danger)",
                fontSize: "0.72rem",
                fontWeight: 700,
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="company-table">
          <div
            className="company-table__head"
            style={{
              gridTemplateColumns:
                "0.85fr 1.15fr 0.85fr 0.85fr 0.85fr 0.6fr 0.95fr 0.35fr",
            }}
          >
            <span>ID</span>
            <span>Fecha planificada</span>
            <span>Mensajero</span>
            <span>Vehículo</span>
            <span>Zona</span>
            <span>Paradas</span>
            <span>Estado</span>
            <span></span>
          </div>

          {loading ? (
            <EmptyState
              icon={<Loader2 size={32} className="spin" />}
              title="Consultando rutas"
              body="Cargando las rutas persistidas del tenant."
            />
          ) : error ? (
            <EmptyState
              icon={<AlertCircle size={32} />}
              title="No se pudo cargar el listado"
              body={error}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<RouteIcon size={32} />}
              title="Sin rutas registradas"
              body="No hay rutas disponibles para los criterios actuales."
            />
          ) : (
            items.map((r) => (
              <div
                key={r.id}
                className="company-table__row"
                style={{
                  gridTemplateColumns:
                    "0.85fr 1.15fr 0.85fr 0.85fr 0.85fr 0.6fr 0.95fr 0.35fr",
                }}
              >
                <strong>
                  <abbr
                    title={r.id}
                    aria-label={`Ruta ${r.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    {formatShortEntityId(r.id)}
                  </abbr>
                </strong>
                <span>{formatPlannedDate(r.plannedStartAt)}</span>
                <span>
                  <abbr
                    title={r.courierId}
                    aria-label={`ID de mensajero ${r.courierId}`}
                    style={{ textDecoration: "none", fontFamily: "monospace" }}
                  >
                    {formatShortEntityId(r.courierId)}
                  </abbr>
                </span>
                <span>
                  <abbr
                    title={r.vehicleId}
                    aria-label={`ID de vehículo ${r.vehicleId}`}
                    style={{ textDecoration: "none", fontFamily: "monospace" }}
                  >
                    {formatShortEntityId(r.vehicleId)}
                  </abbr>
                </span>
                <span>
                  {r.zoneId ? (
                    <abbr
                      title={r.zoneId}
                      aria-label={`ID de zona ${r.zoneId}`}
                      style={{ textDecoration: "none", fontFamily: "monospace" }}
                    >
                      {formatShortEntityId(r.zoneId)}
                    </abbr>
                  ) : (
                    "Sin zona"
                  )}
                </span>
                <span>{r.stopCount}</span>
                <span>
                  <span
                    className={`status ${ROUTE_STATUS_COLOR[r.state] ?? "status--active"}`}
                  >
                    {ROUTE_STATUS_LABELS[r.state] ?? r.state}
                  </span>
                </span>
                <span>
                  <Link
                    to={`/app/rutas/${r.id}`}
                    aria-label={`Ver detalle de ruta ${r.id}`}
                    style={{
                      display: "grid",
                      width: 32,
                      height: 32,
                      placeItems: "center",
                      color: "var(--blue-dark)",
                      borderRadius: 8,
                    }}
                  >
                    <ChevronRight size={17} />
                  </Link>
                </span>
              </div>
            ))
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginTop: "1rem",
            paddingTop: "0.9rem",
            borderTop: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: "0.74rem", fontWeight: 600 }}>
            Página {currentPage} de {totalPages} · {total}{" "}
            {total === 1 ? "ruta" : "rutas"} ({pageSize} por página)
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={() => handlePageChange(currentPage - 1)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.45rem 0.85rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: canGoPrev ? "white" : "var(--surface-muted)",
                color: canGoPrev ? "var(--navy)" : "var(--text-muted)",
                fontSize: "0.75rem",
                fontWeight: 700,
                opacity: canGoPrev ? 1 : 0.6,
              }}
            >
              <ChevronLeft size={15} /> Anterior
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => handlePageChange(currentPage + 1)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.45rem 0.85rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: canGoNext ? "white" : "var(--surface-muted)",
                color: canGoNext ? "var(--navy)" : "var(--text-muted)",
                fontSize: "0.75rem",
                fontWeight: 700,
                opacity: canGoNext ? 1 : 0.6,
              }}
            >
              Siguiente <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
