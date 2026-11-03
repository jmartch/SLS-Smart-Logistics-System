import { apiFetch } from "../../../shared/api/httpClient"

export type VehicleStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE"
export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  MAINTENANCE: "En mantenimiento",
}

export interface Vehicle {
  readonly id: string
  readonly plate: string
  readonly status: VehicleStatus
  readonly maxWeightKg: string
  readonly maxVolumeM3: string
}

export interface VehicleListItem extends Vehicle {
  readonly assignedWeightKg: string
  readonly assignedVolumeM3: string
  readonly remainingWeightKg: string
  readonly remainingVolumeM3: string
}
export interface VehicleDetail extends VehicleListItem {
  readonly isCommitted: boolean
}

export interface VehiclesPage {
  readonly items: readonly VehicleListItem[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
}

export interface VehicleListQuery {
  readonly page: number
  readonly pageSize: number
  readonly search?: string
  readonly status?: VehicleStatus
}

export interface CreateVehiclePayload {
  readonly plate: string
  readonly maxWeightKg: string
  readonly maxVolumeM3: string
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function decimal(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^-?\d+(?:\.\d+)?$/.test(value) &&
    Number.isFinite(Number(value))
  )
}

function vehicle(value: unknown): value is Vehicle {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.plate === "string" &&
    (value.status === "ACTIVE" ||
      value.status === "INACTIVE" ||
      value.status === "MAINTENANCE") &&
    decimal(value.maxWeightKg) &&
    decimal(value.maxVolumeM3)
  )
}

export async function listVehicles(
  query: VehicleListQuery,
): Promise<VehiclesPage> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  })
  if (query.search?.trim()) params.set("search", query.search.trim())
  if (query.status) params.set("status", query.status)
  const result = await apiFetch<unknown>(`/vehicles?${params}`)
  if (
    !record(result) ||
    !Array.isArray(result.items) ||
    !result.items.every(
      (item) =>
        vehicle(item) &&
        record(item) &&
        decimal(item.assignedWeightKg) &&
        decimal(item.assignedVolumeM3) &&
        decimal(item.remainingWeightKg) &&
        decimal(item.remainingVolumeM3),
    ) ||
    typeof result.total !== "number" ||
    !Number.isSafeInteger(result.total) ||
    result.total < 0 ||
    result.page !== query.page ||
    result.pageSize !== query.pageSize
  ) {
    throw new Error("La respuesta del listado de vehículos no es válida.")
  }
  return result as unknown as VehiclesPage
}

export async function createVehicle(
  payload: CreateVehiclePayload,
): Promise<Vehicle> {
  const result = await apiFetch<unknown>("/vehicles", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  if (!vehicle(result))
    throw new Error("La respuesta del registro de vehículo no es válida.")
  return result
}

function detail(value: unknown): VehicleDetail {
  if (
    !vehicle(value) ||
    !record(value) ||
    typeof value.isCommitted !== "boolean" ||
    !decimal(value.assignedWeightKg) ||
    !decimal(value.assignedVolumeM3) ||
    !decimal(value.remainingWeightKg) ||
    !decimal(value.remainingVolumeM3)
  ) {
    throw new Error("La respuesta del detalle de vehículo no es válida.")
  }
  return value as unknown as VehicleDetail
}

export async function getVehicle(vehicleId: string): Promise<VehicleDetail> {
  return detail(
    await apiFetch<unknown>(`/vehicles/${encodeURIComponent(vehicleId)}`),
  )
}

export async function updateVehicle(
  vehicleId: string,
  payload: Partial<CreateVehiclePayload>,
): Promise<VehicleDetail> {
  return detail(
    await apiFetch<unknown>(`/vehicles/${encodeURIComponent(vehicleId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  )
}

export async function changeVehicleStatus(
  vehicleId: string,
  status: VehicleStatus,
): Promise<VehicleDetail> {
  return detail(
    await apiFetch<unknown>(
      `/vehicles/${encodeURIComponent(vehicleId)}/status`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),
  )
}
