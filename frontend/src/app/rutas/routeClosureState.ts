import type { DeliveryManifestPackageItem, DeliveryManifestResult } from "../mi-ruta/deliveriesApi"
import {
  RouteClosureMode,
  RouteState,
  type CloseRouteCommandInput,
  type CloseRouteResult,
  type DepotReceiptInput,
  type RouteDetailResult,
  type RouteSummaryResult,
} from "./routesApi"

export function filterUnreceivedActivePackages(
  manifest: DeliveryManifestResult,
): readonly DeliveryManifestPackageItem[] {
  return manifest.stops.flatMap((stop) =>
    stop.packages.filter(
      (pkg) => pkg.assignmentState === "ACTIVE" && !pkg.receiptConfirmed,
    ),
  )
}

export function toggleAssignmentSelection(
  current: readonly string[],
  assignmentId: string,
): string[] {
  return current.includes(assignmentId)
    ? current.filter((id) => id !== assignmentId)
    : [...current, assignmentId]
}

export function toggleAllAssignmentsSelection(
  current: readonly string[],
  allAvailable: readonly DeliveryManifestPackageItem[],
): string[] {
  if (current.length === allAvailable.length) {
    return []
  }
  return allAvailable.map((p) => p.assignmentId)
}

export interface ValidateClosureParams {
  readonly mode: RouteClosureMode
  readonly reasonCode: string
  readonly notes: string
  readonly actualDistanceKm: string
  readonly depotId: string
  readonly physicalReceiptConfirmed: boolean
  readonly selectedAssignmentIds: readonly string[]
}

export type ValidateClosureResult =
  | { readonly success: true; readonly command: CloseRouteCommandInput }
  | { readonly success: false; readonly error: string }

export function validateClosureInput(
  params: ValidateClosureParams,
): ValidateClosureResult {
  if (params.mode === RouteClosureMode.FORCED) {
    if (!params.reasonCode.trim()) {
      return {
        success: false,
        error: "Debe seleccionar un motivo para el cierre forzado.",
      }
    }
    if (!params.notes.trim()) {
      return {
        success: false,
        error: "Las observaciones son obligatorias para el cierre forzado.",
      }
    }
  }

  let actualDistanceM: number | undefined
  const trimmedDistance = params.actualDistanceKm.trim()
  if (trimmedDistance) {
    const parsed = Number(trimmedDistance)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return {
        success: false,
        error: "La distancia real debe ser un número positivo finito.",
      }
    }
    actualDistanceM = Math.round(parsed * 1000)
  }

  let depotReceipt: DepotReceiptInput | undefined
  if (params.selectedAssignmentIds.length > 0) {
    if (!params.depotId.trim()) {
      return {
        success: false,
        error: "Debe especificar el identificador de depósito para la recepción.",
      }
    }
    depotReceipt = {
      depotId: params.depotId.trim(),
      physicalReceiptConfirmed: params.physicalReceiptConfirmed,
      assignmentIds: [...params.selectedAssignmentIds],
    }
  }

  return {
    success: true,
    command: {
      mode: params.mode,
      ...(params.reasonCode.trim()
        ? { reasonCode: params.reasonCode.trim() }
        : {}),
      ...(params.notes.trim() ? { notes: params.notes.trim() } : {}),
      ...(actualDistanceM !== undefined ? { actualDistanceM } : {}),
      ...(depotReceipt ? { depotReceipt } : {}),
    },
  }
}

export interface RouteDetailClosureState {
  readonly route: RouteDetailResult | null
  readonly closureConfirmed: boolean
  readonly refreshError: string | null
  readonly summary: RouteSummaryResult | null
  readonly actionFeedback: {
    readonly kind: "success" | "error"
    readonly message: string
  } | null
}

export function handleClosureSuccessState(
  currentState: RouteDetailClosureState,
  result: CloseRouteResult,
): RouteDetailClosureState {
  return {
    ...currentState,
    closureConfirmed: true,
    refreshError: null,
    route: currentState.route
      ? { ...currentState.route, state: RouteState.COMPLETED }
      : null,
    summary: result.summary ?? currentState.summary,
    actionFeedback: {
      kind: "success",
      message: "Ruta finalizada y cerrada con éxito (COMPLETED).",
    },
  }
}

export function handleRefreshFailureState(
  currentState: RouteDetailClosureState,
  errorMessage: string,
): RouteDetailClosureState {
  return {
    ...currentState,
    refreshError: errorMessage,
  }
}
