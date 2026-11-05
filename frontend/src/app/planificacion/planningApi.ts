import { apiFetch } from "../../shared/api/httpClient"

export interface PlanningWorkspaceWindow {
  readonly startAt: string
  readonly endAt: string
}

export interface PlanningWorkspaceZone {
  readonly id: string
  readonly code: string
  readonly name: string
}

export interface PlanningWorkspaceDepot {
  readonly id: string
  readonly name: string
  readonly timeZone: string
  readonly latitude: number
  readonly longitude: number
}

export interface PlanningWorkspaceDataset {
  readonly id: string
  readonly name: string
  readonly sourceType: "SYNTHETIC" | "OSM" | "LOCAL_VERIFIED"
  readonly coverage: string
  readonly readyAt: string | null
}

export interface PlanningWorkspaceVehicle {
  readonly id: string
  readonly plate: string
  readonly status: "ACTIVE"
  readonly maxWeightKg: string
  readonly maxVolumeM3: string
  readonly activeAssignedWeightKg: string
  readonly activeAssignedVolumeM3: string
  readonly remainingWeightKg: string
  readonly remainingVolumeM3: string
  readonly isActive: boolean
  readonly isOccupiedInWindow: boolean
  readonly isEligible: boolean
}

export interface PlanningWorkspaceCourier {
  readonly id: string
  readonly userId: string
  readonly email: string
  readonly status: "ACTIVE"
  readonly isActive: boolean
  readonly isOccupiedInWindow: boolean
  readonly isEligible: boolean
}

export interface PlanningWorkspacePackage {
  readonly id: string
  readonly trackingCode: string
  readonly state: "CLASSIFIED" | "PENDING_ASSIGNMENT"
  readonly priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"
  readonly zoneId: string | null
  readonly zoneName: string | null
  readonly sectorId: string | null
  readonly sectorName: string | null
  readonly address: string
  readonly weightKg: string
  readonly volumeM3: string
  readonly hasReadyCoordinates: boolean
  readonly lastPendingReasonCode?: string | null
  readonly lastStateChangedAt?: string | null
}

export interface PlanningWorkspaceEditableRoute {
  readonly id: string
  readonly state: "PLANNED"
  readonly vehicleId: string
  readonly vehiclePlate: string
  readonly courierId: string
  readonly courierEmail: string
  readonly depotId: string | null
  readonly plannedStartAt: string | null
  readonly plannedEndAt: string | null
  readonly stopCount: number
  readonly assignedPackageCount: number
  readonly assignedWeightKg: string
  readonly assignedVolumeM3: string
  readonly remainingWeightKg: string
  readonly remainingVolumeM3: string
}

export interface PlanningWorkspaceSnapshot {
  readonly tenantId: string
  readonly window: PlanningWorkspaceWindow | null
  readonly zones: readonly PlanningWorkspaceZone[]
  readonly depots: readonly PlanningWorkspaceDepot[]
  readonly datasets: readonly PlanningWorkspaceDataset[]
  readonly vehicles: readonly PlanningWorkspaceVehicle[]
  readonly couriers: readonly PlanningWorkspaceCourier[]
  readonly candidatePackages: readonly PlanningWorkspacePackage[]
  readonly editableRoutes: readonly PlanningWorkspaceEditableRoute[]
}

export type PackagePlanningOutcome = {
  readonly kind: "ASSIGNED"
  readonly packageId: string
  readonly routeId: string
  readonly routeStopId: string
  readonly assignmentId: string
} | {
  readonly kind: "PENDING_ASSIGNMENT"
  readonly packageId: string
  readonly reasonCode: string
  readonly source: "PREVALIDATION" | "CLUSTER" | "CHAIN"
  readonly sourceCode: string
  readonly rejectedBy: string | null
}

export interface PlannedRouteResult {
  readonly routeId: string
  readonly vehicleId: string
  readonly courierId: string
  readonly state: "PLANNED"
  readonly stops: readonly {
    readonly routeStopId: string
    readonly packageId: string
    readonly sequence: number
  }[]
  readonly totalDistanceMeters: number
}

export interface PlanAndAssignRoutesPayload {
  readonly requestId: string
  readonly zoneId: string
  readonly packageIds: readonly string[]
  readonly resourceSelection?: "AUTOMATIC" | "MANUAL"
  readonly vehicleIds?: readonly string[]
  readonly courierIds?: readonly string[]
  readonly depotId: string
  readonly datasetId: string
  readonly profile: "MOTOR_VEHICLE" | "MOTORCYCLE" | "BICYCLE" | "FOOT"
  readonly window: PlanningWorkspaceWindow
  readonly radiusMeters: number
  readonly ordering: "nearest-neighbor" | "nearest-neighbor-two-opt"
}

export interface PlanAndAssignRoutesResult {
  readonly requestId: string
  readonly tenantId: string
  readonly status: "COMPLETED"
  readonly replayed: boolean
  readonly routes: readonly PlannedRouteResult[]
  readonly outcomes: readonly PackagePlanningOutcome[]
}

export interface ReplanEditableRoutePayload {
  readonly packageIds?: readonly string[]
  readonly ordering?: "nearest-neighbor" | "nearest-neighbor-two-opt"
}

export interface ReplanEditableRouteResult {
  readonly routeId: string
  readonly tenantId: string
  readonly state: "PLANNED"
  readonly vehicleId: string
  readonly courierId: string
  readonly totalDistanceMeters: number
  readonly stops: readonly {
    readonly routeStopId: string
    readonly packageId: string
    readonly sequence: number
  }[]
  readonly outcomes: readonly PackagePlanningOutcome[]
}

export const PLANNING_PACKAGE_STATE_LABELS: Record<PlanningWorkspacePackage["state"], string> =
  {
    CLASSIFIED: "Clasificado",
    PENDING_ASSIGNMENT: "Pendiente de asignación",
  }

export const PLANNING_PACKAGE_STATE_COLOR: Record<PlanningWorkspacePackage["state"], string> =
  {
    CLASSIFIED: "status--active",
    PENDING_ASSIGNMENT: "status--pending",
  }

export const PENDING_REASON_LABELS: Record<string, string> = {
  NO_VEHICLE_AVAILABLE: "Sin vehículo disponible en la ventana horaria",
  NO_COURIER_AVAILABLE: "Sin mensajero disponible en la ventana horaria",
  NO_CAPACITY: "Capacidad insuficiente de peso o volumen",
  WEIGHT_CAPACITY_EXCEEDED:
    "Excede la capacidad de peso disponible del vehículo",
  VOLUME_CAPACITY_EXCEEDED:
    "Excede la capacidad de volumen disponible del vehículo",
  NO_JOINT_CAPACITY: "Excede la capacidad combinada de peso y volumen",
  CAPACITY_EXHAUSTED_BY_HEURISTIC:
    "Capacidad agotada al agrupar clústeres de la zona",
  INCOMPLETE_DATA: "Datos del paquete incompletos para planificación",
  INVALID_COORDINATES: "Coordenadas geográficas fuera de rango",
  GEOCODING_NOT_READY: "Geocodificación pendiente de validación",
  NETWORK_ATTACHMENT_NOT_READY: "Anclaje a red vial pendiente de validación",
  ZONE_NOT_SUPPORTED: "Zona no coincide con la ventana de planificación",
}

export function formatPendingReasonLabel(reasonCode?: string | null): string {
  if (!reasonCode) {
    return "Pendiente de cupo o revisión de coordinación"
  }
  return PENDING_REASON_LABELS[reasonCode] ?? reasonCode
}

export async function getPlanningWorkspace(params?: {
  readonly zoneId?: string
  readonly startAt?: string
  readonly endAt?: string
}): Promise<PlanningWorkspaceSnapshot> {
  const query = new URLSearchParams()
  if (params?.zoneId) query.set("zoneId", params.zoneId)
  if (params?.startAt) query.set("startAt", params.startAt)
  if (params?.endAt) query.set("endAt", params.endAt)
  const suffix = query.toString() ? `?${query.toString()}` : ""

  return apiFetch<PlanningWorkspaceSnapshot>(
    `/routes/planning/workspace${suffix}`,
    {
      method: "GET",
    },
  )
}

export async function planAndAssignRoutes(
  payload: PlanAndAssignRoutesPayload,
): Promise<PlanAndAssignRoutesResult> {
  return apiFetch<PlanAndAssignRoutesResult>(
    "/routes/planning/plan-and-assign",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )
}

export async function replanEditableRoute(
  routeId: string,
  payload: ReplanEditableRoutePayload,
): Promise<ReplanEditableRouteResult> {
  return apiFetch<ReplanEditableRouteResult>(
    `/routes/planning/routes/${encodeURIComponent(routeId.trim())}/replan`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )
}
