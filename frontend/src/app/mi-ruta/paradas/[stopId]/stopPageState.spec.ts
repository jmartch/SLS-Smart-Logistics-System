import { afterEach, describe, expect, it, vi } from "vitest"
import { loadStopPageState } from "./stopPageState"
import { RouteState } from "../../../rutas/routesApi"

vi.mock("../../../../shared/config/environment", () => ({
  API_BASE_URL: "/api/v1",
  USE_MOCK_DATA: false,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ROUTE_ID = "30000000-0000-4000-8000-000000000001"
const STOP_ID = "31000000-0000-4000-8000-000000000001"
const OTHER_STOP_ID = "31000000-0000-4000-8000-000000000002"
const PACKAGE_ID = "20000000-0000-4000-8000-000000000001"

describe("stopPageState", () => {
  it("returns invalid_params when routeId or stopId are missing or invalid", async () => {
    const res1 = await loadStopPageState(null, STOP_ID, ["OPERATE_DELIVERIES"])
    expect(res1.kind).toBe("invalid_params")

    const res2 = await loadStopPageState(ROUTE_ID, "not-a-uuid", [
      "OPERATE_DELIVERIES",
    ])
    expect(res2.kind).toBe("invalid_params")
  })

  it("returns not_found when stop is not in manifest", async () => {
    const manifest = {
      routeId: ROUTE_ID,
      routeState: "IN_PROGRESS",
      view: "all",
      stops: [
        {
          stopId: OTHER_STOP_ID,
          stopNumber: 1,
          state: "PENDING",
          latitude: 10.99,
          longitude: -74.8,
          packageIds: [PACKAGE_ID],
          packages: [],
        },
      ],
    }

    const routeDetail = {
      id: ROUTE_ID,
      tenantId: "tenant-1",
      state: RouteState.IN_PROGRESS,
      vehicleId: "vehicle-1",
      courierId: "courier-1",
      stops: [],
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/manifest")) {
          return Promise.resolve(
            new Response(JSON.stringify(manifest), { status: 200 }),
          )
        }
        return Promise.resolve(
          new Response(JSON.stringify(routeDetail), { status: 200 }),
        )
      }),
    )

    const res = await loadStopPageState(ROUTE_ID, STOP_ID, [
      "OPERATE_DELIVERIES",
    ])
    expect(res.kind).toBe("not_found")
  })

  it("loads ready state identifying un-attended stop when all packages are IN_TRANSIT", async () => {
    const manifest = {
      routeId: ROUTE_ID,
      routeState: "IN_PROGRESS",
      view: "all",
      stops: [
        {
          stopId: STOP_ID,
          stopNumber: 1,
          state: "PENDING",
          latitude: 10.99,
          longitude: -74.8,
          packageIds: [PACKAGE_ID],
          packages: [
            {
              assignmentId: "assign-1",
              packageId: PACKAGE_ID,
              trackingCode: "TRK-001",
              state: "IN_TRANSIT",
              assignmentState: "ACTIVE",
              outcome: null,
              receiptConfirmed: false,
            },
          ],
        },
      ],
    }

    const routeDetail = {
      id: ROUTE_ID,
      tenantId: "tenant-1",
      state: RouteState.IN_PROGRESS,
      vehicleId: "vehicle-1",
      courierId: "courier-1",
      stops: [
        {
          id: STOP_ID,
          stopNumber: 1,
          latitude: 10.99,
          longitude: -74.8,
          state: "PENDING",
          address: "Carrera 53 # 74-80",
        },
      ],
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/manifest")) {
          return Promise.resolve(
            new Response(JSON.stringify(manifest), { status: 200 }),
          )
        }
        return Promise.resolve(
          new Response(JSON.stringify(routeDetail), { status: 200 }),
        )
      }),
    )

    const res = await loadStopPageState(ROUTE_ID, STOP_ID, [
      "OPERATE_DELIVERIES",
    ])
    expect(res.kind).toBe("ready")
    if (res.kind === "ready") {
      expect(res.isAttended).toBe(false)
      expect(res.canExecute).toBe(true)
      expect(res.routeInProgress).toBe(true)
      expect(res.stopDetail?.address).toBe("Carrera 53 # 74-80")
    }
  })

  it("detects already attended stop when package state is OUT_FOR_DELIVERY", async () => {
    const manifest = {
      routeId: ROUTE_ID,
      routeState: "IN_PROGRESS",
      view: "all",
      stops: [
        {
          stopId: STOP_ID,
          stopNumber: 1,
          state: "PENDING",
          latitude: 10.99,
          longitude: -74.8,
          packageIds: [PACKAGE_ID],
          packages: [
            {
              assignmentId: "assign-1",
              packageId: PACKAGE_ID,
              trackingCode: "TRK-001",
              state: "OUT_FOR_DELIVERY",
              assignmentState: "ACTIVE",
              outcome: null,
              receiptConfirmed: false,
            },
          ],
        },
      ],
    }

    const routeDetail = {
      id: ROUTE_ID,
      tenantId: "tenant-1",
      state: RouteState.IN_PROGRESS,
      vehicleId: "vehicle-1",
      courierId: "courier-1",
      stops: [],
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/manifest")) {
          return Promise.resolve(
            new Response(JSON.stringify(manifest), { status: 200 }),
          )
        }
        return Promise.resolve(
          new Response(JSON.stringify(routeDetail), { status: 200 }),
        )
      }),
    )

    const res = await loadStopPageState(ROUTE_ID, STOP_ID, [
      "OPERATE_DELIVERIES",
    ])
    expect(res.kind).toBe("ready")
    if (res.kind === "ready") {
      expect(res.isAttended).toBe(true)
    }
  })

  it("maps 403 Forbidden to error state with clear message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ))

    const res = await loadStopPageState(ROUTE_ID, STOP_ID, [
      "OPERATE_DELIVERIES",
    ])
    expect(res.kind).toBe("error")
    if (res.kind === "error") {
      expect(res.status).toBe(403)
      expect(res.title).toBe("Acceso denegado")
    }
  })
})
