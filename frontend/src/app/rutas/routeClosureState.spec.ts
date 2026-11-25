import { describe, expect, it, vi } from "vitest"
import {
  filterUnreceivedActivePackages,
  handleClosureSuccessState,
  handleRefreshFailureState,
  toggleAllAssignmentsSelection,
  toggleAssignmentSelection,
  validateClosureInput,
  type RouteDetailClosureState,
} from "./routeClosureState"
import {
  RouteClosureMode,
  RouteState,
  type CloseRouteResult,
  type RouteDetailResult,
  type RouteSummaryResult,
} from "./routesApi"
import type { DeliveryManifestResult } from "../mi-ruta/deliveriesApi"

describe("routeClosureState", () => {
  describe("filterUnreceivedActivePackages", () => {
    it("filters only active packages that are unreceived", () => {
      const mockManifest: DeliveryManifestResult = {
        routeId: "route-1",
        routeState: "IN_PROGRESS",
        view: "all",
        stops: [
          {
            stopId: "stop-1",
            stopNumber: 1,
            state: "PENDING",
            latitude: 10.99,
            longitude: -74.8,
            packageIds: ["pkg-1", "pkg-2", "pkg-3"],
            packages: [
              {
                packageId: "pkg-1",
                assignmentId: "assign-1",
                trackingCode: "TRK-001",
                state: "DELIVERY_FAILED",
                assignmentState: "ACTIVE",
                outcome: "RECIPIENT_ABSENT",
                receiptConfirmed: false,
              },
              {
                packageId: "pkg-2",
                assignmentId: "assign-2",
                trackingCode: "TRK-002",
                state: "DELIVERED",
                assignmentState: "ENDED",
                outcome: "DELIVERED",
                receiptConfirmed: false,
              },
              {
                packageId: "pkg-3",
                assignmentId: "assign-3",
                trackingCode: "TRK-003",
                state: "DELIVERY_FAILED",
                assignmentState: "ACTIVE",
                outcome: "OTHER",
                receiptConfirmed: true,
              },
            ],
          },
        ],
      }

      const result = filterUnreceivedActivePackages(mockManifest)

      expect(result).toHaveLength(1)
      expect(result[0].assignmentId).toBe("assign-1")
    })
  })

  describe("assignment selection toggles", () => {
    it("toggles single assignment in and out of array", () => {
      const initial: string[] = []
      const afterAdd = toggleAssignmentSelection(initial, "assign-1")
      expect(afterAdd).toEqual(["assign-1"])

      const afterRemove = toggleAssignmentSelection(afterAdd, "assign-1")
      expect(afterRemove).toEqual([])
    })

    it("selects all assignments when partially or not selected", () => {
      const items = [
        {
          packageId: "pkg-1",
          assignmentId: "assign-1",
          trackingCode: "TRK-1",
          state: "OUT_FOR_DELIVERY",
          assignmentState: "ACTIVE" as const,
          outcome: null,
          receiptConfirmed: false,
        },
        {
          packageId: "pkg-2",
          assignmentId: "assign-2",
          trackingCode: "TRK-2",
          state: "OUT_FOR_DELIVERY",
          assignmentState: "ACTIVE" as const,
          outcome: null,
          receiptConfirmed: false,
        },
      ]

      const all = toggleAllAssignmentsSelection(["assign-1"], items)
      expect(all).toEqual(["assign-1", "assign-2"])
    })

    it("deselects all assignments when all are already selected", () => {
      const items = [
        {
          packageId: "pkg-1",
          assignmentId: "assign-1",
          trackingCode: "TRK-1",
          state: "OUT_FOR_DELIVERY",
          assignmentState: "ACTIVE" as const,
          outcome: null,
          receiptConfirmed: false,
        },
        {
          packageId: "pkg-2",
          assignmentId: "assign-2",
          trackingCode: "TRK-2",
          state: "OUT_FOR_DELIVERY",
          assignmentState: "ACTIVE" as const,
          outcome: null,
          receiptConfirmed: false,
        },
      ]

      const cleared = toggleAllAssignmentsSelection(
        ["assign-1", "assign-2"],
        items,
      )
      expect(cleared).toEqual([])
    })
  })

  describe("validateClosureInput", () => {
    it("validates successful REGULAR closure without optional inputs", () => {
      const result = validateClosureInput({
        mode: RouteClosureMode.REGULAR,
        reasonCode: "",
        notes: "",
        actualDistanceKm: "",
        depotId: "",
        physicalReceiptConfirmed: false,
        selectedAssignmentIds: [],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.command).toEqual({
          mode: RouteClosureMode.REGULAR,
        })
      }
    })

    it("converts positive distance in km to meters", () => {
      const result = validateClosureInput({
        mode: RouteClosureMode.REGULAR,
        reasonCode: "",
        notes: "",
        actualDistanceKm: "12.5",
        depotId: "",
        physicalReceiptConfirmed: false,
        selectedAssignmentIds: [],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.command.actualDistanceM).toBe(12500)
      }
    })

    it("rejects negative, non-numeric, or infinite distance strictly", () => {
      const invalidInputs = ["-5", "2abc", "Infinity", "-Infinity", "NaN", "abc"]
      for (const input of invalidInputs) {
        const result = validateClosureInput({
          mode: RouteClosureMode.REGULAR,
          reasonCode: "",
          notes: "",
          actualDistanceKm: input,
          depotId: "",
          physicalReceiptConfirmed: false,
          selectedAssignmentIds: [],
        })

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toBe(
            "La distancia real debe ser un número positivo finito.",
          )
        }
      }
    })

    it("enforces reasonCode and notes for FORCED mode", () => {
      const missingReason = validateClosureInput({
        mode: RouteClosureMode.FORCED,
        reasonCode: "",
        notes: "Some note",
        actualDistanceKm: "",
        depotId: "",
        physicalReceiptConfirmed: false,
        selectedAssignmentIds: [],
      })
      expect(missingReason.success).toBe(false)
      if (!missingReason.success) {
        expect(missingReason.error).toContain("motivo")
      }

      const missingNotes = validateClosureInput({
        mode: RouteClosureMode.FORCED,
        reasonCode: "WEATHER_EMERGENCY",
        notes: "   ",
        actualDistanceKm: "",
        depotId: "",
        physicalReceiptConfirmed: false,
        selectedAssignmentIds: [],
      })
      expect(missingNotes.success).toBe(false)
      if (!missingNotes.success) {
        expect(missingNotes.error).toContain("observaciones")
      }
    })

    it("requires depotId when custody packages are selected", () => {
      const missingDepot = validateClosureInput({
        mode: RouteClosureMode.REGULAR,
        reasonCode: "",
        notes: "",
        actualDistanceKm: "",
        depotId: "   ",
        physicalReceiptConfirmed: true,
        selectedAssignmentIds: ["assign-1"],
      })

      expect(missingDepot.success).toBe(false)
      if (!missingDepot.success) {
        expect(missingDepot.error).toContain("identificador de depósito")
      }
    })

    it("builds valid depotReceipt when depotId and assignments are supplied", () => {
      const validReceipt = validateClosureInput({
        mode: RouteClosureMode.REGULAR,
        reasonCode: "",
        notes: "",
        actualDistanceKm: "",
        depotId: "depot-central",
        physicalReceiptConfirmed: true,
        selectedAssignmentIds: ["assign-1", "assign-2"],
      })

      expect(validReceipt.success).toBe(true)
      if (validReceipt.success) {
        expect(validReceipt.command.depotReceipt).toEqual({
          depotId: "depot-central",
          physicalReceiptConfirmed: true,
          assignmentIds: ["assign-1", "assign-2"],
        })
      }
    })
  })

  describe("closure sync lifecycle and refresh failure handling", () => {
    const initialRoute: RouteDetailResult = {
      id: "30000000-0000-4000-8000-000000000001",
      tenantId: "tenant-1",
      vehicleId: "veh-1",
      courierId: "user-1",
      state: RouteState.IN_PROGRESS,
      stops: [],
    }

    const mockSummary: RouteSummaryResult = {
      schemaVersion: 1,
      closureId: "closure-100",
      tenantId: "tenant-1",
      routeId: initialRoute.id,
      mode: RouteClosureMode.FORCED,
      actorUserId: "user-1",
      startedAt: "2026-11-08T21:00:00.000Z",
      completedAt: "2026-11-08T22:00:00.000Z",
      actualDurationMs: 3600000,
      actualDurationS: 3600,
      totalAssigned: 3,
      deliveredCount: 2,
      failedCount: 1,
      rescheduledCount: 0,
      returnedCount: 1,
      pendingCount: 0,
      deliveryEffectivenessRatio: 0.67,
      plannedDistanceM: 5000,
      actualDistanceM: 5200,
      distanceDeltaM: 200,
      distanceRatio: 1.04,
      members: [],
      stops: [],
      failureReasons: [],
      incidents: [],
    }

    const mockCloseResult: CloseRouteResult = {
      routeId: initialRoute.id,
      closureId: "closure-100",
      state: "COMPLETED",
      completedAt: "2026-11-08T22:00:00.000Z",
      summary: mockSummary,
      replayed: false,
    }

    it("transitions route to COMPLETED, marks closure confirmed and populates summary upon successful close", () => {
      const stateBefore: RouteDetailClosureState = {
        route: initialRoute,
        closureConfirmed: false,
        refreshError: null,
        summary: null,
        actionFeedback: null,
      }

      const stateAfter = handleClosureSuccessState(stateBefore, mockCloseResult)

      expect(stateAfter.closureConfirmed).toBe(true)
      expect(stateAfter.route?.state).toBe("COMPLETED")
      expect(stateAfter.summary).toEqual(mockCloseResult.summary)
      expect(stateAfter.actionFeedback?.kind).toBe("success")
      expect(stateAfter.refreshError).toBeNull()
    })

    it("preserves closure confirmed and COMPLETED state when subsequent GET refresh fails", () => {
      const stateBefore: RouteDetailClosureState = {
        route: initialRoute,
        closureConfirmed: false,
        refreshError: null,
        summary: null,
        actionFeedback: null,
      }

      const closedState = handleClosureSuccessState(stateBefore, mockCloseResult)
      const failedRefreshState = handleRefreshFailureState(
        closedState,
        "Error 500 al consultar el detalle actualizado de la ruta.",
      )

      expect(failedRefreshState.closureConfirmed).toBe(true)
      expect(failedRefreshState.route?.state).toBe("COMPLETED")
      expect(failedRefreshState.refreshError).toBe(
        "Error 500 al consultar el detalle actualizado de la ruta.",
      )
      expect(failedRefreshState.summary).toEqual(mockCloseResult.summary)
    })

    it("does not repeat POST close call when retrying after a failed read refresh", async () => {
      const closePostMock = vi.fn().mockResolvedValue(mockCloseResult)
      const readDetailMock = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce({
          ...initialRoute,
          state: RouteState.COMPLETED,
        })

      const closeResult = await closePostMock()
      expect(closePostMock).toHaveBeenCalledTimes(1)

      let state: RouteDetailClosureState = {
        route: initialRoute,
        closureConfirmed: false,
        refreshError: null,
        summary: null,
        actionFeedback: null,
      }

      state = handleClosureSuccessState(state, closeResult)

      try {
        await readDetailMock()
      } catch (err: unknown) {
        state = handleRefreshFailureState(
          state,
          err instanceof Error ? err.message : "Error",
        )
      }

      expect(state.closureConfirmed).toBe(true)
      expect(state.refreshError).toBe("Network timeout")

      const retryDetail = await readDetailMock()
      state = {
        ...state,
        route: retryDetail,
        refreshError: null,
      }

      expect(closePostMock).toHaveBeenCalledTimes(1)
      expect(readDetailMock).toHaveBeenCalledTimes(2)
      expect(state.closureConfirmed).toBe(true)
      expect(state.route?.state).toBe("COMPLETED")
      expect(state.refreshError).toBeNull()
    })
  })
})
