import { apiFetch, ApiError } from "../../../shared/api/httpClient"

export type CourierStatus = "ACTIVE" | "INACTIVE"
export const COURIER_STATUS_LABELS = { ACTIVE: "Activo", INACTIVE: "Inactivo" }
export const ACCOUNT_STATUS_LABELS = {
  ACTIVE: "Activa",
  INACTIVE: "Inactiva",
  SUSPENDED: "Suspendida",
}
export interface EligibleUser {
  id: string
  email: string
  status: keyof typeof ACCOUNT_STATUS_LABELS
}
export interface Courier {
  id: string
  tenantId: string
  userId: string
  email: string
  status: CourierStatus
  userStatus: EligibleUser["status"]
  activeAssignmentCount: number
  activeRouteIds: string[]
  isCommitted: boolean
}
export interface CourierQuery {
  page: number
  pageSize: number
  search?: string
  status?: CourierStatus
}
export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const status = (value: unknown): value is CourierStatus =>
  value === "ACTIVE" || value === "INACTIVE"
const account = (value: unknown): value is EligibleUser["status"] =>
  status(value) || value === "SUSPENDED"
const user = (value: unknown): value is EligibleUser =>
  record(value) &&
  typeof value.id === "string" &&
  typeof value.email === "string" &&
  account(value.status)
function courier(value: unknown): value is Courier {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.tenantId === "string" &&
    typeof value.userId === "string" &&
    typeof value.email === "string" &&
    status(value.status) &&
    account(value.userStatus) &&
    typeof value.isCommitted === "boolean" &&
    typeof value.activeAssignmentCount === "number" &&
    Number.isSafeInteger(value.activeAssignmentCount) &&
    value.activeAssignmentCount >= 0 &&
    Array.isArray(value.activeRouteIds) &&
    value.activeRouteIds.every((id) => typeof id === "string")
  )
}
function params(query: CourierQuery) {
  const result = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  })
  if (query.search?.trim()) result.set("search", query.search.trim())
  if (query.status) result.set("status", query.status)
  return result
}
function page<T>(
  value: unknown,
  query: CourierQuery,
  valid: (item: unknown) => item is T,
): Page<T> {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(valid) ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0 ||
    value.page !== query.page ||
    value.pageSize !== query.pageSize
  )
    throw new Error("La respuesta del listado de mensajeros no es válida.")
  return value as unknown as Page<T>
}
export async function listCouriers(query: CourierQuery) {
  return page(
    await apiFetch<unknown>(`/couriers?${params(query)}`),
    query,
    courier,
  )
}
export async function eligibleUsers(query: CourierQuery) {
  return page(
    await apiFetch<unknown>(`/couriers/eligible-users?${params(query)}`),
    query,
    user,
  )
}
function detail(value: unknown): Courier {
  if (!courier(value))
    throw new Error("La respuesta del detalle de mensajero no es válida.")
  return value
}
export async function getCourier(id: string) {
  return detail(await apiFetch<unknown>(`/couriers/${encodeURIComponent(id)}`))
}
export async function changeCourierStatus(id: string, value: CourierStatus) {
  return detail(
    await apiFetch<unknown>(`/couriers/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: value }),
    }),
  )
}
export async function createCourier(userId: string): Promise<{ id: string }> {
  const value = await apiFetch<unknown>("/couriers", {
    method: "POST",
    body: JSON.stringify({ userId }),
  })
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    value.userId !== userId ||
    !status(value.status)
  )
    throw new Error("La respuesta del registro de mensajero no es válida.")
  return { id: value.id }
}
export function courierError(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      COURIER_COMMITTED:
        "No se puede inactivar: tiene rutas sin cerrar o asignaciones activas.",
      COURIER_USER_NOT_ELIGIBLE: "La cuenta de usuario debe estar activa.",
      COURIER_USER_ALREADY_LINKED:
        "Este usuario ya está vinculado a un mensajero. Actualiza los candidatos.",
      COURIER_NOT_FOUND: "No se encontró el mensajero.",
      COURIER_USER_NOT_FOUND: "No se encontró el usuario seleccionado.",
      COURIER_CONCURRENCY_CONFLICT:
        "El recurso cambió durante la operación. Actualiza e inténtalo de nuevo.",
    }
    if (error.status === 403)
      return "No tienes permiso para administrar mensajeros."
    if (messages[error.code]) return messages[error.code]
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación."
}
