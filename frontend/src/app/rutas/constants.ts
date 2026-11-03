import type { RouteState, RouteStopState } from "./routesApi"

export const ROUTE_STATUS_LABELS: Record<RouteState, string> = {
  DRAFT: "Borrador",
  PLANNING: "Planificando",
  PLANNED: "Planificada",
  READY: "Lista",
  IN_PROGRESS: "En ejecución",
  COMPLETED: "Completada",
  PLANNING_FAILED: "Planificación fallida",
  INTERRUPTED: "Interrumpida",
  CANCELLED: "Cancelada",
}

export const ROUTE_STATUS_COLOR: Record<RouteState, string> = {
  DRAFT: "status--pending",
  PLANNING: "status--pending",
  PLANNED: "status--active",
  READY: "status--pending",
  IN_PROGRESS: "status--active",
  COMPLETED: "status--success",
  PLANNING_FAILED: "status--danger",
  INTERRUPTED: "status--danger",
  CANCELLED: "status--danger",
}

type LegacyStopStatus = "pending" | "delivered" | "failed" | "skipped"

export const STOP_LABEL: Record<RouteStopState | LegacyStopStatus, string> = {
  PENDING: "Pendiente",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  pending: "Pendiente",
  delivered: "Entregado",
  failed: "Fallido",
  skipped: "Omitido",
}

export const STOP_COLOR: Record<RouteStopState | LegacyStopStatus, string> = {
  PENDING: "status--active",
  COMPLETED: "status--success",
  FAILED: "status--danger",
  pending: "status--active",
  delivered: "status--success",
  failed: "status--danger",
  skipped: "status--pending",
}

export function formatShortEntityId(id: string): string {
  const trimmed = id.trim()
  if (trimmed.length <= 8) {
    return trimmed.toUpperCase()
  }
  return `#${trimmed.slice(0, 8).toUpperCase()}`
}

export function formatPlannedDate(isoDate?: string | null): string {
  if (!isoDate) {
    return "Sin fecha"
  }
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) {
    return "Sin fecha"
  }
  return parsed.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
