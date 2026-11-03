import {
  CheckCircle2,
  Loader2,
  PauseCircle,
  Play,
  Route,
  XCircle,
} from "lucide-react"
import { Link } from "react-router"
import {
  cancelRoute,
  interruptRoute,
  prepareRoute,
  startRoute,
  type RouteDetailResult,
} from "./routesApi"

interface RouteOperationsProps {
  readonly route: RouteDetailResult
  readonly permissions: readonly string[]
  readonly actionBusy: string | null
  readonly actionFeedback: {
    readonly kind: "success" | "error"
    readonly message: string
  } | null
  readonly runAction: (
    label: string,
    fn: () => Promise<unknown>,
    successMessage: string,
  ) => Promise<void>
}

export function RouteOperations({
  route,
  permissions,
  actionBusy,
  actionFeedback,
  runAction,
}: RouteOperationsProps) {
  const canCoordinate = permissions.includes("COORDINATE_ROUTES")
  const canExecute = canCoordinate || permissions.includes("OPERATE_DELIVERIES")
  return (
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
            Ciclo de vida · Coordinación / Ejecución
          </span>
          <h2>Acciones operativas</h2>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.6rem" }}>
        {!canCoordinate && route.state === "PLANNED" && (
          <p role="status">
            El coordinador debe preparar esta ruta. Cuando esté lista, podrás
            iniciarla desde aquí.
          </p>
        )}
        {!canExecute && (
          <p role="status">Tienes acceso de consulta a esta ruta.</p>
        )}
        {actionFeedback && (
          <div
            role="status"
            style={{
              color:
                actionFeedback.kind === "success"
                  ? "var(--success)"
                  : "#c0392b",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            {actionFeedback.message}
          </div>
        )}

        {canCoordinate && route.state === "PLANNED" && (
          <>
            <button
              type="button"
              className="form-submit"
              disabled={Boolean(actionBusy)}
              onClick={() =>
                void runAction(
                  "prepare",
                  () => prepareRoute(route.id, true),
                  "Ruta marcada como Lista para despacho (READY). El manifiesto ha quedado congelado.",
                )
              }
              style={{ width: "100%" }}
            >
              {actionBusy === "prepare" ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              Preparar ruta (congelar manifiesto)
            </button>

            <Link
              to="/app/planificacion"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                padding: "0.65rem 1rem",
                borderRadius: "999px",
                border: "1px solid var(--border)",
                background: "var(--blue-pale)",
                color: "var(--navy)",
                fontSize: "0.78rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Route size={15} /> Replanificar / asignar paquetes
            </Link>
          </>
        )}

        {canExecute && route.state === "READY" && (
          <button
            type="button"
            className="form-submit"
            disabled={Boolean(actionBusy)}
            onClick={() =>
              void runAction(
                "start",
                () => startRoute(route.id),
                "Ruta iniciada (IN_PROGRESS).",
              )
            }
            style={{ width: "100%" }}
          >
            {actionBusy === "start" ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Play size={16} />
            )}
            Iniciar ruta
          </button>
        )}

        {canExecute && route.state === "IN_PROGRESS" && (
          <button
            type="button"
            disabled={Boolean(actionBusy)}
            onClick={() =>
              void runAction(
                "interrupt",
                () =>
                  interruptRoute(
                    route.id,
                    "OPERATIONAL_INTERRUPTION",
                    "Interrupción operativa reportada en ruta",
                  ),
                "Ruta marcada como Interrumpida (INTERRUPTED).",
              )
            }
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              padding: "0.65rem 1rem",
              borderRadius: "999px",
              border: "1px solid #d97706",
              background: "#fef3c7",
              color: "#92400e",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {actionBusy === "interrupt" ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <PauseCircle size={15} />
            )}
            Interrumpir ruta
          </button>
        )}

        {canCoordinate &&
          (route.state === "PLANNED" || route.state === "READY") && (
            <button
              type="button"
              disabled={Boolean(actionBusy)}
              onClick={() =>
                void runAction(
                  "cancel",
                  () =>
                    cancelRoute(
                      route.id,
                      "COORDINATOR_CANCELLED",
                      "Ruta cancelada por coordinación desde detalle de ruta",
                    ),
                  "Ruta cancelada (CANCELLED). Los paquetes volvieron a revisión.",
                )
              }
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                padding: "0.65rem 1rem",
                borderRadius: "999px",
                border: "1px solid #e74c3c",
                background: "white",
                color: "#c0392b",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {actionBusy === "cancel" ? (
                <Loader2 size={15} className="spin" />
              ) : (
                <XCircle size={15} />
              )}
              Cancelar ruta
            </button>
          )}
      </div>
    </div>
  )
}
