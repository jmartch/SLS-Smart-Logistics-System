import { ApiError } from "../../../../shared/api/httpClient"
import {
  getDeliveryManifest,
  type DeliveryManifestResult,
  type DeliveryManifestStop,
} from "../../deliveriesApi"
import {
  getRouteDetail,
  type RouteDetailResult,
  type RouteDetailStopResult,
} from "../../../rutas/routesApi"

function isValidUuid(value: string | null | undefined): boolean {
  if (!value) return false
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(value.trim())
}

export type StopPageState = {
  readonly kind: "loading"
} | {
  readonly kind: "invalid_params"
  readonly message: string
} | {
  readonly kind: "not_found"
  readonly message: string
  readonly routeId?: string
} | {
  readonly kind: "error"
  readonly status: number
  readonly title: string
  readonly message: string
  readonly routeId?: string
} | {
  readonly kind: "ready"
  readonly route: RouteDetailResult
  readonly stop: DeliveryManifestStop
  readonly manifest: DeliveryManifestResult
  readonly stopDetail?: RouteDetailStopResult
  readonly isAttended: boolean
  readonly canExecute: boolean
  readonly routeInProgress: boolean
}

export async function loadStopPageState(
  routeId: string | null | undefined,
  stopId: string | null | undefined,
  userPermissions: readonly string[],
): Promise<StopPageState> {
  const normalizedRouteId = routeId?.trim() ?? ""
  const normalizedStopId = stopId?.trim() ?? ""

  if (!normalizedRouteId || !normalizedStopId) {
    return {
      kind: "invalid_params",
      message:
        "Faltan parámetros obligatorios. Debe especificar la parada y la ruta (?routeId=...).",
    }
  }

  if (!isValidUuid(normalizedRouteId) || !isValidUuid(normalizedStopId)) {
    return {
      kind: "invalid_params",
      message: "Los identificadores de ruta y parada deben ser UUIDs válidos.",
    }
  }

  try {
    const [manifest, route] = await Promise.all([
      getDeliveryManifest(normalizedRouteId, "all"),
      getRouteDetail(normalizedRouteId),
    ])

    const stop = manifest.stops.find((s) => s.stopId === normalizedStopId)
    if (!stop) {
      return {
        kind: "not_found",
        message:
          "La parada solicitada no pertenece al manifiesto de esta ruta o no existe.",
        routeId: normalizedRouteId,
      }
    }

    const stopDetail = route.stops.find((s) => s.id === normalizedStopId)

    const isAttended =
      stop.state === "COMPLETED" ||
      stop.state === "FAILED" ||
      stop.packages.some(
        (pkg) =>
          pkg.state === "OUT_FOR_DELIVERY" ||
          pkg.state === "DELIVERED" ||
          pkg.state === "DELIVERY_FAILED",
      )

    const canExecute =
      userPermissions.includes("OPERATE_DELIVERIES") ||
      userPermissions.includes("COORDINATE_ROUTES")

    const routeInProgress = route.state === "IN_PROGRESS"

    return {
      kind: "ready",
      route,
      stop,
      manifest,
      stopDetail,
      isAttended,
      canExecute,
      routeInProgress,
    }
  } catch (err: unknown) {
    const status = err instanceof ApiError ? err.status : 0
    if (status === 401) {
      return {
        kind: "error",
        status,
        title: "Sesión no válida",
        message:
          "Tu sesión expiró o no está autenticada. Inicia sesión nuevamente.",
        routeId: normalizedRouteId,
      }
    }
    if (status === 403) {
      return {
        kind: "error",
        status,
        title: "Acceso denegado",
        message: "No tienes permiso para consultar el manifiesto de esta ruta.",
        routeId: normalizedRouteId,
      }
    }
    if (status === 404) {
      return {
        kind: "not_found",
        message: "La ruta solicitada no fue encontrada en el sistema.",
        routeId: normalizedRouteId,
      }
    }

    return {
      kind: "error",
      status,
      title: "Error al cargar la parada",
      message:
        err instanceof Error
          ? err.message
          : "No fue posible consultar la información de la parada.",
      routeId: normalizedRouteId,
    }
  }
}
