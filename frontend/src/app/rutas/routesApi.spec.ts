import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

import { ApiError } from "../../shared/api/httpClient"
import {
  ROUTE_STATUS_COLOR,
  ROUTE_STATUS_LABELS,
  formatPlannedDate,
  formatShortEntityId,
} from "./constants"
import {
  RouteClosureDisposition,
  RouteClosureMode,
  RouteManifestOutcome,
  RouteState,
  closeRoute,
  getRouteDetail,
  getRouteSummary,
  listRoutes,
  mapRouteDetailStopsToMapStops,
} from "./routesApi"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("routesApi & rutas/constants", () => {
  it("soporta los 9 estados reales de RouteState en ROUTE_STATUS_LABELS y ROUTE_STATUS_COLOR", () => {
    const allStates = Object.values(RouteState)
    expect(allStates).toEqual([
      "DRAFT",
      "PLANNING",
      "PLANNED",
      "READY",
      "IN_PROGRESS",
      "COMPLETED",
      "PLANNING_FAILED",
      "INTERRUPTED",
      "CANCELLED",
    ])

    for (const state of allStates) {
      expect(typeof ROUTE_STATUS_LABELS[state]).toBe("string")
      expect(ROUTE_STATUS_LABELS[state].length).toBeGreaterThan(0)
      expect(typeof ROUTE_STATUS_COLOR[state]).toBe("string")
      expect(ROUTE_STATUS_COLOR[state]).toMatch(/^status--/)
    }
  })

  it("consume GET /routes?page=1&pageSize=20 sin cabeceras manuales de tenantId ni userId", async () => {
    const payload = {
      items: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          tenantId: "10000000-0000-4000-8000-000000000001",
          state: "PLANNED",
          vehicleId: "60000000-0000-4000-8000-000000000001",
          courierId: "70000000-0000-4000-8000-000000000001",
          depotId: null,
          zoneId: "50000000-0000-4000-8000-000000000001",
          plannedStartAt: "2026-10-12T13:00:00.000Z",
          plannedEndAt: null,
          startedAt: null,
          completedAt: null,
          stopCount: 3,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await listRoutes()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = fetchMock.mock
      .calls[0] as [string, RequestInit]
    expect(calledUrl).toBe("/api/v1/routes?page=1&pageSize=20")
    expect(calledInit.credentials).toBe("include")
    const headers = new Headers(calledInit.headers)
    expect(headers.get("x-tenant-id")).toBeNull()
    expect(headers.get("x-user-id")).toBeNull()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.stopCount).toBe(3)
    expect(result.total).toBe(1)
  })

  it("consume GET /routes/:id y mapea únicamente las paradas devueltas por el backend", async () => {
    const detailPayload = {
      id: "30000000-0000-4000-8000-000000000099",
      tenantId: "10000000-0000-4000-8000-000000000001",
      state: "IN_PROGRESS",
      vehicleId: "60000000-0000-4000-8000-000000000001",
      courierId: "70000000-0000-4000-8000-000000000001",
      depotId: null,
      plannedStartAt: "2026-10-12T13:00:00.000Z",
      plannedEndAt: null,
      startedAt: "2026-10-12T13:15:00.000Z",
      completedAt: null,
      stops: [
        {
          id: "31000000-0000-4000-8000-000000000002",
          stopNumber: 2,
          latitude: 11.0041,
          longitude: -74.8152,
          state: "PENDING",
        },
        {
          id: "31000000-0000-4000-8000-000000000001",
          stopNumber: 1,
          latitude: 10.9961,
          longitude: -74.806,
          state: "COMPLETED",
        },
      ],
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(detailPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const detail = await getRouteDetail("30000000-0000-4000-8000-000000000099")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(detail.id).toBe("30000000-0000-4000-8000-000000000099")
    expect(detail.state).toBe("IN_PROGRESS")

    const mapStops = mapRouteDetailStopsToMapStops(detail.stops)
    expect(mapStops).toEqual([
      {
        id: "31000000-0000-4000-8000-000000000001",
        stopNumber: 1,
        latitude: 10.9961,
        longitude: -74.806,
        state: "COMPLETED",
      },
      {
        id: "31000000-0000-4000-8000-000000000002",
        stopNumber: 2,
        latitude: 11.0041,
        longitude: -74.8152,
        state: "PENDING",
      },
    ])
  })

  it("rechaza estructuras inválidas en listRoutes y getRouteDetail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ invalid: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(listRoutes()).rejects.toThrow(
      "La respuesta paginada de rutas no tiene la estructura esperada.",
    )

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "x", stops: "not-an-array" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(
      getRouteDetail("30000000-0000-4000-8000-000000000001"),
    ).rejects.toThrow(
      "El detalle de ruta recibido no cumple el contrato esperado.",
    )
  })

  it("mapea campos descriptivos (placa, email, zona, depósito, guía y dirección)", async () => {
    const detailPayload = {
      id: "30000000-0000-4000-8000-000000000099",
      tenantId: "10000000-0000-4000-8000-000000000001",
      state: "PLANNED",
      vehicleId: "60000000-0000-4000-8000-000000000001",
      vehiclePlate: "XYZ-789",
      courierId: "70000000-0000-4000-8000-000000000001",
      courierEmail: "carlos.mensajero@logistics.com",
      depotId: "80000000-0000-4000-8000-000000000001",
      depotName: "Depósito Centro",
      zoneId: "50000000-0000-4000-8000-000000000001",
      zoneName: "Zona Norte",
      plannedStartAt: "2026-10-12T13:00:00.000Z",
      plannedEndAt: null,
      startedAt: null,
      completedAt: null,
      stops: [
        {
          id: "31000000-0000-4000-8000-000000000001",
          stopNumber: 1,
          latitude: 10.9961,
          longitude: -74.806,
          state: "PENDING",
          packageId: "20000000-0000-4000-8000-000000000001",
          trackingCode: "PKG-TRK-001",
          address: "Calle 72 # 54-20",
        },
      ],
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(detailPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const detail = await getRouteDetail("30000000-0000-4000-8000-000000000099")
    expect(detail.vehiclePlate).toBe("XYZ-789")
    expect(detail.courierEmail).toBe("carlos.mensajero@logistics.com")
    expect(detail.depotName).toBe("Depósito Centro")
    expect(detail.zoneName).toBe("Zona Norte")
    expect(detail.stops[0]?.trackingCode).toBe("PKG-TRK-001")
    expect(detail.stops[0]?.address).toBe("Calle 72 # 54-20")

    const mapStops = mapRouteDetailStopsToMapStops(detail.stops)
    expect(mapStops[0]?.trackingCode).toBe("PKG-TRK-001")
    expect(mapStops[0]?.address).toBe("Calle 72 # 54-20")
    expect(mapStops[0]?.label).toBe("Guía PKG-TRK-001")
  })

  it("formatea IDs abreviados y fechas planificadas o 'Sin fecha'", () => {
    expect(formatShortEntityId("60000000-0000-4000-8000-000000000001")).toBe(
      "#60000000",
    )
    expect(formatPlannedDate(null)).toBe("Sin fecha")
    expect(formatPlannedDate(undefined)).toBe("Sin fecha")
    expect(formatPlannedDate("invalid-date")).toBe("Sin fecha")
    expect(formatPlannedDate("2026-10-12T13:00:00.000Z")).not.toBe("Sin fecha")
  })

  describe("closeRoute", () => {
    const routeId = "30000000-0000-4000-8000-000000000001"
    const idempotencyKey = "90000000-0000-4000-8000-000000000001"

    it("sends close command in REGULAR mode with depot receipt confirmation", async () => {
      const closePayload = {
        routeId,
        closureId: "80000000-0000-4000-8000-000000000001",
        state: "COMPLETED",
        completedAt: "2026-11-08T20:00:00.000Z",
        summary: {
          schemaVersion: 1,
          closureId: "80000000-0000-4000-8000-000000000001",
          tenantId: "10000000-0000-4000-8000-000000000001",
          routeId,
          mode: RouteClosureMode.REGULAR,
          actorUserId: "20000000-0000-4000-8000-000000000001",
          startedAt: "2026-11-08T18:00:00.000Z",
          completedAt: "2026-11-08T20:00:00.000Z",
          actualDurationMs: 7200000,
          actualDurationS: 7200,
          totalAssigned: 5,
          deliveredCount: 4,
          failedCount: 1,
          rescheduledCount: 0,
          returnedCount: 0,
          pendingCount: 0,
          deliveryEffectivenessRatio: 0.8,
          plannedDistanceM: 12000,
          actualDistanceM: 12500,
          distanceDeltaM: 500,
          distanceRatio: 1.04,
          members: [
            {
              assignmentId: "40000000-0000-4000-8000-000000000001",
              packageId: "20000000-0000-4000-8000-000000000001",
              routeStopId: "31000000-0000-4000-8000-000000000001",
              outcome: RouteManifestOutcome.DELIVERED,
              receiptConfirmed: false,
              depotId: null,
              failureReasonCode: null,
            },
          ],
          stops: [
            {
              routeStopId: "31000000-0000-4000-8000-000000000001",
              stopNumber: 1,
              stopState: "COMPLETED",
              disposition: RouteClosureDisposition.VISITED,
            },
          ],
          failureReasons: [],
          incidents: [],
        },
        replayed: false,
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(closePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const result = await closeRoute(
        routeId,
        {
          mode: RouteClosureMode.REGULAR,
          actualDistanceM: 12500,
          depotReceipt: {
            depotId: "70000000-0000-4000-8000-000000000001",
            physicalReceiptConfirmed: true,
            assignmentIds: ["40000000-0000-4000-8000-000000000001"],
          },
        },
        idempotencyKey,
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`/api/v1/routes/${routeId}/close`)
      expect(init.method).toBe("POST")
      expect(JSON.parse(init.body as string)).toEqual({
        mode: "REGULAR",
        actualDistanceM: 12500,
        depotReceipt: {
          depotId: "70000000-0000-4000-8000-000000000001",
          physicalReceiptConfirmed: true,
          assignmentIds: ["40000000-0000-4000-8000-000000000001"],
        },
      })

      const headers = new Headers(init.headers)
      expect(headers.get("Idempotency-Key")).toBe(idempotencyKey)
      expect(result.state).toBe("COMPLETED")
      expect(result.summary.deliveredCount).toBe(4)
      expect(result.summary.members[0]?.receiptConfirmed).toBe(false)
      expect(result.summary.stops[0]?.disposition).toBe("VISITED")
    })

    it("preserves idempotency key and payload across retries", async () => {
      const replayPayload = {
        routeId,
        closureId: "80000000-0000-4000-8000-000000000001",
        state: "COMPLETED",
        completedAt: "2026-11-08T20:00:00.000Z",
        summary: {
          schemaVersion: 1,
          closureId: "80000000-0000-4000-8000-000000000001",
          tenantId: "10000000-0000-4000-8000-000000000001",
          routeId,
          mode: RouteClosureMode.REGULAR,
          actorUserId: "20000000-0000-4000-8000-000000000001",
          startedAt: "2026-11-08T18:00:00.000Z",
          completedAt: "2026-11-08T20:00:00.000Z",
          actualDurationMs: 7200000,
          actualDurationS: 7200,
          totalAssigned: 1,
          deliveredCount: 1,
          failedCount: 0,
          rescheduledCount: 0,
          returnedCount: 0,
          pendingCount: 0,
          deliveryEffectivenessRatio: 1,
          plannedDistanceM: 5000,
          actualDistanceM: 5000,
          distanceDeltaM: 0,
          distanceRatio: 1,
          members: [],
          stops: [],
          failureReasons: [],
          incidents: [],
        },
        replayed: true,
      }

      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(replayPayload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      )
      vi.stubGlobal("fetch", fetchMock)

      const input = { mode: RouteClosureMode.REGULAR }
      const firstResult = await closeRoute(routeId, input, idempotencyKey)
      const secondResult = await closeRoute(routeId, input, idempotencyKey)

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit]
      const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(new Headers(firstInit.headers).get("Idempotency-Key")).toBe(
        idempotencyKey,
      )
      expect(new Headers(secondInit.headers).get("Idempotency-Key")).toBe(
        idempotencyKey,
      )
      expect(firstInit.body).toBe(secondInit.body)
      expect(firstResult.replayed).toBe(true)
      expect(secondResult.replayed).toBe(true)
    })

    it("propagates 409 conflict error when route cannot be closed", async () => {
      const errorPayload = {
        code: "ROUTE_NOT_IN_PROGRESS",
        message:
          "Route cannot be closed because active assignments remain unvisited",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(
        closeRoute(routeId, { mode: RouteClosureMode.REGULAR }, idempotencyKey),
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof ApiError &&
          err.status === 409 &&
          err.code === "ROUTE_NOT_IN_PROGRESS" &&
          err.message.includes("Route cannot be closed")
        )
      })
    })

    it("requires reasonCode and notes for FORCED mode", async () => {
      await expect(
        closeRoute(
          routeId,
          {
            mode: RouteClosureMode.FORCED,
          },
          idempotencyKey,
        ),
      ).rejects.toThrow(
        "El motivo 'reasonCode' es obligatorio para cierre forzado.",
      )

      await expect(
        closeRoute(
          routeId,
          {
            mode: RouteClosureMode.FORCED,
            reasonCode: "WEATHER_EMERGENCY",
          },
          idempotencyKey,
        ),
      ).rejects.toThrow(
        "Las observaciones 'notes' son obligatorias para cierre forzado.",
      )
    })
  })

  describe("getRouteSummary", () => {
    const routeId = "30000000-0000-4000-8000-000000000001"

    it("fetches complete representative snapshot with members, stops, failure reasons and incidents", async () => {
      const summaryPayload = {
        schemaVersion: 1,
        closureId: "80000000-0000-4000-8000-000000000001",
        tenantId: "10000000-0000-4000-8000-000000000001",
        routeId,
        mode: "REGULAR",
        actorUserId: "20000000-0000-4000-8000-000000000001",
        correlationId: "corr-1",
        startedAt: "2026-11-08T18:00:00.000Z",
        completedAt: "2026-11-08T20:00:00.000Z",
        actualDurationMs: 7200000,
        actualDurationS: 7200,
        totalAssigned: 5,
        deliveredCount: 4,
        failedCount: 1,
        rescheduledCount: 0,
        returnedCount: 0,
        pendingCount: 0,
        deliveryEffectivenessRatio: 0.8,
        plannedDistanceM: 10000,
        actualDistanceM: 10500,
        distanceDeltaM: 500,
        distanceRatio: 1.05,
        reasonCode: null,
        notes: "Ruta finalizada normalmente",
        members: [
          {
            assignmentId: "40000000-0000-4000-8000-000000000001",
            packageId: "20000000-0000-4000-8000-000000000001",
            routeStopId: "31000000-0000-4000-8000-000000000001",
            outcome: "DELIVERED",
            failureReasonCode: null,
            receiptConfirmed: false,
            depotId: null,
          },
        ],
        stops: [
          {
            routeStopId: "31000000-0000-4000-8000-000000000001",
            stopNumber: 1,
            stopState: "COMPLETED",
            disposition: "VISITED",
          },
        ],
        failureReasons: [
          {
            reasonCode: "RECIPIENT_ABSENT",
            count: 1,
          },
        ],
        incidents: [
          {
            incidentId: "70000000-0000-4000-8000-000000000001",
            type: "TRAFFIC",
            status: "RESOLVED",
            reportedAt: "2026-11-08T19:00:00.000Z",
            description: "Retraso leve",
          },
        ],
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(summaryPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const result = await getRouteSummary(routeId)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`/api/v1/routes/${routeId}/summary`)
      expect(init.method).toBe("GET")
      expect(result.schemaVersion).toBe(1)
      expect(result.closureId).toBe("80000000-0000-4000-8000-000000000001")
      expect(result.deliveredCount).toBe(4)
      expect(result.deliveryEffectivenessRatio).toBe(0.8)
      expect(result.actualDurationMs).toBe(7200000)
      expect(result.notes).toBe("Ruta finalizada normalmente")
      expect(result.members).toHaveLength(1)
      expect(result.members[0]?.receiptConfirmed).toBe(false)
      expect(result.members[0]?.outcome).toBe("DELIVERED")
      expect(result.stops[0]?.disposition).toBe("VISITED")
      expect(result.incidents[0]?.status).toBe("RESOLVED")
      expect(result.failureReasons[0]?.reasonCode).toBe("RECIPIENT_ABSENT")
    })

    it("supports projected courier response without notes and reasonCode", async () => {
      const summaryPayload = {
        schemaVersion: 1,
        closureId: "80000000-0000-4000-8000-000000000001",
        tenantId: "10000000-0000-4000-8000-000000000001",
        routeId,
        mode: "REGULAR",
        actorUserId: "20000000-0000-4000-8000-000000000001",
        startedAt: "2026-11-08T18:00:00.000Z",
        completedAt: "2026-11-08T20:00:00.000Z",
        actualDurationMs: 7200000,
        actualDurationS: 7200,
        totalAssigned: 3,
        deliveredCount: 3,
        failedCount: 0,
        rescheduledCount: 0,
        returnedCount: 0,
        pendingCount: 0,
        deliveryEffectivenessRatio: 1,
        plannedDistanceM: 8000,
        actualDistanceM: 8200,
        distanceDeltaM: 200,
        distanceRatio: 1.025,
        members: [],
        stops: [],
        failureReasons: [],
        incidents: [],
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(summaryPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      const result = await getRouteSummary(routeId)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.closureId).toBe("80000000-0000-4000-8000-000000000001")
      expect(result.reasonCode).toBeUndefined()
      expect(result.notes).toBeUndefined()
      expect(result.deliveredCount).toBe(3)
      expect(result.members).toHaveLength(0)
    })

    it("propagates 409 conflict error when route summary is requested before route completion", async () => {
      const errorPayload = {
        code: "ROUTE_NOT_COMPLETED",
        message: "Route is not in COMPLETED state",
      }

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorPayload), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      vi.stubGlobal("fetch", fetchMock)

      await expect(getRouteSummary(routeId)).rejects.toSatisfy(
        (err: unknown) => {
          return (
            err instanceof ApiError &&
            err.status === 409 &&
            err.code === "ROUTE_NOT_COMPLETED"
          )
        },
      )
    })
  })
})
