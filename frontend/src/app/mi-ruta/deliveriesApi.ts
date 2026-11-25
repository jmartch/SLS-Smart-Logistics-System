import { apiFetch } from "../../shared/api/httpClient"

export const DELIVERY_FAILURE_REASONS = [
  "RECIPIENT_ABSENT",
  "ADDRESS_NOT_FOUND",
  "RECIPIENT_REFUSED",
  "ACCESS_RESTRICTED",
  "DAMAGED_PACKAGE",
  "OTHER",
] as const

export type DeliveryFailureReason = typeof DELIVERY_FAILURE_REASONS[number]

export const DELIVERY_FAILURE_REASON_LABELS: Record<DeliveryFailureReason, string> =
  {
    RECIPIENT_ABSENT: "Destinatario ausente",
    ADDRESS_NOT_FOUND: "Dirección no encontrada",
    RECIPIENT_REFUSED: "Rechazado por el destinatario",
    ACCESS_RESTRICTED: "Acceso restringido o zona inaccesible",
    DAMAGED_PACKAGE: "Paquete con avería o dañado",
    OTHER: "Otro motivo",
  }

export function isValidDeliveryFailureReason(
  value: unknown,
): value is DeliveryFailureReason {
  return (
    typeof value === "string" &&
    DELIVERY_FAILURE_REASONS.includes(value as DeliveryFailureReason)
  )
}

export interface DeliveryManifestPackageItem {
  readonly assignmentId: string
  readonly packageId: string
  readonly trackingCode: string
  readonly state: string
  readonly assignmentState: "ACTIVE" | "ENDED"
  readonly outcome: string | null
  readonly receiptConfirmed: boolean
}

export interface DeliveryManifestStop {
  readonly stopId: string
  readonly stopNumber: number
  readonly state: string
  readonly latitude: number
  readonly longitude: number
  readonly packageIds: readonly string[]
  readonly packages: readonly DeliveryManifestPackageItem[]
}

export interface DeliveryManifestResult {
  readonly routeId: string
  readonly routeState: string
  readonly view: "all" | "pending" | "failed"
  readonly stops: readonly DeliveryManifestStop[]
}

export interface AttendRouteStopResult {
  readonly stopId: string
  readonly actualArrivalAt: string
  readonly affectedPackageIds: readonly string[]
  readonly replayed: boolean
}

export interface RecordSuccessfulDeliveryParams {
  readonly routeId: string
  readonly stopId: string
  readonly packageId: string
  readonly photo?: File | Blob | null
  readonly signature?: File | Blob | null
  readonly notes?: string
}

export interface RecordSuccessfulDeliveryResult {
  readonly attemptId: string
  readonly attemptNumber: number
  readonly outcome: "DELIVERED"
  readonly packageId: string
  readonly stopResolution: "PENDING" | "COMPLETED" | "FAILED"
  readonly evidenceIds: readonly string[]
  readonly replayed: boolean
}

export interface RecordFailedDeliveryParams {
  readonly routeId: string
  readonly stopId: string
  readonly packageId: string
  readonly reasonCode: DeliveryFailureReason
  readonly notes?: string
  readonly photo?: File | Blob | null
  readonly signature?: File | Blob | null
}

export interface RecordFailedDeliveryResult {
  readonly attemptId: string
  readonly attemptNumber: number
  readonly outcome: "FAILED"
  readonly packageId: string
  readonly reasonCode: string
  readonly stopResolution: "PENDING" | "COMPLETED" | "FAILED"
  readonly replayed: boolean
}

export interface ReportIncidentParams {
  readonly type: string
  readonly description: string
  readonly routeId?: string
  readonly routeStopId?: string
  readonly packageId?: string
}

export interface ReportIncidentResult {
  readonly incidentId: string
  readonly status: "OPEN"
  readonly type: string
  readonly replayed: boolean
}

function assertValidUuid(value: string, fieldName: string): void {
  const normalized = value.trim()
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(normalized)) {
    throw new Error(`El campo '${fieldName}' debe ser un UUID válido.`)
  }
}

export async function getDeliveryManifest(
  routeId: string,
  view?: "all" | "pending" | "failed",
): Promise<DeliveryManifestResult> {
  assertValidUuid(routeId, "routeId")
  const query = view ? `?view=${encodeURIComponent(view)}` : ""
  return apiFetch<DeliveryManifestResult>(
    `/deliveries/routes/${encodeURIComponent(routeId.trim())}/manifest${query}`,
    {
      method: "GET",
    },
  )
}

export async function attendRouteStop(
  routeId: string,
  stopId: string,
  idempotencyKey: string,
): Promise<AttendRouteStopResult> {
  assertValidUuid(routeId, "routeId")
  assertValidUuid(stopId, "stopId")
  assertValidUuid(idempotencyKey, "idempotencyKey")

  return apiFetch<AttendRouteStopResult>(
    `/deliveries/routes/${encodeURIComponent(routeId.trim())}/stops/${encodeURIComponent(stopId.trim())}/attend`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey.trim(),
      },
    },
  )
}

export async function recordSuccessfulDelivery(
  params: RecordSuccessfulDeliveryParams,
  idempotencyKey: string,
): Promise<RecordSuccessfulDeliveryResult> {
  assertValidUuid(params.routeId, "routeId")
  assertValidUuid(params.stopId, "stopId")
  assertValidUuid(params.packageId, "packageId")
  assertValidUuid(idempotencyKey, "idempotencyKey")

  if (!params.photo && !params.signature) {
    throw new Error(
      "Se requiere al menos una evidencia (foto o firma) para registrar la entrega.",
    )
  }

  const formData = new FormData()
  if (params.photo) {
    formData.append("photo", params.photo)
  }
  if (params.signature) {
    formData.append("signature", params.signature)
  }
  if (params.notes && params.notes.trim()) {
    formData.append("notes", params.notes.trim())
  }

  return apiFetch<RecordSuccessfulDeliveryResult>(
    `/deliveries/routes/${encodeURIComponent(params.routeId.trim())}/stops/${encodeURIComponent(params.stopId.trim())}/packages/${encodeURIComponent(params.packageId.trim())}/successful-attempts`,
    {
      method: "POST",
      body: formData,
      headers: {
        "Idempotency-Key": idempotencyKey.trim(),
      },
    },
  )
}

export async function recordFailedDelivery(
  params: RecordFailedDeliveryParams,
  idempotencyKey: string,
): Promise<RecordFailedDeliveryResult> {
  assertValidUuid(params.routeId, "routeId")
  assertValidUuid(params.stopId, "stopId")
  assertValidUuid(params.packageId, "packageId")
  assertValidUuid(idempotencyKey, "idempotencyKey")

  if (!isValidDeliveryFailureReason(params.reasonCode)) {
    throw new Error(
      "El motivo de fallo especificado no pertenece al catálogo válido.",
    )
  }

  if (
    params.reasonCode === "OTHER" &&
    (!params.notes || !params.notes.trim())
  ) {
    throw new Error(
      "El motivo 'Otro' requiere observaciones explicativas obligatorias.",
    )
  }

  const formData = new FormData()
  formData.append("reasonCode", params.reasonCode)
  if (params.notes && params.notes.trim()) {
    formData.append("notes", params.notes.trim())
  }
  if (params.photo) {
    formData.append("photo", params.photo)
  }
  if (params.signature) {
    formData.append("signature", params.signature)
  }

  return apiFetch<RecordFailedDeliveryResult>(
    `/deliveries/routes/${encodeURIComponent(params.routeId.trim())}/stops/${encodeURIComponent(params.stopId.trim())}/packages/${encodeURIComponent(params.packageId.trim())}/failed-attempts`,
    {
      method: "POST",
      body: formData,
      headers: {
        "Idempotency-Key": idempotencyKey.trim(),
      },
    },
  )
}

export async function reportIncident(
  params: ReportIncidentParams,
  idempotencyKey: string,
): Promise<ReportIncidentResult> {
  assertValidUuid(idempotencyKey, "idempotencyKey")

  if (!params.type || !params.type.trim()) {
    throw new Error("El tipo de incidente es obligatorio.")
  }
  if (!params.description || !params.description.trim()) {
    throw new Error("La descripción del incidente es obligatoria.")
  }

  const hasTarget = Boolean(
    params.routeId || params.routeStopId || params.packageId,
  )
  if (!hasTarget) {
    throw new Error(
      "Debe asociar el incidente al menos a una ruta, parada o paquete.",
    )
  }

  if (params.routeId) assertValidUuid(params.routeId, "routeId")
  if (params.routeStopId) assertValidUuid(params.routeStopId, "routeStopId")
  if (params.packageId) assertValidUuid(params.packageId, "packageId")

  return apiFetch<ReportIncidentResult>("/deliveries/incidents", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey.trim(),
    },
    body: JSON.stringify({
      type: params.type.trim(),
      description: params.description.trim(),
      ...(params.routeId ? { routeId: params.routeId.trim() } : {}),
      ...(params.routeStopId ? { routeStopId: params.routeStopId.trim() } : {}),
      ...(params.packageId ? { packageId: params.packageId.trim() } : {}),
    }),
  })
}
