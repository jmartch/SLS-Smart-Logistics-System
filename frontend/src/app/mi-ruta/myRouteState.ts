import { ApiError } from "../../shared/api/httpClient"
import { listRoutes, type PaginatedRoutesResult } from "../rutas/routesApi"

export type MyRoutesState = { readonly kind: "loading" } | {
  readonly kind: "success"
  readonly result: PaginatedRoutesResult
} | {
  readonly kind: "error"
  readonly status: number
  readonly title: string
  readonly message: string
}

export async function loadMyRoutes(page: number): Promise<MyRoutesState> {
  try {
    // The backend derives the courier from the authenticated user.
    // A user ID is not a courier ID and must not be supplied as that filter.
    return { kind: "success", result: await listRoutes({ page, pageSize: 20 }) }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0
    if (status === 401)
      return {
        kind: "error",
        status,
        title: "Sesión no válida",
        message:
          "Tu sesión expiró o no está autenticada. Inicia sesión para consultar tus rutas.",
      }
    if (status === 403)
      return {
        kind: "error",
        status,
        title: "Acceso denegado",
        message: "Tu cuenta no tiene permiso para consultar estas rutas.",
      }
    return {
      kind: "error",
      status,
      title: "No se pudieron cargar tus rutas",
      message:
        error instanceof Error
          ? error.message
          : "No fue posible consultar las rutas. Vuelve a intentarlo.",
    }
  }
}
