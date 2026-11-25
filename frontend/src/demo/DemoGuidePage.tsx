import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Package,
  RefreshCw,
  Route,
  ShieldCheck,
  Truck,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"

import { useAuth } from "../auth"
import {
  listPackages,
  type PackageListItemResponse,
} from "../app/paquetes/api/packagesApi"
import {
  listRoutes,
  type RouteSummaryItemResult,
} from "../app/rutas/routesApi"
import { ApiError } from "../shared/api/httpClient"

interface DemoSnapshot {
  readonly tenantId: string
  readonly packages: readonly PackageListItemResponse[]
  readonly routes: readonly RouteSummaryItemResult[]
  readonly routeTotal: number
}

interface DemoStep {
  readonly title: string
  readonly description: string
  readonly to: string
  readonly permission: string
  readonly action: string
}

const DEMO_STEPS: readonly DemoStep[] = [
  {
    title: "Revisa los paquetes registrados",
    description:
      "Consulta las guías que ya existen en el tenant. Si el entorno fue preparado para la demo, aquí aparecerán los paquetes iniciales.",
    to: "/app/paquetes",
    permission: "COORDINATE_ROUTES",
    action: "Ver paquetes",
  },
  {
    title: "Clasifica los envíos",
    description:
      "Asigna zona y sector a los paquetes registrados para dejarlos listos para planificación.",
    to: "/app/clasificacion",
    permission: "CLASSIFY_PACKAGES",
    action: "Abrir clasificación",
  },
  {
    title: "Planifica y asigna una ruta",
    description:
      "Elige paquetes clasificados y deja que el backend valide coordenadas, recursos y capacidades antes de crear la ruta.",
    to: "/app/planificacion",
    permission: "COORDINATE_ROUTES",
    action: "Ir a planificación",
  },
  {
    title: "Resuelve paquetes pendientes",
    description:
      "Si algún envío no pudo asignarse, revisa el motivo y recupéralo manualmente. Un pendiente es un resultado operativo válido.",
    to: "/app/pendientes",
    permission: "COORDINATE_ROUTES",
    action: "Revisar pendientes",
  },
  {
    title: "Revisa y prepara la ruta",
    description:
      "Verifica paradas y recursos en el detalle de la ruta. Al prepararla, el manifiesto queda listo para ejecución.",
    to: "/app/rutas",
    permission: "COORDINATE_ROUTES",
    action: "Ver rutas",
  },
  {
    title: "Consulta la ruta del mensajero",
    description:
      "Cambia a una cuenta con permiso de operación para consultar la ruta preparada e iniciar su recorrido.",
    to: "/app/mi-ruta",
    permission: "OPERATE_DELIVERIES",
    action: "Abrir mi ruta",
  },
]

function connectionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return "No se pudo conectar con la API. Comprueba que el backend esté iniciado y vuelve a intentar."
    }
    if (error.status === 401) {
      return "El backend no reconoce esta sesión. Inicia sesión con una cuenta real del tenant; el acceso demo local no consulta la API."
    }
    if (error.status === 403) {
      return "La cuenta no tiene permisos para consultar paquetes y rutas de este tenant."
    }
    return error.message
  }

  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado al consultar los datos de la demo."
}

function formatPackageStateCount(
  packages: readonly PackageListItemResponse[],
  state: string,
): number {
  return packages.filter((item) => item.state === state).length
}

export function DemoGuidePage() {
  const { user, initializing, hasPermission } = useAuth()
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const tenantId =
    user?.kind === "TENANT_USER" && hasPermission("COORDINATE_ROUTES")
      ? user.tenantId
      : null
  const canReadOperations = tenantId !== null

  useEffect(() => {
    if (initializing || !tenantId) return
    let active = true

    void Promise.resolve()
      .then(() => {
        if (!active) return null
        setLoading(true)
        setError(null)
        return Promise.all([
          listPackages(),
          listRoutes({ page: 1, pageSize: 100 }),
        ])
      })
      .then((result) => {
        if (!active || !result) return
        const [packages, routes] = result
        setSnapshot({
          tenantId,
          packages,
          routes: routes.items,
          routeTotal: routes.total,
        })
      })
      .catch((requestError: unknown) => {
        if (!active) return
        setSnapshot(null)
        setError(connectionErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [initializing, refreshKey, tenantId])

  const visibleSnapshot =
    snapshot?.tenantId === user?.tenantId ? snapshot : null
  const registeredCount = visibleSnapshot
    ? formatPackageStateCount(visibleSnapshot.packages, "REGISTERED")
    : null
  const pendingCount = visibleSnapshot
    ? formatPackageStateCount(visibleSnapshot.packages, "PENDING_ASSIGNMENT")
    : null
  const plannedCount =
    visibleSnapshot?.routes.filter((route) => route.state === "PLANNED").length ??
    null
  const needsBackendLogin =
    error?.startsWith("El backend no reconoce esta sesión.") ?? false

  return (
    <main className="demo-guide">
      <header className="demo-guide__header">
        <Link className="brand" to="/" aria-label="SLS, inicio">
          <span className="brand-mark" aria-hidden="true">
            <Route size={22} strokeWidth={2.4} />
          </span>
          <span className="brand-name">SLS</span>
        </Link>
        <nav aria-label="Navegación de la demo">
          <Link to="/">Inicio</Link>
          {user ? (
            <Link to="/app/planificacion">Portal operativo</Link>
          ) : (
            <Link className="demo-guide__login" to="/login">
              Iniciar sesión <ArrowRight size={16} />
            </Link>
          )}
        </nav>
      </header>

      <div className="demo-guide__content">
        <section className="demo-guide__intro" aria-labelledby="demo-title">
          <div>
            <h1 id="demo-title">De un paquete a una ruta lista para salir.</h1>
            <p>
              Sigue el recorrido operativo de SLS paso a paso. Cada acción abre
              una pantalla conectada al backend y conserva los datos reales de
              tu empresa.
            </p>
            <div className="demo-guide__notice">
              <ShieldCheck size={19} aria-hidden="true" />
              <span>
                Este recorrido solo consulta el estado de la operación. No crea
                ni elimina datos.
              </span>
            </div>
          </div>

          <aside className="demo-guide__connection" aria-live="polite">
            <div className="demo-guide__connection-heading">
              <div>
                <span className="demo-guide__connection-label">
                  Estado de la operación
                </span>
                <h2>
                  {initializing
                    ? "Verificando sesión"
                    : loading && canReadOperations
                      ? "Consultando backend"
                    : visibleSnapshot
                        ? "Backend conectado"
                        : error
                          ? "No se pudo conectar"
                          : user
                            ? "Permiso de coordinación requerido"
                            : "Inicia sesión para comenzar"}
                </h2>
              </div>
              {loading || initializing ? (
                <Loader2 className="demo-guide__spin" size={21} />
              ) : error ? (
                <AlertCircle size={21} aria-hidden="true" />
              ) : visibleSnapshot ? (
                <CheckCircle2 size={21} aria-hidden="true" />
              ) : (
                <Route size={21} aria-hidden="true" />
              )}
            </div>

            {visibleSnapshot ? (
              <>
                <p className="demo-guide__tenant">
                  Datos del tenant <strong>{user?.tenant}</strong>
                </p>
                <dl className="demo-guide__metrics">
                  <div>
                    <dt>Por clasificar</dt>
                    <dd>{registeredCount}</dd>
                  </div>
                  <div>
                    <dt>Pendientes</dt>
                    <dd>{pendingCount}</dd>
                  </div>
                  <div>
                    <dt>Rutas planificadas</dt>
                    <dd>{plannedCount}</dd>
                  </div>
                  <div>
                    <dt>Rutas totales</dt>
                    <dd>{visibleSnapshot.routeTotal}</dd>
                  </div>
                </dl>
                <button
                  className="demo-guide__refresh"
                  type="button"
                  onClick={() => setRefreshKey((current) => current + 1)}
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  Actualizar datos
                </button>
              </>
            ) : error ? (
              <>
                <p className="demo-guide__connection-copy">{error}</p>
                <button
                  className="demo-guide__refresh"
                  type="button"
                  onClick={() => setRefreshKey((current) => current + 1)}
                  disabled={loading || !canReadOperations}
                >
                  <RefreshCw size={15} />
                  Reintentar consulta
                </button>
                {needsBackendLogin && (
                  <Link className="demo-guide__refresh" to="/login">
                    Iniciar sesión con una cuenta real
                    <ArrowRight size={15} />
                  </Link>
                )}
              </>
            ) : (
              <p className="demo-guide__connection-copy">
                {user
                  ? "Con esta cuenta puedes explorar la guía, pero necesitas permisos de coordinación para ver los datos del backend."
                  : "Usa una sesión autenticada del tenant para consultar los paquetes y las rutas reales."}
              </p>
            )}
          </aside>
        </section>

        <section
          className="demo-guide__journey"
          aria-labelledby="journey-title"
        >
          <div className="demo-guide__journey-heading">
            <div>
              <h2 id="journey-title">Recorrido del coordinador</h2>
              <p>
                Sigue el orden para preparar una ruta. Puedes saltar a
                cualquier etapa si ya tienes datos listos.
              </p>
            </div>
            {canReadOperations && visibleSnapshot && (
              <span className="demo-guide__live">
                <span aria-hidden="true" />
                Datos en vivo
              </span>
            )}
          </div>

          <ol className="demo-guide__steps">
            {DEMO_STEPS.map((step, index) => {
              const allowed =
                user?.kind === "TENANT_USER" &&
                hasPermission(step.permission)
              const destination = user
                ? allowed
                  ? step.to
                  : "/login"
                : "/login"

              return (
                <li className="demo-guide__step" key={step.to}>
                  <span className="demo-guide__step-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="demo-guide__step-content">
                    <div className="demo-guide__step-copy">
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                      {index === 3 && pendingCount !== null && (
                        <span className="demo-guide__step-data">
                          {pendingCount} paquete
                          {pendingCount === 1 ? "" : "s"} pendiente
                          {pendingCount === 1 ? "" : "s"} en el tenant
                        </span>
                      )}
                      {index === 4 && plannedCount !== null && (
                        <span className="demo-guide__step-data">
                          {plannedCount} ruta
                          {plannedCount === 1 ? "" : "s"} por revisar
                        </span>
                      )}
                    </div>
                    {user && !allowed ? (
                      <Link
                        className="demo-guide__step-link demo-guide__step-link--muted"
                        to={destination}
                        aria-label={`${step.action}; se requiere cambiar de cuenta`}
                      >
                        Cambiar de cuenta <ArrowRight size={16} />
                      </Link>
                    ) : (
                      <Link className="demo-guide__step-link" to={destination}>
                        {user ? step.action : "Inicia sesión"}
                        <ArrowRight size={16} />
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="demo-guide__boundary" aria-labelledby="boundary-title">
          <div className="demo-guide__boundary-icon" aria-hidden="true">
            <ClipboardCheck size={21} />
          </div>
          <div>
            <h2 id="boundary-title">Dónde termina el recorrido web actual</h2>
            <p>
              La ruta puede consultarse e iniciarse desde la interfaz. El
              registro del resultado de una parada, las evidencias y el cierre
              todavía no están integrados en la web; no se simulan en esta demo.
            </p>
          </div>
          <ArrowDownRight className="demo-guide__boundary-arrow" size={22} />
        </section>

        <footer className="demo-guide__footer">
          <span>
            <Package size={16} /> Paquetes
          </span>
          <span aria-hidden="true">→</span>
          <span>
            <Route size={16} /> Planificación
          </span>
          <span aria-hidden="true">→</span>
          <span>
            <Truck size={16} /> Ruta preparada
          </span>
        </footer>
      </div>
    </main>
  )
}
