import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

import {
  ROUTE_STATUS_COLOR,
  ROUTE_STATUS_LABELS,
  formatPlannedDate,
  formatShortEntityId,
} from "./constants"
import {
  RouteState,
  getRouteDetail,
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
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
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
    ).rejects.toThrow("El detalle de ruta recibido no cumple el contrato esperado.")
  })

  it("formatea IDs abreviados y fechas planificadas o 'Sin fecha'", () => {
    expect(
      formatShortEntityId("60000000-0000-4000-8000-000000000001"),
    ).toBe("#60000000")
    expect(formatPlannedDate(null)).toBe("Sin fecha")
    expect(formatPlannedDate(undefined)).toBe("Sin fecha")
    expect(formatPlannedDate("invalid-date")).toBe("Sin fecha")
    expect(formatPlannedDate("2026-10-12T13:00:00.000Z")).not.toBe("Sin fecha")
  })
})
