import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Truck,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { useAuth } from "../../auth"
import { EmptyState } from "../../shared/ui/EmptyState"
import {
  ROUTE_STATUS_COLOR,
  ROUTE_STATUS_LABELS,
  formatPlannedDate,
  formatShortEntityId,
} from "../rutas/constants"
import { loadMyRoutes, type MyRoutesState } from "./myRouteState"

export function MyRouteContent({
  state,
  onRetry,
}: {
  state: MyRoutesState
  onRetry: () => void
}) {
  if (state.kind === "loading")
    return (
      <div role="status">
        <EmptyState
          icon={<Loader2 size={32} />}
          title="Cargando tus rutas"
          body="Consultando las rutas asignadas a tu sesión."
        />
      </div>
    )
  if (state.kind === "error")
    return (
      <div role="alert" className="dashboard-panel">
        <EmptyState
          icon={<AlertCircle size={32} />}
          title={state.title}
          body={state.message}
        />
        {state.status === 401 ? (
          <Link to="/login" className="form-submit">
            Iniciar sesión
          </Link>
        ) : (
          <button type="button" className="form-submit" onClick={onRetry}>
            Volver a intentar
          </button>
        )}
      </div>
    )
  if (state.result.items.length === 0)
    return (
      <EmptyState
        icon={<Truck size={36} />}
        title="Sin rutas asignadas"
        body="La consulta se completó correctamente. Todavía no tienes rutas asignadas."
      />
    )
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {state.result.items.map((route) => (
        <div className="dashboard-panel" key={route.id}>
          <div className="panel-heading">
            <div>
              <h2>Ruta {formatShortEntityId(route.id)}</h2>
              <p>
                {route.zoneName ?? "Zona sin especificar"} ·{" "}
                {route.vehiclePlate ?? "Vehículo asignado"}
              </p>
            </div>
            <span className={`status ${ROUTE_STATUS_COLOR[route.state]}`}>
              {ROUTE_STATUS_LABELS[route.state]}
            </span>
          </div>
          <p>
            {route.stopCount} paradas ·{" "}
            {formatPlannedDate(route.plannedStartAt)}
          </p>
          {route.state === "PLANNED" && (
            <p>
              El coordinador debe preparar esta ruta antes de que puedas
              iniciarla.
            </p>
          )}
          {route.state === "READY" && <p>Esta ruta está lista para iniciar.</p>}
          <Link className="form-submit" to={`/app/rutas/${route.id}`}>
            Ver ruta y paradas
          </Link>
        </div>
      ))}
    </div>
  )
}

export function MyRoutePage() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [state, setState] = useState<MyRoutesState>({ kind: "loading" })
  useEffect(() => {
    let active = true
    void loadMyRoutes(page).then((result) => {
      if (active) setState(result)
    })
    return () => {
      active = false
    }
  }, [page, reload, user?.id])
  const retry = () => {
    setState({ kind: "loading" })
    setReload((value) => value + 1)
  }
  const changePage = (next: number) => {
    setState({ kind: "loading" })
    setPage(next)
  }
  const result = state.kind === "success" ? state.result : null
  return (
    <>
      <div className="company-page-heading">
        <div>
          <h1>Mi ruta</h1>
          <p>Tus rutas asignadas y su estado actual.</p>
        </div>
        <button
          type="button"
          className="form-submit"
          onClick={retry}
          disabled={state.kind === "loading"}
        >
          <RefreshCw size={16} /> Actualizar rutas
        </button>
      </div>
      <MyRouteContent state={state} onRetry={retry} />
      {result && result.total > result.pageSize && (
        <nav
          aria-label="Páginas de mis rutas"
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            marginTop: "1rem",
          }}
        >
          <button
            type="button"
            disabled={result.page <= 1}
            onClick={() => changePage(page - 1)}
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <span>
            Página {result.page} de {Math.ceil(result.total / result.pageSize)}
          </span>
          <button
            type="button"
            disabled={result.page * result.pageSize >= result.total}
            onClick={() => changePage(page + 1)}
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </>
  )
}
