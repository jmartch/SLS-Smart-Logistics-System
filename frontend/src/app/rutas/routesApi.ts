import { apiFetch } from "../../shared/api/httpClient"
import type { RouteMapStop } from "./RouteMap"

function isValidGeoCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

export const RouteState = {
  DRAFT: "DRAFT",
  PLANNING: "PLANNING",
  PLANNED: "PLANNED",
  READY: "READY",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  PLANNING_FAILED: "PLANNING_FAILED",
  INTERRUPTED: "INTERRUPTED",
  CANCELLED: "CANCELLED",
} as const

export type RouteState = (typeof RouteState)[keyof typeof RouteState]

export const RouteStopState = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const

export type RouteStopState =
  (typeof RouteStopState)[keyof typeof RouteStopState]

export function isRouteState(value: unknown): value is RouteState {
  return (
    typeof value === "string" &&
    Object.values(RouteState).includes(value as RouteState)
  )
}

export function isRouteStopState(value: unknown): value is RouteStopState {
  return (
    typeof value === "string" &&
    Object.values(RouteStopState).includes(value as RouteStopState)
  )
}

export interface RouteExecutionContext {
  readonly tenantId: string
  readonly actorUserId: string
  readonly correlationId: string
}

export interface PrepareRouteCommand extends RouteExecutionContext {
  readonly routeId: string
  readonly depotConfirmed: boolean
}

export interface StartRouteCommand extends RouteExecutionContext {
  readonly routeId: string
}

export interface CancelRouteCommand extends RouteExecutionContext {
  readonly routeId: string
  readonly reasonCode: string
  readonly reason?: string
}

export interface InterruptRouteCommand extends RouteExecutionContext {
  readonly routeId: string
  readonly reasonCode: string
  readonly reason?: string
}

export interface GetRouteDetailQuery extends RouteExecutionContext {
  readonly routeId: string
}

export interface ListRoutesQuery extends RouteExecutionContext {
  readonly page?: number
  readonly pageSize?: number
  readonly from?: string
  readonly to?: string
  readonly zoneId?: string
  readonly state?: RouteState
  readonly courierId?: string
}

export type ListRoutesParams = Omit<ListRoutesQuery, keyof RouteExecutionContext>

export interface RouteOperationResult {
  readonly routeId: string
  readonly state: RouteState
  readonly updatedPackagesCount: number
  readonly correlationId: string
  readonly startedAt?: string | null
}

export interface RouteDetailStopResult {
  readonly id: string
  readonly stopNumber: number
  readonly latitude: number
  readonly longitude: number
  readonly state: RouteStopState
  readonly packageId?: string | null
  readonly trackingCode?: string | null
  readonly address?: string | null
}

export interface RouteDetailResult {
  readonly id: string
  readonly tenantId: string
  readonly state: RouteState
  readonly vehicleId: string
  readonly courierId: string
  readonly depotId?: string | null
  readonly plannedStartAt?: string | null
  readonly plannedEndAt?: string | null
  readonly startedAt?: string | null
  readonly completedAt?: string | null
  readonly vehiclePlate?: string | null
  readonly courierEmail?: string | null
  readonly depotName?: string | null
  readonly zoneId?: string | null
  readonly zoneName?: string | null
  readonly stops: readonly RouteDetailStopResult[]
}

export interface RouteSummaryItemResult {
  readonly id: string
  readonly tenantId: string
  readonly state: RouteState
  readonly vehicleId: string
  readonly courierId: string
  readonly depotId?: string | null
  readonly zoneId?: string | null
  readonly plannedStartAt?: string | null
  readonly plannedEndAt?: string | null
  readonly startedAt?: string | null
  readonly completedAt?: string | null
  readonly stopCount: number
  readonly vehiclePlate?: string | null
  readonly courierEmail?: string | null
  readonly depotName?: string | null
  readonly zoneName?: string | null
}

export interface PaginatedRoutesResult {
  readonly items: readonly RouteSummaryItemResult[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string"
}

function validateRouteSummaryItem(raw: unknown): RouteSummaryItemResult {
  if (!isRecord(raw)) {
    throw new Error("Elemento de ruta inválido en la respuesta del servidor.")
  }

  const {
    id,
    tenantId,
    state,
    vehicleId,
    courierId,
    depotId,
    zoneId,
    plannedStartAt,
    plannedEndAt,
    startedAt,
    completedAt,
    stopCount,
    vehiclePlate,
    courierEmail,
    depotName,
    zoneName,
  } = raw

  if (
    typeof id !== "string" ||
    typeof tenantId !== "string" ||
    !isRouteState(state) ||
    typeof vehicleId !== "string" ||
    typeof courierId !== "string" ||
    !isNullableString(depotId) ||
    !isNullableString(zoneId) ||
    !isNullableString(plannedStartAt) ||
    !isNullableString(plannedEndAt) ||
    !isNullableString(startedAt) ||
    !isNullableString(completedAt) ||
    !isNullableString(vehiclePlate) ||
    !isNullableString(courierEmail) ||
    !isNullableString(depotName) ||
    !isNullableString(zoneName) ||
    typeof stopCount !== "number" ||
    !Number.isFinite(stopCount)
  ) {
    throw new Error("El resumen de ruta recibido no cumple el contrato esperado.")
  }

  return {
    id,
    tenantId,
    state,
    vehicleId,
    courierId,
    depotId: depotId ?? null,
    zoneId: zoneId ?? null,
    plannedStartAt: plannedStartAt ?? null,
    plannedEndAt: plannedEndAt ?? null,
    startedAt: startedAt ?? null,
    completedAt: completedAt ?? null,
    stopCount,
    vehiclePlate: vehiclePlate ?? null,
    courierEmail: courierEmail ?? null,
    depotName: depotName ?? null,
    zoneName: zoneName ?? null,
  }
}

function validateRouteDetailStop(raw: unknown): RouteDetailStopResult {
  if (!isRecord(raw)) {
    throw new Error("Parada de ruta inválida en la respuesta del servidor.")
  }

  const { id, stopNumber, latitude, longitude, state, packageId, trackingCode, address } = raw

  if (
    typeof id !== "string" ||
    typeof stopNumber !== "number" ||
    !Number.isFinite(stopNumber) ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    !isRouteStopState(state) ||
    !isNullableString(packageId) ||
    !isNullableString(trackingCode) ||
    !isNullableString(address)
  ) {
    throw new Error("Una parada recibida no cumple el contrato esperado.")
  }

  return {
    id,
    stopNumber,
    latitude,
    longitude,
    state,
    packageId: packageId ?? null,
    trackingCode: trackingCode ?? null,
    address: address ?? null,
  }
}

function validatePaginatedRoutesResult(raw: unknown): PaginatedRoutesResult {
  if (!isRecord(raw)) {
    throw new Error("La respuesta de listado de rutas no es un objeto válido.")
  }

  const { items, page, pageSize, total } = raw

  if (
    !Array.isArray(items) ||
    typeof page !== "number" ||
    !Number.isFinite(page) ||
    typeof pageSize !== "number" ||
    !Number.isFinite(pageSize) ||
    typeof total !== "number" ||
    !Number.isFinite(total)
  ) {
    throw new Error("La respuesta paginada de rutas no tiene la estructura esperada.")
  }

  return {
    items: items.map(validateRouteSummaryItem),
    page,
    pageSize,
    total,
  }
}

function validateRouteDetailResult(raw: unknown): RouteDetailResult {
  if (!isRecord(raw)) {
    throw new Error("La respuesta de detalle de ruta no es un objeto válido.")
  }

  const {
    id,
    tenantId,
    state,
    vehicleId,
    courierId,
    depotId,
    plannedStartAt,
    plannedEndAt,
    startedAt,
    completedAt,
    stops,
    vehiclePlate,
    courierEmail,
    depotName,
    zoneId,
    zoneName,
  } = raw

  if (
    typeof id !== "string" ||
    typeof tenantId !== "string" ||
    !isRouteState(state) ||
    typeof vehicleId !== "string" ||
    typeof courierId !== "string" ||
    !isNullableString(depotId) ||
    !isNullableString(plannedStartAt) ||
    !isNullableString(plannedEndAt) ||
    !isNullableString(startedAt) ||
    !isNullableString(completedAt) ||
    !isNullableString(vehiclePlate) ||
    !isNullableString(courierEmail) ||
    !isNullableString(depotName) ||
    !isNullableString(zoneId) ||
    !isNullableString(zoneName) ||
    !Array.isArray(stops)
  ) {
    throw new Error("El detalle de ruta recibido no cumple el contrato esperado.")
  }

  return {
    id,
    tenantId,
    state,
    vehicleId,
    courierId,
    depotId: depotId ?? null,
    plannedStartAt: plannedStartAt ?? null,
    plannedEndAt: plannedEndAt ?? null,
    startedAt: startedAt ?? null,
    completedAt: completedAt ?? null,
    stops: stops.map(validateRouteDetailStop),
    vehiclePlate: vehiclePlate ?? null,
    courierEmail: courierEmail ?? null,
    depotName: depotName ?? null,
    zoneId: zoneId ?? null,
    zoneName: zoneName ?? null,
  }
}

export async function listRoutes(
  params: ListRoutesParams = {},
): Promise<PaginatedRoutesResult> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })

  if (params.from) query.set("from", params.from)
  if (params.to) query.set("to", params.to)
  if (params.zoneId) query.set("zoneId", params.zoneId)
  if (params.state) query.set("state", params.state)
  if (params.courierId) query.set("courierId", params.courierId)

  const payload = await apiFetch<unknown>(`/routes?${query.toString()}`, {
    method: "GET",
  })

  return validatePaginatedRoutesResult(payload)
}

export async function getRouteDetail(
  routeId: string,
): Promise<RouteDetailResult> {
  const normalizedId = routeId.trim()
  if (!normalizedId) {
    throw new Error("El identificador de la ruta es obligatorio.")
  }

  const payload = await apiFetch<unknown>(
    `/routes/${encodeURIComponent(normalizedId)}`,
    {
      method: "GET",
    },
  )

  return validateRouteDetailResult(payload)
}

export function mapRouteDetailStopsToMapStops(
  stops: readonly RouteDetailStopResult[],
): RouteMapStop[] {
  return stops
    .filter((stop) => isValidGeoCoordinate(stop.latitude, stop.longitude))
    .map((stop) => ({
      id: stop.id,
      stopNumber: stop.stopNumber,
      latitude: stop.latitude,
      longitude: stop.longitude,
      state: stop.state,
      ...(stop.trackingCode ? { label: `Guía ${stop.trackingCode}`, trackingCode: stop.trackingCode } : {}),
      ...(stop.address ? { address: stop.address } : {}),
    }))
    .sort((a, b) => a.stopNumber - b.stopNumber)
}

export async function prepareRoute(
  routeId: string,
  depotConfirmed = true,
): Promise<RouteOperationResult> {
  return apiFetch<RouteOperationResult>(
    `/routes/${encodeURIComponent(routeId.trim())}/prepare`,
    {
      method: "POST",
      body: JSON.stringify({ depotConfirmed }),
    },
  )
}

export async function startRoute(
  routeId: string,
): Promise<RouteOperationResult> {
  return apiFetch<RouteOperationResult>(
    `/routes/${encodeURIComponent(routeId.trim())}/start`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  )
}

export async function cancelRoute(
  routeId: string,
  reasonCode: string,
  reason?: string,
): Promise<RouteOperationResult> {
  return apiFetch<RouteOperationResult>(
    `/routes/${encodeURIComponent(routeId.trim())}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ reasonCode, reason }),
    },
  )
}

export async function interruptRoute(
  routeId: string,
  reasonCode: string,
  reason?: string,
): Promise<RouteOperationResult> {
  return apiFetch<RouteOperationResult>(
    `/routes/${encodeURIComponent(routeId.trim())}/interrupt`,
    {
      method: "POST",
      body: JSON.stringify({ reasonCode, reason }),
    },
  )
}

export async function getRouteSummary(
  routeId: string,
): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>(
    `/routes/${encodeURIComponent(routeId.trim())}/summary`,
    {
      method: "GET",
    },
  )
}
